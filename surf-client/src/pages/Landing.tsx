import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <div className="min-h-screen bg-surf-light flex flex-col items-center justify-center px-4 text-center">
      {/* Logo: thả từ trên xuống */}
      <div className="landing-logo-drop flex flex-col items-center gap-6 mb-12">
        <img
          src="/SurfLogo.png"
          alt="Surf"
          className="h-48 w-auto object-contain sm:h-56 md:h-64"
        />
      </div>

      {/* CTA: kéo từ dưới lên */}
      <div className="landing-cta-slide-up flex flex-col items-center">
        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto sm:min-w-[300px]">
          <Link
            to="/login"
            className="flex-1 min-w-0 sm:min-w-[130px] py-3 px-6 rounded-xl font-medium bg-gradient-to-r from-surf-primary to-surf-secondary text-surf-dark hover:opacity-90 transition-opacity whitespace-nowrap flex items-center justify-center"
          >
            Đăng nhập
          </Link>
          <Link
            to="/register"
            className="flex-1 min-w-0 sm:min-w-[130px] py-3 px-6 rounded-xl font-medium border border-surf-primary text-surf-primary hover:bg-surf-primary/10 transition-colors whitespace-nowrap flex items-center justify-center"
          >
            Đăng ký
          </Link>
        </div>
        <p className="mt-8 text-gray-500 text-sm">
          Kết nối · Chia sẻ · Surf mọi thứ
        </p>
      </div>
    </div>
  );
}
