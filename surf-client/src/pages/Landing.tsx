import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-surf-light dark:bg-surf-dark">
      <div className="landing-logo-drop flex flex-col items-center">
        <img src="/SurfLogo.png" alt="Surf" className="h-16 w-auto object-contain" />
        <p className="mt-4 text-gray-600 dark:text-gray-400 text-center text-lg">Kết nối và chia sẻ</p>
      </div>
      <div className="landing-cta-slide-up mt-12 flex flex-col sm:flex-row gap-4">
        <Link
          to="/login"
          className="inline-flex items-center justify-center px-8 py-3 rounded-xl bg-surf-primary text-white font-semibold hover:bg-surf-primary/90 transition-colors"
        >
          Đăng nhập
        </Link>
        <Link
          to="/register"
          className="inline-flex items-center justify-center px-8 py-3 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-600 font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          Đăng ký
        </Link>
      </div>
    </div>
  );
}
