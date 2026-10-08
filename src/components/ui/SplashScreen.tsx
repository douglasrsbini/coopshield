import { ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface SplashScreenProps {
  isExiting: boolean;
  error: string | null;
  onRetry: () => void;
}

export default function SplashScreen({ isExiting, error, onRetry }: SplashScreenProps) {
  const { t } = useTranslation();
  return (
    <main
      className={`fixed inset-0 z-[200] flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-950 px-6 text-slate-50 transition-opacity duration-500 ease-in-out ${isExiting ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
      role="status"
      aria-live="polite"
      aria-label={error ? t('splash.ariaFailed') : t('splash.ariaStarting')}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_82%,rgba(245,158,11,0.13),transparent_45%),linear-gradient(180deg,#020617_0%,#071426_48%,#0b1e32_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-b from-transparent via-sky-950/35 to-slate-950/90" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 overflow-hidden">
        <div className="splash-wave absolute -inset-x-10 bottom-0 h-full rounded-[50%_50%_0_0] border-t border-sky-300/10 bg-sky-950/45" />
        <div className="splash-wave absolute -inset-x-20 bottom-[-18%] h-[85%] rounded-[50%_50%_0_0] border-t border-slate-300/10 bg-slate-950/75 [animation-delay:-4s]" />
      </div>

      <div className="relative mb-8 flex h-40 w-64 items-end justify-center" aria-hidden="true">
        <div className="splash-beam absolute left-[calc(50%+8px)] top-[42px] h-12 w-[min(42vw,18rem)] bg-gradient-to-r from-amber-300/45 via-amber-300/10 to-transparent [clip-path:polygon(0_32%,100%_0,100%_100%,0_68%)]" />
        <div className="absolute bottom-2 h-24 w-32 rounded-full bg-amber-400/10 blur-2xl" />
        <svg className="relative z-10 h-36 w-24 drop-shadow-[0_0_26px_rgba(245,158,11,0.16)]" viewBox="0 0 96 144" fill="none">
          <path d="M18 140h60L67 57H29L18 140Z" fill="#1E293B" stroke="#475569" strokeWidth="2" />
          <path d="M29 57h38V31H29v26Z" fill="#0F172A" stroke="#64748B" strokeWidth="2" />
          <path d="M24 31h48l-5-8H29l-5 8Z" fill="#334155" stroke="#64748B" strokeWidth="2" />
          <path d="M34 23V10h28v13" stroke="#64748B" strokeWidth="3" />
          <path d="M39 10V5h18v5" stroke="#64748B" strokeWidth="3" />
          <path d="M36 42h24v14H36z" fill="#F59E0B" fillOpacity=".9" />
          <path d="M42 42v14m12-14v14" stroke="#451A03" strokeOpacity=".55" strokeWidth="2" />
          <path d="M12 140h72" stroke="#64748B" strokeLinecap="round" strokeWidth="3" />
          <path d="M44 88v12m8-12v12" stroke="#94A3B8" strokeLinecap="round" strokeWidth="3" />
          <circle cx="48" cy="49" r="4" fill="#FEF3C7" />
        </svg>
        <div className="absolute bottom-0 flex items-center gap-1 opacity-70" aria-hidden="true">
          <span className="h-1 w-1 rounded-full bg-amber-300" />
          <span className="h-1 w-1 rounded-full bg-amber-300/60" />
          <span className="h-1 w-1 rounded-full bg-amber-300/30" />
        </div>
      </div>

      <div className="relative z-10 text-center">
        <div className="mb-3 flex items-center justify-center gap-2 text-amber-400">
          <ShieldCheck size={16} strokeWidth={2.2} />
          <span className="text-[10px] font-semibold uppercase tracking-[0.32em]">{t('splash.company')}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-[0.16em] text-slate-50 sm:text-3xl">KOPHER <span className="text-amber-400">SHIELD</span></h1>
        <p className="mt-3 text-xs tracking-wide text-slate-400">{t('splash.tagline')}</p>
      </div>

      {error ? (
        <div className="relative z-10 mt-8 flex max-w-md flex-col items-center text-center" role="alert">
          <p className="text-sm font-medium text-rose-300">{t('splash.failed')}</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-xs font-semibold text-amber-300 transition-colors hover:border-amber-300/60 hover:bg-amber-400/20 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-slate-950"
          >
            {t('splash.retry')}
          </button>
        </div>
      ) : (
        <div className="relative z-10 mt-10 flex flex-col items-center gap-3" aria-hidden="true">
          <div className="h-1 w-44 overflow-hidden rounded-full bg-slate-800">
            <div className="splash-progress h-full w-1/3 rounded-full bg-gradient-to-r from-amber-600 via-amber-300 to-amber-500" />
          </div>
          <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Inicializando ambiente seguro</span>
        </div>
      )}
    </main>
  );
}
