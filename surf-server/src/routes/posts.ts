import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { getDb } from '../config/firebase-admin.js';
import { FieldValue } from 'firebase-admin/firestore';
import { io } from '../index.js';

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

    // Notification: tell priority friends about the new post
    const authorUid = req.uid!;
    const friendDoc = await db.collection('friends').doc(authorUid).get();
    const friendIds: string[] = friendDoc.exists ? (friendDoc.data()?.friendIds ?? []) : [];
    if (friendIds.length > 0) {
      // For each friend that has set us as 'priority', send a notification
      const tierDocs = await db.getAll(...friendIds.map((id) => db.collection('friend_tiers').doc(id)));
      const authorUser = userDoc.data();
      for (const tDoc of tierDocs) {
        if (!tDoc.exists) continue;
        const tiers: Record<string, string> = tDoc.data()?.tiers ?? {};
        if (tiers[authorUid] === 'priority') {
          const notifData = {
            toUid: tDoc.id,
            fromUid: authorUid,
            fromName: authorUser?.displayName ?? 'Người dùng',
            fromPhoto: authorUser?.photoURL ?? null,
            type: 'new_post',
            postId: docRef.id,
            message: content?.trim()
              ? `vừa đăng: "${content.trim().substring(0, 60)}${content.trim().length > 60 ? '...' : ''}"`
              : 'vừa đăng một bài viết mới',
            read: false,
            createdAt: new Date(),
          };
          await db.collection('notifications').add(notifData);
          io.to(`user:${tDoc.id}`).emit('notification', notifData);
        }
      }
    }

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
    const db = getDb();
    const postsRef = db.collection('posts');
    const ref = postsRef.doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }
    const data = doc.data()!;
    const likedBy: string[] = data.likedBy ?? [];
    const idx = likedBy.indexOf(req.uid!);
    const isLiking = idx === -1;
    if (isLiking) likedBy.push(req.uid!);
    else likedBy.splice(idx, 1);
    await ref.update({
      likedBy,
      likeCount: likedBy.length,
      updatedAt: new Date(),
    });

    // EdgeRank: update affinity score when liking someone's post
    const postAuthor = data.authorId as string;
    if (isLiking && postAuthor && postAuthor !== req.uid) {
      const affinityRef = db.collection('affinity').doc(req.uid!);
      await affinityRef.set(
        { scores: { [postAuthor]: FieldValue.increment(2) } },
        { merge: true },
      );
      // Check if post author is a priority friend → send notification
      const tierDoc = await db.collection('friend_tiers').doc(postAuthor).get();
      const tiers: Record<string, string> = tierDoc.exists ? (tierDoc.data()?.tiers ?? {}) : {};
      // Also check if current user has postAuthor as priority
      const myTierDoc = await db.collection('friend_tiers').doc(req.uid!).get();
      const myTiers: Record<string, string> = myTierDoc.exists ? (myTierDoc.data()?.tiers ?? {}) : {};
      // Create notification for post author
      const likerDoc = await db.collection('users').doc(req.uid!).get();
      const likerData = likerDoc.data();
      const notifData = {
        toUid: postAuthor,
        fromUid: req.uid,
        fromName: likerData?.displayName ?? 'Người dùng',
        fromPhoto: likerData?.photoURL ?? null,
        type: 'like_post',
        postId: req.params.id,
        message: `đã thích bài viết của bạn`,
        read: false,
        createdAt: new Date(),
      };
      // Only send if they have us as priority, or we are friends
      const friendDoc = await db.collection('friends').doc(postAuthor).get();
      const friendIds: string[] = friendDoc.exists ? (friendDoc.data()?.friendIds ?? []) : [];
      if (friendIds.includes(req.uid!) && (tiers[req.uid!] === 'priority' || myTiers[postAuthor] === 'priority')) {
        await db.collection('notifications').add(notifData);
        io.to(`user:${postAuthor}`).emit('notification', notifData);
      }
    }

    const updated = await ref.get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
