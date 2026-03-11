import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { signIn, signInWithGoogle, signUp, setAuthPersistence } from '@/lib/firebase/auth';
import { syncUserProfile, api } from '@/lib/api';
import { PHONE_COUNTRIES } from '@/lib/phone-countries';

declare global {
  interface Window {
    grecaptcha: {
      render: (
        container: HTMLElement,
        params: {
          sitekey: string;
          callback: (token: string) => void;
          'expired-callback': () => void;
          theme?: string;
        }
      ) => number;
      reset: (widgetId: number) => void;
      getResponse: (widgetId: number) => string;
      ready: (cb: () => void) => void;
    };
  }
}

const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string;

const ERRORS: Record<string, string> = {
  'auth/invalid-email': 'Email không hợp lệ.',
  'auth/user-disabled': 'Tài khoản đã bị vô hiệu hóa.',
  'auth/user-not-found': 'Tài khoản không tồn tại.',
  'auth/wrong-password': 'Mật khẩu không đúng.',
  'auth/invalid-credential': 'Email hoặc mật khẩu không đúng.',
  'auth/invalid-login-credentials': 'Email hoặc mật khẩu không đúng.',
  'auth/too-many-requests': 'Quá nhiều lần thử. Vui lòng thử lại sau.',
  'auth/email-already-in-use': 'Email này đã được sử dụng.',
  'auth/weak-password': 'Mật khẩu quá yếu.',
  'auth/operation-not-allowed': 'Phương thức đăng nhập chưa được bật.',
  'auth/network-request-failed': 'Lỗi kết nối mạng.',
  'auth/internal-error': 'Lỗi máy chủ. Vui lòng thử lại sau.',
  'auth/popup-closed-by-user': 'Bạn đã đóng cửa sổ đăng nhập.',
  'auth/popup-blocked': 'Popup bị chặn bởi trình duyệt.',
  'auth/cancelled-popup-request': 'Đã có yêu cầu đăng nhập khác.',
  'auth/account-exists-with-different-credential': 'Email đã liên kết với phương thức khác.',
};

function validatePassword(pw: string, name: string, email: string): string | null {
  if (pw.length < 6) return 'Mật khẩu cần ít nhất 6 ký tự.';
  if (!/[A-Z]/.test(pw)) return 'Cần ít nhất 1 chữ viết hoa.';
  if (!/[0-9]/.test(pw)) return 'Cần ít nhất 1 chữ số.';
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Cần ít nhất 1 ký tự đặc biệt.';
  if (name && pw.toLowerCase() === name.toLowerCase()) return 'Không được trùng tên.';
  if (email && pw.toLowerCase() === email.toLowerCase()) return 'Không được trùng email.';
  return null;
}

/* ─── Animated background ──────────────────────────────────────────────── */
function AuthBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-cyan-950 to-slate-900" />
      <div className="auth-orb auth-orb-1" />
      <div className="auth-orb auth-orb-2" />
      <div className="auth-orb auth-orb-3" />
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={i}
          className="auth-particle"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 8}s`,
            animationDuration: `${6 + Math.random() * 8}s`,
            width: `${2 + Math.random() * 3}px`,
            height: `${2 + Math.random() * 3}px`,
          }}
        />
      ))}
    </div>
  );
}

/* ─── SVG Icons ────────────────────────────────────────────────────────── */
const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

const EyeIcon = ({ open }: { open: boolean }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    {open ? (
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9.27-3.11-11-7.5a11.7 11.7 0 013.168-4.477M6.343 6.343A9.97 9.97 0 0112 5c5 0 9.27 3.11 11 7.5a11.7 11.7 0 01-4.168 4.477M6.343 6.343L3 3m3.343 3.343l2.829 2.829m4.486 4.486l2.829 2.829M6.343 6.343l11.314 11.314M14.121 14.121A3 3 0 009.879 9.879" />
    ) : (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </>
    )}
  </svg>
);

/* ─── Shared UI tokens ─────────────────────────────────────────────────── */
const INPUT =
  'w-full px-4 py-3 rounded-xl bg-white/[0.07] border border-white/[0.12] text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/60 focus:border-transparent backdrop-blur-sm transition-all duration-200';

const BTN_PRIMARY =
  'w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-400/30 transition-all duration-300 disabled:opacity-50 disabled:hover:shadow-none';

/* ─── Password field ───────────────────────────────────────────────────── */
function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative group">
      <input
        type={show ? 'text' : 'password'}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${INPUT} pr-11`}
        required
      />
      <button
        type="button"
        tabIndex={-1}
        onMouseDown={() => setShow(true)}
        onMouseUp={() => setShow(false)}
        onMouseLeave={() => setShow(false)}
        onTouchStart={() => setShow(true)}
        onTouchEnd={() => setShow(false)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors select-none"
      >
        <EyeIcon open={show} />
      </button>
    </div>
  );
}

/* ─── Error banner ─────────────────────────────────────────────────────── */
function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="flex items-center gap-2.5 p-3 mt-3 rounded-xl bg-red-500/10 border border-red-500/20 animate-[shake_0.3s_ease-in-out]">
      <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p className="text-red-300 text-sm font-medium">{message}</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */
export default function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isRegister = location.pathname === '/register';
  const [mode, setMode] = useState<'login' | 'register'>(isRegister ? 'register' : 'login');

  const [loginEmail, setLoginEmail] = useState(() => localStorage.getItem('surf_last_email') || '');
  const [loginPassword, setLoginPassword] = useState('');
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPhoneCountry, setRegPhoneCountry] = useState('VN');
  const [regPhone, setRegPhone] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [showCaptchaModal, setShowCaptchaModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<'login' | 'register' | 'google' | null>(null);
  const captchaModalRef = useRef<HTMLDivElement>(null);
  const captchaWidgetId = useRef<number | null>(null);
  const loginFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setLoginPassword('');
    setRegEmail('');
    setRegPassword('');
    setRegConfirmPassword('');
    setRegName('');
    setRegPhone('');
    setError('');
    loginFormRef.current?.reset();
  }, []);

  useEffect(() => { setMode(isRegister ? 'register' : 'login'); }, [isRegister]);

  /* CAPTCHA */
  useEffect(() => {
    if (!showCaptchaModal || !RECAPTCHA_SITE_KEY) return;
    captchaWidgetId.current = null;
    let cancelled = false;
    const tryRender = () => {
      if (cancelled || !captchaModalRef.current || !window.grecaptcha) return false;
      try {
        captchaWidgetId.current = window.grecaptcha.render(captchaModalRef.current, {
          sitekey: RECAPTCHA_SITE_KEY,
          callback: (token: string) => setCaptchaToken(token),
          'expired-callback': () => setCaptchaToken(''),
          theme: 'dark',
        });
        return true;
      } catch { return false; }
    };
    let interval: ReturnType<typeof setInterval> | null = null;
    if (window.grecaptcha?.ready) {
      window.grecaptcha.ready(() => { if (!cancelled) tryRender(); });
    }
    const timer = setTimeout(() => {
      if (!tryRender()) {
        interval = setInterval(() => { if (tryRender()) { clearInterval(interval!); interval = null; } }, 200);
        setTimeout(() => { if (interval) { clearInterval(interval); interval = null; } }, 10000);
      }
    }, 50);
    return () => { cancelled = true; clearTimeout(timer); if (interval) clearInterval(interval); };
  }, [showCaptchaModal]);

  const openCaptchaModal = (action: 'login' | 'register' | 'google') => {
    setCaptchaToken(''); setPendingAction(action); setShowCaptchaModal(true);
  };
  const closeCaptchaModal = () => { setShowCaptchaModal(false); setPendingAction(null); setCaptchaToken(''); };

  /* ─── Auth executors ─────────────────────────────────────────────────── */
  const executeLogin = async () => {
    setLoading(true);
    try {
      await setAuthPersistence(rememberMe);
      const result = await signIn(loginEmail.trim(), loginPassword);
      await result.user.getIdToken();
      await new Promise((r) => setTimeout(r, 800));
      await syncUserProfile();
      api.post('/api/auth/notify-login').catch(() => {});
      localStorage.setItem('surf_last_email', loginEmail.trim());
      setLoginPassword('');
      setShowCaptchaModal(false);
      navigate('/feed', { replace: true });
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
      setError(ERRORS[code] || 'Đăng nhập thất bại.');
      closeCaptchaModal();
    } finally { setLoading(false); }
  };

  const executeRegister = async () => {
    setLoading(true);
    try {
      const result = await signUp(regEmail.trim(), regPassword, regName.trim());
      await result.user.getIdToken();
      await new Promise((r) => setTimeout(r, 800));
      await syncUserProfile();
      api.post('/api/auth/notify-register').catch(() => {});
      setShowCaptchaModal(false);
      navigate('/onboarding', { replace: true });
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
      setError(ERRORS[code] || 'Đăng ký thất bại.');
      closeCaptchaModal();
    } finally { setLoading(false); }
  };

  const executeGooglePost = async () => {
    setLoading(true);
    try {
      const result = await signInWithGoogle();
      await result.user.getIdToken();
      await new Promise((r) => setTimeout(r, 800));
      await syncUserProfile();
      api.post('/api/auth/notify-login').catch(() => {});
      setShowCaptchaModal(false);
      navigate('/feed', { replace: true });
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
      if (['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/popup-blocked', 'auth/user-cancelled', 'auth/multi-factor-auth-required'].includes(code)) {
        closeCaptchaModal(); setLoading(false); return;
      }
      setError(ERRORS[code] || 'Đăng nhập Google thất bại.');
      closeCaptchaModal();
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (!captchaToken || !pendingAction) return;
    if (pendingAction === 'login') executeLogin();
    else if (pendingAction === 'register') executeRegister();
    else if (pendingAction === 'google') executeGooglePost();
  }, [captchaToken]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Form handlers ──────────────────────────────────────────────────── */
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (RECAPTCHA_SITE_KEY && !captchaToken) { openCaptchaModal('login'); return; }
    await executeLogin();
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (!regName.trim()) { setError('Vui lòng nhập tên hiển thị.'); return; }
    if (!regEmail.trim()) { setError('Vui lòng nhập email.'); return; }
    const pwdErr = validatePassword(regPassword, regName.trim(), regEmail.trim());
    if (pwdErr) { setError(pwdErr); return; }
    if (regPassword !== regConfirmPassword) { setError('Mật khẩu nhập lại không khớp.'); return; }
    if (RECAPTCHA_SITE_KEY && !captchaToken) { openCaptchaModal('register'); return; }
    await executeRegister();
  };

  const handleGoogleSignIn = async () => {
    setError('');
    if (RECAPTCHA_SITE_KEY && !captchaToken) { openCaptchaModal('google'); return; }
    await executeGooglePost();
  };

  const switchMode = (to: 'login' | 'register') => {
    setError('');
    setMode(to);
    navigate(to === 'register' ? '/register' : '/login', { replace: true });
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <AuthBackground />

      <div className="auth-entrance relative z-10 w-full max-w-5xl mx-4 flex flex-col md:flex-row items-center gap-8 md:gap-12 lg:gap-20 py-8">
        {/* Left: Logo */}
        <div className="flex flex-col items-center md:flex-1 auth-logo-side">
          <Link to="/" className="group">
            <img
              src="/SurfLogo.png"
              alt="Surf"
              className="h-28 md:h-64 lg:h-80 w-auto object-contain drop-shadow-[0_0_40px_rgba(6,182,212,0.3)] group-hover:drop-shadow-[0_0_60px_rgba(6,182,212,0.5)] transition-all duration-500 group-hover:scale-105"
            />
          </Link>
          <p className="hidden md:block text-white/50 text-center mt-6 max-w-xs text-lg leading-relaxed">
            Kết nối, chia sẻ và khám phá thế giới cùng <span className="text-cyan-400 font-semibold">Surf</span>
          </p>
        </div>

        {/* Right: Auth card */}
        <div className="w-full max-w-md">
          <div className="auth-glass rounded-3xl p-7 md:p-8">
            {/* Mode tabs */}
            <div className="flex bg-white/[0.06] rounded-2xl p-1 mb-6">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
                  mode === 'login'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/20'
                    : 'text-white/50 hover:text-white/80'
                }`}
              >
                Đăng nhập
              </button>
              <button
                type="button"
                onClick={() => switchMode('register')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${
                  mode === 'register'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/20'
                    : 'text-white/50 hover:text-white/80'
                }`}
              >
                Đăng ký
              </button>
            </div>

            {/* ─── Sliding content ────────────────────────────────────── */}
            <div className="relative overflow-hidden">
              {/* Login */}
              <div className={`auth-slide ${mode === 'login' ? 'auth-slide-active' : 'auth-slide-left'}`}>
                <form ref={loginFormRef} onSubmit={handleLoginSubmit} autoComplete={rememberMe ? 'on' : 'off'} className="flex flex-col gap-3.5">
                  <div>
                    <label className="block text-xs font-medium text-white/50 mb-1.5 ml-1">Email</label>
                    <input
                      type="email" name="login-email"
                      autoComplete={rememberMe ? 'username' : 'one-time-code'}
                      placeholder="you@example.com"
                      value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)}
                      className={INPUT} required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/50 mb-1.5 ml-1">Mật khẩu</label>
                    <PasswordInput value={loginPassword} onChange={setLoginPassword} placeholder="••••••••" autoComplete={rememberMe ? 'current-password' : 'new-password'} />
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox" checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="w-4 h-4 rounded border-white/20 bg-white/10 text-cyan-500 focus:ring-cyan-400/50 accent-cyan-500"
                      />
                      <span className="text-sm text-white/50">Ghi nhớ</span>
                    </label>
                    <Link to="/forgot-password" className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors">
                      Quên mật khẩu?
                    </Link>
                  </div>

                  <button type="submit" disabled={loading} className={BTN_PRIMARY}>
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        Đang xử lý...
                      </span>
                    ) : 'Đăng nhập'}
                  </button>
                </form>

                <div className="flex items-center gap-3 my-5">
                  <span className="flex-1 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                  <span className="text-xs text-white/30 uppercase tracking-widest">hoặc</span>
                  <span className="flex-1 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                </div>

                <button
                  type="button" onClick={handleGoogleSignIn} disabled={loading}
                  className="w-full flex items-center justify-center gap-2.5 py-3 rounded-xl bg-white/[0.07] border border-white/[0.12] hover:bg-white/[0.12] transition-all duration-200 disabled:opacity-50 text-white/80 font-medium"
                >
                  <GoogleIcon /> Đăng nhập với Google
                </button>

                {mode === 'login' && <ErrorBanner message={error} />}
              </div>

              {/* Register */}
              <div className={`auth-slide ${mode === 'register' ? 'auth-slide-active' : 'auth-slide-right'}`}>
                <form onSubmit={handleRegisterSubmit} className="flex flex-col gap-3">
                  <div>
                    <label className="block text-xs font-medium text-white/50 mb-1.5 ml-1">Tên hiển thị</label>
                    <input type="text" placeholder="Nguyễn Văn A" value={regName} onChange={(e) => setRegName(e.target.value)} className={INPUT} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/50 mb-1.5 ml-1">Email</label>
                    <input type="email" autoComplete="email" placeholder="you@example.com" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} className={INPUT} required />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/50 mb-1.5 ml-1">Mật khẩu</label>
                    <PasswordInput value={regPassword} onChange={setRegPassword} placeholder="Ít nhất 6 ký tự" autoComplete="new-password" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/50 mb-1.5 ml-1">Nhập lại mật khẩu</label>
                    <PasswordInput value={regConfirmPassword} onChange={setRegConfirmPassword} placeholder="Xác nhận mật khẩu" autoComplete="new-password" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/50 mb-1.5 ml-1">Số điện thoại <span className="text-white/30">(tuỳ chọn)</span></label>
                    <div className="flex gap-2">
                      <select
                        value={regPhoneCountry} onChange={(e) => setRegPhoneCountry(e.target.value)}
                        className="w-28 px-2 py-3 rounded-xl bg-white/[0.07] border border-white/[0.12] text-white/80 focus:outline-none focus:ring-2 focus:ring-cyan-400/60 text-sm"
                      >
                        {PHONE_COUNTRIES.map(({ iso, code }) => (
                          <option key={iso} value={iso}>{iso} ({code})</option>
                        ))}
                      </select>
                      <input
                        type="tel" placeholder="Số điện thoại"
                        value={regPhone} onChange={(e) => setRegPhone(e.target.value.replace(/\D/g, ''))}
                        className={`${INPUT} flex-1`}
                      />
                    </div>
                  </div>
                  <button type="submit" disabled={loading} className={`${BTN_PRIMARY} mt-1`}>
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        Đang xử lý...
                      </span>
                    ) : 'Tạo tài khoản'}
                  </button>
                </form>
                {mode === 'register' && <ErrorBanner message={error} />}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CAPTCHA Modal */}
      {showCaptchaModal && RECAPTCHA_SITE_KEY && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={closeCaptchaModal}>
          <div className="auth-glass rounded-2xl p-6 flex flex-col items-center gap-4 mx-4 auth-entrance" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-white/80">
              <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span className="font-medium">Xác nhận bạn không phải robot</span>
            </div>
            <div ref={captchaModalRef} />
            <button type="button" onClick={closeCaptchaModal} className="text-sm text-white/40 hover:text-white/70 transition-colors">Hủy</button>
          </div>
        </div>
      )}
    </div>
  );
}
