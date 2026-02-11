import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { getDb } from '../config/firebase-admin.js';

const router = Router();

router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const usersRef = getDb().collection('users');
    const doc = await usersRef.doc(req.uid!).get();
    if (!doc.exists) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }
    res.json({ id: doc.id, ...doc.data() });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.put('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const usersRef = getDb().collection('users');
    const { displayName, bio, photoURL, email } = req.body;
    const ref = usersRef.doc(req.uid!);
    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (displayName !== undefined) data.displayName = displayName;
    if (bio !== undefined) data.bio = bio;
    if (photoURL !== undefined) data.photoURL = photoURL;

    const doc = await ref.get();
    if (!doc.exists) {
      data.uid = req.uid;
      data.email = email ?? '';
      data.createdAt = new Date();
      await ref.set(data);
    } else {
      await ref.update(data);
    }
    const updated = await ref.get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/:uid', requireAuth, async (req, res) => {
  try {
    const usersRef = getDb().collection('users');
    const doc = await usersRef.doc(req.params.uid).get();
    if (!doc.exists) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ id: doc.id, ...doc.data() });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
