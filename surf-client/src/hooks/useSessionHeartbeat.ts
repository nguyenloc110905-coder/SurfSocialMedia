import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { api, DEVICE_ID } from '@/lib/api';

const HEARTBEAT_INTERVAL = 2 * 60 * 1000; // 2 minutes

export function useSessionHeartbeat() {
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user) return;

    let timeoutId: ReturnType<typeof setTimeout>;

    let isFirst = true;

    const sendHeartbeat = async () => {
      try {
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
      } catch (err) {
        // If it throws an error and it's SESSION_LIMIT_EXCEEDED, api.ts already logs the user out.
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
