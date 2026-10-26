import type { Attendance, AttendanceRequest, Checkin, LeaveApplication } from "./erp";
import { summarize, type DaySummary } from "./hours";

/** Working hours expected on a full day; half of it on a half day. */
export const REQUIRED_MINUTES = Math.round(Number(process.env.REQUIRED_DAILY_HOURS || 8) * 60);

export type DayStatus = "present" | "wfh" | "half-day" | "absent" | "leave" | "holiday" | "today" | "upcoming";
export type RequestStatus = "Approved" | "Pending" | "Rejected" | "Cancelled";

export type RequestInfo = {
  id: string;
  kind: "Leave" | "Attendance request";
  label: string; // leave type or attendance request reason
  from: string;
  to: string;
  days: number; // working days asked for: holidays inside the range don't count, a half day counts 0.5
  status: RequestStatus;
};

/** How many requests of one kind were sent in the cycle, and where they stand. */
export type RequestTally = { label: string; sent: number; days: number } & Record<RequestStatus, number>;

export type MonthDay = {
  date: string;
  status: DayStatus;
  holiday?: string;
  workingMinutes: number;
  requiredMinutes: number;
  short: boolean; // worked less than required
  missingOut: boolean;
  requests: RequestInfo[]; // requests covering this date
};

/** For a day that needs attention: is there a request covering it, and how far did it get? */
export type Coverage = "none" | RequestStatus;

export type MonthReport = {
  days: MonthDay[];
  issues: (MonthDay & { coverage: Coverage })[]; // absent or short days, oldest first
  requests: RequestInfo[];
  requestTally: RequestTally[]; // Leave, Work From Home, On Duty…
  requestTotal: RequestTally;
  counts: {
    workingDays: number; // non-holiday days up to today
    present: number;
    wfh: number;
    halfDay: number;
    absent: number;
    leave: number;
    holidays: number;
    short: number;
    workedMinutes: number;
  };
  coverage: Record<Coverage, number>;
};

const COVERAGE_RANK: Coverage[] = ["Approved", "Pending", "Rejected", "Cancelled", "none"];

const LEAVE_STATUS: Record<LeaveApplication["status"], RequestStatus> = {
  Open: "Pending",
  Approved: "Approved",
  Rejected: "Rejected",
  Cancelled: "Cancelled",
};
const ATTENDANCE_REQUEST_STATUS: Record<AttendanceRequest["docstatus"], RequestStatus> = {
  0: "Pending",
  1: "Approved",
  2: "Cancelled",
};

/** Attendance cycles run from the 26th of the previous month to the 25th; a cycle is named by its end month. */
export const CYCLE_START_DAY = 26;

export function shiftMonth(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

/** The cycle ("YYYY-MM") a date falls in. */
export function cycleOf(date: string) {
  const month = date.slice(0, 7);
  return Number(date.slice(8)) >= CYCLE_START_DAY ? shiftMonth(month, 1) : month;
}

/** Every date of a cycle, e.g. "2026-10" → 2026-09-26 … 2026-10-25. */
export function cycleDates(cycle: string) {
  const dates: string[] = [];
  const d = new Date(`${shiftMonth(cycle, -1)}-${CYCLE_START_DAY}T00:00:00Z`);
  const end = `${cycle}-${String(CYCLE_START_DAY - 1).padStart(2, "0")}`;
  for (let date = d.toISOString().slice(0, 10); date <= end; date = d.toISOString().slice(0, 10)) {
    dates.push(date);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

function isWeekend(date: string) {
  const d = new Date(date + "T00:00:00Z").getUTCDay();
  return d === 0 || d === 6;
}

/**
 * Builds one employee's attendance cycle. `holidays` comes from their ERP holiday list; when it's unavailable
 * (null) Saturdays and Sundays are treated as weekly offs.
 */
const REQUEST_STATUSES: RequestStatus[] = ["Approved", "Pending", "Rejected", "Cancelled"];

function tally(label: string, requests: RequestInfo[]): RequestTally {
  return {
    label,
    sent: requests.length,
    days: requests.reduce((sum, r) => sum + r.days, 0),
    ...(Object.fromEntries(REQUEST_STATUSES.map((s) => [s, requests.filter((r) => r.status === s).length])) as Record<RequestStatus, number>),
  };
}

function datesBetween(from: string, to: string) {
  const dates: string[] = [];
  for (const d = new Date(from + "T00:00:00Z"); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

export function buildMonthReport({
  dates,
  today,
  holidays,
  checkins,
  attendance,
  leaves,
  attendanceRequests,
}: {
  dates: string[];
  today: string;
  holidays: Map<string, string> | null;
  checkins: Checkin[];
  attendance: Attendance[];
  leaves: LeaveApplication[];
  attendanceRequests: AttendanceRequest[];
}): MonthReport {
  const worked = new Map<string, DaySummary>(summarize(checkins).days.map((d) => [d.date, d]));
  const marked = new Map(attendance.map((a) => [a.attendance_date, a]));
  const holidayOn = (date: string) => (holidays ? holidays.get(date) : isWeekend(date) ? "Weekly off" : undefined);
  const workingDaysIn = (from: string, to: string) => datesBetween(from, to).filter((d) => holidayOn(d) === undefined).length;
  // Approved or still-pending requests cover a day; rejected/cancelled ones don't
  const live = (r: RequestInfo) => r.status === "Approved" || r.status === "Pending";

  const requests: RequestInfo[] = [
    ...leaves.map((l) => ({
      id: l.name,
      kind: "Leave" as const,
      label: l.half_day ? `${l.leave_type} (half day)` : l.leave_type,
      from: l.from_date,
      to: l.to_date,
      days: l.half_day && l.from_date === l.to_date ? 0.5 : workingDaysIn(l.from_date, l.to_date) - (l.half_day ? 0.5 : 0),
      status: LEAVE_STATUS[l.status] ?? "Pending",
    })),
    ...attendanceRequests.map((r) => ({
      id: r.name,
      kind: "Attendance request" as const,
      label: r.reason,
      from: r.from_date,
      to: r.to_date,
      days: workingDaysIn(r.from_date, r.to_date),
      status: ATTENDANCE_REQUEST_STATUS[r.docstatus],
    })),
  ].sort((a, b) => a.from.localeCompare(b.from));

  const days = dates.map((date): MonthDay => {
    const day = worked.get(date);
    const att = marked.get(date);
    const covering = requests.filter((r) => r.from <= date && date <= r.to);
    const leave = leaves.find((l) => live(requests.find((r) => r.id === l.name)!) && l.from_date <= date && date <= l.to_date);
    const halfDayLeave = !!leave?.half_day && (leave.half_day_date ?? leave.from_date) === date;
    const wfh = attendanceRequests.some(
      (r) => r.docstatus !== 2 && /work from home/i.test(r.reason) && r.from_date <= date && date <= r.to_date,
    );
    const onDuty = covering.some((r) => r.kind === "Attendance request" && live(r));
    const holiday = holidayOn(date);
    const hasCheckins = !!day?.logs.length;
    const markedPresent = att?.status === "Present" || att?.status === "Work From Home" || att?.status === "Half Day";

    let status: DayStatus;
    if (date > today) status = "upcoming";
    else if (holiday !== undefined) status = "holiday"; // holidays inside a leave range aren't leave days
    else if (leave && !halfDayLeave) status = "leave";
    else if (halfDayLeave) status = "half-day";
    else if (wfh || att?.status === "Work From Home") status = "wfh";
    else if (hasCheckins || markedPresent || onDuty) status = "present";
    else if (att?.status === "On Leave") status = "leave";
    else if (date === today) status = "today";
    else status = "absent";

    // Hours come from the ERP's Attendance record when it has them, otherwise from raw check-ins
    const attMinutes = att?.working_hours ? Math.round(att.working_hours * 60) : null;
    const workingMinutes = attMinutes ?? day?.workingMinutes ?? 0;
    const measured = attMinutes !== null || hasCheckins;
    const requiredMinutes = status === "half-day" ? Math.round(REQUIRED_MINUTES / 2) : REQUIRED_MINUTES;
    // The ERP marks "Half Day" when hours fall below the shift's threshold; without a half-day leave that's short hours
    const short =
      (status === "present" || status === "wfh" || status === "half-day") &&
      date !== today &&
      ((measured && workingMinutes < requiredMinutes) || (att?.status === "Half Day" && !halfDayLeave));

    return {
      date,
      status,
      holiday,
      workingMinutes,
      requiredMinutes,
      short,
      missingOut: !!day?.missingOut,
      requests: covering,
    };
  });

  const issues = days
    .filter((d) => d.status === "absent" || d.short)
    .map((d) => ({
      ...d,
      coverage: COVERAGE_RANK.find((c) => d.requests.some((r) => r.status === c)) ?? ("none" as const),
    }));

  const count = (s: DayStatus) => days.filter((d) => d.status === s).length;
  const coverage = Object.fromEntries(COVERAGE_RANK.map((c) => [c, issues.filter((i) => i.coverage === c).length])) as Record<Coverage, number>;

  return {
    days,
    issues,
    requests,
    requestTally: [...new Set(requests.map(requestKind))].map((k) => tally(k, requests.filter((r) => requestKind(r) === k))),
    requestTotal: tally("All requests", requests),
    counts: {
      workingDays: days.filter((d) => d.status !== "holiday" && d.status !== "upcoming").length,
      present: count("present"),
      wfh: count("wfh"),
      halfDay: count("half-day"),
      absent: count("absent"),
      leave: count("leave"),
      holidays: count("holiday"),
      short: days.filter((d) => d.short).length,
      workedMinutes: days.reduce((sum, d) => sum + d.workingMinutes, 0),
    },
    coverage,
  };
}

/** Groups leave of any type together; attendance requests by their reason (Work From Home, On Duty…). */
function requestKind(r: RequestInfo) {
  return r.kind === "Leave" ? "Leave" : r.label;
}
