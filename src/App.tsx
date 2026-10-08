import { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Shield, Key, Loader2, CheckCircle2, AlertTriangle, Mail, Lock, ChevronDown, ChevronUp, Smartphone, Save, HelpCircle, Copy, ExternalLink, RefreshCw, Clock } from 'lucide-react';

import Welcome from './pages/Welcome';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './pages/Dashboard';
import BackupRoutines from './pages/BackupRoutines';
import CloudStorage from './pages/CloudStorage';
import Restore from './pages/Restore';
import Settings from './pages/Settings';
import AuditLogs from './pages/AuditLogs'; 
import Support from './pages/Support';
import SplashScreen from './components/ui/SplashScreen';
import { hexToRgbChannels, normalizeAccentColor } from './theme';
import i18n from './i18n';
import { useTranslation, Trans } from 'react-i18next';
import { normalizeLanguage } from './i18n/languages';

export default function App() {
  const { t } = useTranslation();
  const [needsSetup, setNeedsSetup] = useState(true);
  const [isLicensed, setIsLicensed] = useState(true);
  const [isChecking, setIsChecking] = useState(true);
  const [isSplashExiting, setIsSplashExiting] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [startupAttempt, setStartupAttempt] = useState(0);
  const [systemTheme, setSystemTheme] = useState<'dark' | 'light'>('dark');

  const [clientLogo, setClientLogo] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [machineId, setMachineId] = useState<string>('');
  const [copiedId, setCopiedId] = useState(false);

  const [authStep, setAuthStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [unlockKey, setUnlockKey] = useState('');
  
  const [twoFactorMethod, setTwoFactorMethod] = useState<'app' | 'email'>('email');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState('');
  
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (resendTimer > 0) {
      interval = setInterval(() => setResendTimer((prev) => prev - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  useEffect(() => {
    let active = true;
    let unlistenReady: (() => void) | undefined;
    let startupTimeout: ReturnType<typeof setTimeout> | undefined;
    let releaseReadiness: (() => void) | undefined;
    const startedAt = performance.now();

    const checkSystemStatus = async () => {
      try {
        if (isTauri()) {
          let resolveReady!: () => void;
                  let readinessSettled = false;
          const backendReady = new Promise<void>((resolve, reject) => {
            resolveReady = resolve;
                        startupTimeout = setTimeout(() => {
              if (!readinessSettled) {
                readinessSettled = true;
                reject(new Error(i18n.t('splash.timeout')));
              }
            }, 30_000);
          });
          const signalReady = () => {
            if (!readinessSettled) {
              readinessSettled = true;
              if (startupTimeout) clearTimeout(startupTimeout);
              startupTimeout = undefined;
              resolveReady();
            }
          };
          releaseReadiness = signalReady;

          unlistenReady = await listen('system-ready', signalReady);
          if (!active) return;

          if (await invoke<boolean>('get_system_ready')) signalReady();
          await backendReady;
          if (!active) return;
        }

        const [settings, mId] = await Promise.all([
          invoke<Record<string, string>>('get_all_settings').catch(() => ({}) as Record<string, string>),
          invoke<string>('get_machine_id').catch(() => i18n.t('lock.unavailable'))
        ]);
        if (!active) return;

        await i18n.changeLanguage(normalizeLanguage(settings['language']));
        if (!active) return;

        setMachineId(mId);

        if (settings) {
          const root = document.documentElement;
          if (settings['accent_color']) {
            root.style.setProperty('--primary', hexToRgbChannels(normalizeAccentColor(settings['accent_color'])));
          }
          if (settings['client_logo']) setClientLogo(settings['client_logo']);
          if (settings['client_name']) setClientName(settings['client_name']);

          const savedTheme = settings['theme'] || 'dark';
          setSystemTheme(savedTheme as 'dark' | 'light');

          if (savedTheme === 'light') {
            root.style.setProperty('--background', '248 250 252');
            root.style.setProperty('--surface', '255 255 255');
            root.style.setProperty('--border', '226 232 240');
            root.style.setProperty('--text-main', '15 23 42');
            root.style.setProperty('--text-muted', '100 116 139');
            root.classList.remove('dark');
          } else {
            root.style.setProperty('--background', '2 6 23');
            root.style.setProperty('--surface', '15 23 42');
            root.style.setProperty('--border', '30 41 59');
            root.style.setProperty('--text-main', '248 250 252');
            root.style.setProperty('--text-muted', '148 163 184');
            root.classList.add('dark');
          }

          if (settings['setup_completed'] === 'true') {
            setNeedsSetup(false);
            if (settings['license_status'] !== 'active') setIsLicensed(false);
          }
        }
      } catch (error) {
        if (startupTimeout) clearTimeout(startupTimeout);
        console.error("Erro SQLite:", error);
        if (active) {
          setStartupError(error instanceof Error ? error.message : String(error));
        }
        return;
      }

      const minimumSplashTime = 900;
      const elapsed = performance.now() - startedAt;
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, minimumSplashTime - elapsed)));
      if (!active) return;

      setIsSplashExiting(true);
      await new Promise((resolve) => setTimeout(resolve, 550));
      if (active) setIsChecking(false);
    };
    checkSystemStatus();

    return () => {
      active = false;
      if (startupTimeout) clearTimeout(startupTimeout);
      releaseReadiness?.();
      unlistenReady?.();
    };
  }, [startupAttempt]);

  const handleCopyMachineId = () => {
    navigator.clipboard.writeText(machineId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2500);
  };

  const handleKeyInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    let rawValue = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (rawValue.length > 48) rawValue = rawValue.substring(0, 48);
    const formattedValue = rawValue.match(/.{1,6}/g)?.join('-') || '';
    setUnlockKey(formattedValue);
  };

  const handleCodeInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTwoFactorCode(e.target.value.replace(/[^0-9]/g, '').substring(0, 6));
  };

  const handleVerifyCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setUnlockError(t('lock.errFill')); return; }
    if (showKeyInput && unlockKey.length < 55) { setUnlockError(t('lock.errKey')); return; }

    setUnlockError('');
    setIsUnlocking(true);
    
    try {
      await invoke('request_2fa_token', { email: email }); 
      setTwoFactorMethod('email');
      setAuthStep(2); 
    } catch (error) {
      setUnlockError(error as string);
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleResendEmailToken = async () => {
    if (resendTimer > 0) return;
    setUnlockError('');
    setIsResending(true);
    setResendSuccess(false);
    try {
      await invoke('request_2fa_token', { email: email }); 
      setResendSuccess(true);
      setResendTimer(60); 
      setTimeout(() => setResendSuccess(false), 3000);
    } catch (error) {
      setUnlockError(error as string);
    } finally {
      setIsResending(false);
    }
  };

  const handleConfirm2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (twoFactorCode.length < 6) { setUnlockError(t('lock.errToken')); return; }

    setUnlockError('');
    setIsUnlocking(true);
    try {
      const [_msg, resolvedKey, validatedEmail] = await invoke<[string, string, string]>('authenticate_and_activate', { 
        email, password, twoFactorCode, method: twoFactorMethod, key: showKeyInput ? unlockKey : null 
      });
      
      await invoke('update_settings', { payload: { license_key: resolvedKey, license_email: validatedEmail, license_status: 'active' } });
      setIsLicensed(true);
    } catch (error) {
      setUnlockError(error as string);
    } finally {
      setIsUnlocking(false);
    }
  };

  if (isChecking) {
    return (
      <SplashScreen
        isExiting={isSplashExiting}
        error={startupError}
        onRetry={() => {
          setStartupError(null);
          setIsSplashExiting(false);
          setStartupAttempt((attempt) => attempt + 1);
        }}
      />
    );
  }
  
  if (needsSetup) return <Welcome onComplete={() => setNeedsSetup(false)} />;

  const isDark = systemTheme === 'dark';

  if (!isLicensed) {
    return (
      <div className={`min-h-screen ${isDark ? 'bg-slate-950' : 'bg-slate-200'} text-slate-800 flex flex-col items-center justify-center p-6 selection:bg-primary/30 relative font-sans overflow-hidden transition-colors duration-1000`}>
        
        <style>{`
          @keyframes droneWaveMove {
            0% { background-position: 0px 0px, 0px 0px; }
            100% { background-position: 200px 100px, -100px -50px; }
          }
          @keyframes causticsSway {
            0% { transform: scale(1.1) translate(0, 0); }
            33% { transform: scale(1.2) translate(-2%, 3%); }
            66% { transform: scale(1.15) translate(3%, -2%); }
            100% { transform: scale(1.1) translate(0, 0); }
          }
          @keyframes beaconSweep {
            0% { transform: rotate(-35deg); }
            100% { transform: rotate(35deg); }
          }
          .bg-drone-ocean {
            background-image: 
              url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0,50 Q25,60 50,50 T100,50 T150,50 T200,50' fill='none' stroke='rgba(255,255,255,0.1)' stroke-width='2'/%3E%3Cpath d='M0,100 Q25,115 50,100 T100,100 T150,100 T200,100' fill='none' stroke='rgba(255,255,255,0.08)' stroke-width='3'/%3E%3Cpath d='M0,150 Q25,140 50,150 T100,150 T150,150 T200,150' fill='none' stroke='rgba(255,255,255,0.12)' stroke-width='1.5'/%3E%3C/svg%3E"),
              url("data:image/svg+xml,%3Csvg viewBox='0 0 300 300' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0,150 C50,180 100,120 150,150 C200,180 250,120 300,150' fill='none' stroke='rgba(255,255,255,0.05)' stroke-width='4'/%3E%3C/svg%3E");
            background-size: 200px 200px, 300px 300px;
            animation: droneWaveMove 12s linear infinite;
          }
          .animate-caustics {
            animation: causticsSway 15s ease-in-out infinite;
          }
          .animate-beacon {
            transform-origin: top center;
            animation: beaconSweep 4s ease-in-out infinite alternate;
          }
        `}</style>

        <div className="absolute inset-0 z-0 bg-drone-ocean" style={{ opacity: isDark ? 0.4 : 0.8 }}>
          <div className={`absolute inset-0 bg-gradient-to-br ${isDark ? 'from-slate-800/70 via-slate-950 to-slate-950' : 'from-slate-100 via-slate-200 to-slate-300'}`}></div>
          <div className={`absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full blur-[120px] animate-caustics ${isDark ? 'bg-amber-400/10' : 'bg-amber-300/30'}`}></div>
          <div className={`absolute bottom-[-10%] right-[-10%] w-[70%] h-[70%] rounded-full blur-[150px] animate-caustics ${isDark ? 'bg-slate-700/40' : 'bg-slate-400/30'}`} style={{ animationDelay: '-5s' }}></div>
        </div>

        <div className="absolute top-8 right-12 z-0 flex flex-col items-center opacity-90 transition-opacity duration-1000">
          {isDark && (
            <div className="absolute top-[20px] w-72 h-[400px] bg-gradient-to-b from-amber-200/40 via-amber-100/5 to-transparent blur-xl animate-beacon pointer-events-none" style={{ clipPath: 'polygon(50% 0, 0 100%, 100% 100%)' }}></div>
          )}
          
          <svg width="120" height="120" viewBox="0 0 100 100" className="drop-shadow-[0_10px_20px_rgba(0,0,0,0.6)]">
            <path d="M18,60 L28,48 L45,45 L62,50 L77,60 L82,72 L65,81 L45,83 L23,77 Z" fill="none" stroke={isDark ? "#f59e0b" : "#ffffff"} strokeWidth="1" opacity={isDark ? "0.3" : "0.7"} />
            <path d="M20,60 L30,50 L45,48 L60,52 L75,60 L80,70 L65,78 L45,80 L25,75 Z" fill={isDark ? "#020617" : "#475569"} />
            <path d="M30,58 L40,52 L55,50 L65,55 L70,65 L55,70 L35,68 Z" fill={isDark ? "#0f172a" : "#64748b"} />
            <path d="M38,55 L45,52 L52,53 L58,58 L48,62 Z" fill={isDark ? "#1e293b" : "#94a3b8"} />
            <polygon points="42,54 58,54 54,17 46,17" fill={isDark ? "#f8fafc" : "#ffffff"} />
            <polygon points="43,45 57,45 56,36 44,36" fill={isDark ? "#b45309" : "#d97706"} />
            <polygon points="45,26 55,26 54,17 46,17" fill={isDark ? "#b45309" : "#d97706"} />
            <rect x="43" y="15" width="14" height="2" fill="#0f172a" />
            <rect x="45" y="8" width="10" height="7" fill={isDark ? "#fef08a" : "#cbd5e1"} className={isDark ? "animate-pulse" : ""} />
            <polygon points="43,8 57,8 50,0" fill={isDark ? "#b45309" : "#d97706"} />
          </svg>
          {isDark && (
            <div className="w-20 h-3 bg-amber-200/10 rounded-full blur-md mt-1 animate-pulse"></div>
          )}
        </div>

        <div className="w-full max-w-lg bg-white/95 border border-white/50 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5),0_0_40px_rgba(255,255,255,0.05)] rounded-[2.5rem] overflow-hidden flex flex-col relative z-10 backdrop-blur-2xl animate-in zoom-in-95 duration-500">
          
          <div className="px-8 pt-8 pb-6 border-b border-slate-200/70 flex flex-col items-center text-center bg-white/40">
            <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 flex items-center justify-center mb-4 shadow-sm overflow-hidden shrink-0">
              {clientLogo ? (
                <img src={clientLogo} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <Shield size={32} className="text-primary" />
              )}
            </div>

            <div className="inline-flex items-center space-x-2 bg-amber-50 border border-amber-200 text-amber-600 px-3.5 py-1 rounded-full text-xs font-bold mb-2 shadow-sm">
              <AlertTriangle size={13} className="shrink-0" />
              <span>{t('lock.badge')}</span>
            </div>

            <h1 className="text-xl font-bold text-slate-800 tracking-tight">{t('lock.title')}</h1>
            <p className="text-slate-500 text-xs mt-1 leading-relaxed max-w-sm">
              <Trans i18nKey="lock.description" values={{ name: clientName || 'Kopher Shield' }} components={{ strong: <strong className="text-slate-800" /> }} />
            </p>
          </div>

          <div className="p-8">
            {authStep === 1 ? (
              <form onSubmit={handleVerifyCredentials} className="space-y-4 animate-in slide-in-from-left-4 duration-300">
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('lock.email')}</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input type="email" placeholder="email@dominio.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={isUnlocking} className="w-full bg-slate-50/80 border border-slate-200 focus:border-primary focus:bg-white rounded-xl pl-12 pr-4 py-3 text-sm font-medium text-slate-800 outline-none transition-all placeholder:text-slate-400 shadow-sm" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('lock.password')}</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} disabled={isUnlocking} className="w-full bg-slate-50/80 border border-slate-200 focus:border-primary focus:bg-white rounded-xl pl-12 pr-4 py-3 text-sm font-medium text-slate-800 outline-none transition-all placeholder:text-slate-400 shadow-sm" />
                    </div>
                  </div>
                </div>

                <div className="pt-1 flex items-center justify-between">
                  <button type="button" onClick={() => setShowKeyInput(!showKeyInput)} className="flex items-center text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors cursor-pointer">
                    {showKeyInput ? <ChevronUp size={16} className="mr-1" /> : <ChevronDown size={16} className="mr-1" />} {t('lock.manualKey')}
                  </button>
                </div>

                {showKeyInput && (
                  <div className="relative animate-in fade-in slide-in-from-top-2 duration-300">
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input type="text" placeholder="Ex: HCTNAW-ZV28YO..." value={unlockKey} onChange={handleKeyInput} disabled={isUnlocking} className="w-full bg-slate-50/80 border border-slate-200 focus:border-primary focus:bg-white rounded-xl pl-12 pr-4 py-3 text-xs font-mono text-slate-800 outline-none transition-all tracking-wider placeholder:text-slate-400 shadow-sm" />
                  </div>
                )}

                {unlockError && <div className="flex items-center text-red-600 text-xs font-medium p-3 bg-red-50 rounded-xl border border-red-200"><AlertTriangle size={16} className="mr-2 shrink-0" /> {unlockError}</div>}

                <button type="submit" disabled={isUnlocking} className="w-full bg-primary hover:bg-primary/90 disabled:bg-primary/50 text-white rounded-xl py-3.5 text-sm font-bold shadow-lg shadow-primary/20 transition-all flex items-center justify-center cursor-pointer mt-2">
                  {isUnlocking ? <Loader2 size={18} className="animate-spin mr-2" /> : <CheckCircle2 size={18} className="mr-2" />} {t('lock.continue')}
                </button>
              </form>
            ) : (
              <form onSubmit={handleConfirm2FA} className="space-y-5 animate-in slide-in-from-right-4 duration-300">
                <div className="flex p-1 bg-slate-100/80 border border-slate-200 rounded-xl mb-2">
                  <button type="button" onClick={() => { setTwoFactorMethod('app'); setTwoFactorCode(''); }} className={`flex-1 flex items-center justify-center py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${twoFactorMethod === 'app' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}><Smartphone size={14} className="mr-2" /> {t('lock.methodApp')}</button>
                  <button type="button" onClick={() => { setTwoFactorMethod('email'); setTwoFactorCode(''); }} className={`flex-1 flex items-center justify-center py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${twoFactorMethod === 'email' ? 'bg-white text-slate-800 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}><Mail size={14} className="mr-2" /> {t('lock.methodEmail')}</button>
                </div>

                <div className="space-y-3">
                  <label className="block text-xs font-medium text-slate-500 text-center">
                    {twoFactorMethod === 'app' ? t('lock.codeHintApp') : t('lock.codeHintEmail', { email })}
                  </label>
                  <input type="text" placeholder="000000" maxLength={6} value={twoFactorCode} onChange={handleCodeInput} disabled={isUnlocking} className="w-full bg-slate-50/80 border-2 border-slate-200 focus:border-primary focus:bg-white rounded-xl px-4 py-3.5 text-2xl font-mono text-center text-slate-800 outline-none transition-all tracking-[0.5em] shadow-sm placeholder:text-slate-300" />
                  
                  {twoFactorMethod === 'email' && (
                    <div className="flex justify-center pt-1.5">
                      <button 
                        type="button" 
                        onClick={handleResendEmailToken} 
                        disabled={isResending || resendSuccess || isUnlocking || resendTimer > 0}
                        className={`text-[11px] font-bold transition-colors cursor-pointer flex items-center ${resendSuccess ? 'text-green-600' : resendTimer > 0 ? 'text-slate-400 cursor-not-allowed' : 'text-primary hover:text-primary/80'}`}
                      >
                        {isResending ? (
                          <><Loader2 size={13} className="mr-1.5 animate-spin" /> {t('lock.resending')}</>
                        ) : resendSuccess ? (
                          <><CheckCircle2 size={13} className="mr-1.5" /> {t('lock.resent')}</>
                        ) : resendTimer > 0 ? (
                          <><Clock size={13} className="mr-1.5" /> {t('lock.wait', { seconds: resendTimer })}</>
                        ) : (
                          <><RefreshCw size={13} className="mr-1.5" /> {t('lock.resend')}</>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {unlockError && <div className="flex items-center text-red-600 text-xs font-medium p-3 bg-red-50 rounded-xl border border-red-200"><AlertTriangle size={16} className="mr-2 shrink-0" /> {unlockError}</div>}

                <div className="flex justify-between items-center pt-3 border-t border-slate-200/70">
                  <button type="button" onClick={() => setAuthStep(1)} disabled={isUnlocking} className="text-slate-500 hover:text-slate-800 text-xs font-bold transition-colors cursor-pointer">{t('lock.back')}</button>
                  <button type="submit" disabled={isUnlocking || twoFactorCode.length < 6} className="flex items-center px-5 py-2.5 bg-primary hover:bg-primary/90 disabled:bg-primary/50 text-white rounded-xl text-xs font-bold shadow-md transition-colors cursor-pointer">
                    {isUnlocking ? <Loader2 size={16} className="animate-spin mr-2" /> : <Save size={16} className="mr-2" />} {t('lock.unlock')}
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="px-8 py-4 bg-slate-50/80 border-t border-slate-200/70 flex flex-col space-y-2 text-xs text-slate-500">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] truncate text-slate-600">{t('lock.machineId')} {machineId}</span>
              <button 
                onClick={handleCopyMachineId} 
                className="flex items-center text-primary font-bold hover:underline cursor-pointer shrink-0 ml-2"
                title={t('lock.copyTitle')}
              >
                {copiedId ? <CheckCircle2 size={14} className="mr-1 text-green-500" /> : <Copy size={14} className="mr-1" />}
                {copiedId ? t('lock.copied') : t('lock.copyId')}
              </button>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-[11px]">
              <span className="flex items-center"><HelpCircle size={13} className="mr-1 text-primary" /> {t('lock.subscriptionHelp')}</span>
              <a href="mailto:suporte@dominio.com" className="text-primary font-bold hover:underline flex items-center">
                {t('lock.contact')} <ExternalLink size={12} className="ml-1" />
              </a>
            </div>
          </div>

        </div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="rotinas" element={<BackupRoutines />} />
          <Route path="nuvem" element={<CloudStorage />} />
          <Route path="restauro" element={<Restore />} />
          <Route path="auditoria" element={<AuditLogs />} />
          <Route path="configuracoes" element={<Settings />} />
          <Route path="suporte" element={<Support />} />
        </Route>
      </Routes>
    </Router>
  );
}