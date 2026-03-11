import { useState } from 'react';
import { Link } from 'react-router-dom';
import { sendPasswordResetEmail } from '@/lib/firebase/auth';

const ERRORS: Record<string, string> = {
  'auth/invalid-email': 'Email không hợp lệ.',
  'auth/user-not-found': 'Không tìm thấy tài khoản với email này.',
  'auth/too-many-requests': 'Quá nhiều lần thử. Vui lòng thử lại sau.',
  'auth/network-request-failed': 'Lỗi mạng. Kiểm tra kết nối.',
};

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
      {Array.from({ length: 12 }).map((_, i) => (
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

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await sendPasswordResetEmail(email.trim());
      setSent(true);
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
      setError(ERRORS[code] || 'Gửi email thất bại.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <AuthBackground />

      <div className="auth-entrance relative z-10 w-full max-w-md mx-4">
        <div className="auth-glass rounded-3xl p-8">
          {/* Header */}
          <div className="flex flex-col items-center mb-6">
            <Link to="/" className="group mb-4">
              <img
                src="/SurfLogo.png"
                alt="Surf"
                className="h-16 w-auto object-contain drop-shadow-[0_0_30px_rgba(6,182,212,0.3)] group-hover:drop-shadow-[0_0_50px_rgba(6,182,212,0.5)] transition-all duration-500 group-hover:scale-105"
              />
            </Link>
            <h1 className="text-xl font-bold text-white mb-1">Quên mật khẩu</h1>
            <p className="text-white/50 text-sm text-center">
              {sent ? 'Kiểm tra email của bạn' : 'Nhập email để nhận link đặt lại mật khẩu'}
            </p>
          </div>

          {sent ? (
            <div className="auth-entrance">
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 19V5a2 2 0 012-2h14a2 2 0 012 2v14M3 19l6.75-4.5M21 19l-6.75-4.5M3 5l9 6 9-6" />
                  </svg>
                </div>
                <p className="text-white/70 text-center text-sm leading-relaxed">
                  Chúng tôi đã gửi email chứa link đặt lại mật khẩu đến <span className="text-cyan-400 font-medium">{email}</span>. Vui lòng kiểm tra hộp thư (và thư mục spam).
                </p>
              </div>
              <Link
                to="/login"
                className="mt-6 block w-full py-3 rounded-xl font-semibold text-white text-center bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-400/30 transition-all duration-300"
              >
                ← Quay lại đăng nhập
              </Link>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5 ml-1">Email</label>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-white/[0.07] border border-white/[0.12] text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/60 focus:border-transparent backdrop-blur-sm transition-all duration-200"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-400/30 transition-all duration-300 disabled:opacity-50"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      Đang gửi...
                    </span>
                  ) : 'Gửi link đặt lại mật khẩu'}
                </button>
                {error && (
                  <div className="flex items-center gap-2.5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 animate-[shake_0.3s_ease-in-out]">
                    <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-red-300 text-sm font-medium">{error}</p>
                  </div>
                )}
              </form>
              <Link to="/login" className="mt-5 block text-center text-sm text-cyan-400 hover:text-cyan-300 transition-colors">
                ← Quay lại đăng nhập
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
