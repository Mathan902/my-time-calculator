import { redirect } from "next/navigation";
import {
  ErpAuthError,
  ErpError,
  getAttendance,
  getAttendanceRequests,
  getCheckins,
  getCompanyHolidayList,
  getEmployeeForUser,
  getHolidays,
  getLeaveApplications,
  getLoggedUser,
  getTeamMembers,
  type Employee,
} from "@/lib/erp";
import { fmtDuration, todayInErpTz } from "@/lib/hours";
import { buildMonthReport, cycleDates, cycleOf, REQUIRED_MINUTES, shiftMonth, type Coverage, type DayStatus, type MonthReport, type RequestStatus, type RequestTally } from "@/lib/month";
import { getSession } from "@/lib/session";
import { Shell } from "@/components/shell";
import { AlertIcon, CalendarIcon, UsersIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function fmtDate(date: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(date + "T00:00:00Z").toLocaleDateString("en-IN", { ...opts, timeZone: "UTC" });
}

/** Optional data: a permission error shouldn't take down the whole page, just leave a note. */
async function optional<T>(p: Promise<T>, fallback: T, what: string, warnings: string[]) {
  try {
    return await p;
  } catch (e) {
    if (e instanceof ErpAuthError || !(e instanceof ErpError)) throw e;
    warnings.push(`Couldn't load ${what}: ${e.message}`);
    return fallback;
  }
}

type Person = Employee & { isMe: boolean; report: MonthReport; holidaysKnown: boolean };

export default async function MonthPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const today = todayInErpTz();
  const thisMonth = cycleOf(today);
  const month = params.month && MONTH_RE.test(params.month) && params.month <= thisMonth ? params.month : thisMonth;
  const dates = cycleDates(month);
  const from = dates[0];
  const to = dates[dates.length - 1];

  const warnings: string[] = [];
  let me: Employee;
  let people: Person[];
  try {
    const user = await getLoggedUser(session.sid);
    me = await getEmployeeForUser(session.sid, user);
    const team = await optional(getTeamMembers(session.sid, me.name), [], "your team", warnings);
    const everyone = [me, ...team];
    const ids = everyone.map((e) => e.name);

    const [checkins, attendance, leaves, attendanceRequests] = await Promise.all([
      optional(getCheckins(session.sid, ids, from, to), [], "check-ins", warnings),
      optional(getAttendance(session.sid, ids, from, to), [], "attendance", warnings),
      optional(getLeaveApplications(session.sid, ids, from, to), [], "leave applications", warnings),
      optional(getAttendanceRequests(session.sid, ids, from, to), [], "attendance requests", warnings),
    ]);

    // Resolve each person's holiday list (falling back to the company default) and fetch each list once
    const companies = [...new Set(everyone.filter((e) => !e.holiday_list && e.company).map((e) => e.company!))];
    const companyLists = new Map(
      await Promise.all(
        companies.map(async (c) => [c, await getCompanyHolidayList(session.sid, c).catch(() => null)] as const),
      ),
    );
    const listFor = (e: Employee) => e.holiday_list || (e.company ? companyLists.get(e.company) : null) || null;
    const listNames = [...new Set(everyone.map(listFor).filter((l): l is string => !!l))];
    const holidayLists = new Map(
      await Promise.all(listNames.map(async (l) => [l, await getHolidays(session.sid, l).catch(() => null)] as const)),
    );

    people = everyone.map((e, i) => {
      const holidays = holidayLists.get(listFor(e) ?? "") ?? null;
      return {
        ...e,
        isMe: i === 0,
        holidaysKnown: holidays !== null,
        report: buildMonthReport({
          dates,
          today,
          holidays,
          checkins: checkins.filter((c) => c.employee === e.name),
          attendance: attendance.filter((a) => a.employee === e.name),
          leaves: leaves.filter((l) => l.employee === e.name),
          attendanceRequests: attendanceRequests.filter((r) => r.employee === e.name),
        }),
      };
    });
  } catch (e) {
    if (e instanceof ErpAuthError) redirect("/api/logout");
    return (
      <Shell name={session.fullName} active="monthly">
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-900/60 bg-red-950/40 p-4 text-red-300">
          <AlertIcon className="mt-0.5 h-5 w-5 shrink-0" />
          <p>{(e as Error).message}</p>
        </div>
      </Shell>
    );
  }

  if (people.some((p) => !p.holidaysKnown)) {
    warnings.push("Some holiday lists couldn't be read from the ERP, so Saturdays and Sundays are treated as weekly offs for those people.");
  }

  const [mine, ...team] = people;
  const monthLabel = fmtDate(to, { month: "long", year: "numeric" });
  const cycleLabel = `${fmtDate(from, { day: "numeric", month: "short" })} – ${fmtDate(to, { day: "numeric", month: "short", year: "numeric" })}`;

  return (
    <Shell name={me.employee_name} active="monthly">
      <section className="flex animate-rise flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 shadow-lg shadow-black/30 sm:p-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-yellow-400">Monthly roll call</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-50">{monthLabel}</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {cycleLabel}
            {month === thisMonth && ` · up to ${fmtDate(today, { day: "numeric", month: "short" })}`} · less than{" "}
            {fmtDuration(REQUIRED_MINUTES)} of working time counts as short hours
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <a href={`/dashboard/month?month=${shiftMonth(month, -1)}`} className="h-10 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 transition hover:bg-zinc-800">
            ← Prev
          </a>
          <form className="flex items-end gap-2">
            <input
              type="month"
              name="month"
              defaultValue={month}
              max={thisMonth}
              className="h-10 rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 text-sm text-zinc-100 outline-none transition focus:border-yellow-400 focus:ring-4 focus:ring-yellow-400/15"
            />
            <button className="h-10 rounded-lg bg-yellow-400 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-yellow-300">Go</button>
          </form>
          {month < thisMonth && (
            <a href={`/dashboard/month?month=${shiftMonth(month, 1)}`} className="h-10 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 transition hover:bg-zinc-800">
              Next →
            </a>
          )}
        </div>
      </section>

      {warnings.length > 0 && (
        <div role="status" className="space-y-1 rounded-xl border border-amber-900/60 bg-amber-950/30 p-4 text-sm text-amber-200">
          {warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}

      {team.length > 0 && <TeamTable people={people} />}

      <PersonCard person={mine} open />
      {team.length > 0 && (
        <>
            <h2 className="flex items-center gap-2 pt-2 text-lg font-semibold text-zinc-100">
              <UsersIcon className="h-5 w-5 text-yellow-400" /> Team members
            </h2>
            {team.map((p) => (
              <PersonCard key={p.name} person={p} open={false} />
            ))}
        </>
      )}
    </Shell>
  );
}

function TeamTable({ people }: { people: Person[] }) {
  return (
    <section className="animate-rise overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 shadow-lg shadow-black/30 [animation-delay:80ms]">
      <div className="flex items-center gap-2 px-5 py-4">
        <UsersIcon className="h-5 w-5 text-yellow-400" />
        <h2 className="font-semibold text-zinc-100">Team overview</h2>
      </div>
      <div className="overflow-x-auto border-t border-zinc-800">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-zinc-950/40 text-left text-xs uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-3 py-2.5 text-right font-medium">Present</th>
              <th className="px-3 py-2.5 text-right font-medium">Absent</th>
              <th className="px-3 py-2.5 text-right font-medium">Leave</th>
              <th className="px-3 py-2.5 text-right font-medium">WFH</th>
              <th className="px-3 py-2.5 text-right font-medium">Short hrs</th>
              <th className="px-3 py-2.5 text-right font-medium">Worked</th>
              <th className="px-3 py-2.5 text-right font-medium">Requests sent</th>
              <th className="px-3 py-2.5 text-right font-medium">Approved</th>
              <th className="px-4 py-2.5 font-medium">Absent / short days covered?</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const c = p.report.counts;
              return (
                <tr key={p.name} className="border-t border-zinc-800 transition hover:bg-zinc-800/40">
                  <td className="px-4 py-2.5">
                    <a href={`#${p.name}`} className="font-medium text-zinc-100 hover:text-yellow-300">
                      {p.employee_name}
                    </a>
                    {p.isMe && <span className="ml-1.5 text-xs text-zinc-500">(you)</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right text-zinc-300">
                    {c.present + c.wfh}
                    {c.halfDay > 0 && <span className="text-zinc-500"> +{c.halfDay}½</span>}
                    <span className="text-zinc-600">/{c.workingDays}</span>
                  </td>
                  <td className={`px-3 py-2.5 text-right ${c.absent ? "font-semibold text-red-300" : "text-zinc-500"}`}>{c.absent}</td>
                  <td className="px-3 py-2.5 text-right text-zinc-300">{c.leave}</td>
                  <td className="px-3 py-2.5 text-right text-zinc-300">{c.wfh}</td>
                  <td className={`px-3 py-2.5 text-right ${c.short ? "font-semibold text-amber-300" : "text-zinc-500"}`}>{c.short}</td>
                  <td className="px-3 py-2.5 text-right text-zinc-300">{fmtDuration(c.workedMinutes)}</td>
                  <td className="px-3 py-2.5 text-right text-zinc-300">{p.report.requestTotal.sent}</td>
                  <td className="px-3 py-2.5 text-right text-emerald-300">
                    {p.report.requestTotal.Approved}
                    {p.report.requestTotal.Pending > 0 && <span className="text-amber-300"> +{p.report.requestTotal.Pending} pending</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <CoverageSummary coverage={p.report.coverage} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CoverageSummary({ coverage }: { coverage: Record<Coverage, number> }) {
  const parts = (["none", "Pending", "Rejected", "Approved"] as const).filter((c) => coverage[c] > 0);
  if (parts.length === 0) return <span className="text-xs text-zinc-500">Nothing to cover</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {parts.map((c) => (
        <Badge key={c} status={c}>
          {coverage[c]} {c === "none" ? "no request" : c.toLowerCase()}
        </Badge>
      ))}
    </div>
  );
}

const BADGE: Record<Coverage, string> = {
  none: "bg-red-500/10 text-red-300 ring-red-500/30",
  Rejected: "bg-red-500/10 text-red-300 ring-red-500/30",
  Cancelled: "bg-zinc-700/40 text-zinc-400 ring-zinc-600/40",
  Pending: "bg-amber-400/10 text-amber-300 ring-amber-400/30",
  Approved: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/30",
};

function Badge({ status, children }: { status: Coverage | RequestStatus; children: React.ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${BADGE[status]}`}>{children}</span>;
}

const CELL: Record<DayStatus, string> = {
  present: "bg-yellow-400/15 text-yellow-200",
  wfh: "bg-violet-400/15 text-violet-200",
  "half-day": "bg-yellow-400/10 text-yellow-300/80",
  absent: "bg-red-500/20 text-red-200",
  leave: "bg-sky-400/15 text-sky-200",
  holiday: "bg-zinc-800/60 text-zinc-500",
  today: "bg-zinc-800 text-zinc-200",
  upcoming: "bg-transparent text-zinc-700",
};

const STATUS_LABEL: Record<DayStatus, string> = {
  present: "Present",
  wfh: "Work from home",
  "half-day": "Half day",
  absent: "Absent",
  leave: "On leave",
  holiday: "Holiday",
  today: "Today",
  upcoming: "Upcoming",
};

function PersonCard({ person, open }: { person: Person; open: boolean }) {
  const { report } = person;
  const c = report.counts;
  const firstWeekday = (new Date(report.days[0].date + "T00:00:00Z").getUTCDay() + 6) % 7; // Monday = 0

  return (
    <details
      id={person.name}
      open={open}
      className="group/card animate-rise scroll-mt-20 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 shadow-lg shadow-black/30 [animation-delay:160ms]"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-5 py-4 transition hover:bg-zinc-800/30">
        <div className="flex items-center gap-3">
          <span className="text-zinc-500 transition group-open/card:rotate-90">▸</span>
          <div>
            <h2 className="font-semibold text-zinc-100">
              {person.employee_name} {person.isMe && <span className="text-sm font-normal text-zinc-500">(you)</span>}
            </h2>
            <p className="text-xs text-zinc-500">{[person.designation, person.name].filter(Boolean).join(" · ")}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-sm tabular-nums">
          <Pill label="Present" value={`${c.present + c.wfh + c.halfDay}/${c.workingDays}`} className="bg-yellow-400/10 text-yellow-300" />
          <Pill label="WFH" value={c.wfh} className="bg-violet-400/10 text-violet-300" />
          <Pill label="Absent" value={c.absent} className={c.absent ? "bg-red-500/15 text-red-300" : "bg-zinc-800 text-zinc-400"} />
          <Pill label="Leave" value={c.leave} className="bg-sky-400/10 text-sky-300" />
          <Pill label="Short hrs" value={c.short} className={c.short ? "bg-amber-400/15 text-amber-300" : "bg-zinc-800 text-zinc-400"} />
          <Pill label="Worked" value={fmtDuration(c.workedMinutes)} className="bg-zinc-800 text-zinc-100" />
          <Pill
            label="Requests"
            value={`${report.requestTotal.Approved}/${report.requestTotal.sent} approved`}
            className="bg-emerald-400/10 text-emerald-300"
          />
        </div>
      </summary>

      <div className="grid gap-5 border-t border-zinc-800 p-5 lg:grid-cols-[minmax(0,18rem)_1fr]">
        <div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wider text-zinc-600">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {Array.from({ length: firstWeekday }, (_, i) => (
              <span key={`pad${i}`} />
            ))}
            {report.days.map((d) => (
              <span
                key={d.date}
                title={`${fmtDate(d.date, { weekday: "short", day: "numeric", month: "short" })}: ${d.holiday ?? STATUS_LABEL[d.status]}${
                  d.workingMinutes ? ` · ${fmtDuration(d.workingMinutes)}` : ""
                }`}
                className={`relative flex aspect-square items-center justify-center rounded-md text-xs tabular-nums ${CELL[d.status]} ${
                  d.status === "today" ? "ring-1 ring-yellow-400" : ""
                }`}
              >
                {d.date.endsWith("-01") ? fmtDate(d.date, { day: "numeric", month: "short" }) : Number(d.date.slice(8))}
                {d.short && <i className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-400" />}
              </span>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500">
            <Legend className="bg-yellow-400/40" label="Present" />
            <Legend className="bg-red-500/50" label="Absent" />
            <Legend className="bg-sky-400/40" label="Leave" />
            <Legend className="bg-violet-400/40" label="WFH" />
            <Legend className="bg-zinc-700" label="Holiday" />
            <Legend className="bg-amber-400" label="Short hours" />
          </div>
        </div>

        <div className="min-w-0 space-y-5">
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-200">
              <AlertIcon className="h-4 w-4 text-red-300" /> Needs attention
              <span className="ml-auto">
                <CoverageSummary coverage={report.coverage} />
              </span>
            </h3>
            {report.issues.length === 0 ? (
              <p className="rounded-lg bg-zinc-950/40 px-4 py-3 text-sm text-zinc-500">No absences or short days this cycle.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-zinc-800">
                <table className="w-full text-sm tabular-nums">
                  <thead className="bg-zinc-950/40 text-left text-xs uppercase tracking-wider text-zinc-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Issue</th>
                      <th className="px-3 py-2 text-right font-medium">Worked</th>
                      <th className="px-3 py-2 font-medium">Request</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.issues.map((d) => (
                      <tr key={d.date} className="border-t border-zinc-800">
                        <td className="whitespace-nowrap px-3 py-2 text-zinc-300">{fmtDate(d.date, { weekday: "short", day: "numeric", month: "short" })}</td>
                        <td className="px-3 py-2">
                          {d.status === "absent" ? (
                            <span className="text-red-300">Absent</span>
                          ) : (
                            <span className="text-amber-300">Short by {fmtDuration(d.requiredMinutes - d.workingMinutes)}</span>
                          )}
                          {d.missingOut && <span className="ml-1.5 text-xs text-zinc-500">(missing OUT)</span>}
                        </td>
                        <td className="px-3 py-2 text-right text-zinc-300">{d.workingMinutes ? fmtDuration(d.workingMinutes) : "—"}</td>
                        <td className="px-3 py-2">
                          {d.requests.length === 0 ? (
                            <Badge status="none">Not raised</Badge>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {d.requests.map((r) => (
                                <Badge key={r.id} status={r.status}>
                                  {r.label}: {r.status}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-200">
              <CalendarIcon className="h-4 w-4 text-sky-300" /> Requests this cycle
            </h3>
            {report.requests.length === 0 ? (
              <p className="rounded-lg bg-zinc-950/40 px-4 py-3 text-sm text-zinc-500">No leave or attendance requests.</p>
            ) : (
              <>
              <RequestTallyTable rows={report.requestTally} total={report.requestTotal} />
              <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
                {report.requests.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium text-zinc-200">{r.label}</span>
                      <span className="ml-2 text-xs text-zinc-500">
                        {r.kind} · {fmtDate(r.from, { day: "numeric", month: "short" })}
                        {r.to !== r.from && ` – ${fmtDate(r.to, { day: "numeric", month: "short" })}`} · {r.days} day
                        {r.days === 1 ? "" : "s"}
                      </span>
                    </div>
                    <Badge status={r.status}>{r.status}</Badge>
                  </li>
                ))}
              </ul>
              </>
            )}
          </div>
        </div>
      </div>
    </details>
  );
}

function RequestTallyTable({ rows, total }: { rows: RequestTally[]; total: RequestTally }) {
  return (
    <div className="mb-3 overflow-x-auto rounded-lg border border-zinc-800">
      <table className="w-full text-sm tabular-nums">
        <thead className="bg-zinc-950/40 text-left text-xs uppercase tracking-wider text-zinc-500">
          <tr>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 text-right font-medium">Sent</th>
            <th className="px-3 py-2 text-right font-medium">Days</th>
            <th className="px-3 py-2 text-right font-medium">Approved</th>
            <th className="px-3 py-2 text-right font-medium">Pending</th>
            <th className="px-3 py-2 text-right font-medium">Rejected</th>
          </tr>
        </thead>
        <tbody>
          {[...rows, ...(rows.length > 1 ? [total] : [])].map((t) => (
            <tr key={t.label} className={`border-t border-zinc-800 ${t === total ? "font-semibold" : ""}`}>
              <td className="px-3 py-2 text-zinc-200">{t.label}</td>
              <td className="px-3 py-2 text-right text-zinc-200">{t.sent}</td>
              <td className="px-3 py-2 text-right text-zinc-400">{t.days}</td>
              <td className="px-3 py-2 text-right text-emerald-300">{t.Approved}</td>
              <td className={`px-3 py-2 text-right ${t.Pending ? "text-amber-300" : "text-zinc-500"}`}>{t.Pending}</td>
              <td className={`px-3 py-2 text-right ${t.Rejected ? "text-red-300" : "text-zinc-500"}`}>{t.Rejected}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <i className={`h-2 w-2 rounded-sm ${className}`} /> {label}
    </span>
  );
}

function Pill({ label, value, className }: { label: string; value: React.ReactNode; className: string }) {
  return (
    <div className={`rounded-lg px-3 py-1.5 ${className}`}>
      <p className="text-[10px] font-medium uppercase tracking-wider opacity-60">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
