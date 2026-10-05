import { useState, useEffect } from 'react';
// IMPORTAÇÃO CORRIGIDA: Apenas ícones válidos do lucide-react
import { Plus, Cloud as CloudIcon, Shield, X, Server, Pencil, Trash2, RefreshCw, Info } from 'lucide-react';
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

export default function CloudStorage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  
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
    const confirmed = await ask("Tem certeza que deseja eliminar esta conexão de cofre? Os ficheiros na nuvem NÃO serão apagados.", { title: 'CoopShield', kind: 'warning' });
    if (!confirmed) return;

    try {
      await invoke('delete_cloud_vault', { id });
      fetchVaults();
    } catch (error) {
      alert(`Falha ao eliminar: ${error}`);
    }
  };

  const handleConnectVault = async () => {
    if (!formData.name || !formData.access_key || !formData.secret_key || !formData.bucket_name) {
      alert("As chaves de segurança e o nome do bucket são obrigatórios.");
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
      alert(`O servidor rejeitou as credenciais:\n\n${error}`);
    } finally {
      setIsConnecting(false);
    }
  };
  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-[1600px] mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold mb-2 tracking-tight text-textMain">Cofres Cloud</h1>
          <p className="text-textMuted">Faça a gestão dos destinos de armazenamento seguros para os seus backups.</p>
        </div>
        <button onClick={handleOpenCreate} className="bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-lg font-medium flex items-center transition-all shadow-lg shadow-primary/20 cursor-pointer">
          <Plus size={20} className="mr-2" /> Conectar Novo Cofre
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        
        {vaults.map((vault, index) => (
          <div key={index} className="bg-surface border border-border rounded-xl p-6 shadow-sm hover:border-primary/50 transition-colors group flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-start mb-4">
                <div className="bg-blue-500/10 p-3 rounded-lg text-blue-500"><Server size={24} /></div>
                <span className="bg-green-500/10 text-green-500 text-xs font-bold px-2.5 py-1 rounded-full flex items-center">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5 animate-pulse"></div> Conectado
                </span>
              </div>
              <h3 className="text-xl font-bold mb-1 text-textMain group-hover:text-primary transition-colors">{vault.name}</h3>
              <p className="text-sm text-textMuted mb-4">{vault.provider}</p>
              <div className="bg-background rounded-md p-3 border border-border/50 text-xs text-textMuted flex flex-col gap-1 mb-4">
                <span className="flex justify-between">Bucket S3: <strong className="text-textMain">{vault.bucket_name}</strong></span>
                <span className="flex justify-between">Status Criptográfico: <strong className="text-green-500">AES-256 Pronto</strong></span>
              </div>
            </div>
            
            <div className="flex justify-end space-x-2 pt-3 border-t border-border/50">
              <button onClick={() => handleOpenEdit(vault)} className="bg-background hover:bg-surface/50 border border-border text-textMuted hover:text-textMain p-1.5 rounded-md transition-all cursor-pointer" title="Editar Cofre"><Pencil size={15} /></button>
              <button onClick={() => handleDeleteVault(vault.id)} className="bg-background hover:bg-red-500/10 border border-border text-textMuted hover:text-red-500 p-1.5 rounded-md transition-all cursor-pointer" title="Eliminar Conexão"><Trash2 size={15} /></button>
            </div>
          </div>
        ))}

        <div onClick={handleOpenCreate} className="border-2 border-dashed border-border/60 rounded-xl p-6 flex flex-col items-center justify-center text-center opacity-70 hover:opacity-100 hover:border-primary/50 hover:bg-surface/50 transition-all cursor-pointer min-h-[200px]">
          <div className="bg-background p-4 rounded-full mb-4"><CloudIcon size={32} className="text-textMuted" /></div>
          <h3 className="font-semibold text-lg mb-1 text-textMain">Adicionar Cofre Nuvem</h3>
          <p className="text-sm text-textMuted max-w-[200px]">Conecte AWS S3, Google Cloud, Azure ou Backblaze B2.</p>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden translate-y-0 animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex justify-between items-center p-6 border-b border-border/50">
              <h2 className="text-xl font-bold text-textMain">{editingId !== null ? 'Editar Conexão' : 'Autenticar Cofre Cloud'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-textMuted hover:text-textMain transition-colors p-1 rounded-md hover:bg-surface/10 cursor-pointer"><X size={24} /></button>
            </div>
            
            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-textMuted mb-1.5">Nome de Identificação</label>
                <input type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="Ex: Backup AWS São Paulo" className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-textMain placeholder-textMuted/50 focus:border-primary outline-none transition-all" />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-textMuted mb-1.5">Fornecedor (Provider)</label>
                <select value={formData.provider} onChange={(e) => setFormData({...formData, provider: e.target.value})} className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-textMain focus:border-primary outline-none transition-all appearance-none">
                  <option value="Amazon Web Services (S3)">Amazon Web Services (S3)</option>
                  <option value="Cloudflare R2">Cloudflare R2 (Compatível S3)</option>
                  <option value="Backblaze B2">Backblaze B2 (Compatível S3)</option>
                  <option value="Outro S3 Compatível">Outro (S3 Compatível)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-textMuted mb-1.5">Nome do Bucket (Contentor)</label>
                <input type="text" value={formData.bucket_name} onChange={(e) => setFormData({...formData, bucket_name: e.target.value})} placeholder="coopshield-production" className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-textMain placeholder-textMuted/50 focus:border-primary outline-none transition-all font-mono text-sm" />
              </div>

              <div className="grid grid-cols-2 gap-4 bg-background/50 p-4 border border-border rounded-xl">
                <div className="col-span-2 mb-1">
                  <span className="text-xs font-bold uppercase tracking-widest text-primary flex items-center"><Shield size={12} className="mr-1" /> Credenciais de Segurança IAM</span>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-textMuted mb-1">URL Endpoint API (Se for Cloudflare R2 / Backblaze)</label>
                  <input type="text" value={formData.endpoint_url} onChange={(e) => setFormData({...formData, endpoint_url: e.target.value})} placeholder="https://<ID>.r2.cloudflarestorage.com" className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-textMain focus:border-primary outline-none transition-all text-xs font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-textMuted mb-1">Access Key ID</label>
                  <input type="password" value={formData.access_key} onChange={(e) => setFormData({...formData, access_key: e.target.value})} placeholder="AKIA..." className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-textMain focus:border-primary outline-none transition-all text-xs font-mono" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-textMuted mb-1">Secret Access Key</label>
                  <input type="password" value={formData.secret_key} onChange={(e) => setFormData({...formData, secret_key: e.target.value})} placeholder="••••••••••••" className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-textMain focus:border-primary outline-none transition-all text-xs font-mono" />
                </div>
              </div>
              
            </div>
            <div className="p-5 border-t border-border/50 bg-background/50 flex justify-between items-center">
              <span className="text-[10px] text-textMuted font-medium flex items-center"><Info size={12} className="mr-1" />A conexão será validada ao salvar.</span>
              <div className="flex space-x-3">
                <button onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-lg font-medium text-textMuted hover:text-textMain hover:bg-surface border border-transparent transition-all cursor-pointer text-sm">Cancelar</button>
                <button onClick={handleConnectVault} disabled={isConnecting} className="bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-lg font-medium shadow-lg shadow-primary/20 transition-all flex items-center disabled:opacity-50 cursor-pointer text-sm">
                  {isConnecting ? <RefreshCw size={16} className="mr-2 animate-spin" /> : <Shield size={16} className="mr-2" />}
                  {isConnecting ? "Testando Nuvem..." : "Conectar Nuvem"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}