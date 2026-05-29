import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Header from './Header';
import BottomNav from './BottomNav';
import MainLeftNav from './MainLeftNav';
import MainRightSidebar from './MainRightSidebar';
import FriendsLeftNav from './FriendsLeftNav';
import QuickContactBar from './QuickContactBar';
import LiveToastListener from '@/components/live/LiveToastListener';

const MAIN_PATHS = [
  '/feed',
  '/feed/short-video',
  '/feed/friends',
  '/feed/groups',
  '/feed/market',
  '/feed/saved',
  '/feed/events',
  '/feed/pages',
  '/feed/waves',
  '/feed/explore',
  '/feed/moments',
  '/feed/live',
] as const;
function isMainPage(pathname: string): boolean {
  return (
    MAIN_PATHS.some((p) => pathname === p) ||
    pathname.startsWith('/feed/friends/') ||
    pathname.startsWith('/feed/groups/') ||
    pathname.startsWith('/feed/live/')
  );
}
function isFriendsSection(pathname: string): boolean {
  return pathname === '/feed/friends' || pathname.startsWith('/feed/friends/');
}

export default function Layout() {
  const location = useLocation();
  const isProfile = location.pathname.startsWith('/feed/profile/');
  const isSettings = location.pathname === '/feed/settings';
  const isAdminSupport = location.pathname === '/feed/admin/support';
  const isWaves = location.pathname === '/feed/waves';
  const isMarket = location.pathname.startsWith('/feed/market');
  const isLive = location.pathname === '/feed/live' || location.pathname.startsWith('/feed/live/');
  const useThreeColumn = isMainPage(location.pathname);
  const showFriendsLeftNav = isFriendsSection(location.pathname);
  const isShortVideo = location.pathname === '/feed/short-video';
  const useWideMain = isWaves || isMarket || isLive;
  const useEmbeddedFullHeight = isWaves || isMarket;
  const showQuickContactBar = useThreeColumn;
  const [mainNavCollapsed, setMainNavCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('surf:main-left-nav-collapsed') === '1';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('surf:main-left-nav-collapsed', mainNavCollapsed ? '1' : '0');
  }, [mainNavCollapsed]);

  // Determine grid columns
  let gridCols = 'grid-cols-1';
  if (showFriendsLeftNav) {
    gridCols = 'md:grid-cols-[22%_1fr] lg:grid-cols-[17%_1fr_22%]';
  } else if (useWideMain) {
    gridCols = mainNavCollapsed
      ? 'md:grid-cols-[96px_1fr] lg:grid-cols-[96px_1fr]'
      : 'md:grid-cols-[280px_1fr] lg:grid-cols-[280px_1fr]';
  } else {
    gridCols = mainNavCollapsed
      ? 'md:grid-cols-[96px_1fr] lg:grid-cols-[96px_1fr_22%]'
      : 'md:grid-cols-[280px_1fr] lg:grid-cols-[280px_1fr_22%]';
  }

  return (
    <div
      className={`bg-surf-light dark:bg-surf-dark flex flex-col ${isSettings || useThreeColumn ? 'h-screen overflow-hidden' : 'min-h-screen'}`}
    >
      <Header hideCenterNav={useThreeColumn} />
      <main
        className={
          isSettings
            ? 'flex-1 w-full pt-0 pb-20 md:pb-0 flex flex-col min-h-0 overflow-hidden'
            : isAdminSupport
              ? 'flex-1 w-full mx-auto px-4 sm:px-6 py-4 sm:py-6 pb-20 md:pb-0 max-w-6xl'
              : isProfile
                ? 'flex-1 w-full mx-auto px-4 sm:px-6 py-4 sm:py-6 pb-20 md:pb-0 max-w-4xl'
                : useThreeColumn
                  ? 'flex-1 flex min-h-0 w-full pb-20 md:pb-0 overflow-hidden'
                  : 'flex-1 max-w-2xl w-full mx-auto px-4 py-4 sm:py-6 pb-20 md:pb-0'
        }
      >
        {useThreeColumn ? (
          <>
            {isShortVideo ? (
              <div className="flex-1 min-h-0 w-full overflow-hidden">
                <Outlet />
              </div>
            ) : (
              <div
                className={`flex-1 min-h-0 w-full grid ${gridCols} overflow-hidden transition-[grid-template-columns] duration-300 ease-out ${!isWaves && !isMarket ? 'gap-1 md:gap-2' : ''} ${showQuickContactBar ? 'lg:pr-[90px]' : ''}`}
              >
                <div className="min-h-0 overflow-hidden flex flex-col">
                  {showFriendsLeftNav ? (
                    <FriendsLeftNav />
                  ) : (
                    <MainLeftNav
                      collapsed={mainNavCollapsed}
                      onToggleCollapse={() => setMainNavCollapsed((current) => !current)}
                    />
                  )}
                </div>
                <div
                  id="main-feed-scroll"
                  className={
                    useEmbeddedFullHeight
                      ? 'min-w-0 min-h-0 flex flex-1 flex-col overflow-hidden'
                      : 'min-w-0 min-h-0 flex flex-col overflow-y-auto overflow-x-hidden scrollbar-hide'
                  }
                >
                  <div
                    className={
                      useEmbeddedFullHeight
                        ? 'flex h-full min-h-0 min-w-0 w-full flex-1'
                        : 'flex-1 w-full'
                    }
                  >
                    <Outlet />
                  </div>
                </div>
                {!useWideMain && (
                  <div className="min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide">
                    <MainRightSidebar />
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <Outlet />
        )}
      </main>
      <BottomNav />
      <LiveToastListener />
      {showQuickContactBar && <QuickContactBar isShortVideo={isShortVideo} />}
    </div>
  );
}
