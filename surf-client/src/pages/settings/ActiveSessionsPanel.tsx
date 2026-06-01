import { useState, useEffect } from 'react';
import { api, DEVICE_ID } from '@/lib/api';

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

  const currentSessionId = DEVICE_ID;

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
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="border-b border-slate-200 pb-5 dark:border-slate-700/80">
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Thiết bị đăng nhập
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Quản lý các thiết bị đang sử dụng tài khoản của bạn. Bạn chỉ được phép đăng nhập trên tối đa 2 thiết bị cùng lúc.
        </p>
      </div>

      <div className="space-y-4">
        {sessions.length === 0 ? (
          <div className="text-sm text-slate-500 text-center py-8">
            Không có dữ liệu thiết bị.
          </div>
        ) : (
          sessions.map(session => (
            <div
              key={session.id}
              className={`flex items-center justify-between p-4 rounded-xl border ${
                session.id === currentSessionId
                  ? 'border-surf-primary/50 bg-surf-primary/5 dark:bg-surf-primary/10'
                  : 'border-slate-200 bg-white dark:border-slate-700/60 dark:bg-slate-800'
              }`}
            >
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 rounded-lg">
                  {getIconForDevice(session.device, session.os)}
                </div>
                <div>
                  <div className="font-medium text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    {session.os} • {session.browser}
                    {session.id === currentSessionId && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 font-medium">
                        Thiết bị này
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                    {session.ip}
                  </div>
                  <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    Hoạt động: {formatDate(session.lastActive)}
                  </div>
                </div>
              </div>
              
              {session.id !== currentSessionId && (
                <button
                  onClick={() => handleRevoke(session.id)}
                  disabled={revoking === session.id}
                  className="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-lg transition-colors disabled:opacity-50"
                >
                  {revoking === session.id ? 'Đang xuất...' : 'Đăng xuất'}
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
