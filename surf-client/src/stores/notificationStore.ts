import { create } from 'zustand';
import { api } from '@/lib/api';
import { useAuthStore } from './authStore';
import { getSocket } from '@/lib/socket';

export interface Notification {
  id: string;
  toUid: string;
  fromUid: string;
  fromName: string;
  fromPhoto: string | null;
  type: 'like_post' | 'comment_post' | 'new_post' | 'friend_request' | 'reminder';
  postId?: string;
  message: string;
  read: boolean;
  createdAt: any;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  loaded: boolean;
  load: () => Promise<void>;
  markAllRead: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  addLocal: (n: Notification) => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loaded: false,

  load: async () => {
    try {
      const [nRes, cRes] = await Promise.all([
        api.get<{ notifications: Notification[] }>('/api/notifications'),
        api.get<{ count: number }>('/api/notifications/unread-count'),
      ]);
      set({
        notifications: nRes?.notifications ?? [],
        unreadCount: cRes?.count ?? 0,
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },

  markAllRead: async () => {
    try {
      await api.patch('/api/notifications/read-all', {});
      set((s) => ({
        notifications: s.notifications.map((n) => ({ ...n, read: true })),
        unreadCount: 0,
      }));
    } catch { /* ignore */ }
  },

  markRead: async (id: string) => {
    try {
      await api.patch(`/api/notifications/${id}/read`, {});
      set((s) => ({
        notifications: s.notifications.map((n) => n.id === id ? { ...n, read: true } : n),
        unreadCount: Math.max(0, s.unreadCount - 1),
      }));
    } catch { /* ignore */ }
  },

  addLocal: (n: Notification) => {
    set((s) => ({
      notifications: [n, ...s.notifications],
      unreadCount: s.unreadCount + 1,
    }));
  },
}));

// Auto-load + realtime listener
let unsub: (() => void) | null = null;
function initNotificationSync() {
  unsub?.();
  unsub = useAuthStore.subscribe((state, prev) => {
    if (state.user && !prev.user) {
      setTimeout(() => {
        useNotificationStore.getState().load();
        // Listen for realtime notifications
        const socket = getSocket();
        socket.off('notification');
        socket.on('notification', (data: any) => {
          useNotificationStore.getState().addLocal({
            id: `rt_${Date.now()}`,
            ...data,
          });
        });
      }, 2500);
    }
    if (!state.user && prev.user) {
      useNotificationStore.setState({ notifications: [], unreadCount: 0, loaded: false });
      const socket = getSocket();
      socket.off('notification');
    }
  });
  if (useAuthStore.getState().user) {
    setTimeout(() => {
      useNotificationStore.getState().load();
      const socket = getSocket();
      socket.off('notification');
      socket.on('notification', (data: any) => {
        useNotificationStore.getState().addLocal({
          id: `rt_${Date.now()}`,
          ...data,
        });
      });
    }, 2500);
  }
}
initNotificationSync();
