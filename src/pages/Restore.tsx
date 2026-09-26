import { useState, useMemo } from 'react';
import { ShieldAlert, Search, FolderSearch, FileKey2, RefreshCw, CheckCircle2, AlertCircle, Info, HardDriveDownload, CheckSquare, Filter, Calendar, ChevronDown } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface BackupManifest {
  name: string;
  path: string;
  status: string;
  date?: string; // Propriedade opcional preparada para receber a data do backend Rust
}

interface Toast { id: number; title: string; message: string; type: 'success' | 'error' | 'info'; }

export default function Restore() {
  const [vaultPath, setVaultPath] = useState('');
  const [manifests, setManifests] = useState<BackupManifest[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [restoringPath, setRestoringPath] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [selectedManifests, setSelectedManifests] = useState<string[]>([]);

  // Estados para o Motor de Busca e Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');

  const showToast = (title: string, msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, title, message: msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  };

  const handleSelectVault = async () => {
    try {
      const path = await invoke<string>('select_folder_dialog');
      if (path) {
        setVaultPath(path);
        scanVault(path);
      }
    } catch (error) {
      console.log("Cancelado:", error);
    }
  };

  const scanVault = async (path: string) => {
    setIsScanning(true);
    setManifests([]);
    setSelectedManifests([]);
    showToast('Procurando Backups', 'A realizar busca recursiva no cofre...', 'info');
    
    try {
      const foundManifests = await invoke<BackupManifest[]>('scan_local_vault', { vaultPath: path });
      setManifests(foundManifests);
      
      if (foundManifests.length > 0) {
        showToast('Sucesso', `${foundManifests.length} backup(s) localizado(s).`, 'success');
      } else {
        showToast('Vazio', 'Nenhum manifesto (.kopher) encontrado.', 'error');
      }
    } catch (error) {
      showToast('Erro de Leitura', `Falha ao abrir o cofre: ${error}`, 'error');
    } finally {
      setIsScanning(false);
    }
  };

  // Motor de Filtros: Filtra a lista em tempo real sem ir ao backend
  const filteredManifests = useMemo(() => {
    return manifests.filter(manifest => {
      // Filtro de Texto (Nome ou Caminho)
      const matchesSearch = manifest.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            manifest.path.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Filtro de Status
      const matchesStatus = statusFilter === 'Todos' || manifest.status.includes(statusFilter);

      // (Futuro) Filtro de Data: Aqui você conectará com a propriedade manifest.date que o Rust enviar
      // const matchesDate = ...

      return matchesSearch && matchesStatus;
    });
  }, [manifests, searchTerm, statusFilter, dateStart, dateEnd]);

  const toggleSelection = (path: string) => {
    setSelectedManifests(prev => prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path]);
  };

  // O Selecionar Todos agora é inteligente: seleciona apenas os que aparecem no filtro!
  const toggleAll = () => {
    if (selectedManifests.length === filteredManifests.length) {
      setSelectedManifests([]);
    } else {
      setSelectedManifests(filteredManifests.map(m => m.path));
    }
  };

  const handleBatchRestore = async () => {
    if (selectedManifests.length === 0) return;

    try {
      showToast('Ação Necessária', 'Selecione a pasta destino para os ficheiros recuperados.', 'info');
      const restoreDest = await invoke<string>('select_folder_dialog');
      if (!restoreDest) {
        showToast('Cancelado', 'Nenhuma pasta de destino selecionada.', 'info');
        return;
      }

      showToast('Motor Reverso Ativado', `Iniciando restauro de ${selectedManifests.length} ficheiro(s)...`, 'info');

      for (const path of selectedManifests) {
        setRestoringPath(path);
        await invoke('execute_restore', { manifestPath: path, restorePath: restoreDest });
      }

      showToast('Restauro Concluído', 'Todos os ficheiros selecionados foram reconstruídos!', 'success');
      setSelectedManifests([]); 
    } catch (error) {
      showToast('Erro', `Falha durante o restauro em lote: ${error}`, 'error');
    } finally {
      setRestoringPath(null);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-[1600px] mx-auto relative pb-24">
      
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col space-y-3 pointer-events-none">
        {toasts.map(toast => (
          <div key={toast.id} className={`w-80 p-4 rounded-xl shadow-2xl border flex items-start space-x-3 pointer-events-auto animate-in slide-in-from-right-8 fade-in duration-300 ${toast.type === 'success' ? 'bg-surface/95 border-green-500/40' : toast.type === 'error' ? 'bg-surface/95 border-red-500/40' : 'bg-surface/95 border-blue-500/40'}`}>
            <div className="shrink-0 mt-0.5">{toast.type === 'success' && <CheckCircle2 size={18} className="text-green-500" />}{toast.type === 'error' && <AlertCircle size={18} className="text-red-500" />}{toast.type === 'info' && <Info size={18} className="text-blue-500" />}</div>
            <div className="flex flex-col"><h4 className={`text-sm font-bold ${toast.type === 'success' ? 'text-green-500' : toast.type === 'error' ? 'text-red-500' : 'text-blue-500'}`}>{toast.title}</h4><p className="text-xs text-textMuted mt-1 leading-relaxed">{toast.message}</p></div>
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center border-b border-border/50 pb-6">
        <div>
          <h1 className="text-3xl font-bold mb-2 tracking-tight flex items-center text-red-500"><ShieldAlert size={28} className="mr-3" />Disaster Recovery</h1>
          <p className="text-sm text-textMuted">Restaure os seus ficheiros críticos a partir de cofres seguros em lote.</p>
        </div>
      </div>

      {/* 1. MÓDULO DE LOCALIZAÇÃO DO COFRE */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <label className="block text-sm font-medium text-textMuted mb-2">Localizar Cofre de Segurança (Busca Recursiva)</label>
        <div className="flex space-x-3">
          <input type="text" value={vaultPath} readOnly placeholder="Selecione a pasta raiz do cofre..." className="w-full bg-background border border-border rounded-lg px-4 py-3 text-sm text-textMain outline-none cursor-pointer" onClick={handleSelectVault} />
          <button onClick={handleSelectVault} className="bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary px-6 py-3 rounded-lg font-medium text-sm flex items-center transition-all shrink-0 cursor-pointer"><FolderSearch size={18} className="mr-2" />Abrir Cofre</button>
        </div>
      </div>

      {/* 2. MÓDULO DE PESQUISA E FILTROS (Ativado apenas se houver ficheiros) */}
      {manifests.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-5 shadow-sm animate-in fade-in duration-300">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" size={18} />
              <input 
                type="text" 
                placeholder="Pesquisar por nome do ficheiro, extensão ou caminho..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-background border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm text-textMain focus:border-primary outline-none transition-all"
              />
            </div>
            <button 
              onClick={() => setShowFilters(!showFilters)} 
              className={`px-4 py-2.5 rounded-lg font-medium text-sm flex items-center transition-all border cursor-pointer shrink-0 ${showFilters ? 'bg-primary/10 border-primary/30 text-primary' : 'bg-background border-border text-textMuted hover:text-textMain'}`}
            >
              <Filter size={16} className="mr-2" /> Filtros Avançados <ChevronDown size={14} className={`ml-2 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Painel Expansível de Filtros */}
          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-5 mt-5 border-t border-border/50 animate-in slide-in-from-top-2">
              <div>
                <label className="block text-xs font-medium text-textMuted mb-1.5 flex items-center"><Calendar size={12} className="mr-1.5"/> Data Inicial do Backup</label>
                <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-textMain focus:border-primary outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-textMuted mb-1.5 flex items-center"><Calendar size={12} className="mr-1.5"/> Data Final do Backup</label>
                <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-textMain focus:border-primary outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-textMuted mb-1.5 flex items-center"><Filter size={12} className="mr-1.5"/> Status de Integridade</label>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-textMain focus:border-primary outline-none appearance-none cursor-pointer">
                  <option value="Todos">Todos os Status</option>
                  <option value="Íntegro">Apenas Íntegros (AES-256)</option>
                  <option value="Alerta">Com Alertas / Corrompidos</option>
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. MÓDULO DE RESULTADOS */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-bold flex items-center text-textMain">
            <Search size={18} className="mr-2 text-primary" /> Backups Localizados <span className="text-xs text-textMuted font-normal ml-2">({filteredManifests.length} ficheiros)</span>
          </h2>
          {filteredManifests.length > 0 && (
            <button onClick={toggleAll} className="text-sm text-textMuted hover:text-primary transition-colors flex items-center cursor-pointer">
              <CheckSquare size={16} className="mr-2" />
              {selectedManifests.length === filteredManifests.length ? 'Desmarcar Todos' : 'Selecionar Resultados'}
            </button>
          )}
        </div>

        {isScanning ? (
          <div className="bg-surface border border-border border-dashed rounded-xl p-12 flex flex-col items-center justify-center space-y-4"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div><p className="text-textMuted text-sm font-medium">A procurar recursivamente em todas as subpastas...</p></div>
        ) : manifests.length === 0 ? (
          <div className="bg-surface border border-border border-dashed rounded-xl p-12 text-center text-textMuted text-sm">Nenhum ponto de restauro localizado. Selecione um cofre válido acima.</div>
        ) : filteredManifests.length === 0 ? (
          <div className="bg-surface border border-border border-dashed rounded-xl p-12 text-center text-textMuted text-sm">Nenhum ficheiro corresponde aos filtros de pesquisa atuais.</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 animate-in fade-in slide-in-from-bottom-4">
            {filteredManifests.map((manifest, index) => {
              const isSelected = selectedManifests.includes(manifest.path);
              const isRestoringThis = restoringPath === manifest.path;
              
              return (
                <div key={index} 
                     onClick={() => !isRestoringThis && toggleSelection(manifest.path)}
                     className={`bg-surface border rounded-xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 transition-all shadow-sm cursor-pointer ${isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}>
                  
                  <div className="flex items-center space-x-4 w-full">
                    <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-primary border-primary text-white' : 'border-textMuted bg-background'}`}>
                      {isSelected && <CheckCircle2 size={14} />}
                    </div>
                    
                    <div className="bg-blue-500/10 p-3 rounded-lg text-blue-500 shrink-0"><FileKey2 size={24} /></div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-bold text-textMain mb-1 truncate">{manifest.name}</h3>
                      <div className="flex space-x-4 text-xs text-textMuted">
                        <span className="flex items-center text-green-500 shrink-0"><CheckCircle2 size={12} className="mr-1" /> {manifest.status}</span>
                        <span className="truncate max-w-[200px] lg:max-w-md" title={manifest.path}>{manifest.path}</span>
                      </div>
                    </div>
                  </div>

                  {isRestoringThis && (
                    <span className="text-primary text-sm font-bold flex items-center animate-pulse shrink-0">
                      <RefreshCw size={16} className="mr-2 animate-spin" /> Reconstruindo...
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. BARRA DE AÇÃO FLUTUANTE (Em Lote) */}
      {selectedManifests.length > 0 && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 ml-32 bg-surface border border-primary shadow-[0_0_30px_rgba(59,130,246,0.3)] rounded-full px-6 py-4 flex items-center space-x-6 animate-in slide-in-from-bottom-8 z-50">
          <span className="text-textMain font-bold">
            <span className="text-primary text-xl mr-2">{selectedManifests.length}</span>
            Ficheiros Selecionados
          </span>
          <button 
            onClick={handleBatchRestore}
            disabled={restoringPath !== null}
            className="bg-primary hover:bg-primary/90 text-white px-6 py-2.5 rounded-full font-bold shadow-md transition-all flex items-center disabled:opacity-50 cursor-pointer"
          >
            {restoringPath !== null ? <RefreshCw size={18} className="mr-2 animate-spin" /> : <HardDriveDownload size={18} className="mr-2" />}
            Restaurar Lote
          </button>
        </div>
      )}

    </div>
  );
}