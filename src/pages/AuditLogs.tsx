import { useState, useEffect, useMemo } from 'react';
import { Terminal, RefreshCw, Search, ShieldAlert, CheckCircle2, Info, AlertTriangle, Filter, Database, Download, Printer, Clock, FileText, ArrowUpDown, ChevronUp, ChevronDown, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface AuditLog { timestamp: string; level: string; message: string; }
interface Toast { id: number; title: string; message: string; type: 'success' | 'error' | 'info'; }

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [levelFilter, setLevelFilter] = useState('Todos');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: keyof AuditLog, direction: 'asc' | 'desc' }>({ key: 'timestamp', direction: 'desc' });
  const [isExporting, setIsExporting] = useState(false);

  const showToast = (title: string, message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now() + Math.random(); 
    setToasts(prev => [...prev, { id, title, message, type }]);
    setTimeout(() => { setToasts(prev => prev.filter(t => t.id !== id)); }, 4000);
  };

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const data = await invoke<AuditLog[]>('read_audit_logs');
      setLogs(data);
    } catch (error) {
      showToast("Erro", "Falha ao carregar logs.", "error");
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
      const matchesLevel = levelFilter === 'Todos' || log.level === levelFilter;
      return matchesSearch && matchesLevel;
    });

    return filtered.sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
      if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [logs, searchTerm, levelFilter, sortConfig]);

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'SUCCESS': return <CheckCircle2 size={16} className="text-green-500" />;
      case 'ERROR': return <ShieldAlert size={16} className="text-red-500" />;
      case 'WARNING': return <AlertTriangle size={16} className="text-amber-500" />;
      default: return <Info size={16} className="text-blue-500" />;
    }
  };

  const getLevelBadge = (level: string) => {
    switch (level) {
      case 'SUCCESS': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'ERROR': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'WARNING': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      default: return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    }
  };

  const handleExportCSV = async () => {
    if (processedLogs.length === 0) return;
    try {
      const filePath = await save({
        filters: [{ name: 'Planilha Excel (CSV)', extensions: ['csv'] }],
        defaultPath: `coopshield_auditoria_${new Date().toISOString().slice(0,10)}.csv`
      });
      if (!filePath) return; 

      const csvContent = ["Data e Hora,Nível,Descrição", ...processedLogs.map(log => `"${log.timestamp}","${log.level}","${log.message.replace(/"/g, '""')}"`)].join("\n");
      await invoke('save_report_file', { path: filePath, content: csvContent, isBase64: false });
      showToast("Sucesso", "Planilha exportada com sucesso.", "success");
    } catch (e) {
      showToast("Erro", `Falha ao salvar: ${e}`, "error");
    }
  };

  const handlePrintPDF = async () => {
    if (processedLogs.length === 0 || isExporting) return;
    setIsExporting(true);
    
    try {
      const filePath = await save({
        filters: [{ name: 'Relatório de Auditoria (PDF)', extensions: ['pdf'] }],
        defaultPath: `relatorio_auditoria_coopshield_${new Date().toISOString().slice(0,10)}.pdf`
      });

      if (!filePath) {
        setIsExporting(false);
        return; 
      }

      const doc = new jsPDF();
      
      doc.setFontSize(22);
      doc.setTextColor(15, 23, 42); 
      doc.text('COOPSHIELD', 105, 20, { align: 'center' });
      
      doc.setFontSize(12);
      doc.setTextColor(100, 116, 139); 
      doc.text('RELATÓRIO OFICIAL DE AUDITORIA E SEGURANÇA', 105, 28, { align: 'center' });
      
      doc.setFontSize(10);
      doc.text(`Emitido em: ${new Date().toLocaleString('pt-BR')} | Ocorrências: ${processedLogs.length}`, 105, 34, { align: 'center' });

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
        head: [['Data / Hora', 'Severidade', 'Descrição da Ocorrência']],
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

      showToast("Sucesso", "Relatório PDF exportado com sucesso no seu computador.", "success");

    } catch(e) {
      showToast("Erro na Exportação", `Falha ao salvar o PDF: ${e}`, "error");
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
          <div key={toast.id} className={`w-80 p-4 rounded-xl shadow-2xl border flex items-start space-x-3 pointer-events-auto animate-in slide-in-from-right-8 fade-in duration-300 ${toast.type === 'success' ? 'bg-surface/95 border-green-500/40' : toast.type === 'error' ? 'bg-surface/95 border-red-500/40' : 'bg-surface/95 border-blue-500/40'}`}>
            <div className="shrink-0 mt-0.5">
              {toast.type === 'success' && <CheckCircle2 size={18} className="text-green-500" />}
              {toast.type === 'error' && <AlertCircle size={18} className="text-red-500" />}
              {toast.type === 'info' && <Info size={18} className="text-blue-500" />}
            </div>
            <div className="flex flex-col flex-1">
              <h4 className={`text-sm font-bold ${toast.type === 'success' ? 'text-green-500' : toast.type === 'error' ? 'text-red-500' : 'text-blue-500'}`}>{toast.title}</h4>
              <p className="text-xs text-textMuted mt-1 leading-relaxed">{toast.message}</p>
            </div>
            <button onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))} className="text-textMuted hover:text-textMain transition-colors cursor-pointer shrink-0"><X size={16} /></button>
          </div>
        ))}
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-border/50 pb-6 gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold mb-2 tracking-tight flex items-center text-textMain"><Terminal size={28} className="mr-3 text-primary" /> Auditoria de Sistema</h1>
          <p className="text-sm text-textMuted">Registo imutável de eventos e auditoria conformidade legal.</p>
        </div>
        <div className="flex space-x-3 w-full md:w-auto">
          <button onClick={handleExportCSV} disabled={processedLogs.length === 0} className="bg-surface hover:bg-background border border-border text-textMain px-4 py-2 rounded-lg font-medium text-sm flex items-center transition-all cursor-pointer disabled:opacity-50">
            <Download size={16} className="mr-2 text-green-500" /> Exportar (Excel)
          </button>
          <button onClick={handlePrintPDF} disabled={processedLogs.length === 0 || isExporting} className="bg-surface hover:bg-background border border-border text-textMain px-4 py-2 rounded-lg font-medium text-sm flex items-center transition-all cursor-pointer disabled:opacity-50">
            <Printer size={16} className={`mr-2 ${isExporting ? 'animate-pulse text-textMuted' : 'text-blue-500'}`} /> {isExporting ? 'Gerando PDF...' : 'Relatório PDF'}
          </button>
          <button onClick={fetchLogs} disabled={isLoading} className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center shadow-lg shadow-primary/20 transition-all cursor-pointer disabled:opacity-50">
            <RefreshCw size={16} className={`mr-2 ${isLoading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-5 shadow-sm flex flex-col md:flex-row gap-4 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" size={18} />
          <input type="text" placeholder="Pesquisar por rotina, avisos ou origem..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full bg-background border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm text-textMain focus:border-primary outline-none transition-all" />
        </div>
        <div className="flex items-center space-x-2 shrink-0">
          <Filter size={18} className="text-textMuted" />
          <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className="bg-background border border-border rounded-lg px-4 py-2.5 text-sm text-textMain focus:border-primary outline-none cursor-pointer appearance-none min-w-[160px]">
            <option value="Todos">Todos os Eventos</option><option value="INFO">Informação</option><option value="SUCCESS">Sucessos</option><option value="WARNING">Avisos</option><option value="ERROR">Falhas Críticas</option>
          </select>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-inner relative flex flex-col flex-1 min-h-0 text-textMain">
        
        <div className="bg-background border-b border-border/50 px-4 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center">
            <div className="flex space-x-1.5 mr-4">
              <div className="w-3 h-3 rounded-full bg-red-500/80"></div><div className="w-3 h-3 rounded-full bg-amber-500/80"></div><div className="w-3 h-3 rounded-full bg-green-500/80"></div>
            </div>
            <span className="text-xs font-mono text-textMuted flex items-center"><Database size={12} className="mr-1.5" /> root@coopshield:/var/log/audit.log</span>
          </div>
          <span className="text-[10px] text-textMuted font-mono uppercase tracking-wider">{processedLogs.length} ocorrencias exibidas</span>
        </div>

        <div className="flex items-center space-x-4 px-6 py-2.5 border-b border-border/50 bg-background/50 shrink-0 font-sans shadow-sm z-10 select-none">
          <div onClick={() => handleSort('timestamp')} className={`w-[150px] text-[11px] font-bold uppercase tracking-widest flex items-center cursor-pointer transition-colors ${sortConfig.key === 'timestamp' ? 'text-primary' : 'text-textMuted hover:text-textMain'}`}>
            <Clock size={13} className="mr-1.5 opacity-70"/> Data e Hora {getSortIcon('timestamp')}
          </div>
          <div onClick={() => handleSort('level')} className={`w-[100px] text-[11px] font-bold uppercase tracking-widest flex items-center cursor-pointer transition-colors ${sortConfig.key === 'level' ? 'text-primary' : 'text-textMuted hover:text-textMain'}`}>
            <ShieldAlert size={13} className="mr-1.5 opacity-70"/> Nível {getSortIcon('level')}
          </div>
          <div onClick={() => handleSort('message')} className={`flex-1 text-[11px] font-bold uppercase tracking-widest flex items-center cursor-pointer transition-colors ${sortConfig.key === 'message' ? 'text-primary' : 'text-textMuted hover:text-textMain'}`}>
            <FileText size={13} className="mr-1.5 opacity-70"/> Descrição {getSortIcon('message')}
          </div>
        </div>

        <div className="p-4 overflow-y-auto flex-1 font-mono text-[13px] space-y-1.5 selection:bg-primary/30">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-textMuted"><RefreshCw size={24} className="animate-spin mr-3 text-primary" /> Analisando trilha de auditoria...</div>
          ) : processedLogs.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-textMuted opacity-50">Nenhum registo corresponde aos parâmetros.</div>
          ) : (
            processedLogs.map((log, index) => (
              <div key={index} className="flex items-start space-x-4 p-2 hover:bg-textMain/5 rounded transition-colors group">
                <div className="shrink-0 text-textMuted w-[150px] pt-0.5">{log.timestamp}</div>
                <div className="shrink-0 pt-0.5 w-[100px]">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${getLevelBadge(log.level)}`}><span className="mr-1.5">{getLevelIcon(log.level)}</span> {log.level}</span>
                </div>
                <div className="flex-1 leading-relaxed text-textMain/90">
                  {log.message.split(/'([^']+)'/).map((part, i) => i % 2 === 1 ? <span key={i} className="text-amber-500 dark:text-amber-300 font-bold bg-amber-500/10 px-1 rounded">'{part}'</span> : part)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}