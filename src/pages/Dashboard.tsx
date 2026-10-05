import { useState, useEffect, useRef, useMemo } from 'react';
import { HardDrive, Clock, Activity, Server, FileLock2, CheckCircle2, AlertTriangle, ArrowUpRight, ShieldAlert, Info, Printer, Image as ImageIcon, Search, Filter, CalendarDays, SlidersHorizontal, Calendar, XCircle, X, Download, FileText, CalendarRange, History, Layers } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface AuditLog { timestamp: string; level: string; message: string; }
interface DashboardTelemetry { total_routines: number; active_vaults: number; protected_files: number; last_execution: string; recent_audits: AuditLog[]; }
interface ChartDataPoint { height: number; value: number; label: string; isCurrent: boolean; isFuture: boolean; isError: boolean; dateKey: string; unit: string; }

type GroupBy = 'day' | 'month' | 'year';
type TimeViewMode = 'weekly' | 'monthly' | 'quarterly' | 'semiannual' | 'yearly' | '5years' | 'custom';

export default function Dashboard() {
  const [telemetry, setTelemetry] = useState<DashboardTelemetry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  
  const [filterRoutine, setFilterRoutine] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 6);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  
  const [selectedBarDate, setSelectedBarDate] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>('day');
  const [chartTitleLabel, setChartTitleLabel] = useState('Últimos 7 Dias');

  const [showViewMenu, setShowViewMenu] = useState(false);
  const [viewMode, setViewMode] = useState<TimeViewMode>('weekly');
  const menuRef = useRef<HTMLDivElement>(null);
  const dashboardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchTelemetry = async () => {
      try {
        const data = await invoke<DashboardTelemetry>('get_dashboard_telemetry');
        setTelemetry(data);
      } catch (error) {
        console.error("Erro ao carregar telemetria:", error);
      } finally {
        setTimeout(() => setIsLoading(false), 500); 
      }
    };
    fetchTelemetry();

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setShowViewMenu(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setSelectedBarDate(null);
  }, [filterRoutine, filterStatus, startDate, endDate, viewMode, groupBy]);


  const handleExport = async (format: 'png' | 'pdf' | 'print') => {
    if (!telemetry || !dashboardRef.current || isExporting) return;
    setIsExportModalOpen(false);

    if (format === 'print') {
      setTimeout(() => { window.print(); }, 150);
      return;
    }

    setIsExporting(true);
    try {
      const ext = format;
      const filePath = await save({ 
        filters: [{ name: format === 'pdf' ? 'Relatório PDF' : 'Imagem PNG', extensions: [ext] }], 
        defaultPath: `visao_geral_coopshield_${new Date().toISOString().slice(0,10)}.${ext}` 
      });
      
      if (!filePath) { setIsExporting(false); return; }

      await document.fonts.ready;

      const canvas = await html2canvas(dashboardRef.current, { 
        scale: 2, 
        windowWidth: 1920, 
        backgroundColor: null, 
        useCORS: true, 
        allowTaint: true, 
        logging: false,
        onclone: (clonedDoc, clonedElement) => {
          if (document.documentElement.classList.contains('dark')) {
            clonedDoc.documentElement.classList.add('dark');
            clonedDoc.body.classList.add('dark');
            clonedElement.classList.add('dark');
          }

          const allElements = clonedElement.querySelectorAll('*');
          allElements.forEach((el) => {
            el.classList.remove('truncate', 'line-clamp-2');
            
            if (el.tagName.toLowerCase() === 'input' || el.tagName.toLowerCase() === 'select') {
              const val = (el as HTMLInputElement | HTMLSelectElement).value;
              const div = clonedDoc.createElement('div');
              
              div.className = el.className; 
              div.style.display = 'flex';
              div.style.alignItems = 'center';
              
              if (el.tagName.toLowerCase() === 'select') {
                const sel = el as HTMLSelectElement;
                div.innerText = sel.options[sel.selectedIndex]?.text || val;
              } else if (el.getAttribute('type') === 'date' && val) {
                const [y, m, d] = val.split('-');
                div.innerText = `${d}/${m}/${y}`;
              } else {
                div.innerText = val || el.getAttribute('placeholder') || '';
              }
              
              el.parentNode?.replaceChild(div, el);
            }
          });

          const auditArea = clonedDoc.getElementById('audit-scroll-area');
          if (auditArea) {
            auditArea.style.overflow = 'visible';
            auditArea.style.maxHeight = 'none';
          }
        }
      });

      if (format === 'png') {
        const base64Image = canvas.toDataURL('image/png').split(',')[1];
        await invoke('save_report_file', { path: filePath, content: base64Image, isBase64: true });
      } else if (format === 'pdf') {
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('landscape', 'mm', 'a4');
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        
        const marginX = 10;
        let imgWidth = pageWidth - (marginX * 2);
        let imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        if (imgHeight > pageHeight - 35) { 
            imgHeight = pageHeight - 35; 
            imgWidth = (canvas.width * imgHeight) / canvas.height; 
        }
        
        const xOffset = (pageWidth - imgWidth) / 2;
        
        pdf.setFontSize(14); 
        pdf.setTextColor(15, 23, 42); 
        pdf.text("COOPSHIELD - RELATÓRIO DE AUDITORIA", marginX, 15);
        
        pdf.setFontSize(10); 
        pdf.setTextColor(100, 116, 139); 
        pdf.text(`Emitido em: ${new Date().toLocaleString('pt-BR')}  |  Visão: ${chartTitleLabel}`, marginX, 22);
        
        pdf.addImage(imgData, 'PNG', xOffset, 30, imgWidth, imgHeight);
        
        await invoke('save_report_file', { path: filePath, content: pdf.output('datauristring').split(',')[1], isBase64: true });
      }
      alert(`Exportação concluída com sucesso!`);
    } catch(e) { 
      console.error(e);
      alert(`Falha ao gerar o arquivo. Verifique os logs.`); 
    } finally { 
      setIsExporting(false); 
    }
  };

  const filteredAudits = useMemo(() => {
    if (!telemetry) return [];
    return telemetry.recent_audits.filter(log => {
      const matchRoutine = filterRoutine === '' || log.message.toLowerCase().includes(filterRoutine.toLowerCase());
      const matchStatus = filterStatus === 'ALL' || log.level === filterStatus;
      
      let matchDate = true;
      const logDateString = log.timestamp.split(' ')[0]; 
      
      if (selectedBarDate) {
        if (groupBy === 'day' && logDateString !== selectedBarDate) matchDate = false;
        if (groupBy === 'month' && !logDateString.startsWith(selectedBarDate)) matchDate = false;
        if (groupBy === 'year' && !logDateString.startsWith(selectedBarDate)) matchDate = false;
      } 
      else if (startDate || endDate) {
        const logDateObj = new Date(logDateString + "T12:00:00");
        if (startDate && new Date(startDate + "T00:00:00") > logDateObj) matchDate = false;
        if (endDate && new Date(endDate + "T23:59:59") < logDateObj) matchDate = false;
      }
      
      return matchRoutine && matchStatus && matchDate;
    });
  }, [telemetry, filterRoutine, filterStatus, startDate, endDate, selectedBarDate, groupBy]);

  const chartData = useMemo<ChartDataPoint[]>(() => {
    if (!telemetry || !startDate || !endDate) return [];
    
    const toLocalISO = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    let anchorDate = new Date();
    if (endDate && endDate !== startDate) {
      const [year, month, day] = endDate.split('-');
      anchorDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
    
    const currentYear = anchorDate.getFullYear();
    const currentMonth = anchorDate.getMonth();
    const currentDay = anchorDate.getDate();
    const currentDayOfWeek = anchorDate.getDay(); 
    
    const isErrorMode = filterStatus === 'ERROR' || filterStatus === 'WARNING';
    
    const dynamicData: Record<string, { value: number, isFuture: boolean, label: string }> = {};
    const monthNames = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
    
    const today = new Date();
    today.setHours(0,0,0,0);

    if (viewMode === 'weekly') {
      const daysMap = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
      daysMap.forEach((label, index) => {
        const d = new Date(anchorDate);
        const diff = index - currentDayOfWeek;
        d.setDate(currentDay + diff); 
        
        dynamicData[toLocalISO(d)] = { value: 0, isFuture: diff > 0, label };
      });
    } 
    else if (viewMode === 'monthly') {
      const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
      for (let i = 1; i <= daysInMonth; i++) {
        const d = new Date(currentYear, currentMonth, i);
        dynamicData[toLocalISO(d)] = { value: 0, isFuture: d > today, label: String(i).padStart(2, '0') };
      }
    }
    else if (viewMode === 'quarterly') {
      for (let i = 2; i >= 0; i--) {
        const d = new Date(currentYear, currentMonth - i, 1);
        const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        dynamicData[dateKey] = { value: 0, isFuture: false, label: monthNames[d.getMonth()] };
      }
    }
    else if (viewMode === 'semiannual') {
      for (let i = 5; i >= 0; i--) {
        const d = new Date(currentYear, currentMonth - i, 1);
        const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        dynamicData[dateKey] = { value: 0, isFuture: false, label: monthNames[d.getMonth()] };
      }
    }
    else if (viewMode === 'yearly') {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(currentYear, currentMonth - i, 1);
        const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        dynamicData[dateKey] = { value: 0, isFuture: false, label: monthNames[d.getMonth()] };
      }
    }
    else if (viewMode === '5years') {
      for (let i = 4; i >= 0; i--) {
        const y = currentYear - i;
        dynamicData[`${y}`] = { value: 0, isFuture: y > today.getFullYear(), label: `${y}` };
      }
    }
    else if (viewMode === 'custom') {
      const start = new Date(startDate + "T00:00:00");
      const end = new Date(endDate + "T23:59:59");
      let curr = new Date(start);
      let safety = 2000; 

      while (curr <= end && safety > 0) {
        if (groupBy === 'day') {
          const dateKey = toLocalISO(curr);
          const label = `${String(curr.getDate()).padStart(2, '0')}/${String(curr.getMonth() + 1).padStart(2, '0')}`;
          dynamicData[dateKey] = { value: 0, isFuture: curr > today, label };
          curr.setDate(curr.getDate() + 1);
        } else if (groupBy === 'month') {
          const dateKey = `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}`;
          const label = `${monthNames[curr.getMonth()]} ${String(curr.getFullYear()).slice(-2)}`;
          dynamicData[dateKey] = { value: 0, isFuture: curr > today, label };
          curr.setMonth(curr.getMonth() + 1);
        } else if (groupBy === 'year') {
          const dateKey = `${curr.getFullYear()}`;
          dynamicData[dateKey] = { value: 0, isFuture: curr.getFullYear() > today.getFullYear(), label: dateKey };
          curr.setFullYear(curr.getFullYear() + 1);
        }
        safety--;
      }
    }

    let dynamicUnit = "eventos";
    if (filterStatus === 'SUCCESS') dynamicUnit = "arquivos encript.";
    if (filterStatus === 'ERROR') dynamicUnit = "falhas críticas";
    if (filterStatus === 'WARNING') dynamicUnit = "alertas";

    const logsToProcess = (filterRoutine === '' && filterStatus === 'ALL') ? telemetry.recent_audits : filteredAudits;

    logsToProcess.forEach(log => {
      const fullDate = log.timestamp.split(' ')[0]; 
      let eventValue = 0;
      const isErrorFlow = log.level === 'ERROR' || log.level === 'WARNING';

      if (filterStatus === 'ERROR' || filterStatus === 'WARNING' || (filterStatus === 'ALL' && isErrorFlow)) {
        const errMatch = log.message.match(/(\d+)\s+falhas/i);
        if (errMatch) eventValue = parseInt(errMatch[1], 10);
        else eventValue = 1; 
      } else if (filterStatus === 'INFO' || log.level === 'INFO') {
        eventValue = 1;
      } else {
        const sucMatch = log.message.match(/(\d+)\s+(ficheiros|blocos|arquivos|sucessos)/i);
        if (sucMatch) eventValue = parseInt(sucMatch[1], 10);
        else eventValue = 1;
      }

      let logKey = "";
      if (viewMode === 'weekly' || viewMode === 'monthly' || (viewMode === 'custom' && groupBy === 'day')) {
        logKey = fullDate; 
      } else if (viewMode === 'quarterly' || viewMode === 'semiannual' || viewMode === 'yearly' || (viewMode === 'custom' && groupBy === 'month')) {
        logKey = fullDate.substring(0, 7); 
      } else if (viewMode === '5years' || (viewMode === 'custom' && groupBy === 'year')) {
        logKey = fullDate.substring(0, 4); 
      }

      if (dynamicData[logKey]) {
        dynamicData[logKey].value += eventValue;
      }
    });

    let maxVal = 0;
    Object.values(dynamicData).forEach(d => { if (d.value > maxVal) maxVal = d.value; });

    return Object.keys(dynamicData).sort().map(key => {
      const { value, isFuture, label } = dynamicData[key];
      const height = (maxVal > 0 && value > 0) ? Math.max(8, Math.floor((value / maxVal) * 100)) : 0;
      
      let isCurrent = false;
      if (selectedBarDate) {
        isCurrent = key === selectedBarDate;
      } else {
        if (viewMode === 'weekly' || viewMode === 'monthly' || (viewMode === 'custom' && groupBy === 'day')) {
          isCurrent = key === toLocalISO(today);
        } else if (viewMode === 'quarterly' || viewMode === 'semiannual' || viewMode === 'yearly' || (viewMode === 'custom' && groupBy === 'month')) {
          isCurrent = key === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        } else if (viewMode === '5years' || (viewMode === 'custom' && groupBy === 'year')) {
          isCurrent = key === `${today.getFullYear()}`;
        }
      }

      return { height, value, label, isToday: isCurrent, isFuture, isError: isErrorMode, dateKey: key, unit: dynamicUnit };
    });
  }, [telemetry, filteredAudits, filterStatus, filterRoutine, startDate, endDate, viewMode, selectedBarDate, groupBy]);

  const themeMaps = {
    ALL: { main: 'bg-primary border-primary', glow: 'bg-primary/20', text: 'text-primary', past: 'bg-primary/10 hover:bg-primary/20 border-primary/20', border: 'border-primary' },
    SUCCESS: { main: 'bg-green-500 border-green-500', glow: 'bg-green-500/20', text: 'text-green-500', past: 'bg-green-500/10 hover:bg-green-500/20 border-green-500/20', border: 'border-green-500' },
    WARNING: { main: 'bg-amber-500 border-amber-500', glow: 'bg-amber-500/20', text: 'text-amber-500', past: 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/20', border: 'border-amber-500' },
    ERROR: { main: 'bg-red-500 border-red-500', glow: 'bg-red-500/20', text: 'text-red-500', past: 'bg-red-500/10 hover:bg-red-500/20 border-red-500/20', border: 'border-red-500' },
    INFO: { main: 'bg-blue-400 border-blue-400', glow: 'bg-blue-400/20', text: 'text-blue-400', past: 'bg-blue-400/10 hover:bg-blue-400/20 border-blue-400/20', border: 'border-blue-400' }
  };
  const activeTheme = themeMaps[filterStatus as keyof typeof themeMaps] || themeMaps.ALL;

  const chartTitle = filterStatus === 'ERROR' ? 'Picos de Falhas Críticas' :
                     filterStatus === 'WARNING' ? 'Alertas de Integridade' :
                     filterStatus === 'INFO' ? 'Volume de Eventos (Informativos)' :
                     filterStatus === 'SUCCESS' ? 'Volume de Blocos Processados' :
                     'Histórico de Atividade (Extrato)';

  const viewLabels: Record<TimeViewMode, string> = {
    weekly: 'Semanal',
    monthly: 'Mensal',
    quarterly: 'Trimestral',
    semiannual: 'Semestral',
    yearly: 'Este Ano',
    '5years': 'Últimos 5 Anos',
    custom: 'Visão Personalizada'
  };

  const applyPreset = (preset: string, label: string) => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(y, d.getMonth() + 1, 0).getDate();
    
    if (preset === 'week') {
      const past = new Date(); past.setDate(past.getDate() - 6);
      setStartDate(past.toISOString().split('T')[0]); setEndDate(d.toISOString().split('T')[0]); setGroupBy('day'); setViewMode('weekly');
    } else if (preset === 'month') {
      setStartDate(`${y}-${m}-01`); setEndDate(`${y}-${m}-${lastDay}`); setGroupBy('day'); setViewMode('monthly');
    } else if (preset === 'sem1') {
      setStartDate(`${y}-01-01`); setEndDate(`${y}-06-30`); setGroupBy('month'); setViewMode('semiannual');
    } else if (preset === 'sem2') {
      setStartDate(`${y}-07-01`); setEndDate(`${y}-12-31`); setGroupBy('month'); setViewMode('semiannual');
    } else if (preset === 'year') {
      setStartDate(`${y}-01-01`); setEndDate(`${y}-12-31`); setGroupBy('month'); setViewMode('yearly');
    } else if (preset === '5years') {
      setStartDate(`${y - 4}-01-01`); setEndDate(`${y}-12-31`); setGroupBy('year'); setViewMode('5years');
    }
    
    setChartTitleLabel(label);
    setSelectedBarDate(null);
    setShowViewMenu(false);
  };

  const handleBarClick = (dateKey: string) => {
    setSelectedBarDate(dateKey === selectedBarDate ? null : dateKey);
  };

  const clearFilters = () => {
    setFilterRoutine('');
    setFilterStatus('ALL');
    setSelectedBarDate(null);
    applyPreset('week', 'Últimos 7 Dias');
  };

  const hasActiveFilters = filterRoutine !== '' || filterStatus !== 'ALL' || selectedBarDate !== null || viewMode !== 'weekly';

  if (isLoading || !telemetry) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-textMuted font-medium animate-pulse">A carregar telemetria do motor...</p>
        </div>
      </div>
    );
  }

  const maxValue = chartData.reduce((max, d) => d.value > max ? d.value : max, 0);
  const displayAudits = filteredAudits.slice(0, 12);
  
  const monthNamesLabel = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const displayMonthBottomLabel = groupBy === 'day' && startDate.substring(0, 7) === endDate.substring(0, 7) 
                                ? monthNamesLabel[new Date(startDate + "T12:00:00").getMonth()] 
                                : null;

  return (
    <>
      <style type="text/css" media="print">
        {`
          @page { size: A4 landscape; margin: 0mm; }
          body { margin: 15mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: #0B0F14 !important; }
        `}
      </style>

      <div className="flex flex-col h-full print:h-auto space-y-6 animate-in fade-in duration-700 max-w-[1600px] mx-auto overflow-hidden print:overflow-visible print:space-y-4">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 shrink-0">
          <div>
            <h1 className="text-3xl font-bold mb-2 tracking-tight text-textMain">Visão Geral</h1>
            <p className="text-sm text-textMuted">Painel gerencial de telemetria, integridade dos cofres e métricas de proteção.</p>
          </div>
          
          <div className="flex space-x-3 w-full md:w-auto print:hidden">
            <button 
              onClick={() => setIsExportModalOpen(true)} 
              disabled={isExporting} 
              className="bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-lg font-medium text-sm flex items-center shadow-lg shadow-primary/20 transition-all cursor-pointer disabled:opacity-50 h-fit"
            >
              <Download size={18} className={`mr-2 ${isExporting ? 'animate-bounce' : ''}`} /> 
              {isExporting ? 'Gerando Arquivo...' : 'Exportar Relatório'}
            </button>
          </div>
        </div>

        <div ref={dashboardRef} className="flex flex-col flex-1 space-y-5 min-h-0 bg-background rounded-xl print:bg-transparent">
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 print:grid-cols-4 gap-5 print:gap-3 shrink-0">
            <div className="bg-surface border border-border rounded-xl p-5 hover:border-primary/40 transition-all shadow-sm flex flex-col justify-between group print:border-border/50">
              <div className="flex justify-between items-start mb-3">
                <div className="bg-primary/10 p-2.5 rounded-lg text-primary group-hover:scale-110 transition-transform"><FileLock2 size={22} /></div>
                {telemetry.protected_files > 0 && <span className="text-xs font-bold text-green-400 bg-green-400/10 px-2 py-1 rounded flex items-center"><ArrowUpRight size={14} className="mr-1" /> Ativo</span>}
              </div>
              <div>
                <h3 className="text-3xl font-bold text-textMain mb-1">{telemetry.protected_files.toLocaleString('pt-BR')}</h3>
                <p className="text-[11px] text-textMuted font-bold uppercase tracking-wider">Blocos Protegidos</p>
              </div>
            </div>
            <div className="bg-surface border border-border rounded-xl p-5 hover:border-primary/40 transition-all shadow-sm flex flex-col justify-between group print:border-border/50">
              <div className="flex justify-between items-start mb-3"><div className="bg-emerald-500/10 p-2.5 rounded-lg text-emerald-400 group-hover:scale-110 transition-transform"><Activity size={22} /></div></div>
              <div><h3 className="text-3xl font-bold text-textMain mb-1">{telemetry.total_routines}</h3><p className="text-[11px] text-textMuted font-bold uppercase tracking-wider">Rotinas Ativas</p></div>
            </div>
            <div className="bg-surface border border-border rounded-xl p-5 hover:border-primary/40 transition-all shadow-sm flex flex-col justify-between group print:border-border/50">
              <div className="flex justify-between items-start mb-3"><div className="bg-blue-500/10 p-2.5 rounded-lg text-blue-400 group-hover:scale-110 transition-transform"><Server size={22} /></div></div>
              <div><h3 className="text-3xl font-bold text-textMain mb-1">{telemetry.active_vaults}</h3><p className="text-[11px] text-textMuted font-bold uppercase tracking-wider">Cofres Ativos</p></div>
            </div>
            <div className="bg-surface border border-border rounded-xl p-5 hover:border-primary/40 transition-all shadow-sm flex flex-col justify-between group print:border-border/50">
              <div className="flex justify-between items-start mb-3"><div className="bg-amber-500/10 p-2.5 rounded-lg text-amber-400 group-hover:scale-110 transition-transform"><Clock size={22} /></div></div>
              <div><h3 className="text-lg font-bold text-textMain mb-2 truncate">{telemetry.last_execution.split(' ')[0] === new Date().toISOString().slice(0,10) ? `Hoje, ${telemetry.last_execution.split(' ')[1]}` : telemetry.last_execution}</h3><p className="text-[11px] text-textMuted font-bold uppercase tracking-wider">Último Sucesso</p></div>
            </div>
          </div>

          <div id="export-filters" className="bg-surface border border-border rounded-xl p-4 shadow-sm flex flex-col 2xl:flex-row gap-4 shrink-0 items-start 2xl:items-center print:hidden">
            <div className="flex items-center text-textMuted font-bold text-xs uppercase tracking-wider mr-2 shrink-0">
              <Filter size={16} className="mr-2" /> Filtros:
            </div>
            
            <div className="relative flex-1 min-w-[200px] w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-textMuted" size={16} />
              <input type="text" placeholder="Buscar rotina..." value={filterRoutine} onChange={(e) => setFilterRoutine(e.target.value)} className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-textMain focus:border-primary outline-none transition-all" />
            </div>
            
            <div className="relative shrink-0 w-full md:w-auto">
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-full md:w-auto bg-background border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none cursor-pointer appearance-none min-w-[140px]">
                <option value="ALL" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Todos os Status</option>
                <option value="SUCCESS" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">✅ Sucesso</option>
                <option value="WARNING" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">⚠️ Alertas</option>
                <option value="ERROR" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">❌ Falhas</option>
                <option value="INFO" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">ℹ️ Informação</option>
              </select>
            </div>
            
            <div className="flex flex-col md:flex-row items-start md:items-center space-y-3 md:space-y-0 md:space-x-2 w-full xl:w-auto bg-background border border-border rounded-lg px-3 py-1.5">
              <div className="flex items-center">
                <Layers className="text-textMuted mr-2 shrink-0" size={16} />
                <select 
                  value={groupBy} 
                  onChange={(e) => { setGroupBy(e.target.value as GroupBy); setChartTitleLabel("Visão Personalizada"); setSelectedBarDate(null); setViewMode('custom'); }} 
                  className="bg-transparent border-none text-sm text-textMain font-bold outline-none cursor-pointer appearance-none"
                >
                  <option value="day" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Agrupar por Dia</option>
                  <option value="month" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Agrupar por Mês</option>
                  <option value="year" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Agrupar por Ano</option>
                </select>
              </div>
              
              <div className="hidden md:block w-px h-5 bg-border/80 mx-2"></div>
              
              <div className="flex items-center space-x-2 w-full md:w-auto">
                <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setChartTitleLabel("Visão Personalizada"); setSelectedBarDate(null); setViewMode('custom'); }} className="flex-1 md:w-32 bg-transparent border-none px-1 text-sm text-textMain outline-none cursor-pointer [color-scheme:dark]" title="Data Início" />
                <span className="text-textMuted text-xs font-bold uppercase">Até</span>
                <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setChartTitleLabel("Visão Personalizada"); setSelectedBarDate(null); setViewMode('custom'); }} className="flex-1 md:w-32 bg-transparent border-none px-1 text-sm text-textMain outline-none cursor-pointer [color-scheme:dark]" title="Data Fim" />
              </div>
            </div>

            <button onClick={clearFilters} className={`w-full 2xl:w-auto bg-surface hover:bg-red-500/10 ${hasActiveFilters ? 'text-red-400 border-red-500/50' : 'text-textMuted border-border'} hover:text-red-500 border hover:border-red-500/30 px-4 py-2 rounded-lg font-bold text-xs flex items-center justify-center transition-colors shrink-0 cursor-pointer`}>
              <XCircle size={14} className="mr-1.5" /> Limpar
            </button>
          </div>

          <div id="export-dashboard" className="grid grid-cols-1 lg:grid-cols-3 print:grid-cols-3 gap-5 print:gap-4 flex-1 min-h-0 print:min-h-[auto] pb-2">
            
            <div className="lg:col-span-2 print:col-span-2 bg-surface border border-border rounded-xl p-6 flex flex-col shadow-sm min-h-0 relative print:border-border/50">
              <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 shrink-0 gap-4 relative">
                <div className="flex-1">
                  <h2 className={`text-lg font-bold flex items-center ${activeTheme.text}`}>
                    <HardDrive size={18} className={`mr-2 ${activeTheme.text}`} /> {chartTitle}
                  </h2>
                  <p className="text-xs text-textMuted mt-1">Série temporal agrupada com base nos filtros selecionados.</p>
                </div>

                <div className="hidden xl:flex absolute left-1/2 -translate-x-1/2 top-0 items-center justify-center">
                  <span className="text-sm font-bold text-primary px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 transition-all print:border-black print:text-black print:bg-gray-200">
                    {chartTitleLabel} {selectedBarDate && <span className="ml-2 text-xs font-medium text-textMuted">(Foco: {selectedBarDate})</span>}
                  </span>
                </div>
                
                <div className="flex items-center space-x-4 bg-background/50 px-4 py-2.5 rounded-lg border border-border/60 text-xs font-medium text-textMuted relative print:border-transparent print:bg-transparent print:p-0">
                  <div className="flex items-center"><span className={`w-3 h-3 rounded ${activeTheme.main} mr-2.5`}></span> Atual</div>
                  <div className="flex items-center"><span className={`w-3 h-3 rounded border mr-2.5 ${activeTheme.past}`}></span> Histórico</div>
                  
                  <div ref={menuRef} className="relative ml-2 pl-4 border-l border-border/60 print:hidden">
                    <button onClick={() => setShowViewMenu(!showViewMenu)} className={`hover:text-primary transition-colors flex items-center font-bold cursor-pointer ${showViewMenu ? 'text-primary' : ''}`}>
                      <SlidersHorizontal size={14} className="mr-1.5" /> Visões
                    </button>
                    {showViewMenu && (
                      <div className="absolute right-0 top-full mt-3 w-56 bg-surface border border-border rounded-xl shadow-2xl z-50 overflow-hidden animate-in slide-in-from-top-2 fade-in">
                        <div className="px-3 py-2 text-[10px] font-bold text-textMuted uppercase tracking-wider bg-background/50 border-b border-border/50">Detalhado</div>
                        <button onClick={() => applyPreset('week', 'Últimos 7 Dias')} className="w-full text-left px-4 py-3 text-sm flex items-center text-textMain hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"><CalendarDays size={16} className="mr-2" /> Últimos 7 Dias</button>
                        <button onClick={() => applyPreset('month', 'Este Mês')} className="w-full text-left px-4 py-3 text-sm flex items-center text-textMain hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer border-t border-border/50"><CalendarDays size={16} className="mr-2" /> Este Mês</button>
                        
                        <div className="px-3 py-2 text-[10px] font-bold text-textMuted uppercase tracking-wider bg-background/50 border-y border-border/50 mt-1">Diretoria (Mensal)</div>
                        <button onClick={() => applyPreset('sem1', '1º Semestre')} className="w-full text-left px-4 py-3 text-sm flex items-center text-textMain hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"><CalendarRange size={16} className="mr-2" /> 1º Semestre (Jan-Jun)</button>
                        <button onClick={() => applyPreset('sem2', '2º Semestre')} className="w-full text-left px-4 py-3 text-sm flex items-center text-textMain hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer border-t border-border/50"><CalendarRange size={16} className="mr-2" /> 2º Semestre (Jul-Dez)</button>
                        <button onClick={() => applyPreset('year', 'Ano Vigente')} className="w-full text-left px-4 py-3 text-sm flex items-center text-textMain hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer border-t border-border/50"><Calendar size={16} className="mr-2" /> Este Ano (Jan-Dez)</button>
                        
                        <div className="px-3 py-2 text-[10px] font-bold text-textMuted uppercase tracking-wider bg-background/50 border-y border-border/50 mt-1">Estratégico (Anual)</div>
                        <button onClick={() => applyPreset('5years', 'Últimos 5 Anos')} className="w-full text-left px-4 py-3 text-sm flex items-center text-textMain hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"><History size={16} className="mr-2" /> Últimos 5 Anos</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex xl:hidden w-full mb-4 items-center justify-center print:hidden">
                  <span className="text-sm font-bold text-primary px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20">
                    {chartTitleLabel}
                  </span>
              </div>
              
              <div className="flex-1 min-h-[160px] flex items-end justify-between pt-4 pb-0 relative pl-12 pr-4 overflow-x-auto overflow-y-hidden">
                
                <div className="absolute left-0 -translate-x-3 top-1/2 -translate-y-1/2 -rotate-90 text-[9px] font-bold text-textMuted uppercase tracking-[0.2em] opacity-50 whitespace-nowrap">
                  Volume
                </div>

                <div className="absolute left-0 top-2 bottom-0 flex flex-col justify-between text-[10px] text-textMuted font-bold text-right w-10">
                  <span>{maxValue.toLocaleString('pt-BR')}</span>
                  <span>{Math.floor(maxValue / 2).toLocaleString('pt-BR')}</span>
                  <span>0</span>
                </div>

                <div className="absolute inset-0 left-12 right-4 flex flex-col justify-between pointer-events-none pb-0 pt-3 min-w-[500px]">
                  <div className="w-full border-t border-dashed border-border/80 h-0 print:border-border/40"></div><div className="w-full border-t border-dashed border-border/80 h-0 print:border-border/40"></div><div className="w-full border-t border-border/80 h-0 print:border-border/40"></div>
                </div>

                {chartData.map((data, i) => {
                  const isFaded = selectedBarDate && selectedBarDate !== data.dateKey;
                  
                  return (
                    <div 
                      key={i} 
                      onClick={() => handleBarClick(data.dateKey)}
                      className={`min-w-[2rem] flex-1 h-full flex flex-col justify-end items-center group z-10 relative 
                        ${data.isFuture ? 'opacity-30' : 'cursor-pointer hover:-translate-y-1'} 
                        ${isFaded && !data.isFuture ? 'opacity-40 grayscale hover:grayscale-0 hover:opacity-100' : ''}
                        transition-all duration-300 print:!opacity-100`}
                    >
                      {data.value > 0 && !data.isFuture && (
                        <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none z-50 flex flex-col items-center -translate-y-2 group-hover:-translate-y-4 print:hidden">
                          <div className={`px-3 py-1.5 rounded text-xs font-bold whitespace-nowrap shadow-xl bg-surface border ${activeTheme.border} ${activeTheme.text}`}>
                            {data.value.toLocaleString('pt-BR')} {data.unit}
                          </div>
                          <div className={`w-2 h-2 rotate-45 border-r border-b ${activeTheme.border} bg-surface -mt-1.5`}></div>
                        </div>
                      )}

                      <div className={`mb-1.5 text-[11px] font-bold ${data.isToday || data.dateKey === selectedBarDate ? activeTheme.text : 'text-textMuted'} transition-all ${data.height === 0 ? 'opacity-0' : 'opacity-100 group-hover:scale-110 group-hover:-translate-y-1'} print:opacity-100 print:text-black`}>
                        {chartData.length > 20 && data.height > 0 ? '' : data.value > 0 ? data.value.toLocaleString('pt-BR') : ''}
                      </div>
                      
                      {(data.isToday || data.dateKey === selectedBarDate) && data.height > 0 && (
                        <div className={`absolute bottom-0 w-full max-w-[4rem] blur-md rounded-t-sm transition-all duration-500 ${activeTheme.glow} print:hidden`} style={{ height: `${data.height}%` }}></div>
                      )}
                      
                      <div 
                        className={`w-full max-w-[4rem] border-t border-l border-r rounded-t-sm transition-all duration-500 relative flex items-start justify-center 
                          ${data.isToday || data.dateKey === selectedBarDate ? `${data.height > 0 ? activeTheme.main : 'bg-transparent'} shadow-sm group-hover:brightness-110 print:!bg-gray-400 print:!border-black` : 
                            data.isFuture ? 'bg-transparent border-dashed border-border print:!border-gray-300' : 
                            `${activeTheme.past} group-hover:border-primary group-hover:bg-primary/20 print:!bg-gray-200 print:!border-black`}`} 
                        style={{ height: `${data.height}%` }}
                      ></div>
                    </div>
                  )
                })}
              </div>
              
              <div className="flex flex-col shrink-0 pl-12 pr-4 min-w-[500px]">
                <div className="flex justify-between text-[10px] font-bold text-textMuted mt-3 uppercase tracking-wider">
                  {chartData.map((data, i) => (
                    <div key={i} className="flex-1 flex justify-center px-0.5">
                      <span className={`w-full max-w-[4rem] text-[8px] sm:text-[9px] text-center transition-colors duration-300 truncate 
                        ${data.isToday || data.dateKey === selectedBarDate ? `${activeTheme.text} border-b-2${activeTheme.border} pb-1 print:text-black print:border-black` : data.isFuture ? 'opacity-30' : ''}`} title={data.label}>
                        {data.label}
                      </span>
                    </div>
                  ))}
                </div>
                
                {displayMonthBottomLabel && (
                  <div className="text-center w-full text-xs font-bold text-primary mt-2">
                    {displayMonthBottomLabel}
                  </div>
                )}
              </div>
            </div>

            <div className="print:col-span-1 bg-surface border border-border rounded-xl p-6 flex flex-col shadow-sm min-h-0 print:border-border/50">
              <div className="flex justify-between items-center mb-6 shrink-0">
                 <h2 className="text-lg font-bold flex items-center text-textMain"><Activity size={18} className="mr-2 text-blue-400 print:text-black" /> Auditoria Recente</h2>
                 {selectedBarDate && (
                   <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded border border-primary/20 font-bold animate-pulse print:hidden">
                     Foco: {selectedBarDate}
                   </span>
                 )}
              </div>
              <div id="audit-scroll-area" className="flex-1 overflow-y-auto pr-2 space-y-5 print:overflow-visible print:max-h-none">
                {displayAudits.length === 0 ? (
                  <div className="text-center text-textMuted text-sm mt-10">Nenhum evento no período selecionado.</div>
                ) : (
                  displayAudits.map((log, index) => {
                    let Icon = Info; let colorClass = "bg-blue-500/20 text-blue-500 border-blue-500/30 print:border-gray-400 print:text-black";
                    if (log.level === 'SUCCESS') { Icon = CheckCircle2; colorClass = "bg-green-500/20 text-green-500 border-green-500/30 print:border-gray-400 print:text-black"; }
                    if (log.level === 'WARNING') { Icon = AlertTriangle; colorClass = "bg-amber-500/20 text-amber-500 border-amber-500/30 print:border-gray-400 print:text-black"; }
                    if (log.level === 'ERROR') { Icon = ShieldAlert; colorClass = "bg-red-500/20 text-red-500 border-red-500/30 print:border-gray-400 print:text-black"; }

                    const routineNameMatch = log.message.match(/'([^']+)'/);
                    const highlightText = routineNameMatch ? routineNameMatch[1] : "Sistema";

                    return (
                      <div key={index} className="flex relative print:break-inside-avoid">
                        {index < displayAudits.length - 1 && <div className="w-px h-full bg-border absolute left-[11px] top-6 print:bg-gray-300"></div>}
                        <div className={`${colorClass} rounded-full p-1 z-10 shrink-0 self-start mr-4 border`}><Icon size={14} /></div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-bold text-textMain truncate">{highlightText}</span>
                          <span className="text-xs text-textMuted mt-0.5 leading-snug line-clamp-2">{log.message}</span>
                          <span className="text-[10px] uppercase font-bold tracking-wider text-textMuted mt-1.5 flex items-center">
                            <Clock size={10} className="mr-1" /> {log.timestamp.split(' ')[0] === new Date().toISOString().slice(0,10) ? `Hoje, ${log.timestamp.split(' ')[1]}` : log.timestamp}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

        </div>

        {isExportModalOpen && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 animate-in fade-in duration-200 print:hidden">
            <div className="bg-surface border border-border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
              <div className="flex justify-between items-center p-5 border-b border-border/50">
                <h2 className="text-lg font-bold text-textMain flex items-center"><Printer size={18} className="mr-2 text-primary" /> Exportar Visão Geral</h2>
                <button onClick={() => setIsExportModalOpen(false)} className="text-textMuted hover:text-textMain transition-colors p-1.5 rounded-md hover:bg-surface/50 cursor-pointer"><X size={18} /></button>
              </div>
              
              <div className="p-5 space-y-3">
                <button onClick={() => handleExport('print')} className="w-full bg-background border border-border hover:border-primary/50 hover:bg-primary/5 p-4 rounded-xl flex items-center transition-all cursor-pointer group shadow-sm hover:shadow-md">
                  <div className="bg-blue-500/10 p-3 rounded-lg text-blue-500 mr-4 group-hover:scale-110 transition-transform"><Printer size={24} /></div>
                  <div className="text-left"><h3 className="text-sm font-bold text-textMain">Imprimir (Papel)</h3><p className="text-xs text-textMuted mt-0.5">Enviar direto para a impressora local</p></div>
                </button>
                <button onClick={() => handleExport('pdf')} className="w-full bg-background border border-border hover:border-primary/50 hover:bg-primary/5 p-4 rounded-xl flex items-center transition-all cursor-pointer group shadow-sm hover:shadow-md">
                  <div className="bg-red-500/10 p-3 rounded-lg text-red-500 mr-4 group-hover:scale-110 transition-transform"><FileText size={24} /></div>
                  <div className="text-left"><h3 className="text-sm font-bold text-textMain">Documento PDF</h3><p className="text-xs text-textMuted mt-0.5">Relatório formatado para arquivo</p></div>
                </button>
                <button onClick={() => handleExport('png')} className="w-full bg-background border border-border hover:border-primary/50 hover:bg-primary/5 p-4 rounded-xl flex items-center transition-all cursor-pointer group shadow-sm hover:shadow-md">
                  <div className="bg-green-500/10 p-3 rounded-lg text-green-500 mr-4 group-hover:scale-110 transition-transform"><ImageIcon size={24} /></div>
                  <div className="text-left"><h3 className="text-sm font-bold text-textMain">Imagem Alta Resolução</h3><p className="text-xs text-textMuted mt-0.5">Arquivo PNG ideal para apresentações</p></div>
                </button>
              </div>
              
              <div className="p-4 border-t border-border/50 bg-background/50 flex justify-end">
                <button onClick={() => setIsExportModalOpen(false)} className="px-4 py-2 rounded-lg font-medium text-sm text-textMuted hover:text-textMain hover:bg-surface transition-all cursor-pointer">Cancelar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}