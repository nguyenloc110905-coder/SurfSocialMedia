import { useState, useRef, useEffect } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { signOut } from '@/lib/firebase/auth';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import type { ThemeMode } from '@/stores/themeStore';
import SettingsPrivacy from './SettingsPrivacy';
import HelpSupport from './HelpSupport';

type Panel = 'main' | 'settings' | 'help' | 'display';

const CENTER_NAV = [
  { to: '/feed', title: 'Feed', path: 'M10.3 2.7 3 9.19V20a2 2 0 0 0 2 2h5v-6h4v6h5a2 2 0 0 0 2-2V9.19L13.7 2.7a2 2 0 0 0-2.4 0Z' },
  { to: '/feed/short-video', title: 'Surf Clips', path: 'M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4Z' },
  { to: '/feed/friends', title: 'Bạn bè', path: 'M12 12a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm5-3a2.5 2.5 0 1 0-2.5 2.5A2.5 2.5 0 0 0 17 9Zm-10 0A2.5 2.5 0 1 0 9.5 6.5 2.5 2.5 0 0 0 7 9Zm0 2a3.5 3.5 0 0 0-3.5 3.5V16a1 1 0 0 0 1 1h5v-2a4.986 4.986 0 0 1 1.29-3.33A3.482 3.482 0 0 0 7 11Zm5 1a3.5 3.5 0 0 0-3.5 3.5V17a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-1.5A3.5 3.5 0 0 0 12 12Zm5 0a3.482 3.482 0 0 0-3.79 2.67A4.986 4.986 0 0 1 14 16v1h5a1 1 0 0 0 1-1v-.5A3.5 3.5 0 0 0 17 12Z' },
  { to: '/feed/groups', title: 'Nhóm', path: 'M12 2a4 4 0 0 1 4 4v1h.5a3.5 3.5 0 0 1 3.5 3.5v7a3.5 3.5 0 0 1-3.5 3.5h-9A3.5 3.5 0 0 1 3.5 17.5v-7A3.5 3.5 0 0 1 7 7h.5V6a4 4 0 0 1 4-4Zm0 2a2 2 0 0 0-2 2v1h4V6a2 2 0 0 0-2-2Zm-2 6a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm-6 2.5a1.5 1.5 0 0 0-1.5 1.5v2.5h3v-2.5a1.5 1.5 0 0 0-1.5-1.5Zm6 0a1.5 1.5 0 0 0-1.5 1.5v2.5h3v-2.5a1.5 1.5 0 0 0-1.5-1.5Z' },
  { to: '/feed/market', title: 'Surf Market', path: 'M4 6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2h4a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h4V6zm8 0V6a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2h8z' },
] as const;

type HeaderProps = { hideCenterNav?: boolean };

export default function Header({ hideCenterNav = false }: HeaderProps) {
  const user = useAuthStore((s) => s.user);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>('main');
  const menuRef = useRef<HTMLDivElement>(null);

  const viewIndex = { main: 0, settings: 1, help: 2, display: 3 }[panel];

  useEffect(() => {
    setOpen(false);
    setPanel('main');
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  const displayName = user?.displayName?.trim() || 'Người dùng';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-b border-gray-200 dark:border-gray-700 safe-area-header flex items-center justify-between h-12 sm:h-14 px-3 sm:px-6 lg:px-8 gap-2 sm:gap-4 relative">
      {/* Trái: logo + tìm kiếm — khi có cột trái (hideCenterNav) giới hạn bằng chiều rộng cột */}
      <div className={`flex items-center gap-2 sm:gap-4 flex-1 min-w-0 ${hideCenterNav ? 'max-w-[25%]' : 'max-w-[50%]'}`}>
        <Link to="/feed" className="flex-shrink-0">
          <img src="/DashboardLogo.png" alt="Surf" className="h-7 sm:h-9 w-auto object-contain dark:invert dark:brightness-90" />
        </Link>
        <div className={`hidden sm:flex items-center gap-2 bg-gray-100 dark:bg-gray-700 rounded-full px-3 py-1.5 flex-1 min-w-[80px] ${hideCenterNav ? 'max-w-[140px] md:max-w-[160px] lg:max-w-[200px]' : 'max-w-[260px] sm:max-w-[300px] lg:max-w-[340px]'}`}>
          <svg className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
          </svg>
          <input
            type="search"
            placeholder="Tìm kiếm trên Surf"
            className="bg-transparent border-none outline-none text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 w-full"
            aria-label="Tìm kiếm trên Surf"
          />
        </div>
      </div>

      {/* Giữa: nav chỉ icon — ẩn trên desktop khi dùng cột trái (layout 25-50-25) */}
      {!hideCenterNav && (
      <nav className="hidden md:flex absolute left-1/2 top-0 bottom-0 -translate-x-1/2 items-center justify-center gap-2 pointer-events-none">
        <div className="flex items-center gap-8 sm:gap-12 lg:gap-16 pointer-events-auto">
          {CENTER_NAV.map(({ to, title, path }) => (
            <NavLink
              key={to}
              to={to}
              title={title}
              className={({ isActive }) =>
                [
                  'relative flex items-center justify-center min-w-[48px] h-12 px-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors',
                  isActive ? 'text-surf-primary dark:text-surf-primary' : '',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor" aria-hidden="true">
                    <path d={path} />
                  </svg>
                  {isActive && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-surf-primary rounded-full" />}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
      )}

      {/* Phải: grid, tin nhắn, thông báo, avatar */}
      <div className="flex items-center justify-end gap-2 sm:gap-3 lg:gap-5 flex-shrink-0 min-w-0" ref={menuRef}>
        <button type="button" className="hidden sm:inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition-colors" title="Menu">
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
            <path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z" />
          </svg>
        </button>
        <button type="button" className="hidden sm:inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition-colors" title="Tin nhắn">
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M12 2C6.48 2 2 6.48 2 12c0 1.54.36 2.98.97 4.29L2 22l5.71-.97C9.02 21.64 10.46 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.58 0-3.05-.5-4.25-1.35l-.98-.63-2.1.29.29-2.08-.65-1.01C5.5 16.05 5 14.58 5 13c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7z" clipRule="evenodd" />
          </svg>
        </button>
        <button type="button" className="hidden sm:inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition-colors" title="Thông báo">
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
            <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden hover:ring-2 hover:ring-cyan-400 dark:hover:ring-cyan-500 transition-all flex-shrink-0"
          aria-expanded={open}
          aria-haspopup="true"
        >
          {user?.photoURL ? (
            <img src={user.photoURL} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <span className="text-white font-bold text-xs sm:text-sm">{initial}</span>
            </div>
          )}
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-2 w-80 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl overflow-hidden z-30">
            <div className="flex transition-transform duration-300 ease-out" style={{ transform: `translateX(-${viewIndex * 100}%)` }}>
              {/* Panel 0: Main */}
              <div className="w-80 flex-shrink-0 py-2">
                <Link
                  to={`/feed/profile/${user?.uid}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 mx-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                      <span className="text-white font-bold text-sm">{initial}</span>
                    </div>
                  )}
                  <span className="font-medium text-gray-900 dark:text-gray-100">{displayName}</span>
                </Link>
                <Link
                  to={`/feed/profile/${user?.uid}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 mx-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-200"
                >
                  <svg className="w-5 h-5 text-gray-500 dark:text-gray-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Xem tất cả trang cá nhân</span>
                </Link>
                <div className="border-t border-gray-100 dark:border-gray-700 my-2" />
                <button type="button" onClick={() => setPanel('settings')} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 transition-colors text-gray-700 dark:text-gray-200">
                  <svg className="w-5 h-5 text-gray-500 dark:text-gray-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.04.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                  </svg>
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex-1">Cài đặt và quyền riêng tư</span>
                  <svg className="w-4 h-4 text-gray-400 dark:text-gray-500" viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" /></svg>
                </button>
                <button type="button" onClick={() => setPanel('help')} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 transition-colors text-gray-700 dark:text-gray-200">
                  <svg className="w-5 h-5 text-gray-500 dark:text-gray-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z" />
                  </svg>
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex-1">Trợ giúp và hỗ trợ</span>
                  <svg className="w-4 h-4 text-gray-400 dark:text-gray-500" viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" /></svg>
                </button>
                <button type="button" onClick={() => setPanel('display')} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 transition-colors text-gray-700 dark:text-gray-200">
                  <svg className="w-5 h-5 text-gray-500 dark:text-gray-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z" />
                  </svg>
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex-1">Màn hình và trợ năng</span>
                  <svg className="w-4 h-4 text-gray-400 dark:text-gray-500" viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" /></svg>
                </button>
                <button type="button" className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 transition-colors text-gray-700 dark:text-gray-200">
                  <svg className="w-5 h-5 text-gray-500 dark:text-gray-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" />
                  </svg>
                  <div className="flex-1 text-left">
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 block">Đóng góp ý kiến</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">CTRL B</span>
                  </div>
                </button>
                <div className="border-t border-gray-100 dark:border-gray-700 my-2" />
                <button
                  type="button"
                  onClick={() => { signOut(); setOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 transition-colors text-gray-700 dark:text-gray-200"
                >
                  <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
                  </svg>
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Đăng xuất</span>
                </button>
                <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 flex flex-wrap gap-x-1 gap-y-1">
                  <Link to="#" className="hover:underline hover:text-surf-primary dark:hover:text-surf-primary transition-colors">Quyền riêng tư</Link>
                  <span>·</span>
                  <Link to="#" className="hover:underline hover:text-surf-primary dark:hover:text-surf-primary transition-colors">Điều khoản</Link>
                </div>
              </div>

              {/* Panel 1: Cài đặt và quyền riêng tư — nhấp "Cài đặt" mở trang full /feed/settings */}
              <div className="flex-shrink-0">
                <SettingsPrivacy
                  onBack={() => setPanel('main')}
                  onOpenSettingsPage={() => {
                    setOpen(false);
                    setPanel('main');
                    navigate('/feed/settings');
                  }}
                />
              </div>

              {/* Panel 2: Trợ giúp và hỗ trợ */}
              <div className="w-80 flex-shrink-0">
                <HelpSupport onBack={() => setPanel('main')} />
              </div>

              {/* Panel 3: Màn hình và trợ năng */}
              <div className="w-80 flex-shrink-0 py-2 max-h-[70vh] overflow-y-auto">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-700">
                  <button type="button" onClick={() => setPanel('main')} className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors" aria-label="Quay lại">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" /></svg>
                  </button>
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Màn hình và trợ năng</span>
                </div>
                <div className="px-3 py-3">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center flex-shrink-0 text-gray-700 dark:text-gray-200">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z" /></svg>
                    </span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">Chế độ tối</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 ml-12">Điều chỉnh giao diện để giảm độ chói và cho đôi mắt được nghỉ ngơi.</p>
                  <div className="ml-12 space-y-2">
                    {(['light', 'dark', 'system'] as const).map((value) => (
                      <label key={value} htmlFor={`theme-${value}`} className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          id={`theme-${value}`}
                          type="radio"
                          name="darkMode"
                          checked={theme === value}
                          onChange={() => setTheme(value)}
                          onMouseDown={(e) => e.stopPropagation()}
                          className="w-4 h-4 text-surf-primary border-gray-300 accent-surf-primary"
                        />
                        <span className="text-sm text-gray-800 dark:text-gray-200">
                          {value === 'light' ? 'Tắt' : value === 'dark' ? 'Bật' : 'Tự động'}
                        </span>
                      </label>
                    ))}
                    <p className="text-xs text-gray-500 dark:text-gray-400 pl-6">Tự động điều chỉnh theo cài đặt hệ thống trên thiết bị của bạn.</p>
                  </div>
                  <div className="flex items-center gap-3 mt-4 mb-2">
                    <span className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center flex-shrink-0 text-gray-700 dark:text-gray-200">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" /></svg>
                    </span>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">Chế độ Thu gọn</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 ml-12">Thu gọn menu để có thêm không gian.</p>
                  <div className="ml-12 space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="compact" defaultChecked className="w-4 h-4 text-surf-primary accent-surf-primary" />
                      <span className="text-sm text-gray-800 dark:text-gray-200">Tắt</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="compact" className="w-4 h-4 text-surf-primary accent-surf-primary" />
                      <span className="text-sm text-gray-800 dark:text-gray-200">Bật</span>
                    </label>
                  </div>
                  <button type="button" className="w-full flex items-center gap-3 py-3 text-left hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 transition-colors rounded-lg px-1 mt-2">
                    <span className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center flex-shrink-0 text-gray-700 dark:text-gray-200">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 5H8v-2h8v2zm0-3h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h2v2h-2v-2zm0-3h2V8h-2v2z" /></svg>
                    </span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Bàn phím</span>
                    <svg className="w-4 h-4 text-gray-400 dark:text-gray-500 ml-auto" viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" /></svg>
                  </button>
                  <button type="button" className="w-full flex items-center gap-3 py-3 text-left hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-100 dark:active:bg-gray-600 transition-colors rounded-lg px-1">
                    <span className="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center flex-shrink-0 text-gray-700 dark:text-gray-200">
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M16 4c0-1.11.89-2 2-2s2 .89 2 2-.89 2-2 2-2-.89-2-2zm4 18v-6h2.5L12 4 2.5 22H5v-6h3v6h2v-6h2v6h2v-6h4z" /></svg>
                    </span>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Cài đặt trợ năng</span>
                    <svg className="w-4 h-4 text-gray-400 dark:text-gray-500 ml-auto" viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" /></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
