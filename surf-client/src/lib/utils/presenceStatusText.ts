import { formatLastSeen } from './lastSeen';

export function getPresenceStatusText(
  isOnline: boolean,
  lastSeenTs?: number,
  nowMs = Date.now()
): string | null {
  if (isOnline) return 'Đang hoạt động';
  if (typeof lastSeenTs !== 'number') return null;

  const { label } = formatLastSeen(lastSeenTs, nowMs);
  if (!label) return 'Hoạt động hơn 7 ngày trước';

  return `Hoạt động ${label} trước`;
}
