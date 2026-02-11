import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getDb } from '../config/firebase-admin.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const postsRef = getDb().collection('posts');
    const limitNum = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const lastId = req.query.lastId as string | undefined;

    let q = postsRef
      .where('parentId', '==', null)
      .orderBy('createdAt', 'desc')
      .limit(limitNum + 1);

    if (lastId) {
      const lastDoc = await postsRef.doc(lastId).get();
      if (lastDoc.exists) q = q.startAfter(lastDoc);
    }

    const snap = await q.get();
    const docs = snap.docs.slice(0, limitNum);
    const posts = docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ posts, hasMore: snap.docs.length > limitNum, nextLastId: docs.length ? docs[docs.length - 1].id : null });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
