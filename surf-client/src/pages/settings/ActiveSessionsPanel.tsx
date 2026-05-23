import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

interface Session {
  id: string;
  os: string;
  browser: string;
  device: string;
  ip: string;
  lastActive: { _seconds: number } | string | null;
  createdAt: { _seconds: number } | string | null;
}

function formatDate(input: { _seconds: number } | string | null | undefined): string {
  if (!input) return 'Không rõ';
  let date: Date;
  if (typeof input === 'object' && '_seconds' in input) {
    date = new Date(input._seconds * 1000);
  } else {
    date = new Date(input);
  }
  return date.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

function getIconForDevice(device: string, os: string) {
  if (device === 'Mobile') {
    return (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    );
  }
  if (os === 'macOS') {
    return (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    );
  }
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

export default function ActiveSessionsPanel() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const currentSessionId = localStorage.getItem('surf_session_id');

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const res = await api.get<{ sessions: Session[] }>('/api/users/me/sessions');
      setSessions(res.sessions || []);
    } catch (e) {
      setError((e as Error).message || 'Không thể tải danh sách phiên đăng nhập.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleRevoke = async (id: string) => {
    if (!window.confirm('Bạn có chắc muốn đăng xuất thiết bị này?')) return;
    try {
      setRevoking(id);
      await api.delete(`/api/users/me/sessions/${id}`);
      setSessions(prev => prev.filter(s => s.id !== id));
    } catch (e) {
      alert('Đăng xuất thất bại: ' + ((e as Error).message));
    } finally {
      setRevoking(null);
    }
  };

  if (loading) {
    return <div className="text-sm text-slate-500">Đang tải...</div>;
  }

  if (error) {
    return <div className="text-sm text-red-500">{error}</div>;
  }

  return (
    <div className="space-y-4">
      {sessions.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Không có thiết bị nào khác.</p>
      ) : (
        sessions.map(session => {
          const isCurrent = session.id === currentSessionId;
          return (
            <div key={session.id} className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <div className="text-slate-400 dark:text-slate-500">
                {getIconForDevice(session.device, session.os)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                  {session.os} • {session.browser}
                  {isCurrent && <span className="ml-2 px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px] uppercase font-bold">Hiện tại</span>}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {session.ip}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  Hoạt động: {formatDate(session.lastActive)}
                </p>
              </div>
              {!isCurrent && (
                <button
                  type="button"
                  onClick={() => handleRevoke(session.id)}
                  disabled={revoking === session.id}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                >
                  {revoking === session.id ? 'Đang xử lý...' : 'Đăng xuất'}
                </button>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
