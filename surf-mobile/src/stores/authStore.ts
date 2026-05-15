import { create } from 'zustand';
import { User } from 'firebase/auth';
import { subscribeAuth, signOut } from '@/lib/firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
    console.log(`📝 setUser called: user=${user ? user.email : 'null'}`);
    set({ user });
  },
  
  setLoading: (loading) => set({ loading }),

  initialize: () => {
    console.log('🎧 Setting up Firebase auth listener...');
    const unsubscribe = subscribeAuth((user) => {
      const email = user ? user.email : 'null';
      console.log(`🔄 Auth state changed: user=${email}`);
      set({ user, loading: false, initialized: true });
      console.log(`✅ Store updated: user=${email}, loading=false`);
    });
    console.log('✅ Firebase auth listener subscribed (returned unsubscribe function)');
    set({ unsubscribe });
    return unsubscribe;
  },

  resetAuth: async () => {
    try {
      console.log('🔑 Starting logout...');
      
      // Unsubscribe Firebase listener first
      const { unsubscribe } = get();
      if (unsubscribe) {
        console.log('🔓 Unsubscribing from auth listener');
        unsubscribe();
        set({ unsubscribe: null });
      }
      
      // Sign out from Firebase
      await signOut();
      console.log('✅ Firebase signOut completed');
      
      // Clear AsyncStorage
      await AsyncStorage.removeItem('firebase_persist_mode');
      console.log('✅ AsyncStorage cleared');
      
      // Set store to logged out state
      set({ user: null, loading: false, initialized: true });
      console.log('✅ Auth store reset - user=null');
    } catch (err) {
      console.error('❌ Error in resetAuth:', err);
      // Still set to null even if there's an error
      set({ user: null, loading: false, initialized: true });
    }
  },
}));
