import { useState, useEffect } from 'react';
import { ShieldCheck, Key, ArrowRight, CheckCircle2, Loader2, AlertTriangle, Mail, Lock, ChevronDown, ChevronUp, Save } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { normalizeLanguage, type SupportedLanguage } from '../i18n/languages';
import LighthouseScene from '../components/ui/LighthouseScene';
import WelcomeHero, { type ThemeOption } from '../components/ui/WelcomeHero';

interface WelcomeProps {
  onComplete: () => void;
}

type SetupStep = 1 | 2 | 3 | 4;

export default function Welcome({ onComplete }: WelcomeProps) {
  const [step, setStep] = useState<SetupStep>(1);
  const { t, i18n } = useTranslation();
  
  const [language, setLanguage] = useState<SupportedLanguage>(() => normalizeLanguage(i18n.resolvedLanguage));
  const [theme, setTheme] = useState<ThemeOption>('dark');
  
  const [authStep, setAuthStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [licenseKey, setLicenseKey] = useState('');
  
  const [twoFactorMethod, setTwoFactorMethod] = useState<'app' | 'email'>('email');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  
  const [resolvedKey, setResolvedKey] = useState('');
  const [resolvedEmail, setResolvedEmail] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [licenseError, setLicenseError] = useState('');

  const handleLanguageChange = (langId: SupportedLanguage) => {
    setLanguage(langId);
    void i18n.changeLanguage(langId).then(() => invoke('update_settings', { payload: { language: langId } })).catch(() => undefined);
  };

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const handleLicenseInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    let rawValue = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (rawValue.length > 48) rawValue = rawValue.substring(0, 48);
    setLicenseKey(rawValue.match(/.{1,6}/g)?.join('-') || '');
  };

  const handleCodeInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTwoFactorCode(e.target.value.replace(/[^0-9]/g, '').substring(0, 6));
  };

  const handleVerifyCredentials = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!email || !password) { setLicenseError(t('welcome.auth.errFill')); return; }
    if (showKeyInput && licenseKey.length < 55) { setLicenseError(t('welcome.auth.errKey')); return; }
    
    setLicenseError('');
    setIsValidating(true);

    try {
      await invoke('request_2fa_token', { email: email }); 
      setTwoFactorMethod('email');
      setAuthStep(2);
    } catch (error) {
      setLicenseError(String(error));
    } finally {
      setIsValidating(false);
    }
  };

  const handleConfirm2FA = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (twoFactorCode.length < 6) { setLicenseError(t('welcome.auth.errToken')); return; }

    setLicenseError('');
    setIsValidating(true);

    try {
      const [_msg, apiResolvedKey, apiValidatedEmail] = await invoke<[string, string, string]>('authenticate_and_activate', { 
        email, password, twoFactorCode, method: twoFactorMethod, key: showKeyInput ? licenseKey : null 
      });
      setResolvedKey(apiResolvedKey);
      setResolvedEmail(apiValidatedEmail);
      setStep(4);
    } catch (error) {
      setLicenseError(String(error));
    } finally {
      setIsValidating(false);
    }
  };

  const handleFinishSetup = async () => {
    try {
      await invoke('finish_setup', { language, theme, licenseKey: resolvedKey });
      await invoke('update_settings', { payload: { license_email: resolvedEmail, license_status: 'active' } });
      onComplete();
    } catch (error) {
      setLicenseError(t('welcome.auth.errFatal'));
    }
  };

  return (
    <div className="relative min-h-screen bg-background flex flex-col items-center justify-center p-4 selection:bg-primary/30 overflow-hidden">
      <LighthouseScene />

      <div className="w-full max-w-2xl bg-surface/60 backdrop-blur-xl border border-white/10 dark:border-white/10 shadow-[0_0_60px_rgba(245,158,11,0.12)] rounded-3xl relative z-10 overflow-hidden flex flex-col min-h-[500px] animate-in zoom-in-95 duration-500">
        
        <div className="px-8 py-6 border-b border-border/50 flex items-center justify-between bg-black/5 dark:bg-white/5">
          <div className="flex items-center space-x-3">
            <div className="bg-primary/10 p-2 rounded-lg text-primary border border-primary/20">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-textMain tracking-tight">Kopher Shield</h1>
              <p className="text-xs text-textMuted font-medium uppercase tracking-wider">{t('welcome.setup')}</p>
            </div>
          </div>
          
          <div className="flex space-x-2">
            {[1, 3, 4].map((i) => (
              <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${step >= i ? 'bg-primary w-6' : 'bg-border w-2'}`} />
            ))}
          </div>
        </div>

        <div className="flex-1 p-8 flex flex-col justify-center relative">
          {step === 1 && (
            <WelcomeHero language={language} theme={theme} onLanguageChange={handleLanguageChange} onThemeChange={setTheme} />
          )}

          {step === 3 && (
            <div className="space-y-6 animate-in slide-in-from-right-8 fade-in duration-500">
              {authStep === 1 ? (
                <>
                  <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold text-textMain mb-2">{t('welcome.auth.title')}</h2>
                    <p className="text-textMuted text-sm">{t('welcome.auth.subtitle')}</p>
                  </div>
                  <form onSubmit={handleVerifyCredentials} className="max-w-md mx-auto space-y-4">
                    <div className="space-y-3">
                      <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-textMuted" size={18} />
                        <input type="email" placeholder={t('welcome.auth.email')} aria-label={t('welcome.auth.email')} value={email} onChange={(e) => setEmail(e.target.value)} disabled={isValidating} className="w-full bg-background border border-border focus:border-primary rounded-xl pl-12 pr-4 py-3 text-sm font-medium text-textMain outline-none transition-all" />
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-textMuted" size={18} />
                        <input type="password" placeholder={t('welcome.auth.password')} aria-label={t('welcome.auth.password')} value={password} onChange={(e) => setPassword(e.target.value)} disabled={isValidating} className="w-full bg-background border border-border focus:border-primary rounded-xl pl-12 pr-4 py-3 text-sm font-medium text-textMain outline-none transition-all" />
                      </div>
                    </div>
                    <div className="pt-1">
                      <button type="button" onClick={() => setShowKeyInput(!showKeyInput)} className="flex items-center text-xs font-bold text-textMuted hover:text-textMain transition-colors cursor-pointer">
                        {showKeyInput ? <ChevronUp size={16} className="mr-1" /> : <ChevronDown size={16} className="mr-1" />} {t('welcome.auth.manualKey')}
                      </button>
                    </div>
                    {showKeyInput && (
                      <div className="relative animate-in fade-in slide-in-from-top-2 duration-300">
                        <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-textMuted" size={18} />
                        <input type="text" placeholder={t('welcome.auth.keyPh')} aria-label={t('welcome.auth.keyLabel')} value={licenseKey} onChange={handleLicenseInput} disabled={isValidating} className="w-full bg-background border border-border focus:border-primary rounded-xl pl-12 pr-4 py-3 text-xs font-mono text-textMain outline-none transition-all tracking-wider" />
                      </div>
                    )}
                    {licenseError && <div className="flex items-center text-red-500 text-sm font-medium animate-in fade-in bg-red-500/10 p-3 rounded-lg"><AlertTriangle size={16} className="mr-2 shrink-0" /> {licenseError}</div>}
                    <button type="submit" className="hidden"></button>
                  </form>
                </>
              ) : (
                <form onSubmit={handleConfirm2FA} className="max-w-md mx-auto space-y-5 animate-in slide-in-from-right-4 duration-300">
                  <div className="text-center mb-6">
                    <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                      <ShieldCheck size={28} className="text-primary" />
                    </div>
                    <h3 className="text-base font-bold text-textMain">{t('welcome.auth.twoFaTitle')}</h3>
                    <p className="text-xs text-textMuted mt-1">{t('welcome.auth.twoFaSubtitle')}</p>
                  </div>
                  <div className="flex p-1 bg-surface border border-border rounded-lg mb-4">
                    <button type="button" onClick={() => setTwoFactorMethod('email')} className={`flex-1 flex items-center justify-center py-2.5 text-xs font-bold rounded-md transition-all cursor-pointer ${twoFactorMethod === 'email' ? 'bg-background shadow-sm text-textMain border border-border' : 'text-textMuted hover:text-textMain'}`}><Mail size={14} className="mr-2" /> {t('welcome.auth.emailMethod')}</button>
                  </div>
                  <div className="space-y-3">
                    <label className="block text-xs font-medium text-textMuted text-center">
                      {t('welcome.auth.tokenSent', { email })}
                    </label>
                    <input type="text" placeholder="000000" aria-label={t('welcome.auth.tokenLabel')} maxLength={6} value={twoFactorCode} onChange={handleCodeInput} disabled={isValidating} className="w-full bg-surface border-2 border-border focus:border-primary rounded-xl px-4 py-4 text-2xl font-mono text-center text-textMain outline-none transition-all tracking-[0.5em]" />
                  </div>
                  {licenseError && <div className="flex items-center text-red-500 text-sm font-medium animate-in fade-in bg-red-500/10 p-3 rounded-lg"><AlertTriangle size={16} className="mr-2 shrink-0" /> {licenseError}</div>}
                </form>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col items-center justify-center text-center space-y-6 animate-in zoom-in-95 fade-in duration-700 h-full">
              <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mb-2"><CheckCircle2 size={40} className="text-green-500" /></div>
              <div>
                <h2 className="text-3xl font-bold text-textMain mb-2">{t('welcome.auth.doneTitle')}</h2>
                <p className="text-textMuted max-w-sm mx-auto">{t('welcome.auth.doneText')}</p>
              </div>
            </div>
          )}

        </div>

        <div className="px-8 py-5 border-t border-border/50 bg-black/5 dark:bg-white/5 flex justify-between items-center">
          {step === 3 && authStep === 1 ? (
            <button onClick={() => setStep((s) => (s === 3 ? 1 : (s - 1)) as SetupStep)} className="px-6 py-2.5 rounded-lg text-sm font-bold text-textMuted hover:text-textMain hover:bg-surface border border-transparent transition-all cursor-pointer" disabled={isValidating}>{t('welcome.auth.back')}</button>
          ) : step === 3 && authStep === 2 ? (
            <button onClick={() => setAuthStep(1)} className="px-6 py-2.5 rounded-lg text-sm font-bold text-textMuted hover:text-textMain hover:bg-surface border border-transparent transition-all cursor-pointer" disabled={isValidating}>{t('welcome.auth.back')}</button>
          ) : <div></div>}

          {step === 1 && (
            <button onClick={() => setStep((s) => (s === 1 ? 3 : (s + 1)) as SetupStep)} className="px-6 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-bold shadow-lg shadow-primary/20 transition-all flex items-center cursor-pointer">{t('common.actions.continue')} <ArrowRight className="w-4 h-4 ml-2" aria-hidden="true" /></button>
          )}

          {step === 3 && authStep === 1 && (
            <button onClick={() => handleVerifyCredentials()} disabled={isValidating || !email || !password} className="px-6 py-2.5 bg-primary hover:bg-primary/90 disabled:bg-primary/50 text-white rounded-lg text-sm font-bold shadow-lg shadow-primary/20 transition-all flex items-center cursor-pointer min-w-[140px] justify-center">
              {isValidating ? <Loader2 size={16} className="animate-spin" /> : t('welcome.auth.authenticate')}
            </button>
          )}

          {step === 3 && authStep === 2 && (
            <button onClick={() => handleConfirm2FA()} disabled={isValidating || twoFactorCode.length < 6} className="px-6 py-2.5 bg-primary hover:bg-primary/90 disabled:bg-primary/50 text-white rounded-lg text-sm font-bold shadow-lg shadow-primary/20 transition-all flex items-center cursor-pointer min-w-[140px] justify-center">
              {isValidating ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} className="mr-2" />} {t('welcome.auth.validate')}
            </button>
          )}

          {step === 4 && (
            <button onClick={handleFinishSetup} className="px-8 py-3 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-bold shadow-lg shadow-primary/20 transition-all cursor-pointer w-full mx-auto max-w-sm">{t('welcome.auth.enter')}</button>
          )}
        </div>
      </div>
    </div>
  );
}