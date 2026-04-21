import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { getDb } from '../config/firebase-admin.js';
import { emitPostReacted } from '../realtime/emitters/post.emitter.js';
import { FieldValue } from 'firebase-admin/firestore';
import { getIo } from '../realtime/io.js';
import { moderatePost } from '../services/aiModeration.js';

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
  console.log('[POST /api/posts] Request received, content:', req.body?.content?.substring(0, 50));
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

    // Kiểm duyệt nội dung bằng AI trước khi lưu
    const moderation = await moderatePost(content?.trim() ?? '', Array.isArray(mediaUrls) ? mediaUrls : []);
    if (!moderation.allowed) {
      // Lưu log vi phạm vào Firestore
      try {
        await db.collection('moderation_logs').add({
          userId: req.uid,
          contentSnippet: (content?.trim() ?? '').substring(0, 200),
          mediaUrls: Array.isArray(mediaUrls) ? mediaUrls : [],
          reason: moderation.reason ?? 'Nội dung không phù hợp',
          type: 'post',
          createdAt: new Date(),
        });
      } catch {
        // Không để lỗi log chặn response
      }
      res.status(422).json({ error: `Bài đăng vi phạm tiêu chuẩn cộng đồng: ${moderation.reason ?? 'Nội dung không phù hợp'}` });
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

    // Notify each tagged friend via Firestore + socket
    if (Array.isArray(taggedFriends) && taggedFriends.length > 0) {
      const notificationsRef = db.collection('notifications');
      const notifyBatch = db.batch();
      type TaggedFriendEntry = { uid: string; displayName?: string; photoURL?: string | null };
      for (const friend of taggedFriends as TaggedFriendEntry[]) {
        if (!friend?.uid || friend.uid === req.uid) continue;
        const notifDoc = notificationsRef.doc();
        notifyBatch.set(notifDoc, {
          type: 'tag',
          recipientId: friend.uid,
          actorId: req.uid,
          actorName: user?.displayName ?? 'Ai đó',
          actorPhoto: user?.photoURL ?? null,
          postId: docRef.id,
          postSnippet: (content?.trim() ?? '').substring(0, 100),
          read: false,
          createdAt: new Date(),
        });
        getIo().to(`user:${friend.uid}`).emit('notification:new', {
          id: notifDoc.id,
          type: 'tag',
          actorId: req.uid,
          actorName: user?.displayName ?? 'Ai đó',
          actorPhoto: user?.photoURL ?? null,
          postId: docRef.id,
          postSnippet: (content?.trim() ?? '').substring(0, 100),
          read: false,
          createdAt: new Date().toISOString(),
        });
      }
      await notifyBatch.commit();
    }

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

// GET /saved — bài viết đã lưu của user đang đăng nhập
router.get('/saved', requireAuth, async (req: AuthRequest, res) => {
  try {
    const snap = await getDb()
      .collection('posts')
      .where('savedBy', 'array-contains', req.uid!)
      .get();
    const posts = snap.docs
      .filter((d) => !d.data().deleted)
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
        const getTs = (v: unknown): number => {
          if (!v) return 0;
          if (typeof v === 'object' && '_seconds' in (v as object)) return (v as { _seconds: number })._seconds;
          if (typeof v === 'object' && 'seconds' in (v as object)) return (v as { seconds: number }).seconds;
          if (typeof v === 'number') return v;
          return 0;
        };
        return getTs(b.createdAt) - getTs(a.createdAt);
      });
    res.json({ posts });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// POST /:id/save — lưu bài viết; gọi lại để bỏ lưu
router.post('/:id/save', requireAuth, async (req: AuthRequest, res) => {
  try {
    const ref = getDb().collection('posts').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists || doc.data()?.deleted === true) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }
    const savedBy: string[] = doc.data()?.savedBy ?? [];
    if (!savedBy.includes(req.uid!)) {
      await ref.update({ savedBy: FieldValue.arrayUnion(req.uid!) });
    }
    res.json({ saved: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// DELETE /:id/save — bỏ lưu bài viết
router.delete('/:id/save', requireAuth, async (req: AuthRequest, res) => {
  try {
    const ref = getDb().collection('posts').doc(req.params.id);
    await ref.update({ savedBy: FieldValue.arrayRemove(req.uid!) });
    res.json({ saved: false });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// POST /:id/report — báo cáo bài viết vi phạm
router.post('/:id/report', requireAuth, async (req: AuthRequest, res) => {
  const VALID_REASONS = ['spam', 'inappropriate', 'misinformation', 'hate_speech', 'harassment', 'violence', 'copyright', 'other'];
  try {
    const db = getDb();
    const postDoc = await db.collection('posts').doc(req.params.id).get();
    if (!postDoc.exists || postDoc.data()?.deleted === true) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }
    if (postDoc.data()?.authorId === req.uid) {
      res.status(400).json({ error: 'Bạn không thể báo cáo bài viết của chính mình' });
      return;
    }
    const { reason } = req.body as { reason?: string };
    if (!reason || !VALID_REASONS.includes(reason)) {
      res.status(400).json({ error: 'Lý do báo cáo không hợp lệ' });
      return;
    }
    // Deduplicate: one report per user per post
    const existing = await db.collection('reports')
      .where('postId', '==', req.params.id)
      .where('reporterId', '==', req.uid!)
      .limit(1)
      .get();
    if (!existing.empty) {
      res.status(409).json({ error: 'Bạn đã báo cáo bài viết này rồi' });
      return;
    }
    const postData = postDoc.data()!;
    await db.collection('reports').add({
      postId: req.params.id,
      reporterId: req.uid,
      postAuthorId: postData.authorId ?? null,
      postContentSnippet: String(postData.content ?? '').substring(0, 150),
      reason,
      status: 'pending',
      createdAt: new Date(),
    });
    res.status(201).json({ success: true });
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
      .get();
    type RDoc = { id: string; createdAt?: { seconds?: number; _seconds?: number } };
    const replies = (repliesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as RDoc[])
      .sort((a, b) => {
        const aT = a.createdAt?.seconds ?? a.createdAt?._seconds ?? 0;
        const bT = b.createdAt?.seconds ?? b.createdAt?._seconds ?? 0;
        return aT - bT;
      });
    res.json({ ...post, replies });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// PATCH /:id/pin — ghim/bỏ ghim bài viết lên đầu trang cá nhân (chỉ tác giả)
router.patch('/:id/pin', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const ref = db.collection('posts').doc(req.params.id);
    const doc = await ref.get();

    if (!doc.exists || doc.data()?.deleted === true) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }
    if (doc.data()?.authorId !== req.uid) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const isCurrentlyPinned = !!doc.data()?.pinnedAt;

    if (isCurrentlyPinned) {
      await ref.update({ pinnedAt: null });
      res.json({ pinned: false, pinnedAt: null });
    } else {
      // Unpin any other pinned post by this user first
      const authorPostsSnap = await db.collection('posts')
        .where('authorId', '==', req.uid!)
        .get();
      const batch = db.batch();
      authorPostsSnap.docs.forEach((d) => {
        if (d.id !== req.params.id && d.data()?.pinnedAt) {
          batch.update(d.ref, { pinnedAt: null });
        }
      });
      const now = new Date();
      batch.update(ref, { pinnedAt: now });
      await batch.commit();
      res.json({ pinned: true, pinnedAt: now.toISOString() });
    }
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

    // Notify post author when someone reacts (not when unreacting, not own post)
    if (idx === -1 && data.authorId && data.authorId !== req.uid) {
      const reactorDoc = await getDb().collection('users').doc(req.uid!).get();
      const reactor = reactorDoc.data();
      const notifRef = getDb().collection('notifications').doc();
      const notifData = {
        id: notifRef.id,
        type: 'reaction',
        recipientId: data.authorId as string,
        actorId: req.uid,
        actorName: reactor?.displayName ?? 'Ai đó',
        actorPhoto: reactor?.photoURL ?? null,
        postId: req.params.id,
        postSnippet: (data.content as string ?? '').substring(0, 100),
        reaction,
        read: false,
        createdAt: new Date(),
      };
      notifRef.set(notifData).catch(() => {});
      getIo().to(`user:${data.authorId as string}`).emit('notification:new', {
        ...notifData,
        createdAt: new Date().toISOString(),
      });
    }

    // RT-3: notify all clients viewing this post about the updated reaction count
    emitPostReacted(req.params.id, {
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

// POST /:id/share — chia sẻ bài viết (tạo post mới với sharedFrom ref)
router.post('/:id/share', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const postsRef = db.collection('posts');
    const usersRef = db.collection('users');

    const originalDoc = await postsRef.doc(req.params.id).get();
    if (!originalDoc.exists || originalDoc.data()?.deleted === true) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }

    const original = originalDoc.data()!;
    const userDoc = await usersRef.doc(req.uid!).get();
    const user = userDoc.data();

    const { content = '', reaction } = req.body;

    const sharedPostRef = postsRef.doc();
    await sharedPostRef.set({
      authorId: req.uid,
      authorDisplayName: user?.displayName ?? 'Anonymous',
      authorPhotoURL: user?.photoURL ?? null,
      content: (content as string).trim(),
      mediaUrls: [],
      privacy: 'public',
      parentId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      likeCount: 0,
      replyCount: 0,
      shareCount: 0,
      likedBy: reaction ? [req.uid] : [],
      reactions: reaction ? { [req.uid!]: reaction } : {},
      hasVideo: false,
      sharedFrom: {
        id: req.params.id,
        authorId: original.authorId ?? null,
        authorDisplayName: original.authorDisplayName ?? 'Unknown',
        authorPhotoURL: original.authorPhotoURL ?? null,
        content: original.content ?? '',
        mediaUrls: original.mediaUrls ?? [],
        createdAt: original.createdAt ?? null,
      },
    });

    // Increment shareCount on original post
    await postsRef.doc(req.params.id).update({
      shareCount: FieldValue.increment(1),
    });

    const created = await sharedPostRef.get();
    // Emit real-time update for share count
    getIo().emit('post:shared', { postId: req.params.id });
    res.status(201).json({ id: created.id, ...created.data() });
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
