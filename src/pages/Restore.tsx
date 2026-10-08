import { useState, useEffect } from 'react';
import { HardDrive, Cloud, FolderOpen, CheckCircle2, AlertCircle, Info, RefreshCcw, ShieldCheck, Download, Search, Calendar, CheckSquare, Square, ListChecks } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ask } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';

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
  const { t, i18n } = useTranslation();
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

  const formatManifestDate = (raw: string) => {
    const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!match) return raw;

    const [, day, month, year, hour = '00', minute = '00', second = '00'] = match;
    const parsed = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    );

    if (Number.isNaN(parsed.getTime())) return raw;

    return new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'short',
      ...(match[4] ? { timeStyle: 'medium' } : {}),
    }).format(parsed);
  };

  const formatManifestStatus = (status: string) => {
    switch (status) {
      case 'Íntegro (ZSTD+AES256)':
        return t('restore.manifest.status.localIntact');
      case 'Íntegro na Nuvem (S3)':
        return t('restore.manifest.status.cloudIntact');
      default:
        return status;
    }
  };

  const formatRestoreStatus = (status: string) => {
    if (status.startsWith('Baixando: ')) {
      return t('restore.progress.downloading', { path: status.slice('Baixando: '.length) });
    }

    if (status.startsWith('Descompactando: ')) {
      return t('restore.progress.extracting', { path: status.slice('Descompactando: '.length) });
    }

    if (status === 'Restauro Cloud Concluído!') {
      return t('restore.progress.completeCloud');
    }

    if (status === 'Concluído!') {
      return t('restore.progress.complete');
    }

    return status;
  };

  const formatNumber = (value: number) => new Intl.NumberFormat(i18n.language).format(value);

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
      unlistenComplete = await listen<RestoreCompletePayload>('restore-complete', () => {
        // SETTIMEOUT EVITA A TELA PRETA (RACE CONDITION DO REACT)
        setTimeout(() => {
          setRestoringPath(null);
          setProgress(0);
          setStatusText('');
          
          sessionStorage.removeItem('restoringPath');
          sessionStorage.removeItem('restoreProgress');
          sessionStorage.removeItem('restoreStatus');
          
          if (!sessionStorage.getItem('isBulkRestoring')) {
              showToast(t('restore.toast.restoreFinishedTitle'), t('restore.toast.restoreFinishedMessage'), 'success');
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
          
          showToast(t('restore.toast.restoreAttentionTitle'), event.payload, 'error');
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
      console.log('Cancelado:', error);
    }
  };

  const scanLocal = async (path: string) => {
    setIsLoading(true);
    setSelectedManifests(new Set()); 
    try {
      const data = await invoke<BackupManifest[]>('scan_local_vault', { vaultPath: path });
      setManifests(data);
      if (data.length === 0) showToast(t('restore.toast.warningTitle'), t('restore.toast.localVaultEmpty'), 'info');
    } catch (error) {
      showToast(t('restore.toast.errorTitle'), t('restore.toast.scanLocalFailed', { error: String(error) }), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const scanCloud = async () => {
    if (!selectedCloudVault) {
      showToast(t('restore.toast.warningTitle'), t('restore.toast.invalidCloudVault'), 'info');
      return;
    }
    setIsLoading(true);
    setSelectedManifests(new Set()); 
    try {
      const data = await invoke<BackupManifest[]>('scan_cloud_vault', { vaultName: selectedCloudVault });
      setManifests(data);
      if (data.length === 0) showToast(t('restore.toast.warningTitle'), t('restore.toast.cloudEmpty'), 'info');
      else showToast(t('common.status.success'), t('restore.toast.cloudFound', { count: data.length }), 'success');
    } catch (error) {
      showToast(t('restore.toast.errorTitle'), t('restore.toast.cloudConnectFailed', { error: String(error) }), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecuteRestore = async (manifest: BackupManifest) => {
    const targetFolder = await invoke<string>('select_folder_dialog');
    if (!targetFolder) return;

    const confirmed = await ask(
      t('restore.modal.singleRestoreMessage', { name: manifest.name }),
      { title: t('restore.modal.singleRestoreTitle'), kind: 'info' },
    );
    if (!confirmed) return;

    setRestoringPath(manifest.path);
    setProgress(1);
    setStatusText(t('restore.progress.starting'));
    
    sessionStorage.setItem('restoringPath', manifest.path);
    sessionStorage.setItem('restoreProgress', '1');
    sessionStorage.setItem('restoreStatus', t('restore.progress.starting'));

    try {
      if (sourceType === 'local') {
        await invoke('execute_restore', { manifestPath: manifest.path, restorePath: targetFolder });
      } else {
        await invoke('execute_cloud_restore', { vaultName: selectedCloudVault, manifestKey: manifest.path, restorePath: targetFolder });
      }
    } catch (error) {
      showToast(t('restore.toast.criticalErrorTitle'), t('restore.toast.confirmRestoreFailed', { error: String(error) }), 'error');
      setRestoringPath(null);
      sessionStorage.removeItem('restoringPath');
    }
  };

  const handleExecuteBulkRestore = async () => {
    if (selectedManifests.size === 0) return;
    
    const targetFolder = await invoke<string>('select_folder_dialog');
    if (!targetFolder) return;

    const confirmed = await ask(
      t('restore.modal.bulkRestoreMessage', { count: selectedManifests.size }),
      { title: t('restore.modal.bulkRestoreTitle'), kind: 'warning' },
    );
    if (!confirmed) return;

    setIsBulkRestoring(true);
    sessionStorage.setItem('isBulkRestoring', 'true');
    
    const manifestList = manifests.filter(m => selectedManifests.has(m.path));

    let successLote = 0;

    for (const manifest of manifestList) {
      setRestoringPath(manifest.path);
      setProgress(1);
      setStatusText(t('restore.batch.processing', { name: manifest.name }));

      try {
        if (sourceType === 'local') {
          await invoke('execute_restore', { manifestPath: manifest.path, restorePath: targetFolder });
        } else {
          await invoke('execute_cloud_restore', { vaultName: selectedCloudVault, manifestKey: manifest.path, restorePath: targetFolder });
        }
        successLote++;
      } catch (error) {
        showToast(t('restore.toast.batchFailureTitle'), t('restore.toast.batchFailedItem', { name: manifest.name }), 'error');
      }
    }

    setTimeout(() => {
        setRestoringPath(null);
        setProgress(0);
        setIsBulkRestoring(false);
        setSelectedManifests(new Set());
        sessionStorage.removeItem('isBulkRestoring');
        
        showToast(
          t('restore.toast.batchFinishedTitle'),
          t('restore.toast.batchFinishedMessage', { successCount: successLote, totalCount: manifestList.length }),
          'success',
        );
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
          <div key={toast.id} className={`w-80 p-4 rounded-xl shadow-2xl border flex items-start space-x-3 pointer-events-auto animate-in slide-in-from-right-8 fade-in duration-300 ${toast.type === 'success' ? 'bg-surface/95 border-green-500/40 backdrop-blur-sm' : toast.type === 'error' ? 'bg-surface/95 border-red-500/40 backdrop-blur-sm' : 'bg-surface/95 border-amber-500/40 backdrop-blur-sm'}`}>
            <div className="shrink-0 mt-0.5">{toast.type === 'success' && <CheckCircle2 size={18} className="text-green-500" />}{toast.type === 'error' && <AlertCircle size={18} className="text-red-500" />}{toast.type === 'info' && <Info size={18} className="text-amber-500" />}</div>
            <div className="flex flex-col flex-1">
              <h4 className={`text-sm font-bold ${toast.type === 'success' ? 'text-green-500' : toast.type === 'error' ? 'text-red-500' : 'text-amber-500'}`}>{toast.title}</h4>
              <p className="text-xs text-textMuted mt-1 leading-relaxed">{toast.message}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="border-b border-border/50 pb-6">
        <h1 className="text-3xl font-bold mb-2 tracking-tight text-textMain">{t('restore.title')}</h1>
        <p className="text-sm text-textMuted">{t('restore.subtitle')}</p>
      </div>

      <div className="bg-surface border border-border rounded-xl p-6 shadow-sm space-y-5">
        <div className="flex space-x-4 border-b border-border/50 pb-4">
          <button 
            onClick={() => { setSourceType('local'); setManifests([]); setSelectedManifests(new Set()); }} 
            className={`flex items-center px-4 py-2 rounded-lg font-medium text-sm transition-all cursor-pointer ${sourceType === 'local' ? 'bg-primary text-white shadow-md shadow-primary/20' : 'bg-background text-textMuted hover:text-textMain border border-border'}`}
          >
            <HardDrive size={16} className="mr-2" /> {t('restore.sourceType.local')}
          </button>
          <button 
            onClick={() => { sourceType !== 'cloud' && setSourceType('cloud'); setManifests([]); setSelectedManifests(new Set()); }} 
            className={`flex items-center px-4 py-2 rounded-lg font-medium text-sm transition-all cursor-pointer ${sourceType === 'cloud' ? 'bg-primary text-white shadow-md shadow-primary/20' : 'bg-background text-textMuted hover:text-textMain border border-border'}`}
          >
            <Cloud size={16} className="mr-2" /> {t('restore.sourceType.cloud')}
          </button>
        </div>

        {sourceType === 'local' ? (
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-textMuted uppercase tracking-wider">{t('restore.localVault.label')}</label>
            <div className="flex space-x-3">
              <input type="text" value={localPath} readOnly placeholder={t('restore.localVault.placeholder')} aria-label={t('restore.localVault.label')} className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-textMain outline-none cursor-pointer truncate" onClick={handleSelectFolder} />
              <button onClick={handleSelectFolder} className="bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary px-5 py-2.5 rounded-lg font-medium text-sm flex items-center transition-all shrink-0 cursor-pointer">
                <FolderOpen size={16} className="mr-2" /> {t('restore.localVault.open')}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-textMuted uppercase tracking-wider">{t('restore.cloudVault.label')}</label>
            <div className="flex space-x-3">
              <select 
                value={selectedCloudVault} 
                onChange={(e) => setSelectedCloudVault(e.target.value)} 
                aria-label={t('restore.cloudVault.label')}
                className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-textMain focus:border-primary outline-none cursor-pointer"
              >
                {cloudVaults.length === 0 ? (
                  <option value="">{t('restore.cloudVault.emptyOption')}</option>
                ) : (
                  cloudVaults.map(v => (
                    <option key={v.id} value={v.name}>{t('restore.cloudVault.optionLabel', { name: v.name, provider: v.provider })}</option>
                  ))
                )}
              </select>
              <button onClick={scanCloud} disabled={isLoading || cloudVaults.length === 0} className="bg-primary hover:bg-primary/90 text-white px-6 py-2.5 rounded-lg font-medium text-sm flex items-center transition-all shrink-0 cursor-pointer disabled:opacity-50 shadow-lg shadow-primary/20">
                {isLoading ? <RefreshCcw size={16} className="mr-2 animate-spin" /> : <ShieldCheck size={16} className="mr-2" />}
                {t('restore.cloudVault.scan')}
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
              placeholder={t('restore.filters.searchPlaceholder')} 
              aria-label={t('restore.filters.searchAriaLabel')}
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
                title={t('restore.filters.startDate')}
                aria-label={t('restore.filters.startDate')}
              />
            </div>
            <span className="text-textMuted text-xs font-bold uppercase">{t('restore.filters.until')}</span>
            <div className="relative w-full sm:w-32">
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-transparent border-none px-2 py-1 text-sm text-textMain outline-none cursor-pointer"
                style={{ colorScheme: 'dark' }}
                title={t('restore.filters.endDate')}
                aria-label={t('restore.filters.endDate')}
              />
            </div>
          </div>

        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 border-border/50 pt-4 md:pt-0">
          <div className="text-xs text-textMuted font-medium flex items-center">
            <span className="bg-primary/10 text-primary px-2 py-0.5 rounded mr-2">{selectedManifests.size}</span> {t('restore.selection.selected', { count: selectedManifests.size })}
          </div>
          <button 
            onClick={handleExecuteBulkRestore}
            disabled={selectedManifests.size === 0 || isBulkRestoring || !!restoringPath}
            className="bg-primary hover:bg-primary/90 text-white px-5 py-2 rounded-lg font-medium text-sm flex items-center transition-all disabled:opacity-50 cursor-pointer shadow-md shadow-primary/20"
          >
            <ListChecks size={16} className="mr-2" /> {t('restore.selection.bulkRestore')}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        
        <div className="flex items-center px-2 py-1">
          <button 
            onClick={toggleAllSelection} 
            disabled={filteredManifests.length === 0 || isBulkRestoring}
            aria-label={selectedManifests.size === filteredManifests.length && filteredManifests.length > 0 ? t('restore.selection.clearAllAriaLabel', { count: filteredManifests.length }) : t('restore.selection.selectAllAriaLabel', { count: filteredManifests.length })}
            className="flex items-center text-sm font-medium text-textMuted hover:text-primary transition-colors cursor-pointer disabled:opacity-50 mr-4"
          >
            {selectedManifests.size === filteredManifests.length && filteredManifests.length > 0 ? (
              <CheckSquare size={18} className="mr-2 text-primary" />
            ) : (
              <Square size={18} className="mr-2" />
            )}
            {t('restore.selection.selectAll', { count: filteredManifests.length })}
          </button>
        </div>

        {manifests.length > 0 && filteredManifests.length === 0 ? (
          <div className="bg-surface border border-border border-dashed rounded-xl p-12 text-center text-textMuted text-sm">
            {t('restore.empty.filtered')}
          </div>
        ) : manifests.length === 0 ? (
          <div className="bg-surface border border-border border-dashed rounded-xl p-12 text-center text-textMuted text-sm">
            {t('restore.empty.initial')}
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
                        aria-label={isSelected ? t('restore.manifest.selection.unselect', { name: manifest.name }) : t('restore.manifest.selection.select', { name: manifest.name })}
                        className="mt-1 mr-4 text-textMuted hover:text-primary transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {isSelected ? <CheckSquare size={20} className="text-primary" /> : <Square size={20} />}
                      </button>
                      <div>
                        <div className="flex items-center space-x-3 mb-1">
                          <h3 className="text-lg font-bold text-textMain">{manifest.name}</h3>
                          <span className="bg-green-500/10 text-green-500 border border-green-500/20 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">{formatManifestStatus(manifest.status)}</span>
                        </div>
                        <p className="text-xs text-textMuted font-mono truncate max-w-[300px] md:max-w-md" title={t('restore.manifest.sourceTitle', { source: manifest.original_source })}>{t('restore.manifest.source', { source: manifest.original_source })}</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-6 text-xs text-textMuted ml-9 md:ml-0">
                      <div>{t('restore.manifest.date', { date: formatManifestDate(manifest.date_formatted) })}</div>
                      <div>{t('restore.manifest.encryptedBlocks', { count: formatNumber(manifest.total_files) })}</div>
                      <button 
                        onClick={() => handleExecuteRestore(manifest)} 
                        disabled={isRestoring || isBulkRestoring || (restoringPath !== null && restoringPath !== manifest.path)}
                        aria-label={t('restore.manifest.restoreAriaLabel', { name: manifest.name })}
                        className={`px-5 py-2.5 rounded-lg font-medium shadow-lg transition-all flex items-center text-sm ${isRestoring ? 'bg-primary text-white shadow-primary/20' : 'bg-surface border border-border hover:border-primary hover:text-primary cursor-pointer shadow-none'}`}
                      >
                        <Download size={16} className="mr-2" /> {isRestoring ? t('restore.manifest.restoring') : t('restore.manifest.restore')}
                      </button>
                    </div>
                  </div>

                  {isRestoring && (
                    <div className="bg-background/80 border border-primary/20 rounded-xl p-4 space-y-2 animate-in fade-in ml-9">
                      <div className="flex justify-between text-xs text-textMuted font-semibold">
                        <span>{formatRestoreStatus(statusText)}</span>
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