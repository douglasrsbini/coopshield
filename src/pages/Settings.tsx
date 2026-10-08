import { useState, useEffect } from 'react';
import { Palette, Bell, Key, Mail, MessageSquare, Save, ShieldCheck, CheckCircle2, AlertCircle, Info, Moon, Sun, X, Type, Trash2, UploadCloud, Building2, Send, RefreshCcw, Cpu, Edit2, Loader2, AlertTriangle, ShieldOff, Lock, ChevronDown, ChevronUp, Smartphone, ArrowRight, BellRing, Settings2, RefreshCw, Gauge, Clock, UserCheck, Briefcase, User, Monitor, Camera, Laptop, Award } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { ACCENT_PRESETS, DEFAULT_ACCENT_COLOR, hexToRgbChannels, normalizeAccentColor } from '../theme';
import { Trans, useTranslation } from 'react-i18next';
import { normalizeLanguage } from '../i18n/languages';
import LanguageSwitcher from '../components/ui/LanguageSwitcher';
import i18n from '../i18n';

interface Toast { id: number; title: string; message: string; type: 'success' | 'error' | 'info'; }

// Galeria nativa de Avatares SVGs corporativos e geométricos
const PRESET_AVATARS = [
  "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#2563eb"/><circle cx="50" cy="50" r="25" fill="#60a5fa"/><circle cx="65" cy="35" r="10" fill="#bfdbfe"/></svg>'),
  "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#059669"/><path d="M0,100 L100,0 L100,100 Z" fill="#10b981"/><circle cx="30" cy="70" r="15" fill="#a7f3d0"/></svg>'),
  "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#7c3aed"/><rect x="25" y="25" width="50" height="50" rx="15" fill="#a78bfa" transform="rotate(45 50 50)"/><rect x="40" y="40" width="20" height="20" rx="5" fill="#ede9fe" transform="rotate(45 50 50)"/></svg>'),
  "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#ea580c"/><circle cx="50" cy="75" r="40" fill="#f97316"/><circle cx="50" cy="75" r="25" fill="#fbd38d"/></svg>'),
  "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#be123c"/><polygon points="50,15 90,50 50,85 10,50" fill="#fb7185"/><polygon points="50,30 70,50 50,70 30,50" fill="#ffe4e6"/></svg>'),
  "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#0f172a"/><path d="M20,80 L50,20 L80,80 Z" fill="#334155"/><path d="M35,80 L50,50 L65,80 Z" fill="#94a3b8"/></svg>'),
  "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#334155"/><polygon points="50,15 85,35 85,75 50,95 15,75 15,35" fill="#64748b"/><circle cx="50" cy="55" r="15" fill="#e2e8f0"/></svg>'),
  "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#d97706"/><polygon points="50,20 90,80 10,80" fill="#f59e0b"/><polygon points="50,40 70,70 30,70" fill="#fef3c7"/></svg>')
];

export default function Settings() {
  const { t } = useTranslation();
  const accentKeys: Record<string, string> = { 'Âmbar': 'amber', 'Azul Cobalto': 'cobalt', 'Esmeralda': 'emerald', 'Roxo Profundo': 'violet' };
  const accentLabel = (label: string) => (accentKeys[label] ? t(`settings.accent.${accentKeys[label]}`) : label);
  const [activeTab, setActiveTab] = useState('appearance');
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingSmtp, setIsTestingSmtp] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Estados: Aparência e Institucional
  const [theme, setTheme] = useState('dark');
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT_COLOR);
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
  const [webhookOnSuccess, setWebhookOnSuccess] = useState(true);
  const [webhookOnFailure, setWebhookOnFailure] = useState(true);
  const [webhookOnWarning, setWebhookOnWarning] = useState(false);
  const [isTestingWebhook, setIsTestingWebhook] = useState(false); 

  // Preferências Granulares de Notificação
  const [notifyBackupStart, setNotifyBackupStart] = useState(true);
  const [notifyBackupEnd, setNotifyBackupEnd] = useState(true);
  const [notifyRestore, setNotifyRestore] = useState(true);
  const [notifySystemErrors, setNotifySystemErrors] = useState(true);
  
  // Estados: Rede e Performance (Bandwidth Throttling)
  const [bwLimitEnabled, setBwLimitEnabled] = useState(false);
  const [bwLimitMbps, setBwLimitMbps] = useState('10');
  const [bwStart, setBwStart] = useState('08:00');
  const [bwEnd, setBwEnd] = useState('18:00');

  // Estados: DRM, Licenciamento Híbrido, Avatar e Hostname do SO
  const [machineId, setMachineId] = useState(t('settings.loading'));
  const [deviceName, setDeviceName] = useState(t('settings.loading')); 
  const [currentLicense, setCurrentLicense] = useState('');
  const [licenseEmail, setLicenseEmail] = useState(''); 
  const [licenseAvatar, setLicenseAvatar] = useState<string>(''); 
  const [profileName, setProfileName] = useState(''); 
  const [profileRole, setProfileRole] = useState(''); 
  const [isEditingLicense, setIsEditingLicense] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false); 
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);

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

  const handleTestWebhook = async () => {
    const url = teamsWebhook.trim();
    if (!url) { showToast(t('settings.webhooks.emptyUrl'), t('settings.webhooks.emptyUrlMsg'), 'error'); return; }
    setIsTestingWebhook(true);
    try {
      await invoke('test_webhook_integration', { url });
      showToast(t('settings.webhooks.ok'), t('settings.webhooks.okMsg'), 'success');
    } catch (e) {
      showToast(t('settings.webhooks.fail'), String(e), 'error');
    } finally { setIsTestingWebhook(false); }
  };

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
        } catch (e) { setMachineId(t('settings.hardwareFail')); }

        try {
          const dName = await invoke<string>('get_os_hostname');
          setDeviceName(dName);
        } catch (e) { setDeviceName(t('settings.localDevice')); }

        const data = await invoke<Record<string, string>>('get_all_settings');
        if (data) {
          const savedLanguage = normalizeLanguage(data.language);
          await i18n.changeLanguage(savedLanguage);
          if (data.theme) setTheme(data.theme);
          if (data.accent_color) setAccentColor(normalizeAccentColor(data.accent_color));
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
          if (data.webhook_on_success) setWebhookOnSuccess(data.webhook_on_success === 'true');
          if (data.webhook_on_failure) setWebhookOnFailure(data.webhook_on_failure === 'true');
          if (data.webhook_on_warning) setWebhookOnWarning(data.webhook_on_warning === 'true');
          
          if (data.pref_notify_backup_start) setNotifyBackupStart(data.pref_notify_backup_start === 'true');
          if (data.pref_notify_backup_end) setNotifyBackupEnd(data.pref_notify_backup_end !== 'false');
          if (data.pref_notify_restore) setNotifyRestore(data.pref_notify_restore !== 'false');
          if (data.pref_notify_system_errors) setNotifySystemErrors(data.pref_notify_system_errors !== 'false');

          if (data.bw_limit_enabled) setBwLimitEnabled(data.bw_limit_enabled === 'true');
          if (data.bw_limit_mbps) setBwLimitMbps(data.bw_limit_mbps);
          if (data.bw_business_start) setBwStart(data.bw_business_start);
          if (data.bw_business_end) setBwEnd(data.bw_business_end);

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
      } catch (error) { showToast(t('settings.toast.readErrorTitle'), t('settings.toast.readError'), 'error'); }
    }
    loadSettings();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (/^#[0-9A-Fa-f]{6}$/.test(accentColor)) {
      root.style.setProperty('--primary', hexToRgbChannels(normalizeAccentColor(accentColor)));
    }
    if (uiScale) root.style.fontSize = `${uiScale}px`; 
    
    root.classList.toggle('dark', theme !== 'light');
    root.style.colorScheme = theme === 'light' ? 'light' : 'dark';

    if (theme === 'light') {
      root.style.setProperty('--background', '248 250 252');
      root.style.setProperty('--surface', '255 255 255');
      root.style.setProperty('--border', '226 232 240');
      root.style.setProperty('--text-main', '15 23 42');
      root.style.setProperty('--text-muted', '100 116 139');
    } else {
      root.style.setProperty('--background', '2 6 23');
      root.style.setProperty('--surface', '15 23 42');
      root.style.setProperty('--border', '30 41 59');
      root.style.setProperty('--text-main', '248 250 252');
      root.style.setProperty('--text-muted', '148 163 184');
    }
  }, [theme, accentColor, uiScale]);

  const handleLogoUpload = async () => {
    try {
      const filePath = await open({ multiple: false, filters: [{ name: t('settings.imagesFilter'), extensions: ['png', 'jpg', 'jpeg', 'svg'] }] });
      if (filePath && typeof filePath === 'string') {
        const fileData = await invoke<number[]>('read_file_binary', { path: filePath });
        const base64 = btoa(new Uint8Array(fileData).reduce((data, byte) => data + String.fromCharCode(byte), ''));
        const ext = filePath.split('.').pop()?.toLowerCase() || 'png';
        setClientLogo(`data:image/${ext === 'svg' ? 'svg+xml' : ext};base64,${base64}`);
        showToast(t('settings.toast.iconLoaded'), t('settings.toast.iconReady'), 'success');
      }
    } catch (e) { showToast(t('settings.toast.selectError'), t('settings.toast.imageLoadFail'), 'error'); }
  };

  const handleAvatarUpload = async () => {
    try {
      const filePath = await open({ multiple: false, filters: [{ name: t('settings.imagesFilter'), extensions: ['png', 'jpg', 'jpeg'] }] });
      if (filePath && typeof filePath === 'string') {
        const fileData = await invoke<number[]>('read_file_binary', { path: filePath });
        const base64 = btoa(new Uint8Array(fileData).reduce((data, byte) => data + String.fromCharCode(byte), ''));
        const ext = filePath.split('.').pop()?.toLowerCase() || 'png';
        const finalAvatar = `data:image/${ext};base64,${base64}`;
        
        setLicenseAvatar(finalAvatar);
        await invoke('update_settings', { payload: { license_avatar: finalAvatar } });
        setIsAvatarModalOpen(false);
        showToast(t('settings.toast.avatarUpdated'), t('settings.toast.avatarUploaded'), 'success');
      }
    } catch (e) { showToast(t('settings.toast.error'), t('settings.toast.avatarLoadFail'), 'error'); }
  };

  const handleSelectPresetAvatar = async (svgString: string) => {
    try {
      setLicenseAvatar(svgString);
      await invoke('update_settings', { payload: { license_avatar: svgString } });
      setIsAvatarModalOpen(false);
      showToast(t('settings.toast.avatarUpdated'), t('settings.toast.avatarPresetSaved'), 'success');
    } catch (e) { showToast(t('settings.toast.error'), t('settings.toast.avatarSaveFail'), 'error'); }
  };

  const handleRemoveAvatar = async () => {
    try {
      setLicenseAvatar('');
      await invoke('update_settings', { payload: { license_avatar: '' } });
      setIsAvatarModalOpen(false);
      showToast(t('settings.toast.avatarRemoved'), t('settings.toast.avatarRemovedMsg'), 'info');
    } catch (e) { showToast(t('settings.toast.error'), t('settings.toast.avatarRemoveFail'), 'error'); }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await invoke('update_settings', { 
        payload: { profile_name: profileName, profile_role: profileRole, profile_birthdate: profileRole } 
      });
      setIsEditingProfile(false);
      showToast(t('settings.toast.profileUpdated'), t('settings.toast.profileUpdatedMsg'), 'success');
    } catch (e) {
      showToast(t('settings.toast.error'), t('settings.toast.profileSaveFail'), 'error');
    }
  };

  const handleSave = async () => {
    if (!/^#[0-9A-Fa-f]{6}$/.test(accentColor)) {
      showToast(t('settings.toast.invalidColor'), t('settings.toast.invalidColorMsg'), 'error');
      return;
    }

    const mbps = Number(bwLimitMbps.replace(',', '.'));
    if (bwLimitEnabled && (!Number.isFinite(mbps) || mbps <= 0)) {
      showToast(t('settings.network.invalidSpeed'), t('settings.network.invalidSpeedMsg'), 'error');
      return;
    }
    if (bwLimitEnabled && bwStart === bwEnd) {
      showToast(t('settings.network.invalidWindow'), t('settings.network.invalidWindowMsg'), 'error');
      return;
    }

    setIsSaving(true);
    const payload = {
      theme, language: normalizeLanguage(i18n.resolvedLanguage), accent_color: accentColor, ui_scale: uiScale, client_logo: clientLogo, client_name: clientName,
      use_custom_smtp: useCustomSmtp.toString(),
      smtp_host: smtpHost, smtp_port: smtpPort, smtp_security: smtpSecurity, smtp_user: smtpUser, smtp_pass: smtpPass, 
      smtp_cc: smtpCc, smtp_bcc: smtpBcc, teams_webhook: teamsWebhook.trim(),
      webhook_on_success: webhookOnSuccess.toString(), webhook_on_failure: webhookOnFailure.toString(), webhook_on_warning: webhookOnWarning.toString(),
      pref_notify_backup_start: notifyBackupStart.toString(),
      pref_notify_backup_end: notifyBackupEnd.toString(),
      pref_notify_restore: notifyRestore.toString(),
      pref_notify_system_errors: notifySystemErrors.toString(),
      bw_limit_enabled: bwLimitEnabled.toString(),
      bw_limit_mbps: String(Number.isFinite(mbps) && mbps > 0 ? mbps : 10),
      bw_business_start: bwStart,
      bw_business_end: bwEnd
    };
    try {
      await invoke('update_settings', { payload });
      window.dispatchEvent(new Event('coopshield-settings-updated'));
      showToast(t('settings.toast.success'), t('settings.toast.saved'), 'success');
    } catch (error) { showToast(t('settings.toast.error'), t('settings.toast.saveFail'), 'error'); } 
    finally { setIsSaving(false); }
  };

  const handleTestSmtp = async () => {
    if (useCustomSmtp && (!smtpHost || !smtpPort || !smtpUser || !smtpPass)) {
      showToast(t('settings.toast.incompleteFields'), t('settings.toast.incompleteFieldsMsg'), 'error');
      return;
    }
    setIsTestingSmtp(true);
    try {
      const response = await invoke<string>('test_smtp_connection', { 
        host: smtpHost || 'cloud.binaver.com', port: parseInt(smtpPort || '587'), user: smtpUser, pass: smtpPass, 
        ccEmail: smtpCc, bccEmail: smtpBcc 
      });
      showToast(t('settings.toast.successBang'), response, 'success');
    } catch (error) { showToast(t('settings.toast.smtpError'), `${error}`, 'error'); } 
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
    } catch (e) { setLicenseMessage({ type: 'error', text: t('settings.license.qrFail')}); }
  };

  const handleVerifyCredentials = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!authEmail || !authPassword) { setLicenseMessage({ type: 'error', text: t('settings.license.fillCredentials') }); return; }
    if (showKeyInput && newLicenseKey.length < 55) { setLicenseMessage({ type: 'error', text: t('settings.license.keyIncomplete') }); return; }

    setIsValidatingLicense(true);
    setLicenseMessage(null);

    try {
      await invoke('request_2fa_token', { email: authEmail });
      setTwoFactorMethod('email');
      setAuthStep(2);
    } catch (error) { setLicenseMessage({ type: 'error', text: error as string }); } 
    finally { setIsValidatingLicense(false); }
  };

  const handleConfirm2FA = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (twoFactorCode.length < 6) { setLicenseMessage({ type: 'error', text: t('settings.license.tokenDigits') }); return; }

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
    const confirmed = window.confirm(t('settings.license.unlinkConfirm'));
    if (!confirmed) return;
    setIsUnlinking(true);
    showToast(t('settings.toast.unlinking'), t('settings.toast.unlinkingMsg'), 'info');
    try {
      await invoke('update_settings', { payload: { license_key: '', license_email: '', license_avatar: '', license_status: 'unlicensed' } });
      setTimeout(() => { window.location.reload(); }, 1500);
    } catch (error) { setIsUnlinking(false); }
  };

  const maskLicense = (key: string) => {
    if (!key || key.length < 55) return t('settings.noKey');
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
          <div key={toast.id} className={`w-80 p-4 rounded-xl shadow-2xl border flex items-start space-x-3 pointer-events-auto animate-in slide-in-from-right-8 fade-in duration-300 ${toast.type === 'success' ? 'bg-surface/95 border-green-500/40' : toast.type === 'error' ? 'bg-surface/95 border-red-500/40' : 'bg-surface/95 border-amber-500/40'}`}>
            <div className="shrink-0 mt-0.5">{toast.type === 'success' && <CheckCircle2 size={18} className="text-green-500" />}{toast.type === 'error' && <AlertCircle size={18} className="text-red-500" />}{toast.type === 'info' && <Info size={18} className="text-amber-500" />}</div>
            <div className="flex flex-col flex-1"><h4 className={`text-sm font-bold ${toast.type === 'success' ? 'text-green-500' : toast.type === 'error' ? 'text-red-500' : 'text-amber-500'}`}>{toast.title}</h4><p className="text-xs text-textMuted mt-1 leading-relaxed">{toast.message}</p></div>
            <button onClick={() => removeToast(toast.id)} className="text-textMuted hover:text-textMain transition-colors cursor-pointer shrink-0"><X size={16} /></button>
          </div>
        ))}
      </div>

      {/* MODAL DE SELEÇÃO DE AVATAR */}
      {isAvatarModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface border border-border w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between p-5 border-b border-border/50 bg-background/50">
              <h3 className="text-sm font-bold text-textMain flex items-center">
                <Camera size={18} className="mr-2 text-primary" /> {t('settings.avatar.title')}
              </h3>
              <button onClick={() => setIsAvatarModalOpen(false)} className="text-textMuted hover:text-textMain transition-colors"><X size={18} /></button>
            </div>
            
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-xs font-medium text-textMuted mb-3 uppercase tracking-wider">{t('settings.avatar.gallery')}</label>
                <div className="grid grid-cols-4 gap-4">
                  {PRESET_AVATARS.map((svgUrl, idx) => (
                    <button 
                      key={idx} 
                      onClick={() => handleSelectPresetAvatar(svgUrl)}
                      className="w-16 h-16 rounded-full overflow-hidden border-2 border-transparent hover:border-primary hover:scale-105 transition-all shadow-sm focus:outline-none focus:border-primary cursor-pointer"
                    >
                      <img src={svgUrl} alt={t('settings.avatar.preset', { n: idx + 1 })} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-border/50 pt-5 flex flex-col space-y-3">
                <button onClick={handleAvatarUpload} className="w-full flex items-center justify-center px-4 py-2.5 bg-primary/10 text-primary hover:bg-primary hover:text-white rounded-xl text-sm font-bold transition-all cursor-pointer">
                  <UploadCloud size={16} className="mr-2" /> {t('settings.avatar.upload')}
                </button>
                
                {licenseAvatar && (
                  <button onClick={handleRemoveAvatar} className="w-full flex items-center justify-center px-4 py-2.5 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-xl text-sm font-bold transition-all cursor-pointer">
                    <Trash2 size={16} className="mr-2" /> {t('settings.avatar.remove')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="shrink-0 mb-6">
        <h1 className="text-2xl font-bold mb-2 tracking-tight break-words text-slate-900 dark:text-slate-100">{t('settings.page.title')}</h1>
        <p className="text-sm text-textMuted">{t('settings.page.subtitle')}</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
        <div className="w-full lg:w-64 flex flex-col space-y-2 shrink-0">
          <button onClick={() => setActiveTab('appearance')} className={`flex items-center px-4 py-3 rounded-xl font-medium text-sm transition-all cursor-pointer ${activeTab === 'appearance' ? 'bg-primary/10 text-primary border border-primary/20' : 'text-textMuted hover:bg-surface hover:text-textMain border border-transparent'}`}><Palette size={18} className="mr-3" /> {t('settings.tabs.appearance')}</button>
          <button onClick={() => setActiveTab('notifications')} className={`flex items-center px-4 py-3 rounded-xl font-medium text-sm transition-all cursor-pointer ${activeTab === 'notifications' ? 'bg-primary/10 text-primary border border-primary/20' : 'text-textMuted hover:bg-surface hover:text-textMain border border-transparent'}`}><Bell size={18} className="mr-3" /> {t('settings.tabs.alerts')}</button>
          <button onClick={() => setActiveTab('network')} className={`flex items-center px-4 py-3 rounded-xl font-medium text-sm transition-all cursor-pointer ${activeTab === 'network' ? 'bg-primary/10 text-primary border border-primary/20' : 'text-textMuted hover:bg-surface hover:text-textMain border border-transparent'}`}><Gauge size={18} className="mr-3" /> {t('settings.tabs.network')}</button>
          <button onClick={() => setActiveTab('license')} className={`flex items-center px-4 py-3 rounded-xl font-medium text-sm transition-all cursor-pointer ${activeTab === 'license' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'text-textMuted hover:bg-surface hover:text-textMain border border-transparent'}`}><Key size={18} className="mr-3" /> {t('settings.tabs.license')}</button>
        </div>

        <div className="flex-1 flex flex-col bg-surface border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            
            {activeTab === 'appearance' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                <section className="bg-background/40 border border-border rounded-xl p-5">
                  <LanguageSwitcher />
                </section>
                <div>
                  <h2 className="text-lg font-bold mb-1">{t('settings.appearance.title')}</h2>
                  <p className="text-sm text-textMuted mb-6">{t('settings.appearance.subtitle')}</p>
                  <div className="space-y-8">
                    <div className="bg-background/40 border border-border rounded-xl p-5">
                      <label className="block text-sm font-medium text-textMain mb-1.5 flex items-center"><Building2 size={16} className="mr-2 text-primary" /> {t('settings.appearance.workspace')}</label>
                      <p className="text-xs text-textMuted mb-5">{t('settings.appearance.workspaceDesc')}</p>
                      <div className="flex items-end space-x-6">
                        <div className="shrink-0 flex flex-col items-center">
                          <label className="block text-xs font-medium text-textMuted mb-2">{t('settings.appearance.squareIcon')}</label>
                          {clientLogo ? (
                            <div className="relative group w-16 h-16 rounded-xl overflow-hidden shadow-md border border-border bg-surface flex items-center justify-center">
                              <img src={clientLogo} alt={t('settings.appearance.logoAlt')} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer" onClick={() => setClientLogo('')}><Trash2 size={18} className="text-red-400" /></div>
                            </div>
                          ) : (
                            <button onClick={handleLogoUpload} className="w-16 h-16 bg-surface border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 rounded-xl flex items-center justify-center transition-all cursor-pointer group"><UploadCloud size={20} className="text-textMuted group-hover:text-primary transition-colors" /></button>
                          )}
                        </div>
                        <div className="flex-1 pb-1">
                          <label className="block text-xs font-medium text-textMuted mb-2">{t('settings.appearance.workspaceName')}</label>
                          <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder={t('settings.appearance.workspaceNamePlaceholder')} className="w-full bg-surface border border-border rounded-lg px-4 py-2.5 text-sm text-textMain focus:border-primary outline-none transition-all shadow-sm" />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div>
                        <label className="block text-sm font-medium text-textMain mb-3">{t('settings.appearance.interfaceMode')}</label>
                        <div className="flex space-x-3">
                          <button onClick={() => setTheme('dark')} className={`flex-1 py-2.5 rounded-lg border-2 font-medium text-sm transition-all flex items-center justify-center cursor-pointer ${theme === 'dark' ? 'border-primary bg-primary/10 text-textMain' : 'border-border bg-background text-textMuted'}`}><Moon size={16} className={`mr-2 ${theme === 'dark' ? 'text-primary' : 'text-textMuted'}`} /> {t('settings.appearance.dark')}</button>
                          <button onClick={() => setTheme('light')} className={`flex-1 py-2.5 rounded-lg border-2 font-medium text-sm transition-all flex items-center justify-center cursor-pointer ${theme === 'light' ? 'border-primary bg-primary/10 text-textMain' : 'border-border bg-background text-textMuted'}`}><Sun size={16} className={`mr-2 ${theme === 'light' ? 'text-primary' : 'text-textMuted'}`} /> {t('settings.appearance.light')}</button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-textMain mb-3 flex items-center"><Type size={16} className="mr-2" /> {t('settings.appearance.scale')}</label>
                        <div className="flex space-x-3">
                          <button onClick={() => setUiScale('14')} className={`flex-1 py-2.5 rounded-lg border-2 font-medium text-sm transition-all cursor-pointer ${uiScale === '14' ? 'border-primary bg-primary/10 text-textMain' : 'border-border bg-background text-textMuted'}`}>{t('settings.appearance.scaleSmall')}</button>
                          <button onClick={() => setUiScale('16')} className={`flex-1 py-2.5 rounded-lg border-2 font-medium text-sm transition-all cursor-pointer ${uiScale === '16' ? 'border-primary bg-primary/10 text-textMain' : 'border-border bg-background text-textMuted'}`}>{t('settings.appearance.scaleNormal')}</button>
                          <button onClick={() => setUiScale('18')} className={`flex-1 py-2.5 rounded-lg border-2 font-medium text-sm transition-all cursor-pointer ${uiScale === '18' ? 'border-primary bg-primary/10 text-textMain' : 'border-border bg-background text-textMuted'}`}>{t('settings.appearance.scaleLarge')}</button>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-textMain mb-3">{t('settings.appearance.accent')}</label>
                      <div className="flex flex-wrap items-center gap-4 bg-background/40 p-3 border border-border rounded-xl">
                        <div className="flex flex-wrap gap-2">
                          {ACCENT_PRESETS.map(({ label, value }) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setAccentColor(value)}
                              aria-label={t('settings.appearance.useAccent', { label: accentLabel(label) })}
                              aria-pressed={accentColor.toUpperCase() === value}
                              title={accentLabel(label)}
                              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-all duration-300 ${accentColor.toUpperCase() === value ? 'border-primary/50 bg-primary/10 text-textMain shadow-sm' : 'border-border bg-surface text-textMuted hover:border-primary/30 hover:text-textMain'}`}
                            >
                              <span className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10" style={{ backgroundColor: value }} />
                              {accentLabel(label)}
                              {accentColor.toUpperCase() === value && <CheckCircle2 size={14} className="text-primary" />}
                            </button>
                          ))}
                        </div>
                        <div className="w-px h-8 bg-border mx-2 hidden md:block"></div>
                        <div className="flex items-center space-x-3">
                          <label className="text-xs text-textMuted uppercase font-bold">{t('settings.appearance.custom')}</label>
                          <div className="relative flex items-center">
                            <input aria-label={t('settings.appearance.pickColor')} type="color" value={/^#[0-9A-Fa-f]{6}$/.test(accentColor) ? accentColor : DEFAULT_ACCENT_COLOR} onChange={(e) => setAccentColor(e.target.value.toUpperCase())} className="w-10 h-10 p-0 border-0 rounded-lg cursor-pointer bg-transparent absolute opacity-0 z-10" />
                            <div className="w-10 h-10 rounded-lg border-2 border-border flex items-center justify-center transition-all shadow-sm relative z-0" style={{ backgroundColor: accentColor }}>
                              <Palette size={16} className="text-white mix-blend-difference opacity-50" />
                            </div>
                          </div>
                          <input type="text" aria-label={t('settings.appearance.hexCode')} value={accentColor} onChange={(e) => setAccentColor(e.target.value.toUpperCase())} className="w-24 bg-surface border border-border rounded-lg px-2 py-2 text-sm text-textMain focus:border-primary outline-none font-mono text-center uppercase" maxLength={7} pattern="^#[0-9A-Fa-f]{6}$" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <h2 className="text-lg font-bold mb-1">{t('settings.alerts.title')}</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  
                  <div className="space-y-6">
                    <div className="bg-background/50 border border-border rounded-xl p-5 space-y-4">
                      
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold flex items-center text-primary"><Mail size={16} className="mr-2" /> {t('settings.alerts.smtpServer')}</h3>
                        <div className="scale-90 origin-right">
                          <ToggleSwitch label="" description="" checked={useCustomSmtp} onChange={setUseCustomSmtp} />
                        </div>
                      </div>

                      {useCustomSmtp ? (
                        <div className="animate-in fade-in slide-in-from-top-2 space-y-4 pt-2">
                          <div><label className="block text-xs font-medium text-textMuted mb-1.5">{t('settings.alerts.smtpHost')}</label><input type="text" value={smtpHost} onChange={e => setSmtpHost(e.target.value)} placeholder="smtp.office365.com" className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none" /></div>
                          <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-xs font-medium text-textMuted mb-1.5">{t('settings.alerts.smtpPort')}</label><input type="text" value={smtpPort} onChange={e => setSmtpPort(e.target.value)} placeholder="587" className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none" /></div>
                            <div><label className="block text-xs font-medium text-textMuted mb-1.5">{t('settings.alerts.smtpSecurity')}</label><select value={smtpSecurity} onChange={e => setSmtpSecurity(e.target.value)} className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none"><option value="TLS">STARTTLS</option><option value="SSL">SSL/TLS</option></select></div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div><label className="block text-xs font-medium text-textMuted mb-1.5">{t('settings.alerts.smtpSender')}</label><input type="text" value={smtpUser} onChange={e => setSmtpUser(e.target.value)} placeholder="email@dominio.com" className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none" /></div>
                            <div><label className="block text-xs font-medium text-textMuted mb-1.5">{t('settings.alerts.smtpPassword')}</label><input type="password" value={smtpPass} onChange={e => setSmtpPass(e.target.value)} className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none" /></div>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 p-4 bg-primary/10 border border-primary/20 rounded-lg flex items-start animate-in fade-in">
                          <ShieldCheck size={20} className="text-primary mr-3 shrink-0 mt-0.5" />
                          <p className="text-sm text-textMain leading-relaxed">
                            <Trans i18nKey="settings.alerts.managedByCloud" components={{ strong: <strong /> }} />
                          </p>
                        </div>
                      )}

                      <div className="pt-3 mt-4 border-t border-border/50">
                        <label className="block text-xs font-bold text-textMain mb-3 uppercase tracking-wider">{t('settings.alerts.copies')}</label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-textMuted mb-1.5">{t('settings.alerts.cc')}</label>
                            <input type="text" value={smtpCc} onChange={e => setSmtpCc(e.target.value)} placeholder={t('settings.alerts.ccPlaceholder')} className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-textMuted mb-1.5">{t('settings.alerts.bcc')}</label>
                            <input type="text" value={smtpBcc} onChange={e => setSmtpBcc(e.target.value)} placeholder={t('settings.alerts.bccPlaceholder')} className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary outline-none" />
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-border/50">
                        <button onClick={handleTestSmtp} disabled={isTestingSmtp} className="w-full bg-surface border border-primary text-primary hover:bg-primary hover:text-white px-4 py-2.5 rounded-lg font-medium text-sm transition-all flex items-center justify-center cursor-pointer disabled:opacity-50">
                          {isTestingSmtp ? <RefreshCcw className="animate-spin mr-2" size={16} /> : <Send className="mr-2" size={16} />} {t('settings.alerts.testEmail')}
                        </button>
                      </div>
                    </div>

                    <div className="relative overflow-hidden bg-background/50 backdrop-blur-xl border border-border rounded-xl p-5 space-y-4">
                      <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
                      <h3 className="relative text-sm font-bold flex items-center text-amber-500 break-words"><MessageSquare size={16} className="mr-2 shrink-0" /> {t('settings.webhooks.title')}</h3>
                      <p className="relative text-xs text-textMuted break-words whitespace-normal">{t('settings.webhooks.desc')}</p>
                      <div className="relative">
                        <label className="block text-xs font-medium text-textMuted mb-1.5">{t('settings.webhooks.url')}</label>
                        <textarea value={teamsWebhook} onChange={e => setTeamsWebhook(e.target.value)} placeholder={t('settings.webhooks.placeholder')} className="w-full h-24 bg-surface border border-border rounded-lg px-3 py-2 text-xs text-textMain focus:border-amber-500 outline-none resize-none font-mono" />
                      </div>
                      <div className="relative">
                        <label className="block text-xs font-medium text-textMuted mb-2">{t('settings.webhooks.events')}</label>
                        <div className="grid grid-cols-1 gap-2">
                        <label className="flex items-start gap-3 p-3 rounded-lg border border-border/60 bg-surface/50 hover:border-primary/40 cursor-pointer transition-all">
                          <input type="checkbox" checked={webhookOnSuccess} onChange={e => setWebhookOnSuccess(e.target.checked)} className="mt-0.5 w-4 h-4 accent-amber-500 cursor-pointer shrink-0" />
                          <span className="min-w-0"><span className="block text-sm font-medium text-textMain break-words whitespace-normal">{t('settings.webhooks.success')}</span><span className="block text-xs text-textMuted break-words whitespace-normal">{t('settings.webhooks.successDesc')}</span></span>
                        </label>
                        <label className="flex items-start gap-3 p-3 rounded-lg border border-border/60 bg-surface/50 hover:border-primary/40 cursor-pointer transition-all">
                          <input type="checkbox" checked={webhookOnFailure} onChange={e => setWebhookOnFailure(e.target.checked)} className="mt-0.5 w-4 h-4 accent-amber-500 cursor-pointer shrink-0" />
                          <span className="min-w-0"><span className="block text-sm font-medium text-textMain break-words whitespace-normal">{t('settings.webhooks.failure')}</span><span className="block text-xs text-textMuted break-words whitespace-normal">{t('settings.webhooks.failureDesc')}</span></span>
                        </label>
                        <label className="flex items-start gap-3 p-3 rounded-lg border border-border/60 bg-surface/50 hover:border-primary/40 cursor-pointer transition-all">
                          <input type="checkbox" checked={webhookOnWarning} onChange={e => setWebhookOnWarning(e.target.checked)} className="mt-0.5 w-4 h-4 accent-amber-500 cursor-pointer shrink-0" />
                          <span className="min-w-0"><span className="block text-sm font-medium text-textMain break-words whitespace-normal">{t('settings.webhooks.warning')}</span><span className="block text-xs text-textMuted break-words whitespace-normal">{t('settings.webhooks.warningDesc')}</span></span>
                        </label>
                        </div>
                      </div>
                      <div className="relative pt-2 border-t border-border/50">
                        <button onClick={handleTestWebhook} disabled={isTestingWebhook} className="w-full bg-surface border border-amber-500 text-amber-500 hover:bg-amber-500 hover:text-white px-4 py-2.5 rounded-lg font-medium text-sm transition-all flex items-center justify-center cursor-pointer disabled:opacity-50 shadow-sm">
                          {isTestingWebhook ? <RefreshCcw className="animate-spin mr-2" size={16} /> : <Send className="mr-2" size={16} />} {isTestingWebhook ? t('settings.webhooks.testing') : t('settings.webhooks.test')}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="bg-background/50 border border-border rounded-xl p-5 h-fit">
                    <h3 className="text-sm font-bold flex items-center text-textMain mb-2"><BellRing size={16} className="mr-2 text-primary" /> {t('settings.alerts.prefsTitle')}</h3>
                    <p className="text-xs text-textMuted mb-6">{t('settings.alerts.prefsDesc')}</p>

                    <div className="space-y-1">
                      <ToggleSwitch label={t('settings.alerts.backupStart')} description={t('settings.alerts.backupStartDesc')} checked={notifyBackupStart} onChange={setNotifyBackupStart} />
                      <ToggleSwitch label={t('settings.alerts.backupEnd')} description={t('settings.alerts.backupEndDesc')} checked={notifyBackupEnd} onChange={setNotifyBackupEnd} />
                      <ToggleSwitch label={t('settings.alerts.restore')} description={t('settings.alerts.restoreDesc')} checked={notifyRestore} onChange={setNotifyRestore} />
                      <ToggleSwitch label={t('settings.alerts.systemErrors')} description={t('settings.alerts.systemErrorsDesc')} checked={notifySystemErrors} onChange={setNotifySystemErrors} />
                    </div>
                    
                    <div className="mt-6 pt-4 border-t border-border/50">
                      <div className="flex items-center text-xs font-medium text-textMuted">
                        <Settings2 size={16} className="mr-2" /> {t('settings.alerts.historyNote')}
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* ABA DE LICENCIAMENTO TOTALMENTE REESTRUTURADA E MODERNA */}
            {activeTab === 'network' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div>
                  <h2 className="text-lg font-bold mb-1 break-words">{t('settings.network.title')}</h2>
                  <p className="text-sm text-textMuted break-words">{t('settings.network.subtitle')}</p>
                </div>

                <section className="bg-background/40 backdrop-blur-xl border border-border rounded-xl p-5 space-y-5 shadow-sm">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0"><Gauge size={20} /></div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold break-words">{t('settings.network.enable')}</h3>
                        <p className="text-xs text-textMuted mt-0.5 break-words whitespace-normal">{t('settings.network.enableDesc')}</p>
                      </div>
                    </div>
                    <ToggleSwitch label="" description="" checked={bwLimitEnabled} onChange={setBwLimitEnabled} />
                  </div>

                  <div className={`grid grid-cols-1 xl:grid-cols-2 gap-5 pt-5 border-t border-border/50 transition-opacity duration-300 ${bwLimitEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`} aria-disabled={!bwLimitEnabled}>
                    <div>
                      <label htmlFor="bw-speed" className="block text-xs font-bold text-textMain mb-1.5 uppercase tracking-wider break-words">{t('settings.network.maxSpeed')}</label>
                      <div className="relative max-w-xs">
                        <input id="bw-speed" type="number" min="0.1" step="0.5" inputMode="decimal" value={bwLimitMbps} onChange={e => setBwLimitMbps(e.target.value)} disabled={!bwLimitEnabled} placeholder="10" className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all pr-14" />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-textMuted pointer-events-none">MB/s</span>
                      </div>
                      <p className="text-xs text-textMuted mt-1.5 break-words whitespace-normal">{t('settings.network.maxSpeedHint')}</p>
                    </div>

                    <div>
                      <span className="flex items-center text-xs font-bold text-textMain mb-1.5 uppercase tracking-wider break-words"><Clock size={14} className="mr-1.5 text-primary shrink-0" /> {t('settings.network.window')}</span>
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 text-xs text-textMuted">{t('settings.network.from')}
                          <input type="time" value={bwStart} onChange={e => setBwStart(e.target.value)} disabled={!bwLimitEnabled} className="w-auto w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all" />
                        </label>
                        <label className="flex items-center gap-2 text-xs text-textMuted">{t('settings.network.to')}
                          <input type="time" value={bwEnd} onChange={e => setBwEnd(e.target.value)} disabled={!bwLimitEnabled} className="w-auto w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-textMain focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all" />
                        </label>
                      </div>
                      <p className="text-xs text-textMuted mt-1.5 break-words whitespace-normal">{t('settings.network.windowHint')}</p>
                    </div>
                  </div>

                  <div className={`flex items-start gap-3 p-3 rounded-lg border text-sm ${bwLimitEnabled ? 'bg-primary/10 border-primary/20 text-textMain' : 'bg-background/50 border-border text-textMuted'}`} role="status">
                    <Info size={16} className="shrink-0 mt-0.5 text-primary" />
                    <span className="break-words whitespace-normal">{bwLimitEnabled ? t('settings.network.summaryOn', { speed: bwLimitMbps || '0', start: bwStart, end: bwEnd }) : t('settings.network.summaryOff')}</span>
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'license' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300 max-w-5xl">
                
                {!isEditingLicense ? (
                  <div className="space-y-6">
                    
                    {/* CARTÃO HERO DO TITULAR */}
                    <div className="bg-gradient-to-br from-background via-surface to-surface border border-border rounded-2xl p-6 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none"></div>

                      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
                        
                        <div className="flex items-center space-x-5">
                          {/* CLIQUE NA IMAGEM ABRE O MODAL DE AVATAR */}
                          <div className="relative group w-20 h-20 rounded-2xl bg-primary/10 border-2 border-primary/30 overflow-hidden shadow-md flex items-center justify-center text-primary text-xl font-bold shrink-0 cursor-pointer" onClick={() => setIsAvatarModalOpen(true)}>
                            {licenseAvatar ? (
                              <img src={licenseAvatar} alt={t('settings.license.holderAlt')} className="w-full h-full object-cover" />
                            ) : (
                              <span className="flex items-center justify-center w-full h-full bg-primary/20 text-primary font-bold text-2xl">
                                {licenseEmail ? licenseEmail.charAt(0).toUpperCase() : <ShieldCheck size={32} />}
                              </span>
                            )}
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[10px] font-bold uppercase p-1">
                              <Camera size={16} className="mb-1" /> {t('settings.license.edit')}
                            </div>
                          </div>

                          <div>
                            <div className="flex items-center space-x-3 flex-wrap gap-y-1">
                              <h2 className="text-xl font-bold text-textMain">{licenseEmail || t('settings.license.noOwner')}</h2>
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-green-500/10 text-green-500 border border-green-500/20 shadow-2xs">
                                <ShieldCheck size={14} className="mr-1.5" /> {t('settings.license.activeVerified')}
                              </span>
                            </div>

                            <p className="text-xs text-textMuted mt-2 flex items-center space-x-4 flex-wrap">
                              {profileName && <span className="flex items-center font-medium text-textMain"><User size={14} className="mr-1.5 text-primary" /> {profileName}</span>}
                              {profileRole && <span className="flex items-center font-medium text-textMain"><Briefcase size={14} className="mr-1.5 text-primary" /> {profileRole}</span>}
                            </p>
                          </div>
                        </div>

                        {/* AÇÕES DE GESTÃO */}
                        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
                          <button onClick={() => setIsEditingProfile(true)} className="px-4 py-2.5 bg-background hover:bg-black/5 dark:hover:bg-white/5 border border-border text-textMain rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center shadow-2xs">
                            <UserCheck size={14} className="mr-2 text-primary" /> {t('settings.license.technicalOwner')}
                          </button>
                          <button onClick={() => { setIsEditingLicense(true); setAuthStep(1); }} className="px-4 py-2.5 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center shadow-2xs">
                            <Edit2 size={14} className="mr-2" /> {t('settings.license.manageAccount')}
                          </button>
                          <button onClick={() => { setIsEditingLicense(true); setAuthEmail(licenseEmail); setAuthStep(2); setTwoFactorMethod('app'); requestAuthenticatorQRCode(); setIsResettingMfa(true); }} className="px-4 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-500 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center shadow-2xs">
                            <RefreshCw size={14} className="mr-2" /> {t('settings.license.resetMfa')}
                          </button>
                          <button onClick={handleUnlinkLicense} disabled={isUnlinking} className="px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-500 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center shadow-2xs disabled:opacity-50">
                            {isUnlinking ? <Loader2 size={14} className="animate-spin mr-2" /> : <ShieldOff size={14} className="mr-2" />} {t('settings.license.endSession')}
                          </button>
                        </div>

                      </div>
                    </div>

                    {/* FORMULÁRIO INLINE DE EDIÇÃO DO RESPONSÁVEL TÉCNICO */}
                    {isEditingProfile && (
                      <div className="bg-background border border-border rounded-2xl p-6 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
                        <form onSubmit={handleSaveProfile} className="space-y-4">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-bold text-textMain flex items-center">
                              <Briefcase size={16} className="mr-2 text-primary" /> {t('settings.license.editOwnerTitle')}
                            </h3>
                            <button type="button" onClick={() => setIsEditingProfile(false)} className="text-textMuted hover:text-textMain"><X size={16} /></button>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-medium text-textMuted mb-1.5">{t('settings.license.adminName')}</label>
                              <input type="text" value={profileName} onChange={e => setProfileName(e.target.value)} placeholder={t('settings.license.adminNamePlaceholder')} className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 text-sm text-textMain focus:border-primary outline-none shadow-2xs" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-textMuted mb-1.5">{t('settings.license.role')}</label>
                              <input type="text" value={profileRole} onChange={e => setProfileRole(e.target.value)} placeholder={t('settings.license.rolePlaceholder')} className="w-full bg-surface border border-border rounded-xl px-3.5 py-2.5 text-sm text-textMain focus:border-primary outline-none shadow-2xs" />
                            </div>
                          </div>
                          <div className="flex justify-end space-x-3 pt-2">
                            <button type="button" onClick={() => setIsEditingProfile(false)} className="px-4 py-2 text-xs font-bold text-textMuted hover:text-textMain cursor-pointer">{t('settings.cancel')}</button>
                            <button type="submit" className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-bold shadow-md flex items-center cursor-pointer">
                              <Save size={14} className="mr-1.5" /> {t('settings.license.saveChanges')}
                            </button>
                          </div>
                        </form>
                      </div>
                    )}

                    {/* GRID DE HARDWARE E CHAVE DE PRODUTO */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      
                      {/* DISPOSITIVO VINCULADO */}
                      <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="text-xs font-bold text-textMuted uppercase tracking-wider flex items-center">
                              <Laptop size={16} className="mr-2 text-primary" /> {t('settings.license.linkedDevice')}
                            </h4>
                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono bg-primary/10 text-primary font-bold">
                              {deviceName}
                            </span>
                          </div>

                          <div className="space-y-3">
                            <div className="bg-background/80 border border-border/60 rounded-xl p-4 shadow-2xs">
                              <span className="block text-[10px] font-bold text-textMuted uppercase tracking-wider mb-1 flex items-center">
                                <Monitor size={12} className="mr-1 text-primary" /> {t('settings.license.hostName')}
                              </span>
                              <span className="text-xs font-mono font-bold text-textMain">{deviceName} (Windows 11 Pro)</span>
                            </div>

                            <div className="bg-background/80 border border-border/60 rounded-xl p-4 shadow-2xs">
                              <span className="block text-[10px] font-bold text-textMuted uppercase tracking-wider mb-1 flex items-center">
                                <Cpu size={12} className="mr-1 text-primary" /> {t('settings.license.machineId')}
                              </span>
                              <span className="text-xs font-mono text-textMain break-all">{machineId}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* CHAVE DE PRODUTO */}
                      <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="text-xs font-bold text-textMuted uppercase tracking-wider flex items-center">
                              <Key size={16} className="mr-2 text-primary" /> {t('settings.license.activeKey')}
                            </h4>
                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-mono bg-green-500/10 text-green-500 font-bold flex items-center">
                              <Award size={12} className="mr-1" /> Enterprise
                            </span>
                          </div>

                          <div className="space-y-3">
                            <div className="bg-background/80 border border-border/60 rounded-xl p-4 shadow-2xs">
                              <span className="block text-[10px] font-bold text-textMuted uppercase tracking-wider mb-1">{t('settings.license.encryptedKey')}</span>
                              <span className="text-xs font-mono text-primary font-bold tracking-wider">{maskLicense(currentLicense)}</span>
                            </div>

                            <div className="bg-background/80 border border-border/60 rounded-xl p-4 shadow-2xs flex items-center justify-between">
                              <div>
                                <span className="block text-[10px] font-bold text-textMuted uppercase tracking-wider">{t('settings.license.encryption')}</span>
                                <span className="text-xs font-medium text-textMain">AES-256 Bit Secure Hardware Bound</span>
                              </div>
                              <Lock size={18} className="text-primary shrink-0" />
                            </div>
                          </div>
                        </div>
                      </div>

                    </div>

                  </div>
                ) : (
                  <div className="bg-surface border border-border rounded-2xl p-8 shadow-sm max-w-xl mx-auto animate-in fade-in duration-300">
                    <div className="mb-6">
                      <h2 className="text-lg font-bold text-textMain flex items-center">
                        <Key className="mr-2 text-primary" size={20} /> {isResettingMfa ? t('settings.license.resetMfaTitle') : t('settings.license.authTitle')}
                      </h2>
                      <p className="text-sm text-textMuted mt-1">{isResettingMfa ? t('settings.license.resetMfaDesc') : t('settings.license.authDesc')}</p>
                    </div>

                    <div className="bg-background border border-border rounded-xl overflow-hidden relative">
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
                                <input type="email" placeholder="email@dominio.com" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} disabled={isValidatingLicense} className="w-full bg-surface border border-border focus:border-primary rounded-xl pl-12 pr-4 py-3 text-sm font-medium text-textMain outline-none transition-all shadow-2xs" />
                              </div>
                              <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-textMuted" size={18} />
                                <input type="password" placeholder="••••••••" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} disabled={isValidatingLicense} className="w-full bg-surface border border-border focus:border-primary rounded-xl pl-12 pr-4 py-3 text-sm font-medium text-textMain outline-none transition-all shadow-2xs" />
                              </div>
                            </div>

                            <div className="pt-1">
                              <button type="button" onClick={() => setShowKeyInput(!showKeyInput)} className="flex items-center text-xs font-bold text-textMuted hover:text-textMain transition-colors cursor-pointer">
                                {showKeyInput ? <ChevronUp size={16} className="mr-1" /> : <ChevronDown size={16} className="mr-1" />} {t('settings.license.enterKeyManually')}
                              </button>
                            </div>

                            {showKeyInput && (
                              <div className="relative animate-in fade-in slide-in-from-top-2 duration-300">
                                <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-textMuted" size={18} />
                                <input type="text" placeholder={t('settings.license.keyPlaceholder')} value={newLicenseKey} onChange={handleLicenseInput} disabled={isValidatingLicense} className="w-full bg-surface border border-border focus:border-primary rounded-xl pl-12 pr-4 py-3 text-xs font-mono text-textMain outline-none transition-all tracking-wider shadow-2xs" />
                              </div>
                            )}

                            {licenseMessage && (
                              <div className={`flex items-center p-3 rounded-lg text-sm font-medium ${licenseMessage.type === 'error' ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
                                {licenseMessage.type === 'error' ? <AlertTriangle size={18} className="mr-2 shrink-0" /> : <CheckCircle2 size={18} className="mr-2 shrink-0" />}
                                {licenseMessage.text}
                              </div>
                            )}

                            <div className="flex justify-end space-x-3 pt-4 border-t border-border/50">
                              <button type="button" onClick={() => { setIsEditingLicense(false); setIsResettingMfa(false); setLicenseMessage(null); }} disabled={isValidatingLicense} className="px-4 py-2 text-textMuted hover:text-textMain text-sm font-bold transition-colors cursor-pointer">{t('settings.cancel')}</button>
                              <button type="submit" disabled={isValidatingLicense} className="flex items-center px-6 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-bold shadow-md transition-colors cursor-pointer">
                                {isValidatingLicense ? <Loader2 size={16} className="animate-spin mr-2" /> : t('settings.license.continue')} {!isValidatingLicense && <ArrowRight size={16} className="ml-2" />}
                              </button>
                            </div>
                          </form>
                        ) : (
                          <form onSubmit={handleConfirm2FA} className="space-y-5 animate-in slide-in-from-right-4 duration-300">
                            {!isResettingMfa && (
                              <div className="flex p-1 bg-surface border border-border rounded-xl mb-4">
                                <button type="button" onClick={() => { setTwoFactorMethod('app'); setTwoFactorCode(''); requestAuthenticatorQRCode(); }} className={`flex-1 flex items-center justify-center py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${twoFactorMethod === 'app' ? 'bg-background shadow-xs text-textMain border border-border' : 'text-textMuted hover:text-textMain'}`}><Smartphone size={14} className="mr-2" /> {t('settings.license.appMethod')}</button>
                                <button type="button" onClick={() => { setTwoFactorMethod('email'); setTwoFactorCode(''); }} className={`flex-1 flex items-center justify-center py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${twoFactorMethod === 'email' ? 'bg-background shadow-xs text-textMain border border-border' : 'text-textMuted hover:text-textMain'}`}><Mail size={14} className="mr-2" /> {t('settings.license.emailMethod')}</button>
                              </div>
                            )}

                            <div className="space-y-3">
                              {(twoFactorMethod === 'app' || isResettingMfa) && (
                                <div className="flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-300 mb-4 bg-surface p-4 rounded-xl border border-border">
                                  {qrCodeBase64 ? (
                                    <>
                                      <p className="text-xs font-bold text-textMain mb-3 uppercase tracking-wider">{t('settings.license.scanQr')}</p>
                                      <img src={qrCodeBase64} alt={t('settings.license.qrAlt')} className="w-32 h-32 bg-white p-2 rounded-lg shadow-sm" />
                                    </>
                                  ) : (
                                    <div className="w-32 h-32 flex items-center justify-center bg-surface border border-border rounded-lg"><Loader2 size={24} className="text-primary animate-spin" /></div>
                                  )}
                                </div>
                              )}
                              
                              <div className="flex justify-between items-center">
                                <label className="block text-xs font-medium text-textMuted">
                                  {twoFactorMethod === 'app' || isResettingMfa ? t('settings.license.enterAppCode') : t('settings.license.tokenSent', { email: authEmail || licenseEmail })}
                                </label>
                              </div>

                              <input type="text" placeholder="000000" maxLength={6} value={twoFactorCode} onChange={handle2FACodeInput} disabled={isValidatingLicense} className="w-full bg-surface border-2 border-border focus:border-primary rounded-xl px-4 py-4 text-2xl font-mono text-center text-textMain outline-none transition-all tracking-[0.5em] shadow-2xs" />
                            </div>

                            {licenseMessage && (
                              <div className={`flex items-center p-3 rounded-lg text-sm font-medium ${licenseMessage.type === 'error' ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
                                {licenseMessage.type === 'error' ? <AlertTriangle size={18} className="mr-2 shrink-0" /> : <CheckCircle2 size={18} className="mr-2 shrink-0" />}
                                {licenseMessage.text}
                              </div>
                            )}

                            <div className="flex justify-between items-center pt-4 border-t border-border/50">
                              <button type="button" onClick={() => { setIsEditingLicense(false); setIsResettingMfa(false); setLicenseMessage(null); }} disabled={isValidatingLicense} className="text-textMuted hover:text-textMain text-sm font-bold transition-colors cursor-pointer">{t('settings.cancel')}</button>
                              <button type="submit" disabled={isValidatingLicense || twoFactorCode.length < 6} className="flex items-center px-6 py-2.5 bg-primary hover:bg-primary/90 disabled:bg-primary/50 text-white rounded-xl text-sm font-bold shadow-md transition-colors cursor-pointer">
                                {isValidatingLicense ? <Loader2 size={16} className="animate-spin mr-2" /> : <Save size={16} className="mr-2" />} {t('settings.license.validateSave')}
                              </button>
                            </div>
                          </form>
                        )}
                      </div>
                    </div>
                  </div>
                )}

              </div>
            )}

          </div>

          {activeTab !== 'license' && (
            <div className="shrink-0 p-4 bg-background/30 border-t border-border flex justify-end">
              <button onClick={handleSave} disabled={isSaving || isTestingSmtp} className="bg-primary hover:bg-primary/90 text-white px-6 py-2.5 rounded-lg font-medium text-sm shadow-md transition-all flex items-center disabled:opacity-50 cursor-pointer">
                {isSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div> : <Save size={18} className="mr-2" />} {isSaving ? t('settings.actions.saving') : t('settings.actions.save')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}