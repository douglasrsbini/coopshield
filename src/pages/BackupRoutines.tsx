import { useState, useEffect } from 'react';
import { Plus, Layers, Play, Clock, FolderOpen, Cloud, X, Shield, FolderSearch, Pencil, Trash2, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { ask } from '@tauri-apps/plugin-dialog';

interface Routine {
  id?: number;
  name: string;
  source_path: string;
  destination_vault: string;
  schedule: string;
}

// Tipo para as nossas notificações flutuantes
interface Toast {
  id: number;
  title: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export default function BackupRoutines() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [executingId, setExecutingId] = useState<number | null>(null);
  
  // Estado para gerir as notificações ativas
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    source_path: '',
    destination_vault: 'S3 Brasil (Amazon Web Services)',
    schedule: 'Diariamente às 02:00'
  });

  const [scheduleType, setScheduleType] = useState('Diariamente às 02:00');
  const [customFrequency, setCustomFrequency] = useState('Diário');
  const [customTime, setCustomTime] = useState('02:00');
  const [repeatEvery, setRepeatEvery] = useState('1');

  // Função para disparar notificações bonitas na tela
  const showToast = (title: string, message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, title, message, type }]);
    // Remove a notificação automaticamente após 4 segundos
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  useEffect(() => {
    if (scheduleType === 'Personalizado') {
      if (customFrequency === 'Diário') {
        setFormData(prev => ({ ...prev, schedule: `Diário (A cada ${repeatEvery}h) às ${customTime}` }));
      } else if (customFrequency === 'Dias úteis (Seg-Sex)') {
        setFormData(prev => ({ ...prev, schedule: `Dias Úteis (Seg-Sex) às ${customTime}` }));
      } else {
        setFormData(prev => ({ ...prev, schedule: `Semanal às ${customTime}` }));
      }
    } else {
      setFormData(prev => ({ ...prev, schedule: scheduleType }));
    }
  }, [scheduleType, customFrequency, customTime, repeatEvery]);

  const handleSelectFolder = async () => {
    try {
      const path = await invoke<string>('select_folder_dialog');
      if (path) {
        setFormData(prev => ({ ...prev, source_path: path }));
      }
    } catch (error) {
      console.log("Seleção cancelada ou erro:", error);
    }
  };

  const fetchRoutines = async () => {
    try {
      const data = await invoke<Routine[]>('get_routines');
      setRoutines(data);
    } catch (error) {
      showToast('Erro de Conexão', 'Não foi possível carregar as rotinas.', 'error');
    }
  };

  useEffect(() => {
    fetchRoutines();
  }, []);

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormData({ name: '', source_path: '', destination_vault: 'S3 Brasil (Amazon Web Services)', schedule: 'Diariamente às 02:00' });
    setScheduleType('Diariamente às 02:00');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (routine: Routine) => {
    setEditingId(routine.id || null);
    setFormData({ name: routine.name, source_path: routine.source_path, destination_vault: routine.destination_vault, schedule: routine.schedule });
    setScheduleType('Personalizado');
    setIsModalOpen(true);
  };

  const handleDeleteRoutine = async (id?: number) => {
    if (!id) return;
    
    // Mantemos o 'ask' nativo aqui porque a exclusão requer confirmação de segurança a 100%
    const confirmed = await ask("Tem certeza que deseja eliminar esta rotina de backup?", { title: 'Kopher Shield', kind: 'warning' });
    if (!confirmed) return;

    try {
      await invoke('delete_routine', { id });
      showToast('Rotina Eliminada', 'A rotina de backup foi removida com sucesso.', 'success');
      fetchRoutines();
    } catch (error) {
      showToast('Erro', `Falha ao eliminar: ${error}`, 'error');
    }
  };

  const handleSaveRoutine = async () => {
    if (!formData.name || !formData.source_path) {
      showToast('Campos Incompletos', 'Preencha o nome da rotina e selecione a pasta de origem.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      if (editingId !== null) {
        await invoke('update_routine', { routine: { id: editingId, ...formData } });
        showToast('Rotina Atualizada', 'As novas políticas foram guardadas.', 'success');
      } else {
        await invoke('add_routine', { routine: formData });
        showToast('Nova Rotina Criada', 'O agendamento foi registado com sucesso no motor.', 'success');
      }
      setIsModalOpen(false);
      fetchRoutines();
    } catch (error) {
      showToast('Erro de Gravação', `Ocorreu um erro: ${error}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExecuteRoutine = async (routine: Routine) => {
    if (!routine.id) return;
    setExecutingId(routine.id);
    
    try {
      // Avisa visualmente que o processo arrancou
      showToast('A Iniciar Motor', 'A rotina foi enviada para processamento em background.', 'info');
      
      const response = await invoke('execute_backup_routine', { 
        sourcePath: routine.source_path,
        destinationVault: routine.destination_vault
      });
      
      // O Rust retorna rapidamente dizendo que atirou para a thread
      showToast('Execução em Background', response as string, 'success');
    } catch (error) {
      console.error(error);
      showToast('Falha no Motor', `Erro ao acionar o Rust: ${error}`, 'error');
    } finally {
      setExecutingId(null);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-[1600px] mx-auto relative">
      
      {/* Container de Notificações (Toasts) flutuantes no canto inferior direito */}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col space-y-3 pointer-events-none">
        {toasts.map(toast => (
          <div key={toast.id} className={`w-80 p-4 rounded-xl shadow-2xl border flex items-start space-x-3 pointer-events-auto animate-in slide-in-from-right-8 fade-in duration-300 ${
            toast.type === 'success' ? 'bg-surface/95 border-green-500/40 backdrop-blur-sm' :
            toast.type === 'error' ? 'bg-surface/95 border-red-500/40 backdrop-blur-sm' :
            'bg-surface/95 border-blue-500/40 backdrop-blur-sm'
          }`}>
            <div className="shrink-0 mt-0.5">
              {toast.type === 'success' && <CheckCircle2 size={18} className="text-green-400" />}
              {toast.type === 'error' && <AlertCircle size={18} className="text-red-400" />}
              {toast.type === 'info' && <Info size={18} className="text-blue-400" />}
            </div>
            <div className="flex flex-col">
              <h4 className={`text-sm font-bold ${
                toast.type === 'success' ? 'text-green-400' :
                toast.type === 'error' ? 'text-red-400' :
                'text-blue-400'
              }`}>{toast.title}</h4>
              <p className="text-xs text-gray-300 mt-1 leading-relaxed">{toast.message}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold mb-2 tracking-tight">Rotinas de Backup</h1>
          <p className="text-sm text-textMuted">Gestão de políticas de proteção e agendamentos.</p>
        </div>
        <button 
          onClick={handleOpenCreate}
          className="bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-lg font-medium flex items-center transition-all shadow-lg shadow-primary/20 cursor-pointer text-sm"
        >
          <Plus size={18} className="mr-2" />
          Nova Rotina
        </button>
      </div>

      <div className="grid grid-cols-1 gap-5">
        {routines.length === 0 ? (
          <div className="bg-surface border border-border border-dashed rounded-xl p-10 text-center text-textMuted text-sm">
            Nenhuma rotina de backup configurada.
          </div>
        ) : (
          routines.map((routine) => (
            <div key={routine.id} className="bg-surface border border-border rounded-xl flex flex-col hover:border-primary/40 transition-all shadow-sm overflow-hidden">
              
              <div className="flex justify-between items-center p-4 border-b border-border/50 bg-background/30">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="bg-primary/10 p-2 rounded-lg text-primary shrink-0">
                    <Layers size={18} />
                  </div>
                  <h3 className="text-base font-bold truncate text-white">{routine.name}</h3>
                </div>
                <span className="bg-green-500/10 text-green-500 text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-full flex items-center shrink-0 ml-4">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5 animate-pulse"></div>
                  Ativo
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-5 bg-background/10">
                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] text-textMuted uppercase tracking-wider font-semibold mb-1.5 flex items-center">
                    <FolderOpen size={12} className="mr-1.5 text-primary" /> Origem
                  </span>
                  <span className="text-sm text-gray-200 truncate" title={routine.source_path}>
                    {routine.source_path}
                  </span>
                </div>

                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] text-textMuted uppercase tracking-wider font-semibold mb-1.5 flex items-center">
                    <Cloud size={12} className="mr-1.5 text-blue-400" /> Destino
                  </span>
                  <span className="text-sm text-gray-200 truncate" title={routine.destination_vault}>
                    {routine.destination_vault}
                  </span>
                </div>

                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] text-textMuted uppercase tracking-wider font-semibold mb-1.5 flex items-center">
                    <Clock size={12} className="mr-1.5 text-amber-400" /> Agendamento
                  </span>
                  <span className="text-sm text-gray-200 truncate" title={routine.schedule}>
                    {routine.schedule}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 p-3 border-t border-border/50 bg-surface">
                <button 
                  onClick={() => handleExecuteRoutine(routine)}
                  disabled={executingId === routine.id}
                  className="bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary px-4 py-1.5 rounded-md font-medium text-sm flex items-center transition-all cursor-pointer disabled:opacity-50"
                >
                  {executingId === routine.id ? (
                    <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin mr-1.5"></div>
                  ) : (
                    <Play size={14} className="mr-1.5" />
                  )}
                  {executingId === routine.id ? 'Iniciando Motor...' : 'Executar Agora'}
                </button>
                <div className="w-px h-6 bg-border/80 mx-2"></div>
                <button 
                  onClick={() => handleOpenEdit(routine)}
                  disabled={executingId === routine.id}
                  className="bg-background hover:bg-white/5 border border-border text-textMuted hover:text-white p-1.5 rounded-md transition-all cursor-pointer disabled:opacity-50"
                  title="Editar Rotina"
                >
                  <Pencil size={15} />
                </button>
                <button 
                  onClick={() => handleDeleteRoutine(routine.id)}
                  disabled={executingId === routine.id}
                  className="bg-background hover:bg-red-500/10 border border-border text-textMuted hover:text-red-400 p-1.5 rounded-md transition-all cursor-pointer disabled:opacity-50"
                  title="Eliminar Rotina"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-border/50">
              <h2 className="text-xl font-bold">{editingId !== null ? 'Editar Rotina' : 'Nova Rotina de Backup'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-textMuted hover:text-white transition-colors p-1 rounded-md hover:bg-white/10 cursor-pointer">
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-textMuted mb-1.5">Nome da Rotina</label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="Ex: Servidor de Arquivos Sicoob" 
                  className="w-full bg-background border border-border rounded-lg px-4 py-2 text-sm text-white focus:border-primary outline-none transition-all" 
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-textMuted mb-1.5">Pasta de Origem</label>
                <div className="flex space-x-2">
                  <input 
                    type="text" 
                    value={formData.source_path}
                    readOnly
                    className="w-full bg-background border border-border rounded-lg px-4 py-2 text-sm text-white outline-none cursor-pointer truncate" 
                    onClick={handleSelectFolder}
                  />
                  <button 
                    type="button"
                    onClick={handleSelectFolder}
                    className="bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary px-4 py-2 rounded-lg font-medium text-sm flex items-center transition-all shrink-0 cursor-pointer"
                  >
                    <FolderSearch size={16} className="mr-2" />
                    Procurar
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-textMuted mb-1.5">Cofre de Destino</label>
                <select 
                  value={formData.destination_vault.startsWith('Local:') ? 'Local' : formData.destination_vault}
                  onChange={(e) => {
                    if (e.target.value === 'Local') {
                      setFormData({...formData, destination_vault: 'Local: '});
                    } else {
                      setFormData({...formData, destination_vault: e.target.value});
                    }
                  }}
                  className="w-full bg-background border border-border rounded-lg px-4 py-2 text-sm text-white focus:border-primary outline-none appearance-none"
                >
                  <option value="S3 Brasil (Amazon Web Services)">S3 Brasil (Amazon Web Services)</option>
                  <option value="Azure Blob Storage">Azure Blob Storage</option>
                  <option value="Local">💻 Servidor Local / NAS (Sicoob)</option>
                </select>

                {formData.destination_vault.startsWith('Local') && (
                  <div className="mt-3 bg-background/50 p-3 rounded-lg border border-border">
                    <label className="block text-xs font-medium text-textMuted mb-1.5">Selecione a pasta do Servidor/NAS</label>
                    <div className="flex space-x-2">
                      <input 
                        type="text" 
                        value={formData.destination_vault.replace('Local: ', '')}
                        readOnly
                        className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm text-white outline-none cursor-pointer truncate" 
                        onClick={async () => {
                          const path = await invoke<string>('select_folder_dialog');
                          if (path) setFormData({...formData, destination_vault: `Local: ${path}`});
                        }}
                      />
                      <button 
                        type="button"
                        onClick={async () => {
                          const path = await invoke<string>('select_folder_dialog');
                          if (path) setFormData({...formData, destination_vault: `Local: ${path}`});
                        }}
                        className="bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary px-3 py-1.5 rounded-md font-medium text-sm flex items-center transition-all shrink-0 cursor-pointer"
                      >
                        <FolderSearch size={14} className="mr-1.5" />
                        Procurar NAS
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-textMuted mb-1.5">Frequência</label>
                <select 
                  value={scheduleType}
                  onChange={(e) => setScheduleType(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-4 py-2 text-sm text-white focus:border-primary outline-none appearance-none"
                >
                  <option value="Diariamente às 02:00">Diariamente às 02:00</option>
                  <option value="A cada 6 horas">A cada 6 horas</option>
                  <option value="Execução Manual">Execução Manual</option>
                  <option value="Personalizado">⚙️ Personalizado...</option>
                </select>
              </div>

              {scheduleType === 'Personalizado' && (
                <div className="bg-background/80 border border-border rounded-xl p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-textMuted mb-1">Modelo</label>
                      <select 
                        value={customFrequency}
                        onChange={(e) => setCustomFrequency(e.target.value)}
                        className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-white outline-none"
                      >
                        <option value="Diário">Diário</option>
                        <option value="Dias úteis (Seg-Sex)">Dias úteis</option>
                        <option value="Semanal">Semanal</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-textMuted mb-1">Repetir a Cada</label>
                      <select 
                        value={repeatEvery}
                        onChange={(e) => setRepeatEvery(e.target.value)}
                        className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-white outline-none"
                      >
                        <option value="1">1 hora</option>
                        <option value="3">3 horas</option>
                        <option value="6">6 horas</option>
                        <option value="24">24 horas</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-textMuted mb-1">Horário Base</label>
                    <input 
                      type="time" 
                      value={customTime}
                      onChange={(e) => setCustomTime(e.target.value)}
                      className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-white outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="p-5 border-t border-border/50 bg-background/50 flex justify-end space-x-3">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 rounded-lg font-medium text-sm text-textMuted hover:text-white hover:bg-surface transition-all cursor-pointer">Cancelar</button>
              <button 
                onClick={handleSaveRoutine}
                disabled={isSaving}
                className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg font-medium text-sm shadow-md transition-all flex items-center disabled:opacity-50 cursor-pointer"
              >
                <Shield size={16} className="mr-2" />
                {isSaving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}