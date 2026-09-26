import { useState, useEffect } from 'react';
import { Plus, Cloud as CloudIcon, Shield, X, Server } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

// Definimos o formato do Cofre
interface Vault {
  name: string;
  provider: string;
  bucket_name: string;
}

export default function CloudStorage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [vaults, setVaults] = useState<Vault[]>([]); // Lista de cofres guardados
  
  const [formData, setFormData] = useState({
    name: '',
    provider: 'Amazon Web Services (S3)',
    access_key: '',
    secret_key: '',
    bucket_name: ''
  });

  // Função para procurar os cofres na base de dados Rust
  const fetchVaults = async () => {
    try {
      const data = await invoke<Vault[]>('get_cloud_vaults');
      setVaults(data);
    } catch (error) {
      console.error("Erro ao carregar cofres:", error);
    }
  };

  // Carrega os cofres assim que a página é aberta
  useEffect(() => {
    fetchVaults();
  }, []);

  const handleConnectVault = async () => {
    if (!formData.name || !formData.access_key || !formData.secret_key || !formData.bucket_name) {
      alert("Preencha todos os campos antes de conectar.");
      return;
    }

    setIsConnecting(true);

    try {
      await invoke('add_cloud_vault', { vault: formData });
      setIsModalOpen(false);
      setFormData({ name: '', provider: 'Amazon Web Services (S3)', access_key: '', secret_key: '', bucket_name: '' });
      
      // Recarrega a lista para mostrar o novo cofre imediatamente
      fetchVaults();
    } catch (error) {
      alert(`Erro crítico ao conectar cofre: ${error}`);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold mb-2 tracking-tight">Cofres Cloud</h1>
          <p className="text-textMuted">Faça a gestão dos destinos de armazenamento seguros para os seus backups.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-lg font-medium flex items-center transition-all shadow-lg shadow-primary/20"
        >
          <Plus size={20} className="mr-2" />
          Conectar Novo Cofre
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        
        {/* Renderiza os cofres reais da Base de Dados */}
        {vaults.map((vault, index) => (
          <div key={index} className="bg-surface border border-border rounded-xl p-6 shadow-sm hover:border-primary/50 transition-colors group cursor-pointer">
            <div className="flex justify-between items-start mb-4">
              <div className="bg-blue-500/10 p-3 rounded-lg text-blue-500">
                <Server size={24} />
              </div>
              <span className="bg-green-500/10 text-green-500 text-xs font-bold px-2.5 py-1 rounded-full flex items-center">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5 animate-pulse"></div>
                Conectado
              </span>
            </div>
            <h3 className="text-xl font-bold mb-1 group-hover:text-primary transition-colors">{vault.name}</h3>
            <p className="text-sm text-textMuted mb-4">{vault.provider}</p>
            <div className="bg-background rounded-md p-3 border border-border/50 text-xs text-textMuted flex flex-col gap-1">
              <span className="flex justify-between">Destino: <strong className="text-white">{vault.bucket_name}</strong></span>
              <span className="flex justify-between">Status: <strong className="text-green-500">Pronto para Sincronização</strong></span>
            </div>
          </div>
        ))}

        {/* Card para Adicionar Novo */}
        <div 
          onClick={() => setIsModalOpen(true)}
          className="border-2 border-dashed border-border/60 rounded-xl p-6 flex flex-col items-center justify-center text-center opacity-70 hover:opacity-100 hover:border-primary/50 hover:bg-surface/50 transition-all cursor-pointer min-h-[200px]"
        >
          <div className="bg-background p-4 rounded-full mb-4">
            <CloudIcon size={32} className="text-textMuted" />
          </div>
          <h3 className="font-semibold text-lg mb-1">Adicionar Cofre Nuvem</h3>
          <p className="text-sm text-textMuted max-w-[200px]">Conecte AWS S3, Google Cloud, Azure ou Backblaze B2.</p>
        </div>
      </div>

      {isModalOpen && (
        // ... (O código do modal mantém-se exatamente igual ao anterior)
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 animate-in fade-in duration-200">
          <div className="bg-surface border border-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden translate-y-0 animate-in slide-in-from-bottom-4 duration-300">
            <div className="flex justify-between items-center p-6 border-b border-border/50">
              <h2 className="text-xl font-bold">Conectar Cofre Cloud</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-textMuted hover:text-white transition-colors p-1 rounded-md hover:bg-white/10">
                <X size={24} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-textMuted mb-1.5">Nome de Identificação</label>
                <input type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="Ex: Backup AWS São Paulo" className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-white placeholder-textMuted/50 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" />
              </div>
              <div>
                <label className="block text-sm font-medium text-textMuted mb-1.5">Fornecedor (Provider)</label>
                <select value={formData.provider} onChange={(e) => setFormData({...formData, provider: e.target.value})} className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-white focus:border-primary outline-none transition-all appearance-none">
                  <option>Amazon Web Services (S3)</option>
                  <option>Microsoft Azure (Blob)</option>
                  <option>Google Cloud Storage</option>
                  <option>Backblaze B2</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-textMuted mb-1.5">Access Key</label>
                  <input type="password" value={formData.access_key} onChange={(e) => setFormData({...formData, access_key: e.target.value})} placeholder="AKIA..." className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-white placeholder-textMuted/50 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-textMuted mb-1.5">Secret Key</label>
                  <input type="password" value={formData.secret_key} onChange={(e) => setFormData({...formData, secret_key: e.target.value})} placeholder="••••••••••••" className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-white placeholder-textMuted/50 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-textMuted mb-1.5">Nome do Bucket</label>
                <input type="text" value={formData.bucket_name} onChange={(e) => setFormData({...formData, bucket_name: e.target.value})} placeholder="kopher-shield-production" className="w-full bg-background border border-border rounded-lg px-4 py-2.5 text-white placeholder-textMuted/50 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all" />
              </div>
            </div>
            <div className="p-6 border-t border-border/50 bg-background/50 flex justify-end space-x-3">
              <button onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-lg font-medium text-textMuted hover:text-white hover:bg-surface border border-transparent hover:border-border transition-all">Cancelar</button>
              <button onClick={handleConnectVault} disabled={isConnecting} className="bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-lg font-medium shadow-lg shadow-primary/20 transition-all flex items-center disabled:opacity-50">
                <Shield size={18} className="mr-2" />
                {isConnecting ? "Validando..." : "Validar e Conectar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}