import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useThemeStore } from './stores/themeStore';
import { usePresence } from './hooks/usePresence';
import Layout from './components/layout/Layout';
import AuthPage from './pages/AuthPage';
import ForgotPassword from './pages/ForgotPassword';
import Feed from './pages/Feed';
import Profile from './pages/Profile';
import PostPage from './pages/PostPage';
import ShortVideo from './pages/ShortVideo';
import Friends from './pages/Friends';
import Groups from './pages/Groups';
import GroupDetails from './pages/GroupDetails';
import SettingsPage from './pages/settings/SettingsPage';
import MarketPage from './pages/MarketPage';
import PlaceholderPage from './pages/PlaceholderPage';
import Onboarding from './pages/Onboarding';
import SearchPage from './pages/SearchPage';
import Waves from './pages/Waves';
import LivePage from './pages/LivePage';
import EventsPage from './pages/EventsPage';
import GroupLiveKitCallPage from './pages/GroupLiveKitCallPage';
import { GlobalCallProvider } from './components/call/GlobalCallProvider';
import SavedPage from './pages/SavedPage';
import HashtagPage from './pages/HashtagPage';
import HelpSupportPage from './pages/HelpSupportPage';
import AdminSupportPage from './pages/AdminSupportPage';
import { useMessageSound } from './hooks/useMessageSound';
import { useSessionHeartbeat } from './hooks/useSessionHeartbeat';
import PolicyPage from './pages/PolicyPage';
import NetworkStatusToast from './components/ui/NetworkStatusToast';
import BoostPaymentReturnPage from './pages/BoostPaymentReturnPage';

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
    if (typeof window === 'undefined')
      return () => {
        unsub();
      };
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
  usePresence();
  useMessageSound();
  useSessionHeartbeat();
  const loading = useAuthStore((s) => s.loading);
  const location = useLocation();

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

  // Lưu URL gốc vào state để sau khi login có thể redirect về đúng trang
  if (!user) return <Navigate to="/" replace state={{ from: location }} />;
  return <>{children}</>;
}

function HomeOrRedirect() {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const location = useLocation();
  const from = (location.state as { from?: Location })?.from?.pathname ?? '/feed';

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

  // Sau khi login, redirect về trang user muốn vào ban đầu
  if (user) return <Navigate to={from} replace />;
  return <AuthPage />;
}

export default function App() {
  return (
    <GlobalCallProvider>
      <ThemeInit />
      <Routes>
        <Route path="/" element={<HomeOrRedirect />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/register" element={<AuthPage />} />
        {/* / là trang xuất phát = form đăng nhập; /login, /register dùng chung AuthPage */}
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/sandbox/boost-payment-return" element={<BoostPaymentReturnPage />} />
        <Route
          path="/onboarding"
          element={
            <Protected>
              <Onboarding />
            </Protected>
          }
        />
        <Route
          path="/feed"
          element={
            <Protected>
              <Layout />
            </Protected>
          }
        >
          <Route index element={<Feed />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="profile/:uid" element={<Profile />} />
          <Route path="post/:postId" element={<PostPage />} />
          <Route path="short-video" element={<ShortVideo />} />
          <Route path="friends" element={<Friends />} />
          <Route path="friends/requests" element={<Friends />} />
          <Route path="friends/suggestions" element={<Friends />} />
          <Route path="friends/all" element={<Friends />} />
          <Route path="friends/birthdays" element={<Friends />} />
          <Route path="friends/history" element={<Friends />} />
          <Route path="friends/blocked" element={<Friends />} />
          <Route path="groups" element={<Groups />} />
          <Route path="groups/:groupId" element={<GroupDetails />} />
          <Route path="market" element={<MarketPage />} />
          <Route path="market/:listingId" element={<MarketPage />} />
          <Route path="saved" element={<SavedPage />} />
          <Route path="hashtag/:tag" element={<HashtagPage />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="waves" element={<Waves />} />
          <Route path="live" element={<LivePage />} />
          <Route path="live/:streamId" element={<LivePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="help-support" element={<HelpSupportPage />} />
          <Route path="admin/support" element={<AdminSupportPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
        <Route
          path="/call-window"
          element={
            <Protected>
              <div className="min-h-screen bg-slate-950" />
            </Protected>
          }
        />
        <Route
          path="/group-call-window"
          element={
            <Protected>
              <GroupLiveKitCallPage />
            </Protected>
          }
        />
        <Route path="/policy" element={<PolicyPage />} />
      </Routes>
      <NetworkStatusToast />
    </GlobalCallProvider>
  );
}
