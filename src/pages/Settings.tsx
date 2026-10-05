import { useState, useEffect } from 'react';
import { Palette, Bell, Key, Mail, MessageSquare, Save, ShieldCheck, CheckCircle2, AlertCircle, Info, Moon, Sun, X, Type, Trash2, UploadCloud, Building2, Send, RefreshCcw, Cpu, Edit2, Loader2, AlertTriangle, ShieldOff, Lock, ChevronDown, ChevronUp, Smartphone, ArrowRight, BellRing, Settings2, RefreshCw, UserCheck, Briefcase, User, Monitor, Camera } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

interface Toast { id: number; title: string; message: string; type: 'success' | 'error' | 'info'; }

// Galeria nativa de Avatares SVGs corporativos e geométricos
const PRESET_AVATARS = [
  "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#2563eb"/><circle cx="50" cy="50" r="25" fill="#60a5fa"/><circle cx="65" cy="35" r="10" fill="#bfdbfe"/></svg>'),
  "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#059669"/><path d="M0,100 L100,0 L100,100 Z" fill="#10b981"/><circle cx="30" cy="70" r="15" fill="#a7f3d0"/></svg>'),
  "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#7c3aed"/><rect x="25" y="25" width="50" height="50" rx="15" fill="#a78bfa" transform="rotate(45 50 50)"/><rect x="40" y="40" width="20" height="20" rx="5" fill="#ede9fe" transform="rotate(45 50 50)"/></svg>'),
  "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#ea580c"/><circle cx="50" cy="75" r="40" fill="#f97316"/><circle cx="50" cy="75" r="25" fill="#fbd38d"/></svg>'),
  "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#be123c"/><polygon points="50,15 90,50 50,85 10,50" fill="#fb7185"/><polygon points="50,30 70,50 50,70 30,50" fill="#ffe4e6"/></svg>'),
  "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#0f172a"/><path d="M20,80 L50,20 L80,80 Z" fill="#334155"/><path d="M35,80 L50,50 L65,80 Z" fill="#94a3b8"/></svg>'),
  "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#0891b2"/><polygon points="50,15 85,35 85,75 50,95 15,75 15,35" fill="#06b6d4"/><circle cx="50" cy="55" r="15" fill="#cffafe"/></svg>'),
  "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#d97706"/><polygon points="50,20 90,80 10,80" fill="#f59e0b"/><polygon points="50,40 70,70 30,70" fill="#fef3c7"/></svg>')
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState('appearance');
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingSmtp, setIsTestingSmtp] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Estados: Aparência e Institucional
  const [theme, setTheme] = useState('dark');
  const [accentColor, setAccentColor] = useState('#3b82f6');
  const [uiScale, setUiScale] = useState('16'); 
  const [clientLogo, setClientLogo] = useState<string>('');
  const [clientName, setClientName] = useState<string>('');
  
  // Estados: Alertas SMTP (Híbrido)
  const [useCustomSmtp, setUseCustomSmtp] = useState(false);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('');
  const [smtpSecurity, setSmtpSecurity] = useState('TLS');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpCc, setSmtpCc] = useState(''); 
  const [smtpBcc, setSmtpBcc] = useState(''); 
  const [teamsWebhook, setTeamsWebhook] = useState(''); 

  // Preferências Granulares de Notificação
  const [notifyBackupStart, setNotifyBackupStart] = useState(true);
  const [notifyBackupEnd, setNotifyBackupEnd] = useState(true);
  const [notifyRestore, setNotifyRestore] = useState(true);
  const [notifySystemErrors, setNotifySystemErrors] = useState(true);
  
  // Estados: DRM, Licenciamento Híbrido, Avatar e Hostname do SO
  const [machineId, setMachineId] = useState('CARREGANDO...');
  const [deviceName, setDeviceName] = useState('CARREGANDO...'); 
  const [currentLicense, setCurrentLicense] = useState('');
  const [licenseEmail, setLicenseEmail] = useState(''); 
  const [licenseAvatar, setLicenseAvatar] = useState<string>(''); 
  const [profileName, setProfileName] = useState(''); 
  const [profileRole, setProfileRole] = useState(''); 
  const [isEditingLicense, setIsEditingLicense] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false); 
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false); // NOVO: Controle do Modal de Avatar

  const [authStep, setAuthStep] = useState<1 | 2>(1);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [newLicenseKey, setNewLicenseKey] = useState('');
  
  const [twoFactorMethod, setTwoFactorMethod] = useState<'app' | 'email'>('email');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [qrCodeBase64, setQrCodeBase64] = useState<string>(''); 
  const [isResettingMfa, setIsResettingMfa] = useState(false);

  const [isValidatingLicense, setIsValidatingLicense] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [licenseMessage, setLicenseMessage] = useState<{type: 'error' | 'success', text: string} | null>(null);

  const showToast = (title: string, msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, title, message: msg, type }]);
    setTimeout(() => removeToast(id), 5000);
  };

  const removeToast = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  useEffect(() => {
    async function loadSettings() {
      try {
        try {
          const mId = await invoke<string>('get_machine_id');
          setMachineId(mId);
        } catch (e) { setMachineId('FALHA-AO-LER-HARDWARE'); }

        try {
          const dName = await invoke<string>('get_os_hostname');
          setDeviceName(dName);
        } catch (e) { setDeviceName('Dispositivo Local'); }

        const data = await invoke<Record<string, string>>('get_all_settings');
        if (data) {
          if (data.theme) setTheme(data.theme);
          if (data.accent_color) setAccentColor(data.accent_color);
          if (data.ui_scale) setUiScale(data.ui_scale);
          if (data.client_logo) setClientLogo(data.client_logo);
          if (data.client_name) setClientName(data.client_name);
          
          if (data.use_custom_smtp) setUseCustomSmtp(data.use_custom_smtp === 'true');
          if (data.smtp_host) setSmtpHost(data.smtp_host);
          if (data.smtp_port) setSmtpPort(data.smtp_port);
          if (data.smtp_security) setSmtpSecurity(data.smtp_security);
          if (data.smtp_user) setSmtpUser(data.smtp_user);
          if (data.smtp_pass) setSmtpPass(data.smtp_pass);
          if (data.smtp_cc) setSmtpCc(data.smtp_cc);
          if (data.smtp_bcc) setSmtpBcc(data.smtp_bcc);
          if (data.teams_webhook) setTeamsWebhook(data.teams_webhook);
          
          if (data.pref_notify_backup_start) setNotifyBackupStart(data.pref_notify_backup_start === 'true');
          if (data.pref_notify_backup_end) setNotifyBackupEnd(data.pref_notify_backup_end !== 'false');
          if (data.pref_notify_restore) setNotifyRestore(data.pref_notify_restore !== 'false');
          if (data.pref_notify_system_errors) setNotifySystemErrors(data.pref_notify_system_errors !== 'false');

          if (data.license_key) setCurrentLicense(data.license_key);
          if (data.license_email) setLicenseEmail(data.license_email);
          if (data.license_avatar) setLicenseAvatar(data.license_avatar);
          if (data.profile_name) setProfileName(data.profile_name);
          if (data.profile_role) {
            setProfileRole(data.profile_role);
          } else if (data.profile_birthdate) {
            setProfileRole(data.profile_birthdate);
          }
        }
      } catch (error) { showToast('Erro de Leitura', 'Falha ao carregar as configurações do SQLite.', 'error'); }
    }
    loadSettings();
  }, []);

  const hexToRgb = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r} ${g} ${b}`;
  };

  useEffect(() => {
    const root = document.documentElement;
    if (accentColor && accentColor.length === 7) root.style.setProperty('--primary', hexToRgb(accentColor));
    if (uiScale) root.style.fontSize = `${uiScale}px`; 
    
    if (theme === 'light') {
      root.style.setProperty('--background', '248 250 252');
      root.style.setProperty('--surface', '255 255 255');
      root.style.setProperty('--border', '226 232 240');
      root.style.setProperty('--text-main', '15 23 42');
      root.style.setProperty('--text-muted', '100 116 139');
    } else {
      root.style.setProperty('--background', '15 17 21');
      root.style.setProperty('--surface', '22 25 32');
      root.style.setProperty('--border', '30 41 59');
      root.style.setProperty('--text-main', '248 250 252');
      root.style.setProperty('--text-muted', '148 163 184');
    }
  }, [theme, accentColor, uiScale]);

  const handleLogoUpload = async () => {
    try {
      const filePath = await open({ multiple: false, filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'svg'] }] });
      if (filePath && typeof filePath === 'string') {
        const fileData = await invoke<number[]>('read_file_binary', { path: filePath });
        const base64 = btoa(new Uint8Array(fileData).reduce((data, byte) => data + String.fromCharCode(byte), ''));
        const ext = filePath.split('.').pop()?.toLowerCase() || 'png';
        setClientLogo(`data:image/${ext === 'svg' ? 'svg+xml' : ext};base64,${base64}`);
        showToast('Ícone Carregado', 'A imagem está pronta para ser salva.', 'success');
      }
    } catch (e) { showToast('Erro de Seleção', `Não foi possível carregar a imagem.`, 'error'); }
  };

  // Funções do Modal de Avatar
  const handleAvatarUpload = async () => {
    try {
      const filePath = await open({ multiple: false, filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg'] }] });
      if (filePath && typeof filePath === 'string') {
        const fileData = await invoke<number[]>('read_file_binary', { path: filePath });
        const base64 = btoa(new Uint8Array(fileData).reduce((data, byte) => data + String.fromCharCode(byte), ''));
        const ext = filePath.split('.').pop()?.toLowerCase() || 'png';
        const finalAvatar = `data:image/${ext};base64,${base64}`;
        
        setLicenseAvatar(finalAvatar);
        await invoke('update_settings', { payload: { license_avatar: finalAvatar } });
        setIsAvatarModalOpen(false);
        showToast('Avatar Atualizado', 'Sua imagem de perfil (Upload) foi salva com sucesso.', 'success');
      }
    } catch (e) { showToast('Erro', 'Não foi possível carregar o avatar.', 'error'); }
  };

  const handleSelectPresetAvatar = async (svgString: string) => {
    try {
      setLicenseAvatar(svgString);
      await invoke('update_settings', { payload: { license_avatar: svgString } });
      setIsAvatarModalOpen(false);
      showToast('Avatar Atualizado', 'Seu avatar corporativo foi salvo com sucesso.', 'success');
    } catch (e) { showToast('Erro', 'Não foi possível salvar o avatar.', 'error'); }
  };

  const handleRemoveAvatar = async () => {
    try {
      setLicenseAvatar('');
      await invoke('update_settings', { payload: { license_avatar: '' } });
      setIsAvatarModalOpen(false);
      showToast('Avatar Removido', 'A sua imagem de perfil foi removida e voltará ao padrão.', 'info');
    } catch (e) { showToast('Erro', 'Não foi possível remover o avatar.', 'error'); }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await invoke('update_settings', { 
        payload: { profile_name: profileName, profile_role: profileRole, profile_birthdate: profileRole } 
      });
      setIsEditingProfile(false);
      showToast('Dados Atualizados', 'Informações do responsável técnico salvas com sucesso.', 'success');
    } catch (e) {
      showToast('Erro', 'Falha ao salvar dados no banco de dados.', 'error');
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    const payload = {
      theme, accent_color: accentColor, ui_scale: uiScale, client_logo: clientLogo, client_name: clientName, 
      use_custom_smtp: useCustomSmtp.toString(),
      smtp_host: smtpHost, smtp_port: smtpPort, smtp_security: smtpSecurity, smtp_user: smtpUser, smtp_pass: smtpPass, 
      smtp_cc: smtpCc, smtp_bcc: smtpBcc, teams_webhook: teamsWebhook,
      pref_notify_backup_start: notifyBackupStart.toString(),
      pref_notify_backup_end: notifyBackupEnd.toString(),
      pref_notify_restore: notifyRestore.toString(),
      pref_notify_system_errors: notifySystemErrors.toString()
    };
    try {
      await invoke('update_settings', { payload });
      window.dispatchEvent(new Event('coopshield-settings-updated'));
      showToast('Sucesso', 'Configurações corporativas atualizadas com sucesso!', 'success');
    } catch (error) { showToast('Erro', `Falha ao salvar no SQLite`, 'error'); } 
    finally { setIsSaving(false); }
  };

  const handleTestSmtp = async () => {
    if (useCustomSmtp && (!smtpHost || !smtpPort || !smtpUser || !smtpPass)) {
      showToast('Campos Incompletos', 'Preencha todos os campos do servidor SMTP Customizado.', 'error');
      return;
    }
    setIsTestingSmtp(true);
    try {
      const response = await invoke<string>('test_smtp_connection', { 
        host: smtpHost || 'cloud.binaver.com', port: parseInt(smtpPort || '587'), user: smtpUser, pass: smtpPass, 
        ccEmail: smtpCc, bccEmail: smtpBcc 
      });
      showToast('Sucesso!', response, 'success');
    } catch (error) { showToast('Erro SMTP', `${error}`, 'error'); } 
    finally { setIsTestingSmtp(false); }
  };

  const handleLicenseInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    let rawValue = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (rawValue.length > 48) rawValue = rawValue.substring(0, 48);
    setNewLicenseKey(rawValue.match(/.{1,6}/g)?.join('-') || '');
  };

  const handle2FACodeInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTwoFactorCode(e.target.value.replace(/[^0-9]/g, '').substring(0, 6));
  };

  const requestAuthenticatorQRCode = async () => {
    setLicenseMessage(null);
    setQrCodeBase64('');
    try {
      const targetEmail = licenseEmail || authEmail || 'email@dominio.com';
      const qrImage = await invoke<string>('generate_totp_qr', { email: targetEmail });
      setQrCodeBase64(qrImage);
    } catch (e) { setLicenseMessage({ type: 'error', text: 'Falha ao gerar QR Code offline.'}); }
  };

  const handleVerifyCredentials = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!authEmail || !authPassword) { setLicenseMessage({ type: 'error', text: 'Preencha o e-mail e a senha corporativa.' }); return; }
    if (showKeyInput && newLicenseKey.length < 55) { setLicenseMessage({ type: 'error', text: 'A chave de licença está incompleta.' }); return; }

    setIsValidatingLicense(true);
    setLicenseMessage(null);

    try {
      await invoke('request_2fa_token', { email: authEmail });
      setTwoFactorMethod('email');
      setAuthStep(2);
    } catch (error) { setLicenseMessage({ type: 'error', text: error as string }); } 
    finally { setIsValidatingLicense(false); }
  };

  const handleResendEmailToken = async () => {
    setLicenseMessage(null);
    try {
      await invoke('request_2fa_token', { email: authEmail || licenseEmail });
      showToast('Reenviado', 'Um novo token de segurança foi enviado para o seu e-mail.', 'info');
    } catch (error) { setLicenseMessage({ type: 'error', text: error as string }); }
  };

  const handleConfirm2FA = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (twoFactorCode.length < 6) { setLicenseMessage({ type: 'error', text: 'O token deve conter 6 dígitos.' }); return; }

    setIsValidatingLicense(true);
    setLicenseMessage(null);

    try {
      const targetEmail = authEmail || licenseEmail || 'email@dominio.com';
      const [msg, resolvedKey, validatedEmail] = await invoke<[string, string, string]>('authenticate_and_activate', { 
        email: targetEmail, password: authPassword, twoFactorCode: twoFactorCode, method: twoFactorMethod, key: showKeyInput ? newLicenseKey : null 
      });
      
      await invoke('update_settings', { payload: { license_key: resolvedKey, license_email: validatedEmail, license_status: 'active' } });
      setCurrentLicense(resolvedKey);
      setLicenseEmail(validatedEmail);
      setIsResettingMfa(false); 
      setLicenseMessage({ type: 'success', text: msg });
      
      setTimeout(() => {
        setIsEditingLicense(false); setNewLicenseKey(''); setAuthEmail(''); setAuthPassword('');
        setTwoFactorCode(''); setAuthStep(1); setShowKeyInput(false); setLicenseMessage(null);
      }, 3000);
    } catch (error) { setLicenseMessage({ type: 'error', text: error as string }); } 
    finally { setIsValidatingLicense(false); }
  };

  const handleUnlinkLicense = async () => {
    const confirmed = window.confirm("Atenção: Tem certeza de que deseja desvincular esta máquina? O acesso será bloqueado.");
    if (!confirmed) return;
    setIsUnlinking(true);
    showToast('Desvinculando', 'Removendo a licença do dispositivo...', 'info');
    try {
      await invoke('update_settings', { payload: { license_key: '', license_email: '', license_avatar: '', license_status: 'unlicensed' } });
      setTimeout(() => { window.location.reload(); }, 1500);
    } catch (error) { setIsUnlinking(false); }
  };

  const maskLicense = (key: string) => {
    if (!key || key.length < 55) return 'NENHUMA CHAVE REGISTRADA';
    const parts = key.split('-'); return `${parts[0]}-••••••-••••••-••••••-••••••-••••••-••••••-${parts[7]}`;
  };

  const ToggleSwitch = ({ label, description, checked, onChange }: { label: string, description: string, checked: boolean, onChange: (c: boolean) => void }) => (
    <div className="flex items-start justify-between py-3 border-b border-border/50 last:border-0 cursor-pointer" onClick={() => onChange(!checked)}>
      <div className="pr-4">
        <h4 className="text-sm font-bold text-textMain">{label}</h4>
        <p className="text-xs text-textMuted mt-0.5">{description}</p>
      </div>
      <div className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${checked ? 'bg-primary' : 'bg-border'}`}>
        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-500 max-w-[1600px] mx-auto relative">
      {/* Sistema de Toasts */}
      <div className="fixed top-6 right-6 z-[100] flex flex-col space-y-3 pointer-events-none">
        {toasts.map(toast => (
          <div key={toast.id} className={`w-80 p-4 rounded-xl shadow-2xl border flex items-start space-x-3 pointer-events-auto animate-in slide-in-from-right-8 fade-in duration-300 ${toast.type === 'success' ? 'bg-surface/95 border-green-500/40' : toast.type === 'error' ? 'bg-surface/95 border-red-500/40' : 'bg-surface/95 border-blue-500/40'}`}>
            <div className="shrink-0 mt-0.5">{toast.type === 'success' && <CheckCircle2 size={18} className="text-green-500" />}{toast.type === 'error' && <AlertCircle size={18} className="text-red-500" />}{toast.type === 'info' && <Info size={18} className="text-blue-500" />}</div>
            <div className="flex flex-col flex-1"><h4 className={`text-sm font-bold ${toast.type === 'success' ? 'text-green-500' : toast.type === 'error' ? 'text-red-500' : 'text-blue-500'}`}>{toast.title}</h4><p className="text-xs text-textMuted mt-1 leading-relaxed">{toast.message}</p></div>
            <button onClick={() => removeToast(toast.id)} className="text-textMuted hover:text-textMain transition-colors cursor-pointer shrink-0"><X size={16} /></button>
          </div>
        ))}
      </div>

      {/* MODAL DE SELEÇÃO DE AVATAR (Híbrido - Upload ou Galeria) */}
      {isAvatarModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface border border-border w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between p-5 border-b border-border/50 bg-background/50">
              <h3 className="text-sm font-bold text-textMain flex items-center">
                <Camera size={18} className="mr-2 text-primary" /> Alterar Imagem de Perfil
              </h3>
              <button onClick={() => setIsAvatarModalOpen(false)} className="text-textMuted hover:text-textMain transition-colors"><X size={18} /></button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Opção 1: Galeria de Avatares Nativos */}
              <div>
                <label className="block text-xs font-medium text-textMuted mb-3 uppercase tracking-wider">Avatares Corporativos (Galeria)</label>
                <div className="grid grid-cols-4 gap-4">
                  {PRESET_AVATARS.map((svgUrl, idx) => (
                    <button 
                      key={idx} 
                      onClick={() => handleSelectPresetAvatar(svgUrl)}
                      className="w-16 h-16 rounded-full overflow-hidden border-2 border-transparent hover:border-primary hover:scale-105 transition-all shadow-sm focus:outline-none focus:border-primary cursor-pointer"
                    >
                      <img src={svgUrl} alt={`Avatar Predefinido ${idx + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Opção 2: Upload Customizado ou Remoção */}
              <div className="border-t border-border/50 pt-5 flex flex-col space-y-3">
                <button onClick={handleAvatarUpload} className="w-full flex items-center justify-center px-4 py-2.5 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded-xl text-sm font-bold transition-all cursor-pointer">
                  <UploadCloud size={16} className="mr-2" /> Fazer Upload de Imagem
                </button>
                
                {licenseAvatar && (
                  <button onClick={handleRemoveAvatar} className="w-full flex items-center justify-center px-4 py-2.5 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-xl text-sm font-bold transition-all cursor-pointer">
                    <Trash2 size={16} className="mr-2" /> Remover Imagem Atual
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="shrink-0 mb-6">
        <h1 className="text-2xl font-bold mb-2 tracking-tight">Configurações do Sistema</h1>
        <p className="text-sm text-textMuted">Personalize a aparência, acessibilidade, alertas e licenciamento.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
        <div className="w-full lg:w-64 flex flex-col space-y-2 shrink-0">
          <button onClick={() => setActiveTab('appearance')} className={`flex items-center px-4 py-3 rounded-xl font-medium text-sm transition-all cursor-pointer ${activeTab === 'appearance' ? 'bg-primary/10 text-primary border border-primary/20' : 'text-textMuted hover:bg-surface hover:text-textMain border border-transparent'}`}><Palette size={18} className="mr-3" /> Aparência e Acessibilidade</button>
          <button onClick={() => setActiveTab('notifications')} className={`flex items-center px-4 py-3 rounded-xl font-medium text-sm transition-all cursor-pointer ${activeTab === 'notifications' ? 'bg-primary/10 text-primary border border-primary/20' : 'text-textMuted hover:bg-surface hover:text-textMain border border-transparent'}`}><Bell size={18} className="mr-3" /> Central de Alertas</button>
          <button onClick={() => setActiveTab('license')} className={`flex items-center px-4 py-3 rounded-xl font-medium text-sm transition-all cursor-pointer ${activeTab === 'license' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'text-textMuted hover:bg-surface hover:text-textMain border border-transparent'}`}><Key size={18} className="mr-3" /> Licenciamento</button>
        </div>

        <div className="flex-1 flex flex-col bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            
            {activeTab === 'appearance' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                <div>
                  <h2 className="text-lg font-bold mb-1">Identidade Visual e Layout</h2>
                  <p className="text-sm text-textMuted mb-6">Adapte o Kopher Shield à identidade da sua empresa e necessidades visuais.</p>
                  <div className="space-y-8">
                    <div className="bg-background/40 border border-border rounded-xl p-5">
                      <label className="block text-sm font-medium text-textMain mb-1.5 flex items-center"><Building2 size={16} className="mr-2 text-primary" /> Workspace da Empresa (White-label)</label>
                      <p className="text-xs text-textMuted mb-5">Substitua o logotipo principal configurando o ícone quadrado e o nome do seu ambiente.</p>
                      <div className="flex items-end space-x-6">
                        <div className="shrink-0 flex flex-col items-center">
                          <label className="block text-xs font-medium text-textMuted mb-2">Ícone Quadrado (1:1)</label>
                          {clientLogo ? (
                            <div className="relative group w-16 h-16 rounded-xl overflow-hidden shadow-md border border-border bg-surface flex items-center justify-center">
                              <img src={clientLogo} alt="Logo Cliente" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer" onClick={() => setClientLogo('')}><Trash2 size={18} className="text-red-400" /></div>
                            </div>
                          ) : (
                            <button onClick={handleLogoUpload} className="w-16 h-16 bg-surface border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 rounded-xl flex items-center justify-center transition-all cursor-pointer group"><UploadCloud size={20} className="text-textMuted group-hover:text-primary transition-colors" /></button>
                          )}
                        </div>
                        <div className="flex-1 pb-1">
                          <label className="block text-xs font-medium text-textMuted mb-2">Nome do Workspace / Empresa</label>
                          <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Ex: Nome da Empresa" className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-sm text-textMain focus:border-primary outline-none transition-all shadow-sm" />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div>
                        <label className="block text-sm font-medium text-textMain mb-3">Modo de Interface</label>
                        <div className="flex space-x-3">
                          <button onClick={() => setTheme('dark')} className={`flex-1 py-2.5 rounded-lg border-2 font-medium text-sm transition-all flex items-center justify-center cursor-pointer ${theme === 'dark' ? 'border-primary bg-primary/10 text-textMain' : 'border-border bg-background text-textMuted'}`}><Moon size={16} className={`mr-2 ${theme === 'dark' ? 'text-primary' : 'text-textMuted'}`} /> Escuro</button>
                          <button onClick={() => setTheme('light')} className={`flex-1 py-2.5 rounded-lg border-2 font-medium text-sm transition-all flex items-center justify-center cursor-pointer ${theme === 'light' ? 'border-primary bg-primary/10 text-textMain' : 'border-border bg-background text-textMuted'}`}><Sun size={16} className={`mr-2 ${theme === 'light' ? 'text-primary' : 'text-textMuted'}`} /> Claro</button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-textMain mb-3 flex items-center"><Type size={16} className="mr-2" /> Escala (Acessibilidade)</label>
                        <div className="flex space-x-3">
                          <button onClick={() => setUiScale('14')} className={`flex-1 py-2.5 rounded-lg border-2 font-medium text-sm transition-all cursor-pointer ${uiScale === '14' ? 'border-primary bg-primary/10 text-textMain' : 'border-border bg-background text-textMuted'}`}>Pequena</button>
                          <button onClick={() => setUiScale('16')} className={`flex-1 py-2.5 rounded-lg border-2 font-medium text-sm transition-all cursor-pointer ${uiScale === '16' ? 'border-primary bg-primary/10 text-textMain' : 'border-border bg-background text-textMuted'}`}>Normal</button>
                          <button onClick={() => setUiScale('18')} className={`flex-1 py-2.5 rounded-lg border-2 font-medium text-sm transition-all cursor-pointer ${uiScale === '18' ? 'border-primary bg-primary/10 text-textMain' : 'border-border bg-background text-textMuted'}`}>Grande</button>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-textMain mb-3">Cor de Destaque Primária</label>
                      <div className="flex flex-wrap items-center gap-4 bg-background/40 p-3 border border-border rounded-xl">
                        <div className="flex space-x-3">
                          {['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#00ae9d'].map((color) => (
                            <button key={color} onClick={() => setAccentColor(color)} className={`w-10 h-10 rounded-full transition-all flex items-center justify-center cursor-pointer ${accentColor === color ? 'ring-2 ring-textMain ring-offset-2 ring-offset-background scale-110 shadow-md' : 'hover:scale-110 opacity-70 hover:opacity-100'}`} style={{ backgroundColor: color }}>
                              {accentColor === color && <CheckCircle2 size={16} className="text-white drop-shadow-md" />}
                            </button>
                          ))}
                        </div>
                        <div className="w-px h-8 bg-border mx-2 hidden md:block"></div>
                        <div className="flex items-center space-x-3">
                          <label className="text-xs text-textMuted uppercase font-bold">Customizada:</label>
                          <div className="relative flex items-center">
                            <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="w-10 h-10 p-0 border-0 rounded-lg cursor-pointer bg-transparent absolute opacity-0 z-10" />
                            <div className="w-10 h-10 rounded-lg border-2 border-border flex items-center justify-center transition-all shadow-sm relative z-0" style={{ backgroundColor: accentColor }}>
                              <Palette size={16} className="text-white mix-blend-difference opacity-50" />
                            </div>
                          </div>
                          <input type="text" value={accentColor} onChange={(e) => setAccentColor(e.target.value.toUpperCase())} className="w-24 bg-surface border border-border rounded-lg px-2 py-2 text-sm text-textMain focus:border-primary outline-none font-mono text-center uppercase" maxLength={7} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <h2 className="text-lg font-bold mb-1">Central de Alertas e Notificações</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  
                  <div className="space-y-6">
                    <div className="bg-background/50 border border-border rounded-xl p-5 space-y-4">
                      
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold flex items-center text-primary"><Mail size={16} className="mr-2" /> Servidor de E-mail (SMTP)</h3>
                        <div className="scale-90 origin-right">
                          <ToggleSwitch label="" description="" checked={useCustomSmtp} onChange={setUseCustomSmtp} />
                        </div>
                      </div>

                      {useCustomSmtp ? (
                        <div className="animate-in fade-in slide-in-from-top-2 space-y-4 pt-2">
                          <div><label className="block text-xs font-medium text-textMuted mb-1.5">Host SMTP</label><input type="text" value={smtpHost} onChange={e => setSmtpHost(e.target.value)} placeholder="smtp.office365.com" className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none" /></div>
                          <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-xs font-medium text-textMuted mb-1.5">Porta</label><input type="text" value={smtpPort} onChange={e => setSmtpPort(e.target.value)} placeholder="587" className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none" /></div>
                            <div><label className="block text-xs font-medium text-textMuted mb-1.5">Segurança</label><select value={smtpSecurity} onChange={e => setSmtpSecurity(e.target.value)} className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none"><option value="TLS">STARTTLS</option><option value="SSL">SSL/TLS</option></select></div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-xs font-medium text-textMuted mb-1.5">E-mail Remetente (Envio)</label><input type="text" value={smtpUser} onChange={e => setSmtpUser(e.target.value)} placeholder="email@dominio.com" className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none" /></div>
                            <div><label className="block text-xs font-medium text-textMuted mb-1.5">Senha de Aplicativo</label><input type="password" value={smtpPass} onChange={e => setSmtpPass(e.target.value)} className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none" /></div>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 p-4 bg-primary/10 border border-primary/20 rounded-lg flex items-start animate-in fade-in">
                          <ShieldCheck size={20} className="text-primary mr-3 shrink-0 mt-0.5" />
                          <p className="text-sm text-textMain leading-relaxed">
                            Os e-mails de alerta e relatórios estão sendo gerenciados automaticamente pelo <strong>Motor de Notificações Cloud</strong>. Nenhuma configuração adicional é necessária.
                          </p>
                        </div>
                      )}

                      <div className="pt-3 mt-4 border-t border-border/50">
                        <label className="block text-xs font-bold text-textMain mb-3 uppercase tracking-wider">Cópias Silenciosas e Auditoria (CC/CCO)</label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-textMuted mb-1.5">Com Cópia (Cc)</label>
                            <input type="text" value={smtpCc} onChange={e => setSmtpCc(e.target.value)} placeholder="Ex: gestao@dominio.com" className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-textMuted mb-1.5">Cópia Oculta (CCo)</label>
                            <input type="text" value={smtpBcc} onChange={e => setSmtpBcc(e.target.value)} placeholder="Ex: logs@dominio.com" className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none" />
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-border/50">
                        <button onClick={handleTestSmtp} disabled={isTestingSmtp} className="w-full bg-surface border border-primary text-primary hover:bg-primary hover:text-white px-4 py-2.5 rounded-lg font-medium text-sm transition-all flex items-center justify-center cursor-pointer disabled:opacity-50">
                          {isTestingSmtp ? <RefreshCcw className="animate-spin mr-2" size={16} /> : <Send className="mr-2" size={16} />} Disparar E-mail de Teste
                        </button>
                      </div>
                    </div>

                    <div className="bg-background/50 border border-border rounded-xl p-5 space-y-4">
                      <h3 className="text-sm font-bold flex items-center text-[#5B5FC7]"><MessageSquare size={16} className="mr-2" /> Microsoft Teams (Webhook)</h3>
                      <p className="text-xs text-textMuted">Receba relatórios e falhas diretamente num canal do Teams.</p>
                      <div>
                        <label className="block text-xs font-medium text-textMuted mb-1.5">URL do Webhook (Canal do Teams)</label>
                        <textarea value={teamsWebhook} onChange={e => setTeamsWebhook(e.target.value)} placeholder="https://sua-empresa.webhook.office.com/..." className="w-full h-24 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-[#5B5FC7] outline-none resize-none font-mono text-xs" />
                      </div>
                      <div className="pt-2 border-t border-border/50">
                        <button onClick={() => showToast('Em Breve', 'A integração nativa será injetada no motor Rust.', 'info')} className="w-full bg-surface border border-[#5B5FC7] text-[#5B5FC7] hover:bg-[#5B5FC7] hover:text-white px-4 py-2.5 rounded-lg font-medium text-sm transition-all flex items-center justify-center cursor-pointer">
                          <Send className="mr-2" size={16} /> Testar Ping no Teams
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="bg-background/50 border border-border rounded-xl p-5 h-fit">
                    <h3 className="text-sm font-bold flex items-center text-textMain mb-2"><BellRing size={16} className="mr-2 text-primary" /> Preferências de Notificação</h3>
                    <p className="text-xs text-textMuted mb-6">Escolha quais os eventos do sistema que disparam alertas sonoros e e-mails para a equipe.</p>

                    <div className="space-y-1">
                      <ToggleSwitch label="Início de Rotina de Backup" description="Avisa quando uma cópia de segurança for iniciada." checked={notifyBackupStart} onChange={setNotifyBackupStart} />
                      <ToggleSwitch label="Conclusão e Relatórios de Backup" description="Envia o relatório final quando o backup terminar (Sucesso ou Falha)." checked={notifyBackupEnd} onChange={setNotifyBackupEnd} />
                      <ToggleSwitch label="Procedimentos de Restauro" description="Alerta a equipe sempre que dados sensíveis forem restaurados." checked={notifyRestore} onChange={setNotifyRestore} />
                      <ToggleSwitch label="Avisos Críticos do Sistema" description="Erros de motor, perda de conexão e falhas no agendamento." checked={notifySystemErrors} onChange={setNotifySystemErrors} />
                    </div>
                    
                    <div className="mt-6 pt-4 border-t border-border/50">
                      <div className="flex items-center text-xs font-medium text-textMuted">
                        <Settings2 size={16} className="mr-2" /> Todas as notificações ficam sempre gravadas no histórico do sistema (Sino Superior).
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            )}

            {activeTab === 'license' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="bg-surface border border-border rounded-xl shadow-sm max-w-3xl">
                  
                  {!isEditingLicense ? (
                    <>
                      <div className="p-8 border-b border-border/50 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-gradient-to-r from-background to-surface rounded-t-xl">
                        <div className="flex items-center space-x-5">
                          {/* CLIQUE NA IMAGEM ABRE O NOVO MODAL DE AVATAR */}
                          <div className="relative group w-16 h-16 rounded-full bg-primary overflow-hidden shadow-lg shadow-primary/20 flex items-center justify-center text-white text-xl font-bold shrink-0">
                            {licenseAvatar ? (
                              <img src={licenseAvatar} alt="Avatar do Titular" className="w-full h-full object-cover rounded-full" />
                            ) : (
                              <span className="flex items-center justify-center w-full h-full bg-primary/20 text-primary font-bold">
                                {licenseEmail ? licenseEmail.charAt(0).toUpperCase() : <ShieldCheck size={28} />}
                              </span>
                            )}
                            <div 
                              onClick={() => setIsAvatarModalOpen(true)} 
                              className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer text-white text-[10px] font-bold uppercase text-center p-1"
                              title="Alterar Imagem de Perfil"
                            >
                              Editar
                            </div>
                          </div>

                          <div>
                            <p className="text-sm font-bold text-textMuted uppercase tracking-wider mb-1">Titular da Licença</p>
                            <h2 className="text-2xl font-bold text-textMain">{licenseEmail || 'Licença Local Não Associada'}</h2>
                            
                            <div className="flex items-center space-x-4 mt-1.5 text-xs text-textMuted">
                              {profileName && <span className="flex items-center font-medium"><User size={13} className="mr-1 text-primary" /> {profileName}</span>}
                              {profileRole && <span className="flex items-center font-medium"><Briefcase size={13} className="mr-1 text-primary" /> {profileRole}</span>}
                            </div>

                            <div className="flex items-center mt-2 space-x-3">
                              <span className="flex items-center text-xs font-bold text-green-500 bg-green-500/10 px-2.5 py-1 rounded-full">
                                <CheckCircle2 size={14} className="mr-1.5" /> Conta Ativa e Verificada
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col space-y-2 shrink-0">
                          <button onClick={() => setIsEditingProfile(true)} className="flex items-center justify-center px-5 py-2.5 bg-background border border-border hover:border-primary text-textMain hover:text-primary rounded-lg text-sm font-bold transition-all cursor-pointer w-full md:w-auto">
                            <UserCheck size={16} className="mr-2 text-primary" /> Responsável Técnico
                          </button>

                          <button onClick={() => { setIsEditingLicense(true); setAuthStep(1); }} className="flex items-center justify-center px-5 py-2.5 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded-lg text-sm font-bold transition-colors cursor-pointer w-full md:w-auto">
                            <Edit2 size={16} className="mr-2" /> Gerenciar Conta / Alterar
                          </button>
                          
                          <button onClick={() => { setIsEditingLicense(true); setAuthEmail(licenseEmail); setAuthStep(2); setTwoFactorMethod('app'); requestAuthenticatorQRCode(); setIsResettingMfa(true); }} className="flex items-center justify-center px-5 py-2.5 bg-amber-500/10 text-amber-500 hover:bg-amber-500 hover:text-white rounded-lg text-sm font-bold transition-colors cursor-pointer w-full md:w-auto">
                            <RefreshCw size={16} className="mr-2" /> Redefinir MFA (Autenticador)
                          </button>

                          <button onClick={handleUnlinkLicense} disabled={isUnlinking} className="flex items-center justify-center px-5 py-2.5 bg-red-500/5 text-red-500 hover:bg-red-500 hover:text-white rounded-lg text-sm font-bold transition-colors cursor-pointer w-full md:w-auto disabled:opacity-50">
                            {isUnlinking ? <Loader2 size={16} className="animate-spin mr-2" /> : <ShieldOff size={16} className="mr-2" />} Encerrar Sessão (Desvincular)
                          </button>
                        </div>
                      </div>

                      {isEditingProfile && (
                        <div className="p-6 bg-background/80 border-b border-border/50 animate-in fade-in slide-in-from-top-4 duration-300">
                          <form onSubmit={handleSaveProfile} className="max-w-xl space-y-4">
                            <div className="flex items-center justify-between mb-2">
                              <h3 className="text-sm font-bold text-textMain flex items-center">
                                <Briefcase size={16} className="mr-2 text-primary" /> Dados do Responsável Técnico
                              </h3>
                              <button type="button" onClick={() => setIsEditingProfile(false)} className="text-textMuted hover:text-textMain"><X size={16} /></button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-medium text-textMuted mb-1">Nome do Administrador</label>
                                <input type="text" value={profileName} onChange={e => setProfileName(e.target.value)} placeholder="Ex: Douglas Richard" className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none" />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-textMuted mb-1">Cargo / Departamento</label>
                                <input type="text" value={profileRole} onChange={e => setProfileRole(e.target.value)} placeholder="Ex: Analista de Infraestrutura" className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none" />
                              </div>
                            </div>
                            <div className="flex justify-end space-x-3 pt-2">
                              <button type="button" onClick={() => setIsEditingProfile(false)} className="px-4 py-2 text-xs font-bold text-textMuted hover:text-textMain">Cancelar</button>
                              <button type="submit" className="px-5 py-2 bg-primary text-white rounded-lg text-xs font-bold shadow-md hover:bg-primary/90 flex items-center">
                                <Save size={14} className="mr-1.5" /> Salvar Dados
                              </button>
                            </div>
                          </form>
                        </div>
                      )}

                      <div className="p-8 space-y-6">
                        <div>
                          <h3 className="text-sm font-bold text-textMain mb-4 flex items-center"><Cpu size={18} className="mr-2 text-primary" /> Dispositivo Vinculado</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="p-4 bg-background border border-border rounded-xl">
                              <p className="text-xs text-textMuted font-bold uppercase tracking-wider mb-1 flex items-center"><Monitor size={14} className="mr-1.5 text-primary" /> Nome do Dispositivo (SO)</p>
                              <p className="text-sm font-mono text-textMain tracking-wide font-bold">{deviceName}</p>
                            </div>
                            <div className="p-4 bg-background border border-border rounded-xl">
                              <p className="text-xs text-textMuted font-bold uppercase tracking-wider mb-1">Assinatura de Hardware (Machine ID)</p>
                              <p className="text-sm font-mono text-textMain tracking-widest">{machineId}</p>
                            </div>
                          </div>
                          <div className="mt-4 p-4 bg-background border border-border rounded-xl">
                            <p className="text-xs text-textMuted font-bold uppercase tracking-wider mb-1">Chave de Produto Criptografada</p>
                            <p className="text-sm font-mono text-textMain tracking-widest">{maskLicense(currentLicense)}</p>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="p-8 animate-in fade-in duration-300">
                      <div className="mb-6">
                        <h2 className="text-lg font-bold text-textMain flex items-center">
                          <Key className="mr-2 text-primary" size={20} /> {isResettingMfa ? 'Redefinição de Autenticador (MFA)' : 'Autenticação e Vínculo'}
                        </h2>
                        <p className="text-sm text-textMuted mt-1">{isResettingMfa ? 'Escaneie o novo QR Code com seu aplicativo autenticador.' : 'Insira as credenciais da nova conta que irá assumir esta máquina.'}</p>
                      </div>

                      <div className="bg-background border border-border rounded-xl overflow-hidden relative max-w-md mx-auto">
                        {!isResettingMfa && (
                          <div className="flex">
                            <div className={`h-1.5 transition-all duration-500 ${authStep >= 1 ? 'bg-primary w-1/2' : 'bg-border w-1/2'}`} />
                            <div className={`h-1.5 transition-all duration-500 ${authStep === 2 ? 'bg-primary w-1/2' : 'bg-transparent w-1/2'}`} />
                          </div>
                        )}

                        <div className="p-6">
                          {authStep === 1 && !isResettingMfa ? (
                            <form onSubmit={handleVerifyCredentials} className="space-y-4 animate-in slide-in-from-left-4 duration-300">
                              <div className="space-y-3">
                                <div className="relative">
                                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-textMuted" size={18} />
                                  <input type="email" placeholder="email@dominio.com" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} disabled={isValidatingLicense} className="w-full bg-surface border border-border focus:border-primary rounded-xl pl-12 pr-4 py-3 text-sm font-medium text-textMain outline-none transition-all" />
                                </div>
                                <div className="relative">
                                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-textMuted" size={18} />
                                  <input type="password" placeholder="••••••••" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} disabled={isValidatingLicense} className="w-full bg-surface border border-border focus:border-primary rounded-xl pl-12 pr-4 py-3 text-sm font-medium text-textMain outline-none transition-all" />
                                </div>
                              </div>

                              <div className="pt-1">
                                <button type="button" onClick={() => setShowKeyInput(!showKeyInput)} className="flex items-center text-xs font-bold text-textMuted hover:text-textMain transition-colors cursor-pointer">
                                  {showKeyInput ? <ChevronUp size={16} className="mr-1" /> : <ChevronDown size={16} className="mr-1" />} Inserir Chave Manualmente
                                </button>
                              </div>

                              {showKeyInput && (
                                <div className="relative animate-in fade-in slide-in-from-top-2 duration-300">
                                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-textMuted" size={18} />
                                  <input type="text" placeholder="Ex: HCTNAW-ZV28YO..." value={newLicenseKey} onChange={handleLicenseInput} disabled={isValidatingLicense} className="w-full bg-surface border border-border focus:border-primary rounded-xl pl-12 pr-4 py-3 text-xs font-mono text-textMain outline-none transition-all tracking-wider" />
                                </div>
                              )}

                              {licenseMessage && (
                                <div className={`flex items-center p-3 rounded-lg text-sm font-medium ${licenseMessage.type === 'error' ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
                                  {licenseMessage.type === 'error' ? <AlertTriangle size={18} className="mr-2 shrink-0" /> : <CheckCircle2 size={18} className="mr-2 shrink-0" />}
                                  {licenseMessage.text}
                                </div>
                              )}

                              <div className="flex justify-end space-x-3 pt-4 border-t border-border/50">
                                <button type="button" onClick={() => { setIsEditingLicense(false); setIsResettingMfa(false); setLicenseMessage(null); }} disabled={isValidatingLicense} className="px-4 py-2 text-textMuted hover:text-textMain text-sm font-bold transition-colors cursor-pointer">Cancelar</button>
                                <button type="submit" disabled={isValidatingLicense} className="flex items-center px-6 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-bold shadow-md transition-colors cursor-pointer">
                                  {isValidatingLicense ? <Loader2 size={16} className="animate-spin mr-2" /> : 'Continuar'} {!isValidatingLicense && <ArrowRight size={16} className="ml-2" />}
                                </button>
                              </div>
                            </form>
                          ) : (
                            <form onSubmit={handleConfirm2FA} className="space-y-5 animate-in slide-in-from-right-4 duration-300">
                              {!isResettingMfa && (
                                <div className="flex p-1 bg-surface border border-border rounded-lg mb-4">
                                  <button type="button" onClick={() => { setTwoFactorMethod('app'); setTwoFactorCode(''); requestAuthenticatorQRCode(); }} className={`flex-1 flex items-center justify-center py-2 text-xs font-bold rounded-md transition-all cursor-pointer ${twoFactorMethod === 'app' ? 'bg-background shadow-sm text-textMain border border-border' : 'text-textMuted hover:text-textMain'}`}><Smartphone size={14} className="mr-2" /> App Autenticador</button>
                                  <button type="button" onClick={() => { setTwoFactorMethod('email'); setTwoFactorCode(''); }} className={`flex-1 flex items-center justify-center py-2 text-xs font-bold rounded-md transition-all cursor-pointer ${twoFactorMethod === 'email' ? 'bg-background shadow-sm text-textMain border border-border' : 'text-textMuted hover:text-textMain'}`}><Mail size={14} className="mr-2" /> E-mail</button>
                                </div>
                              )}

                              <div className="space-y-3">
                                {(twoFactorMethod === 'app' || isResettingMfa) && (
                                  <div className="flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-300 mb-4 bg-background p-4 rounded-xl border border-border">
                                    {qrCodeBase64 ? (
                                      <>
                                        <p className="text-xs font-bold text-textMain mb-3 uppercase tracking-wider">Escaneie o Novo QR Code</p>
                                        <img src={qrCodeBase64} alt="QR Code 2FA" className="w-32 h-32 bg-white p-2 rounded-lg shadow-sm" />
                                      </>
                                    ) : (
                                      <div className="w-32 h-32 flex items-center justify-center bg-surface border border-border rounded-lg"><Loader2 size={24} className="text-primary animate-spin" /></div>
                                    )}
                                  </div>
                                )}
                                
                                <div className="flex justify-between items-center">
                                  <label className="block text-xs font-medium text-textMuted">
                                    {twoFactorMethod === 'app' || isResettingMfa ? 'Insira o código gerado pelo seu celular.' : `Token enviado para ${authEmail || licenseEmail}`}
                                  </label>
                                </div>

                                <input type="text" placeholder="000000" maxLength={6} value={twoFactorCode} onChange={handle2FACodeInput} disabled={isValidatingLicense} className="w-full bg-surface border-2 border-border focus:border-primary rounded-xl px-4 py-4 text-2xl font-mono text-center text-textMain outline-none transition-all tracking-[0.5em]" />
                              </div>

                              {licenseMessage && (
                                <div className={`flex items-center p-3 rounded-lg text-sm font-medium ${licenseMessage.type === 'error' ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
                                  {licenseMessage.type === 'error' ? <AlertTriangle size={18} className="mr-2 shrink-0" /> : <CheckCircle2 size={18} className="mr-2 shrink-0" />}
                                  {licenseMessage.text}
                                </div>
                              )}

                              <div className="flex justify-between items-center pt-4 border-t border-border/50">
                                <button type="button" onClick={() => { setIsEditingLicense(false); setIsResettingMfa(false); setLicenseMessage(null); }} disabled={isValidatingLicense} className="text-textMuted hover:text-textMain text-sm font-bold transition-colors cursor-pointer">Cancelar</button>
                                <button type="submit" disabled={isValidatingLicense || twoFactorCode.length < 6} className="flex items-center px-6 py-2.5 bg-primary hover:bg-primary/90 disabled:bg-primary/50 text-white rounded-lg text-sm font-bold shadow-md transition-colors cursor-pointer">
                                  {isValidatingLicense ? <Loader2 size={16} className="animate-spin mr-2" /> : <Save size={16} className="mr-2" />} Validar e Salvar
                                </button>
                              </div>
                            </form>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {activeTab !== 'license' && (
            <div className="shrink-0 p-4 bg-background/30 border-t border-border flex justify-end">
              <button onClick={handleSave} disabled={isSaving || isTestingSmtp} className="bg-primary hover:bg-primary/90 text-white px-6 py-2.5 rounded-lg font-medium text-sm shadow-md transition-all flex items-center disabled:opacity-50 cursor-pointer">
                {isSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div> : <Save size={18} className="mr-2" />} {isSaving ? 'Salvando...' : 'Salvar Configurações'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}