import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import Layout from './components/layout/Layout';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Feed from './pages/Feed';
import Profile from './pages/Profile';

function Protected({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function HomeOrRedirect() {
  const user = useAuthStore((s) => s.user);
  if (user) return <Navigate to="/feed" replace />;
  return <Landing />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeOrRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
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
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
