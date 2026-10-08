import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Check, ShieldCheck } from 'lucide-react';
import { ACTIONS, EVENTS, Joyride, STATUS } from 'react-joyride';
import type { EventData, Step, TooltipRenderProps } from 'react-joyride';

const COMPLETED_KEY = 'kopher_tour_completed';
const STEP_KEY = 'kopher_tour_step';

interface TourStop {
  id: 'welcome' | 'sidebar' | 'routines' | 'cloud' | 'audit';
  route: string;
  target: string;
  placement: Step['placement'];
}

// Cada parada declara a rota onde o alvo existe; o roteiro independe de idioma.
const TOUR_STOPS: TourStop[] = [
  { id: 'welcome', route: '/', target: 'body', placement: 'center' },
  { id: 'sidebar', route: '/', target: '[data-tour="nav-/rotinas"]', placement: 'right' },
  { id: 'routines', route: '/rotinas', target: '[data-tour="page"]', placement: 'center' },
  { id: 'cloud', route: '/nuvem', target: '[data-tour="page"]', placement: 'center' },
  { id: 'audit', route: '/auditoria', target: '[data-tour="page"]', placement: 'center' },
];

const readSavedStep = (): number => {
  const n = Number(localStorage.getItem(STEP_KEY));
  return Number.isInteger(n) && n >= 0 && n < TOUR_STOPS.length ? n : 0;
};

function TourTooltip({ index, size, step, isLastStep, backProps, primaryProps, skipProps, tooltipProps }: TooltipRenderProps) {
  const { t } = useTranslation();
  return (
    <div
      {...tooltipProps}
      className="w-[380px] max-w-[92vw] rounded-xl border border-amber-500/30 bg-slate-900/95 backdrop-blur-xl p-5 text-slate-200 shadow-[0_0_30px_rgba(245,158,11,0.18)]"
    >
      <div className="flex items-center gap-3 mb-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-500">
          <ShieldCheck className="w-5 h-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-white leading-tight truncate">{step.title}</h3>
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500/80">
            {t('tour.stepOf', { current: index + 1, total: size })}
          </p>
        </div>
      </div>

      <p className="text-sm leading-relaxed text-slate-300">{step.content}</p>

      <div className="mt-4 flex items-center gap-1.5" aria-hidden="true">
        {Array.from({ length: size }, (_, i) => (
          <span
            key={i}
            className={`h-1 rounded-full transition-all duration-300 ${i === index ? 'w-6 bg-amber-500' : i < index ? 'w-3 bg-amber-500/50' : 'w-3 bg-slate-700'}`}
          />
        ))}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <button
          {...skipProps}
          type="button"
          className="text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors rounded-md px-2 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer"
        >
          {t('tour.skip')}
        </button>
        <div className="flex items-center gap-2">
          {index > 0 && (
            <button
              {...backProps}
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" /> {t('tour.back')}
            </button>
          )}
          <button
            {...primaryProps}
            type="button"
            autoFocus
            className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-[0_0_15px_rgba(245,158,11,0.35)] hover:bg-amber-400 transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 cursor-pointer"
          >
            {isLastStep
              ? <>{t('tour.finish')} <Check className="w-4 h-4" aria-hidden="true" /></>
              : <>{t('tour.next')} <ArrowRight className="w-4 h-4" aria-hidden="true" /></>}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OnboardingTour() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(readSavedStep);

  // Retoma o tour (inclusive após reload) no passo e na rota salvos.
  useEffect(() => {
    if (localStorage.getItem(COMPLETED_KEY) === 'true') return;
    const timer = setTimeout(() => {
      const saved = readSavedStep();
      setStepIndex(saved);
      if (location.pathname !== TOUR_STOPS[saved].route) navigate(TOUR_STOPS[saved].route);
      setRun(true);
    }, 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const steps = useMemo<Step[]>(
    () =>
      TOUR_STOPS.map((stop) => ({
        target: stop.target,
        placement: stop.placement,
        title: t(`tour.steps.${stop.id}.title`),
        content: t(`tour.steps.${stop.id}.body`),
        skipBeacon: true,
        spotlightPadding: stop.id === 'sidebar' ? 6 : 0,
        hideOverlay: stop.target === 'body',
      })),
    // i18n.language faz os textos reagirem à troca de idioma durante o tour
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, i18n.language],
  );

  const finish = useCallback(() => {
    localStorage.setItem(COMPLETED_KEY, 'true');
    localStorage.removeItem(STEP_KEY);
    setRun(false);
    navigate('/');
  }, [navigate]);

  const goTo = useCallback((next: number, from: number) => {
    if (next < 0) return;
    if (next >= TOUR_STOPS.length) { finish(); return; }
    localStorage.setItem(STEP_KEY, String(next));
    // Navega antes de avançar: o Joyride aguarda o alvo da nova rota (targetWaitTimeout).
    if (TOUR_STOPS[next].route !== TOUR_STOPS[from].route) navigate(TOUR_STOPS[next].route);
    setStepIndex(next);
  }, [finish, navigate]);

  const handleEvent = useCallback((data: EventData) => {
    const { type, action, index, status } = data;

    if (status === STATUS.FINISHED || status === STATUS.SKIPPED || action === ACTIONS.SKIP) {
      finish();
      return;
    }

    if (type === EVENTS.STEP_AFTER) {
      if (action === ACTIONS.CLOSE) { finish(); return; }
      goTo(index + (action === ACTIONS.PREV ? -1 : 1), index);
    } else if (type === EVENTS.TARGET_NOT_FOUND) {
      goTo(index + 1, index);
    }
  }, [finish, goTo]);

  return (
    <Joyride
      steps={steps}
      run={run}
      stepIndex={stepIndex}
      continuous
      onEvent={handleEvent}
      tooltipComponent={TourTooltip}
      options={{
        buttons: ['back', 'primary', 'skip'],
        overlayColor: 'rgba(2, 6, 23, 0.82)',
        primaryColor: '#F59E0B',
        arrowColor: '#0f172a',
        spotlightRadius: 12,
        overlayClickAction: false,
        dismissKeyAction: 'close',
        targetWaitTimeout: 5000,
        scrollOffset: 80,
        zIndex: 10000,
      }}
      styles={{
        spotlight: { stroke: 'rgba(245, 158, 11, 0.55)', strokeWidth: 2 },
      }}
    />
  );
}
