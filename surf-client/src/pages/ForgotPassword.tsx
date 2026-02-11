import { useState } from 'react';
import { Link } from 'react-router-dom';
import { sendPasswordResetEmail } from '@/lib/firebase/auth';

const ERRORS: Record<string, string> = {
  'auth/invalid-email': 'Email không hợp lệ.',
  'auth/user-not-found': 'Không tìm thấy tài khoản với email này.',
  'auth/too-many-requests': 'Quá nhiều lần thử. Vui lòng thử lại sau.',
  'auth/network-request-failed': 'Lỗi mạng. Kiểm tra kết nối.',
};

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

  if (sent) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-surf-dark flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-6 shadow-lg">
          <p className="text-gray-700 dark:text-gray-300 text-center">
            Chúng tôi đã gửi email chứa link đặt lại mật khẩu. Vui lòng kiểm tra hộp thư (và thư mục spam).
          </p>
          <Link
            to="/login"
            className="mt-6 block text-center text-surf-primary hover:underline font-medium"
          >
            ← Quay lại đăng nhập
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-surf-dark flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-6 shadow-lg">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Quên mật khẩu</h1>
        <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
          Nhập email để nhận link đặt lại mật khẩu.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-surf-primary"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg font-semibold bg-surf-primary text-white hover:bg-surf-primary/90 disabled:opacity-50"
          >
            Gửi link đặt lại mật khẩu
          </button>
          {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}
        </form>
        <Link to="/login" className="mt-4 block text-center text-sm text-surf-primary hover:underline">
          ← Quay lại đăng nhập
        </Link>
      </div>
    </div>
  );
}
