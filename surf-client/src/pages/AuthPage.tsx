import { useState, useEffect, useRef } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  signIn,
  signInWithGoogle,
  signInWithFacebook,
  getFacebookRedirectResult,
  signUp,
  setAuthPersistence,
  markTabAuthAction,
  auth,
} from '@/lib/firebase/auth';
import { fetchSignInMethodsForEmail, signInWithCustomToken } from 'firebase/auth';
import { syncUserProfile, api } from '@/lib/api';
import { PHONE_COUNTRIES } from '@/lib/phone-countries';

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

function getAuthErrorMessage(err: unknown, fallback: string) {
  const code =
    err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
  return ERRORS[code] || fallback;
}

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
const PARTICLES = Array.from({ length: 20 }, () => ({
  left: `${Math.random() * 100}%`,
  top: `${Math.random() * 100}%`,
  animationDelay: `${Math.random() * 8}s`,
  animationDuration: `${6 + Math.random() * 8}s`,
  width: `${2 + Math.random() * 3}px`,
  height: `${2 + Math.random() * 3}px`,
}));

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
      {PARTICLES.map((style, i) => (
        <div key={i} className="auth-particle" style={style} />
      ))}
    </div>
  );
}

/* ─── SVG Icons ────────────────────────────────────────────────────────── */
const FacebookIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#fff">
    <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
  </svg>
);

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

const EyeIcon = ({ open }: { open: boolean }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="w-5 h-5"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    {open ? (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9.27-3.11-11-7.5a11.7 11.7 0 013.168-4.477M6.343 6.343A9.97 9.97 0 0112 5c5 0 9.27 3.11 11 7.5a11.7 11.7 0 01-4.168 4.477M6.343 6.343L3 3m3.343 3.343l2.829 2.829m4.486 4.486l2.829 2.829M6.343 6.343l11.314 11.314M14.121 14.121A3 3 0 009.879 9.879"
      />
    ) : (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
        />
      </>
    )}
  </svg>
);

/* ─── Shared UI tokens ─────────────────────────────────────────────────── */
const INPUT =
  'w-full px-4 py-3 rounded-xl bg-[#1e293b] border border-white/10 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-surf-primary/60 focus:border-transparent transition-all duration-200';

const BTN_PRIMARY =
  'w-full py-3 rounded-xl font-bold text-white bg-surf-primary shadow-[0_0_40px_rgba(14,165,233,0.15)] hover:bg-surf-secondary transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2';

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
      <svg
        className="w-5 h-5 text-red-400 flex-shrink-0"
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
      <p className="text-red-300 text-sm font-medium">{message}</p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

const TypewriterText = ({ text, className = '', delayStart = 0 }: { text: string, className?: string, delayStart?: number }) => {
  return (
    <span className={className}>
      {text.split('').map((char, index) => (
        <motion.span
          key={index}
          initial={{ opacity: 0, filter: 'blur(10px)' }}
          whileInView={{ opacity: 1, filter: 'blur(0px)' }}
          viewport={{ once: true, margin: "0px 0px -100px 0px" }}
          transition={{ duration: 0.2, delay: delayStart + index * 0.03 }}
        >
          {char}
        </motion.span>
      ))}
    </span>
  );
};


const FAQItem = ({ question, answer }: { question: string, answer: string }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="border-b border-white/10 py-5">
      <button onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center text-left focus:outline-none group">
        <span className="text-xl font-bold group-hover:text-surf-primary transition-colors">{question}</span>
        <span className="text-surf-primary text-3xl font-light transform transition-transform duration-300" style={{ transform: isOpen ? 'rotate(45deg)' : 'rotate(0)' }}>+</span>
      </button>
      <motion.div 
        initial={false}
        animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }}
        className="overflow-hidden"
      >
        <p className="pt-4 text-white/60 leading-relaxed text-lg pb-2">{answer}</p>
      </motion.div>
    </div>
  );
};

const ParticleBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let particles: any[] = [];
    let mouse = { x: -1000, y: -1000 };

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    for (let i = 0; i < 80; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2 + 0.5,
        baseX: Math.random() * canvas.width,
        baseY: Math.random() * canvas.height,
        density: (Math.random() * 30) + 1,
        color: Math.random() > 0.5 ? '#0ea5e9' : '#06b6d4',
      });
    }

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };
    window.addEventListener('mousemove', handleMouseMove);

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      for (let i = 0; i < particles.length; i++) {
        let p = particles[i];
        
        let dx = mouse.x - p.x;
        let dy = mouse.y - p.y;
        let distance = Math.sqrt(dx * dx + dy * dy);
        let forceDirectionX = dx / distance;
        let forceDirectionY = dy / distance;
        
        const maxDistance = 150;
        let force = (maxDistance - distance) / maxDistance;
        if (force < 0) force = 0;
        
        let directionX = (forceDirectionX * force * p.density);
        let directionY = (forceDirectionY * force * p.density);

        if (distance < maxDistance) {
          p.x -= directionX;
          p.y -= directionY;
        } else {
          if (p.x !== p.baseX) {
            let dx = p.x - p.baseX;
            p.x -= dx / 20;
          }
          if (p.y !== p.baseY) {
            let dy = p.y - p.baseY;
            p.y -= dy / 20;
          }
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      }
      
      requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 z-0 pointer-events-none opacity-60" />;
};


const FollowCursorCTA = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = useState(false);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  
  const springX = useSpring(mouseX, { stiffness: 500, damping: 30 });
  const springY = useSpring(mouseY, { stiffness: 500, damping: 30 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const { left, top } = ref.current.getBoundingClientRect();
    mouseX.set(e.clientX - left);
    mouseY.set(e.clientY - top);
  };

  return (
    <section className="py-24 relative z-10 px-6">
      <motion.div 
        ref={ref}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        initial={{ opacity: 0, scale: 0.9 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="max-w-[1280px] mx-auto bg-gradient-to-br from-surf-primary to-surf-secondary rounded-[3rem] py-32 px-6 text-center relative overflow-hidden cursor-none"
      >
        <div className="absolute inset-0 bg-black opacity-10" style={{ backgroundImage: 'radial-gradient(circle at center, transparent 0, #000 100%)' }}></div>
        <h2 className="text-[clamp(40px,8vw,120px)] font-extrabold leading-none relative z-10 font-['Cal_Sans',sans-serif] tracking-tighter text-white pointer-events-none select-none drop-shadow-2xl">
          SURFING<br/>EVERYTHING
        </h2>
        
        {/* The Following Button */}
        <motion.button 
          style={{ 
            x: springX, 
            y: springY,
            translateX: "-50%",
            translateY: "-50%",
            opacity: isHovering ? 1 : 0,
            scale: isHovering ? 1 : 0.5,
          }}
          className="absolute top-0 left-0 bg-black text-white font-bold py-5 px-10 rounded-full text-xl shadow-[0_0_40px_rgba(0,0,0,0.5)] z-20 pointer-events-none whitespace-nowrap"
        >
          SIGN UP NOW
        </motion.button>

        {/* Clickable area */}
        <div 
          className="absolute inset-0 z-30 cursor-none"
          onClick={() => {
              window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      </motion.div>
    </section>
  );
};

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
  const [showOtp, setShowOtp] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [showRegisterDropdown, setShowRegisterDropdown] = useState(false);
  const registerDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (registerDropdownRef.current && !registerDropdownRef.current.contains(event.target as Node)) {
        setShowRegisterDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loginFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setLoginPassword('');
    setRegEmail('');
    setRegPassword('');
    setRegConfirmPassword('');
    setRegName('');
    setRegPhone('');
    setError('');
    setShowOtp(false);
    setOtpCode('');
    loginFormRef.current?.reset();
  }, []);

  useEffect(() => {
    setMode(isRegister ? 'register' : 'login');
  }, [isRegister]);

  // Handle URL errors (e.g. from forced signout)
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.get('error') === 'account_disabled') {
      setError('Tài khoản của bạn đã bị vô hiệu hóa hoặc xóa!');
      // Xoá param khỏi URL để tránh báo lỗi mãi
      window.history.replaceState({}, document.title, location.pathname);
    }
  }, [location]);


  /* ─── Auth executors ─────────────────────────────────────────────────── */
  const executeLogin = async () => {
    markTabAuthAction();
    setLoading(true);
    try {
      await setAuthPersistence(rememberMe);
      const result = await signIn(loginEmail.trim(), loginPassword);
      await result.user.getIdToken();
      await new Promise((r) => setTimeout(r, 800));
      await syncUserProfile();
      api.post('/api/auth/notify-login').catch(() => { });
      localStorage.setItem('surf_last_email', loginEmail.trim());
      setLoginPassword('');
      navigate('/feed', { replace: true });
    } catch (err: unknown) {
      setError(getAuthErrorMessage(err, 'Đăng nhập thất bại. Vui lòng kiểm tra lại email hoặc mật khẩu.'));
    } finally {
      setLoading(false);
    }
  };

  const executeRegisterSendOtp = async () => {
    setLoading(true);
    try {
      const payload = {
        email: regEmail.trim(),
        password: regPassword,
        displayName: regName.trim(),
      };
      // Gửi request lên backend để sinh OTP và gửi email
      const res = await api.post<{ sent: boolean }>('/api/auth/register/send-otp', payload, { requireAuth: false });
      if (res.sent) {
        setShowOtp(true);
      }
    } catch (err: any) {
      setError(err.message || 'Không thể gửi mã xác nhận. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const executeRegisterVerifyOtp = async () => {
    markTabAuthAction();
    setLoading(true);
    try {
      // Backend xác minh OTP và tạo user, trả về customToken
      const res = await api.post<{ customToken?: string }>('/api/auth/register/verify', {
        email: regEmail.trim(),
        code: otpCode,
      }, { requireAuth: false });
      
      if (res.customToken) {
        // Đăng nhập bằng custom token từ backend
        const result = await signInWithCustomToken(auth, res.customToken);
        await result.user.getIdToken();
        await new Promise((r) => setTimeout(r, 800));
        await syncUserProfile();
        api.post('/api/auth/notify-register').catch(() => { });
        navigate('/onboarding', { replace: true });
      }
    } catch (err: any) {
      setError(err.message || 'Mã xác nhận không đúng hoặc đã hết hạn.');
    } finally {
      setLoading(false);
    }
  };

  const executeGooglePost = async () => {
    markTabAuthAction();
    setLoading(true);
    try {
      const result = await signInWithGoogle();
      await result.user.getIdToken();
      await new Promise((r) => setTimeout(r, 800));
      await syncUserProfile();
      api.post('/api/auth/notify-login').catch(() => { });
      navigate('/feed', { replace: true });
    } catch (err: any) {
      const code = err?.code || '';
      const email = err?.customData?.email || '';

      if (
        [
          'auth/popup-closed-by-user',
          'auth/cancelled-popup-request',
          'auth/popup-blocked',
          'auth/user-cancelled',
          'auth/multi-factor-auth-required',
        ].includes(code)
      ) {
        setLoading(false);
        return;
      }

      if (code === 'auth/account-exists-with-different-credential' && email) {
        const provider = await getProviderName(email);
        setError(
          `Tài khoản ${email} đã được đăng ký bằng ${provider}. Vui lòng đăng nhập bằng ${provider}.`
        );
      } else {
        setError(ERRORS[code] || 'Đăng nhập Google thất bại.');
      }
    } finally {
      setLoading(false);
    }
  };

  const executeFacebookPost = async () => {
    markTabAuthAction();
    setLoading(true);
    try {
      await signInWithFacebook(); // triggers redirect, page will reload
    } catch (err: unknown) {
      setError(getAuthErrorMessage(err, 'Đăng nhập Facebook thất bại.'));
      setLoading(false);
    }
  };

  // Kiểm tra provider đã liên kết với email
  const getProviderName = async (email: string): Promise<string> => {
    try {
      const methods = await fetchSignInMethodsForEmail(auth, email);
      if (methods.includes('password')) return 'Email/Password';
      if (methods.includes('google.com')) return 'Google';
      if (methods.includes('facebook.com')) return 'Facebook';
      return 'phương thức khác';
    } catch {
      return 'phương thức khác';
    }
  };

  // Handle Facebook redirect result when page loads after redirect
  useEffect(() => {
    console.log('[AuthPage] Checking Facebook redirect result...');
    getFacebookRedirectResult()
      .then(async (result) => {
        console.log('[AuthPage] Redirect result:', result);
        if (!result) {
          console.log('[AuthPage] No redirect result - checking if user already signed in');
          // Check if already authenticated (Firebase auto-signin after redirect)
          const currentUser = auth.currentUser;
          if (currentUser) {
            console.log('[AuthPage] User already signed in:', currentUser.email);
            setLoading(true);
            await currentUser.getIdToken();
            await syncUserProfile();
            api.post('/api/auth/notify-login').catch(() => { });
            navigate('/feed', { replace: true });
          }
          return;
        }
        setLoading(true);
        console.log('[AuthPage] Processing Facebook login for:', result.user.email);
        await result.user.getIdToken();
        await new Promise((r) => setTimeout(r, 800));
        await syncUserProfile();
        api.post('/api/auth/notify-login').catch(() => { });
        navigate('/feed', { replace: true });
      })
      .catch(async (err: any) => {
        console.error('[AuthPage] Facebook redirect error:', err);
        const code = err?.code || '';
        const email = err?.customData?.email || '';

        if (code === 'auth/account-exists-with-different-credential' && email) {
          const provider = await getProviderName(email);
          setError(
            `Tài khoản ${email} đã được đăng ký bằng ${provider}. Vui lòng đăng nhập bằng ${provider}.`
          );
        } else if (code) {
          setError(ERRORS[code as keyof typeof ERRORS] || 'Đăng nhập Facebook thất bại.');
        } else {
          setError('Đăng nhập Facebook thất bại. Vui lòng thử lại.');
        }
      })
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Form handlers ──────────────────────────────────────────────────── */
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
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
    const pwdErr = validatePassword(regPassword, regName.trim(), regEmail.trim());
    if (pwdErr) {
      setError(pwdErr);
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setError('Mật khẩu nhập lại không khớp.');
      return;
    }
    await executeRegisterSendOtp();
  };

  const handleVerifyOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (otpCode.length < 6) {
      setError('Vui lòng nhập đủ 6 số.');
      return;
    }
    await executeRegisterVerifyOtp();
  };

  const handleGoogleSignIn = async () => {
    setError('');
    await executeGooglePost();
  };

  const handleFacebookSignIn = async () => {
    setError('');
    await executeFacebookPost();
  };

  const switchMode = (to: 'login' | 'register') => {
    setError('');
    setMode(to);
    setShowOtp(false);
    setOtpCode('');
    navigate(to === 'register' ? '/register' : '/login', { replace: true });
  };

  const fadeUp: any = {
    hidden: { opacity: 0, y: 40 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } }
  };
  const staggerContainer: any = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.15 }
    }
  };

  return (
    <div className="bg-surf-dark text-white font-sans min-h-screen overflow-x-hidden selection:bg-surf-primary selection:text-white pb-24">
      {/* HEADER with Login Form */}
      <motion.header 
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="fixed inset-x-0 top-0 z-50 bg-surf-dark/85 backdrop-blur-[16px] border-b border-white/5 py-4 px-6 transition-all duration-300"
      >
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-3 w-full lg:w-auto justify-center lg:justify-start">
            <img src="/logo.png" alt="Surf Logo" className="h-10 w-10 object-contain drop-shadow-lg" />
            <span className="font-extrabold tracking-tight text-2xl uppercase font-['Cal_Sans',sans-serif] text-white">SURF</span>
          </div>
          
          {/* Login Form */}
          <div className="w-full lg:w-auto flex items-center gap-4">
            <form onSubmit={handleLoginSubmit} autoComplete={rememberMe ? 'on' : 'off'} className="flex flex-wrap items-center gap-2 justify-center">
              <input type="email" name="login-email" autoComplete={rememberMe ? 'username' : 'one-time-code'} placeholder="Email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} className="w-40 px-3 py-2 rounded-lg bg-surf-card border border-white/10 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-surf-primary/60" required />
              <div className="relative group w-40">
                <input type="password" placeholder="Mật khẩu" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-surf-card border border-white/10 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-surf-primary/60" required autoComplete={rememberMe ? 'current-password' : 'new-password'} />
              </div>
              
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} type="submit" disabled={loading} className="px-5 py-2 rounded-lg font-bold text-sm text-white bg-surf-primary hover:bg-surf-secondary transition-colors disabled:opacity-50">
                ĐĂNG NHẬP
              </motion.button>
              
              <div className="flex items-center gap-2 border-l border-white/20 pl-2 ml-1">
                 <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} type="button" onClick={handleGoogleSignIn} disabled={loading} className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors" title="Google"><GoogleIcon /></motion.button>
                 <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} type="button" onClick={handleFacebookSignIn} disabled={loading} className="p-2 rounded-lg bg-[#1877F2]/80 hover:bg-[#1877F2] transition-colors" title="Facebook"><FacebookIcon /></motion.button>
              </div>
            </form>
            {mode === 'login' && error && <div className="absolute right-6 top-full mt-2 bg-red-500/20 text-red-200 text-xs px-3 py-1 rounded border border-red-500/30">{error}</div>}
            
            <div className="relative" ref={registerDropdownRef}>
              <motion.button 
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                type="button" 
                onClick={() => { setMode('register'); setShowRegisterDropdown(!showRegisterDropdown); }} 
                className="px-5 py-2 rounded-lg font-bold text-sm text-white border border-white/20 hover:bg-white/10 transition-colors"
              >
                ĐĂNG KÝ
              </motion.button>

              {/* Dropdown Register Box with Animation */}
              <div 
                className={`absolute top-full right-0 mt-4 bg-surf-card/95 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 md:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.8)] w-[90vw] max-w-sm origin-top-right transition-all duration-500 ${showRegisterDropdown ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto' : 'opacity-0 scale-95 -translate-y-4 pointer-events-none'}`}
              >
                <h2 className="text-xl font-bold mb-6 text-center text-white font-['Cal_Sans',sans-serif] tracking-wide">ĐĂNG KÝ TÀI KHOẢN</h2>
                {!showOtp ? (
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
                      
                      <button type="submit" disabled={loading} className={`mt-2 ${BTN_PRIMARY}`}>
                        {loading ? 'Đang xử lý...' : 'THAM GIA NGAY'}
                      </button>
                  </form>
                ) : (
                   <form onSubmit={handleVerifyOtpSubmit} className="flex flex-col gap-4 py-4">
                      <div className="text-center mb-2">
                        <h3 className="text-white text-lg font-semibold">Xác thực Email</h3>
                        <p className="text-white/60 text-sm mt-1">Mã xác nhận 6 số đã được gửi tới <br/><strong>{regEmail}</strong>.</p>
                      </div>
                      <div>
                        <input type="text" placeholder="Nhập mã 6 số" value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className={`${INPUT} text-center tracking-[0.5em] font-mono text-xl py-4`} required maxLength={6} />
                      </div>
                      <button type="submit" disabled={loading || otpCode.length < 6} className={`${BTN_PRIMARY} mt-2`}>
                        {loading ? 'Đang xác thực...' : 'Xác nhận mã OTP'}
                      </button>
                      <button type="button" disabled={loading} onClick={() => setShowOtp(false)} className="text-white/50 text-sm hover:text-white transition-colors">
                        Quay lại chỉnh sửa
                      </button>
                    </form>
                )}
                {mode === 'register' && <ErrorBanner message={error} />}
              </div>
            </div>
          </div>
        </div>
      </motion.header>

      {/* HERO & REGISTER FORM */}
      <section className="relative min-h-[95vh] pt-32 pb-20 flex flex-col lg:flex-row items-center justify-center gap-12 px-6 lg:px-20">
        {/* Images */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.5 }}
          className="absolute inset-0 z-0"
        >
          <img src="https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?ixlib=rb-4.0.3&auto=format&fit=crop&w=2000&q=80" alt="Concert Social" className="w-full h-full object-cover opacity-50 filter brightness-50" />
          <div className="absolute inset-0 bg-gradient-to-r from-surf-dark via-surf-dark/80 to-transparent w-[80%]" />
          <div className="absolute inset-0 bg-gradient-to-t from-surf-dark via-transparent to-transparent h-full" />
          <ParticleBackground />
        </motion.div>

        {/* Center: Copy */}
        <motion.div 
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="relative z-10 w-full max-w-4xl text-center flex flex-col items-center"
        >
          <motion.div variants={fadeUp} className="inline-flex items-center gap-3 bg-surf-card border border-white/10 rounded-full px-4 py-2 mb-8">
            <div className="w-2.5 h-2.5 rounded-full bg-surf-primary animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider">MẠNG XÃ HỘI THẾ HỆ MỚI</span>
          </motion.div>
          
          <motion.h1 className="text-[clamp(40px,7vw,80px)] font-extrabold tracking-[-0.03em] leading-[0.95] mb-6 font-['Cal_Sans',sans-serif]">
            <TypewriterText text="WE DON'T JUST CONNECT PEOPLE." delayStart={0.2} /><br/>
            <TypewriterText text="WE BUILD " delayStart={1.2} />
            <TypewriterText text="COMMUNITIES." className="text-surf-primary" delayStart={1.5} />
          </motion.h1>
          
          <motion.p variants={fadeUp} className="text-xl text-white/60 max-w-[600px] mx-auto mb-10 leading-relaxed font-light font-poppins">
            Một nền tảng được thiết kế cho sự kết nối chân thực. Nơi hàng triệu người gặp gỡ, chia sẻ khoảnh khắc và xây dựng những kỷ niệm khó quên.
          </motion.p>

          <motion.div variants={fadeUp} className="flex items-center gap-4 mb-10">
            <div className="flex -space-x-3">
              <img src="https://i.pravatar.cc/100?img=11" className="w-10 h-10 rounded-full border-2 border-surf-dark object-cover" alt="User"/>
              <img src="https://i.pravatar.cc/100?img=12" className="w-10 h-10 rounded-full border-2 border-surf-dark object-cover" alt="User"/>
              <img src="https://i.pravatar.cc/100?img=13" className="w-10 h-10 rounded-full border-2 border-surf-dark object-cover" alt="User"/>
              <img src="https://i.pravatar.cc/100?img=14" className="w-10 h-10 rounded-full border-2 border-surf-dark object-cover" alt="User"/>
            </div>
            <div>
              <div className="flex text-surf-primary text-sm">★★★★★</div>
              <p className="text-xs text-white/60 font-semibold mt-1 uppercase tracking-wide">TRUSTED BY 10M+ USERS</p>
            </div>
          </motion.div>
        </motion.div>

      </section>

      {/* TRUST BAR / FEATURES */}
      <motion.section 
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        className="py-12 border-y border-white/5 bg-surf-dark relative z-10" id="features"
      >
        <div className="max-w-[1280px] mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 md:divide-x divide-white/5">
          <motion.div variants={fadeUp} className="px-4 group relative cursor-default">
            <svg className="w-10 h-10 text-gray-500 group-hover:text-surf-primary transition-colors duration-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
            <h3 className="font-bold text-lg mb-1">E2E SECURITY</h3>
            <p className="text-sm text-white/50">Mã hóa tin nhắn 100%</p>
          </motion.div>
          <motion.div variants={fadeUp} className="px-4 group relative cursor-default">
            <svg className="w-10 h-10 text-gray-500 group-hover:text-surf-primary transition-colors duration-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            <h3 className="font-bold text-lg mb-1">REAL-TIME</h3>
            <p className="text-sm text-white/50">Độ trễ thấp nhất</p>
          </motion.div>
          <motion.div variants={fadeUp} className="px-4 group relative cursor-default">
            <svg className="w-10 h-10 text-gray-500 group-hover:text-surf-primary transition-colors duration-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            <h3 className="font-bold text-lg mb-1">4K MEDIA</h3>
            <p className="text-sm text-white/50">Chất lượng hình ảnh sắc nét</p>
          </motion.div>
          <motion.div variants={fadeUp} className="px-4 group relative cursor-default">
            <svg className="w-10 h-10 text-gray-500 group-hover:text-surf-primary transition-colors duration-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <h3 className="font-bold text-lg mb-1">GLOBAL</h3>
            <p className="text-sm text-white/50">Mạng lưới kết nối toàn cầu</p>
          </motion.div>
        </div>
      </motion.section>

      {/* SERVICES GRID */}


      {/* MOMENTS (Horizontal Scroll) */}
      <section className="py-24 relative z-10 pl-6 lg:pl-20 overflow-hidden" id="portfolio">
        <motion.h2 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-4xl font-extrabold mb-12 font-['Cal_Sans',sans-serif]"
        >
          TRENDING MOMENTS
        </motion.h2>
        <motion.div 
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="flex gap-6 overflow-x-auto snap-x snap-mandatory pb-8" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {[
            { img: 'https://images.unsplash.com/photo-1528605248644-14dd04022da1?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', name: 'SUMMER FEST 2026', author: '@alex_music' },
            { img: 'https://images.unsplash.com/photo-1491438590914-bc09fcaaf77a?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', name: 'FRIENDS REUNION', author: '@sarah.smile' },
            { img: 'https://images.unsplash.com/photo-1523580494863-6f3031224c94?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80', name: 'TOKYO VLOG', author: '@traveler_k' },
          ].map((item, i) => (
            <motion.div 
              variants={fadeUp}
              key={i} className="flex-none w-[85vw] md:w-[400px] h-[500px] rounded-[3rem] snap-start relative overflow-hidden group cursor-pointer"
            >
              <img src={item.img} className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" alt="Moment"/>
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent z-10 transition-opacity duration-500 group-hover:opacity-80" />
              
              <div className="absolute top-6 right-6 z-30 bg-surf-primary text-white text-xs font-bold uppercase tracking-wider py-1.5 px-3 rounded-full flex items-center gap-1 shadow-lg shadow-surf-primary/30">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" /></svg>
                24.5K
              </div>

              <div className="absolute bottom-0 inset-x-0 h-40 z-30 flex flex-col justify-end p-8 transform transition-transform duration-500 group-hover:-translate-y-2">
                <h3 className="font-extrabold text-2xl tracking-wide font-['Cal_Sans',sans-serif]">{item.name}</h3>
                <p className="text-white/60 text-sm font-semibold mt-1">Shared by {item.author}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* VIDEO BACKGROUND FEATURE */}
      <section className="relative py-40 flex items-center justify-center overflow-hidden border-y border-white/5">
        <video 
          autoPlay 
          loop 
          muted 
          playsInline 
          className="absolute inset-0 w-full h-full object-cover z-0 filter brightness-100"
        >
          <source src="/videos/dog.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-black/20 z-0"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-surf-dark via-transparent to-surf-dark opacity-50 z-0"></div>
        
        <motion.div 
          className="relative z-10 max-w-4xl mx-auto px-6 text-center drop-shadow-lg"
        >
          <span className="text-surf-primary font-bold tracking-widest uppercase text-sm mb-4 block drop-shadow-md">
            <TypewriterText text="CHIA SẺ KHOẢNH KHẮC" delayStart={0.1} />
          </span>
          <h2 className="text-5xl lg:text-7xl font-extrabold mb-6 font-['Cal_Sans',sans-serif] leading-tight text-white drop-shadow-2xl">
            <TypewriterText text="TƯƠNG TÁC THẬT," delayStart={0.6} /> <br/>
            <TypewriterText text="KẾT NỐI SÂU." delayStart={1.1} />
          </h2>
          <p className="text-xl text-white/90 leading-relaxed max-w-2xl mx-auto font-medium drop-shadow-lg">
            <TypewriterText text="Mọi khoảnh khắc của bạn đều đáng được trân trọng. Cùng bạn bè tạo nên những kỷ niệm đáng nhớ và lan toả niềm vui không giới hạn mỗi ngày." delayStart={1.5} />
          </p>
        </motion.div>
      </section>

      

      {/* DEEP DIVE FEATURES (Zig-zag) */}
      <section className="py-32 relative z-10 max-w-[1280px] mx-auto px-6 overflow-hidden">
        <div className="flex flex-col gap-32">
          {/* Feature 1 */}
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div variants={staggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} className="order-2 lg:order-1">
              <motion.div variants={fadeUp} className="w-12 h-12 rounded-2xl bg-surf-primary/20 flex items-center justify-center text-surf-primary mb-6">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              </motion.div>
              <motion.h2 variants={fadeUp} className="text-4xl lg:text-5xl font-extrabold mb-6 font-['Cal_Sans',sans-serif]">Mã hoá E2E tuyệt đối.</motion.h2>
              <motion.p variants={fadeUp} className="text-white/60 text-lg leading-relaxed mb-8">Tin nhắn, cuộc gọi video và dữ liệu cá nhân của bạn được bảo vệ bằng giao thức mã hoá End-to-End tiên tiến nhất. Ngay cả chúng tôi cũng không thể đọc được tin nhắn của bạn.</motion.p>
              <motion.ul variants={staggerContainer} className="flex flex-col gap-4">
                {['Mã hoá AES-256', 'Tự hủy tin nhắn', 'Khóa bảo mật phần cứng'].map((item, i) => (
                  <motion.li variants={fadeUp} key={i} className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-surf-primary" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <span className="text-white/80 font-medium">{item}</span>
                  </motion.li>
                ))}
              </motion.ul>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 50 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }} className="order-1 lg:order-2 relative">
              <div className="absolute inset-0 bg-surf-primary/20 blur-[100px] rounded-full"></div>
              <img src="https://images.unsplash.com/photo-1550751827-4bd374c3f58b?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80" alt="Security" className="relative z-10 rounded-3xl border border-white/10 shadow-2xl" />
            </motion.div>
          </div>

          {/* Feature 2 */}
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div initial={{ opacity: 0, x: -50 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }} className="relative">
              <div className="absolute inset-0 bg-surf-secondary/20 blur-[100px] rounded-full"></div>
              <img src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80" alt="Communities" className="relative z-10 rounded-3xl border border-white/10 shadow-2xl" />
            </motion.div>
            <motion.div variants={staggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }}>
              <motion.div variants={fadeUp} className="w-12 h-12 rounded-2xl bg-surf-secondary/20 flex items-center justify-center text-surf-secondary mb-6">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
              </motion.div>
              <motion.h2 variants={fadeUp} className="text-4xl lg:text-5xl font-extrabold mb-6 font-['Cal_Sans',sans-serif]">Cộng đồng không giới hạn.</motion.h2>
              <motion.p variants={fadeUp} className="text-white/60 text-lg leading-relaxed mb-8">Không gian riêng tư cho các hội nhóm, trường học, hay câu lạc bộ. Tạo các kênh chat theo chủ đề, chia sẻ file dung lượng lớn và gọi thoại trực tiếp mà không cần ứng dụng thứ ba.</motion.p>
              <motion.ul variants={staggerContainer} className="flex flex-col gap-4">
                {['Tổ chức theo Kênh (Channels)', 'Không giới hạn thành viên', 'Chia sẻ file 4GB+'].map((item, i) => (
                  <motion.li variants={fadeUp} key={i} className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-surf-secondary" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <span className="text-white/80 font-medium">{item}</span>
                  </motion.li>
                ))}
              </motion.ul>
            </motion.div>
          </div>
        </div>
      </section>

      {/* MESSAGING & STREAM EXPERIENCE */}
      <section className="py-32 relative z-10 max-w-[1280px] mx-auto px-6 overflow-hidden border-y border-white/5 bg-[#0f172a]">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <motion.div className="order-2 lg:order-1">
            <span className="text-surf-primary font-bold tracking-widest uppercase text-sm mb-4 block">
              <TypewriterText text="TRẢI NGHIỆM ĐỈNH CAO" delayStart={0.1} />
            </span>
            <h2 className="text-4xl lg:text-5xl font-extrabold mb-6 font-['Cal_Sans',sans-serif] leading-tight text-white">
              <TypewriterText text="TỰ TIN THỂ HIỆN" delayStart={0.6} /><br/>
              <TypewriterText text="BẢN SẮC RIÊNG." delayStart={1.1} />
            </h2>
            <p className="text-white/80 text-lg leading-relaxed mb-8 font-medium">
              <TypewriterText text="Trải nghiệm nhắn tin thời gian thực cực mượt, livestream 4K không độ trễ và hệ thống tương tác đa chiều. Đã đến lúc bạn bước ra thế giới và tỏa sáng theo cách riêng của mình." delayStart={1.5} />
            </p>
            <motion.ul variants={staggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} className="flex flex-col gap-5">
              {['Nhắn tin & Gọi điện 4K', 'Tương tác Livestream trực tiếp', 'Hiệu ứng AR & Bộ lọc làm đẹp'].map((item, i) => (
                <motion.li variants={fadeUp} key={i} className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-surf-primary/20 flex items-center justify-center text-surf-primary shrink-0">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                  </div>
                  <span className="text-white/90 font-semibold text-lg">{item}</span>
                </motion.li>
              ))}
            </motion.ul>
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.8 }} className="order-1 lg:order-2 relative">
            <div className="absolute inset-0 bg-surf-primary/20 blur-[100px] rounded-full"></div>
            <div className="relative z-10 rounded-[40px] overflow-hidden border border-white/10 shadow-[0_0_50px_rgba(14,165,233,0.3)] aspect-[4/5] lg:aspect-square">
              <video 
                autoPlay 
                loop 
                muted 
                playsInline 
                className="absolute inset-0 w-full h-full object-cover"
              >
                <source src="/videos/man.mp4" type="video/mp4" />
              </video>
              <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] via-transparent to-transparent opacity-80"></div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* CREATOR ECOSYSTEM */}
      <section className="py-32 relative z-10 max-w-[1280px] mx-auto px-6 text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-16 max-w-3xl mx-auto">
          <h2 className="text-4xl lg:text-5xl font-extrabold mb-6 font-['Cal_Sans',sans-serif]">DÀNH CHO <span className="text-transparent bg-clip-text bg-gradient-to-r from-surf-primary to-purple-500">CREATORS</span>.</h2>
          <p className="text-xl text-white/60 leading-relaxed">Bộ công cụ mạnh mẽ giúp bạn kiếm tiền từ chính đam mê của mình.</p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            { title: 'Analytics', desc: 'Theo dõi lượt xem, tương tác và doanh thu theo thời gian thực với biểu đồ trực quan.', img: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80' },
            { title: 'Monetization', desc: 'Nhận donate từ fan, tạo nội dung độc quyền có thu phí (Subscriptions).', img: 'https://images.unsplash.com/photo-1553729459-efe14ef6055d?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80' },
            { title: 'Brand Deals', desc: 'Kết nối trực tiếp với các nhãn hàng thông qua Creator Marketplace.', img: 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80' }
          ].map((item, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              whileHover={{ y: -10 }}
              className="bg-surf-card rounded-3xl overflow-hidden border border-white/10 group cursor-pointer shadow-xl"
            >
              <div className="h-48 overflow-hidden relative">
                 <div className="absolute inset-0 bg-surf-dark/20 group-hover:bg-transparent transition-colors z-10" />
                 <img src={item.img} alt={item.title} className="w-full h-full object-cover transform transition-transform duration-700 group-hover:scale-110" />
              </div>
              <div className="p-8 text-left">
                <h3 className="text-2xl font-bold mb-3">{item.title}</h3>
                <p className="text-white/60">{item.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* FAQ SECTION */}
      <section className="py-24 relative z-10 bg-surf-dark border-t border-white/5">
        <div className="max-w-3xl mx-auto px-6">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-extrabold mb-6 font-['Cal_Sans',sans-serif]">CÂU HỎI THƯỜNG GẶP</h2>
          </motion.div>
          
          <motion.div variants={staggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true }}>
            <motion.div variants={fadeUp}><FAQItem question="Surf có miễn phí không?" answer="Có, Surf hoàn toàn miễn phí cho người dùng cơ bản. Bạn có thể nhắn tin, gọi video, và tham gia cộng đồng mà không mất bất kỳ chi phí nào. Chúng tôi chỉ thu phí một phần nhỏ từ các giao dịch của Creator." /></motion.div>
            <motion.div variants={fadeUp}><FAQItem question="Dữ liệu của tôi có bị bán cho bên thứ ba không?" answer="Tuyệt đối KHÔNG. Quyền riêng tư của bạn là ưu tiên số một. Mọi tin nhắn đều được mã hoá E2E và chúng tôi không bán dữ liệu người dùng cho các công ty quảng cáo." /></motion.div>
            <motion.div variants={fadeUp}><FAQItem question="Có giới hạn dung lượng khi gửi file không?" answer="Với Surf, bạn có thể gửi file lên đến 4GB mỗi lần. Đối với gói Creator Pro, con số này lên tới 10GB." /></motion.div>
            <motion.div variants={fadeUp}><FAQItem question="Làm sao để trở thành Creator?" answer="Rất đơn giản! Sau khi đăng ký tài khoản, bạn chỉ cần vào phần Cài Đặt > Chuyển sang tài khoản Creator. Chỉ với 1 click, toàn bộ bảng điều khiển Analytics và Kiếm tiền sẽ được mở khóa." /></motion.div>
          </motion.div>
        </div>
      </section>

{/* FINAL CTA */}
      <FollowCursorCTA />

      {/* FLOATING STATUS INDICATOR */}
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-surf-card/90 backdrop-blur-md border border-white/10 py-2.5 px-4 rounded-full shadow-2xl">
        <div className="w-2 h-2 rounded-full bg-[#22c55e] animate-pulse-green" />
        <span className="text-[10px] font-bold uppercase tracking-wider">NETWORK IS ONLINE</span>
      </div>
    </div>
  );
}
