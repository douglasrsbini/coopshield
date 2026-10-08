export const DEFAULT_ACCENT_COLOR = '#F59E0B';

export const ACCENT_PRESETS = [
  { label: 'Âmbar', value: DEFAULT_ACCENT_COLOR },
  { label: 'Azul Cobalto', value: '#2563EB' },
  { label: 'Esmeralda', value: '#10B981' },
  { label: 'Roxo Profundo', value: '#7C3AED' },
] as const;

const LEGACY_ACCENT_COLORS = new Set(['#3B82F6', '#06B6D4', '#00AE9D']);

export function normalizeAccentColor(color: string | null | undefined): string {
  if (!color || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
    return DEFAULT_ACCENT_COLOR;
  }

  const normalizedColor = color.toUpperCase();
  return LEGACY_ACCENT_COLORS.has(normalizedColor)
    ? DEFAULT_ACCENT_COLOR
    : normalizedColor;
}

export function hexToRgbChannels(hex: string): string {
  const normalizedHex = normalizeAccentColor(hex);
  const red = parseInt(normalizedHex.slice(1, 3), 16);
  const green = parseInt(normalizedHex.slice(3, 5), 16);
  const blue = parseInt(normalizedHex.slice(5, 7), 16);
  return `${red} ${green} ${blue}`;
}
