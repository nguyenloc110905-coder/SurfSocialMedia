import { useEffect, useRef } from 'react';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/authStore';

type MessageNewPayload = {
  message: { senderId: string };
};

export function useMessageSound() {
  const user = useAuthStore((s) => s.user);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const unlockedRef = useRef(false);
  const userRef = useRef(user);
  userRef.current = user;

  useEffect(() => {
    const audio = new Audio('/notification-message.mp3');
    audio.volume = 0.5;
    audioRef.current = audio;

    const unlock = () => {
      if (unlockedRef.current) return;
      // play + pause ngay để browser cho phép play sau
      audio.play().then(() => {
        audio.pause();
        audio.currentTime = 0;
        unlockedRef.current = true;
      }).catch(() => {});
    };

    window.addEventListener('click', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    const socket = getSocket();
    console.log('[sound] registering handler, socket connected:', socket.connected);
    const handler = (payload: MessageNewPayload) => {
      if (payload.message.senderId === userRef.current?.uid) return;
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = 0;
      audio.play().catch(() => {});
    };
    socket.on('message:new', handler);
    return () => {
      socket.off('message:new', handler);
    };
  }, []);
}
