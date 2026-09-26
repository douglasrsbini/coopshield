import { useState } from 'react';
import { ShieldAlert, Search, FolderSearch, FileKey2, RefreshCw, CheckCircle2, AlertCircle, Info, HardDriveDownload } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { message } from '@tauri-apps/plugin-dialog';

interface BackupManifest {
  name: string;
  path: string;
  status: string;
}

interface Toast {
  id: number;
  title: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export default function Restore() {
  const [vaultPath, setVaultPath] = useState('');
  const [manifests, setManifests] = useState<BackupManifest[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [restoringPath, setRestoringPath] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (title: string, msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, title, message: msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  };

  const handleSelectVault = async () => {
    try {
      const path = await invoke<string>('select_folder_dialog');
      if (path) {
        setVaultPath(path);
        scanVault(path);
      }
    } catch (error) {
      console.log("Cancelado:", error);
    }
  };

  const scanVault = async (path: string) => {
    setIsScanning(true);
    setManifests([]);
    showToast('Procurando Backups', 'A aceder ao cofre e a verificar integridade...', 'info');
    
    try {
      // IPC do Tauri: enviamos vaultPath (camelCase) para ler vault_path (snake_case)
      const foundManifests = await invoke<BackupManifest[]>('scan_local_vault', { vaultPath: path });
      setManifests(foundManifests);
      
      if (foundManifests.length > 0) {
        showToast('Sucesso', `${foundManifests.length} backup(s) localizado(s) com sucesso.`, 'success');
      } else {
        showToast('Vazio', 'Nenhum manifesto (.kopher) encontrado nesta pasta.', 'error');
      }
    } catch (error) {
      showToast('Erro de Leitura', `Falha ao abrir o cofre: ${error}`, 'error');
    } finally {
      setIsScanning(false);
    }
  };

const handleRestore = async (manifestPath: string) => {
    try {
      // Usamos o nosso Toast em vez do 'message' para evitar bloqueios de segurança do Tauri
      showToast('Ação Necessária', 'Selecione a pasta onde os ficheiros recuperados devem ser guardados.', 'info');
      
      const restoreDest = await invoke<string>('select_folder_dialog');
      
      // Se o utilizador fechar a janela sem escolher pasta, cancelamos graciosamente
      if (!restoreDest) {
        showToast('Cancelado', 'Nenhuma pasta de destino selecionada.', 'info');
        return;
      }

      setRestoringPath(manifestPath);
      showToast('Motor Reverso Ativado', 'Iniciando desencriptação AES-256 e montagem...', 'info');

      const response = await invoke('execute_restore', { 
        manifestPath: manifestPath, 
        restorePath: restoreDest 
      });

      showToast('Restauro a Decorrer', response as string, 'success');
    } catch (error) {
      showToast('Erro', `Falha ao iniciar restauro: ${error}`, 'error');
    } finally {
      setRestoringPath(null);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-[1600px] mx-auto relative">
      
      {/* Sistema de Notificações */}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col space-y-3 pointer-events-none">
        {toasts.map(toast => (
          <div key={toast.id} className={`w-80 p-4 rounded-xl shadow-2xl border flex items-start space-x-3 pointer-events-auto animate-in slide-in-from-right-8 fade-in duration-300 ${
            toast.type === 'success' ? 'bg-surface/95 border-green-500/40' :
            toast.type === 'error' ? 'bg-surface/95 border-red-500/40' :
            'bg-surface/95 border-blue-500/40'
          }`}>
            <div className="shrink-0 mt-0.5">
              {toast.type === 'success' && <CheckCircle2 size={18} className="text-green-400" />}
              {toast.type === 'error' && <AlertCircle size={18} className="text-red-400" />}
              {toast.type === 'info' && <Info size={18} className="text-blue-400" />}
            </div>
            <div className="flex flex-col">
              <h4 className={`text-sm font-bold ${toast.type === 'success' ? 'text-green-400' : toast.type === 'error' ? 'text-red-400' : 'text-blue-400'}`}>{toast.title}</h4>
              <p className="text-xs text-gray-300 mt-1 leading-relaxed">{toast.message}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center border-b border-border/50 pb-6">
        <div>
          <h1 className="text-3xl font-bold mb-2 tracking-tight flex items-center text-red-400">
            <ShieldAlert size={28} className="mr-3" />
            Disaster Recovery
          </h1>
          <p className="text-sm text-textMuted">Restaure os seus ficheiros críticos a partir de cofres seguros.</p>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-6">
        <label className="block text-sm font-medium text-textMuted mb-2">Localizar Cofre de Segurança</label>
        <div className="flex space-x-3">
          <input 
            type="text" 
            value={vaultPath}
            readOnly
            placeholder="Selecione a pasta do cofre (ex: Kopher_Shield_Vault)..." 
            className="w-full bg-background border border-border rounded-lg px-4 py-3 text-sm text-white outline-none cursor-pointer" 
            onClick={handleSelectVault}
          />
          <button 
            onClick={handleSelectVault}
            className="bg-primary/20 hover:bg-primary/30 border border-primary/40 text-primary px-6 py-3 rounded-lg font-medium text-sm flex items-center transition-all shrink-0 cursor-pointer"
          >
            <FolderSearch size={18} className="mr-2" />
            Abrir Cofre
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-bold flex items-center text-white">
          <Search size={18} className="mr-2 text-primary" />
          Backups Localizados
        </h2>

        {isScanning ? (
          <div className="bg-surface border border-border border-dashed rounded-xl p-12 flex flex-col items-center justify-center space-y-4">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            <p className="text-textMuted text-sm font-medium">A analisar integridade do cofre...</p>
          </div>
        ) : manifests.length === 0 ? (
          <div className="bg-surface border border-border border-dashed rounded-xl p-12 text-center text-textMuted text-sm">
            Nenhum ponto de restauro localizado. Selecione um cofre válido acima.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 animate-in fade-in slide-in-from-bottom-4">
            {manifests.map((manifest, index) => (
              <div key={index} className="bg-surface border border-border rounded-xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-primary/40 transition-all shadow-sm">
                
                <div className="flex items-center space-x-4">
                  <div className="bg-blue-500/10 p-3 rounded-lg text-blue-400">
                    <FileKey2 size={24} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white mb-1">{manifest.name}</h3>
                    <div className="flex space-x-4 text-xs text-textMuted">
                      <span className="flex items-center text-green-400">
                        <CheckCircle2 size={12} className="mr-1" /> {manifest.status}
                      </span>
                      <span className="truncate max-w-xs" title={manifest.path}>{manifest.path}</span>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={() => handleRestore(manifest.path)}
                  disabled={restoringPath === manifest.path}
                  className="bg-primary hover:bg-primary/90 text-white px-5 py-2.5 rounded-lg font-medium text-sm flex items-center transition-all shadow-md w-full md:w-auto justify-center cursor-pointer disabled:opacity-50"
                >
                  {restoringPath === manifest.path ? (
                    <RefreshCw size={16} className="mr-2 animate-spin" />
                  ) : (
                    <HardDriveDownload size={16} className="mr-2" />
                  )}
                  {restoringPath === manifest.path ? 'Reconstruindo...' : 'Restaurar Dados'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}