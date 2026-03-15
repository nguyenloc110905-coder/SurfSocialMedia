import { create } from 'zustand';
import { User } from 'firebase/auth';
import { subscribeAuth } from '@/lib/firebase/auth';

type AuthState = {
  user: User | null;
  loading: boolean;
  initialized: boolean;
  setUser: (user: User | null) => void;
  initialize: () => () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  initialized: false,

  setUser: (user) => set({ user }),

  initialize: () => {
    const unsubscribe = subscribeAuth((user) => {
      set({ user, loading: false, initialized: true });
    });
    return unsubscribe;
  },
}));
