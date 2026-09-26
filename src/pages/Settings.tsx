import { useState, useEffect } from 'react';
import { Palette, Bell, Key, Mail, MessageSquare, Save, ShieldCheck, CheckCircle2, AlertCircle, Info, Moon, Sun, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface Toast {
  id: number;
  title: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState('appearance');
  const [isSaving, setIsSaving] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Estados dos Formulários
  const [theme, setTheme] = useState('dark');
  const [accentColor, setAccentColor] = useState('#3b82f6');
  
  // SMTP
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('');
  const [smtpSecurity, setSmtpSecurity] = useState('TLS');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');

  // WhatsApp API
  const [waEndpoint, setWaEndpoint] = useState('');
  const [waToken, setWaToken] = useState('');
  const [waNumber, setWaNumber] = useState('');
  
  // Licenciamento
  const [licenseKey, setLicenseKey] = useState('');
  const [licenseStatus, setLicenseStatus] = useState<'unlicensed' | 'active'>('unlicensed');

  // Sistema de Notificações Aprimorado
  const showToast = (title: string, msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, title, message: msg, type }]);
    setTimeout(() => removeToast(id), 5000);
  };

  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  useEffect(() => {
    async function loadSettings() {
      try {
        const data = await invoke<Record<string, string>>('get_all_settings');
        if (data) {
          if (data.theme) setTheme(data.theme);
          if (data.accent_color) setAccentColor(data.accent_color);
          if (data.smtp_host) setSmtpHost(data.smtp_host);
          if (data.smtp_port) setSmtpPort(data.smtp_port);
          if (data.smtp_security) setSmtpSecurity(data.smtp_security);
          if (data.smtp_user) setSmtpUser(data.smtp_user);
          if (data.smtp_pass) setSmtpPass(data.smtp_pass);
          if (data.whatsapp_api) setWaEndpoint(data.whatsapp_api);
          if (data.whatsapp_token) setWaToken(data.whatsapp_token);
          if (data.whatsapp_number) setWaNumber(data.whatsapp_number);
          if (data.license_key) setLicenseKey(data.license_key);
          if (data.license_status === 'active' || data.license_status === 'unlicensed') {
            setLicenseStatus(data.license_status);
          }
        }
      } catch (error) {
        showToast('Erro de Leitura', 'Falha ao carregar as configurações do SQLite.', 'error');
      }
    }
    loadSettings();
  }, []);

  const hexToRgb = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r} ${g} ${b}`;
  };

  const handleSave = async () => {
    setIsSaving(true);
    showToast('A Guardar', 'A aplicar configurações ao núcleo do sistema...', 'info');

    const payload = {
      theme,
      accent_color: accentColor,
      smtp_host: smtpHost,
      smtp_port: smtpPort,
      smtp_security: smtpSecurity,
      smtp_user: smtpUser,
      smtp_pass: smtpPass,
      whatsapp_api: waEndpoint,
      whatsapp_token: waToken,
      whatsapp_number: waNumber,
      license_key: licenseKey,
      license_status: licenseStatus
    };

    try {
      await invoke('update_settings', { payload });
      
      const root = document.documentElement;
      root.style.setProperty('--primary', hexToRgb(accentColor));
      
      if (theme === 'light') {
        root.style.setProperty('--background', '249 250 251');
        root.style.setProperty('--surface', '255 255 255');
        root.style.setProperty('--border', '229 231 235');
        root.style.setProperty('--text-main', '17 24 39');
        root.style.setProperty('--text-muted', '75 85 99');
      } else {
        root.style.setProperty('--background', '15 17 21');
        root.style.setProperty('--surface', '22 25 32');
        root.style.setProperty('--border', '30 41 59');
        root.style.setProperty('--text-main', '248 250 252');
        root.style.setProperty('--text-muted', '148 163 184');
      }
      
      showToast('Sucesso', 'Configurações corporativas atualizadas com sucesso!', 'success');
    } catch (error) {
      showToast('Erro', `Falha ao gravar no SQLite: ${error}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleActivateLicense = async () => {
    if (!licenseKey || licenseKey.length < 15) {
      showToast('Chave Inválida', 'Por favor, insira uma chave de licença válida (Ex: KOPHER-2026-...).', 'error');
      return;
    }
    
    setIsSaving(true);
    setTimeout(async () => {
      setLicenseStatus('active');
      await invoke('update_settings', { payload: { license_key: licenseKey, license_status: 'active' } });
      showToast('Sistema Ativado', 'Licença validada! O Kopher Shield está agora na versão Enterprise.', 'success');
      setIsSaving(false);
    }, 1500);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-[1600px] mx-auto relative">
      
      {/* Sistema de Toasts */}
      <div className="fixed top-6 right-6 z-[100] flex flex-col space-y-3 pointer-events-none">
        {toasts.map(toast => (
          <div key={toast.id} className={`w-80 p-4 rounded-xl shadow-2xl border flex items-start space-x-3 pointer-events-auto animate-in slide-in-from-right-8 fade-in duration-300 ${
            toast.type === 'success' ? 'bg-surface/95 border-green-500/40' :
            toast.type === 'error' ? 'bg-surface/95 border-red-500/40' : 'bg-surface/95 border-blue-500/40'
          }`}>
            <div className="shrink-0 mt-0.5">
              {toast.type === 'success' && <CheckCircle2 size={18} className="text-green-500" />}
              {toast.type === 'error' && <AlertCircle size={18} className="text-red-500" />}
              {toast.type === 'info' && <Info size={18} className="text-blue-500" />}
            </div>
            <div className="flex flex-col flex-1">
              <h4 className={`text-sm font-bold ${toast.type === 'success' ? 'text-green-500' : toast.type === 'error' ? 'text-red-500' : 'text-blue-500'}`}>{toast.title}</h4>
              <p className="text-xs text-textMuted mt-1 leading-relaxed">{toast.message}</p>
            </div>
            <button onClick={() => removeToast(toast.id)} className="text-textMuted hover:text-textMain transition-colors cursor-pointer shrink-0">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>

      <div>
        <h1 className="text-3xl font-bold mb-2 tracking-tight">Configurações do Sistema</h1>
        <p className="text-sm text-textMuted">Personalize a aparência, alertas de monitorização e licenciamento Kopher Shield.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        
        <div className="w-full lg:w-64 flex flex-col space-y-2 shrink-0">
          <button onClick={() => setActiveTab('appearance')} className={`flex items-center px-4 py-3 rounded-xl font-medium text-sm transition-all cursor-pointer ${activeTab === 'appearance' ? 'bg-primary/10 text-primary border border-primary/20' : 'text-textMuted hover:bg-surface hover:text-textMain border border-transparent'}`}>
            <Palette size={18} className="mr-3" /> Aparência e Tema
          </button>
          <button onClick={() => setActiveTab('notifications')} className={`flex items-center px-4 py-3 rounded-xl font-medium text-sm transition-all cursor-pointer ${activeTab === 'notifications' ? 'bg-primary/10 text-primary border border-primary/20' : 'text-textMuted hover:bg-surface hover:text-textMain border border-transparent'}`}>
            <Bell size={18} className="mr-3" /> Central de Alertas
          </button>
          <button onClick={() => setActiveTab('license')} className={`flex items-center px-4 py-3 rounded-xl font-medium text-sm transition-all cursor-pointer ${activeTab === 'license' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'text-textMuted hover:bg-surface hover:text-textMain border border-transparent'}`}>
            <Key size={18} className="mr-3" /> Licenciamento
          </button>
        </div>

        <div className="flex-1 bg-surface border border-border rounded-2xl p-8 min-h-[600px]">
          
          {/* TAB: APARÊNCIA */}
          {activeTab === 'appearance' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
              <div>
                <h2 className="text-xl font-bold mb-1">Identidade Visual (White-Label)</h2>
                <p className="text-sm text-textMuted mb-6">Adapte o Kopher Shield à identidade da sua empresa.</p>
                
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-textMain mb-3">Modo de Interface</label>
                    <div className="flex space-x-4">
                      <button onClick={() => setTheme('dark')} className={`px-6 py-3 rounded-lg border-2 font-medium text-sm transition-all flex items-center cursor-pointer ${theme === 'dark' ? 'border-primary bg-primary/10 text-textMain' : 'border-border bg-background text-textMuted hover:border-textMuted'}`}>
                        <Moon size={16} className={`mr-2 ${theme === 'dark' ? 'text-primary' : 'text-textMuted'}`} />
                        Modo Escuro (Dark)
                      </button>
                      <button onClick={() => setTheme('light')} className={`px-6 py-3 rounded-lg border-2 font-medium text-sm transition-all flex items-center cursor-pointer ${theme === 'light' ? 'border-primary bg-primary/10 text-textMain' : 'border-border bg-background text-textMuted hover:border-textMuted'}`}>
                        <Sun size={16} className={`mr-2 ${theme === 'light' ? 'text-primary' : 'text-textMuted'}`} />
                        Modo Claro (Light)
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-textMain mb-3">Cor de Destaque (Marca / Sicoob)</label>
                    
                    <div className="flex flex-wrap items-center gap-4">
                      {/* Bolinhas Rápidas */}
                      <div className="flex space-x-3">
                        {['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#00ae9d'].map((color) => (
                          <button
                            key={color}
                            onClick={() => setAccentColor(color)}
                            className={`w-10 h-10 rounded-full transition-all flex items-center justify-center cursor-pointer ${accentColor === color ? 'ring-2 ring-textMain ring-offset-2 ring-offset-surface scale-110 shadow-md' : 'hover:scale-110 opacity-70 hover:opacity-100'}`}
                            style={{ backgroundColor: color }}
                          >
                            {accentColor === color && <CheckCircle2 size={16} className="text-white drop-shadow-md" />}
                          </button>
                        ))}
                      </div>

                      <div className="w-px h-8 bg-border mx-2"></div>

                      {/* Color Picker Customizado */}
                      <div className="flex items-center space-x-3">
                        <label className="text-sm text-textMuted">Cor Customizada:</label>
                        <div className="relative flex items-center">
                          <input 
                            type="color" 
                            value={accentColor}
                            onChange={(e) => setAccentColor(e.target.value)}
                            className="w-10 h-10 p-0 border-0 rounded-lg cursor-pointer bg-transparent absolute opacity-0 z-10" 
                            title="Escolher cor personalizada"
                          />
                          <div 
                            className="w-10 h-10 rounded-lg border-2 border-border flex items-center justify-center transition-all shadow-sm relative z-0"
                            style={{ backgroundColor: accentColor }}
                          >
                            <Palette size={16} className="text-white mix-blend-difference opacity-50" />
                          </div>
                        </div>
                        <input 
                          type="text" 
                          value={accentColor}
                          onChange={(e) => setAccentColor(e.target.value.toUpperCase())}
                          className="w-28 bg-surface border border-border rounded-lg px-3 py-2 text-xs text-textMain focus:border-primary outline-none font-mono text-center uppercase tracking-wider"
                          placeholder="#00AE9D"
                          maxLength={7}
                        />
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: NOTIFICAÇÕES */}
          {activeTab === 'notifications' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
              <div>
                <h2 className="text-xl font-bold mb-1">Central de Alertas</h2>
                <p className="text-sm text-textMuted mb-6">Configure como os administradores são notificados sobre o status dos backups.</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-background/50 border border-border rounded-xl p-5">
                    <h3 className="text-base font-bold flex items-center mb-4 text-primary"><Mail size={18} className="mr-2" /> Servidor SMTP</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-textMuted mb-1.5">Servidor / Host SMTP</label>
                        <input type="text" value={smtpHost} onChange={e => setSmtpHost(e.target.value)} placeholder="smtp.office365.com" className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-textMuted mb-1.5">Porta</label>
                          <input type="text" value={smtpPort} onChange={e => setSmtpPort(e.target.value)} placeholder="587" className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-textMuted mb-1.5">Segurança</label>
                          <select value={smtpSecurity} onChange={e => setSmtpSecurity(e.target.value)} className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none">
                            <option value="TLS">TLS / STARTTLS</option>
                            <option value="SSL">SSL</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-textMuted mb-1.5">Usuário (E-mail)</label>
                        <input type="text" value={smtpUser} onChange={e => setSmtpUser(e.target.value)} placeholder="alertas@suaempresa.com" className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-textMuted mb-1.5">Senha do App</label>
                        <input type="password" value={smtpPass} onChange={e => setSmtpPass(e.target.value)} placeholder="••••••••••••" className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none" />
                      </div>
                    </div>
                  </div>

                  <div className="bg-background/50 border border-border rounded-xl p-5">
                    <h3 className="text-base font-bold flex items-center mb-4 text-green-500"><MessageSquare size={18} className="mr-2" /> API WhatsApp</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-textMuted mb-1.5">URL da API (Endpoint)</label>
                        <input type="text" value={waEndpoint} onChange={e => setWaEndpoint(e.target.value)} placeholder="https://api.z-api.io/instances/..." className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-green-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-textMuted mb-1.5">Token de Autenticação (Bearer)</label>
                        <input type="password" value={waToken} onChange={e => setWaToken(e.target.value)} placeholder="Seu Token de API..." className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-green-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-textMuted mb-1.5">Número de Destino (Ex: 5511999999999)</label>
                        <input type="text" value={waNumber} onChange={e => setWaNumber(e.target.value)} placeholder="Número do Gestor de TI" className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-green-500 outline-none" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: LICENÇA */}
          {activeTab === 'license' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
              <div>
                <h2 className="text-xl font-bold mb-1">Gestão de Licença Comercial</h2>
                <p className="text-sm text-textMuted mb-6">Ative a sua cópia do Kopher Shield para remover limitações.</p>

                <div className="bg-background/50 border border-border rounded-xl p-8 max-w-2xl">
                  {licenseStatus === 'unlicensed' ? (
                    <div className="space-y-6">
                      <div className="bg-amber-500/10 border border-amber-500/20 p-4 rounded-lg flex items-start">
                        <Key className="text-amber-500 mr-3 shrink-0 mt-0.5" size={20} />
                        <div>
                          <h4 className="text-amber-500 font-bold text-sm">Cópia Não Registada</h4>
                          <p className="text-amber-500/80 text-xs mt-1">Insira a chave fornecida pela BINAVER Soluções Tecnológicas para ativar este servidor (Validação vinculada ao Hardware ID).</p>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-textMain mb-2">Chave de Ativação (License Key)</label>
                        <input 
                          type="text" 
                          value={licenseKey}
                          onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                          placeholder="KOPHER-2026-XXXX-XXXX-XXXX" 
                          className="w-full bg-surface border border-border rounded-lg px-4 py-3 text-lg font-mono text-center text-textMain focus:border-amber-500 outline-none uppercase tracking-widest" 
                        />
                      </div>

                      <button onClick={handleActivateLicense} disabled={isSaving} className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-lg transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center disabled:opacity-50 cursor-pointer">
                        {isSaving ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div> : <ShieldCheck size={20} className="mr-2" />}
                        {isSaving ? 'Validando...' : 'Validar e Ativar Licença'}
                      </button>
                    </div>
                  ) : (
                    <div className="text-center space-y-4 py-6">
                      <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(34,197,94,0.3)]">
                        <ShieldCheck size={40} className="text-green-500" />
                      </div>
                      <h3 className="text-2xl font-bold text-green-500 uppercase tracking-widest">Software Ativado</h3>
                      <p className="text-sm text-textMuted max-w-md mx-auto">Licença Corporativa Kopher Shield ativa e válida. O seu ambiente está protegido com capacidades ilimitadas.</p>
                      
                      <div className="mt-8 pt-6 border-t border-border/50 text-left">
                        <span className="text-xs text-textMuted uppercase tracking-wider font-semibold">Chave em Uso:</span>
                        <div className="text-textMain font-mono bg-background px-4 py-2 rounded mt-2 border border-border">{licenseKey}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {activeTab !== 'license' && (
        <div className="flex justify-end pt-4 border-t border-border/50">
          <button onClick={handleSave} disabled={isSaving} className="bg-primary hover:bg-primary/90 text-white px-6 py-2.5 rounded-lg font-medium text-sm shadow-md transition-all flex items-center disabled:opacity-50 cursor-pointer">
            {isSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div> : <Save size={18} className="mr-2" />}
            {isSaving ? 'A Guardar...' : 'Guardar Configurações'}
          </button>
        </div>
      )}
    </div>
  );
}