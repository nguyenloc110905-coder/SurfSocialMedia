import { create } from 'zustand';
import type { User } from 'firebase/auth';
import { subscribeAuth } from '@/lib/firebase/auth';
import { syncUserProfile } from '@/lib/api';
import { connectSocket, disconnectSocket } from '@/lib/socket';

interface AuthState {
  user: User | null;
  loading: boolean;
}

export const useAuthStore = create<AuthState>(() => ({
  user: null,
  loading: true,
}));

let hasInitialSync = false;
let tokenRefreshInterval: ReturnType<typeof setInterval> | null = null;

// Refresh token mỗi 55 phút để luôn có token tươi trước khi hết hạn (60 phút)
function startTokenRefresh(user: import('firebase/auth').User) {
  if (tokenRefreshInterval) clearInterval(tokenRefreshInterval);
  tokenRefreshInterval = setInterval(
    async () => {
      try {
        await user.getIdToken(true);
        console.log('🔄 Token refreshed proactively');
      } catch (err) {
        console.warn('Token refresh failed:', err);
      }
    },
    55 * 60 * 1000
  );
}

function stopTokenRefresh() {
  if (tokenRefreshInterval) {
    clearInterval(tokenRefreshInterval);
    tokenRefreshInterval = null;
  }
}

// Đồng bộ user từ Firebase vào store
subscribeAuth((user) => {
  console.log('🔐 Auth state changed:', user?.email ?? 'null');
  const wasLoading = useAuthStore.getState().loading;
  useAuthStore.setState({ user, loading: false });

  // Connect/disconnect Socket.io
  if (user) {
    connectSocket(user.uid);
    startTokenRefresh(user);
  } else {
    disconnectSocket();
    stopTokenRefresh();
  }

  // Chỉ auto-sync lần đầu khi app load và phát hiện user đã đăng nhập
  // (không sync khi đăng nhập mới vì AuthPage đã xử lý)
  if (user && wasLoading && !hasInitialSync) {
    hasInitialSync = true;
    console.log('🔄 Auto-sync profile on app init');
    // Đợi lâu hơn để đảm bảo Firebase Auth hoàn toàn sẵn sàng
    setTimeout(() => {
      syncUserProfile().catch((err) => {
        console.warn('Auto-sync on init failed:', err);
      });
    }, 1500); // Tăng lên 1.5s để đảm bảo token sẵn sàng
  }
});
