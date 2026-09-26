import { useState, useEffect } from 'react';
import { ShieldCheck, HardDrive, Clock, Activity, Server, FileLock2, CheckCircle2, AlertTriangle, ArrowUpRight } from 'lucide-react';

export default function Dashboard() {
  const [isLoading, setIsLoading] = useState(true);

  // Simulação de carregamento para efeito visual
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 800);
    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-textMuted font-medium animate-pulse">A carregar telemetria do motor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-700 max-w-[1600px] mx-auto">
      
      {/* Cabeçalho do Dashboard */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold mb-2 tracking-tight">Visão Geral</h1>
          <p className="text-sm text-textMuted">Telemetria, saúde dos cofres e métricas de proteção Kopher Shield.</p>
        </div>
        <div className="flex items-center space-x-2 bg-green-500/10 text-green-500 px-4 py-2 rounded-lg border border-green-500/20">
          <ShieldCheck size={18} />
          <span className="text-sm font-bold uppercase tracking-wider">Sistema Blindado</span>
        </div>
      </div>

      {/* Grelha de Métricas Principais (Cards) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        <div className="bg-surface border border-border rounded-xl p-6 hover:border-primary/40 transition-all shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <div className="bg-primary/10 p-3 rounded-lg text-primary">
              <FileLock2 size={24} />
            </div>
            <span className="text-xs font-bold text-green-400 bg-green-400/10 px-2 py-1 rounded flex items-center">
              <ArrowUpRight size={14} className="mr-1" /> +12%
            </span>
          </div>
          <div>
            <h3 className="text-3xl font-bold text-white mb-1">13.492</h3>
            <p className="text-sm text-textMuted font-medium uppercase tracking-wider">Arquivos Protegidos</p>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-xl p-6 hover:border-primary/40 transition-all shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <div className="bg-blue-500/10 p-3 rounded-lg text-blue-400">
              <Server size={24} />
            </div>
          </div>
          <div>
            <h3 className="text-3xl font-bold text-white mb-1">3</h3>
            <p className="text-sm text-textMuted font-medium uppercase tracking-wider">Cofres Ativos</p>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-xl p-6 hover:border-primary/40 transition-all shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <div className="bg-emerald-500/10 p-3 rounded-lg text-emerald-400">
              <Activity size={24} />
            </div>
          </div>
          <div>
            <h3 className="text-3xl font-bold text-white mb-1">99.9%</h3>
            <p className="text-sm text-textMuted font-medium uppercase tracking-wider">Taxa de Sucesso</p>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-xl p-6 hover:border-primary/40 transition-all shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start mb-4">
            <div className="bg-amber-500/10 p-3 rounded-lg text-amber-400">
              <Clock size={24} />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-bold text-white mb-2 truncate">Hoje, 15:33</h3>
            <p className="text-sm text-textMuted font-medium uppercase tracking-wider">Última Execução</p>
          </div>
        </div>

      </div>

      {/* Secção Secundária: Gráfico Simulado & Feed de Atividades */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Painel de Volume de Dados (Ocupa 2 colunas) */}
        <div className="lg:col-span-2 bg-surface border border-border rounded-xl p-6 flex flex-col">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-lg font-bold flex items-center">
              <HardDrive size={18} className="mr-2 text-primary" />
              Volume de Dados Processados (Últimos 7 dias)
            </h2>
          </div>
          
          {/* Gráfico de Barras feito com CSS puro (Tailwind) */}
          <div className="flex-1 flex items-end justify-between space-x-2 pt-4 border-b border-border/50 pb-2 relative">
            {/* Linhas de fundo do gráfico */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-2">
              <div className="w-full border-t border-border/30 h-0"></div>
              <div className="w-full border-t border-border/30 h-0"></div>
              <div className="w-full border-t border-border/30 h-0"></div>
              <div className="w-full border-t border-border/30 h-0"></div>
            </div>

            {/* Barras */}
            {[40, 65, 30, 85, 55, 45, 90].map((height, i) => (
              <div key={i} className="w-full flex flex-col items-center group z-10">
                <div 
                  className="w-full max-w-[3rem] bg-primary/20 hover:bg-primary border border-primary/50 rounded-t-sm transition-all duration-500 relative"
                  style={{ height: `${height}%` }}
                >
                  {/* Tooltip invisível até passar o rato */}
                  <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-black text-xs font-bold px-2 py-1 rounded transition-opacity">
                    {height * 12} MB
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* Legendas do Eixo X */}
          <div className="flex justify-between text-xs text-textMuted mt-4 font-medium uppercase">
            <span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span><span>Dom</span>
          </div>
        </div>

        {/* Painel de Logs de Atividade (Ocupa 1 coluna) */}
        <div className="bg-surface border border-border rounded-xl p-6 flex flex-col">
          <h2 className="text-lg font-bold flex items-center mb-6">
            <Activity size={18} className="mr-2 text-blue-400" />
            Auditoria Recente
          </h2>
          
          <div className="flex-1 overflow-y-auto pr-2 space-y-6">
            
            {/* Item do Feed */}
            <div className="flex relative">
              <div className="w-px h-full bg-border absolute left-[11px] top-6"></div>
              <div className="bg-green-500/20 text-green-400 rounded-full p-1 z-10 shrink-0 self-start mr-4 border border-green-500/30">
                <CheckCircle2 size={14} />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-white">Rotina "Teste" concluída</span>
                <span className="text-xs text-textMuted mt-0.5">Destino: Servidor Local NAS</span>
                <span className="text-xs text-gray-500 mt-2 flex items-center"><Clock size={10} className="mr-1" /> Hoje, 15:33</span>
              </div>
            </div>

            <div className="flex relative">
              <div className="w-px h-full bg-border absolute left-[11px] top-6"></div>
              <div className="bg-amber-500/20 text-amber-400 rounded-full p-1 z-10 shrink-0 self-start mr-4 border border-amber-500/30">
                <AlertTriangle size={14} />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-white">Chave AES-256 Rotacionada</span>
                <span className="text-xs text-textMuted mt-0.5">Renovação automática de segurança.</span>
                <span className="text-xs text-gray-500 mt-2 flex items-center"><Clock size={10} className="mr-1" /> Hoje, 08:00</span>
              </div>
            </div>

            <div className="flex relative">
              <div className="bg-blue-500/20 text-blue-400 rounded-full p-1 z-10 shrink-0 self-start mr-4 border border-blue-500/30">
                <Server size={14} />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-white">Novo Cofre Adicionado</span>
                <span className="text-xs text-textMuted mt-0.5">AWS S3 (São Paulo) registado.</span>
                <span className="text-xs text-gray-500 mt-2 flex items-center"><Clock size={10} className="mr-1" /> Ontem, 14:20</span>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}