import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/authStore';

interface Notification {
  id: string;
  type: string;
  actorId: string;
  actorName: string;
  actorPhoto: string | null;
  postId?: string;
  postSnippet?: string;
  commentSnippet?: string;
  reaction?: string;
  requestId?: string;
  message?: string;
  entityType?: string;
  entityId?: string;
  read: boolean;
  createdAt: { _seconds?: number; seconds?: number } | string;
}

export default function NotificationBell() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api.get<{ notifications: Notification[] }>('/api/notifications');
      setNotifications(res.notifications ?? []);
    } catch {
      // silently ignore
    }
  }, [user]);

  // Initial load
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Real-time socket listener
  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    const handler = (notif: Notification) => {
      setNotifications((prev) => [notif, ...prev]);
    };
    socket.on('notification:new', handler);
    return () => {
      socket.off('notification:new', handler);
    };
  }, [user]);

  // Close panel when clicking outside
  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  const markAllRead = async () => {
    try {
      await api.patch('/api/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // silently ignore
    }
  };

  const markRead = async (id: string) => {
    // fr-xxx ids are transient (built from friendRequestReceived event, no Firestore doc)
    if (id.startsWith('fr-')) {
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      return;
    }
    try {
      await api.patch(`/api/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    } catch {
      // silently ignore
    }
  };

  const handleNotifClick = async (notif: Notification) => {
    if (!notif.read) await markRead(notif.id);
    setOpen(false);
    switch (notif.type) {
      case 'friend_request':
        navigate('/feed/friends/requests');
        break;
      case 'system':
        if (notif.entityType === 'group' && notif.entityId) {
          navigate(`/feed/groups/${notif.entityId}`);
        } else {
          navigate('/feed');
        }
        break;
      case 'tag':
      case 'reaction':
      case 'comment':
      case 'reply':
      case 'comment_reaction':
      case 'mention':
        if (notif.postId) navigate(`/feed/post/${notif.postId}`);
        break;
      default:
        if (notif.entityType === 'group' && notif.entityId) {
          navigate(`/feed/groups/${notif.entityId}`);
        } else {
          navigate('/feed');
        }
    }
  };

  const formatTime = (createdAt: Notification['createdAt']) => {
    let ts: number | undefined;
    if (typeof createdAt === 'string') {
      ts = new Date(createdAt).getTime();
    } else if (createdAt && typeof createdAt === 'object') {
      const s = createdAt._seconds ?? createdAt.seconds;
      if (s !== undefined) ts = s * 1000;
    }
    if (!ts) return '';
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  };

  const stripMentionMarkup = (text: string) =>
    text.replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1');

  const notifLabel = (n: Notification) => {
    const name = <span className="font-semibold text-gray-900 dark:text-gray-100">{n.actorName}</span>;
    const rawSnippet = n.commentSnippet ?? n.postSnippet;
    const snippet = rawSnippet
      ? (
          <span className="block text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate max-w-[220px]">
            "{stripMentionMarkup(rawSnippet)}"
          </span>
        )
      : null;
    if (n.type === 'tag') return <>{name}{' đã gắn thẻ bạn trong một bài viết'}{snippet}</>;
    if (n.type === 'friend_request') return <>{name}{' đã gửi lời mời kết bạn với bạn'}</>;
    if (n.type === 'reaction') return <>{name}{` đã bày tỏ cảm xúc ${n.reaction ?? '❤️'} với bài viết của bạn`}{snippet}</>;
    if (n.type === 'comment') return <>{name}{' đã bình luận về bài viết của bạn'}{snippet}</>;
    if (n.type === 'reply') return <>{name}{' đã trả lời bình luận của bạn'}{snippet}</>;
    if (n.type === 'comment_reaction') return <>{name}{` đã thả ${n.reaction ?? '❤️'} vào bình luận của bạn`}{snippet}</>;
    if (n.type === 'mention') return <>{name}{' đã nhắc đến bạn trong một bình luận'}{snippet}</>;
    if (n.message) return <>{n.message}</>;
    return <>{name}{' đã thông báo cho bạn'}</>;
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="hidden sm:inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition-colors relative"
        title="Thông báo"
      >
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
          <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Thông báo</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline"
              >
                Đánh dấu đã đọc
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                Chưa có thông báo
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleNotifClick(n)}
                  className={`w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                    !n.read ? 'bg-cyan-50/60 dark:bg-cyan-900/20' : ''
                  }`}
                >
                  {/* Avatar */}
                  {n.actorPhoto ? (
                    <img
                      src={n.actorPhoto}
                      alt={n.actorName}
                      className="w-10 h-10 rounded-full flex-shrink-0 object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full flex-shrink-0 bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                      <span className="text-sm font-bold text-white">
                        {(n.actorName || 'S').charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug">
                      {notifLabel(n)}
                    </p>
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {formatTime(n.createdAt)}
                    </span>
                  </div>
                  {!n.read && (
                    <span className="mt-1 w-2 h-2 rounded-full bg-cyan-500 flex-shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
