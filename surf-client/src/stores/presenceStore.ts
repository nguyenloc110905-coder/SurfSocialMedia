import { create } from 'zustand';

interface PresenceStore {
  onlineUsers: Set<string>;
  lastSeen: Map<string, number>; // uid -> Unix ms timestamp (only for offline users)
  setOnline: (uid: string) => void;
  setOffline: (uid: string, ts: number) => void;
  setInitial: (uids: string[], lastSeen: Record<string, number>) => void;
  isOnline: (uid: string) => boolean;
  getLastSeen: (uid: string) => number | undefined;
}

export const usePresenceStore = create<PresenceStore>((set, get) => ({
  onlineUsers: new Set(),
  lastSeen: new Map(),

  setOnline: (uid) =>
    set((state) => {
      const nextLastSeen = new Map(state.lastSeen);
      nextLastSeen.delete(uid);
      return { onlineUsers: new Set([...state.onlineUsers, uid]), lastSeen: nextLastSeen };
    }),

  setOffline: (uid, ts) =>
    set((state) => {
      const nextOnline = new Set(state.onlineUsers);
      nextOnline.delete(uid);
      const nextLastSeen = new Map(state.lastSeen);
      nextLastSeen.set(uid, ts);
      return { onlineUsers: nextOnline, lastSeen: nextLastSeen };
    }),

  setInitial: (uids, lastSeenRecord) =>
    set({
      onlineUsers: new Set(uids),
      lastSeen: new Map(Object.entries(lastSeenRecord)),
    }),

  isOnline: (uid) => get().onlineUsers.has(uid),
  getLastSeen: (uid) => get().lastSeen.get(uid),
}));
