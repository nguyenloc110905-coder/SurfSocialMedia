import { create } from 'zustand';

interface PresenceStore {
  onlineUsers: Set<string>;
  lastSeen: Map<string, number>; // uid -> Unix ms timestamp (only for offline users)
  visibleUsers: Set<string>; // users whose presence can be shown (friends)
  setOnline: (uid: string) => void;
  setOffline: (uid: string, ts: number) => void;
  setKnownOffline: (uid: string, ts?: number | null) => void;
  setInitial: (uids: string[], lastSeen: Record<string, number>) => void;
  isOnline: (uid: string) => boolean;
  getLastSeen: (uid: string) => number | undefined;
  canViewStatus: (uid: string) => boolean;
}

export const usePresenceStore = create<PresenceStore>((set, get) => ({
  onlineUsers: new Set(),
  lastSeen: new Map(),
  visibleUsers: new Set(),

  setOnline: (uid) =>
    set((state) => {
      const nextOnline = new Set(state.onlineUsers);
      nextOnline.add(uid);
      const nextLastSeen = new Map(state.lastSeen);
      nextLastSeen.delete(uid);
      const nextVisibleUsers = new Set(state.visibleUsers);
      nextVisibleUsers.add(uid);
      return { onlineUsers: nextOnline, lastSeen: nextLastSeen, visibleUsers: nextVisibleUsers };
    }),

  setOffline: (uid, ts) =>
    set((state) => {
      const nextOnline = new Set(state.onlineUsers);
      nextOnline.delete(uid);
      const nextLastSeen = new Map(state.lastSeen);
      nextLastSeen.set(uid, ts);
      const nextVisibleUsers = new Set(state.visibleUsers);
      nextVisibleUsers.add(uid);
      return { onlineUsers: nextOnline, lastSeen: nextLastSeen, visibleUsers: nextVisibleUsers };
    }),

  setKnownOffline: (uid, ts) =>
    set((state) => {
      const nextOnline = new Set(state.onlineUsers);
      nextOnline.delete(uid);
      const nextLastSeen = new Map(state.lastSeen);
      if (typeof ts === 'number' && Number.isFinite(ts)) {
        nextLastSeen.set(uid, ts);
      } else {
        nextLastSeen.delete(uid);
      }
      const nextVisibleUsers = new Set(state.visibleUsers);
      nextVisibleUsers.add(uid);
      return { onlineUsers: nextOnline, lastSeen: nextLastSeen, visibleUsers: nextVisibleUsers };
    }),

  setInitial: (uids, lastSeenRecord) =>
    set((state) => {
      const nextOnline = new Set(state.onlineUsers);
      const nextLastSeen = new Map(state.lastSeen);
      const nextVisibleUsers = new Set(state.visibleUsers);

      uids.forEach((uid) => {
        nextOnline.add(uid);
        nextLastSeen.delete(uid);
        nextVisibleUsers.add(uid);
      });

      Object.entries(lastSeenRecord).forEach(([uid, ts]) => {
        nextOnline.delete(uid);
        nextLastSeen.set(uid, ts);
        nextVisibleUsers.add(uid);
      });

      return { onlineUsers: nextOnline, lastSeen: nextLastSeen, visibleUsers: nextVisibleUsers };
    }),

  isOnline: (uid) => get().onlineUsers.has(uid),
  getLastSeen: (uid) => get().lastSeen.get(uid),
  canViewStatus: (uid) => get().visibleUsers.has(uid),
}));
