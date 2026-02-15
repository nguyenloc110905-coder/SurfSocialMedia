import { NavLink, Link } from 'react-router-dom';

const MAIN_NAV_ITEMS = [
  { to: '/feed', title: 'Feed', path: 'M10.3 2.7 3 9.19V20a2 2 0 0 0 2 2h5v-6h4v6h5a2 2 0 0 0 2-2V9.19L13.7 2.7a2 2 0 0 0-2.4 0Z' },
  { to: '/feed/short-video', title: 'Surf Clips', path: 'M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4Z' },
  { to: '/feed/friends', title: 'Bạn bè', path: 'M12 12a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm5-3a2.5 2.5 0 1 0-2.5 2.5A2.5 2.5 0 0 0 17 9Zm-10 0A2.5 2.5 0 1 0 9.5 6.5 2.5 2.5 0 0 0 7 9Zm0 2a3.5 3.5 0 0 0-3.5 3.5V16a1 1 0 0 0 1 1h5v-2a4.986 4.986 0 0 1 1.29-3.33A3.482 3.482 0 0 0 7 11Zm5 1a3.5 3.5 0 0 0-3.5 3.5V17a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-1.5A3.5 3.5 0 0 0 12 12Zm5 0a3.482 3.482 0 0 0-3.79 2.67A4.986 4.986 0 0 1 14 16v1h5a1 1 0 0 0 1-1v-.5A3.5 3.5 0 0 0 17 12Z' },
  { to: '/feed/groups', title: 'Nhóm', path: 'M12 2a4 4 0 0 1 4 4v1h.5a3.5 3.5 0 0 1 3.5 3.5v7a3.5 3.5 0 0 1-3.5 3.5h-9A3.5 3.5 0 0 1 3.5 17.5v-7A3.5 3.5 0 0 1 7 7h.5V6a4 4 0 0 1 4-4Zm0 2a2 2 0 0 0-2 2v1h4V6a2 2 0 0 0-2-2Zm-2 6a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm-6 2.5a1.5 1.5 0 0 0-1.5 1.5v2.5h3v-2.5a1.5 1.5 0 0 0-1.5-1.5Zm6 0a1.5 1.5 0 0 0-1.5 1.5v2.5h3v-2.5a1.5 1.5 0 0 0-1.5-1.5Z' },
  { to: '/feed/market', title: 'Surf Market', path: 'M4 6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h4V6zm8 0V6a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2h8z' },
  { to: '/feed/saved', title: 'Đã lưu', path: 'M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z' },
  { to: '/feed/events', title: 'Sự kiện', path: 'M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.11-.9-2-2-2zm0 16H5V9h14v11zM9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z' },
  { to: '/feed/pages', title: 'Trang', path: 'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z' },
  { to: '/feed/waves', title: 'Waves', path: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z' },
  { to: '/feed/explore', title: 'Khám phá', path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z' },
  { to: '/feed/moments', title: 'Moments', path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 2c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm0 10c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z' },
  { to: '/feed/live', title: 'Surf Live', path: 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V19H3.1C1.39 19 0 17.71 0 16V12zm16.2 0c0 1.71-1.39 3.1-3.1 3.1H12V5h4.2c1.71 0 3.1 1.39 3.1 3.1V12z' },
] as const;

const GROUP_ICON = 'M12 2a4 4 0 0 1 4 4v1h.5a3.5 3.5 0 0 1 3.5 3.5v7a3.5 3.5 0 0 1-3.5 3.5h-9A3.5 3.5 0 0 1 3.5 17.5v-7A3.5 3.5 0 0 1 7 7h.5V6a4 4 0 0 1 4-4Zm0 2a2 2 0 0 0-2 2v1h4V6a2 2 0 0 0-2-2Z';
const PAGE_ICON = 'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z';

const SHORTCUTS_MAX = 7;

/** Lối tắt: lấy từ store/API (nhóm/trang vào nhiều hoặc gần nhất). Chưa có thì truyền []. */
export type ShortcutItem = { type: 'group' | 'page'; id: string; name: string; href: string };

type MainLeftNavProps = { shortcuts?: ShortcutItem[] };

function getShortcutIconPath(item: ShortcutItem): string {
  return item.type === 'group' ? GROUP_ICON : PAGE_ICON;
}

/** Cột trái 25% — nav chính + Lối tắt của bạn (nhóm/trang đã truy cập). */
export default function MainLeftNav({ shortcuts = [] }: MainLeftNavProps) {
  const list = shortcuts.slice(0, SHORTCUTS_MAX);

  return (
    <aside className="hidden md:flex flex-col w-full min-w-0 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide">
      <nav className="p-3 space-y-1" aria-label="Điều hướng chính">
        {MAIN_NAV_ITEMS.map(({ to, title, path }, i) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/feed'}
            title={title}
            className={({ isActive }) =>
              [
                'main-left-nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors',
                isActive
                  ? 'bg-surf-primary/15 dark:bg-surf-primary/25 text-surf-primary dark:text-surf-secondary font-medium'
                  : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/80',
              ].join(' ')
            }
            style={{ animationDelay: `${i * 50}ms`, opacity: 0 }}
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
                <span className="text-sm truncate flex-1 min-w-0">{title}</span>
                {isActive && (
                  <span className="w-1.5 h-1.5 rounded-full bg-surf-primary dark:bg-surf-secondary flex-shrink-0" aria-hidden />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Lối tắt của bạn — nhóm/trang vào nhiều hoặc gần nhất; trống thì báo. */}
      <div className="flex-shrink-0 pt-2 pb-3 px-3 border-t border-gray-100 dark:border-gray-700/80">
        <h3 className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Lối tắt của bạn
        </h3>
        {list.length === 0 ? (
          <p className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400">
            Chưa có lối tắt. Truy cập Nhóm hoặc Trang để thấy lối tắt xuất hiện ở đây.
          </p>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {list.map((item) => (
              <li key={item.id}>
                <Link
                  to={item.href}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/80 transition-colors"
                >
                  <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700/80 flex items-center justify-center">
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                      <path d={getShortcutIconPath(item)} />
                    </svg>
                  </span>
                  <span className="text-sm truncate flex-1 min-w-0">{item.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
