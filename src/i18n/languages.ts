export const SUPPORTED_LANGUAGES = [
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'pt-PT', label: 'Português (Portugal)' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'es-ES', label: 'Español' },
  { code: 'fr-FR', label: 'Français' },
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]['code'];

export const DEFAULT_LANGUAGE: SupportedLanguage = 'pt-BR';

export function normalizeLanguage(language: string | null | undefined): SupportedLanguage {
  return SUPPORTED_LANGUAGES.find(({ code }) => code === language)?.code ?? DEFAULT_LANGUAGE;
}
