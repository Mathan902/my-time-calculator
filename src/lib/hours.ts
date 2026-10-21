import type { Checkin } from "./erp";

export const ERP_TIMEZONE = process.env.ERP_TIMEZONE ?? "Asia/Kolkata";

export type Session = { in: string; out: string | null; minutes: number };

export type DaySummary = {
  date: string;
  firstIn: string | null;
  lastOut: string | null;
  totalMinutes: number; // first IN -> last OUT (or now, if still checked in today)
  workingMinutes: number; // sum of IN -> OUT pairs
  breakMinutes: number; // total - working
  sessions: Session[];
  logs: Checkin[];
  ongoing: boolean; // currently checked in (today)
  missingOut: boolean; // a past day ended with an IN and no OUT
};

// ERP times are naive wall-clock strings in ERP_TIMEZONE. We parse them as if UTC so that
// subtraction gives correct durations without any DST/offset conversion.
function toMs(t: string) {
  return Date.parse(t.slice(0, 19).replace(" ", "T") + "Z");
}

function minutesBetween(a: string, b: string) {
  return Math.max(0, Math.round((toMs(b) - toMs(a)) / 60000));
}

/** Current wall-clock time in the ERP timezone, as "YYYY-MM-DD HH:mm:ss". */
export function nowInErpTz() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: ERP_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function todayInErpTz() {
  return nowInErpTz().slice(0, 10);
}

function summarizeDay(date: string, logs: Checkin[], now: string): DaySummary {
  const sessions: Session[] = [];
  let openIn: string | null = null;

  for (const log of logs) {
    // Some devices don't set log_type; treat those as alternating IN/OUT
    const type = log.log_type ?? (openIn ? "OUT" : "IN");
    if (type === "IN") {
      openIn ??= log.time; // ignore duplicate INs, keep the first
    } else if (openIn) {
      sessions.push({ in: openIn, out: log.time, minutes: minutesBetween(openIn, log.time) });
      openIn = null;
    } // OUT without a preceding IN is ignored
  }

  const isToday = date === now.slice(0, 10);
  const ongoing = openIn !== null && isToday;
  const missingOut = openIn !== null && !isToday;
  if (ongoing) sessions.push({ in: openIn!, out: null, minutes: minutesBetween(openIn!, now) });

  const firstIn = logs.find((l) => (l.log_type ?? "IN") === "IN")?.time ?? null;
  const lastOut = [...sessions].reverse().find((s) => s.out)?.out ?? null;
  const end = ongoing ? now : lastOut;

  const workingMinutes = sessions.reduce((sum, s) => sum + s.minutes, 0);
  const totalMinutes = firstIn && end ? minutesBetween(firstIn, end) : workingMinutes;

  return {
    date,
    firstIn,
    lastOut,
    totalMinutes,
    workingMinutes,
    breakMinutes: Math.max(0, totalMinutes - workingMinutes),
    sessions,
    logs,
    ongoing,
    missingOut,
  };
}

export function summarize(checkins: Checkin[], now = nowInErpTz()) {
  const byDay = new Map<string, Checkin[]>();
  for (const c of [...checkins].sort((a, b) => a.time.localeCompare(b.time))) {
    const day = c.time.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), c]);
  }

  const days = [...byDay.entries()].map(([d, logs]) => summarizeDay(d, logs, now)).reverse();
  const totals = days.reduce(
    (t, d) => ({
      totalMinutes: t.totalMinutes + d.totalMinutes,
      workingMinutes: t.workingMinutes + d.workingMinutes,
      breakMinutes: t.breakMinutes + d.breakMinutes,
    }),
    { totalMinutes: 0, workingMinutes: 0, breakMinutes: 0 },
  );
  return { days, totals };
}

export function fmtDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export function fmtTime(t: string | null) {
  if (!t) return "—";
  const [h, m] = t.slice(11, 16).split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
