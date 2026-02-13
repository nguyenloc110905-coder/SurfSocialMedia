import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/feed', title: 'Feed', icon: 'M10.3 2.7 3 9.19V20a2 2 0 0 0 2 2h5v-6h4v6h5a2 2 0 0 0 2-2V9.19L13.7 2.7a2 2 0 0 0-2.4 0Z' },
  { to: '/feed/short-video', title: 'Surf Clips', icon: 'M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4Z' },
  { to: '/feed/friends', title: 'Bạn bè', icon: 'M12 12a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm5-3a2.5 2.5 0 1 0-2.5 2.5A2.5 2.5 0 0 0 17 9Zm-10 0A2.5 2.5 0 1 0 9.5 6.5 2.5 2.5 0 0 0 7 9Zm0 2a3.5 3.5 0 0 0-3.5 3.5V16a1 1 0 0 0 1 1h5v-2a4.986 4.986 0 0 1 1.29-3.33A3.482 3.482 0 0 0 7 11Zm5 1a3.5 3.5 0 0 0-3.5 3.5V17a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-1.5A3.5 3.5 0 0 0 12 12Zm5 0a3.482 3.482 0 0 0-3.79 2.67A4.986 4.986 0 0 1 14 16v1h5a1 1 0 0 0 1-1v-.5A3.5 3.5 0 0 0 17 12Z' },
  { to: '/feed/groups', title: 'Nhóm', icon: 'M12 2a4 4 0 0 1 4 4v1h.5a3.5 3.5 0 0 1 3.5 3.5v7a3.5 3.5 0 0 1-3.5 3.5h-9A3.5 3.5 0 0 1 3.5 17.5v-7A3.5 3.5 0 0 1 7 7h.5V6a4 4 0 0 1 4-4Zm0 2a2 2 0 0 0-2 2v1h4V6a2 2 0 0 0-2-2Zm-2 6a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm-6 2.5a1.5 1.5 0 0 0-1.5 1.5v2.5h3v-2.5a1.5 1.5 0 0 0-1.5-1.5Zm6 0a1.5 1.5 0 0 0-1.5 1.5v2.5h3v-2.5a1.5 1.5 0 0 0-1.5-1.5Z' },
  { to: '/feed/market', title: 'Surf Market', icon: 'M4 6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h4V6zm8 0V6a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2h8z' },
] as const;

export default function BottomNav() {
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-20 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-t border-gray-200 dark:border-gray-700 safe-area-bottom"
      aria-label="Điều hướng chính"
    >
      <div className="flex items-center justify-around h-14 px-2">
        {navItems.map(({ to, title, icon }) => (
          <NavLink
            key={to}
            to={to}
            title={title}
            className={({ isActive }) =>
              [
                'relative flex flex-col items-center justify-center flex-1 min-w-0 h-full py-1.5 rounded-lg text-gray-500 dark:text-gray-400 transition-colors',
                isActive ? 'text-surf-primary dark:text-surf-primary' : 'hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                <svg viewBox="0 0 24 24" className="w-6 h-6 flex-shrink-0" aria-hidden="true">
                  <path fill="currentColor" d={icon} />
                </svg>
                {isActive && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-surf-primary rounded-full" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
