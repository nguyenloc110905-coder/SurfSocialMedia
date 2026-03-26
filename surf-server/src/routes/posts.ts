import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { getDb } from '../config/firebase-admin.js';
import { io } from '../index.js';

const router = Router();

/** Returns true if any URL in the array is a video (Cloudinary or by extension) */
function detectHasVideo(urls: string[]): boolean {
  return Array.isArray(urls) && urls.some(
    (u) => typeof u === 'string' && (
      u.includes('/video/upload/') ||
      /\.(mp4|webm|mov|avi|mkv|ogv)(\?|$)/i.test(u)
    )
  );
}

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
      privacy = 'public',
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
      hasVideo: detectHasVideo(Array.isArray(mediaUrls) ? mediaUrls : []),
    });
    const created = await docRef.get();
    res.status(201).json({ id: created.id, ...created.data() });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** Bỏ dấu tiếng Việt & chuyển thường để so sánh không phân biệt dấu */
function normalizePost(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

// GET /search?q=&type= — tìm kiếm bài viết (phải đặt trước /:id)
router.get('/search', requireAuth, async (req: AuthRequest, res) => {
  try {
    const raw = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const type = typeof req.query.type === 'string' ? req.query.type : 'posts';
    if (!raw) {
      res.json({ posts: [] });
      return;
    }
    const normQ = normalizePost(raw);
    const snap = await getDb().collection('posts').get();
    type PostDoc = { id: string; content?: string; deleted?: boolean; hasVideo?: boolean; privacy?: string; [key: string]: unknown };
    let posts = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as PostDoc)
      .filter((p) => !p.deleted && p.privacy !== 'only-me')
      .filter((p) => normalizePost(p.content ?? '').includes(normQ));

    if (type === 'videos') {
      posts = posts.filter((p) => p.hasVideo === true);
    } else {
      posts = posts.filter((p) => !p.hasVideo);
    }

    res.json({ posts: posts.slice(0, 30) });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /trash — danh sách bài viết trong thùng rác của user
router.get('/trash', requireAuth, async (req: AuthRequest, res) => {
  try {
    const postsRef = getDb().collection('posts');
    const snap = await postsRef
      .where('authorId', '==', req.uid!)
      .where('deleted', '==', true)
      .get();
    type PostDoc = { id: string; deletedAt?: { toMillis?: () => number }; [key: string]: unknown };
    const posts = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as PostDoc)
      .sort((a, b) => {
        const aTime = a.deletedAt?.toMillis?.() ?? 0;
        const bTime = b.deletedAt?.toMillis?.() ?? 0;
        return bTime - aTime;
      });
    res.json({ posts });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const postsRef = getDb().collection('posts');
    const postDoc = await postsRef.doc(req.params.id).get();
    if (!postDoc.exists || postDoc.data()?.deleted === true) {
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
    const { content, mediaUrls, privacy, feeling, location, taggedFriends } = req.body;
    const update: Record<string, unknown> = {
      updatedAt: new Date(),
      isEdited: true,
      editedAt: new Date(),
    };
    if (content !== undefined) update.content = content;
    if (mediaUrls !== undefined) {
      update.mediaUrls = mediaUrls;
      update.hasVideo = detectHasVideo(Array.isArray(mediaUrls) ? mediaUrls : []);
    }
    if (privacy !== undefined) update.privacy = privacy;
    if (feeling !== undefined) update.feeling = feeling ?? null;
    if (location !== undefined) update.location = location ?? null;
    if (taggedFriends !== undefined) update.taggedFriends = taggedFriends;
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
    // Chuyển vào thùng rác thay vì xóa vĩnh viễn
    await postsRef.doc(req.params.id).update({
      deleted: true,
      deletedAt: new Date(),
    });
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// POST /:id/restore — khôi phục bài viết từ thùng rác
router.post('/:id/restore', requireAuth, async (req: AuthRequest, res) => {
  try {
    const postsRef = getDb().collection('posts');
    const doc = await postsRef.doc(req.params.id).get();
    if (!doc.exists || doc.data()?.authorId !== req.uid) {
      res.status(404).json({ error: 'Post not found or forbidden' });
      return;
    }
    await postsRef.doc(req.params.id).update({
      deleted: false,
      deletedAt: null,
    });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// DELETE /:id/permanent — xóa vĩnh viễn khỏi Firestore
router.delete('/:id/permanent', requireAuth, async (req: AuthRequest, res) => {
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
    const reactions: Record<string, string> = data.reactions ?? {};
    const { reaction = '❤️' } = req.body;
    const idx = likedBy.indexOf(req.uid!);
    if (idx === -1) {
      likedBy.push(req.uid!);
      reactions[req.uid!] = reaction;
    } else {
      likedBy.splice(idx, 1);
      delete reactions[req.uid!];
    }
    await ref.update({
      likedBy,
      likeCount: likedBy.length,
      reactions,
      updatedAt: new Date(),
    });
    const updated = await ref.get();
    const responseData = { id: updated.id, ...updated.data() };
    // RT-3: notify all clients viewing this post about the updated reaction count
    io.to(`post:${req.params.id}`).emit('post:reacted', {
      postId: req.params.id,
      likeCount: likedBy.length,
      likedBy,
      reactions,
    });
    res.json(responseData);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /:id/reactions — list of users who reacted with their display info
router.get('/:id/reactions', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const doc = await db.collection('posts').doc(req.params.id).get();
    if (!doc.exists) { res.status(404).json({ error: 'Post not found' }); return; }

    const reactions: Record<string, string> = doc.data()?.reactions ?? {};
    const uids = Object.keys(reactions);
    if (!uids.length) { res.json([]); return; }

    // Batch fetch user profiles (Firebase Auth getUsers supports up to 100)
    const { getAuth } = await import('firebase-admin/auth');
    const { users } = await getAuth().getUsers(uids.map((uid) => ({ uid })));
    const userMap: Record<string, { displayName: string; photoURL: string | null }> = {};
    for (const u of users) {
      userMap[u.uid] = { displayName: u.displayName ?? 'Unknown', photoURL: u.photoURL ?? null };
    }

    const result = uids.map((uid) => ({
      uid,
      displayName: userMap[uid]?.displayName ?? 'Unknown',
      photoURL: userMap[uid]?.photoURL ?? null,
      reaction: reactions[uid],
    }));

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
