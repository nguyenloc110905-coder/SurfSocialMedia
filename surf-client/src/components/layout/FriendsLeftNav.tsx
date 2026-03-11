import { NavLink } from 'react-router-dom';

const FRIENDS_NAV_ITEMS = [
  { to: '/feed/friends', label: 'Tìm kiếm', icon: 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z' },
  { to: '/feed/friends/requests', label: 'Lời mời', icon: 'M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6z' },
  { to: '/feed/friends/suggestions', label: 'Gợi ý', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z' },
  { to: '/feed/friends/all', label: 'Bạn bè', icon: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z' },
  { to: '/feed/friends/birthdays', label: 'Sinh nhật', icon: 'M12 6c1.11 0 2-.9 2-2 0-.38-.1-.73-.29-1.03L12 0l-1.71 2.97c-.19.3-.29.65-.29 1.03 0 1.1.9 2 2 2zm4.6 9.99l-1.07-1.07-1.08 1.07c-1.3 1.3-3.58 1.31-4.89 0l-1.07-1.07-1.09 1.07C6.75 16.64 5.88 17 4.96 17c-.73 0-1.4-.23-1.96-.61V21c0 .55.45 1 1 1h16c.55 0 1-.45 1-1v-4.61c-.56.38-1.23.61-1.96.61-.92 0-1.79-.36-2.44-1.01zM18 9H6c-1.66 0-3 1.34-3 3v.68c0 1.01.54 1.95 1.43 2.45.49.28 1.06.37 1.57.23.51-.13.99-.45 1.35-.94.36.49.84.81 1.35.94.5.14 1.07.04 1.57-.23.49-.27.87-.67 1.14-1.15.27.48.65.88 1.14 1.15.5.27 1.07.37 1.57.23.51-.13.99-.45 1.35-.94.36.49.84.81 1.35.94.51.14 1.08.05 1.57-.22C20.46 14.63 21 13.69 21 12.68V12c0-1.66-1.34-3-3-3z' },
  { to: '/feed/friends/nicknames', label: 'Biệt danh', icon: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z' },
] as const;

/** Thanh tab ngang điều hướng trang Bạn bè – hiển thị trên đầu nội dung */
export default function FriendsLeftNav() {
  return (
    <nav className="flex items-center gap-1 overflow-x-auto scrollbar-hide" aria-label="Bạn bè">
      {FRIENDS_NAV_ITEMS.map(({ to, label, icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/feed/friends'}
          title={label}
          className={({ isActive }) =>
            [
              'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all flex-shrink-0',
              isActive
                ? 'bg-surf-primary text-white shadow-sm shadow-surf-primary/25'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/60',
            ].join(' ')
          }
        >
          {({ isActive }) => (
            <>
              <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0" fill="currentColor" aria-hidden="true">
                <path d={icon} />
              </svg>
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
