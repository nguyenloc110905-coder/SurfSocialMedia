import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import BottomNav from './BottomNav';
import MainLeftNav from './MainLeftNav';
import MainRightSidebar from './MainRightSidebar';
import FriendsLeftNav from './FriendsLeftNav';

const MAIN_PATHS = [
  '/feed', '/feed/short-video', '/feed/friends', '/feed/groups', '/feed/market',
  '/feed/saved', '/feed/events', '/feed/pages', '/feed/waves',
  '/feed/explore', '/feed/moments', '/feed/live',
] as const;
function isMainPage(pathname: string): boolean {
  return MAIN_PATHS.some((p) => pathname === p) || pathname.startsWith('/feed/friends/');
}
function isFriendsSection(pathname: string): boolean {
  return pathname === '/feed/friends' || pathname.startsWith('/feed/friends/');
}

export default function Layout() {
  const location = useLocation();
  const isProfile = location.pathname.startsWith('/feed/profile/');
  const isSettings = location.pathname === '/feed/settings';
  const useThreeColumn = isMainPage(location.pathname);
  const showFriendsLeftNav = isFriendsSection(location.pathname);

  return (
    <div className={`bg-surf-light dark:bg-surf-dark flex flex-col ${isSettings || useThreeColumn ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
      <Header hideCenterNav={useThreeColumn} />
      <main
        className={
          isSettings
            ? 'flex-1 w-full pt-0 pb-20 md:pb-6 flex flex-col min-h-0 overflow-hidden'
            : isProfile
              ? 'flex-1 w-full mx-auto px-4 sm:px-6 py-4 sm:py-6 pb-20 md:pb-6 max-w-4xl'
              : useThreeColumn
                ? 'flex-1 flex min-h-0 w-full pb-20 md:pb-6 overflow-hidden'
                : 'flex-1 max-w-2xl w-full mx-auto px-4 py-4 sm:py-6 pb-20 md:pb-6'
        }
      >
        {useThreeColumn ? (
          <>
            <div className="flex-1 min-h-0 w-full grid grid-cols-1 md:grid-cols-[25%_1fr] lg:grid-cols-[25%_50%_25%] gap-2 md:gap-3 overflow-hidden">
              {showFriendsLeftNav ? <FriendsLeftNav /> : <MainLeftNav />}
              <div className="min-w-0 min-h-0 flex flex-col overflow-y-auto overflow-x-hidden scrollbar-hide">
                <div className="flex-1 w-full max-w-2xl mx-auto px-4 py-4 sm:py-6">
                  <Outlet />
                </div>
              </div>
              <MainRightSidebar />
            </div>
          </>
        ) : (
          <Outlet />
        )}
      </main>
      <BottomNav />
    </div>
  );
}
