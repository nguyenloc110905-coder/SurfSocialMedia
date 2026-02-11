import { Outlet } from 'react-router-dom';
import Header from './Header';

export default function Layout() {
  return (
    <div className="min-h-screen bg-surf-light">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
