import { useState, useEffect } from 'react';
import { auth } from '@/lib/firebase/auth';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import OtpInput from '@/components/ui/OtpInput';

function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  return local.charAt(0) + '**@' + domain;
}

type Step = 'form' | 'otp' | 'success';

const RESEND_COOLDOWN = 60;

export default function ChangeEmailPanel() {
  const user = useAuthStore((s) => s.user);
  const [step, setStep] = useState<Step>('form');
  // form
  const [newEmail, setNewEmail] = useState('');
  // otp
  const [otp, setOtp] = useState('');
  const [countdown, setCountdown] = useState(RESEND_COOLDOWN);
  const [canResend, setCanResend] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');
  // shared
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const currentMasked = user?.email ? maskEmail(user.email) : null;

  useEffect(() => {
    if (step !== 'otp') return;
    setCountdown(RESEND_COOLDOWN);
    setCanResend(false);
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(id);
          setCanResend(true);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [step]);

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed.includes('@')) {
      setError('Email không hợp lệ.');
      return;
    }
    if (trimmed === user?.email?.toLowerCase()) {
      setError('Email mới phải khác email hiện tại.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/api/auth/send-otp', { purpose: 'change-email', newEmail: trimmed });
      setPendingEmail(trimmed);
      setStep('otp');
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Gửi mã thất bại.');
    } finally {
      setLoading(false);
    }
  }

  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (otp.length < 6) {
      setError('Vui lòng nhập đủ 6 chữ số.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await api.post('/api/auth/verify-otp', { purpose: 'change-email', code: otp });
      // Reload Firebase user để cập nhật email mới
      await auth.currentUser?.reload();
      setStep('success');
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Mã không đúng hoặc đã hết hạn.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setError('');
    try {
      await api.post('/api/auth/send-otp', { purpose: 'change-email', newEmail: pendingEmail });
      setOtp('');
      setStep('form');
      setTimeout(() => setStep('otp'), 0);
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Gửi lại thất bại.');
    }
  }

  function reset() {
    setStep('form');
    setNewEmail('');
    setOtp('');
    setError('');
    setPendingEmail('');
  }

  /* ── SUCCESS ──────────────────────────── */
  if (step === 'success') {
    return (
      <div className="flex flex-col items-center py-4">
        <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mb-3">
          <svg className="w-7 h-7 text-emerald-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-1">
          Đổi email thành công!
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5 text-center">
          Email tài khoản đã được cập nhật thành{' '}
          <strong className="text-slate-700 dark:text-slate-200">{maskEmail(pendingEmail)}</strong>.
        </p>
        <button
          type="button"
          onClick={reset}
          className="px-5 py-2 rounded-xl bg-surf-primary text-white text-sm font-medium hover:bg-surf-primary/90 transition-colors"
        >
          Đổi email khác
        </button>
      </div>
    );
  }

  /* ── OTP ──────────────────────────────── */
  if (step === 'otp') {
    return (
      <form onSubmit={handleOtpSubmit} className="space-y-5">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-surf-primary/15 dark:bg-surf-primary/25 flex items-center justify-center mx-auto mb-3">
            <svg
              className="w-6 h-6 text-surf-primary dark:text-surf-secondary"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Nhập mã xác nhận</p>
          {currentMasked && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Mã 6 chữ số đã được gửi đến email hiện tại <strong>{currentMasked}</strong>
            </p>
          )}
        </div>

        <OtpInput value={otp} onChange={setOtp} disabled={loading} />

        {error && <p className="text-sm text-red-500 dark:text-red-400 text-center">{error}</p>}

        <button
          type="submit"
          disabled={loading || otp.length < 6}
          className="w-full py-2.5 rounded-xl bg-surf-primary text-white text-sm font-semibold hover:bg-surf-primary/90 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Đang xác nhận...' : 'Xác nhận'}
        </button>

        <div className="text-center">
          {canResend ? (
            <button
              type="button"
              onClick={handleResend}
              className="text-sm text-surf-primary dark:text-surf-secondary font-medium hover:underline"
            >
              Gửi lại mã
            </button>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Gửi lại sau{' '}
              <span className="font-medium text-slate-600 dark:text-slate-300">{countdown}s</span>
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            setStep('form');
            setOtp('');
            setError('');
          }}
          className="w-full text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        >
          ← Quay lại
        </button>
      </form>
    );
  }

  /* ── FORM ─────────────────────────────── */
  return (
    <form onSubmit={handleFormSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
          Email mới
        </label>
        <input
          type="email"
          autoComplete="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          required
          placeholder="example@email.com"
          className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-surf-primary/40"
        />
        {currentMasked && (
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">
            Mã xác nhận sẽ được gửi đến email hiện tại: {currentMasked}
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 rounded-xl bg-surf-primary text-white text-sm font-semibold hover:bg-surf-primary/90 disabled:opacity-50 transition-colors"
      >
        {loading ? 'Đang gửi mã...' : 'Tiếp tục'}
      </button>
    </form>
  );
}
