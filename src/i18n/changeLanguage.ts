import { invoke, isTauri } from '@tauri-apps/api/core';
import i18n from './index';
import { normalizeLanguage, type SupportedLanguage } from './languages';

// Aplica o idioma na UI imediatamente (reativo) e persiste no SQLite.
export async function setAppLanguage(language: string): Promise<SupportedLanguage> {
  const next = normalizeLanguage(language);
  await i18n.changeLanguage(next);

  if (isTauri()) {
    await invoke('update_settings', { payload: { language: next } });
  }
  return next;
}
