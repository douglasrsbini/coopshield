import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Importando os dicionários
import ptBR from './locales/pt-BR.json';
import enUS from './locales/en-US.json';
import esES from './locales/es-ES.json';
import frFR from './locales/fr-FR.json';

const resources = {
  'pt-BR': { translation: ptBR },
  'en-US': { translation: enUS },
  'es-ES': { translation: esES },
  'fr-FR': { translation: frFR }
};

i18n
  .use(initReactI18next) // Conecta ao React
  .init({
    resources,
    lng: 'pt-BR', // Idioma padrão inicial
    fallbackLng: 'en-US', // Se faltar alguma tradução, mostra em inglês
    interpolation: {
      escapeValue: false // O React já protege contra XSS nativamente
    }
  });

export default i18n;