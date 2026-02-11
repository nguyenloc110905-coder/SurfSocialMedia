import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import BottomNav from './BottomNav';

export default function Layout() {
  const location = useLocation();
  const isProfile = location.pathname.startsWith('/feed/profile/');

  return (
    <div className="min-h-screen bg-surf-light dark:bg-surf-dark flex flex-col">
      <Header />
      <main
        className={
          isProfile
            ? 'flex-1 w-full mx-auto px-4 sm:px-6 py-4 sm:py-6 pb-20 md:pb-6 max-w-4xl'
            : 'flex-1 max-w-2xl w-full mx-auto px-4 py-4 sm:py-6 pb-20 md:pb-6'
        }
      >
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
