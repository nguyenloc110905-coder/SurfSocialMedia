import { Link } from 'react-router-dom';
import AuthLayout from '@/components/layout/AuthLayout';

export default function Register() {
  return (
    <AuthLayout title="Đăng ký" footerLink={{ to: '/login', label: 'Đã có tài khoản? Đăng nhập' }}>
      <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            Tên hiển thị
          </label>
          <input
            id="name"
            type="text"
            placeholder="Tên của bạn"
            className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-surf-primary focus:border-transparent"
          />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            placeholder="you@example.com"
            className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-surf-primary focus:border-transparent"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Mật khẩu
          </label>
          <input
            id="password"
            type="password"
            placeholder="••••••••"
            className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-surf-primary focus:border-transparent"
          />
        </div>
        <button
          type="submit"
          className="w-full py-3 rounded-xl font-medium bg-gradient-to-r from-surf-primary to-surf-secondary text-surf-dark hover:opacity-90 transition-opacity"
        >
          Đăng ký
        </button>
      </form>
      <p className="text-center mt-4">
        <Link to="/" className="text-sm text-gray-600 hover:text-gray-800">
          ← Về trang chủ
        </Link>
      </p>
    </AuthLayout>
  );
}
