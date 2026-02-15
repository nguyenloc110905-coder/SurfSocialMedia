import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { getDb } from '../config/firebase-admin.js';

const router = Router();

router.post('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const postsRef = db.collection('posts');
    const usersRef = db.collection('users');
    const { 
      content, 
      mediaUrls = [], 
      parentId,
      feeling,
      location,
      taggedFriends = [],
      privacy = 'public'
    } = req.body;
    
    if (!content?.trim() && mediaUrls.length === 0) {
      res.status(400).json({ error: 'Content or media is required' });
      return;
    }
    
    const userDoc = await usersRef.doc(req.uid!).get();
    const user = userDoc.data();
    const docRef = postsRef.doc();
    await docRef.set({
      authorId: req.uid,
      authorDisplayName: user?.displayName ?? 'Anonymous',
      authorPhotoURL: user?.photoURL ?? null,
      content: content?.trim() || '',
      mediaUrls: Array.isArray(mediaUrls) ? mediaUrls : [],
      feeling: feeling || null,
      location: location || null,
      taggedFriends: Array.isArray(taggedFriends) ? taggedFriends : [],
      privacy: privacy || 'public',
      parentId: parentId || null,
      createdAt: new Date(),
      updatedAt: new Date(),
      likeCount: 0,
      replyCount: 0,
      likedBy: [],
    });
    const created = await docRef.get();
    res.status(201).json({ id: created.id, ...created.data() });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const postsRef = getDb().collection('posts');
    const postDoc = await postsRef.doc(req.params.id).get();
    if (!postDoc.exists) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }
    const post = { id: postDoc.id, ...postDoc.data() };
    const repliesSnap = await postsRef
      .where('parentId', '==', req.params.id)
      .orderBy('createdAt', 'asc')
      .get();
    const replies = repliesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ ...post, replies });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.patch('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const postsRef = getDb().collection('posts');
    const doc = await postsRef.doc(req.params.id).get();
    if (!doc.exists || doc.data()?.authorId !== req.uid) {
      res.status(404).json({ error: 'Post not found or forbidden' });
      return;
    }
    const { content, mediaUrls } = req.body;
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (content !== undefined) update.content = content;
    if (mediaUrls !== undefined) update.mediaUrls = mediaUrls;
    await postsRef.doc(req.params.id).update(update);
    const updated = await postsRef.doc(req.params.id).get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const postsRef = getDb().collection('posts');
    const doc = await postsRef.doc(req.params.id).get();
    if (!doc.exists || doc.data()?.authorId !== req.uid) {
      res.status(404).json({ error: 'Post not found or forbidden' });
      return;
    }
    await postsRef.doc(req.params.id).delete();
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post('/:id/like', requireAuth, async (req: AuthRequest, res) => {
  try {
    const postsRef = getDb().collection('posts');
    const ref = postsRef.doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }
    const data = doc.data()!;
    const likedBy: string[] = data.likedBy ?? [];
    const idx = likedBy.indexOf(req.uid!);
    if (idx === -1) likedBy.push(req.uid!);
    else likedBy.splice(idx, 1);
    await ref.update({
      likedBy,
      likeCount: likedBy.length,
      updatedAt: new Date(),
    });
    const updated = await ref.get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
