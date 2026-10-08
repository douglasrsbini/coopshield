// Design tokens: única fonte de classes Tailwind para tamanhos, espaçamento e foco.
export const ICON = {
  nav: 'w-5 h-5 shrink-0',
  inline: 'w-4 h-4 shrink-0',
  header: 'w-6 h-6 shrink-0',
} as const;

export const GAP = { tight: 'gap-2', base: 'gap-4', section: 'gap-6' } as const;

export const FOCUS_RING =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background';

export const BTN_BASE =
  `inline-flex items-center justify-center ${GAP.tight} whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS_RING}`;
export const BTN_SECONDARY = `${BTN_BASE} bg-surface hover:bg-background border border-border text-textMain`;
export const BTN_PRIMARY = `${BTN_BASE} bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20`;

export const INPUT_BASE =
  'w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-textMain transition-all duration-300 hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500';
