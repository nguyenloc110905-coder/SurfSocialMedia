import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import ChangePasswordPanel from './ChangePasswordPanel';
import ChangeEmailPanel from './ChangeEmailPanel';

function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  return local.charAt(0) + '**@' + domain;
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

export default function AccountSecurityPanel() {
  const user = useAuthStore((s) => s.user);
  const maskedEmail = user?.email ? maskEmail(user.email) : null;
  const [openPassword, setOpenPassword] = useState(false);
  const [openEmail, setOpenEmail] = useState(false);

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">
        Bảo mật tài khoản
      </h1>
      <p className="text-slate-600 dark:text-slate-300 mb-8">
        Quản lý mật khẩu và bảo mật tài khoản Surf của bạn.
      </p>

      {/* Thông tin tài khoản */}
      <div className="flex items-center gap-3 px-5 py-4 rounded-2xl bg-surf-primary/8 dark:bg-surf-primary/15 border border-surf-primary/20 dark:border-surf-secondary/30 mb-6">
        <span className="w-9 h-9 rounded-xl bg-surf-primary/15 dark:bg-surf-primary/25 flex items-center justify-center flex-shrink-0">
          <svg
            className="w-5 h-5 text-surf-primary dark:text-surf-secondary"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
          </svg>
        </span>
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Tài khoản đang đăng nhập</p>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {maskedEmail ?? 'Chưa đăng nhập'}
          </p>
        </div>
      </div>

      {/* Đổi mật khẩu */}
      <div className="bg-white dark:bg-slate-800/90 rounded-2xl border border-slate-200/80 dark:border-slate-600/80 border-l-4 border-l-surf-primary dark:border-l-surf-secondary overflow-hidden mb-4">
        <button
          type="button"
          onClick={() => setOpenPassword((v) => !v)}
          className="w-full flex items-center gap-3 px-6 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
        >
          <span className="w-9 h-9 rounded-xl bg-surf-primary/15 dark:bg-surf-primary/25 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-5 h-5 text-surf-primary dark:text-surf-secondary"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
            </svg>
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Đổi mật khẩu
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Nhập mật khẩu hiện tại, sau đó nhập mật khẩu mới và xác nhận bằng mã gửi về email.
            </p>
          </div>
          <ChevronIcon open={openPassword} />
        </button>
        {openPassword && (
          <div className="px-6 py-5 border-t border-slate-100 dark:border-slate-700/60">
            <ChangePasswordPanel email={user?.email} />
          </div>
        )}
      </div>

      {/* Đổi email */}
      <div className="bg-white dark:bg-slate-800/90 rounded-2xl border border-slate-200/80 dark:border-slate-600/80 border-l-4 border-l-surf-secondary dark:border-l-surf-primary overflow-hidden">
        <button
          type="button"
          onClick={() => setOpenEmail((v) => !v)}
          className="w-full flex items-center gap-3 px-6 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
        >
          <span className="w-9 h-9 rounded-xl bg-surf-secondary/15 dark:bg-surf-secondary/20 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-5 h-5 text-surf-secondary dark:text-surf-primary"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z" />
            </svg>
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Đổi email</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Nhập email mới — mã xác nhận sẽ được gửi về email hiện tại của bạn.
            </p>
          </div>
          <ChevronIcon open={openEmail} />
        </button>
        {openEmail && (
          <div className="px-6 py-5 border-t border-slate-100 dark:border-slate-700/60">
            <ChangeEmailPanel />
          </div>
        )}
      </div>
    </div>
  );
}
