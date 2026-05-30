import { create } from 'zustand';
import { api } from '@/lib/api';

export type NotificationType =
  | 'friend_request'
  | 'friend_accept'
  | 'post_reaction'
  | 'comment'
  | 'mention'
  | 'share'
  | 'missed_call'
  | 'system';

export type NotificationPrefs = Record<NotificationType, boolean>;

export type UserProfile = {
  id: string;
  displayName?: string;
  photoURL?: string;
  coverImageUrl?: string | null;
  bio?: string | null;
  currentCity?: string | null;
  hometown?: string | null;
  birthday?: string | null;
  relationship?: string | null;
  work?: Array<{ company: string; title?: string; current?: boolean }>;
  education?: Array<{ school: string; degree?: string; year?: string }>;
  email?: string;
  defaultPostPrivacy: 'public' | 'friends' | 'only-me' | 'custom';
  friendRequestPrivacy: 'everyone' | 'friends_of_friends';
  notificationPrefs: NotificationPrefs;
};

type UserState = {
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  fetchProfile: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
};

export const useUserStore = create<UserState>((set, get) => ({
  profile: null,
  loading: false,
  error: null,

  fetchProfile: async () => {
    set({ loading: true, error: null });
    try {
      const data = await api.get<UserProfile>('/api/users/me');
      set({ profile: data, loading: false });
    } catch (e: any) {
      set({ error: e.message || 'Lỗi khi tải profile', loading: false });
    }
  },

  updateProfile: async (data: Partial<UserProfile>) => {
    const prev = get().profile;
    // Optimistic update
    if (prev) {
      set({ profile: { ...prev, ...data } });
    }
    
    try {
      const updated = await api.put<UserProfile>('/api/users/me', data);
      set({ profile: updated });
    } catch (e: any) {
      // Revert on error
      if (prev) set({ profile: prev });
      set({ error: e.message || 'Lỗi khi cập nhật profile' });
      throw e;
    }
  },
}));
