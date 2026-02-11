import { create } from 'zustand';
import type { User } from 'firebase/auth';
import { subscribeAuth } from '@/lib/firebase/auth';

interface AuthState {
  user: User | null;
  loading: boolean;
}

export const useAuthStore = create<AuthState>(() => ({
  user: null,
  loading: true,
}));

// Đồng bộ user từ Firebase vào store
subscribeAuth((user) => {
  useAuthStore.setState({ user, loading: false });
});
