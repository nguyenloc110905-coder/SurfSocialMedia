import { useEffect, useMemo, useState } from 'react';
import { formatLastSeen } from '@/lib/utils/lastSeen';
import { usePresenceStore } from '@/stores/presenceStore';
import { useAuthStore } from '@/stores/authStore';

type PresenceBadgeSize = 'sm' | 'md' | 'lg';
type PresenceBadgeVariant = 'dot' | 'label';

type PresenceBadgeProps = {
  uid?: string | null;
  size?: PresenceBadgeSize;
  variant?: PresenceBadgeVariant;
  // Deprecated: kept for backward compatibility with old call sites.
  showOfflineLabel?: boolean;
  className?: string;
};

const dotClasses: Record<PresenceBadgeSize, string> = {
  sm: 'h-2.5 w-2.5 border-2',
  md: 'h-3 w-3 border-2',
  lg: 'h-3.5 w-3.5 border-2',
};

export default function PresenceBadge({
  uid,
  size = 'md',
  variant = 'dot',
  showOfflineLabel = false,
  className = '',
}: PresenceBadgeProps) {
  const showLabel = variant === 'label' || showOfflineLabel;
  const currentUser = useAuthStore((state) => state.user);
  const isSelf = currentUser?.uid === uid;
  
  const isOnline = usePresenceStore((state) => (uid ? state.onlineUsers.has(uid) : false));
  const canViewStatus = usePresenceStore((state) => (uid ? state.visibleUsers.has(uid) : false));
  const lastSeenTs = usePresenceStore((state) =>
    uid && showLabel ? state.lastSeen.get(uid) : undefined
  );
  
  const [nowMs, setNowMs] = useState(() => Date.now());
  const hasLastSeen = typeof lastSeenTs === 'number' && Number.isFinite(lastSeenTs);

  useEffect(() => {
    if (!uid || !showLabel) return;

    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 15_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [uid, showLabel]);

  const offlineLabel = useMemo(() => {
    if (!showLabel) return null;
    if (!hasLastSeen) return null;
    const { label } = formatLastSeen(lastSeenTs, nowMs);
    return label;
  }, [hasLastSeen, lastSeenTs, nowMs, showLabel]);

  if (!uid) return null;
  
  // Only show badge if it's the current user, or if we have permission to view their status (they are a friend)
  if (!isSelf && !canViewStatus) return null;

  if (!showLabel) {
    return (
      <span
        title={isOnline ? 'Đang hoạt động' : hasLastSeen ? 'Đã offline' : 'Chưa có dữ liệu hoạt động'}
        className={`absolute bottom-0 right-0 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-slate-400'} ${dotClasses[size]} border-white dark:border-slate-800 ${className}`}
      />
    );
  }

  if (isOnline) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium leading-none text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-900/25 dark:text-emerald-300 ${className}`}
      >
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        Đang hoạt động
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium leading-none text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 ${className}`}
    >
      <span className="h-2 w-2 rounded-full bg-slate-400" />
      {!hasLastSeen
        ? 'Chưa có dữ liệu hoạt động'
        : offlineLabel
          ? `Hoạt động ${offlineLabel} trước`
          : 'Hoạt động hơn 7 ngày trước'}
    </span>
  );
}