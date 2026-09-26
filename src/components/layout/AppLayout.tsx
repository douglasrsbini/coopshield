import { Outlet, NavLink } from 'react-router-dom';
import { LayoutDashboard, Layers, Cloud, ShieldAlert, ShieldCheck, Settings } from 'lucide-react';
import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

// Ferramenta que converte o Hexadecimal da Base de Dados para RGB puro do Tailwind
const hexToRgb = (hex: string) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r} ${g} ${b}`;
};

export default function AppLayout() {
  
  // MOTOR GLOBAL DE TEMAS E CORES CORPORATIVAS
  useEffect(() => {
    async function applyGlobalTheme() {
      try {
        const settings = await invoke<Record<string, string>>('get_all_settings');
        if (settings) {
          const root = document.documentElement;

          // Aplica a cor de destaque da marca (Customizada ou padrão)
          if (settings.accent_color) {
            root.style.setProperty('--primary', hexToRgb(settings.accent_color));
          }

          // Aplica o Modo Escuro ou Claro com contraste otimizado
          if (settings.theme === 'light') {
            root.style.setProperty('--background', '243 244 246'); // Fundo cinza claro
            root.style.setProperty('--surface', '255 255 255');    // Painéis brancos
            root.style.setProperty('--border', '209 213 219');     // Bordas nítidas
            root.style.setProperty('--text-main', '15 23 42');     // Texto principal quase preto
            root.style.setProperty('--text-muted', '31 41 55');    // Texto secundário em cinza escuro pesado (gray-800 - legibilidade absoluta!)
          } else {
            root.style.setProperty('--background', '15 17 21');
            root.style.setProperty('--surface', '22 25 32');
            root.style.setProperty('--border', '30 41 59');
            root.style.setProperty('--text-main', '248 250 252');
            root.style.setProperty('--text-muted', '148 163 184');
          }
        }
      } catch (e) {
        console.error('Erro ao carregar o tema global:', e);
      }
    }
    applyGlobalTheme();
  }, []);

  const mainNavItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/rotinas', label: 'Rotinas de Backup', icon: Layers },
    { path: '/nuvem', label: 'Cofres Cloud', icon: Cloud },
    { path: '/restauro', label: 'Disaster Recovery', icon: ShieldAlert },
  ];

  return (
    <div className="flex h-screen bg-background text-textMain overflow-hidden font-sans transition-colors duration-500">
      {/* Sidebar Corporativa */}
      <aside className="w-64 bg-surface border-r border-border flex flex-col shadow-xl z-10 transition-colors duration-500">
        <div className="h-20 flex items-center px-6 border-b border-border/50 shrink-0">
          <ShieldCheck className="text-primary mr-3 transition-colors duration-500" size={28} />
          <span className="text-xl font-bold tracking-wide">Kopher Shield</span>
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          {mainNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center px-4 py-3 rounded-lg transition-all duration-300 ${
                  isActive
                    ? 'bg-primary/10 text-primary border border-primary/20 shadow-sm'
                    : 'text-textMuted hover:bg-black/5 dark:hover:bg-white/5 hover:text-textMain'
                }`
              }
            >
              <item.icon size={20} className="mr-3" />
              <span className="font-medium">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Rodapé - Configurações */}
        <div className="p-4 border-t border-border/50 shrink-0 bg-surface transition-colors duration-500">
          <NavLink
            to="/configuracoes"
            className={({ isActive }) =>
              `flex items-center px-4 py-3 rounded-lg transition-all duration-300 ${
                isActive
                  ? 'bg-primary/10 text-primary border border-primary/20 shadow-sm'
                  : 'text-textMuted hover:bg-black/5 dark:hover:bg-white/5 hover:text-textMain'
              }`
            }
          >
            <Settings size={20} className="mr-3" />
            <span className="font-medium">Configurações</span>
          </NavLink>
        </div>
      </aside>

      {/* Área Dinâmica de Conteúdo */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        <header className="h-20 bg-background border-b border-border/50 flex items-center px-10 shrink-0 transition-colors duration-500">
          <h2 className="text-xs font-semibold text-textMuted uppercase tracking-[0.2em]">
            Console de Gerenciamento Local
          </h2>
        </header>
        <div className="flex-1 overflow-auto p-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}