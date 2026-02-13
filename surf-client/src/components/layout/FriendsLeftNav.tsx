import { Link, NavLink, useNavigate } from 'react-router-dom';

const FRIENDS_NAV_ITEMS = [
  { to: '/feed/friends', label: 'Trang chủ', path: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { to: '/feed/friends/requests', label: 'Lời mời kết bạn', path: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z' },
  { to: '/feed/friends/suggestions', label: 'Gợi ý', path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z' },
  { to: '/feed/friends/all', label: 'Tất cả bạn bè', path: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z' },
  { to: '/feed/friends/birthdays', label: 'Sinh nhật', path: 'M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.11-.9-2-2-2zm0 16H5V9h14v11zM9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z' },
  { to: '/feed/friends/history', label: 'Lịch sử tương tác', path: 'M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12V6c0-3.87 3.13-7 7-7s7 3.13 7 7c0 3.87-3.13 7-7 7-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z' },
] as const;

/** Cột trái khi ở trang Bạn bè: Quay lại + Trang chủ, Lời mời, Gợi ý, Tất cả bạn bè, Sinh nhật, Lịch sử tương tác */
export default function FriendsLeftNav() {
  const navigate = useNavigate();

  return (
    <aside className="hidden md:flex flex-col w-full min-w-0 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide bg-white/80 dark:bg-gray-900/80">
      <div className="flex-shrink-0 p-3 space-y-1 border-b border-gray-100 dark:border-gray-700/80">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/80 hover:text-surf-primary dark:hover:text-surf-secondary transition-colors text-left"
        >
          <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </svg>
          <span className="text-sm font-medium">Quay lại</span>
        </button>
        <Link
          to="/feed"
          className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/80 hover:text-surf-primary dark:hover:text-surf-secondary transition-colors text-left"
        >
          <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
          </svg>
          <span className="text-sm font-medium">Trang chủ</span>
        </Link>
      </div>
      <nav className="p-3 space-y-1" aria-label="Bạn bè">
        {FRIENDS_NAV_ITEMS.map(({ to, label, path }, i) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/feed/friends'}
            title={label}
            className={({ isActive }) =>
              [
                'main-left-nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors',
                isActive
                  ? 'bg-surf-primary/15 dark:bg-surf-primary/25 text-surf-primary dark:text-surf-secondary font-medium'
                  : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/80',
              ].join(' ')
            }
            style={{ animationDelay: `${i * 40}ms`, opacity: 0 }}
          >
            {({ isActive }) => (
              <>
                <span
                  className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${
                    isActive ? 'bg-surf-primary/25 dark:bg-surf-secondary/25' : 'bg-gray-100 dark:bg-gray-700/80'
                  }`}
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
                    <path d={path} />
                  </svg>
                </span>
                <span className="text-sm truncate flex-1 min-w-0">{label}</span>
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-surf-primary dark:bg-surf-secondary flex-shrink-0" aria-hidden />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
