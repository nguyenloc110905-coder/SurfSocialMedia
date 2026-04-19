const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Given a lastSeen Unix ms timestamp:
 * - If > 7 days ago → { label: null, gray: true }
 * - Otherwise → { label: "5m" | "2h" | "3d", gray: false }
 */
export function formatLastSeen(
  ts: number,
  nowMs = Date.now()
): { label: string | null; gray: boolean } {
  const diff = Math.max(0, nowMs - ts);

  if (diff >= SEVEN_DAYS_MS) return { label: null, gray: true };

  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (days >= 1) return { label: `${days}d`, gray: false };
  if (hours >= 1) return { label: `${hours}h`, gray: false };
  if (minutes >= 1) return { label: `${minutes}m`, gray: false };
  return { label: '1m', gray: false };
}
