"use client";

import { useActionState, useState } from "react";
import { BatIcon } from "@/components/bat-icon";
import { GothamScene } from "@/components/gotham-scene";
import { loginAction, type LoginState } from "../actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  const [showPassword, setShowPassword] = useState(false);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <GothamScene />

      <div className="relative w-full max-w-md">
        <div className="mb-8 flex animate-rise flex-col items-center text-center">
          <div className="group mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-yellow-400 text-zinc-950 shadow-lg shadow-yellow-400/25 transition hover:scale-110 hover:shadow-yellow-400/50">
            <BatIcon className="w-9 group-hover:animate-flap" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">Welcome back</h1>
          <p className="mt-1 text-sm text-zinc-400">Sign in with your Soft Suave ERP account to view your hours</p>
        </div>

        <form
          action={action}
          className="animate-rise space-y-5 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8 [animation-delay:120ms] shadow-2xl shadow-black/50 backdrop-blur"
        >
          <div className="space-y-1.5">
            <label htmlFor="usr" className="text-sm font-medium text-zinc-300">
              Email
            </label>
            <div className="relative">
              <MailIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                id="usr"
                name="usr"
                type="text"
                autoComplete="username"
                placeholder="you@softsuave.com"
                required
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 py-2.5 pl-10 pr-3 text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:border-yellow-400 focus:ring-4 focus:ring-yellow-400/15"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="pwd" className="text-sm font-medium text-zinc-300">
              Password
            </label>
            <div className="relative">
              <LockIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                id="pwd"
                name="pwd"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                required
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950/60 py-2.5 pl-10 pr-11 text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:border-yellow-400 focus:ring-4 focus:ring-yellow-400/15"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                title={showPassword ? "Hide password" : "Show password"}
                className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
              >
                {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {state.error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2.5 text-sm text-red-300">
              <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{state.error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={pending}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-yellow-400 py-2.5 font-semibold text-zinc-950 shadow-md shadow-yellow-400/20 transition hover:-translate-y-0.5 hover:bg-yellow-300 hover:shadow-lg hover:shadow-yellow-400/30 active:translate-y-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-yellow-400/30 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {pending && <Spinner className="h-4 w-4" />}
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 animate-rise text-center text-xs text-zinc-500 [animation-delay:240ms]">Your credentials are sent only to the ERP.</p>
      </div>
    </main>
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

function MailIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </Svg>
  );
}

function LockIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </Svg>
  );
}

function EyeIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  );
}

function EyeOffIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10.7 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m2 2 20 20" />
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

function Spinner({ className }: IconProps) {
  return (
    <svg className={`animate-spin ${className ?? ""}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
