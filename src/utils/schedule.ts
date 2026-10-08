export type ScheduleKind = 'daily' | 'weekdays' | 'weekly' | 'interval' | 'manual';

/** Representação neutra de idioma, persistida como JSON na coluna `schedule`. */
export interface ScheduleSpec {
  v: 1;
  kind: ScheduleKind;
  time: string; // HH:MM (âncora para interval)
  every?: number; // horas, apenas para interval
  day?: number; // 0 = domingo ... 6 = sábado, apenas para weekly
}

export const DEFAULT_SCHEDULE: ScheduleSpec = { v: 1, kind: 'daily', time: '02:00' };

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const serializeSchedule = (spec: ScheduleSpec): string => JSON.stringify(spec);

/** Converte valores gravados antes da migração (texto em PT) para a forma estruturada. */
const parseLegacy = (raw: string): ScheduleSpec => {
  const time = raw.match(/(\d{2}:\d{2})/)?.[1] ?? '00:00';
  if (/manual/i.test(raw)) return { v: 1, kind: 'manual', time };
  const every = raw.match(/A cada (\d+)\s*h/i);
  if (every && Number(every[1]) < 24) return { v: 1, kind: 'interval', every: Number(every[1]), time: raw.includes('às') ? time : '00:00' };
  if (/Dias [úu]teis/i.test(raw)) return { v: 1, kind: 'weekdays', time };
  if (/Semanal/i.test(raw)) return { v: 1, kind: 'weekly', day: 1, time };
  return { v: 1, kind: 'daily', time };
};

export const parseSchedule = (raw: string): ScheduleSpec => {
  const trimmed = (raw || '').trim();
  if (trimmed.startsWith('{')) {
    try {
      const o = JSON.parse(trimmed) as Partial<ScheduleSpec>;
      const kinds: ScheduleKind[] = ['daily', 'weekdays', 'weekly', 'interval', 'manual'];
      if (o.kind && kinds.includes(o.kind) && typeof o.time === 'string' && TIME_RE.test(o.time)) {
        return { v: 1, kind: o.kind, time: o.time, every: o.every, day: o.day };
      }
    } catch { /* cai no legado */ }
  }
  return parseLegacy(trimmed);
};

/** Próxima execução como Date puro; sem qualquer formatação ou texto localizado. */
export const getNextRun = (spec: ScheduleSpec, now: Date = new Date()): Date | null => {
  if (spec.kind === 'manual') return null;
  const [hh, mm] = spec.time.split(':').map(Number);

  if (spec.kind === 'interval') {
    const every = Math.max(1, spec.every ?? 1);
    for (let i = 0; i <= 24 * 2; i++) {
      const c = new Date(now);
      c.setMinutes(mm, 0, 0);
      c.setHours(now.getHours() + i);
      if (c > now && (((c.getHours() - hh) % every) + every) % every === 0) return c;
    }
    return null;
  }

  for (let i = 0; i < 8; i++) {
    const c = new Date(now);
    c.setDate(now.getDate() + i);
    c.setHours(hh, mm, 0, 0);
    if (c <= now) continue;
    const wd = c.getDay();
    if (spec.kind === 'weekdays' && (wd === 0 || wd === 6)) continue;
    if (spec.kind === 'weekly' && wd !== (spec.day ?? 1)) continue;
    return c;
  }
  return null;
};

export const formatDateTime = (date: Date, locale: string): string =>
  new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(date);
