import { create } from 'zustand';
import { api } from '@/lib/api';
import { useAuthStore } from './authStore';

interface NicknameState {
  /** uid → biệt danh (chỉ mình thấy) */
  nicknames: Record<string, string>;
  loaded: boolean;
  /** Tải nicknames từ server */
  load: () => Promise<void>;
  /** Đặt / cập nhật 1 nickname (cập nhật local ngay) */
  set: (friendUid: string, nickname: string) => void;
  /** Xóa 1 nickname */
  remove: (friendUid: string) => void;
  /** Trả về biệt danh nếu có, ngược lại trả tên gốc */
  resolve: (uid: string, originalName: string) => string;
}

export const useNicknameStore = create<NicknameState>((set, get) => ({
  nicknames: {},
  loaded: false,

  load: async () => {
    try {
      const res = await api.get<{ nicknames: Record<string, string> }>('/api/friends/nicknames');
      set({ nicknames: res?.nicknames ?? {}, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  set: (friendUid, nickname) =>
    set((s) => ({ nicknames: { ...s.nicknames, [friendUid]: nickname } })),

  remove: (friendUid) =>
    set((s) => {
      const n = { ...s.nicknames };
      delete n[friendUid];
      return { nicknames: n };
    }),

  resolve: (uid, originalName) => {
    const nick = get().nicknames[uid];
    return nick || originalName;
  },
}));

// Auto-load nicknames khi user đăng nhập
let unsub: (() => void) | null = null;
function initNicknameSync() {
  unsub?.();
  unsub = useAuthStore.subscribe((state, prev) => {
    if (state.user && !prev.user) {
      // Đợi token sẵn sàng
      setTimeout(() => useNicknameStore.getState().load(), 2000);
    }
    if (!state.user && prev.user) {
      useNicknameStore.setState({ nicknames: {}, loaded: false });
    }
  });
  // Nếu user đã login sẵn
  if (useAuthStore.getState().user) {
    setTimeout(() => useNicknameStore.getState().load(), 2000);
  }
}
initNicknameSync();
