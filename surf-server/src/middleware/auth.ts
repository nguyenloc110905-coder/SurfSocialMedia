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
