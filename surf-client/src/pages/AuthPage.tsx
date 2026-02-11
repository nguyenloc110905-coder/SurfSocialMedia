import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { signIn, signInWithGoogle, signUp } from '@/lib/firebase/auth';
import { useAuthStore } from '@/stores/authStore';

const ERRORS: Record<string, string> = {
  'auth/invalid-email': 'Email không hợp lệ.',
  'auth/user-disabled': 'Tài khoản đã bị vô hiệu hóa.',
  'auth/user-not-found': 'Không tìm thấy tài khoản.',
  'auth/wrong-password': 'Mật khẩu không đúng.',
  'auth/email-already-in-use': 'Email này đã được sử dụng.',
  'auth/weak-password': 'Mật khẩu quá yếu.',
  'auth/operation-not-allowed': 'Phương thức đăng nhập chưa được bật.',
  'auth/network-request-failed': 'Lỗi mạng. Kiểm tra kết nối.',
  'auth/popup-closed-by-user': 'Bạn đã đóng cửa sổ đăng nhập.',
  'auth/popup-blocked': 'Popup bị chặn. Cho phép popup cho trang này.',
  'auth/cancelled-popup-request': 'Đã có yêu cầu đăng nhập khác.',
};

/** Mật khẩu: ≥6 ký tự, 1 hoa, 1 số, 1 ký tự đặc biệt, khác tên và email. */
function validatePassword(password: string, name: string, email: string): string | null {
  if (password.length < 6) return 'Mật khẩu cần ít nhất 6 ký tự.';
  if (!/[A-Z]/.test(password)) return 'Mật khẩu cần ít nhất 1 chữ cái viết hoa.';
  if (!/[0-9]/.test(password)) return 'Mật khẩu cần ít nhất 1 chữ số.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Mật khẩu cần ít nhất 1 ký tự đặc biệt.';
  if (name && password.toLowerCase() === name.toLowerCase()) return 'Mật khẩu không được trùng với tên đăng nhập.';
  if (email && password.toLowerCase() === email.toLowerCase()) return 'Mật khẩu không được trùng với email.';
  return null;
}

const PHONE_COUNTRY = [
  { code: '+84', label: 'VN +84' },
  { code: '+1', label: 'US/CA +1' },
  { code: '+44', label: 'UK +44' },
  { code: '+81', label: 'JP +81' },
  { code: '+82', label: 'KR +82' },
  { code: '+86', label: 'CN +86' },
  { code: '+65', label: 'SG +65' },
  { code: '+66', label: 'TH +66' },
  { code: '+60', label: 'MY +60' },
  { code: '+62', label: 'ID +62' },
  { code: '+63', label: 'PH +63' },
  { code: '+64', label: 'NZ +64' },
  { code: '+61', label: 'AU +61' },
  { code: '+91', label: 'IN +91' },
  { code: '+33', label: 'FR +33' },
  { code: '+49', label: 'DE +49' },
  { code: '+39', label: 'IT +39' },
  { code: '+34', label: 'ES +34' },
  { code: '+31', label: 'NL +31' },
  { code: '+7', label: 'RU/KZ +7' },
  { code: '+90', label: 'TR +90' },
  { code: '+55', label: 'BR +55' },
  { code: '+52', label: 'MX +52' },
  { code: '+54', label: 'AR +54' },
  { code: '+56', label: 'CL +56' },
  { code: '+57', label: 'CO +57' },
  { code: '+51', label: 'PE +51' },
  { code: '+971', label: 'AE +971' },
  { code: '+966', label: 'SA +966' },
  { code: '+20', label: 'EG +20' },
  { code: '+27', label: 'ZA +27' },
] as const;

const inputClass =
  'w-full px-4 py-2.5 rounded-lg bg-[#E8F0FE] dark:bg-gray-800 border border-transparent dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-surf-primary focus:border-transparent';

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
  const [regPhoneCountry, setRegPhoneCountry] = useState('+84');
  const [regPhone, setRegPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setIsFlipped(isRegister);
  }, [isRegister]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(loginEmail.trim(), loginPassword);
      navigate('/feed', { replace: true });
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
      setError(ERRORS[code] || 'Đăng nhập thất bại.');
    } finally {
      setLoading(false);
    }
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
    setLoading(true);
    try {
      await signUp(regEmail.trim(), regPassword, regName.trim());
      navigate('/feed', { replace: true });
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
      setError(ERRORS[code] || 'Đăng ký thất bại.');
    } finally {
      setLoading(false);
    }
  };

  async function handleGoogleSignIn() {
    setError('');
    setLoading(true);
    try {
      await signInWithGoogle();
      navigate('/feed', { replace: true });
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
      setError(ERRORS[code] || 'Đăng nhập Google thất bại.');
    } finally {
      setLoading(false);
    }
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
    <div className="min-h-screen bg-gray-100 dark:bg-surf-dark flex flex-col md:flex-row items-center justify-center md:justify-center md:gap-12 lg:gap-16 md:px-12 lg:px-20 py-8 gap-8">
      {/* Cột trái: Logo + slogan - nhích lên phía 12h */}
      <div className="landing-logo-drop flex flex-1 flex-col justify-center items-center w-full md:max-w-xl pt-12 md:pt-0 md:pb-32">
        <div className="flex flex-col items-center text-center">
          <Link to="/" className="inline-block mb-5 md:mb-6">
            <img
              src="/SurfLogo.png"
              alt="Surf"
              className="h-40 sm:h-48 md:h-52 lg:h-60 w-auto object-contain"
            />
          </Link>
          <p className="text-gray-800 dark:text-gray-200 text-base sm:text-lg md:text-xl lg:text-2xl leading-relaxed max-w-sm md:max-w-md">
            Surf giúp bạn kết nối và chia sẻ với mọi người trong cuộc sống của bạn.
          </p>
        </div>
      </div>

      {/* Cột phải: Thẻ lật */}
      <div className="landing-cta-slide-up w-full max-w-md">
        <div className="auth-flip-container w-full">
          <div className={`auth-flip-inner ${isFlipped ? 'flipped' : ''}`}>
            {/* Mặt trước: Đăng nhập */}
            <div className="auth-flip-face bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-xl rounded-xl p-6 flex flex-col">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Đăng nhập</h2>
              <form onSubmit={handleLoginSubmit} className="flex flex-col gap-3">
                <input
                  type="email"
                  autoComplete="username"
                  placeholder="Email hoặc số điện thoại"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className={inputClass}
                  required
                />
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder="Mật khẩu"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className={inputClass}
                  required
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-lg font-semibold bg-surf-primary text-white hover:bg-surf-primary/90 transition-colors disabled:opacity-50"
                >
                  Đăng nhập
                </button>
                <Link to="/forgot-password" className="text-center text-sm text-surf-primary hover:underline">
                  Quên mật khẩu?
                </Link>
              </form>
              <button
                type="button"
                onClick={goRegister}
                className="w-full mt-4 py-2.5 rounded-lg font-semibold border-2 border-green-500 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
              >
                Tạo tài khoản mới
              </button>
              <div className="flex items-center gap-3 my-4">
                <span className="flex-1 h-px bg-gray-200 dark:bg-gray-600" />
                <span className="text-sm text-gray-500">hoặc</span>
                <span className="flex-1 h-px bg-gray-200 dark:bg-gray-600" />
              </div>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Đăng nhập với Google
              </button>
              {error && <p className="text-red-600 dark:text-red-400 text-sm mt-2">{error}</p>}
            </div>

            {/* Mặt sau: Đăng ký */}
            <div className="auth-flip-face back bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-xl rounded-xl p-6 flex flex-col">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Đăng ký</h2>
              <form onSubmit={handleRegisterSubmit} className="flex flex-col gap-3">
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
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Mật khẩu (ít nhất 6 ký tự)"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  className={inputClass}
                  required
                />
                <div className="flex gap-2">
                  <select
                    value={regPhoneCountry}
                    onChange={(e) => setRegPhoneCountry(e.target.value)}
                    className="w-28 px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-surf-primary"
                  >
                    {PHONE_COUNTRY.map(({ code, label }) => (
                      <option key={code} value={code}>{label}</option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    placeholder="Số điện thoại"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value.replace(/\D/g, ''))}
                    className={`${inputClass} flex-1`}
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-lg font-semibold bg-surf-primary text-white hover:bg-surf-primary/90 transition-colors disabled:opacity-50"
                >
                  Đăng ký
                </button>
              </form>
              <button
                type="button"
                onClick={goLogin}
                className="w-full mt-4 py-2.5 rounded-lg font-semibold border-2 border-green-500 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
              >
                Đã có tài khoản? Đăng nhập
              </button>
              <div className="flex items-center gap-3 my-4">
                <span className="flex-1 h-px bg-gray-200 dark:bg-gray-600" />
                <span className="text-sm text-gray-500">hoặc</span>
                <span className="flex-1 h-px bg-gray-200 dark:bg-gray-600" />
              </div>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Đăng ký với Google
              </button>
              {error && <p className="text-red-600 dark:text-red-400 text-sm mt-2">{error}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
