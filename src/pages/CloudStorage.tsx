import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FOCUS_RING } from '../ui/tokens';
// IMPORTAÇÃO CORRIGIDA: Apenas ícones válidos do lucide-react
import { Plus, Cloud as CloudIcon, Shield, X, Pencil, Trash2, RefreshCw, Info } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { ask } from '@tauri-apps/plugin-dialog';

interface Vault {
  id?: number;
  name: string;
  provider: string;
  bucket_name: string;
  access_key: string;
  secret_key: string;
  endpoint_url: string; 
}

const providerMeta = (p: string) => {
  const v = (p || '').toLowerCase();
  if (v.includes('cloudflare') || v.includes('r2')) return { badge: 'R2', cls: 'bg-orange-500/10 text-orange-500 border-orange-500/30' };
  if (v.includes('backblaze')) return { badge: 'B2', cls: 'bg-red-500/10 text-red-500 border-red-500/30' };
  if (v.includes('google')) return { badge: 'GCS', cls: 'bg-blue-500/10 text-blue-500 border-blue-500/30' };
  if (v.includes('azure')) return { badge: 'AZ', cls: 'bg-sky-500/10 text-sky-500 border-sky-500/30' };
  return { badge: 'S3', cls: 'bg-amber-500/10 text-amber-500 border-amber-500/30' };
};

export default function CloudStorage() {
  const { t } = useTranslation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const providerOptions = [
    { value: 'Amazon Web Services (S3)', label: t('cloud.form.providers.aws') },
    { value: 'Cloudflare R2', label: t('cloud.form.providers.cloudflareR2') },
    { value: 'Backblaze B2', label: t('cloud.form.providers.backblazeB2') },
    { value: 'Outro S3 Compatível', label: t('cloud.form.providers.otherS3Compatible') }
  ];
  
  // Estado inicial limpo e fortemente tipado
  const [formData, setFormData] = useState<Vault>({
    name: '',
    provider: 'Amazon Web Services (S3)',
    access_key: '',
    secret_key: '',
    bucket_name: '',
    endpoint_url: ''
  });

  const fetchVaults = async () => {
    try {
      const data = await invoke<Vault[]>('get_cloud_vaults');
      setVaults(data);
    } catch (error) {
      console.error("Erro ao carregar cofres:", error);
    }
  };

  useEffect(() => { fetchVaults(); }, []);

  const handleOpenCreate = () => {
    setEditingId(null);
    setFormData({
      name: '',
      provider: 'Amazon Web Services (S3)',
      access_key: '',
      secret_key: '',
      bucket_name: '',
      endpoint_url: ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (vault: Vault) => {
    setEditingId(vault.id || null);
    // Operadores lógicos garantem que nunca passamos "undefined" ou "null" aos inputs
    setFormData({ 
      name: vault.name || '', 
      provider: vault.provider || 'Amazon Web Services (S3)', 
      access_key: vault.access_key || '', 
      secret_key: vault.secret_key || '', 
      bucket_name: vault.bucket_name || '',
      endpoint_url: vault.endpoint_url || ''
    });
    setIsModalOpen(true);
  };

  const handleDeleteVault = async (id?: number) => {
    if (!id) return;
    const confirmed = await ask(t('cloud.confirm.deleteMessage'), { title: t('app.name'), kind: 'warning' });
    if (!confirmed) return;

    try {
      await invoke('delete_cloud_vault', { id });
      fetchVaults();
    } catch (error) {
      alert(t('cloud.toast.deleteFailed', { error: String(error) }));
    }
  };

  const handleConnectVault = async () => {
    if (!formData.name || !formData.access_key || !formData.secret_key || !formData.bucket_name) {
      alert(t('cloud.toast.requiredFields'));
      return;
    }
    
    // Adiciona o prefixo https:// se o usuário esquecer
    let finalEndpoint = formData.endpoint_url;
    if (finalEndpoint && !finalEndpoint.startsWith('http')) {
        finalEndpoint = `https://${finalEndpoint}`;
    }

    const payloadToSave = { ...formData, endpoint_url: finalEndpoint };
    
    setIsConnecting(true);

    try {
      if (editingId !== null) {
        await invoke('update_cloud_vault', { vault: { id: editingId, ...payloadToSave } });
      } else {
        await invoke('add_cloud_vault', { vault: payloadToSave });
      }
      setIsModalOpen(false);
      fetchVaults();
    } catch (error) {
      alert(t('cloud.toast.invalidCredentials', { error: String(error) }));
    } finally {
      setIsConnecting(false);
    }
  };
  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold mb-2 tracking-tight text-slate-900 dark:text-slate-100">{t('cloud.title')}</h1>
          <p className="text-textMuted">{t('cloud.subtitle')}</p>
        </div>
        <button type="button" onClick={handleOpenCreate} className={`bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-lg font-medium flex items-center gap-2 whitespace-nowrap transition-all duration-300 shadow-[0_0_15px_rgba(245,158,11,0.3)] cursor-pointer ${FOCUS_RING}`}>
          <Plus className="w-5 h-5" aria-hidden="true" /> {t('cloud.connectNew')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 xl:gap-6">
        {vaults.map((vault, index) => {
          const meta = providerMeta(vault.provider);
          return (
            <article key={vault.id ?? index} className="relative overflow-hidden bg-gradient-to-br from-surface to-surface/60 backdrop-blur-xl border border-border rounded-2xl p-4 shadow-sm hover:border-primary/50 hover:shadow-[0_0_20px_rgba(245,158,11,0.15)] transition-all duration-300 group flex flex-col gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-xs font-extrabold tracking-wide border ${meta.cls}`} aria-hidden="true">{meta.badge}</div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-textMain truncate group-hover:text-primary transition-colors" title={vault.name}>{vault.name}</h3>
                  <p className="text-xs text-textMuted truncate" title={vault.provider}>{vault.provider}</p>
                </div>
                <span className="shrink-0 whitespace-nowrap bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.35)] text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.9)]"></span>{t('cloud.connected')}
                </span>
              </div>

              <dl className="bg-background/60 rounded-lg px-3 py-2 border border-border/50 text-xs text-textMuted flex flex-col gap-1">
                <div className="flex justify-between gap-3"><dt className="whitespace-nowrap">{t('cloud.bucket')}</dt><dd className="text-textMain font-semibold truncate" title={vault.bucket_name}>{vault.bucket_name}</dd></div>
                <div className="flex justify-between gap-3"><dt className="whitespace-nowrap">{t('cloud.crypto')}</dt><dd className="text-emerald-500 font-semibold whitespace-nowrap flex items-center gap-1"><Shield className="w-3.5 h-3.5" aria-hidden="true" />{t('cloud.cryptoReady')}</dd></div>
              </dl>

              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => handleOpenEdit(vault)} aria-label={t('cloud.edit')} title={t('cloud.edit')} className={`bg-background hover:bg-surface/50 border border-border text-textMuted hover:text-textMain p-2 rounded-lg transition-all duration-300 cursor-pointer ${FOCUS_RING}`}><Pencil className="w-4 h-4" aria-hidden="true" /></button>
                <button type="button" onClick={() => handleDeleteVault(vault.id)} aria-label={t('cloud.delete')} title={t('cloud.delete')} className={`bg-background hover:bg-red-500/10 border border-border text-textMuted hover:text-red-500 p-2 rounded-lg transition-all duration-300 cursor-pointer ${FOCUS_RING}`}><Trash2 className="w-4 h-4" aria-hidden="true" /></button>
              </div>
            </article>
          );
        })}

        <button type="button" onClick={handleOpenCreate} className={`border-2 border-dashed border-border/60 rounded-2xl p-4 flex flex-col items-center justify-center text-center opacity-70 hover:opacity-100 hover:border-primary/50 hover:bg-surface/50 transition-all duration-300 cursor-pointer min-h-[150px] ${FOCUS_RING}`}>
          <div className="bg-background p-3 rounded-full mb-3"><CloudIcon className="w-6 h-6 text-textMuted" aria-hidden="true" /></div>
          <h3 className="font-semibold text-base mb-1 text-textMain">{t('cloud.addTitle')}</h3>
          <p className="text-xs text-textMuted max-w-[220px]">{t('cloud.addDesc')}</p>
        </button>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden translate-y-0 animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex justify-between items-center p-6 border-b border-border/50">
              <h2 className="text-xl font-bold text-textMain">{editingId !== null ? t('cloud.modal.editTitle') : t('cloud.modal.createTitle')}</h2>
              <button type="button" onClick={() => setIsModalOpen(false)} aria-label={t('common.actions.close')} title={t('common.actions.close')} className="text-textMuted hover:text-textMain transition-colors p-1 rounded-md hover:bg-surface/10 cursor-pointer"><X size={24} aria-hidden="true" /></button>
            </div>
            
            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-textMuted mb-1.5">{t('cloud.form.nameLabel')}</label>
                <input type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder={t('cloud.form.namePlaceholder')} className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-textMain placeholder-textMuted/50 focus:border-primary outline-none transition-all" />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-textMuted mb-1.5">{t('cloud.form.providerLabel')}</label>
                <select value={formData.provider} onChange={(e) => setFormData({...formData, provider: e.target.value})} className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-textMain focus:border-primary outline-none transition-all appearance-none">
                  {providerOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-textMuted mb-1.5">{t('cloud.form.bucketLabel')}</label>
                <input type="text" value={formData.bucket_name} onChange={(e) => setFormData({...formData, bucket_name: e.target.value})} placeholder={t('cloud.form.bucketPlaceholder')} className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-textMain placeholder-textMuted/50 focus:border-primary outline-none transition-all font-mono text-sm" />
              </div>

              <div className="grid grid-cols-2 gap-4 bg-background/50 p-4 border border-border rounded-xl">
                <div className="col-span-2 mb-1">
                  <span className="text-xs font-bold uppercase tracking-widest text-primary flex items-center"><Shield size={12} className="mr-1" aria-hidden="true" /> {t('cloud.form.credentialsTitle')}</span>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-textMuted mb-1">{t('cloud.form.endpointLabel')}</label>
                  <input type="text" value={formData.endpoint_url} onChange={(e) => setFormData({...formData, endpoint_url: e.target.value})} placeholder={t('cloud.form.endpointPlaceholder')} className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-textMain focus:border-primary outline-none transition-all text-xs font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-textMuted mb-1">{t('cloud.form.accessKeyLabel')}</label>
                  <input type="password" value={formData.access_key} onChange={(e) => setFormData({...formData, access_key: e.target.value})} placeholder={t('cloud.form.accessKeyPlaceholder')} className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-textMain focus:border-primary outline-none transition-all text-xs font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-textMuted mb-1">{t('cloud.form.secretKeyLabel')}</label>
                  <input type="password" value={formData.secret_key} onChange={(e) => setFormData({...formData, secret_key: e.target.value})} placeholder={t('cloud.form.secretKeyPlaceholder')} className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-textMain focus:border-primary outline-none transition-all text-xs font-mono" />
                </div>
              </div>
              
            </div>
            <div className="p-5 border-t border-border/50 bg-background/50 flex justify-between items-center">
              <span className="text-[10px] text-textMuted font-medium flex items-center"><Info size={12} className="mr-1" aria-hidden="true" />{t('cloud.modal.validationHint')}</span>
              <div className="flex space-x-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-lg font-medium text-textMuted hover:text-textMain hover:bg-surface border border-transparent transition-all cursor-pointer text-sm">{t('common.actions.cancel')}</button>
                <button type="button" onClick={handleConnectVault} disabled={isConnecting} className="bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-lg font-medium shadow-lg shadow-primary/20 transition-all flex items-center disabled:opacity-50 cursor-pointer text-sm">
                  {isConnecting ? <RefreshCw size={16} className="mr-2 animate-spin" aria-hidden="true" /> : <Shield size={16} className="mr-2" aria-hidden="true" />}
                  {isConnecting ? t('cloud.actions.testing') : t('cloud.actions.connect')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}