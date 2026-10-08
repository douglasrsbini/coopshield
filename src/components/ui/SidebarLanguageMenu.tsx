import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronUp, Globe } from 'lucide-react';
import { SUPPORTED_LANGUAGES, normalizeLanguage } from '../../i18n/languages';
import { setAppLanguage } from '../../i18n/changeLanguage';

const FOCUS_RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface';

export default function SidebarLanguageMenu({ isCollapsed }: { isCollapsed: boolean }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = normalizeLanguage(i18n.resolvedLanguage);
  const active = SUPPORTED_LANGUAGES.find(l => l.code === current) ?? SUPPORTED_LANGUAGES[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const select = async (code: string) => {
    setOpen(false);
    setError(false);
    try {
      await setAppLanguage(code);
    } catch (e) {
      console.error('Falha ao persistir idioma:', e);
      setError(true);
    }
  };

  const label = t('settings.language.title');

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${active.label}`}
        title={isCollapsed ? `${label}: ${active.label}` : undefined}
        className={`w-full flex items-center gap-3 h-11 rounded-lg border border-transparent text-textMuted transition-all duration-300 hover:bg-black/5 dark:hover:bg-white/5 hover:text-textMain ${FOCUS_RING} ${isCollapsed ? 'justify-center px-0' : 'px-4'} ${open ? 'bg-primary/10 text-primary border-primary/20' : ''}`}
      >
        <Globe className="w-5 h-5 shrink-0" aria-hidden="true" />
        {!isCollapsed && (
          <>
            <span className="flex-1 text-left font-medium truncate whitespace-nowrap">{active.label}</span>
            <ChevronUp className={`w-4 h-4 shrink-0 transition-transform duration-300 ${open ? '' : 'rotate-180'}`} aria-hidden="true" />
          </>
        )}
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={label}
          className={`absolute bottom-full mb-2 z-50 min-w-[220px] p-1.5 flex flex-col gap-1 rounded-xl border border-white/10 bg-surface/90 backdrop-blur-xl shadow-[0_0_30px_rgba(245,158,11,0.15)] ${isCollapsed ? 'left-0' : 'left-0 right-0'}`}
        >
          {SUPPORTED_LANGUAGES.map(({ code, label: name }) => {
            const selected = code === current;
            return (
              <li key={code} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  autoFocus={selected}
                  onClick={() => select(code)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-all duration-300 ${FOCUS_RING} ${selected ? 'bg-primary/10 text-primary font-semibold' : 'text-textMain hover:bg-black/5 dark:hover:bg-white/5'}`}
                >
                  <span className="flex-1 text-left truncate">{name}</span>
                  {selected && <Check className="w-4 h-4 shrink-0" aria-hidden="true" />}
                </button>
              </li>
            );
          })}
          {error && <li role="alert" className="px-3 py-1 text-xs text-red-500">{t('settings.language.saveError')}</li>}
        </ul>
      )}
    </div>
  );
}
