import { create } from 'zustand';
import type { User } from 'firebase/auth';
import {
  clearAuthPersistencePreference,
  getAuthPersistMode,
  signOut,
  subscribeAuth,
} from '@/lib/firebase/auth';
import { rememberAccount } from '@/lib/recentAccounts';

type AuthState = {
  user: User | null;
  loading: boolean;
  initialized: boolean;
  unsubscribe: (() => void) | null;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  initialize: () => () => void;
  resetAuth: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  initialized: false,
  unsubscribe: null,

  setUser: (user) => {
    set({ user });
  },

  setLoading: (loading) => set({ loading }),

  initialize: () => {
    const existingUnsubscribe = get().unsubscribe;
    if (existingUnsubscribe) {
      existingUnsubscribe();
    }

    let isInitialAuthEvent = true;
    set({ loading: true, initialized: false, unsubscribe: null });

    const resolveAuth = (user: User | null) => {
      if (user) {
        void rememberAccount(user).catch((err) => {
          console.warn('Failed to remember account:', err);
        });
      }
      set({ user, loading: false, initialized: true });
    };

    const unsubscribe = subscribeAuth((user) => {
      const isInitial = isInitialAuthEvent;
      isInitialAuthEvent = false;

      if (!isInitial || !user) {
        resolveAuth(user);
        return;
      }

      void getAuthPersistMode()
        .then(async (mode) => {
          if (mode === 'session') {
            await signOut();
            resolveAuth(null);
            return;
          }

          resolveAuth(user);
        })
        .catch((err) => {
          console.warn('Failed to read auth persistence mode:', err);
          resolveAuth(user);
        });
    });

    set({ unsubscribe });

    return () => {
      unsubscribe();
      if (get().unsubscribe === unsubscribe) {
        set({ unsubscribe: null });
      }
    };
  },

  resetAuth: async () => {
    try {
      await signOut();
      await clearAuthPersistencePreference();
      set({ user: null, loading: false, initialized: true });
    } catch (err) {
      console.error('Error resetting auth:', err);
      set({ user: null, loading: false, initialized: true });
    }
  },
}));
