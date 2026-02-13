import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useThemeStore } from './stores/themeStore';
import Layout from './components/layout/Layout';
import AuthPage from './pages/AuthPage';
import ForgotPassword from './pages/ForgotPassword';
import Feed from './pages/Feed';
import Profile from './pages/Profile';
import ShortVideo from './pages/ShortVideo';
import Friends from './pages/Friends';
import Groups from './pages/Groups';
import SettingsPage from './pages/SettingsPage';
import MarketPage from './pages/MarketPage';
import PlaceholderPage from './pages/PlaceholderPage';

function ThemeInit() {
  const theme = useThemeStore((s) => s.theme);
  const applyTheme = useThemeStore((s) => s.applyTheme);
  useEffect(() => {
    applyTheme();
  }, [theme, applyTheme]);
  useEffect(() => {
    const unsub = useThemeStore.persist.onFinishHydration(() => {
      useThemeStore.getState().applyTheme();
    });
    useThemeStore.persist.rehydrate();
    useThemeStore.getState().applyTheme();
    if (typeof window === 'undefined') return () => { unsub(); };
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => {
      if (useThemeStore.getState().theme === 'system') useThemeStore.getState().applyTheme();
    };
    mq.addEventListener('change', listener);
    return () => {
      mq.removeEventListener('change', listener);
      unsub();
    };
  }, []);
  return null;
}

function Protected({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  
  // Đợi auth loading xong trước khi redirect
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-surf-dark">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-surf-primary dark:border-surf-secondary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Đang tải...</p>
        </div>
      </div>
    );
  }
  
  if (!user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function HomeOrRedirect() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  
  // Đợi auth loading xong trước khi redirect
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-surf-dark">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-surf-primary dark:border-surf-secondary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Đang tải...</p>
        </div>
      </div>
    );
  }
  
  if (user) return <Navigate to="/feed" replace />;
  return <AuthPage />;
}

export default function App() {
  return (
    <>
      <ThemeInit />
      <Routes>
        <Route path="/" element={<HomeOrRedirect />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/register" element={<AuthPage />} />
        {/* / là trang xuất phát = form đăng nhập; /login, /register dùng chung AuthPage */}
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route
          path="/feed"
          element={
            <Protected>
              <Layout />
            </Protected>
          }
        >
          <Route index element={<Feed />} />
          <Route path="profile/:uid" element={<Profile />} />
          <Route path="short-video" element={<ShortVideo />} />
          <Route path="friends" element={<Friends />} />
          <Route path="friends/requests" element={<Friends />} />
          <Route path="friends/suggestions" element={<Friends />} />
          <Route path="friends/all" element={<Friends />} />
          <Route path="friends/birthdays" element={<Friends />} />
          <Route path="friends/history" element={<Friends />} />
          <Route path="groups" element={<Groups />} />
          <Route path="market" element={<MarketPage />} />
          <Route path="saved" element={<PlaceholderPage title="Đã lưu" description="Bài viết và nội dung bạn đã lưu." />} />
          <Route path="events" element={<PlaceholderPage title="Sự kiện" description="Sự kiện sắp diễn ra và đã tham gia." />} />
          <Route path="pages" element={<PlaceholderPage title="Trang" description="Trang bạn quản lý và theo dõi." />} />
          <Route path="waves" element={<PlaceholderPage title="Waves" description="Nhắn tin nhanh — công cụ trò chuyện của Surf." />} />
          <Route path="explore" element={<PlaceholderPage title="Khám phá" description="Khám phá nội dung và chủ đề phù hợp với bạn." />} />
          <Route path="moments" element={<PlaceholderPage title="Moments" description="Khoảnh khắc 24h từ bạn bè và cộng đồng — tương tự Story." />} />
          <Route path="live" element={<PlaceholderPage title="Surf Live" description="Phát trực tiếp và xem live." />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
