import { Outlet, NavLink } from 'react-router-dom';
import { LayoutDashboard, Layers, Cloud, ShieldCheck, Settings, RefreshCw, Activity, HardDriveDownload, PanelLeftClose, PanelLeftOpen, Bell, CheckCircle2, AlertCircle, Info, Check, Trash2, X } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

const hexToRgb = (hex: string) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r} ${g} ${b}`;
};

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
  const [activeTasks, setActiveTasks] = useState<Record<number, { progress: number, status: string }>>({});
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
          if (settings.accent_color) root.style.setProperty('--primary', hexToRgb(settings.accent_color));
          if (settings.ui_scale) root.style.fontSize = `${settings.ui_scale}px`;
          
          setClientLogo(settings.client_logo || null);
          setClientName(settings.client_name || null);

          if (settings.theme === 'light') {
            root.style.setProperty('--background', '249 250 251');
            root.style.setProperty('--surface', '255 255 255');
            root.style.setProperty('--border', '209 213 219');
            root.style.setProperty('--text-main', '15 23 42');
            root.style.setProperty('--text-muted', '55 65 81');
          } else {
            root.style.setProperty('--background', '15 17 21');
            root.style.setProperty('--surface', '22 25 32');
            root.style.setProperty('--border', '30 41 59');
            root.style.setProperty('--text-main', '248 250 252');
            root.style.setProperty('--text-muted', '148 163 184');
          }
        }
        invoke('close_splashscreen').catch(e => console.error("Falha ao fechar splash:", e));
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

    listen<{ routine_id: number; progress: number; status: string }>('backup-progress', (event) => {
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

  const mainNavItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/rotinas', label: 'Rotinas de Backup', icon: Layers },
    { path: '/nuvem', label: 'Cofres Cloud', icon: Cloud },
    { path: '/restauro', label: 'Restaurar Backup', icon: HardDriveDownload },
    { path: '/auditoria', label: 'Auditoria de Sistema', icon: ShieldCheck },
  ];

  const taskCount = Object.keys(activeTasks).length;
  const restoreCount = Object.keys(activeRestores).length;
  const totalTasks = taskCount + restoreCount;

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const filteredNotifications = notifTab === 'unread' ? notifications.filter(n => !n.is_read) : notifications;

  return (
    <div className="flex h-screen bg-background text-textMain overflow-hidden font-sans transition-colors duration-500 print:h-auto print:overflow-visible print:bg-white print:text-black">
      
      {/* MENU LATERAL COM LARGURA AMPLIADA (w-80) */}
      <aside className={`bg-surface border-r border-border flex flex-col shadow-xl z-10 transition-all duration-300 print:hidden relative ${isCollapsed ? 'w-20' : 'w-80'}`}>
        
        {/* WORKSPACE HEADER (SEM A SETA) */}
        <div className="p-3 border-b border-border/50 shrink-0 flex items-center justify-between h-20 transition-all">
          {isCollapsed ? (
            <div className="w-full flex items-center justify-center group relative cursor-pointer" onClick={() => setIsCollapsed(false)}>
              <div className="w-10 h-10 rounded-[10px] overflow-hidden bg-background border border-border flex items-center justify-center shadow-sm group-hover:opacity-0 transition-opacity absolute">
                {clientLogo ? (
                  <img src={clientLogo} alt="Workspace" className="w-full h-full object-cover" />
                ) : (
                  <img src="/logo.png" alt="CoopShield" className="w-6 h-6 object-contain" />
                )}
              </div>
              <div className="w-10 h-10 rounded-[10px] bg-background border border-primary/40 flex items-center justify-center text-primary opacity-0 group-hover:opacity-100 transition-opacity shadow-sm absolute">
                <PanelLeftOpen size={20} />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full gap-2 min-w-0 px-1">
              <div className="flex items-center p-1.5 rounded-lg min-w-0 flex-1">
                <div className="w-9 h-9 rounded-[10px] overflow-hidden shrink-0 bg-background border border-border flex items-center justify-center mr-3 shadow-sm">
                  {clientLogo ? (
                    <img src={clientLogo} alt="Workspace" className="w-full h-full object-cover" />
                  ) : (
                    <img src="/logo.png" alt="CoopShield" className="w-5 h-5 object-contain" />
                  )}
                </div>
                
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-[14px] font-bold tracking-tight text-textMain truncate leading-tight">
                    {clientName || 'CoopShield'}
                  </span>
                  <span className="text-[10px] text-textMuted font-bold uppercase tracking-widest flex items-center mt-0.5 truncate">
                    {clientName ? 'Workspace Local' : 'Console Local'}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setIsCollapsed(true)}
                title="Fechar barra lateral"
                className="p-2.5 rounded-xl text-textMuted hover:bg-black/5 dark:hover:bg-white/5 hover:text-textMain transition-all cursor-pointer shrink-0 border border-border/40 bg-surface shadow-xs flex items-center justify-center"
              >
                <PanelLeftClose size={20} />
              </button>
            </div>
          )}
        </div>
        
        {/* NAVEGAÇÃO */}
        <nav className="flex-1 px-3 py-6 space-y-2 overflow-y-auto">
          {mainNavItems.map((item) => (
            <NavLink 
              key={item.path} 
              to={item.path} 
              title={isCollapsed ? item.label : undefined}
              className={({ isActive }) => `flex items-center px-4 py-3 rounded-lg transition-all duration-300 ${isActive ? 'bg-primary/10 text-primary border border-primary/20 shadow-sm' : 'text-textMuted hover:bg-black/5 dark:hover:bg-white/5 hover:text-textMain'} ${isCollapsed ? 'justify-center px-0' : ''}`}
            >
              <item.icon size={20} className={`${isCollapsed ? '' : 'mr-3'} shrink-0`} />
              {!isCollapsed && <span className="font-medium truncate">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* WATERMARK DO SISTEMA */}
        {!isCollapsed && clientName && (
          <div className="px-6 pt-2 pb-2 text-[9px] text-textMuted/40 uppercase font-bold tracking-widest flex items-center justify-center shrink-0">
            Powered by CoopShield
          </div>
        )}

        {/* RODAPÉ (Configurações) */}
        <div className="p-3 border-t border-border/50 shrink-0 bg-surface transition-colors duration-500">
          <NavLink 
            to="/configuracoes" 
            title={isCollapsed ? 'Configurações' : undefined}
            className={({ isActive }) => `flex items-center px-4 py-3 rounded-lg transition-all duration-300 ${isActive ? 'bg-primary/10 text-primary border border-primary/20 shadow-sm' : 'text-textMuted hover:bg-black/5 dark:hover:bg-white/5 hover:text-textMain'} ${isCollapsed ? 'justify-center px-0' : ''}`}
          >
            <Settings size={20} className={`${isCollapsed ? '' : 'mr-3'} shrink-0`} />
            {!isCollapsed && <span className="font-medium truncate">Configurações</span>}
          </NavLink>
        </div>
      </aside>

      {/* ÁREA PRINCIPAL */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative print:h-auto print:overflow-visible print:block">
        
        {/* HEADER COM A CENTRAL DE NOTIFICAÇÕES (SININHO) */}
        <header className="h-20 bg-background border-b border-border/50 flex items-center justify-between px-8 shrink-0 transition-colors duration-500 print:hidden relative">
          <h2 className="text-xs font-semibold text-textMuted uppercase tracking-[0.2em] truncate mr-4">
            {clientName ? `Painel de Gerenciamento - ${clientName}` : 'Console de Gerenciamento Local'}
          </h2>
          
          <div className="flex items-center space-x-4">
            {totalTasks > 0 && (
              <div className="flex items-center bg-primary/10 border border-primary/20 text-primary px-4 py-1.5 rounded-full text-xs font-bold animate-in fade-in slide-in-from-top-4 shadow-md shadow-primary/5 whitespace-nowrap">
                <RefreshCw size={14} className="mr-2 animate-spin shrink-0" />
                <span className="mr-2">{totalTasks} Processo(s) em Background</span>
                <Activity size={14} className="animate-pulse shrink-0" />
              </div>
            )}

            {/* BOTÃO DO SININHO (CENTRAL DE NOTIFICAÇÕES) */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowNotifDropdown(!showNotifDropdown)}
                className="relative p-2.5 rounded-xl border border-border bg-surface text-textMuted hover:text-textMain hover:border-primary/50 transition-all cursor-pointer shadow-xs flex items-center justify-center"
                title="Central de Notificações"
              >
                <Bell size={20} />
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
                      <h3 className="text-sm font-bold text-textMain">Notificações</h3>
                    </div>
                    <button onClick={() => setShowNotifDropdown(false)} className="text-textMuted hover:text-textMain"><X size={16} /></button>
                  </div>

                  {/* Abas: Não lidas / Todas */}
                  <div className="flex border-b border-border bg-background/50 p-1.5 text-xs font-bold">
                    <button
                      onClick={() => setNotifTab('unread')}
                      className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${notifTab === 'unread' ? 'bg-surface text-primary shadow-xs border border-border/50' : 'text-textMuted hover:text-textMain'}`}
                    >
                      Não lidas ({unreadCount})
                    </button>
                    <button
                      onClick={() => setNotifTab('all')}
                      className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${notifTab === 'all' ? 'bg-surface text-primary shadow-xs border border-border/50' : 'text-textMuted hover:text-textMain'}`}
                    >
                      Todas ({notifications.length})
                    </button>
                  </div>

                  {/* Lista de Notificações */}
                  <div className="max-h-80 overflow-y-auto divide-y divide-border/50">
                    {filteredNotifications.length === 0 ? (
                      <div className="p-8 text-center text-textMuted text-xs font-medium">
                        Nenhuma notificação por aqui.
                      </div>
                    ) : (
                      filteredNotifications.map(notif => (
                        <div key={notif.id} className={`p-3.5 transition-colors hover:bg-black/5 dark:hover:bg-white/5 flex items-start space-x-3 ${!notif.is_read ? 'bg-primary/5' : ''}`}>
                          <div className="shrink-0 mt-0.5">
                            {notif.type_str === 'success' && <CheckCircle2 size={16} className="text-green-500" />}
                            {notif.type_str === 'error' && <AlertCircle size={16} className="text-red-500" />}
                            {notif.type_str === 'warning' && <AlertCircle size={16} className="text-amber-500" />}
                            {notif.type_str === 'info' && <Info size={16} className="text-blue-500" />}
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
                      className="text-primary font-bold hover:underline cursor-pointer flex items-center"
                    >
                      <Check size={14} className="mr-1" /> Definir todas como lidas
                    </button>
                  </div>

                </div>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-8 print:p-0 print:overflow-visible">
          <Outlet context={{ 
            activeTasks, 
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