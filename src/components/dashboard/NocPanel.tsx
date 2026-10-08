import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { invoke } from '@tauri-apps/api/core';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, Database, Flame } from 'lucide-react';
import { FOCUS_RING } from '../../ui/tokens';

interface AuditLog { timestamp: string; level: string; message: string; }

interface NocPanelProps {
  audits: AuditLog[];
  filterStatus: string;
  onFilterChange: (status: string) => void;
}

const FILTERS = [
  { key: 'ALL', i18n: 'noc.filters.all', active: 'bg-primary/15 text-primary border-primary/50 shadow-[0_0_15px_rgba(245,158,11,0.35)]' },
  { key: 'SUCCESS', i18n: 'noc.filters.success', active: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.35)]' },
  { key: 'WARNING', i18n: 'noc.filters.warning', active: 'bg-amber-500/15 text-amber-500 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.35)]' },
  { key: 'ERROR', i18n: 'noc.filters.error', active: 'bg-red-500/15 text-red-500 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.35)]' },
] as const;

const DAYS = 14;
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const parseTs = (ts: string): Date | null => {
  const d = new Date(ts.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
};

export default function NocPanel({ audits, filterStatus, onFilterChange }: NocPanelProps) {
  const { t, i18n } = useTranslation();
  const [dbReady, setDbReady] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    invoke<boolean>('get_system_ready')
      .then(ok => { if (alive) setDbReady(ok); })
      .catch(() => { if (alive) setDbReady(false); });
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(
    () => audits.filter(a => filterStatus === 'ALL' || a.level === filterStatus),
    [audits, filterStatus],
  );

  const series = useMemo(() => {
    const today = new Date();
    const buckets = new Map<string, { label: string; events: number; errors: number }>();
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      buckets.set(dayKey(d), { label: d.toLocaleDateString(i18n.language, { day: '2-digit', month: '2-digit' }), events: 0, errors: 0 });
    }
    for (const a of filtered) {
      const d = parseTs(a.timestamp);
      const b = d && buckets.get(dayKey(d));
      if (b) { b.events += 1; if (a.level === 'ERROR') b.errors += 1; }
    }
    return Array.from(buckets.values());
  }, [filtered, i18n.language]);

  const heat = useMemo(() => {
    const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
    for (const a of filtered) {
      const d = parseTs(a.timestamp);
      if (d) grid[d.getDay()][d.getHours()] += 1;
    }
    const max = Math.max(1, ...grid.flat());
    return { grid, max };
  }, [filtered]);

  const weekdayLabels = useMemo(() => {
    const base = new Date(2024, 0, 7); // domingo
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d.toLocaleDateString(i18n.language, { weekday: 'short' });
    });
  }, [i18n.language]);

  const total = filtered.length;
  const errors = filtered.filter(a => a.level === 'ERROR').length;
  const successRate = total === 0 ? 100 : Math.round(((total - errors) / total) * 100);

  return (
    <section aria-label={t('noc.title')} className="flex flex-col gap-4 xl:gap-6 shrink-0 print:hidden">
      <div role="group" aria-label={t('noc.filtersLabel')} className="flex flex-wrap items-center gap-2">
        {FILTERS.map(f => {
          const isActive = filterStatus === f.key;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={isActive}
              onClick={() => onFilterChange(f.key)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider text-center whitespace-normal break-words border transition-all duration-300 cursor-pointer ${FOCUS_RING} ${isActive ? f.active : 'bg-surface/60 text-textMuted border-border hover:text-textMain hover:border-primary/40'}`}
            >
              {t(f.i18n)}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 xl:gap-6">
        <div className="xl:col-span-2 bg-gradient-to-br from-surface to-surface/60 backdrop-blur-xl border border-border rounded-2xl p-5 shadow-sm min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-sm font-bold text-textMain flex items-center gap-2 break-words min-w-0">
              <Activity className="w-5 h-5 text-primary" aria-hidden="true" /> {t('noc.traffic.title')}
            </h2>
            <span className="text-[11px] text-textMuted uppercase tracking-wider font-semibold break-words">{t('noc.traffic.range', { days: DAYS })}</span>
          </div>
          <div className="h-56" role="img" aria-label={t('noc.traffic.title')}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="nocEvents" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#F59E0B" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="nocErrors" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#EF4444" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#EF4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#94a3b8" strokeOpacity={0.15} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip
                  wrapperStyle={{ maxWidth: 220, zIndex: 20 }}
                  contentStyle={{ background: 'rgba(2,6,23,0.92)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 12, color: '#F8FAFC', fontSize: 12, whiteSpace: 'normal', overflowWrap: 'anywhere', width: 'auto' }}
                  labelStyle={{ color: '#F59E0B', fontWeight: 700 }}
                />
                <Area type="monotone" dataKey="events" name={t('noc.traffic.events')} stroke="#F59E0B" strokeWidth={2} fill="url(#nocEvents)" />
                <Area type="monotone" dataKey="errors" name={t('noc.traffic.errors')} stroke="#EF4444" strokeWidth={2} fill="url(#nocErrors)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-gradient-to-br from-surface to-surface/60 backdrop-blur-xl border border-border rounded-2xl p-5 shadow-sm flex flex-col gap-4 min-w-0">
          <h2 className="text-sm font-bold text-textMain flex items-center gap-2 break-words">
            <Database className="w-5 h-5 text-primary" aria-hidden="true" /> {t('noc.sqlite.title')}
          </h2>
          <div className="flex items-center gap-3">
            <span
              className={`w-3 h-3 rounded-full shrink-0 ${dbReady === null ? 'bg-slate-500 animate-pulse' : dbReady ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)] animate-pulse' : 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.9)]'}`}
              aria-hidden="true"
            />
            <span role="status" className={`text-lg font-bold break-words min-w-0 ${dbReady ? 'text-emerald-500' : dbReady === false ? 'text-red-500' : 'text-textMuted'}`}>
              {dbReady === null ? t('noc.sqlite.checking') : dbReady ? t('noc.sqlite.online') : t('noc.sqlite.offline')}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-background/60 border border-border/50 rounded-lg p-3">
              <dt className="text-textMuted uppercase tracking-wider font-semibold whitespace-normal break-words">{t('noc.sqlite.events')}</dt>
              <dd className="text-xl font-bold text-textMain mt-1">{total.toLocaleString(i18n.language)}</dd>
            </div>
            <div className="bg-background/60 border border-border/50 rounded-lg p-3">
              <dt className="text-textMuted uppercase tracking-wider font-semibold whitespace-normal break-words">{t('noc.sqlite.successRate')}</dt>
              <dd className={`text-xl font-bold mt-1 ${successRate >= 90 ? 'text-emerald-500' : successRate >= 70 ? 'text-amber-500' : 'text-red-500'}`}>{successRate}%</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="bg-gradient-to-br from-surface to-surface/60 backdrop-blur-xl border border-border rounded-2xl p-5 shadow-sm min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-sm font-bold text-textMain flex items-center gap-2 break-words">
            <Flame className="w-5 h-5 text-primary" aria-hidden="true" /> {t('noc.heatmap.title')}
          </h2>
          <div className="flex items-center gap-2 text-[11px] text-textMuted">
            {t('noc.heatmap.less')}
            {[0.1, 0.3, 0.55, 0.8, 1].map(o => (
              <span key={o} className="w-3 h-3 rounded-sm bg-primary" style={{ opacity: o }} aria-hidden="true" />
            ))}
            {t('noc.heatmap.more')}
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[640px] flex flex-col gap-1" role="img" aria-label={t('noc.heatmap.title')}>
            {heat.grid.map((row, d) => (
              <div key={d} className="flex items-center gap-1">
                <span className="w-9 shrink-0 text-[10px] text-textMuted uppercase whitespace-nowrap overflow-hidden text-ellipsis">{weekdayLabels[d]}</span>
                {row.map((count, h) => (
                  <div
                    key={h}
                    title={t('noc.heatmap.cell', { day: weekdayLabels[d], hour: String(h).padStart(2, '0'), count })}
                    className={`flex-1 h-5 rounded-sm transition-all duration-300 hover:scale-125 hover:ring-1 hover:ring-amber-400 ${count === 0 ? 'bg-border/40' : 'bg-primary'}`}
                    style={count === 0 ? undefined : { opacity: 0.15 + 0.85 * (count / heat.max) }}
                  />
                ))}
              </div>
            ))}
            <div className="flex items-center gap-1 pl-10 text-[10px] text-textMuted">
              {Array.from({ length: 24 }, (_, h) => (
                <span key={h} className="flex-1 text-center">{h % 3 === 0 ? String(h).padStart(2, '0') : ''}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
