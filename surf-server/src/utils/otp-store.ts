/** In-memory OTP store với TTL 5 phút */

interface OtpEntry {
  code: string;
  expiresAt: number;
  payload: Record<string, string>;
}

const store = new Map<string, OtpEntry>();

export function setOtp(
  uid: string,
  purpose: string,
  code: string,
  payload: Record<string, string>,
  ttlMs = 5 * 60 * 1000
) {
  store.set(`${uid}:${purpose}`, { code, expiresAt: Date.now() + ttlMs, payload });
}

/**
 * Xác minh OTP. Trả về payload nếu đúng và còn hạn.
 * Entry bị xóa ngay sau khi verify thành công (single-use).
 */
export function verifyAndConsumeOtp(
  uid: string,
  purpose: string,
  code: string
): Record<string, string> | null {
  const key = `${uid}:${purpose}`;
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  if (entry.code !== code) return null;
  store.delete(key);
  return entry.payload;
}
