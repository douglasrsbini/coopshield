// Cena cinematográfica: mar noturno + farol com feixe âmbar. Puramente decorativa.
const STARS = [
  [8, 10], [18, 22], [27, 8], [36, 16], [45, 6], [53, 20], [62, 11], [71, 5], [80, 18], [90, 9], [95, 24], [14, 30], [66, 28], [40, 29],
];

export default function LighthouseScene() {
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none bg-gradient-to-b from-sky-200 via-slate-200 to-slate-300 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 transition-colors duration-700">
      <div className="absolute inset-0 hidden dark:block">
        {STARS.map(([x, y], i) => (
          <span key={i} className="absolute w-0.5 h-0.5 rounded-full bg-white/70 animate-pulse" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${i * 0.35}s` }} />
        ))}
      </div>

      <div className="absolute left-1/2 top-[18%] -translate-x-1/2 w-[70vmin] h-[70vmin] rounded-full bg-amber-500/10 dark:bg-amber-500/10 blur-3xl" />

      {/* Feixe de luz */}
      <div
        className="splash-beam absolute left-[11%] top-[30%] w-[95vw] h-[44vh] bg-gradient-to-r from-amber-400/70 via-amber-400/15 to-transparent mix-blend-screen blur-[2px]"
        style={{ clipPath: 'polygon(0 47%, 100% 0, 100% 100%, 0 53%)' }}
      />

      {/* Farol */}
      <svg className="absolute left-[7%] bottom-[16%] h-[52vh] w-auto drop-shadow-[0_0_25px_rgba(245,158,11,0.35)]" viewBox="0 0 100 220" fill="none">
        <polygon points="30,215 70,215 62,70 38,70" className="fill-slate-700 dark:fill-slate-800" />
        <polygon points="36,150 64,150 62,120 38,120" className="fill-amber-500/80" />
        <polygon points="38,95 62,95 61,75 39,75" className="fill-amber-500/80" />
        <rect x="34" y="55" width="32" height="15" rx="2" className="fill-slate-600 dark:fill-slate-700" />
        <rect x="38" y="38" width="24" height="17" rx="2" className="fill-amber-300" />
        <circle cx="50" cy="46" r="14" className="fill-amber-400/30 animate-pulse" />
        <polygon points="34,38 66,38 50,20" className="fill-slate-700 dark:fill-slate-800" />
        <rect x="46" y="8" width="8" height="12" className="fill-slate-600" />
      </svg>

      {/* Mar */}
      <div className="absolute inset-x-0 bottom-0 h-[24%] bg-gradient-to-b from-sky-300/60 to-slate-400/60 dark:from-slate-900 dark:to-slate-950" />
      <div className="splash-wave absolute -inset-x-[5%] bottom-[14%] h-16 rounded-[50%] bg-sky-400/20 dark:bg-blue-900/30 blur-md" />
      <div className="splash-wave absolute -inset-x-[5%] bottom-[6%] h-20 rounded-[50%] bg-sky-500/20 dark:bg-blue-950/60 blur-sm [animation-delay:-4s]" />
      <div className="absolute left-[8%] bottom-[9%] w-[30%] h-3 rounded-full bg-amber-400/30 blur-xl" />
      <div className="absolute inset-0 bg-gradient-to-t from-transparent via-transparent to-black/20 dark:to-black/40" />
    </div>
  );
}
