import { useState, useEffect } from 'react';
import { reauthenticate } from '@/lib/firebase/auth';
import { api } from '@/lib/api';
import OtpInput from '@/components/ui/OtpInput';

function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  return local.charAt(0) + '**@' + domain;
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
      <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z" />
    </svg>
  );
}

type Step = 'form' | 'otp' | 'success';

interface Props {
  email?: string | null;
}

const RESEND_COOLDOWN = 60;

export default function ChangePasswordPanel({ email }: Props) {
  const [step, setStep] = useState<Step>('form');
  // form
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  // otp
  const [otp, setOtp] = useState('');
  const [countdown, setCountdown] = useState(RESEND_COOLDOWN);
  const [canResend, setCanResend] = useState(false);
  const [pendingPwd, setPendingPwd] = useState('');
  // shared
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const maskedEmail = email ? maskEmail(email) : null;

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
    if (newPwd.length < 6) {
      setError('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }
    if (newPwd !== confirmPwd) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }
    setLoading(true);
    try {
      await reauthenticate(currentPwd);
      await api.post('/api/auth/send-otp', { purpose: 'change-password', newPassword: newPwd });
      setPendingPwd(newPwd);
      setStep('otp');
    } catch (err: unknown) {
      const { code } = err as { code?: string };
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError('Mật khẩu hiện tại không đúng.');
      } else {
        setError((err as Error).message ?? 'Gửi mã thất bại.');
      }
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
      await api.post('/api/auth/verify-otp', { purpose: 'change-password', code: otp });
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
      await api.post('/api/auth/send-otp', { purpose: 'change-password', newPassword: pendingPwd });
      setOtp('');
      // reset timer by re-triggering useEffect
      setStep('form');
      setTimeout(() => setStep('otp'), 0);
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Gửi lại thất bại.');
    }
  }

  function reset() {
    setStep('form');
    setCurrentPwd('');
    setNewPwd('');
    setConfirmPwd('');
    setOtp('');
    setError('');
    setPendingPwd('');
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
          Đổi mật khẩu thành công!
        </h3>
        {maskedEmail && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-5 text-center">
            Tài khoản {maskedEmail} đã được cập nhật.
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          className="px-5 py-2 rounded-xl bg-surf-primary text-white text-sm font-medium hover:bg-surf-primary/90 transition-colors"
        >
          Đổi mật khẩu khác
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
          {maskedEmail && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Mã 6 chữ số đã được gửi đến <strong>{maskedEmail}</strong>
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
          Mật khẩu hiện tại
        </label>
        <div className="relative">
          <input
            type={showCurrent ? 'text' : 'password'}
            autoComplete="off"
            value={currentPwd}
            onChange={(e) => setCurrentPwd(e.target.value)}
            required
            placeholder="••••••••"
            className="w-full px-4 py-2.5 pr-10 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-surf-primary/40"
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowCurrent((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <EyeIcon open={showCurrent} />
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
          Mật khẩu mới
        </label>
        <div className="relative">
          <input
            type={showNew ? 'text' : 'password'}
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            required
            placeholder="Ít nhất 6 ký tự"
            className="w-full px-4 py-2.5 pr-10 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-surf-primary/40"
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowNew((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <EyeIcon open={showNew} />
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
          Xác nhận mật khẩu mới
        </label>
        <div className="relative">
          <input
            type={showConfirm ? 'text' : 'password'}
            value={confirmPwd}
            onChange={(e) => setConfirmPwd(e.target.value)}
            required
            placeholder="Nhập lại mật khẩu mới"
            className="w-full px-4 py-2.5 pr-10 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-surf-primary/40"
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowConfirm((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <EyeIcon open={showConfirm} />
          </button>
        </div>
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
