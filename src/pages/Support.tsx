import { useState } from 'react';
import { LifeBuoy, Send, AlertCircle, CheckCircle2, Info, FileText, X, PlayCircle, HelpCircle, ChevronDown, ChevronUp, Copy, Check, Zap, Paperclip, Trash2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useTranslation } from 'react-i18next';
import UserManual from '../components/support/UserManual';

interface Toast { id: number; title: string; message: string; type: 'success' | 'error' | 'info'; }

export default function Support() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'ticket' | 'manual'>('ticket');
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketCategory, setTicketCategory] = useState('Dúvida Técnica');
  const [ticketPriority, setTicketPriority] = useState('Média');
  const [ticketMessage, setTicketMessage] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [copiedDiag, setCopiedDiag] = useState(false);

  const showToast = (title: string, msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now();
    setToasts([{ id, title, message: msg, type }]);
    setTimeout(() => removeToast(id), 4000);
  };

  const removeToast = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  const handleAddAttachments = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [{ name: t('support.filePickerName'), extensions: ['png', 'jpg', 'jpeg', 'mp4', 'mov', 'avi', 'pdf', 'txt', 'log'] }]
      });
      if (selected) {
        const paths = Array.isArray(selected) ? selected : [selected];
        setAttachments(prev => [...prev, ...paths]);
        showToast(t('support.toast.filesAdded'), t('support.toast.filesAddedMsg', { count: paths.length }), 'info');
      }
    } catch (e) {
      showToast(t('support.toast.error'), t('support.toast.filesError'), 'error');
    }
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketSubject || !ticketMessage) {
      showToast(t('support.toast.required'), t('support.toast.requiredMsg'), 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await invoke('send_support_ticket', {
        payload: {
          subject: ticketSubject,
          category: ticketCategory,
          priority: ticketPriority,
          message: ticketMessage,
          attachments: attachments
        }
      });
      await invoke('submit_support_ticket', {
        subject: ticketSubject,
        category: ticketCategory,
        priority: ticketPriority,
        message: ticketMessage,
        attachments: attachments
      });

      setTicketSubject('');
      setTicketMessage('');
      setAttachments([]);
      showToast(t('support.toast.sent'), t('support.toast.sentMsg'), 'success');
    } catch (error) {
      showToast(t('support.toast.sendError'), t('support.toast.sendErrorMsg', { error: String(error) }), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestartTour = () => {
    localStorage.removeItem('kopher_tour_completed');
    localStorage.removeItem('kopher_tour_step');
    window.location.hash = '#/';
    window.location.reload();
  };

  const handleCopyDiagnostics = () => {
    const d = (k: string) => t(`support.diag.${k}`);
    const diagText = [
      '--- KOPHER SHIELD DIAGNOSTICS ---',
      `${d('version')}: 1.0.0 (Stable)`,
      `${d('engine')}: Rust Tauri`,
      `${d('workspace')}: ${d('active')}`,
      `${d('dbStatus')}: ${d('healthy')}`,
      `${d('category')}: ${ticketCategory}`,
      `${d('priority')}: ${ticketPriority}`,
      `${d('subject')}: ${ticketSubject}`,
      `${d('description')}: ${ticketMessage}`,
      '---------------------------------',
    ].join('\n');
    navigator.clipboard.writeText(diagText);
    setCopiedDiag(true);
    showToast(t('support.toast.diagCopied'), t('support.toast.diagCopiedMsg'), 'info');
    setTimeout(() => setCopiedDiag(false), 2500);
  };

  const faqs = [0, 1, 2].map(i => ({ q: t(`support.faq.q${i}`), a: t(`support.faq.a${i}`) }));

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500 max-w-[1600px] mx-auto relative pb-8">
      {/* Sistema de Toasts */}
      <div className="fixed top-6 right-6 z-[100] flex flex-col space-y-3 pointer-events-none">
        {toasts.map(toast => (
          <div key={toast.id} className={`w-80 p-4 rounded-xl shadow-2xl border flex items-start space-x-3 pointer-events-auto animate-in slide-in-from-right-8 fade-in duration-300 ${toast.type === 'success' ? 'bg-surface/95 border-green-500/40' : toast.type === 'error' ? 'bg-surface/95 border-red-500/40' : 'bg-surface/95 border-amber-500/40'}`}>
            <div className="shrink-0 mt-0.5">{toast.type === 'success' && <CheckCircle2 size={18} className="text-green-500" />}{toast.type === 'error' && <AlertCircle size={18} className="text-red-500" />}{toast.type === 'info' && <Info size={18} className="text-amber-500" />}</div>
            <div className="flex flex-col flex-1"><h4 className={`text-sm font-bold ${toast.type === 'success' ? 'text-green-500' : toast.type === 'error' ? 'text-red-500' : 'text-amber-500'}`}>{toast.title}</h4><p className="text-xs text-textMuted mt-1 leading-relaxed">{toast.message}</p></div>
            <button onClick={() => removeToast(toast.id)} className="text-textMuted hover:text-textMain transition-colors cursor-pointer shrink-0"><X size={16} /></button>
          </div>
        ))}
      </div>

      {/* HEADER DA PÁGINA */}
      <div className="shrink-0 mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-textMain flex items-center">
            <LifeBuoy className="mr-3 text-primary" size={28} />{t('support.title')}
          </h1>
          <p className="text-sm text-textMuted mt-1">{t('support.subtitle')}</p>
        </div>
        
        <div className="flex items-center space-x-3 bg-surface border border-border px-4 py-2 rounded-2xl shadow-xs">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></span>
            <span className="text-xs font-bold text-textMain">{t('support.dbConnected')}</span>
          </div>
          <span className="text-border">|</span>
          <span className="text-xs text-textMuted font-mono">{t('support.sla')}</span>
        </div>
      </div>

      <div role="tablist" aria-label={t('support.tabs_label')} className="shrink-0 mb-6 inline-flex self-start gap-1 p-1 bg-surface border border-border rounded-xl">
        {(['ticket', 'manual'] as const).map(id => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all duration-300 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${tab === id ? 'bg-primary/10 text-primary shadow-[0_0_15px_rgba(245,158,11,0.2)]' : 'text-textMuted hover:text-textMain'}`}>{t(id === 'ticket' ? 'support.tab_ticket' : 'support.tab_manual')}
          </button>
        ))}
      </div>

      {tab === 'manual' ? <UserManual /> : (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        
        {/* COLUNA ESQUERDA: Formulário */}
        <div className="lg:col-span-2 flex flex-col bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="p-6 border-b border-border/50 bg-background/30 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-textMain flex items-center">
                <Zap className="mr-2 text-primary" size={18} />{t('support.form.title')}
              </h2>
              <p className="text-xs text-textMuted mt-0.5">{t('support.form.subtitle')}</p>
            </div>
            <span className="px-3 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full text-[10px] font-bold uppercase tracking-widest">{t('support.form.badge')}
            </span>
          </div>

          <div className="p-6 flex-1 overflow-y-auto">
            <form onSubmit={handleSubmitTicket} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-textMuted uppercase tracking-wider mb-2">{t('support.form.subject')}</label>
                  <input type="text" value={ticketSubject} onChange={(e) => setTicketSubject(e.target.value)} placeholder={t('support.form.subjectPh')} className="w-full bg-background border border-border focus:border-primary rounded-xl px-4 py-3 text-sm font-medium text-textMain outline-none transition-all shadow-sm" disabled={isSubmitting} />
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-textMuted uppercase tracking-wider mb-2">{t('support.form.priority')}</label>
                  <select value={ticketPriority} onChange={(e) => setTicketPriority(e.target.value)} className="w-full bg-background border border-border focus:border-primary rounded-xl px-3 py-3 text-sm font-medium text-textMain outline-none transition-all shadow-sm cursor-pointer" disabled={isSubmitting}>
                    <option value="Baixa">{t('support.priority.low')}</option>
                    <option value="Média">{t('support.priority.medium')}</option>
                    <option value="Urgente / Crítica">{t('support.priority.urgent')}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-textMuted uppercase tracking-wider mb-2">{t('support.form.category')}</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {(['Dúvida Técnica', 'Falha / Bug', 'Novo Recurso', 'Licenciamento'] as const).map((cat, ci) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setTicketCategory(cat)}
                      className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer text-center ${ticketCategory === cat ? 'bg-primary/10 border-primary text-primary shadow-xs' : 'bg-background border-border text-textMuted hover:text-textMain'}`}
                    >{t(`support.category.c${ci}`)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-textMuted uppercase tracking-wider mb-2">{t('support.form.description')}</label>
                <textarea value={ticketMessage} onChange={(e) => setTicketMessage(e.target.value)} placeholder={t('support.form.descriptionPh')} className="w-full h-32 bg-background border border-border focus:border-primary rounded-xl px-4 py-3 text-sm text-textMain outline-none transition-all shadow-sm resize-none" disabled={isSubmitting}></textarea>
              </div>

              {/* SECÇÃO DE ANEXOS DE MÍDIA / PRINTS / VÍDEOS */}
              <div className="bg-background/50 border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-textMain uppercase tracking-wider flex items-center">
                      <Paperclip size={15} className="mr-2 text-primary" />{t('support.form.attachments')}
                    </h4>
                    <p className="text-[11px] text-textMuted mt-0.5">{t('support.form.attachmentsHint')}</p>
                  </div>
                  <button type="button" onClick={handleAddAttachments} className="px-3.5 py-2 bg-surface border border-border hover:border-primary text-textMain hover:text-primary rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center shadow-2xs">
                    <Paperclip size={14} className="mr-1.5 text-primary" />{t('support.form.addFiles')}
                  </button>
                </div>

                {attachments.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-border/50 max-h-32 overflow-y-auto">
                    {attachments.map((filePath, idx) => {
                      const fileName = filePath.split(/[\\/]/).pop() || filePath;
                      return (
                        <div key={idx} className="flex items-center justify-between bg-surface border border-border px-3 py-2 rounded-lg text-xs">
                          <span className="font-mono text-textMain truncate mr-2 flex items-center">
                            <FileText size={14} className="mr-2 text-primary shrink-0" /> {fileName}
                          </span>
                          <button type="button" onClick={() => handleRemoveAttachment(idx)} className="text-textMuted hover:text-red-500 transition-colors cursor-pointer shrink-0">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between pt-4 border-t border-border/50 gap-4">
                <button type="button" onClick={handleCopyDiagnostics} className="flex items-center text-xs font-bold text-textMuted hover:text-primary transition-colors cursor-pointer bg-background border border-border px-4 py-2.5 rounded-xl shadow-xs">
                  {copiedDiag ? <Check size={15} className="mr-2 text-green-500" /> : <Copy size={15} className="mr-2 text-primary" />}
                  {copiedDiag ? t('support.form.diagCopied') : t('support.form.copyDiag')}
                </button>
                
                <button type="submit" disabled={isSubmitting} className="w-full sm:w-auto flex items-center justify-center px-6 py-3 bg-primary hover:bg-primary/90 disabled:bg-primary/50 text-white rounded-xl text-sm font-bold shadow-lg shadow-primary/20 transition-all cursor-pointer">
                  {isSubmitting ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>{t('support.form.sending')}</> : <><Send size={16} className="mr-2" />{t('support.form.submit')}</>}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* COLUNA DIREITA */}
        <div className="flex flex-col space-y-6">
          
          <div className="bg-gradient-to-br from-primary/10 via-surface to-surface border border-primary/30 rounded-2xl p-6 shadow-sm flex flex-col justify-center items-center text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-bl-[80px] pointer-events-none"></div>
            <div className="w-12 h-12 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary mb-3 shadow-inner">
              <PlayCircle size={26} />
            </div>
            <h3 className="font-bold text-textMain text-base mb-1">{t('support.guide.title')}</h3>
            <p className="text-xs text-textMuted mb-4 leading-relaxed">{t('support.guide.text')}</p>
            <button onClick={handleRestartTour} className="w-full bg-primary hover:bg-primary/90 text-white rounded-xl py-2.5 text-xs font-bold shadow-md transition-all cursor-pointer flex items-center justify-center">
              <PlayCircle size={15} className="mr-2" />{t('support.guide.button')}
            </button>
          </div>

          <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="font-bold text-textMain text-sm mb-3 flex items-center">
              <HelpCircle size={16} className="mr-2 text-primary" />{t('support.faq.title')}
            </h3>
            <div className="space-y-2.5">
              {faqs.map((faq, idx) => (
                <div key={idx} className="border border-border/60 rounded-xl overflow-hidden bg-background/50">
                  <button 
                    onClick={() => setOpenFaq(openFaq === idx ? null : idx)} 
                    className="w-full p-3 text-left text-xs font-bold text-textMain flex items-center justify-between hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <span className="pr-2">{faq.q}</span>
                    {openFaq === idx ? <ChevronUp size={14} className="shrink-0 text-primary" /> : <ChevronDown size={14} className="shrink-0 text-textMuted" />}
                  </button>
                  {openFaq === idx && (
                    <div className="px-3 pb-3 pt-1 text-[11px] text-textMuted leading-relaxed border-t border-border/40 animate-in fade-in duration-200">
                      {faq.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-surface border border-border rounded-2xl p-5 shadow-sm text-xs space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-border/50">
              <span className="text-textMuted font-medium">{t('support.info.engine')}</span>
              <span className="font-mono font-bold text-textMain">1.0.0 (Rust/Tauri)</span>
            </div>
            <div className="flex items-center justify-between pb-3 border-b border-border/50">
              <span className="text-textMuted font-medium">{t('support.info.developer')}</span>
              <span className="font-bold text-primary">BINAVER Soluções</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-textMuted font-medium">{t('support.info.direct')}</span>
              <a href="mailto:support@binaver.com" className="font-bold text-primary hover:underline">support@binaver.com</a>
            </div>
          </div>

        </div>

      </div>
      )}
    </div>
  );
}
