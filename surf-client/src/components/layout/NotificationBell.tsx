import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';

type NotificationItem = {
  id: string;
  type: string;
  iconKey: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  entityType?: string;
  entityId?: string;
};

const MAX_ITEMS = 10;

const iconPathByKey: Record<string, string> = {
  'user-plus':
    'M15 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm-8 9a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v1H7v-1zm11-8V6h-2V4h-2v2h-2v2h2v2h2V8h2z',
  'user-check':
    'M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-7 7a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1H5v-1zm14.71-8.29-2 2-.71-.71-1.41 1.41L17 15.41l3.71-3.7-1-1.01z',
  heart:
    'M12 21s-6.72-4.35-9.33-8.22C.6 9.71 2.06 5.5 6.1 5.5c2.03 0 3.22 1.15 3.9 2.18.68-1.03 1.87-2.18 3.9-2.18 4.04 0 5.5 4.21 3.43 7.28C18.72 16.65 12 21 12 21z',
  'message-circle':
    'M4 5h16v10H7l-3 3V5zm3 4h10v2H7V9z',
  'at-sign':
    'M12 4a8 8 0 1 0 6.93 12h-2.24A6 6 0 1 1 18 12v1a1 1 0 0 1-2 0V9h-2v1.2A3 3 0 1 0 15 13v.04a3 3 0 0 0 5.99-.04V12A8 8 0 0 0 12 4zm0 11a1 1 0 1 1 1-1 1 1 0 0 1-1 1z',
  repeat:
    'M7 7h9l-2-2 1.41-1.41L20.24 8l-4.83 4.41L14 11l2-2H7a3 3 0 0 0 0 6h1v2H7A5 5 0 0 1 7 7zm10 2h1a5 5 0 0 1 0 10H9l2 2-1.41 1.41L4.76 18l4.83-4.41L11 15l-2 2h9a3 3 0 0 0 0-6h-1V9z',
  'phone-missed':
    'M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24 11.7 11.7 0 0 0 3.68.59 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.48a1 1 0 0 1 1 1 11.7 11.7 0 0 0 .59 3.68 1 1 0 0 1-.25 1.01Zm8.97-4.2 4 4 1.41-1.41-4-4L15.59 6.59l-1.41 1.41 1.41 1.41Z',
  info: 'M11 10h2v6h-2zm0-4h2v2h-2zm1 16a10 10 0 1 1 10-10 10 10 0 0 1-10 10z',
};

const formatRelativeTime = (value: string): string => {
  const ms = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'vừa xong';
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ`;
  const days = Math.floor(hours / 24);
  return `${days} ngày`;
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadCount = async () => {
      try {
        const data = await api.get<{ count: number }>('/api/notifications/unread-count');
        setCount(data.count);
      } catch (e) {
        console.warn('Không tải được unread notifications:', e);
      }
    };

    loadCount();

    const socket = getSocket();
    const onNew = (item: NotificationItem) => {
      setItems((current) => [item, ...current.filter((value) => value.id !== item.id)].slice(0, MAX_ITEMS));
    };
    const onUnreadCount = (payload: { count: number }) => setCount(payload.count);
    const onRead = (payload: { id: string }) => {
      setItems((current) =>
        current.map((item) => (item.id === payload.id ? { ...item, isRead: true } : item))
      );
    };
    const onReadAll = (payload: { ids: string[] }) => {
      const ids = new Set(payload.ids);
      setItems((current) =>
        current.map((item) => (ids.has(item.id) ? { ...item, isRead: true } : item))
      );
    };

    socket.on('notification:new', onNew);
    socket.on('notification:unread-count', onUnreadCount);
    socket.on('notification:read', onRead);
    socket.on('notification:read-all', onReadAll);

    return () => {
      socket.off('notification:new', onNew);
      socket.off('notification:unread-count', onUnreadCount);
      socket.off('notification:read', onRead);
      socket.off('notification:read-all', onReadAll);
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    const onOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  const loadItems = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await api.get<{ items: NotificationItem[] }>('/api/notifications?limit=10');
      setItems(data.items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      void loadItems();
    }
  };

  const markOneRead = async (id: string) => {
    try {
      const data = await api.patch<{ ok: true; count: number }>(`/api/notifications/${id}/read`);
      setCount(data.count);
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, isRead: true } : item))
      );
    } catch (e) {
      console.warn('Không mark read được notification:', e);
    }
  };

  const markAllRead = async () => {
    try {
      const data = await api.patch<{ ok: true; count: number }>('/api/notifications/read-all');
      setCount(data.count);
      setItems((current) => current.map((item) => ({ ...item, isRead: true })));
    } catch (e) {
      console.warn('Không mark all read được notifications:', e);
    }
  };

  return (
    <div className="relative hidden sm:block" ref={ref}>
      <button
        type="button"
        onClick={toggleOpen}
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition-colors"
        title="Thông báo"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
          <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
        </svg>
        {count > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl overflow-hidden z-40">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Thông báo</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{count} chưa đọc</p>
            </div>
            <button
              type="button"
              onClick={markAllRead}
              className="text-xs font-semibold text-surf-primary hover:opacity-80 transition-opacity disabled:opacity-40"
              disabled={count === 0}
            >
              Đánh dấu đã đọc hết
            </button>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {loading && <div className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400">Đang tải thông báo...</div>}
            {!loading && error && (
              <div className="px-4 py-6 text-sm text-red-500 dark:text-red-400">{error}</div>
            )}
            {!loading && !error && items.length === 0 && (
              <div className="px-4 py-8 text-sm text-gray-500 dark:text-gray-400">Chưa có thông báo nào.</div>
            )}
            {!loading &&
              !error &&
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (!item.isRead) {
                      void markOneRead(item.id);
                    }
                  }}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors ${
                    item.isRead
                      ? 'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/60'
                      : 'bg-cyan-50/80 dark:bg-cyan-900/10 hover:bg-cyan-50 dark:hover:bg-cyan-900/20'
                  }`}
                >
                  <span className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 flex items-center justify-center flex-shrink-0">
                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
                      <path d={iconPathByKey[item.iconKey] ?? iconPathByKey.info} />
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-gray-900 dark:text-gray-100">{item.message}</span>
                    <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                      {formatRelativeTime(item.createdAt)}
                    </span>
                  </span>
                  {!item.isRead && <span className="w-2.5 h-2.5 rounded-full bg-surf-primary flex-shrink-0 mt-2" />}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
