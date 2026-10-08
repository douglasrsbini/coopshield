import { useState, useEffect, useMemo } from 'react';
import { XCircle, Plus, Layers, Play, Clock, FolderOpen, Cloud, X, Shield, FolderSearch, Pencil, Trash2, CheckCircle2, AlertCircle, Info, CheckSquare, Search, LayoutGrid, List } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { ask } from '@tauri-apps/plugin-dialog';
import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DEFAULT_SCHEDULE, formatDateTime, getNextRun, parseSchedule, serializeSchedule, type ScheduleSpec } from '../utils/schedule';

interface Routine { id?: number; name: string; source_path: string; destination_vault: string; schedule: string; }
// NOVA INTERFACE PARA COFRES CLOUD
interface CloudVault { id?: number; name: string; provider: string; }
interface Toast { id: number; title: string; message: string; type: 'success' | 'error' | 'info'; }

export default function BackupRoutines() {
  const { t, i18n } = useTranslation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [cloudVaults, setCloudVaults] = useState<CloudVault[]>([]); // NOVO ESTADO
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  const [selectedRoutines, setSelectedRoutines] = useState<number[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [viewMode, setViewMode] = useState<'grid' | 'compact'>(() => {
    const savedMode = localStorage.getItem('coopshield_routine_view_mode');
    return (savedMode === 'compact' || savedMode === 'grid') ? savedMode : 'grid';
  });

  const { activeTasks, failedRuns } = useOutletContext<{ activeTasks: Record<number, { progress: number; status: string }>; failedRuns: Record<number, string> }>();

  const [formData, setFormData] = useState({ name: '', source_path: '', destination_vault: 'Local: ', schedule: serializeSchedule(DEFAULT_SCHEDULE) });
  const [scheduleType, setScheduleType] = useState<'daily' | 'interval6' | 'manual' | 'custom'>('daily');
  const [customFrequency, setCustomFrequency] = useState<'daily' | 'weekdays' | 'weekly'>('daily');
  const [customTime, setCustomTime] = useState('02:00');
  const [repeatEvery, setRepeatEvery] = useState('1');

  const changeViewMode = (mode: 'grid' | 'compact') => {
    setViewMode(mode);
    localStorage.setItem('coopshield_routine_view_mode', mode);
  };

  const removeToast = (id: number) => { setToasts(prev => prev.filter(t => t.id !== id)); };

  const showToast = (title: string, message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now() + Math.random(); 
    setToasts(prev => [...prev, { id, title, message, type }]);
    setTimeout(() => { removeToast(id); }, 4000);
  };

  useEffect(() => {
    let spec: ScheduleSpec;
    if (scheduleType === 'custom') {
      const every = Number(repeatEvery);
      spec = customFrequency === 'daily' && every < 24
        ? { v: 1, kind: 'interval', every, time: customTime }
        : { v: 1, kind: customFrequency, time: customTime, ...(customFrequency === 'weekly' ? { day: 1 } : {}) };
    } else if (scheduleType === 'interval6') {
      spec = { v: 1, kind: 'interval', every: 6, time: '00:00' };
    } else if (scheduleType === 'manual') {
      spec = { v: 1, kind: 'manual', time: '00:00' };
    } else {
      spec = DEFAULT_SCHEDULE;
    }
    setFormData(prev => ({ ...prev, schedule: serializeSchedule(spec) }));
  }, [scheduleType, customFrequency, customTime, repeatEvery]);

  const describeSchedule = (raw: string): string => {
    const spec = parseSchedule(raw);
    switch (spec.kind) {
      case 'manual': return t('routines.schedule.manual');
      case 'interval': return t('routines.schedule.interval', { hours: spec.every ?? 1, time: spec.time });
      case 'weekdays': return t('routines.schedule.weekdays', { time: spec.time });
      case 'weekly': return t('routines.schedule.weekly', { time: spec.time });
      default: return t('routines.schedule.daily', { time: spec.time });
    }
  };

  const handleSelectFolder = async () => {
    try {
      const path = await invoke<string>('select_folder_dialog');
      if (path) setFormData(prev => ({ ...prev, source_path: path }));
    } catch (error) { console.log("Cancelado:", error); }
  };

  // BUSCA ROTINAS E COFRES CLOUD EM SIMULTÂNEO
  const fetchRoutines = async () => {
    try {
      const data = await invoke<Routine[]>('get_routines');
      setRoutines(data);
      const vaults = await invoke<CloudVault[]>('get_cloud_vaults');
      setCloudVaults(vaults);
    } catch (error) { showToast(t('routines.toast.error'), t('routines.toast.loadFailed'), 'error'); }
  };

  useEffect(() => { fetchRoutines(); }, []);

  const filteredRoutines = useMemo(() => {
    return routines.filter(r => 
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.source_path.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [routines, searchTerm]);

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormData({ name: '', source_path: '', destination_vault: 'Local: ', schedule: serializeSchedule(DEFAULT_SCHEDULE) });
    setScheduleType('daily');
    setCustomFrequency('daily');
    setCustomTime('02:00');
    setRepeatEvery('1');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (routine: Routine) => {
    setEditingId(routine.id || null);
    setFormData({ name: routine.name, source_path: routine.source_path, destination_vault: routine.destination_vault, schedule: routine.schedule });
    
    const spec = parseSchedule(routine.schedule);
    setCustomTime(spec.time);
    if (spec.kind === 'manual') setScheduleType('manual');
    else if (spec.kind === 'interval' && spec.every === 6 && spec.time === '00:00') setScheduleType('interval6');
    else if (spec.kind === 'daily' && spec.time === '02:00') setScheduleType('daily');
    else {
      setScheduleType('custom');
      if (spec.kind === 'interval') { setCustomFrequency('daily'); setRepeatEvery(String(spec.every ?? 1)); }
      else { setCustomFrequency(spec.kind === 'weekdays' || spec.kind === 'weekly' ? spec.kind : 'daily'); setRepeatEvery('24'); }
    }    setIsModalOpen(true);
  };

  const handleDeleteRoutine = async (id?: number) => {
    if (!id) return;
    const confirmed = await ask(t('routines.confirmDelete'), { title: 'Kopher Shield', kind: 'warning' });
    if (!confirmed) return;
    try {
      await invoke('delete_routine', { id });
      showToast(t('routines.toast.deleted'), t('routines.toast.deletedMsg'), 'success');
      setSelectedRoutines(prev => prev.filter(r_id => r_id !== id));
      fetchRoutines();
    } catch (error) { showToast(t('routines.toast.error'), t('routines.toast.deleteFailed', { error: String(error) }), 'error'); }
  };

  const handleSaveRoutine = async () => {
    if (!formData.name || !formData.source_path) return showToast(t('routines.toast.warning'), t('routines.toast.required'), 'error');
    if (!formData.destination_vault || formData.destination_vault === 'Local: ') return showToast(t('routines.toast.warning'), t('routines.toast.destRequired'), 'error');
    
    setIsSaving(true);
    try {
      if (editingId !== null) await invoke('update_routine', { routine: { id: editingId, ...formData } });
      else await invoke('add_routine', { routine: formData });
      showToast(t('routines.toast.success'), t('routines.toast.saved'), 'success');
      setIsModalOpen(false);
      fetchRoutines();
    } catch (error) { showToast(t('routines.toast.error'), String(error), 'error'); } 
    finally { setIsSaving(false); }
  };

  const handleExecuteRoutine = async (routine: Routine) => {
    if (!routine.id) return;
    try {
      showToast(t('routines.toast.starting'), t('routines.toast.startingMsg'), 'info');
      await invoke('execute_backup_routine', { 
        routineId: routine.id,
        routineName: routine.name,
        sourcePath: routine.source_path,
        destinationVault: routine.destination_vault
      });
    } catch (error) {
      showToast(t('routines.toast.engineFail'), t('routines.toast.engineFailMsg', { error: String(error) }), 'error');
    }
  };

  const handleBatchExecute = async () => {
    if (selectedRoutines.length === 0) return;
    showToast(t('routines.toast.fleet'), t('routines.toast.fleetMsg', { count: selectedRoutines.length }), 'info');

    for (const routineId of selectedRoutines) {
      const routine = routines.find(r => r.id === routineId);
      if (routine && routine.id) {
        invoke('execute_backup_routine', { 
          routineId: routine.id,
          routineName: routine.name,
          sourcePath: routine.source_path,
          destinationVault: routine.destination_vault
        }).catch(error => {
          showToast(t('routines.toast.batchError'), t('routines.toast.batchErrorMsg', { name: routine.name, error: String(error) }), 'error');
        });
      }
    }
    setSelectedRoutines([]);
  };

  const toggleSelection = (id: number) => {
    setSelectedRoutines(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const toggleAll = () => {
    const availableRoutines = filteredRoutines.filter(r => r.id && !activeTasks[r.id]);
    if (selectedRoutines.length === availableRoutines.length && availableRoutines.length > 0) {
      setSelectedRoutines([]);
    } else {
      setSelectedRoutines(availableRoutines.map(r => r.id as number));
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-[1600px] mx-auto relative pb-24">
      
      {/* TOASTS */}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col space-y-3 pointer-events-none">
        {toasts.map(toast => (
          <div key={toast.id} className={`w-80 p-4 rounded-xl shadow-2xl border flex items-start space-x-3 pointer-events-auto animate-in slide-in-from-right-8 fade-in duration-300 ${toast.type === 'success' ? 'bg-surface/95 border-green-500/40 backdrop-blur-sm' : toast.type === 'error' ? 'bg-surface/95 border-red-500/40 backdrop-blur-sm' : 'bg-surface/95 border-amber-500/40 backdrop-blur-sm'}`}>
            <div className="shrink-0 mt-0.5">{toast.type === 'success' && <CheckCircle2 size={18} className="text-green-500" />}{toast.type === 'error' && <AlertCircle size={18} className="text-red-500" />}{toast.type === 'info' && <Info size={18} className="text-amber-500" />}</div>
            <div className="flex flex-col flex-1">
              <h4 className={`text-sm font-bold ${toast.type === 'success' ? 'text-green-500' : toast.type === 'error' ? 'text-red-500' : 'text-amber-500'}`}>{toast.title}</h4>
              <p className="text-xs text-textMuted mt-1 leading-relaxed">{toast.message}</p>
            </div>
            <button onClick={() => removeToast(toast.id)} className="text-textMuted hover:text-textMain transition-colors cursor-pointer shrink-0"><X size={16} /></button>
          </div>
        ))}
      </div>

      <div className="flex justify-between items-end border-b border-border/50 pb-6">
        <div>
          <h1 className="text-3xl font-bold mb-2 tracking-tight text-textMain">{t('routines.title')}</h1>
          <p className="text-sm text-textMuted">{t('routines.subtitle')}</p>
        </div>
        <button onClick={handleOpenCreate} className="bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-lg font-medium flex items-center transition-all shadow-lg shadow-primary/20 cursor-pointer text-sm h-fit">
          <Plus size={18} className="mr-2" /> {t('routines.newRoutine')}
        </button>
      </div>

      <div className="bg-surface border border-border rounded-xl p-3 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex space-x-3 w-full md:w-auto">
          {filteredRoutines.length > 0 && (
            <button onClick={toggleAll} className="text-sm text-textMuted hover:text-primary transition-colors flex items-center cursor-pointer px-3 bg-background border border-border rounded-lg py-2">
              <CheckSquare size={16} className="mr-2" />
              {selectedRoutines.length > 0 && selectedRoutines.length === filteredRoutines.filter(r => r.id && !activeTasks[r.id]).length ? t('routines.deselectAll') : t('routines.selectBatch')}
            </button>
          )}
        </div>

        <div className="flex w-full md:w-auto space-x-3">
          <div className="relative flex-1 md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" size={16} />
            <input type="text" placeholder={t('routines.search')} aria-label={t('routines.search')} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-background border border-border rounded-lg pl-9 pr-4 py-2 text-sm text-textMain focus:border-primary outline-none transition-all" />
          </div>
          <div className="flex bg-background border border-border rounded-lg p-1 shrink-0">
            <button onClick={() => changeViewMode('grid')} className={`p-1.5 rounded-md transition-all cursor-pointer ${viewMode === 'grid' ? 'bg-primary/10 text-primary' : 'text-textMuted hover:text-textMain'}`} title={t('routines.viewGrid')} aria-label={t('routines.viewGrid')}><LayoutGrid size={16} /></button>
            <button onClick={() => changeViewMode('compact')} className={`p-1.5 rounded-md transition-all cursor-pointer ${viewMode === 'compact' ? 'bg-primary/10 text-primary' : 'text-textMuted hover:text-textMain'}`} title={t('routines.viewCompact')} aria-label={t('routines.viewCompact')}><List size={16} /></button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5">
        {routines.length === 0 ? (
          <div className="bg-surface border border-border border-dashed rounded-xl p-10 text-center text-textMuted text-sm">{t('routines.emptyNone')}</div>
        ) : filteredRoutines.length === 0 ? (
          <div className="bg-surface border border-border border-dashed rounded-xl p-10 text-center text-textMuted text-sm">{t('routines.emptyNoMatch')}</div>
        ) : (
          filteredRoutines.map((routine) => {
            const task = routine.id ? activeTasks[routine.id] : undefined;
            const isExecuting = !!task;
            const failureReason = routine.id && !isExecuting ? failedRuns?.[routine.id] : undefined;
            const isFailed = failureReason !== undefined;
            const isSelected = routine.id ? selectedRoutines.includes(routine.id) : false;

            if (viewMode === 'compact') {
              return (
                <div key={routine.id} onClick={() => { if (routine.id && !isExecuting) toggleSelection(routine.id); }} className={`bg-surface border rounded-xl flex items-center justify-between p-3 transition-all shadow-sm ${isSelected ? 'border-primary shadow-[0_0_10px_rgba(59,130,246,0.1)] bg-primary/5' : isExecuting ? 'border-primary/50' : 'border-border hover:border-primary/40 cursor-pointer'}`}>
                  <div className="flex items-center space-x-4 min-w-0 flex-1">
                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-primary border-primary text-white' : 'border-textMuted bg-background'}`}>
                      {isSelected && <CheckCircle2 size={10} />}
                    </div>
                    <div className="min-w-0 flex-1 flex flex-col md:flex-row md:items-center md:space-x-8">
                      <div className="flex items-center space-x-3">
                        <h3 className="text-sm font-bold truncate text-textMain min-w-[200px]">{routine.name}</h3>
                        {isFailed && (
                           <span title={failureReason} className="bg-red-500/10 text-red-500 border border-red-500/30 text-[9px] uppercase font-bold px-2 py-0.5 rounded flex items-center justify-center text-center leading-tight whitespace-normal break-words shrink-0">
                             <XCircle size={10} className="mr-1" aria-hidden="true" /> {t('routines.failed')}
                           </span>
                        )}
                        {isExecuting && (
                           <span className="bg-primary/10 text-primary text-[9px] uppercase font-bold px-2 py-0.5 rounded flex items-center justify-center text-center leading-tight whitespace-normal break-words shrink-0">
                             <div className="w-1.5 h-1.5 bg-primary rounded-full mr-1.5 shrink-0 animate-pulse"></div> {t('routines.processing')}
                           </span>
                        )}
                      </div>
                      <div className="flex space-x-6 text-xs text-textMuted truncate mt-1 md:mt-0">
                        <span className="flex items-center truncate" title={routine.source_path}><FolderOpen size={12} className="mr-1.5 text-primary shrink-0" /> {routine.source_path.split('\\').pop() || routine.source_path}</span>
                        <span className="flex items-center truncate" title={describeSchedule(routine.schedule)}><Clock size={12} className="mr-1.5 text-amber-500 shrink-0" /> {describeSchedule(routine.schedule)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 shrink-0 ml-4" onClick={(e) => e.stopPropagation()}>
                    {isExecuting ? (
                      <div className="flex items-center w-48 mr-2">
                        <span className="text-[10px] text-primary font-bold mr-2 w-8">{task.progress}%</span>
                        <div className="w-full bg-background rounded-full h-1.5 border border-border overflow-hidden">
                          <div className="bg-primary h-1.5 rounded-full transition-all duration-200" style={{ width: `${task.progress}%` }}></div>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => handleExecuteRoutine(routine)} className="text-primary hover:bg-primary/10 p-2 rounded-md transition-colors cursor-pointer" title={t('routines.run')} aria-label={t('routines.run')}><Play size={16} /></button>
                    )}
                    <div className="w-px h-4 bg-border mx-1"></div>
                    <button onClick={() => handleOpenEdit(routine)} disabled={isExecuting} className="text-textMuted hover:text-textMain p-1.5 rounded-md transition-colors cursor-pointer disabled:opacity-50"><Pencil size={14} /></button>
                    <button onClick={() => handleDeleteRoutine(routine.id)} disabled={isExecuting} className="text-textMuted hover:text-red-500 p-1.5 rounded-md transition-colors cursor-pointer disabled:opacity-50"><Trash2 size={14} /></button>
                  </div>
                </div>
              );
            }

            return (
              <div key={routine.id} onClick={() => { if (routine.id && !isExecuting) toggleSelection(routine.id); }} className={`bg-surface border rounded-xl flex flex-col transition-all shadow-sm overflow-hidden ${isSelected ? 'border-primary shadow-[0_0_15px_rgba(59,130,246,0.15)] bg-primary/5' : isExecuting ? 'border-primary/50 shadow-[0_0_15px_rgba(59,130,246,0.1)]' : 'border-border hover:border-primary/40 cursor-pointer'}`}>
                <div className={`flex justify-between items-center p-4 border-b border-border/50 ${isSelected ? 'bg-primary/5' : 'bg-background/30'}`}>
                  <div className="flex items-center space-x-4 min-w-0">
                    <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-primary border-primary text-white' : 'border-textMuted bg-background'}`}>
                      {isSelected && <CheckCircle2 size={14} />}
                    </div>
                    <div className="bg-primary/10 p-2 rounded-lg text-primary shrink-0"><Layers size={18} /></div>
                    <h3 className="text-base font-bold truncate text-textMain">{routine.name}</h3>
                  </div>
                  <span title={failureReason} className={`${isExecuting ? 'bg-primary/10 text-primary border-primary/20' : isFailed ? 'bg-red-500/10 text-red-500 border-red-500/30 shadow-[0_0_12px_rgba(239,68,68,0.3)]' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.3)]'} border text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-full flex items-center justify-center text-center leading-tight whitespace-normal break-words min-w-[5.5rem] max-w-[45%] shrink-0 ml-4`}>
                    <div className={`w-1.5 h-1.5 rounded-full mr-1.5 shrink-0 ${isExecuting ? 'bg-primary animate-pulse' : isFailed ? 'bg-red-500' : 'bg-emerald-500'}`}></div> 
                    {isExecuting ? t('routines.running') : isFailed ? t('routines.failed') : t('routines.active')}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 xl:gap-6 p-5 bg-background/10 pointer-events-none">
                  <div className="flex flex-col min-w-0">
                    <span className="text-[11px] text-textMuted uppercase tracking-wider font-semibold mb-1.5 flex items-center"><FolderOpen size={12} className="mr-1.5 text-primary shrink-0" /> {t('routines.source')}</span>
                    <span className="text-sm text-textMain truncate" title={routine.source_path}>{routine.source_path}</span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[11px] text-textMuted uppercase tracking-wider font-semibold mb-1.5 flex items-center"><Cloud size={12} className="mr-1.5 text-amber-500 shrink-0" /> {t('routines.destination')}</span>
                    <span className="text-sm text-textMain truncate" title={routine.destination_vault}>{routine.destination_vault}</span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[11px] text-textMuted uppercase tracking-wider font-semibold mb-1.5 flex items-center"><Clock size={12} className="mr-1.5 text-amber-500 shrink-0" /> {t('routines.scheduleLabel')}</span>
                    <span className="text-sm text-textMain truncate" title={describeSchedule(routine.schedule)}>{describeSchedule(routine.schedule)}</span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[11px] text-textMuted uppercase tracking-wider font-semibold mb-1.5 flex items-center"><Clock size={12} className="mr-1.5 text-primary" aria-hidden="true" /> {t('routines.nextRun')}</span>
                    <span className="text-sm font-bold text-primary whitespace-nowrap truncate drop-shadow-md">
                      {(() => { const n = isExecuting ? null : getNextRun(parseSchedule(routine.schedule)); return isExecuting ? t('routines.runningNow') : n ? formatDateTime(n, i18n.language) : t('routines.manualOnly'); })()}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-2 p-3 border-t border-border/50 bg-surface min-h-[60px]" onClick={(e) => e.stopPropagation()}>
                  {isExecuting ? (
                    <div className="flex flex-col flex-1 max-w-md mr-4 animate-in fade-in slide-in-from-right-4">
                      <div className="flex justify-between text-[10px] text-textMuted font-bold uppercase tracking-wider mb-1.5">
                        <span className="truncate pr-2">{task.status}</span>
                        <span className="text-primary">{task.progress}%</span>
                      </div>
                      <div className="w-full bg-background rounded-full h-1.5 border border-border overflow-hidden">
                        <div className="bg-primary h-1.5 rounded-full transition-all duration-200" style={{ width: `${task.progress}%` }}></div>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => handleExecuteRoutine(routine)} className="bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary px-4 py-1.5 rounded-md font-medium text-sm flex items-center transition-all cursor-pointer z-10">
                      <Play size={14} className="mr-1.5 shrink-0" /> {t('routines.runNow')}
                    </button>
                  )}

                  <div className="w-px h-6 bg-border/80 mx-2"></div>
                  <button onClick={() => handleOpenEdit(routine)} disabled={isExecuting} className="bg-background hover:bg-surface/5 border border-border text-textMuted hover:text-textMain p-1.5 rounded-md transition-all cursor-pointer disabled:opacity-50 z-10" title={t('routines.edit')} aria-label={t('routines.edit')}><Pencil size={15} /></button>
                  <button onClick={() => handleDeleteRoutine(routine.id)} disabled={isExecuting} className="bg-background hover:bg-red-500/10 border border-border text-textMuted hover:text-red-500 p-1.5 rounded-md transition-all cursor-pointer disabled:opacity-50 z-10" title={t('routines.delete')} aria-label={t('routines.delete')}><Trash2 size={15} /></button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {selectedRoutines.length > 0 && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 ml-32 bg-surface border border-primary shadow-[0_0_30px_rgba(59,130,246,0.3)] rounded-full px-6 py-4 flex items-center space-x-6 animate-in slide-in-from-bottom-8 z-50">
          <span className="text-textMain font-bold">
            <span className="text-primary text-xl mr-2">{selectedRoutines.length}</span>
            {t('routines.selected', { count: selectedRoutines.length })}
          </span>
          <button onClick={handleBatchExecute} className="bg-primary hover:bg-primary/90 text-white px-6 py-2.5 rounded-full font-bold shadow-md transition-all flex items-center cursor-pointer">
            <Play size={18} className="mr-2" /> {t('routines.runFleet')}
          </button>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-border/50">
              <h2 className="text-xl font-bold text-textMain">{editingId !== null ? t('routines.modal.edit') : t('routines.modal.create')}</h2>
              <button onClick={() => setIsModalOpen(false)} aria-label={t('routines.modal.close')} className="text-textMuted hover:text-textMain transition-colors p-1 rounded-md hover:bg-surface/10 cursor-pointer"><X size={24} /></button>
            </div>

            <div className="p-6 space-y-5">
              <div><label className="block text-sm font-medium text-textMuted mb-1.5">{t('routines.form.name')}</label><input type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder={t('routines.form.namePlaceholder')} className="w-full bg-background border border-border rounded-lg px-4 py-2 text-sm text-textMain focus:border-primary outline-none transition-all" /></div>
              <div>
                <label className="block text-sm font-medium text-textMuted mb-1.5">{t('routines.form.source')}</label>
                <div className="flex space-x-2">
                  <input type="text" value={formData.source_path} readOnly className="w-full bg-background border border-border rounded-lg px-4 py-2 text-sm text-textMain outline-none cursor-pointer truncate" onClick={handleSelectFolder} />
                  <button type="button" onClick={handleSelectFolder} className="bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary px-4 py-2 rounded-lg font-medium text-sm flex items-center transition-all shrink-0 cursor-pointer"><FolderSearch size={16} className="mr-2" /> {t('routines.form.browse')}</button>
                </div>
              </div>
              
              {/* O NOVO SELETOR DE COFRES DINÂMICO */}
              <div>
                <label className="block text-sm font-medium text-textMuted mb-1.5">{t('routines.form.vault')}</label>
                <select 
                  value={formData.destination_vault.startsWith('Local:') ? 'Local' : formData.destination_vault} 
                  onChange={(e) => { setFormData({...formData, destination_vault: e.target.value === 'Local' ? 'Local: ' : e.target.value}); }} 
                  className="w-full bg-background border border-border rounded-lg px-4 py-2 text-sm text-textMain focus:border-primary outline-none appearance-none cursor-pointer"
                >
                  <option value="Local">💻 {t('routines.form.vaultLocal')}</option>
                  {cloudVaults.map(vault => (
                    <option key={vault.id} value={`Cloud: ${vault.name}`}>☁️ {t('routines.form.vaultCloud', { name: vault.name, provider: vault.provider })}</option>
                  ))}
                </select>
                
                {formData.destination_vault.startsWith('Local') && (
                  <div className="mt-3 bg-background/50 p-3 rounded-lg border border-border">
                    <label className="block text-xs font-medium text-textMuted mb-1.5">{t('routines.form.localFolder')}</label>
                    <div className="flex space-x-2">
                      <input type="text" value={formData.destination_vault.replace('Local: ', '')} readOnly className="w-full bg-background border border-border rounded-md px-3 py-1.5 text-sm text-textMain outline-none cursor-pointer truncate" onClick={async () => { const path = await invoke<string>('select_folder_dialog'); if (path) setFormData({...formData, destination_vault: `Local: ${path}`}); }} />
                      <button type="button" onClick={async () => { const path = await invoke<string>('select_folder_dialog'); if (path) setFormData({...formData, destination_vault: `Local: ${path}`}); }} className="bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary px-3 py-1.5 rounded-md font-medium text-sm flex items-center transition-all shrink-0 cursor-pointer"><FolderSearch size={14} className="mr-1.5" /> {t('routines.form.browseNas')}</button>
                    </div>
                  </div>
                )}
              </div>
              
              <div>
                <label htmlFor="routine-frequency" className="block text-sm font-medium text-textMuted mb-1.5">{t('routines.form.frequency')}</label>
                <select id="routine-frequency" value={scheduleType} onChange={(e) => setScheduleType(e.target.value as typeof scheduleType)} className="w-full bg-background border border-border rounded-lg px-4 py-2 text-sm text-textMain focus:border-primary outline-none appearance-none cursor-pointer">
                  <option value="daily">{t('routines.schedule.daily', { time: '02:00' })}</option>
                  <option value="interval6">{t('routines.schedule.interval', { hours: 6, time: '00:00' })}</option>
                  <option value="manual">{t('routines.schedule.manual')}</option>
                  <option value="custom">⚙️ {t('routines.form.custom')}</option>
                </select>
              </div>
              {scheduleType === 'custom' && (
                <div className="bg-background/80 border border-border rounded-xl p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div><label htmlFor="routine-model" className="block text-xs text-textMuted mb-1">{t('routines.form.model')}</label><select id="routine-model" value={customFrequency} onChange={(e) => setCustomFrequency(e.target.value as typeof customFrequency)} className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-textMain outline-none"><option value="daily">{t('routines.form.daily')}</option><option value="weekdays">{t('routines.form.weekdays')}</option><option value="weekly">{t('routines.form.weekly')}</option></select></div>
                    <div><label htmlFor="routine-repeat" className="block text-xs text-textMuted mb-1">{t('routines.form.repeat')}</label><select id="routine-repeat" disabled={customFrequency !== 'daily'} value={repeatEvery} onChange={(e) => setRepeatEvery(e.target.value)} className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-textMain outline-none">{['1','3','6','24'].map(h => <option key={h} value={h}>{t('routines.form.hours', { count: Number(h) })}</option>)}</select></div>
                  </div>
                  <div><label htmlFor="routine-time" className="block text-xs text-textMuted mb-1">{t('routines.form.baseTime')}</label><input id="routine-time" type="time" value={customTime} onChange={(e) => setCustomTime(e.target.value)} className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-sm text-textMain outline-none" /></div>
                </div>
              )}
            </div>
            <div className="p-5 border-t border-border/50 bg-background/50 flex justify-end space-x-3">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 rounded-lg font-medium text-sm text-textMuted hover:text-textMain hover:bg-surface transition-all cursor-pointer">{t('routines.form.cancel')}</button>
              <button onClick={handleSaveRoutine} disabled={isSaving} className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg font-medium text-sm shadow-md transition-all flex items-center disabled:opacity-50 cursor-pointer"><Shield size={16} className="mr-2" />{isSaving ? t('routines.form.saving') : t('routines.form.save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}