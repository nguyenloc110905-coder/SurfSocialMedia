import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import BottomNav from './BottomNav';

export default function Layout() {
  const location = useLocation();
  const isProfile = location.pathname.startsWith('/feed/profile/');
  const isSettings = location.pathname === '/feed/settings';

  return (
    <div className={`bg-surf-light dark:bg-surf-dark flex flex-col ${isSettings ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
      <Header />
      <main
        className={
          isSettings
            ? 'flex-1 w-full pt-0 pb-20 md:pb-6 flex flex-col min-h-0 overflow-hidden'
            : isProfile
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
