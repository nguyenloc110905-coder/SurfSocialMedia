import { formatLastSeen } from './lastSeen';

function expandLastSeenLabel(label: string): string {
  const value = Number(label.slice(0, -1));
  const unit = label.slice(-1);

  if (!Number.isFinite(value) || value <= 0) return label;
  if (unit === 'm') return `${value} phút`;
  if (unit === 'h') return `${value} giờ`;
  if (unit === 'd') return `${value} ngày`;
  return label;
}

export function getPresenceStatusText(
  isOnline: boolean,
  lastSeenTs?: number,
  nowMs = Date.now()
): string {
  if (isOnline) return 'Đang hoạt động';
  if (typeof lastSeenTs !== 'number' || !Number.isFinite(lastSeenTs)) return 'Hoạt động mới đây';
  if (Math.max(0, nowMs - lastSeenTs) < 60_000) return 'Hoạt động mới đây';

  const { label } = formatLastSeen(lastSeenTs, nowMs);
  if (!label) return 'Hoạt động hơn 7 ngày trước';

  return `Hoạt động ${expandLastSeenLabel(label)} trước`;
}
