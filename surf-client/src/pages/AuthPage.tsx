import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { signIn, signInWithGoogle, signUp, setAuthPersistence } from '@/lib/firebase/auth';
import { syncUserProfile } from '@/lib/api';
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
  'auth/user-not-found': 'Tài khoản không tồn tại. Vui lòng kiểm tra lại email.',
  'auth/wrong-password': 'Mật khẩu không đúng. Vui lòng thử lại.',
  'auth/invalid-credential': 'Email hoặc mật khẩu không đúng.',
  'auth/invalid-login-credentials': 'Email hoặc mật khẩu không đúng.',
  'auth/too-many-requests': 'Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau.',
  'auth/email-already-in-use': 'Email này đã được sử dụng.',
  'auth/weak-password': 'Mật khẩu quá yếu.',
  'auth/operation-not-allowed': 'Phương thức đăng nhập chưa được bật.',
  'auth/network-request-failed': 'Lỗi kết nối mạng. Vui lòng kiểm tra internet.',
  'auth/internal-error': 'Lỗi máy chủ. Vui lòng thử lại sau.',
  'auth/popup-closed-by-user': 'Bạn đã đóng cửa sổ đăng nhập.',
  'auth/popup-blocked': 'Popup bị chặn. Cho phép popup cho trang này.',
  'auth/cancelled-popup-request': 'Đã có yêu cầu đăng nhập khác.',
  'auth/account-exists-with-different-credential':
    'Email đã liên kết với phương thức đăng nhập khác.',
};

function validatePassword(password: string, name: string, email: string): string | null {
  if (password.length < 6) return 'Mật khẩu cần ít nhất 6 ký tự.';
  if (!/[A-Z]/.test(password)) return 'Mật khẩu cần ít nhất 1 chữ cái viết hoa.';
  if (!/[0-9]/.test(password)) return 'Mật khẩu cần ít nhất 1 chữ số.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Mật khẩu cần ít nhất 1 ký tự đặc biệt.';
  if (name && password.toLowerCase() === name.toLowerCase())
    return 'Mật khẩu không được trùng với tên đăng nhập.';
  if (email && password.toLowerCase() === email.toLowerCase())
    return 'Mật khẩu không được trùng với email.';
  return null;
}

const inputClass =
  'w-full px-4 py-2.5 rounded-xl bg-white/70 dark:bg-white/10 border border-white/30 dark:border-white/20 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent backdrop-blur-sm transition-all';

/* Bubbles rendered as background */
const BUBBLES = [
  {
    className: 'auth-bubble-1',
    size: 180,
    top: '5%',
    left: '8%',
    bg: 'radial-gradient(circle at 30% 30%, rgba(14,165,233,0.35), rgba(6,182,212,0.10))',
  },
  {
    className: 'auth-bubble-2',
    size: 120,
    top: '60%',
    left: '75%',
    bg: 'radial-gradient(circle at 30% 30%, rgba(6,182,212,0.30), rgba(14,165,233,0.08))',
  },
  {
    className: 'auth-bubble-3',
    size: 90,
    top: '25%',
    left: '85%',
    bg: 'radial-gradient(circle at 30% 30%, rgba(56,189,248,0.30), rgba(14,165,233,0.06))',
  },
  {
    className: 'auth-bubble-4',
    size: 200,
    top: '70%',
    left: '5%',
    bg: 'radial-gradient(circle at 30% 30%, rgba(14,165,233,0.25), rgba(6,182,212,0.08))',
  },
  {
    className: 'auth-bubble-5',
    size: 70,
    top: '10%',
    left: '50%',
    bg: 'radial-gradient(circle at 30% 30%, rgba(6,182,212,0.35), rgba(56,189,248,0.10))',
  },
  {
    className: 'auth-bubble-6',
    size: 140,
    top: '45%',
    left: '30%',
    bg: 'radial-gradient(circle at 30% 30%, rgba(56,189,248,0.20), rgba(14,165,233,0.06))',
  },
  {
    className: 'auth-bubble-7',
    size: 60,
    top: '80%',
    left: '55%',
    bg: 'radial-gradient(circle at 30% 30%, rgba(14,165,233,0.40), rgba(6,182,212,0.10))',
  },
  {
    className: 'auth-bubble-8',
    size: 100,
    top: '35%',
    left: '65%',
    bg: 'radial-gradient(circle at 30% 30%, rgba(6,182,212,0.25), rgba(56,189,248,0.08))',
  },
];

const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

export default function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isRegister = location.pathname === '/register';
  const [isFlipped, setIsFlipped] = useState(isRegister);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPhoneCountry, setRegPhoneCountry] = useState('VN');
  const [regPhone, setRegPhone] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showLoginPwd, setShowLoginPwd] = useState(false);
  const [showRegPwd, setShowRegPwd] = useState(false);
  const [showRegConfirmPwd, setShowRegConfirmPwd] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [showCaptchaModal, setShowCaptchaModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<'login' | 'register' | 'google' | null>(null);
  const captchaModalRef = useRef<HTMLDivElement>(null);
  const captchaWidgetId = useRef<number | null>(null);
  const loginFormRef = useRef<HTMLFormElement>(null);

  // Xóa sạch form khi component mount (đăng xuất quay lại)
  useEffect(() => {
    setLoginEmail('');
    setLoginPassword('');
    setRegEmail('');
    setRegPassword('');
    setRegConfirmPassword('');
    setRegName('');
    setRegPhone('');
    setError('');
    // Force reset native form để trình duyệt không autofill
    loginFormRef.current?.reset();
  }, []);

  useEffect(() => {
    setIsFlipped(isRegister);
  }, [isRegister]);

  // Render reCAPTCHA widget inside modal when it opens
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
          theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
        });
        return true;
      } catch {
        return false;
      }
    };
    let interval: ReturnType<typeof setInterval> | null = null;
    // Use grecaptcha.ready if available, otherwise fall back to polling
    if (window.grecaptcha?.ready) {
      window.grecaptcha.ready(() => {
        if (!cancelled) tryRender();
      });
    }
    const timer = setTimeout(() => {
      if (!tryRender()) {
        interval = setInterval(() => {
          if (tryRender()) {
            clearInterval(interval!);
            interval = null;
          }
        }, 200);
        setTimeout(() => {
          if (interval) {
            clearInterval(interval);
            interval = null;
          }
        }, 10000);
      }
    }, 50);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };
  }, [showCaptchaModal]);

  const openCaptchaModal = (action: 'login' | 'register' | 'google') => {
    setCaptchaToken('');
    setPendingAction(action);
    setShowCaptchaModal(true);
  };

  const closeCaptchaModal = () => {
    setShowCaptchaModal(false);
    setPendingAction(null);
    setCaptchaToken('');
  };

  const executeLogin = async () => {
    setLoading(true);
    try {
      await setAuthPersistence(rememberMe);
      const result = await signIn(loginEmail.trim(), loginPassword);
      const token = await result.user.getIdToken();
      console.log('🔑 Token ready, length:', token.length);
      await new Promise((resolve) => setTimeout(resolve, 800));
      await syncUserProfile();
      // Xóa thông tin form nếu không ghi nhớ
      if (!rememberMe) {
        setLoginEmail('');
        setLoginPassword('');
      }
      setShowCaptchaModal(false);
      navigate('/feed', { replace: true });
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
      console.error('❌ Login error code:', code, err);
      setError(ERRORS[code] || 'Đăng nhập thất bại. Vui lòng kiểm tra email và mật khẩu.');
      closeCaptchaModal();
    } finally {
      setLoading(false);
    }
  };

  const executeRegister = async () => {
    setLoading(true);
    try {
      const result = await signUp(regEmail.trim(), regPassword, regName.trim());
      const token = await result.user.getIdToken();
      console.log('🔑 Token ready, length:', token.length);
      await new Promise((resolve) => setTimeout(resolve, 800));
      await syncUserProfile();
      setShowCaptchaModal(false);
      navigate('/feed', { replace: true });
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
      setError(ERRORS[code] || 'Đăng ký thất bại.');
      closeCaptchaModal();
    } finally {
      setLoading(false);
    }
  };

  const executeGooglePost = async () => {
    setLoading(true);
    try {
      const result = await signInWithGoogle();
      const token = await result.user.getIdToken();
      console.log('\ud83d\udd11 Token ready, length:', token.length);
      await new Promise((resolve) => setTimeout(resolve, 800));
      await syncUserProfile();
      setShowCaptchaModal(false);
      navigate('/feed', { replace: true });
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
      // Popup đóng / hủy / 2FA thoát giữa chừng → bỏ qua, không hiện lỗi
      if (
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request' ||
        code === 'auth/popup-blocked' ||
        code === 'auth/user-cancelled' ||
        code === 'auth/multi-factor-auth-required'
      ) {
        closeCaptchaModal();
        setLoading(false);
        return;
      }
      setError(ERRORS[code] || '\u0110\u0103ng nh\u1eadp Google th\u1ea5t b\u1ea1i.');
      closeCaptchaModal();
    } finally {
      setLoading(false);
    }
  };

  // Auto-execute pending action after CAPTCHA is verified
  useEffect(() => {
    if (!captchaToken || !pendingAction) return;
    if (pendingAction === 'login') executeLogin();
    else if (pendingAction === 'register') executeRegister();
    else if (pendingAction === 'google') executeGooglePost();
  }, [captchaToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (RECAPTCHA_SITE_KEY && !captchaToken) {
      openCaptchaModal('login');
      return;
    }
    await executeLogin();
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!regName.trim()) {
      setError('Vui lòng nhập tên hiển thị.');
      return;
    }
    if (!regEmail.trim()) {
      setError('Vui lòng nhập email.');
      return;
    }
    const pwdError = validatePassword(regPassword, regName.trim(), regEmail.trim());
    if (pwdError) {
      setError(pwdError);
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setError('Mật khẩu nhập lại không khớp.');
      return;
    }
    if (RECAPTCHA_SITE_KEY && !captchaToken) {
      openCaptchaModal('register');
      return;
    }
    await executeRegister();
  };

  async function handleGoogleSignIn() {
    setError('');
    if (RECAPTCHA_SITE_KEY && !captchaToken) {
      openCaptchaModal('google');
      return;
    }
    await executeGooglePost();
  }

  const goRegister = () => {
    setError('');
    setIsFlipped(true);
    navigate('/register', { replace: true });
  };
  const goLogin = () => {
    setError('');
    setIsFlipped(false);
    navigate('/login', { replace: true });
  };

  return (
    <div className="relative min-h-screen overflow-hidden flex items-center justify-center bg-gradient-to-br from-sky-100 via-cyan-50 to-blue-100 dark:from-slate-900 dark:via-cyan-950 dark:to-slate-900">
      {/* Floating glossy bubbles background */}
      {BUBBLES.map((b, i) => (
        <div
          key={i}
          className={`auth-bubble ${b.className}`}
          style={{
            width: b.size,
            height: b.size,
            top: b.top,
            left: b.left,
            background: b.bg,
            boxShadow: `inset -8px -8px 20px rgba(255,255,255,0.25), inset 4px 4px 12px rgba(255,255,255,0.15), 0 8px 32px rgba(14,165,233,0.10)`,
          }}
        />
      ))}

      {/* Card container – burst from center, md: logo bên trái + card bên phải */}
      <div className="auth-card-burst relative z-10 w-full max-w-4xl mx-4 flex flex-col md:flex-row items-center md:gap-12 lg:gap-16">
        {/* Logo – ẩn trên mobile, hiện ngang trên md+ */}
        <div className="hidden md:flex flex-1 flex-col items-center justify-center">
          <Link to="/">
            <img
              src="/SurfLogo.png"
              alt="Surf"
              className="h-80 lg:h-96 w-auto object-contain drop-shadow-lg"
            />
          </Link>
          <p className="text-gray-600 dark:text-gray-300 text-base lg:text-lg text-center mt-4 max-w-xs">
            Surf giúp bạn kết nối và chia sẻ với mọi người trong cuộc sống.
          </p>
        </div>

        {/* Flip card */}
        <div className="auth-flip-container w-full max-w-md">
          <div className={`auth-flip-inner ${isFlipped ? 'flipped' : ''}`}>
            {/* ====== FRONT: Đăng nhập ====== */}
            <div className="auth-flip-face rounded-2xl p-6 md:p-8 flex flex-col bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl border border-white/40 dark:border-white/10 shadow-[0_8px_40px_rgba(14,165,233,0.15)]">
              <h2 className="text-2xl font-bold text-center bg-gradient-to-r from-surf-primary to-surf-secondary bg-clip-text text-transparent mb-5">
                Đăng nhập
              </h2>

              <form
                ref={loginFormRef}
                onSubmit={handleLoginSubmit}
                autoComplete={rememberMe ? 'on' : 'off'}
                className="flex flex-col gap-3.5"
              >
                <input
                  type="email"
                  name="login-email"
                  autoComplete={rememberMe ? 'username' : 'one-time-code'}
                  placeholder="Email đăng nhập"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className={inputClass}
                  required
                />
                <div className="relative">
                  <input
                    type={showLoginPwd ? 'text' : 'password'}
                    name="login-password"
                    autoComplete={rememberMe ? 'current-password' : 'new-password'}
                    placeholder="Mật khẩu"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className={`${inputClass} pr-11`}
                    required
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onMouseDown={() => setShowLoginPwd(true)}
                    onMouseUp={() => setShowLoginPwd(false)}
                    onMouseLeave={() => setShowLoginPwd(false)}
                    onTouchStart={() => setShowLoginPwd(true)}
                    onTouchEnd={() => setShowLoginPwd(false)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors select-none"
                  >
                    {showLoginPwd ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9.27-3.11-11-7.5a11.7 11.7 0 013.168-4.477M6.343 6.343A9.97 9.97 0 0112 5c5 0 9.27 3.11 11 7.5a11.7 11.7 0 01-4.168 4.477M6.343 6.343L3 3m3.343 3.343l2.829 2.829m4.486 4.486l2.829 2.829M6.343 6.343l11.314 11.314M14.121 14.121A3 3 0 009.879 9.879"
                        />
                      </svg>
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    )}
                  </button>
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-cyan-500 focus:ring-cyan-400 accent-cyan-500"
                  />
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    Ghi nhớ đăng nhập
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-surf-primary to-surf-secondary hover:shadow-lg hover:shadow-cyan-500/25 transition-all disabled:opacity-50"
                >
                  {loading ? 'Đang xử lý...' : 'Đăng nhập'}
                </button>
              </form>

              <Link
                to="/forgot-password"
                className="text-center text-sm text-surf-primary hover:underline mt-3"
              >
                Quên mật khẩu?
              </Link>

              <div className="flex items-center gap-3 my-4">
                <span className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-600 to-transparent" />
                <span className="text-xs text-gray-400 uppercase tracking-wider">hoặc</span>
                <span className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-600 to-transparent" />
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white dark:bg-slate-700 border border-gray-200 dark:border-gray-600 hover:shadow-md transition-all disabled:opacity-50 text-gray-700 dark:text-gray-200 font-medium"
              >
                <GoogleIcon />
                Đăng nhập với Google
              </button>

              {error && !isFlipped && (
                <div className="flex items-center gap-2 mt-3 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 animate-[shake_0.3s_ease-in-out]">
                  <svg
                    className="w-5 h-5 text-red-500 dark:text-red-400 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <p className="text-red-600 dark:text-red-400 text-sm font-medium">{error}</p>
                </div>
              )}

              <div className="mt-5 pt-4 border-t border-gray-200/50 dark:border-gray-600/30 text-center">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Chưa có tài khoản?{' '}
                </span>
                <button
                  type="button"
                  onClick={goRegister}
                  className="text-sm font-semibold text-surf-primary hover:text-cyan-600 dark:hover:text-cyan-300 hover:underline transition-colors"
                >
                  Đăng ký ngay
                </button>
              </div>
            </div>

            {/* ====== BACK: Đăng ký ====== */}
            <div className="auth-flip-face back rounded-2xl p-6 md:p-8 flex flex-col bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl border border-white/40 dark:border-white/10 shadow-[0_8px_40px_rgba(14,165,233,0.15)]">
              <h2 className="text-2xl font-bold text-center bg-gradient-to-r from-surf-primary to-surf-secondary bg-clip-text text-transparent mb-5">
                Tạo tài khoản
              </h2>

              <form onSubmit={handleRegisterSubmit} className="flex flex-col gap-3.5">
                <input
                  type="text"
                  placeholder="Tên hiển thị"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  className={inputClass}
                />
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="Email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  className={inputClass}
                  required
                />
                <div className="relative">
                  <input
                    type={showRegPwd ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Mật khẩu (ít nhất 6 ký tự)"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    className={`${inputClass} pr-11`}
                    required
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onMouseDown={() => setShowRegPwd(true)}
                    onMouseUp={() => setShowRegPwd(false)}
                    onMouseLeave={() => setShowRegPwd(false)}
                    onTouchStart={() => setShowRegPwd(true)}
                    onTouchEnd={() => setShowRegPwd(false)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors select-none"
                  >
                    {showRegPwd ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9.27-3.11-11-7.5a11.7 11.7 0 013.168-4.477M6.343 6.343A9.97 9.97 0 0112 5c5 0 9.27 3.11 11 7.5a11.7 11.7 0 01-4.168 4.477M6.343 6.343L3 3m3.343 3.343l2.829 2.829m4.486 4.486l2.829 2.829M6.343 6.343l11.314 11.314M14.121 14.121A3 3 0 009.879 9.879"
                        />
                      </svg>
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    )}
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showRegConfirmPwd ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Nhập lại mật khẩu"
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    className={`${inputClass} pr-11`}
                    required
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onMouseDown={() => setShowRegConfirmPwd(true)}
                    onMouseUp={() => setShowRegConfirmPwd(false)}
                    onMouseLeave={() => setShowRegConfirmPwd(false)}
                    onTouchStart={() => setShowRegConfirmPwd(true)}
                    onTouchEnd={() => setShowRegConfirmPwd(false)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors select-none"
                  >
                    {showRegConfirmPwd ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9.27-3.11-11-7.5a11.7 11.7 0 013.168-4.477M6.343 6.343A9.97 9.97 0 0112 5c5 0 9.27 3.11 11 7.5a11.7 11.7 0 01-4.168 4.477M6.343 6.343L3 3m3.343 3.343l2.829 2.829m4.486 4.486l2.829 2.829M6.343 6.343l11.314 11.314M14.121 14.121A3 3 0 009.879 9.879"
                        />
                      </svg>
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    )}
                  </button>
                </div>
                <div className="flex gap-2">
                  <select
                    value={regPhoneCountry}
                    onChange={(e) => setRegPhoneCountry(e.target.value)}
                    className="w-40 px-2 py-2.5 rounded-xl bg-white/70 dark:bg-white/10 border border-white/30 dark:border-white/20 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-400 backdrop-blur-sm text-sm"
                  >
                    {PHONE_COUNTRIES.map(({ iso, name, code }) => (
                      <option key={iso} value={iso}>
                        {iso} ({code}) {name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    placeholder={`${PHONE_COUNTRIES.find((c) => c.iso === regPhoneCountry)?.code || '+84'} Số điện thoại`}
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value.replace(/\D/g, ''))}
                    className={`${inputClass} flex-1`}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-surf-primary to-surf-secondary hover:shadow-lg hover:shadow-cyan-500/25 transition-all disabled:opacity-50"
                >
                  {loading ? 'Đang xử lý...' : 'Đăng ký'}
                </button>
              </form>

              {/* <div className="flex items-center gap-3 my-4">
                <span className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-600 to-transparent" />
                <span className="text-xs text-gray-400 uppercase tracking-wider">hoặc</span>
                <span className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-600 to-transparent" />
              </div> */}

              {/* <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white dark:bg-slate-700 border border-gray-200 dark:border-gray-600 hover:shadow-md transition-all disabled:opacity-50 text-gray-700 dark:text-gray-200 font-medium"
              >
                <GoogleIcon />
                Đăng ký với Google
              </button> */}

              {error && isFlipped && (
                <div className="flex items-center gap-2 mt-3 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 animate-[shake_0.3s_ease-in-out]">
                  <svg
                    className="w-5 h-5 text-red-500 dark:text-red-400 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <p className="text-red-600 dark:text-red-400 text-sm font-medium">{error}</p>
                </div>
              )}

              <div className="mt-5 pt-4 border-t border-gray-200/50 dark:border-gray-600/30 text-center">
                <span className="text-sm text-gray-500 dark:text-gray-400">Đã có tài khoản? </span>
                <button
                  type="button"
                  onClick={goLogin}
                  className="text-sm font-semibold text-surf-primary hover:text-cyan-600 dark:hover:text-cyan-300 hover:underline transition-colors"
                >
                  Đăng nhập
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CAPTCHA verification modal */}
      {showCaptchaModal && RECAPTCHA_SITE_KEY && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={closeCaptchaModal}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col items-center gap-4 mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-gray-700 dark:text-gray-200">
              <svg
                className="w-5 h-5 text-cyan-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
              <span className="font-medium">Xác nhận bạn không phải robot</span>
            </div>
            <div ref={captchaModalRef} />
            <button
              type="button"
              onClick={closeCaptchaModal}
              className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              Hủy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
