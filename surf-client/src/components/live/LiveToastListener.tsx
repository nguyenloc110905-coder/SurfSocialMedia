import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/authStore';

type FriendLivePayload = {
  streamId: string;
  hostId: string;
  hostName: string;
  hostPhotoURL: string | null;
  title: string;
  startedAt: string;
};

export default function LiveToastListener() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const [toast, setToast] = useState<FriendLivePayload | null>(null);

  useEffect(() => {
    if (!user) return;

    const socket = getSocket();
    const onFriendLive = (payload: FriendLivePayload) => {
      if (!payload?.streamId || payload.hostId === user.uid) return;
      setToast(payload);
    };

    socket.on('friend:live', onFriendLive);
    return () => {
      socket.off('friend:live', onFriendLive);
    };
  }, [user]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 10000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;

  return (
    <div className="fixed right-4 top-16 z-50 w-[min(360px,calc(100vw-2rem))] rounded-2xl border border-rose-200 bg-white p-3 shadow-2xl dark:border-rose-500/30 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        {toast.hostPhotoURL ? (
          <img
            src={toast.hostPhotoURL}
            alt=""
            className="h-11 w-11 flex-shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-rose-500 text-sm font-bold text-white">
            {toast.hostName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {toast.hostName} đang live
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
            {toast.title}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setToast(null);
                navigate(`/feed/live/${toast.streamId}`);
              }}
              className="inline-flex h-9 items-center justify-center rounded-xl bg-rose-600 px-3 text-xs font-semibold text-white transition hover:bg-rose-500"
            >
              Tham gia
            </button>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
