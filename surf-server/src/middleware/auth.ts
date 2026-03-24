import { Request, Response, NextFunction } from 'express';
import { getAuth, getDb } from '../config/firebase-admin.js';

export interface AuthRequest extends Request {
  uid?: string;
}

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
    if (doc.exists) return next();
    const fbUser = await getAuth().getUser(req.uid);
    await usersRef.doc(req.uid).set({
      uid: req.uid,
      email: fbUser.email ?? '',
      displayName: fbUser.displayName ?? fbUser.email?.split('@')[0] ?? 'User',
      photoURL: fbUser.photoURL ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
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
