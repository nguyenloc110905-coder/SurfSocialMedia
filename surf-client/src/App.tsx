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
  if (!user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function HomeOrRedirect() {
  const user = useAuthStore((s) => s.user);
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
          <Route path="groups" element={<Groups />} />
          <Route path="market" element={<MarketPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
