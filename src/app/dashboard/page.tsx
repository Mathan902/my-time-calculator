import { redirect } from "next/navigation";
import { ErpAuthError, getCheckins, getEmployeeForUser, getLoggedUser } from "@/lib/erp";
import { fmtDuration, fmtTime, summarize, todayInErpTz, type DaySummary } from "@/lib/hours";
import { getSession } from "@/lib/session";
import { BatIcon } from "@/components/bat-icon";
import { GothamScene } from "@/components/gotham-scene";
import { logoutAction } from "../actions";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function addDays(date: string, n: number) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function presets(today: string) {
  const weekday = (new Date(today + "T00:00:00Z").getUTCDay() + 6) % 7; // Monday = 0
  const yesterday = addDays(today, -1);
  return [
    { label: "Today", from: today, to: today },
    { label: "Yesterday", from: yesterday, to: yesterday },
    { label: "This week", from: addDays(today, -weekday), to: today },
    { label: "This month", from: today.slice(0, 8) + "01", to: today },
  ];
}

function fmtDate(date: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(date + "T00:00:00Z").toLocaleDateString("en-IN", { ...opts, timeZone: "UTC" });
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const today = todayInErpTz();
  const to = params.to && DATE_RE.test(params.to) ? params.to : today;
  const from = params.from && DATE_RE.test(params.from) && params.from <= to ? params.from : to;

  let data;
  try {
    const user = await getLoggedUser(session.sid);
    const employee = await getEmployeeForUser(session.sid, user);
    const checkins = await getCheckins(session.sid, employee.name, from, to);
    data = { employee, ...summarize(checkins) };
  } catch (e) {
    // Session cookie is stale: clear it via the logout route and send the user to log in again
    if (e instanceof ErpAuthError) redirect("/api/logout");
    return (
      <Shell name={session.fullName}>
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-900/60 bg-red-950/40 p-4 text-red-300">
          <AlertIcon className="mt-0.5 h-5 w-5 shrink-0" />
          <p>{(e as Error).message}</p>
        </div>
      </Shell>
    );
  }

  const { employee, days, totals } = data;
  const multiDay = from !== to;
  const workingPct = totals.totalMinutes ? Math.round((totals.workingMinutes / totals.totalMinutes) * 100) : 0;
  const rangeLabel = multiDay
    ? `${fmtDate(from, { day: "numeric", month: "short" })} – ${fmtDate(to, { day: "numeric", month: "short", year: "numeric" })}`
    : fmtDate(to, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <Shell name={employee.employee_name}>
      <section className="relative h-44 animate-rise overflow-hidden rounded-2xl border border-zinc-800 shadow-lg shadow-black/40 sm:h-52">
        <GothamScene />
        <div className="relative flex h-full flex-col justify-end bg-linear-to-t from-black/70 via-black/20 to-transparent p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-yellow-400">Gotham shift report</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
            Welcome back, {employee.employee_name.split(/\s+/)[0]}
          </h1>
          <p className="mt-1 text-sm text-zinc-300">
            {fmtDuration(totals.workingMinutes)} on patrol · {rangeLabel}
          </p>
        </div>
      </section>

      <section className="flex animate-rise flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 shadow-lg shadow-black/30 [animation-delay:80ms] sm:p-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Showing</p>
          <p className="mt-0.5 text-lg font-semibold text-zinc-100">{rangeLabel}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {presets(today).map((p) => {
              const active = p.from === from && p.to === to;
              return (
                <a
                  key={p.label}
                  href={`/dashboard?from=${p.from}&to=${p.to}`}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    active ? "bg-yellow-400 text-zinc-950 shadow-sm shadow-yellow-400/20" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                  }`}
                >
                  {p.label}
                </a>
              );
            })}
          </div>
        </div>

        <form className="flex flex-wrap items-end gap-2">
          <DateField label="From" name="from" value={from} max={today} />
          <DateField label="To" name="to" value={to} max={today} />
          <button className="h-10 rounded-lg bg-yellow-400 px-5 text-sm font-semibold text-zinc-950 shadow-sm transition hover:-translate-y-0.5 hover:bg-yellow-300 hover:shadow-lg hover:shadow-yellow-400/30 active:translate-y-0">
            Apply
          </button>
        </form>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat
          icon={<ClockIcon className="h-5 w-5" />}
          tone="slate"
          delay={160}
          label={multiDay ? "Total hours (range)" : "Total hours"}
          value={fmtDuration(totals.totalMinutes)}
          hint="First IN → last OUT"
        />
        <Stat
          icon={<BriefcaseIcon className="h-5 w-5" />}
          tone="signal"
          delay={240}
          label="Working hours"
          value={fmtDuration(totals.workingMinutes)}
          hint={`${workingPct}% of total time`}
          progress={workingPct}
        />
        <Stat
          icon={<CoffeeIcon className="h-5 w-5" />}
          tone="night"
          delay={320}
          label="Break time"
          value={fmtDuration(totals.breakMinutes)}
          hint="Total − working"
        />
      </section>

      {days.length === 0 ? (
        <div className="flex flex-col items-center animate-rise rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/40 px-6 py-14 [animation-delay:400ms] text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800 text-zinc-500">
            <BatIcon className="w-7 animate-[flap_0.5s_ease-in-out_3]" />
          </div>
          <p className="font-medium text-zinc-200">No check-ins found</p>
          <p className="mt-1 text-sm text-zinc-500">A quiet night in Gotham. Try a different date range.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {days.map((d, i) => (
            <DayCard key={d.date} day={d} delay={400 + Math.min(i, 8) * 80} />
          ))}
        </div>
      )}
    </Shell>
  );
}

function Shell({ name, children }: { name: string; children: React.ReactNode }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="group flex items-center gap-2.5">
            <div className="flex h-9 w-9 transition group-hover:scale-110 items-center justify-center rounded-xl bg-yellow-400 text-zinc-950 shadow-md shadow-yellow-400/20">
              <BatIcon className="w-6 group-hover:animate-flap" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-zinc-100">Work Hours</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 sm:flex">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-yellow-400 ring-1 ring-yellow-400/30">
                {initials}
              </div>
              <span className="text-sm font-medium text-zinc-300">{name}</span>
            </div>
            <form action={logoutAction}>
              <button className="flex items-center gap-1.5 rounded-lg border border-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-400 transition hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-100">
                <LogoutIcon className="h-4 w-4" />
                Log out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">{children}</main>
    </div>
  );
}

function DateField({ label, name, value, max }: { label: string; name: string; value: string; max: string }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block text-xs font-medium text-zinc-400">{label}</span>
      <input
        type="date"
        name={name}
        defaultValue={value}
        max={max}
        className="h-10 rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 text-zinc-100 outline-none transition focus:border-yellow-400 focus:ring-4 focus:ring-yellow-400/15"
      />
    </label>
  );
}

const TONES = {
  slate: { icon: "bg-zinc-800 text-zinc-300", bar: "bg-zinc-400" },
  signal: { icon: "bg-yellow-400/10 text-yellow-400", bar: "bg-yellow-400" },
  night: { icon: "bg-sky-400/10 text-sky-400", bar: "bg-sky-400" },
};

function Stat({
  icon,
  tone,
  label,
  value,
  hint,
  progress,
  delay,
}: {
  icon: React.ReactNode;
  tone: keyof typeof TONES;
  label: string;
  value: string;
  hint: string;
  progress?: number;
  delay: number;
}) {
  const t = TONES[tone];
  return (
    <div
      className="group animate-rise rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 shadow-lg shadow-black/30 transition hover:-translate-y-1 hover:border-yellow-400/40 hover:shadow-yellow-400/5"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-zinc-400">{label}</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg transition group-hover:scale-110 ${t.icon}`}>{icon}</div>
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums text-zinc-100">{value}</p>
      {progress !== undefined && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div className={`h-full origin-left animate-grow rounded-full ${t.bar}`} style={{ width: `${progress}%`, animationDelay: `${delay + 200}ms` }} />
        </div>
      )}
      <p className="mt-2 text-xs text-zinc-500">{hint}</p>
    </div>
  );
}

function minuteOfDay(t: string) {
  const [h, m] = t.slice(11, 16).split(":").map(Number);
  return h * 60 + m;
}

/** Horizontal bar showing each IN → OUT session; gaps between segments are breaks. */
function Timeline({ day }: { day: DaySummary }) {
  if (day.sessions.length === 0) return null;
  const segs = day.sessions.map((s) => ({ start: minuteOfDay(s.in), minutes: s.minutes, open: !s.out }));
  const start = segs[0].start;
  const span = Math.max(1, Math.max(...segs.map((s) => s.start + s.minutes)) - start);

  return (
    <div className="px-5 pb-4">
      <div className="relative h-3 overflow-hidden rounded-full bg-sky-950">
        {segs.map((s, i) => (
          <div
            key={i}
            className={`absolute inset-y-0 origin-left animate-grow rounded-full ${s.open ? "animate-pulse bg-yellow-300" : "bg-yellow-400"}`}
            style={{ left: `${((s.start - start) / span) * 100}%`, width: `${Math.max(0.5, (s.minutes / span) * 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-zinc-500">
        <span>{fmtTime(day.sessions[0].in)}</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <i className="h-2 w-2 rounded-full bg-yellow-400" /> Working
          </span>
          <span className="flex items-center gap-1">
            <i className="h-2 w-2 rounded-full bg-sky-900" /> Break
          </span>
        </span>
        <span>{day.ongoing ? "Now" : fmtTime(day.lastOut)}</span>
      </div>
    </div>
  );
}

function DayCard({ day, delay }: { day: DaySummary; delay: number }) {
  return (
    <section
      className="animate-rise overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 shadow-lg shadow-black/30 transition hover:border-zinc-700"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 flex-col items-center justify-center rounded-xl bg-zinc-800 leading-none">
            <span className="text-[10px] font-medium uppercase text-yellow-400">{fmtDate(day.date, { month: "short" })}</span>
            <span className="text-base font-semibold text-zinc-100">{fmtDate(day.date, { day: "numeric" })}</span>
          </div>
          <div>
            <h2 className="font-semibold text-zinc-100">{fmtDate(day.date, { weekday: "long" })}</h2>
            <p className="text-xs tabular-nums text-zinc-500">
              {fmtTime(day.firstIn)} → {day.ongoing ? "now" : fmtTime(day.lastOut)}
            </p>
          </div>
          {day.ongoing && (
            <span className="flex items-center gap-1.5 rounded-full bg-yellow-400/10 px-2.5 py-1 text-xs font-medium text-yellow-300 ring-1 ring-yellow-400/30">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-yellow-400" />
              </span>
              Checked in
            </span>
          )}
          {day.missingOut && (
            <span className="rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-300 ring-1 ring-red-500/30">
              Missing OUT
            </span>
          )}
        </div>
        <div className="flex gap-2 text-sm tabular-nums">
          <Pill label="Total" value={fmtDuration(day.totalMinutes)} className="bg-zinc-800 text-zinc-100" />
          <Pill label="Working" value={fmtDuration(day.workingMinutes)} className="bg-yellow-400/10 text-yellow-300" />
          <Pill label="Break" value={fmtDuration(day.breakMinutes)} className="bg-sky-400/10 text-sky-300" />
        </div>
      </div>

      <Timeline day={day} />

      <div className="overflow-x-auto border-t border-zinc-800">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-zinc-950/40 text-left text-xs uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-5 py-2.5 font-medium">#</th>
              <th className="px-5 py-2.5 font-medium">In</th>
              <th className="px-5 py-2.5 font-medium">Out</th>
              <th className="px-5 py-2.5 text-right font-medium">Duration</th>
            </tr>
          </thead>
          <tbody>
            {day.sessions.map((s, i) => (
              <tr key={s.in} className="border-t border-zinc-800 transition hover:bg-zinc-800/40">
                <td className="px-5 py-2.5 text-zinc-500">{i + 1}</td>
                <td className="px-5 py-2.5 text-zinc-300">{fmtTime(s.in)}</td>
                <td className="px-5 py-2.5 text-zinc-300">
                  {s.out ? fmtTime(s.out) : <span className="font-medium text-yellow-400">now</span>}
                </td>
                <td className="px-5 py-2.5 text-right font-medium text-zinc-100">{fmtDuration(s.minutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Pill({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <div className={`rounded-lg px-3 py-1.5 ${className}`}>
      <p className="text-[10px] font-medium uppercase tracking-wider opacity-60">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

type IconProps = { className?: string };

function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function ClockIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Svg>
  );
}

function BriefcaseIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" />
    </Svg>
  );
}

function CoffeeIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Z" />
      <path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H17M8 3v3M12 3v3" />
    </Svg>
  );
}

function LogoutIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3" />
    </Svg>
  );
}

function AlertIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4M12 16h.01" />
    </Svg>
  );
}
