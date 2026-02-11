import { Link } from 'react-router-dom';

type AuthLayoutProps = {
  title: string;
  children: React.ReactNode;
  footerLink: { to: string; label: string };
};

export default function AuthLayout({ title, children, footerLink }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-surf-light flex flex-col items-center justify-center px-4 py-8">
      <Link to="/" className="mb-8">
        <img src="/SurfLogo.png" alt="Surf" className="h-28 w-auto object-contain md:h-32" />
      </Link>
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold text-center text-gray-800 mb-6">{title}</h1>
        <div className="bg-surf-card-light rounded-2xl border border-gray-200 p-6 shadow-lg">
          {children}
        </div>
        <p className="text-center mt-6 text-gray-600 text-sm">
          <Link to={footerLink.to} className="text-surf-primary hover:underline">
            {footerLink.label}
          </Link>
        </p>
      </div>
    </div>
  );
}
