import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { api, DEVICE_ID } from '@/lib/api';

const HEARTBEAT_INTERVAL = 1 * 60 * 1000; // Kiểm tra mỗi 1 phút để cập nhật trạng thái nhanh hơn

export function useSessionHeartbeat() {
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user) return;

    let timeoutId: ReturnType<typeof setTimeout>;

    let isFirst = true;

    const sendHeartbeat = async () => {
      try {
        const authUser = useAuthStore.getState().user;
        if (authUser) {
          // Ép Firebase kiểm tra xem tài khoản còn hoạt động không trên server
          await authUser.reload();
        }

        const ua = navigator.userAgent;
        let os = 'Unknown';
        if (ua.includes('Win')) os = 'Windows';
        else if (ua.includes('Mac')) os = 'macOS';
        else if (ua.includes('Linux')) os = 'Linux';
        else if (ua.includes('Android')) os = 'Android';
        else if (ua.includes('like Mac')) os = 'iOS';
        
        let browser = 'Unknown';
        if (ua.includes('Edg/')) browser = 'Edge';
        else if (ua.includes('Chrome/')) browser = 'Chrome';
        else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari';
        else if (ua.includes('Firefox/')) browser = 'Firefox';
        
        let device = 'Desktop';
        if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
          device = 'Mobile';
        }

        await api.post('/api/users/me/sessions/heartbeat', {
          userAgent: ua,
          os,
          browser,
          device,
          deviceId: DEVICE_ID,
          init: isFirst,
        });
        isFirst = false;
      } catch (err: any) {
        // Bắt lỗi nếu tài khoản bị Vô hiệu hóa (Disable) hoặc Xóa (Delete) trên Console
        if (err.code === 'auth/user-disabled' || err.code === 'auth/user-not-found' || err.code === 'auth/user-token-expired') {
          console.warn('Tài khoản đã bị vô hiệu hóa hoặc xóa từ Firebase Console');
          const { auth } = await import('@/lib/firebase/auth');
          const { signOut } = await import('firebase/auth');
          await signOut(auth);
          window.location.href = '/login?error=account_disabled';
          return; // Dừng heartbeat lại
        }
        console.warn('Session heartbeat failed:', err);
      } finally {
        timeoutId = setTimeout(sendHeartbeat, HEARTBEAT_INTERVAL);
      }
    };

    // Send the first heartbeat after a short delay to not block initial loading
    timeoutId = setTimeout(sendHeartbeat, 5000);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [user]);
}
