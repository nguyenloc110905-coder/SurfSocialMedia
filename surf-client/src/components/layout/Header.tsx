import { Link } from 'react-router-dom';
import { signOut } from '@/lib/firebase/auth';
import { useAuthStore } from '@/stores/authStore';

export default function Header() {
  const user = useAuthStore((s) => s.user);

  return (
    <header className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-200 flex items-center justify-between h-14 px-4">
      <Link to="/feed" className="flex items-center gap-2">
        <img src="/SurfLogo.png" alt="Surf" className="h-8 w-auto object-contain" />
      </Link>
      <div className="flex items-center gap-3">
        <Link to={`/feed/profile/${user?.uid}`} className="text-sm text-gray-600 hover:text-gray-900">
          Profile
        </Link>
        <button
          type="button"
          onClick={() => signOut()}
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          Đăng xuất
        </button>
      </div>
    </header>
  );
}
