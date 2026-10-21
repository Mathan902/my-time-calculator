import { BatIcon } from "./bat-icon";

/** Small seeded PRNG so the skyline/stars are identical on server and client (no hydration mismatch). */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

type Building = { x: number; w: number; h: number; windows: { x: number; y: number; lit: number }[] };

function buildings(seed: number, minH: number, maxH: number, withWindows: boolean): Building[] {
  const r = rng(seed);
  const out: Building[] = [];
  for (let x = -4; x < 400; ) {
    const w = 14 + Math.floor(r() * 18);
    const h = minH + Math.floor(r() * (maxH - minH));
    const windows: Building["windows"] = [];
    if (withWindows) {
      for (let wy = 100 - h + 5; wy < 96; wy += 6) {
        for (let wx = x + 3; wx < x + w - 4; wx += 5) {
          const roll = r();
          // ~20% of windows are lit; a few of those flicker
          if (roll < 0.2) windows.push({ x: wx, y: wy, lit: roll < 0.04 ? 2 : 1 });
        }
      }
    }
    out.push({ x, w, h, windows });
    x += w + Math.floor(r() * 3);
  }
  return out;
}

const FAR = buildings(7, 30, 75, false);
const NEAR = buildings(42, 18, 55, true);
const STARS = (() => {
  const r = rng(99);
  return Array.from({ length: 36 }, () => ({ left: r() * 100, top: r() * 55, size: r() < 0.2 ? 2 : 1, delay: r() * 3 }));
})();

const BATS = [
  { top: "14%", scale: 1, delay: "0s", duration: "18s", width: "w-12" },
  { top: "26%", scale: 0.8, delay: "-7s", duration: "24s", width: "w-10" },
  { top: "8%", scale: 0.6, delay: "-13s", duration: "30s", width: "w-10" },
];

/**
 * Animated Gotham night: twinkling stars, moon, a sweeping bat-signal searchlight,
 * bats flying across, and a skyline with lit windows. Fills its (relative) parent.
 */
export function GothamScene({ showSignal = true, showBats = true }: { showSignal?: boolean; showBats?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,#1e1b2e_0%,#0d0d14_55%,#09090b_100%)]" />

      {STARS.map((s, i) => (
        <span
          key={i}
          className="absolute animate-twinkle rounded-full bg-zinc-200"
          style={{ left: `${s.left}%`, top: `${s.top}%`, width: s.size, height: s.size, animationDelay: `${s.delay}s` }}
        />
      ))}

      {/* Moon */}
      <div className="absolute left-[8%] top-[10%] h-16 w-16 rounded-full bg-zinc-200 shadow-[0_0_60px_15px_rgba(228,228,231,0.15)]">
        <div className="absolute left-3 top-4 h-3 w-3 rounded-full bg-zinc-300" />
        <div className="absolute bottom-3 right-4 h-4 w-4 rounded-full bg-zinc-300" />
        <div className="absolute right-3 top-3 h-2 w-2 rounded-full bg-zinc-300" />
      </div>

      {/* Bat-signal: beam from the rooftops sweeping across the sky */}
      {showSignal && (
        <div className="absolute bottom-[18%] right-[18%] h-[75%] w-56 origin-bottom animate-sweep">
          <div className="absolute inset-0 bg-linear-to-t from-yellow-200/0 via-yellow-200/10 to-yellow-200/25 [clip-path:polygon(47%_100%,53%_100%,100%_0,0_0)]" />
          <div className="absolute -top-8 left-1/2 flex h-20 w-36 -translate-x-1/2 animate-glow items-center justify-center rounded-[50%] bg-yellow-200/25 shadow-[0_0_60px_20px_rgba(250,204,21,0.15)]">
            <BatIcon className="w-24 text-zinc-950/60" />
          </div>
        </div>
      )}

      {showBats &&
        BATS.map((b, i) => (
          <div
            key={i}
            className="absolute left-0 animate-fly"
            style={{ top: b.top, animationDelay: b.delay, animationDuration: b.duration, ["--bat-scale" as string]: b.scale }}
          >
            <BatIcon className={`${b.width} animate-[flap_0.35s_ease-in-out_infinite] text-black drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]`} />
          </div>
        ))}

      {/* Skyline: far silhouettes, then near buildings with lit windows */}
      <svg className="absolute inset-x-0 bottom-0 h-[45%] w-full" viewBox="0 0 400 100" preserveAspectRatio="xMidYMax slice">
        {FAR.map((b, i) => (
          <rect key={i} x={b.x} y={100 - b.h} width={b.w} height={b.h} className="fill-zinc-900" />
        ))}
        {NEAR.map((b, i) => (
          <g key={i}>
            <rect x={b.x} y={100 - b.h} width={b.w} height={b.h} className="fill-[#050507]" />
            {b.windows.map((w, j) => (
              <rect
                key={j}
                x={w.x}
                y={w.y}
                width={2}
                height={2.5}
                className={w.lit === 2 ? "animate-twinkle fill-yellow-300" : "fill-yellow-200/70"}
                style={w.lit === 2 ? { animationDelay: `${(j % 5) * 0.6}s` } : undefined}
              />
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}
