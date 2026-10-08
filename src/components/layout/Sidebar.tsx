import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import SidebarLanguageMenu from '../ui/SidebarLanguageMenu';
import { LayoutDashboard, Layers, Cloud, ShieldCheck, Settings, HardDriveDownload, PanelLeftClose, PanelLeftOpen, LifeBuoy, type LucideIcon } from 'lucide-react';

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  clientName: string | null;
  clientLogo: string | null;
}

interface NavItem { path: string; labelKey: string; icon: LucideIcon; }

const MAIN_NAV: NavItem[] = [
  { path: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { path: '/rotinas', labelKey: 'nav.routines', icon: Layers },
  { path: '/nuvem', labelKey: 'nav.cloud', icon: Cloud },
  { path: '/restauro', labelKey: 'nav.restore', icon: HardDriveDownload },
  { path: '/auditoria', labelKey: 'nav.audit', icon: ShieldCheck },
  { path: '/suporte', labelKey: 'nav.support', icon: LifeBuoy },
];

const FOCUS_RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface';

const navLinkClass = (isActive: boolean, isCollapsed: boolean) =>
  `flex items-center gap-3 h-11 rounded-lg transition-all duration-300 ${FOCUS_RING} ${
    isCollapsed ? 'justify-center px-0' : 'px-4'
  } ${isActive
    ? 'bg-primary/10 text-primary border border-primary/20 shadow-sm'
    : 'text-textMuted border border-transparent hover:bg-black/5 dark:hover:bg-white/5 hover:text-textMain'}`;

export default function Sidebar({ isCollapsed, onToggle, clientName, clientLogo }: SidebarProps) {
  const { t } = useTranslation();

  const logo = clientLogo
    ? <img src={clientLogo} alt="" className="w-full h-full object-cover" />
    : <img src="/logo.png" alt="" className="w-5 h-5 object-contain" />;

  return (
    <aside
      aria-label={t('sidebar.ariaLabel')}
      className={`bg-surface border-r border-border flex flex-col shadow-xl z-10 transition-all duration-300 print:hidden relative ${isCollapsed ? 'w-20' : 'w-80'}`}
    >
      <div className="p-3 border-b border-border/50 shrink-0 flex items-center h-20">
        {isCollapsed ? (
          <button
            type="button"
            onClick={onToggle}
            aria-label={t('sidebar.expand')}
            title={t('sidebar.expand')}
            className={`group relative w-full h-11 flex items-center justify-center cursor-pointer rounded-xl ${FOCUS_RING}`}
          >
            <span className="absolute w-10 h-10 rounded-[10px] overflow-hidden bg-background border border-border flex items-center justify-center shadow-sm transition-opacity duration-300 group-hover:opacity-0 group-focus-visible:opacity-0">
              {logo}
            </span>
            <span className="absolute w-10 h-10 rounded-[10px] bg-background border border-primary/40 flex items-center justify-center text-primary opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
              <PanelLeftOpen className="w-5 h-5" aria-hidden="true" />
            </span>
          </button>
        ) : (
          <div className="flex items-center justify-between w-full gap-4 min-w-0 px-1">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-[10px] overflow-hidden shrink-0 bg-background border border-border flex items-center justify-center shadow-sm">
                {logo}
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-bold tracking-tight text-textMain truncate leading-tight">
                  {clientName || t('app.name')}
                </span>
                <span className="text-[10px] text-textMuted font-bold uppercase tracking-widest truncate mt-0.5">
                  {clientName ? t('sidebar.workspaceLocal') : t('sidebar.consoleLocal')}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onToggle}
              aria-label={t('sidebar.collapse')}
              title={t('sidebar.collapse')}
              className={`p-2.5 rounded-xl text-textMuted hover:bg-black/5 dark:hover:bg-white/5 hover:text-textMain transition-all duration-300 cursor-pointer shrink-0 border border-border/40 bg-surface flex items-center justify-center ${FOCUS_RING}`}
            >
              <PanelLeftClose className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      <nav aria-label={t('sidebar.mainNavigation')} className="flex-1 flex flex-col gap-2 px-3 py-6 overflow-y-auto">
        {MAIN_NAV.map(({ path, labelKey, icon: Icon }) => {
          const label = t(labelKey);
          return (
            <NavLink
              key={path}
              to={path}
              data-tour={`nav-${path}`}
              end={path === '/'}
              title={isCollapsed ? label : undefined}
              aria-label={isCollapsed ? label : undefined}
              className={({ isActive }) => navLinkClass(isActive, isCollapsed)}
            >
              <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
              {!isCollapsed && <span className="font-medium truncate whitespace-nowrap">{label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {!isCollapsed && clientName && (
        <div className="px-6 py-2 text-[9px] text-textMuted/40 uppercase font-bold tracking-widest flex items-center justify-center shrink-0">
          {t('sidebar.poweredBy')}
        </div>
      )}

      <div className="p-3 border-t border-border/50 shrink-0 bg-surface flex flex-col gap-2">
        <SidebarLanguageMenu isCollapsed={isCollapsed} />
        <NavLink
          to="/configuracoes"
          title={isCollapsed ? t('nav.settings') : undefined}
          aria-label={isCollapsed ? t('nav.settings') : undefined}
          className={({ isActive }) => navLinkClass(isActive, isCollapsed)}
        >
          <Settings className="w-5 h-5 shrink-0" aria-hidden="true" />
          {!isCollapsed && <span className="font-medium truncate whitespace-nowrap">{t('nav.settings')}</span>}
        </NavLink>
      </div>
    </aside>
  );
}
