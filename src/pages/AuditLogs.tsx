import { useState, useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Terminal, AlertCircle, RefreshCw, Search, ShieldAlert, CheckCircle2, Info, AlertTriangle, Filter, Database, Download, Printer, Clock, FileText, ArrowUpDown, ChevronUp, ChevronDown, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';
import { BTN_SECONDARY, BTN_PRIMARY, INPUT_BASE, FOCUS_RING } from '../ui/tokens';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface AuditLog { timestamp: string; level: string; message: string; }
interface Toast { id: number; title: string; message: string; type: 'success' | 'error' | 'info'; }

export default function AuditLogs() {
  const { t, i18n } = useTranslation();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [levelFilter, setLevelFilter] = useState('ALL');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: keyof AuditLog, direction: 'asc' | 'desc' }>({ key: 'timestamp', direction: 'desc' });
  const [isExporting, setIsExporting] = useState(false);

  const showToast = (title: string, message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now() + Math.random(); 
    setToasts(prev => [...prev, { id, title, message, type }]);
    setTimeout(() => { setToasts(prev => prev.filter(x => x.id !== id)); }, 4000);
  };

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const data = await invoke<AuditLog[]>('read_audit_logs');
      setLogs(data);
    } catch (error) {
      showToast(t('common.status.error'), t('audit.toast.loadFailed'), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, []);

  const handleSort = (key: keyof AuditLog) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const processedLogs = useMemo(() => {
    const filtered = logs.filter(log => {
      const matchesSearch = log.message.toLowerCase().includes(searchTerm.toLowerCase()) || log.timestamp.includes(searchTerm);
      const matchesLevel = levelFilter === 'ALL' || log.level === levelFilter;
      return matchesSearch && matchesLevel;
    });

    return filtered.sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
      if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [logs, searchTerm, levelFilter, sortConfig]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: processedLogs.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 36,
    overscan: 12,
  });

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'SUCCESS': return <CheckCircle2 size={16} className="text-green-500" />;
      case 'ERROR': return <ShieldAlert size={16} className="text-red-500" />;
      case 'WARNING': return <AlertTriangle size={16} className="text-amber-500" />;
      default: return <Info size={16} className="text-slate-400" />;
    }
  };

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'SUCCESS': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'ERROR': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'WARNING': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  const handleExportCSV = async () => {
    if (processedLogs.length === 0) return;
    try {
      const filePath = await save({
        filters: [{ name: t('audit.export.csvFilter'), extensions: ['csv'] }],
        defaultPath: `kopher_shield_auditoria_${new Date().toISOString().slice(0,10)}.csv`
      });
      if (!filePath) return; 

      const csvContent = [t('audit.export.csvHeader'), ...processedLogs.map(log => `"${log.timestamp}","${log.level}","${log.message.replace(/"/g, '""')}"`)].join("\n");
      await invoke('save_report_file', { path: filePath, content: csvContent, isBase64: false });
      showToast(t('common.status.success'), t('audit.toast.csvOk'), 'success');
    } catch (e) {
      showToast(t('common.status.error'), t('audit.toast.saveFailed', { error: String(e) }), 'error');
    }
  };

  const handlePrintPDF = async () => {
    if (processedLogs.length === 0 || isExporting) return;
    setIsExporting(true);
    
    try {
      const filePath = await save({
        filters: [{ name: t('audit.export.pdfFilter'), extensions: ['pdf'] }],
        defaultPath: `relatorio_auditoria_kopher_shield_${new Date().toISOString().slice(0,10)}.pdf`
      });

      if (!filePath) {
        setIsExporting(false);
        return; 
      }

      const doc = new jsPDF();
      
      doc.setFontSize(22);
      doc.setTextColor(15, 23, 42); 
      doc.text('KOPHER SHIELD', 105, 20, { align: 'center' });
      
      doc.setFontSize(12);
      doc.setTextColor(100, 116, 139); 
      doc.text(t('audit.pdf.title'), 105, 28, { align: 'center' });
      
      doc.setFontSize(10);
      doc.text(t('audit.pdf.issued', { date: new Date().toLocaleString(i18n.resolvedLanguage), count: processedLogs.length }), 105, 34, { align: 'center' });

      doc.setDrawColor(203, 213, 225);
      doc.line(14, 40, 196, 40);

      const tableData = processedLogs.map(log => [
        log.timestamp,
        log.level,
        log.message
      ]);

      // A mesma técnica segura: invocando a função solta, sem acoplamento implícito
      autoTable(doc, {
        startY: 45,
        head: [[t('audit.columns.timestamp'), t('audit.columns.level'), t('audit.columns.message')]],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85], fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 3 },
        columnStyles: {
          0: { cellWidth: 35 },
          1: { cellWidth: 25, fontStyle: 'bold' },
          2: { cellWidth: 'auto' }
        },
        didParseCell: function(data) {
          if (data.section === 'body' && data.column.index === 1) {
            if (data.cell.raw === 'SUCCESS') data.cell.styles.textColor = [16, 185, 129];
            if (data.cell.raw === 'ERROR') data.cell.styles.textColor = [239, 68, 68];
            if (data.cell.raw === 'WARNING') data.cell.styles.textColor = [245, 158, 11];
            if (data.cell.raw === 'INFO') data.cell.styles.textColor = [59, 130, 246];
          }
        }
      });

      const pdfBase64 = doc.output('datauristring').split(',')[1];

      await invoke('save_report_file', { 
        path: filePath, 
        content: pdfBase64,
        isBase64: true // <-- Usando o snake_case auto-convertido do Tauri para true
      });

      showToast(t('common.status.success'), t('audit.toast.pdfOk'), 'success');

    } catch(e) {
      showToast(t('audit.toast.exportError'), t('audit.toast.saveFailed', { error: String(e) }), 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const getSortIcon = (col: keyof AuditLog) => {
    if (sortConfig.key !== col) return <ArrowUpDown size={12} className="ml-1.5 opacity-30" />;
    return sortConfig.direction === 'asc' ? <ChevronUp size={13} className="ml-1.5 text-primary" /> : <ChevronDown size={13} className="ml-1.5 text-primary" />;
  };

  return (
    <div className="flex flex-col h-full space-y-6 animate-in fade-in duration-500 max-w-[1600px] mx-auto overflow-hidden">
      
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col space-y-3 pointer-events-none">
        {toasts.map(toast => (
          <div key={toast.id} className={`w-80 p-4 rounded-xl shadow-2xl border flex items-start space-x-3 pointer-events-auto animate-in slide-in-from-right-8 fade-in duration-300 ${toast.type === 'success' ? 'bg-surface/95 border-green-500/40' : toast.type === 'error' ? 'bg-surface/95 border-red-500/40' : 'bg-surface/95 border-amber-500/40'}`}>
            <div className="shrink-0 mt-0.5">
              {toast.type === 'success' && <CheckCircle2 size={18} className="text-green-500" />}
              {toast.type === 'error' && <AlertCircle size={18} className="text-red-500" />}
              {toast.type === 'info' && <Info size={18} className="text-amber-500" />}
            </div>
            <div className="flex flex-col flex-1">
              <h4 className={`text-sm font-bold ${toast.type === 'success' ? 'text-green-500' : toast.type === 'error' ? 'text-red-500' : 'text-amber-500'}`}>{toast.title}</h4>
              <p className="text-xs text-textMuted mt-1 leading-relaxed">{toast.message}</p>
            </div>
            <button onClick={() => setToasts(prev => prev.filter(x => x.id !== toast.id))} aria-label={t('common.actions.close')} className={`text-textMuted hover:text-textMain transition-all duration-300 cursor-pointer shrink-0 rounded-md ${FOCUS_RING}`}><X className="w-4 h-4" aria-hidden="true" /></button>
          </div>
        ))}
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-border/50 pb-6 gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold mb-2 tracking-tight flex items-center gap-3 text-textMain"><Terminal className="w-6 h-6 shrink-0 text-primary" aria-hidden="true" /> {t('nav.audit')}</h1>
          <p className="text-sm text-textMuted">{t('audit.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-3 w-full md:w-auto">
          <button onClick={handleExportCSV} disabled={processedLogs.length === 0} className={BTN_SECONDARY}>
            <Download className="w-4 h-4 text-green-500" aria-hidden="true" /> {t('audit.export.csv')}
          </button>
          <button onClick={handlePrintPDF} disabled={processedLogs.length === 0 || isExporting} className={BTN_SECONDARY}>
            <Printer className={`w-4 h-4 ${isExporting ? 'animate-pulse text-textMuted' : 'text-amber-500'}`} aria-hidden="true" /> {isExporting ? t('audit.export.generating') : t('audit.export.pdf')}
          </button>
          <button onClick={fetchLogs} disabled={isLoading} className={BTN_PRIMARY}>
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" /> {t('audit.refresh')}
          </button>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-5 shadow-sm flex flex-col md:flex-row gap-4 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-textMuted" aria-hidden="true" />
          <input type="text" placeholder={t('audit.searchPlaceholder')} aria-label={t('audit.searchPlaceholder')} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className={`${INPUT_BASE} pl-10`} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Filter className="w-5 h-5 text-textMuted" aria-hidden="true" />
          <select aria-label={t('audit.filter.label')} value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className={`${INPUT_BASE} cursor-pointer min-w-[200px]`}>
            <option value="ALL">{t('audit.filter.all')}</option><option value="INFO">{t('audit.filter.info')}</option><option value="SUCCESS">{t('audit.filter.success')}</option><option value="WARNING">{t('audit.filter.warning')}</option><option value="ERROR">{t('audit.filter.error')}</option>
          </select>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-inner relative flex flex-col flex-1 min-h-0 text-textMain">
        
        <div className="bg-background border-b border-border/50 px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center">
            <div className="flex space-x-1.5 mr-4">
              <div className="w-3 h-3 rounded-full bg-red-500/80"></div><div className="w-3 h-3 rounded-full bg-amber-500/80"></div><div className="w-3 h-3 rounded-full bg-green-500/80"></div>
            </div>
            <span className="text-xs font-mono text-textMuted flex items-center"><Database size={12} className="mr-1.5" /> root@kopher-shield:/var/log/audit.log</span>
          </div>
          <span className="text-[10px] text-textMuted font-mono uppercase tracking-wider">{t('audit.shown', { count: processedLogs.length })}</span>
        </div>

        <div
          ref={scrollRef}
          role="table"
          aria-label={t('nav.audit')}
          aria-rowcount={processedLogs.length}
          className="overflow-auto flex-1 min-h-0 font-mono text-[13px] selection:bg-primary/30"
        >
          <div className="min-w-[780px]">
            <div role="row" className="sticky top-0 z-10 grid grid-cols-[170px_150px_minmax(300px,1fr)] gap-4 items-center px-6 py-2.5 border-b border-border/50 bg-background/95 backdrop-blur font-sans shadow-sm select-none">
<div onClick={() => handleSort('timestamp')} role="button" tabIndex={0} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleSort('timestamp')} className={`min-w-0 whitespace-nowrap overflow-hidden text-[11px] font-bold uppercase tracking-widest flex items-center cursor-pointer transition-colors rounded ${FOCUS_RING} ${sortConfig.key === 'timestamp' ? 'text-primary' : 'text-textMuted hover:text-textMain'}`}>
            <Clock className="w-4 h-4 mr-1.5 opacity-70" aria-hidden="true"/> {t('audit.columns.timestamp')} {getSortIcon('timestamp')}
          </div>
          <div onClick={() => handleSort('level')} role="button" tabIndex={0} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleSort('level')} className={`min-w-0 whitespace-nowrap overflow-hidden text-[11px] font-bold uppercase tracking-widest flex items-center cursor-pointer transition-colors rounded ${FOCUS_RING} ${sortConfig.key === 'level' ? 'text-primary' : 'text-textMuted hover:text-textMain'}`}>
            <ShieldAlert className="w-4 h-4 mr-1.5 opacity-70" aria-hidden="true"/> {t('audit.columns.level')} {getSortIcon('level')}
          </div>
          <div onClick={() => handleSort('message')} role="button" tabIndex={0} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleSort('message')} className={`min-w-0 whitespace-nowrap overflow-hidden text-[11px] font-bold uppercase tracking-widest flex items-center cursor-pointer transition-colors rounded ${FOCUS_RING} ${sortConfig.key === 'message' ? 'text-primary' : 'text-textMuted hover:text-textMain'}`}>
            <FileText className="w-4 h-4 mr-1.5 opacity-70" aria-hidden="true"/> {t('audit.columns.message')} {getSortIcon('message')}
          </div>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center h-40 text-textMuted"><RefreshCw size={24} className="animate-spin mr-3 text-primary" /> {t('audit.loading')}</div>
            ) : processedLogs.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-textMuted opacity-50">{t('audit.empty')}</div>
            ) : (
              <div role="rowgroup" className="relative px-4" style={{ height: rowVirtualizer.getTotalSize() }}>
                {rowVirtualizer.getVirtualItems().map(vRow => {
                  const log = processedLogs[vRow.index];
                  return (
                    <div
                      key={vRow.key}
                      role="row"
                      aria-rowindex={vRow.index + 2}
                      className="absolute left-4 right-4 top-0 grid grid-cols-[170px_150px_minmax(300px,1fr)] gap-4 items-center px-2 hover:bg-textMain/5 rounded transition-colors"
                      style={{ height: vRow.size, transform: `translateY(${vRow.start}px)` }}
                    >
                      <div role="cell" className="min-w-0"><span className="block truncate whitespace-nowrap text-textMuted" title={log.timestamp}>{log.timestamp}</span></div>
                      <div role="cell" className="min-w-0">
                        <span className={`inline-flex max-w-full items-center whitespace-nowrap px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${getLevelBadge(log.level)}`}><span className="mr-1.5">{getLevelIcon(log.level)}</span> {log.level}</span>
                      </div>
                      <div role="cell" className="min-w-0">
                        <span className="block truncate whitespace-nowrap text-textMain/90" title={log.message}>
                          {log.message.split(/'([^']+)'/).map((part, i) => i % 2 === 1 ? <span key={i} className="text-amber-500 dark:text-amber-300 font-bold bg-amber-500/10 px-1 rounded">'{part}'</span> : part)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}