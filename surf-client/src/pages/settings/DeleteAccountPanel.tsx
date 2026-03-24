import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { reauthenticate, signOut } from '@/lib/firebase/auth';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  return local.charAt(0) + '**@' + domain;
}

type Step = 'confirm' | 'done';

export default function DeleteAccountPanel() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('confirm');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const maskedEmail = user?.email ? maskEmail(user.email) : null;

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await reauthenticate(password);
      await api.delete('/api/auth/account');
      await signOut();
      setStep('done');
      setTimeout(() => navigate('/'), 1500);
    } catch (err: unknown) {
      const { code } = err as { code?: string };
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError('Mật khẩu không đúng.');
      } else {
        setError('Xóa tài khoản thất bại. Vui lòng thử lại.');
      }
    } finally {
      setLoading(false);
    }
  }

  if (step === 'done') {
    return (
      <div className="max-w-2xl flex flex-col items-center py-16">
        <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-emerald-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-1">
          Tài khoản đã được xóa
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">Đang chuyển hướng...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">Xóa tài khoản</h1>
      <p className="text-slate-600 dark:text-slate-300 mb-8">
        Xóa vĩnh viễn tài khoản Surf và toàn bộ dữ liệu của bạn.
      </p>

      {/* Cảnh báo */}
      <div className="flex items-start gap-3 p-5 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 mb-6">
        <svg
          className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
        </svg>
        <div>
          <p className="text-sm font-semibold text-red-700 dark:text-red-400 mb-1.5">
            Hành động này không thể hoàn tác
          </p>
          <ul className="text-sm text-red-600 dark:text-red-400/80 space-y-1 list-disc list-inside">
            <li>Tất cả bài đăng, ảnh và dữ liệu bị xóa vĩnh viễn</li>
            <li>Bạn sẽ mất toàn bộ kết nối bạn bè</li>
            <li>Tài khoản không thể khôi phục sau khi xóa</li>
          </ul>
        </div>
      </div>

      {/* Form xác nhận */}
      <div className="bg-white dark:bg-slate-800/90 rounded-2xl border border-red-200/60 dark:border-red-800/40 border-l-4 border-l-red-500 overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 dark:border-slate-700/60">
          <span className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-red-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
            </svg>
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Xác nhận xóa tài khoản
            </h2>
            {maskedEmail && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Tài khoản: {maskedEmail}
              </p>
            )}
          </div>
        </div>
        <form onSubmit={handleDelete} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
              Nhập mật khẩu để xác nhận
            </label>
            <input
              type="password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-400/40"
            />
          </div>
          {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Đang xóa...' : 'Xóa tài khoản vĩnh viễn'}
          </button>
        </form>
      </div>
    </div>
  );
}
