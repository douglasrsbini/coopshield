import { useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Layers, Cloud, RotateCcw, ScrollText, Lightbulb, BookOpen, type LucideIcon } from 'lucide-react';
import { FOCUS_RING } from '../../ui/tokens';

type SectionId = 'multithread' | 'cloud' | 'restore' | 'audit';

interface ManualBlock { h: string; p: string; }

const SECTIONS: { id: SectionId; icon: LucideIcon }[] = [
  { id: 'multithread', icon: Layers },
  { id: 'cloud', icon: Cloud },
  { id: 'restore', icon: RotateCcw },
  { id: 'audit', icon: ScrollText },
];

export default function UserManual() {
  const { t } = useTranslation();
  const [active, setActive] = useState<SectionId>('multithread');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const blocks = t(`manual.${active}.blocks`, { returnObjects: true }) as ManualBlock[];

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = (index + 1) % SECTIONS.length;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = (index - 1 + SECTIONS.length) % SECTIONS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = SECTIONS.length - 1;
    else return;
    e.preventDefault();
    const id = SECTIONS[next].id;
    setActive(id);
    tabRefs.current[id]?.focus();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 flex-1 min-h-0">
      <aside className="bg-surface/70 backdrop-blur border border-border rounded-2xl p-4 h-fit lg:sticky lg:top-0">
        <div className="flex items-center gap-2 px-2 pb-3 mb-3 border-b border-border/50">
          <BookOpen className="w-5 h-5 text-primary shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-textMain truncate">{t('manual.title')}</p>
            <p className="text-[11px] text-textMuted truncate">{t('manual.subtitle')}</p>
          </div>
        </div>
        <div role="tablist" aria-orientation="vertical" aria-label={t('manual.nav')} className="flex lg:flex-col gap-1 overflow-x-auto">
          {SECTIONS.map(({ id, icon: Icon }, index) => {
            const selected = active === id;
            return (
              <button
                key={id}
                ref={(el) => { tabRefs.current[id] = el; }}
                role="tab"
                id={`manual-tab-${id}`}
                aria-selected={selected}
                aria-controls={`manual-panel-${id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActive(id)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap text-left transition-all duration-300 cursor-pointer border-l-2 ${FOCUS_RING} ${selected ? 'bg-primary/10 text-primary border-primary shadow-[0_0_15px_rgba(245,158,11,0.15)]' : 'text-textMuted border-transparent hover:text-textMain hover:bg-background'}`}
              >
                <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                <span className="truncate">{t(`manual.${id}.nav`)}</span>
              </button>
            );
          })}
        </div>
      </aside>

      <article
        role="tabpanel"
        id={`manual-panel-${active}`}
        aria-labelledby={`manual-tab-${active}`}
        tabIndex={0}
        className={`bg-surface/70 backdrop-blur border border-border rounded-2xl p-8 overflow-y-auto ${FOCUS_RING}`}
      >
        <div className="max-w-3xl">
          <h2 className="text-2xl font-bold tracking-tight text-textMain">{t(`manual.${active}.title`)}</h2>
          <p className="mt-3 text-[15px] leading-7 text-textMuted">{t(`manual.${active}.intro`)}</p>

          <ol className="mt-8 space-y-6">
            {blocks.map((block, i) => (
              <li key={block.h} className="flex gap-4">
                <span className="shrink-0 w-7 h-7 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs font-bold flex items-center justify-center">{i + 1}</span>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-textMain">{block.h}</h3>
                  <p className="mt-1 text-sm leading-7 text-textMuted">{block.p}</p>
                </div>
              </li>
            ))}
          </ol>

          <aside className="mt-8 flex gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
            <Lightbulb className="w-5 h-5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-sm leading-6 text-textMain">{t(`manual.${active}.tip`)}</p>
          </aside>
        </div>
      </article>
    </div>
  );
}
