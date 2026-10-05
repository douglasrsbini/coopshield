import { useState, useEffect } from 'react';
import { HardDrive, Cloud, FolderOpen, Play, CheckCircle2, AlertCircle, Info, RefreshCcw, ShieldCheck, Download, Search, Calendar, CheckSquare, Square, ListChecks } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ask } from '@tauri-apps/plugin-dialog';

interface BackupManifest {
  name: string;
  path: string;
  status: string;
  date_formatted: string;
  original_source: string;
  total_files: number;
}

interface CloudVault {
  id?: number;
  name: string;
  provider: string;
}

interface Toast {
  id: number;
  title: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface RestoreProgressPayload {
  manifest_path: string;
  progress: number;
  status: string;
}

// TIPAGEM CORRIGIDA PARA RECEBER O PAYLOAD DO RUST
interface RestoreCompletePayload {
  manifest_path: string;
}

export default function Restore() {
  const [sourceType, setSourceType] = useState<'local' | 'cloud'>(() => (sessionStorage.getItem('restoreSourceType') as 'local' | 'cloud') || 'local');
  const [localPath, setLocalPath] = useState(() => sessionStorage.getItem('restoreLocalPath') || '');
  
  const [cloudVaults, setCloudVaults] = useState<CloudVault[]>([]);
  const [selectedCloudVault, setSelectedCloudVault] = useState(() => sessionStorage.getItem('restoreSelectedVault') || '');
  
  const [manifests, setManifests] = useState<BackupManifest[]>(() => {
    try {
      const saved = sessionStorage.getItem('restoreManifests');
      if (saved && saved !== 'undefined' && saved !== 'null') {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (e) {
      console.warn("Erro ao restaurar manifestos da sessão", e);
    }
    return [];
  });
  
  const [isLoading, setIsLoading] = useState(false);
  
  const [restoringPath, setRestoringPath] = useState<string | null>(() => sessionStorage.getItem('restoringPath'));
  const [progress, setProgress] = useState<number>(() => parseInt(sessionStorage.getItem('restoreProgress') || '0'));
  const [statusText, setStatusText] = useState<string>(() => sessionStorage.getItem('restoreStatus') || '');
  
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedManifests, setSelectedManifests] = useState<Set<string>>(new Set());
  const [isBulkRestoring, setIsBulkRestoring] = useState(false);

  const showToast = (title: string, message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, title, message, type }]);
    setTimeout(() => { setToasts(p => p.filter(t => t.id !== id)); }, 5000);
  };

  useEffect(() => {
    async function loadVaults() {
      try {
        const vaults = await invoke<CloudVault[]>('get_cloud_vaults');
        setCloudVaults(vaults);
        if (vaults.length > 0 && !selectedCloudVault) {
          setSelectedCloudVault(vaults[0].name);
        }
      } catch (err) {
        console.error("Erro ao carregar cofres cloud:", err);
      }
    }
    loadVaults();
  }, [selectedCloudVault]);

  useEffect(() => {
    sessionStorage.setItem('restoreSourceType', sourceType);
    sessionStorage.setItem('restoreLocalPath', localPath);
    sessionStorage.setItem('restoreSelectedVault', selectedCloudVault);
    sessionStorage.setItem('restoreManifests', JSON.stringify(manifests));
  }, [sourceType, localPath, selectedCloudVault, manifests]);

  useEffect(() => {
    let unlistenProgress: (() => void) | undefined;
    let unlistenComplete: (() => void) | undefined;
    let unlistenError: (() => void) | undefined;

    const setupListeners = async () => {
      unlistenProgress = await listen<RestoreProgressPayload>('restore-progress', (event) => {
        const payload = event.payload;
        setRestoringPath(payload.manifest_path);
        setProgress(payload.progress);
        setStatusText(payload.status);

        sessionStorage.setItem('restoringPath', payload.manifest_path);
        sessionStorage.setItem('restoreProgress', payload.progress.toString());
        sessionStorage.setItem('restoreStatus', payload.status);
      });

      // OUVINTE ATUALIZADO COM O TIPO DE DADOS CORRETO (RestoreCompletePayload)
      unlistenComplete = await listen<RestoreCompletePayload>('restore-complete', (event) => {
        // SETTIMEOUT EVITA A TELA PRETA (RACE CONDITION DO REACT)
        setTimeout(() => {
          setRestoringPath(null);
          setProgress(0);
          setStatusText('');
          
          sessionStorage.removeItem('restoringPath');
          sessionStorage.removeItem('restoreProgress');
          sessionStorage.removeItem('restoreStatus');
          
          if (!sessionStorage.getItem('isBulkRestoring')) {
              showToast('Restauro Finalizado', 'O relatório de auditoria foi enviado por e-mail.', 'success');
          }
        }, 0);
      });

      unlistenError = await listen<string>('restore-error', (event) => {
        setTimeout(() => {
          setRestoringPath(null);
          setProgress(0);
          setStatusText('');
          
          sessionStorage.removeItem('restoringPath');
          sessionStorage.removeItem('restoreProgress');
          sessionStorage.removeItem('restoreStatus');
          
          showToast('Atenção no Restauro', event.payload, 'error');
        }, 0);
      });
    };

    setupListeners();

    return () => {
      if (unlistenProgress) unlistenProgress();
      if (unlistenComplete) unlistenComplete();
      if (unlistenError) unlistenError();
    };
  }, []);

  const handleSelectFolder = async () => {
    try {
      const path = await invoke<string>('select_folder_dialog');
      if (path) {
        setLocalPath(path);
        scanLocal(path);
      }
    } catch (error) {
      console.log("Cancelado:", error);
    }
  };

  const scanLocal = async (path: string) => {
    setIsLoading(true);
    setSelectedManifests(new Set()); 
    try {
      const data = await invoke<BackupManifest[]>('scan_local_vault', { vaultPath: path });
      setManifests(data);
      if (data.length === 0) showToast('Aviso', 'Nenhum cofre .coopshield encontrado nesta pasta.', 'info');
    } catch (error) {
      showToast('Erro', `Falha ao escanear cofre local: ${error}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const scanCloud = async () => {
    if (!selectedCloudVault) {
      showToast('Aviso', 'Selecione um cofre de nuvem válido.', 'info');
      return;
    }
    setIsLoading(true);
    setSelectedManifests(new Set()); 
    try {
      const data = await invoke<BackupManifest[]>('scan_cloud_vault', { vaultName: selectedCloudVault });
      setManifests(data);
      if (data.length === 0) showToast('Aviso', 'Nenhum backup encontrado neste cofre Cloud.', 'info');
      else showToast('Sucesso', `${data.length} ponto(s) de restauro encontrados na Nuvem.`, 'success');
    } catch (error) {
      showToast('Erro', `Falha ao conectar à Nuvem: ${error}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecuteRestore = async (manifest: BackupManifest) => {
    const targetFolder = await invoke<string>('select_folder_dialog');
    if (!targetFolder) return;

    const confirmed = await ask(`Deseja restaurar o cofre '${manifest.name}' para a pasta selecionada?`, { title: 'CoopShield Recovery', kind: 'info' });
    if (!confirmed) return;

    setRestoringPath(manifest.path);
    setProgress(1);
    setStatusText('Ligando motores de restauro...');
    
    sessionStorage.setItem('restoringPath', manifest.path);
    sessionStorage.setItem('restoreProgress', '1');
    sessionStorage.setItem('restoreStatus', 'Ligando motores de restauro...');

    try {
      if (sourceType === 'local') {
        await invoke('execute_restore', { manifestPath: manifest.path, restorePath: targetFolder });
      } else {
        await invoke('execute_cloud_restore', { vaultName: selectedCloudVault, manifestKey: manifest.path, restorePath: targetFolder });
      }
    } catch (error) {
      showToast('Erro Crítico', `Falha ao acionar restauro: ${error}`, 'error');
      setRestoringPath(null);
      sessionStorage.removeItem('restoringPath');
    }
  };

  const handleExecuteBulkRestore = async () => {
    if (selectedManifests.size === 0) return;
    
    const targetFolder = await invoke<string>('select_folder_dialog');
    if (!targetFolder) return;

    const confirmed = await ask(`Atenção: Você está prestes a restaurar ${selectedManifests.size} cofres em lote para a mesma pasta. O processo ocorrerá em fila. Deseja prosseguir?`, { title: 'Operação em Lote - CoopShield', kind: 'warning' });
    if (!confirmed) return;

    setIsBulkRestoring(true);
    sessionStorage.setItem('isBulkRestoring', 'true');
    
    const manifestList = manifests.filter(m => selectedManifests.has(m.path));

    let successLote = 0;

    for (const manifest of manifestList) {
      setRestoringPath(manifest.path);
      setProgress(1);
      setStatusText(`Processando lote: ${manifest.name}...`);

      try {
        if (sourceType === 'local') {
          await invoke('execute_restore', { manifestPath: manifest.path, restorePath: targetFolder });
        } else {
          await invoke('execute_cloud_restore', { vaultName: selectedCloudVault, manifestKey: manifest.path, restorePath: targetFolder });
        }
        successLote++;
      } catch (error) {
        showToast('Falha no Lote', `Erro ao restaurar ${manifest.name}. O sistema avançará para o próximo.`, 'error');
      }
    }

    setTimeout(() => {
        setRestoringPath(null);
        setProgress(0);
        setIsBulkRestoring(false);
        setSelectedManifests(new Set());
        sessionStorage.removeItem('isBulkRestoring');
        
        showToast('Lote Finalizado', `Operação concluída. ${successLote} de ${manifestList.length} processados. Relatórios enviados por e-mail.`, 'success');
    }, 0);
  };

  const toggleSelection = (path: string) => {
    const newSet = new Set(selectedManifests);
    if (newSet.has(path)) newSet.delete(path);
    else newSet.add(path);
    setSelectedManifests(newSet);
  };

  const toggleAllSelection = () => {
    if (selectedManifests.size === filteredManifests.length && filteredManifests.length > 0) {
      setSelectedManifests(new Set()); 
    } else {
      const allPaths = filteredManifests.map(m => m.path);
      setSelectedManifests(new Set(allPaths)); 
    }
  };

  const filteredManifests = manifests.filter(manifest => {
    const matchSearch = manifest.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                        manifest.original_source.toLowerCase().includes(searchQuery.toLowerCase());
    
    let matchDate = true;
    
    if (startDate || endDate) {
      const datePart = manifest.date_formatted.split(' ')[0];
      const [day, month, year] = datePart.split('/');
      const mDate = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0);

      if (startDate) {
        const [sYear, sMonth, sDay] = startDate.split('-');
        const sDate = new Date(Number(sYear), Number(sMonth) - 1, Number(sDay), 0, 0, 0); 
        if (mDate < sDate) matchDate = false;
      }
      
      if (endDate) {
        const [eYear, eMonth, eDay] = endDate.split('-');
        const eDate = new Date(Number(eYear), Number(eMonth) - 1, Number(eDay), 23, 59, 59); 
        if (mDate > eDate) matchDate = false;
      }
    }
    
    return matchSearch && matchDate;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-[1600px] mx-auto relative pb-24">
      
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col space-y-3 pointer-events-none">
        {toasts.map(toast => (
          <div key={toast.id} className={`w-80 p-4 rounded-xl shadow-2xl border flex items-start space-x-3 pointer-events-auto animate-in slide-in-from-right-8 fade-in duration-300 ${toast.type === 'success' ? 'bg-surface/95 border-green-500/40 backdrop-blur-sm' : toast.type === 'error' ? 'bg-surface/95 border-red-500/40 backdrop-blur-sm' : 'bg-surface/95 border-blue-500/40 backdrop-blur-sm'}`}>
            <div className="shrink-0 mt-0.5">{toast.type === 'success' && <CheckCircle2 size={18} className="text-green-500" />}{toast.type === 'error' && <AlertCircle size={18} className="text-red-500" />}{toast.type === 'info' && <Info size={18} className="text-blue-500" />}</div>
            <div className="flex flex-col flex-1">
              <h4 className={`text-sm font-bold ${toast.type === 'success' ? 'text-green-500' : toast.type === 'error' ? 'text-red-500' : 'text-blue-500'}`}>{toast.title}</h4>
              <p className="text-xs text-textMuted mt-1 leading-relaxed">{toast.message}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="border-b border-border/50 pb-6">
        <h1 className="text-3xl font-bold mb-2 tracking-tight text-textMain">Restauração de Backup</h1>
        <p className="text-sm text-textMuted">Recuperação de desastres e auditoria de integridade de cofres.</p>
      </div>

      <div className="bg-surface border border-border rounded-xl p-6 shadow-sm space-y-5">
        <div className="flex space-x-4 border-b border-border/50 pb-4">
          <button 
            onClick={() => { setSourceType('local'); setManifests([]); setSelectedManifests(new Set()); }} 
            className={`flex items-center px-4 py-2 rounded-lg font-medium text-sm transition-all cursor-pointer ${sourceType === 'local' ? 'bg-primary text-white shadow-md shadow-primary/20' : 'bg-background text-textMuted hover:text-textMain border border-border'}`}
          >
            <HardDrive size={16} className="mr-2" /> Cofre Local / NAS
          </button>
          <button 
            onClick={() => { sourceType !== 'cloud' && setSourceType('cloud'); setManifests([]); setSelectedManifests(new Set()); }} 
            className={`flex items-center px-4 py-2 rounded-lg font-medium text-sm transition-all cursor-pointer ${sourceType === 'cloud' ? 'bg-primary text-white shadow-md shadow-primary/20' : 'bg-background text-textMuted hover:text-textMain border border-border'}`}
          >
            <Cloud size={16} className="mr-2" /> Cofre Nuvem (S3 / Cloudflare)
          </button>
        </div>

        {sourceType === 'local' ? (
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-textMuted uppercase tracking-wider">Localizar Cofre de Segurança Local</label>
            <div className="flex space-x-3">
              <input type="text" value={localPath} readOnly placeholder="Selecione a pasta raiz do cofre local..." className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-textMain outline-none cursor-pointer truncate" onClick={handleSelectFolder} />
              <button onClick={handleSelectFolder} className="bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary px-5 py-2.5 rounded-lg font-medium text-sm flex items-center transition-all shrink-0 cursor-pointer">
                <FolderOpen size={16} className="mr-2" /> Abrir Cofre
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-textMuted uppercase tracking-wider">Selecione o Cofre Cloud Registado</label>
            <div className="flex space-x-3">
              <select 
                value={selectedCloudVault} 
                onChange={(e) => setSelectedCloudVault(e.target.value)} 
                className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-textMain focus:border-primary outline-none cursor-pointer"
              >
                {cloudVaults.length === 0 ? (
                  <option value="">Nenhum cofre cloud configurado no sistema</option>
                ) : (
                  cloudVaults.map(v => (
                    <option key={v.id} value={v.name}>☁️ {v.name} ({v.provider})</option>
                  ))
                )}
              </select>
              <button onClick={scanCloud} disabled={isLoading || cloudVaults.length === 0} className="bg-primary hover:bg-primary/90 text-white px-6 py-2.5 rounded-lg font-medium text-sm flex items-center transition-all shrink-0 cursor-pointer disabled:opacity-50 shadow-lg shadow-primary/20">
                {isLoading ? <RefreshCcw size={16} className="mr-2 animate-spin" /> : <ShieldCheck size={16} className="mr-2" />}
                Escanear Nuvem
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-surface border border-border rounded-xl p-4 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        
        <div className="flex flex-col xl:flex-row w-full md:w-auto gap-4 flex-1 items-start xl:items-center">
          
          <div className="relative w-full xl:w-80 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" size={16} />
            <input 
              type="text" 
              placeholder="Pesquisar por nome ou caminho..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-background border border-border rounded-lg pl-10 pr-4 py-2 text-sm text-textMain focus:border-primary outline-none transition-colors"
            />
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto bg-background border border-border rounded-lg px-2 py-1">
            <Calendar className="text-textMuted ml-2 shrink-0" size={16} />
            <div className="relative w-full sm:w-32">
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-transparent border-none px-2 py-1 text-sm text-textMain outline-none cursor-pointer"
                style={{ colorScheme: 'dark' }}
                title="Data Inicial"
              />
            </div>
            <span className="text-textMuted text-xs font-bold uppercase">Até</span>
            <div className="relative w-full sm:w-32">
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-transparent border-none px-2 py-1 text-sm text-textMain outline-none cursor-pointer"
                style={{ colorScheme: 'dark' }}
                title="Data Final"
              />
            </div>
          </div>

        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 border-border/50 pt-4 md:pt-0">
          <div className="text-xs text-textMuted font-medium flex items-center">
            <span className="bg-primary/10 text-primary px-2 py-0.5 rounded mr-2">{selectedManifests.size}</span> selecionados
          </div>
          <button 
            onClick={handleExecuteBulkRestore}
            disabled={selectedManifests.size === 0 || isBulkRestoring || !!restoringPath}
            className="bg-primary hover:bg-primary/90 text-white px-5 py-2 rounded-lg font-medium text-sm flex items-center transition-all disabled:opacity-50 cursor-pointer shadow-md shadow-primary/20"
          >
            <ListChecks size={16} className="mr-2" /> Restaurar Lote
          </button>
        </div>
      </div>

      <div className="space-y-4">
        
        <div className="flex items-center px-2 py-1">
          <button 
            onClick={toggleAllSelection} 
            disabled={filteredManifests.length === 0 || isBulkRestoring}
            className="flex items-center text-sm font-medium text-textMuted hover:text-primary transition-colors cursor-pointer disabled:opacity-50 mr-4"
          >
            {selectedManifests.size === filteredManifests.length && filteredManifests.length > 0 ? (
              <CheckSquare size={18} className="mr-2 text-primary" />
            ) : (
              <Square size={18} className="mr-2" />
            )}
            Selecionar Todos ({filteredManifests.length})
          </button>
        </div>

        {manifests.length > 0 && filteredManifests.length === 0 ? (
          <div className="bg-surface border border-border border-dashed rounded-xl p-12 text-center text-textMuted text-sm">
            Nenhum backup corresponde aos filtros informados.
          </div>
        ) : manifests.length === 0 ? (
          <div className="bg-surface border border-border border-dashed rounded-xl p-12 text-center text-textMuted text-sm">
            Nenhum ponto de restauro localizado. Selecione a origem acima para carregar os cofres.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredManifests.map((manifest, idx) => {
              const isRestoring = restoringPath === manifest.path;
              const isSelected = selectedManifests.has(manifest.path);
              
              return (
                <div key={idx} className={`bg-surface border rounded-xl p-6 shadow-sm transition-all flex flex-col justify-between space-y-4 ${isSelected ? 'border-primary/60 bg-primary/5' : 'border-border hover:border-primary/40'}`}>
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    
                    <div className="flex items-start">
                      <button 
                        onClick={() => toggleSelection(manifest.path)}
                        disabled={isBulkRestoring || !!restoringPath}
                        className="mt-1 mr-4 text-textMuted hover:text-primary transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {isSelected ? <CheckSquare size={20} className="text-primary" /> : <Square size={20} />}
                      </button>
                      <div>
                        <div className="flex items-center space-x-3 mb-1">
                          <h3 className="text-lg font-bold text-textMain">{manifest.name}</h3>
                          <span className="bg-green-500/10 text-green-500 border border-green-500/20 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">{manifest.status}</span>
                        </div>
                        <p className="text-xs text-textMuted font-mono truncate max-w-[300px] md:max-w-md" title={manifest.original_source}>Origem: {manifest.original_source}</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-6 text-xs text-textMuted ml-9 md:ml-0">
                      <div>Data: <strong className="text-textMain">{manifest.date_formatted}</strong></div>
                      <div>Blocos Encriptados: <strong className="text-textMain">{manifest.total_files}</strong></div>
                      <button 
                        onClick={() => handleExecuteRestore(manifest)} 
                        disabled={isRestoring || isBulkRestoring || (restoringPath !== null && restoringPath !== manifest.path)}
                        className={`px-5 py-2.5 rounded-lg font-medium shadow-lg transition-all flex items-center text-sm ${isRestoring ? 'bg-primary text-white shadow-primary/20' : 'bg-surface border border-border hover:border-primary hover:text-primary cursor-pointer shadow-none'}`}
                      >
                        <Download size={16} className="mr-2" /> {isRestoring ? 'Restaurando...' : 'Restaurar'}
                      </button>
                    </div>
                  </div>

                  {isRestoring && (
                    <div className="bg-background/80 border border-primary/20 rounded-xl p-4 space-y-2 animate-in fade-in ml-9">
                      <div className="flex justify-between text-xs text-textMuted font-semibold">
                        <span>{statusText}</span>
                        <span className="text-primary">{progress}%</span>
                      </div>
                      <div className="w-full bg-surface rounded-full h-2 border border-border overflow-hidden">
                        <div className="bg-primary h-2 rounded-full transition-all duration-200" style={{ width: `${progress}%` }}></div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}