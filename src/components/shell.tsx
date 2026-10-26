import { logoutAction } from "@/app/actions";
import { BatIcon } from "./bat-icon";
import { LogoutIcon } from "./icons";

const NAV = [
  { key: "daily", label: "Daily", href: "/dashboard" },
  { key: "monthly", label: "Monthly", href: "/dashboard/month" },
] as const;

export function Shell({ name, active, children }: { name: string; active: "daily" | "monthly"; children: React.ReactNode }) {
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
            <span className="hidden text-lg font-semibold tracking-tight text-zinc-100 sm:inline">Work Hours</span>
          </div>
          <nav className="flex gap-1 rounded-lg bg-zinc-900 p-1 text-sm">
            {NAV.map((n) => (
              <a
                key={n.key}
                href={n.href}
                className={`rounded-md px-3 py-1 font-medium transition ${
                  active === n.key ? "bg-yellow-400 text-zinc-950" : "text-zinc-400 hover:text-zinc-100"
                }`}
              >
                {n.label}
              </a>
            ))}
          </nav>
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
