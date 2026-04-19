import { Request, Response, NextFunction } from 'express';
import { getAuth, getDb } from '../config/firebase-admin.js';
import { DEFAULT_NOTIFICATION_PREFS, NOTIFICATION_PREF_KEYS } from '../types/notification.js';
import { DEFAULT_FRIEND_REQUEST_PRIVACY, isFriendRequestPrivacy } from '../types/privacy.js';

export interface AuthRequest extends Request {
  uid?: string;
}

const hasCompleteNotificationPrefs = (value: unknown): boolean => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

  const raw = value as Record<string, unknown>;
  return NOTIFICATION_PREF_KEYS.every((key) => typeof raw[key] === 'boolean');
};

const hasValidFriendRequestPrivacy = (value: unknown): boolean => isFriendRequestPrivacy(value);

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }
  const token = header.slice(7);
  try {
    const decoded = await getAuth().verifyIdToken(token);
    req.uid = decoded.uid;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Tạo doc user trong Firestore nếu chưa có (để user xuất hiện trong Gợi ý kết bạn) */
export async function ensureUser(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.uid) return next();
  try {
    const usersRef = getDb().collection('users');
    const doc = await usersRef.doc(req.uid).get();
    if (!doc.exists) {
      const fbUser = await getAuth().getUser(req.uid);
      await usersRef.doc(req.uid).set({
        uid: req.uid,
        email: fbUser.email ?? '',
        displayName: fbUser.displayName ?? fbUser.email?.split('@')[0] ?? 'User',
        photoURL: fbUser.photoURL ?? null,
        defaultPostPrivacy: 'public',
        notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
        friendRequestPrivacy: DEFAULT_FRIEND_REQUEST_PRIVACY,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return next();
    }

    const existingData = doc.data() ?? {};
    const updates: Record<string, unknown> = {};

    if (!hasCompleteNotificationPrefs(existingData.notificationPrefs)) {
      updates.notificationPrefs = DEFAULT_NOTIFICATION_PREFS;
    }

    if (!hasValidFriendRequestPrivacy(existingData.friendRequestPrivacy)) {
      updates.friendRequestPrivacy = DEFAULT_FRIEND_REQUEST_PRIVACY;
    }

    if (Object.keys(updates).length > 0) {
      await usersRef.doc(req.uid).set(
        {
          ...updates,
          updatedAt: new Date(),
        },
        { merge: true }
      );
    }
  } catch {
    // Không chặn request nếu lỗi (vd Firebase chưa cấu hình đủ)
  }
  next();
}

async function getBlockedBy(uid: string): Promise<string[]> {
  const doc = await getDb().collection('users').doc(uid).get();
  if (!doc.exists) return [];
  return (doc.data()?.blockedBy ?? []) as string[];
}

/** true nếu một trong hai user đã chặn người còn lại */
export async function hasBlockRelation(uidA: string, uidB: string): Promise<boolean> {
  if (!uidA || !uidB || uidA === uidB) return false;

  const [aBlockedBy, bBlockedBy] = await Promise.all([getBlockedBy(uidA), getBlockedBy(uidB)]);
  return aBlockedBy.includes(uidB) || bBlockedBy.includes(uidA);
}

/** Trả true nếu request đã bị reject vì block */
export async function rejectIfBlocked(uidA: string, uidB: string, res: Response): Promise<boolean> {
  try {
    const blocked = await hasBlockRelation(uidA, uidB);
    if (!blocked) return false;

    res.status(403).json({
      error: 'Blocked users cannot interact',
      code: 'USER_BLOCKED',
    });
    return true;
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
    return true;
  }
}

/** Middleware kiểm tra block status giữa người gọi API và target uid */
export function requireNoBlock(targetUidResolver: (req: AuthRequest) => string | undefined) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const actorUid = req.uid;
    const targetUid = targetUidResolver(req);

    if (!actorUid || !targetUid || actorUid === targetUid) {
      next();
      return;
    }

    if (await rejectIfBlocked(actorUid, targetUid, res)) return;
    next();
  };
}
