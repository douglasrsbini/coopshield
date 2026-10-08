import { Outlet } from 'react-router-dom';
import { RefreshCw, Activity, Bell, CheckCircle2, AlertCircle, Info, Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Sidebar from './Sidebar';
import { useEffect, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import OnboardingTour from '../ui/OnboardingTour';
import { hexToRgbChannels, normalizeAccentColor } from '../../theme';

interface BackupManifest { 
  name: string; path: string; status: string; 
  date_formatted: string; original_source: string; total_files: number; 
}

interface SystemNotification {
  id: number;
  title: string;
  message: string;
  type_str: string; 
  is_read: boolean;
  created_at: string;
}

export default function AppLayout() {
  const { t } = useTranslation();
  const [activeTasks, setActiveTasks] = useState<Record<number, { progress: number, status: string }>>({});
  const [failedRuns, setFailedRuns] = useState<Record<number, string>>({});
  const [activeRestores, setActiveRestores] = useState<Record<string, { progress: number, status: string }>>({});
  
  const [restoreVaultPath, setRestoreVaultPath] = useState<string>('');
  const [restoreManifests, setRestoreManifests] = useState<BackupManifest[]>([]);
  
  const [clientLogo, setClientLogo] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);

  const [isCollapsed, setIsCollapsed] = useState(false);

  // Estados da Central de Notificações (Sininho)
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const [notifTab, setNotifTab] = useState<'unread' | 'all'>('unread');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadInitialData() {
      try {
        const settings = await invoke<Record<string, string>>('get_all_settings');
        if (settings) {
          const root = document.documentElement;
          if (settings.accent_color) {
            root.style.setProperty('--primary', hexToRgbChannels(normalizeAccentColor(settings.accent_color)));
          }
          if (settings.ui_scale) root.style.fontSize = `${settings.ui_scale}px`;
          
          setClientLogo(settings.client_logo || null);
          setClientName(settings.client_name || null);

          if (settings.theme === 'light') {
            root.style.setProperty('--background', '248 250 252');
            root.style.setProperty('--surface', '255 255 255');
            root.style.setProperty('--border', '226 232 240');
            root.style.setProperty('--text-main', '15 23 42');
            root.style.setProperty('--text-muted', '55 65 81');
          } else {
            root.style.setProperty('--background', '2 6 23');
            root.style.setProperty('--surface', '15 23 42');
            root.style.setProperty('--border', '30 41 59');
            root.style.setProperty('--text-main', '248 250 252');
            root.style.setProperty('--text-muted', '148 163 184');
          }
        }
        fetchNotifications();
      } catch (e) { console.error('Erro ao arrancar sistema:', e); }
    }
    
    loadInitialData();
    
    const handleSettingsUpdate = () => loadInitialData();
    window.addEventListener('coopshield-settings-updated', handleSettingsUpdate);

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowNotifDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);

    let unlistenProg: () => void;
    let unlistenComp: () => void;
    let unlistenRestProg: () => void;
    let unlistenRestComp: () => void;

    let unlistenFail: () => void;

    listen<{ routine_id: number; reason: string }>('backup-failed', (event) => {
      setFailedRuns(prev => ({ ...prev, [event.payload.routine_id]: event.payload.reason }));
    }).then(f => unlistenFail = f);

    listen<{ routine_id: number; progress: number; status: string }>('backup-progress', (event) => {
      setFailedRuns(prev => {
        if (!(event.payload.routine_id in prev)) return prev;
        const next = { ...prev };
        delete next[event.payload.routine_id];
        return next;
      });
      setActiveTasks(prev => ({
        ...prev,
        [event.payload.routine_id]: { progress: event.payload.progress, status: event.payload.status }
      }));
    }).then(f => unlistenProg = f);

    listen<{ routine_id: number }>('backup-complete', (event) => {
      setActiveTasks(prev => {
        const next = { ...prev };
        delete next[event.payload.routine_id];
        return next;
      });
      fetchNotifications();
    }).then(f => unlistenComp = f);

    listen<{ manifest_path: string; progress: number; status: string }>('restore-progress', (event) => {
      setActiveRestores(prev => ({
        ...prev,
        [event.payload.manifest_path]: { progress: event.payload.progress, status: event.payload.status }
      }));
    }).then(f => unlistenRestProg = f);

    listen<{ manifest_path: string }>('restore-complete', (event) => {
      setActiveRestores(prev => {
        const next = { ...prev };
        delete next[event.payload.manifest_path];
        return next;
      });
      fetchNotifications();
    }).then(f => unlistenRestComp = f);

    return () => {
      window.removeEventListener('coopshield-settings-updated', handleSettingsUpdate);
      document.removeEventListener('mousedown', handleClickOutside);
      if (unlistenProg) unlistenProg();
      if (unlistenComp) unlistenComp();
      if (unlistenFail) unlistenFail();
      if (unlistenRestProg) unlistenRestProg();
      if (unlistenRestComp) unlistenRestComp();
    };
  }, []);

  const fetchNotifications = async () => {
    try {
      const data = await invoke<SystemNotification[]>('get_system_notifications');
      setNotifications(data || []);
    } catch (e) {
      console.error("Erro ao buscar notificações:", e);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await invoke('mark_notifications_as_read');
      fetchNotifications();
    } catch (e) {
      console.error("Erro ao marcar notificações:", e);
    }
  };



  const taskCount = Object.keys(activeTasks).length;
  const restoreCount = Object.keys(activeRestores).length;
  const totalTasks = taskCount + restoreCount;

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const filteredNotifications = notifTab === 'unread' ? notifications.filter(n => !n.is_read) : notifications;

  return (
    <div className="flex h-screen bg-background text-textMain overflow-hidden font-sans transition-colors duration-500 print:h-auto print:overflow-visible print:bg-white print:text-black">
      
      {/* TOUR INTERATIVO DE ONBOARDING */}
      <OnboardingTour />
      
      <Sidebar isCollapsed={isCollapsed} onToggle={() => setIsCollapsed(v => !v)} clientName={clientName} clientLogo={clientLogo} />

      {/* ÁREA PRINCIPAL */}
      <main className="flex-1 min-w-0 min-h-0 flex flex-col h-screen overflow-hidden relative print:h-auto print:overflow-visible print:block">
        
        {/* HEADER COM A CENTRAL DE NOTIFICAÇÕES (SININHO) */}
        <header className="h-20 bg-background border-b border-border/50 flex items-center justify-between px-8 shrink-0 transition-colors duration-500 print:hidden relative">
          <h2 className="text-xs font-semibold text-textMuted uppercase tracking-[0.2em] truncate mr-4">
            {clientName ? t('header.managementPanel', { name: clientName }) : t('header.localConsole')}
          </h2>
          
          <div className="flex items-center space-x-4">
            {totalTasks > 0 && (
              <div className="flex items-center bg-primary/10 border border-primary/20 text-primary px-4 py-1.5 rounded-full text-xs font-bold animate-in fade-in slide-in-from-top-4 shadow-md shadow-primary/5 whitespace-nowrap">
                <RefreshCw size={14} className="mr-2 animate-spin shrink-0" />
                <span className="mr-2">{t('header.backgroundProcesses', { count: totalTasks })}</span>
                <Activity size={14} className="animate-pulse shrink-0" />
              </div>
            )}

            {/* BOTÃO DO SININHO (CENTRAL DE NOTIFICAÇÕES) */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowNotifDropdown(!showNotifDropdown)}
                aria-label={t('notifications.center')}
                aria-haspopup="true"
                aria-expanded={showNotifDropdown}
                className="relative p-2.5 rounded-xl border border-border bg-surface text-textMuted hover:text-textMain hover:border-primary/50 transition-all duration-300 cursor-pointer shadow-xs flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                title={t('notifications.center')}
              >
                <Bell className="w-6 h-6" aria-hidden="true" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center shadow-md animate-pulse">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* DROPDOWN FLUTUANTE DA CENTRAL DE NOTIFICAÇÕES */}
              {showNotifDropdown && (
                <div className="absolute right-0 mt-3 w-96 bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200">
                  
                  {/* Cabeçalho do Dropdown */}
                  <div className="p-4 border-b border-border flex items-center justify-between bg-black/5 dark:bg-white/5">
                    <div className="flex items-center space-x-2">
                      <Bell size={18} className="text-primary" />
                      <h3 className="text-sm font-bold text-textMain">{t('notifications.title')}</h3>
                    </div>
                    <button onClick={() => setShowNotifDropdown(false)} aria-label={t('common.actions.close')} className="p-1 rounded-md text-textMuted hover:text-textMain transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"><X className="w-5 h-5" aria-hidden="true" /></button>
                  </div>

                  {/* Abas: Não lidas / Todas */}
                  <div className="flex border-b border-border bg-background/50 p-1.5 text-xs font-bold">
                    <button
                      onClick={() => setNotifTab('unread')}
                      className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${notifTab === 'unread' ? 'bg-surface text-primary shadow-xs border border-border/50' : 'text-textMuted hover:text-textMain'}`}
                    >
                      {t('notifications.unread')} ({unreadCount})
                    </button>
                    <button
                      onClick={() => setNotifTab('all')}
                      className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${notifTab === 'all' ? 'bg-surface text-primary shadow-xs border border-border/50' : 'text-textMuted hover:text-textMain'}`}
                    >
                      {t('notifications.all')} ({notifications.length})
                    </button>
                  </div>

                  {/* Lista de Notificações */}
                  <div className="max-h-80 overflow-y-auto divide-y divide-border/50">
                    {filteredNotifications.length === 0 ? (
                      <div className="p-8 text-center text-textMuted text-xs font-medium">
                        {t('notifications.empty')}
                      </div>
                    ) : (
                      filteredNotifications.map(notif => (
                        <div key={notif.id} className={`p-3.5 transition-colors hover:bg-black/5 dark:hover:bg-white/5 flex items-start space-x-3 ${!notif.is_read ? 'bg-primary/5' : ''}`}>
                          <div className="shrink-0 mt-0.5">
                            {notif.type_str === 'success' && <CheckCircle2 size={16} className="text-green-500" />}
                            {notif.type_str === 'error' && <AlertCircle size={16} className="text-red-500" />}
                            {notif.type_str === 'warning' && <AlertCircle size={16} className="text-amber-500" />}
                            {notif.type_str === 'info' && <Info size={16} className="text-amber-500" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-xs font-bold text-textMain truncate">{notif.title}</h4>
                            <p className="text-[11px] text-textMuted mt-0.5 leading-relaxed">{notif.message}</p>
                            <span className="text-[9px] text-textMuted/60 mt-1 block">{notif.created_at}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Rodapé do Dropdown */}
                  <div className="p-3 border-t border-border bg-background/50 flex justify-between items-center text-xs">
                    <button
                      onClick={handleMarkAllAsRead}
                      className="text-primary font-bold hover:underline cursor-pointer flex items-center rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                    >
                      <Check className="w-4 h-4 mr-1" aria-hidden="true" /> {t('notifications.markAllRead')}
                    </button>
                  </div>

                </div>
              )}
            </div>
          </div>
        </header>

        <div data-tour="page" className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-8 pt-8 pb-8 print:p-0 print:overflow-visible">
          <Outlet context={{ 
            activeTasks, 
            failedRuns,
            activeRestores,
            restoreVaultPath,
            setRestoreVaultPath,
            restoreManifests,
            setRestoreManifests
          }} />
        </div>
      </main>
    </div>
  );
}
