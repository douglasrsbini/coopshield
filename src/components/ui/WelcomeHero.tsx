import { useTranslation } from 'react-i18next';
import { Moon, Sun, Monitor, CheckCircle2, ShieldCheck, type LucideIcon } from 'lucide-react';
import { SUPPORTED_LANGUAGES, normalizeLanguage, type SupportedLanguage } from '../../i18n/languages';
import { FOCUS_RING } from '../../ui/tokens';

export type ThemeOption = 'light' | 'dark' | 'system';

interface WelcomeHeroProps {
  language: SupportedLanguage;
  theme: ThemeOption;
  onLanguageChange: (language: SupportedLanguage) => void;
  onThemeChange: (theme: ThemeOption) => void;
}

const THEMES: { id: ThemeOption; icon: LucideIcon; key: string }[] = [
  { id: 'dark', icon: Moon, key: 'welcome.theme.dark' },
  { id: 'light', icon: Sun, key: 'welcome.theme.light' },
  { id: 'system', icon: Monitor, key: 'welcome.theme.system' },
];

const optionClass = (active: boolean) =>
  `relative flex items-center gap-3 p-3 rounded-xl border backdrop-blur-md transition-all duration-300 cursor-pointer ${FOCUS_RING} ${
    active
      ? 'border-amber-500/70 bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.3)]'
      : 'border-border/60 bg-surface/30 hover:border-amber-500/40 hover:bg-surface/50'
  }`;

export default function WelcomeHero({ language, theme, onLanguageChange, onThemeChange }: WelcomeHeroProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="text-center flex flex-col items-center gap-3">
        <div className="p-3 rounded-2xl bg-gradient-to-br from-amber-400/20 to-amber-600/10 border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.3)]">
          <ShieldCheck className="w-6 h-6 text-amber-500 drop-shadow-md" aria-hidden="true" />
        </div>
        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-br from-textMain to-amber-500 bg-clip-text text-transparent">
          {t('welcome.hero.title')}
        </h2>
        <p className="text-sm sm:text-base text-textMuted max-w-md">{t('welcome.hero.subtitle')}</p>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-xs font-bold uppercase tracking-widest text-textMuted mb-2">{t('welcome.languageLabel')}</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label={t('welcome.languageLabel')}>
          {SUPPORTED_LANGUAGES.map(({ code, label }) => {
            const active = language === code;
            return (
              <button
                key={code}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onLanguageChange(normalizeLanguage(code))}
                className={optionClass(active)}
              >
                <span className={`text-sm font-semibold truncate ${active ? 'text-amber-500' : 'text-textMain'}`}>{label}</span>
                {active && <CheckCircle2 className="w-5 h-5 ml-auto shrink-0 text-amber-500" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-xs font-bold uppercase tracking-widest text-textMuted mb-2">{t('welcome.theme.label')}</legend>
        <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label={t('welcome.theme.label')}>
          {THEMES.map(({ id, icon: Icon, key }) => {
            const active = theme === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onThemeChange(id)}
                className={`${optionClass(active)} flex-col justify-center py-4 gap-2`}
              >
                <Icon className={`w-6 h-6 ${active ? 'text-amber-500' : 'text-textMuted'}`} aria-hidden="true" />
                <span className={`text-xs font-bold whitespace-nowrap ${active ? 'text-amber-500' : 'text-textMain'}`}>{t(key)}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
