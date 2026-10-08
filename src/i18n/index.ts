import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import enUS from './locales/en-US.json';
import esES from './locales/es-ES.json';
import frFR from './locales/fr-FR.json';
import ptBR from './locales/pt-BR.json';
import ptPT from './locales/pt-PT.json';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from './languages';

const resources = {
  'pt-BR': { translation: ptBR },
  'pt-PT': { translation: ptPT },
  'en-US': { translation: enUS },
  'es-ES': { translation: esES },
  'fr-FR': { translation: frFR },
} as const;

i18n.use(initReactI18next).init({
  resources,
  supportedLngs: SUPPORTED_LANGUAGES.map(({ code }) => code),
  nonExplicitSupportedLngs: false,
  load: 'currentOnly',
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: {
    escapeValue: false,
  },
  returnNull: false,
});

export default i18n;
