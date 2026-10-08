import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { SUPPORTED_LANGUAGES, normalizeLanguage } from '../../i18n/languages';
import { setAppLanguage } from '../../i18n/changeLanguage';

export default function LanguageSwitcher({ id = 'application-language' }: { id?: string }) {
  const { t, i18n } = useTranslation();
  const [error, setError] = useState(false);
  const current = normalizeLanguage(i18n.resolvedLanguage);

  const handleChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    setError(false);
    try {
      await setAppLanguage(event.target.value);
    } catch (e) {
      console.error('Falha ao persistir idioma:', e);
      setError(true);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="flex items-center gap-2 text-sm font-semibold text-textMain">
        <Globe className="w-5 h-5 text-primary" aria-hidden="true" />
        {t('settings.language.title')}
      </label>
      <p className="text-xs text-textMuted">{t('settings.language.description')}</p>
      <select
        id={id}
        value={current}
        onChange={handleChange}
        className="w-full max-w-md bg-surface border border-border rounded-lg px-3 py-2.5 text-sm text-textMain cursor-pointer transition-all duration-300 hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
      >
        {SUPPORTED_LANGUAGES.map(({ code, label }) => (
          <option key={code} value={code}>{label}</option>
        ))}
      </select>
      {error && <p role="alert" className="text-xs text-red-500">{t('settings.language.saveError')}</p>}
    </div>
  );
}
