import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { getDb } from '../config/firebase-admin.js';
import { emitPostReacted } from '../realtime/emitters/post.emitter.js';
import { FieldValue } from 'firebase-admin/firestore';
import { getIo } from '../realtime/io.js';
import { moderatePost } from '../services/aiModeration.js';
import { groupRepository } from '../repositories/group.repository.js';
import {
  createNotification,
  getUnreadNotificationCount,
  toApiNotification,
} from '../services/notifications.js';
import {
  emitNotificationNew,
  emitNotificationUnreadCount,
} from '../realtime/emitters/notification.emitter.js';

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

/**
 * @swagger
 * /api/posts:
 *   post:
 *     tags: [Posts]
 *     summary: Tạo bài viết mới (cá nhân hoặc trong nhóm)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content: { type: string }
 *               mediaUrls: { type: array, items: { type: string } }
 *               parentId: { type: string, nullable: true }
 *               feeling: { type: string, nullable: true }
 *               location: { type: string, nullable: true }
 *               taggedFriends: { type: array, items: { type: object } }
 *               privacy: { type: string, enum: [public, friends, only-me, custom], default: public }
 *               groupId: { type: string, nullable: true, description: 'Cần là member của nhóm' }
 *               isAnonymous: { type: boolean, default: false }
 *               poll: { type: object, nullable: true }
 *     responses:
 *       201: { description: Tạo thành công, content: { application/json: { schema: { $ref: '#/components/schemas/Post' } } } }
 *       400: { description: Thiếu content & media }
 *       403: { description: Không phải member nhóm }
 *       422: { description: Vi phạm AI moderation }
 */
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
      groupId,
      isAnonymous = false,
      poll,
    } = req.body;

    if (!content?.trim() && mediaUrls.length === 0) {
      res.status(400).json({ error: 'Content or media is required' });
      return;
    }

    if (groupId) {
      const group = await groupRepository.getById(groupId);
      if (!group) {
        res.status(404).json({ error: 'Group not found' });
        return;
      }
      if (!group.memberIds.includes(req.uid!)) {
        res.status(403).json({ error: 'Only group members can post' });
        return;
      }
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
    
    // Xử lý poll
    let formattedPoll = null;
    if (poll && Array.isArray(poll.options) && poll.options.length > 0) {
      formattedPoll = {
        options: poll.options.map((opt: any, index: number) => ({
          id: `opt_${Date.now()}_${index}`,
          text: opt.text || opt,
          votes: []
        }))
      };
    }

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
      groupId: groupId || null,
      createdAt: new Date(),
      updatedAt: new Date(),
      likeCount: 0,
      replyCount: 0,
      likedBy: [],
      hasVideo: detectHasVideo(Array.isArray(mediaUrls) ? mediaUrls : []),
      isAnonymous: !!isAnonymous,
      poll: formattedPoll,
    });
    const created = await docRef.get();

    // Notify each tagged friend via Firestore + socket
    if (Array.isArray(taggedFriends) && taggedFriends.length > 0) {
      type TaggedFriendEntry = { uid: string; displayName?: string; photoURL?: string | null };
      const taggedUids = Array.from(
        new Set(
          (taggedFriends as TaggedFriendEntry[])
            .map((friend) => friend?.uid)
            .filter((uid): uid is string => typeof uid === 'string' && uid.length > 0)
        )
      ).filter((uid) => uid !== req.uid);

      await Promise.all(
        taggedUids.map(async (taggedUid) => {
          try {
            const notification = await createNotification({
              userId: taggedUid,
              type: 'mention',
              actorId: req.uid,
              entityType: 'post',
              entityId: docRef.id,
              message: `${user?.displayName ?? 'Ai đó'} đã nhắc đến bạn trong một bài viết.`,
            });

            if (!notification) return;

            const unreadCount = await getUnreadNotificationCount(taggedUid);
            emitNotificationNew(taggedUid, toApiNotification(notification));
            emitNotificationUnreadCount(taggedUid, unreadCount);
          } catch (error) {
            console.warn('⚠️ Không tạo được notification mention:', error);
          }
        })
      );
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

/**
 * @swagger
 * /api/posts:
 *   get:
 *     tags: [Posts]
 *     summary: Lấy danh sách bài viết (có thể lọc theo hashtag)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: hashtag
 *         schema: { type: string, description: 'Lọc bài viết theo hashtag (không cần dấu #)' }
 *     responses:
 *       200: { description: Danh sách bài viết }
 */
// GET /?hashtag=x — lọc bài viết theo hashtag (phải đặt trước /:id)
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const hashtag = typeof req.query.hashtag === 'string' ? req.query.hashtag.trim() : '';
    const postsRef = getDb().collection('posts');
    let posts: any[] = [];
    
    if (hashtag) {
      // Search posts containing the hashtag
      const tagQuery = `#${hashtag}`;
      const snap = await postsRef.get();
      posts = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p: any) => !p.deleted && p.privacy !== 'only-me')
        .filter((p: any) => {
          const content = (p.content as string) ?? '';
          // Match both #hashtag and #hashtag-with-dashes or any non-space chars
          const regex = new RegExp(`#${hashtag.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}(?=\\s|$|[^a-zA-Z0-9_])`, 'i');
          return regex.test(content);
        });
    } else {
      // Return recent public posts
      const snap = await postsRef
        .where('privacy', 'in', ['public', 'friends'])
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();
      posts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    
    res.json({ posts });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/posts/search:
 *   get:
 *     tags: [Posts]
 *     summary: Tìm kiếm bài viết
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [posts, users], default: posts }
 *     responses:
 *       200: { description: Kết quả tìm kiếm }
 */
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
    const searchTerms = normQ.split(/\s+/).filter(Boolean);
    
    const isMatch = (text: string) => {
      if (!text) return false;
      const normalized = normalizePost(text);
      return searchTerms.every(term => normalized.includes(term));
    };

    const snap = await getDb().collection('posts').orderBy('createdAt', 'desc').limit(500).get();
    type PostDoc = { id: string; content?: string; deleted?: boolean; hasVideo?: boolean; privacy?: string; authorDisplayName?: string; [key: string]: unknown };
    let posts = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as PostDoc)
      .filter((p) => !p.deleted && p.privacy !== 'only-me')
      .filter((p) => isMatch(p.content ?? '') || isMatch(p.authorDisplayName ?? ''));

    if (type === 'videos') {
      posts = posts.filter((p) => p.hasVideo === true);
      
      const videosSnap = await getDb().collection('videos').orderBy('createdAt', 'desc').limit(500).get();
      const mappedVideos = videosSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((v: any) => !v.deletedAt && v.privacy !== 'only-me')
        .filter((v: any) => 
          isMatch(v.description || v.title || '') ||
          isMatch(v.authorDisplayName || '')
        )
        .map((v: any) => ({
          id: v.id,
          content: v.description || v.title || '',
          authorId: v.authorId,
          authorDisplayName: v.authorDisplayName,
          authorPhotoURL: v.authorPhotoURL,
          mediaUrls: v.videoUrl ? [v.videoUrl] : [],
          createdAt: v.createdAt,
          likeCount: v.likeCount || 0,
          replyCount: v.commentCount || 0,
          likedBy: v.likedBy || [],
          privacy: v.privacy,
          hasVideo: true,
          _source: 'clip'
        }));
        
      posts = [...posts, ...mappedVideos].sort((a, b) => {
        const timeA = typeof a.createdAt === 'object' && a.createdAt !== null 
          ? ((a.createdAt as any)._seconds || (a.createdAt as any).seconds || 0) * 1000 
          : new Date(a.createdAt as string).getTime() || 0;
        const timeB = typeof b.createdAt === 'object' && b.createdAt !== null 
          ? ((b.createdAt as any)._seconds || (b.createdAt as any).seconds || 0) * 1000 
          : new Date(b.createdAt as string).getTime() || 0;
        return timeB - timeA;
      });
    } else {
      posts = posts.filter((p) => !p.hasVideo);
    }

    res.json({ posts: posts.slice(0, 30) });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/posts/trash:
 *   get:
 *     tags: [Posts]
 *     summary: Danh sách bài viết trong thùng rác
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Danh sách bài đã xóa }
 */
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

/**
 * @swagger
 * /api/posts/saved:
 *   get:
 *     tags: [Posts]
 *     summary: Danh sách bài viết đã lưu
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 */
// GET /saved — bài viết đã lưu của user đang đăng nhập
router.get('/saved', requireAuth, async (req: AuthRequest, res) => {
  try {
    const snap = await getDb()
      .collection('posts')
      .where('savedBy', 'array-contains', req.uid!)
      .limit(20)
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

/**
 * @swagger
 * /api/posts/{id}/save:
 *   post:
 *     tags: [Posts]
 *     summary: Lưu bài viết
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Đã lưu }
 *   delete:
 *     tags: [Posts]
 *     summary: Bỏ lưu bài viết
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Đã bỏ lưu }
 */
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

/**
 * @swagger
 * /api/posts/{id}/poll/{optionId}:
 *   post:
 *     tags: [Posts]
 *     summary: Bỏ phiếu cho một đáp án trong poll
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: optionId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Bỏ phiếu thành công }
 *       404: { description: Không tìm thấy }
 */
// POST /:id/poll/:optionId — vote on a poll
router.post('/:id/poll/:optionId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const postId = req.params.id;
    const optionId = req.params.optionId;
    const uid = req.uid!;
    const postRef = getDb().collection('posts').doc(postId);

    await getDb().runTransaction(async (t) => {
      const doc = await t.get(postRef);
      if (!doc.exists || doc.data()?.deleted === true) {
        throw new Error('Post not found');
      }
      const data = doc.data() as any;
      if (!data.poll || !Array.isArray(data.poll.options)) {
        throw new Error('Post does not contain a valid poll');
      }

      let optionFound = false;
      const newOptions = data.poll.options.map((opt: any) => {
        // Remove user from all options first (single vote policy)
        const votes = (opt.votes || []).filter((v: string) => v !== uid);
        if (opt.id === optionId) {
          optionFound = true;
          votes.push(uid);
        }
        return { ...opt, votes };
      });

      if (!optionFound) throw new Error('Option not found');

      t.update(postRef, { 'poll.options': newOptions });
    });

    res.json({ success: true });
  } catch (e) {
    if ((e as Error).message === 'Post not found' || (e as Error).message === 'Option not found') {
      res.status(404).json({ error: (e as Error).message });
    } else {
      res.status(500).json({ error: (e as Error).message });
    }
  }
});

/**
 * @swagger
 * /api/posts/{id}:
 *   get:
 *     tags: [Posts]
 *     summary: Xem chi tiết bài viết kèm comments
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *       404: { description: Không tìm thấy }
 *   patch:
 *     tags: [Posts]
 *     summary: Chỉnh sửa bài viết (chỉ tác giả)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content: { type: string }
 *               privacy: { type: string, enum: [public, friends, only-me] }
 *     responses:
 *       200: { description: Đã cập nhật }
 *       403: { description: Không có quyền }
 *   delete:
 *     tags: [Posts]
 *     summary: Xóa bài viết (chuyển vào thùng rác)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Đã xóa }
 *       403: { description: Không có quyền }
 */

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
      .limit(50)
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

/**
 * @swagger
 * /api/posts/{id}/restore:
 *   post:
 *     tags: [Posts]
 *     summary: Khôi phục bài viết từ thùng rác
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Đã khôi phục }
 *       403: { description: Không có quyền }
 */
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

/**
 * @swagger
 * /api/posts/{id}/permanent:
 *   delete:
 *     tags: [Posts]
 *     summary: Xóa vĩnh viễn khỏi Firestore
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Đã xóa vĩnh viễn }
 */
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

/**
 * @swagger
 * /api/posts/{id}/like:
 *   post:
 *     tags: [Posts]
 *     summary: Toggle like / bỏ like bài viết
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reaction: { type: string, example: '👍', description: 'Emoji reaction, mặc định 👍' }
 *     responses:
 *       200: { description: OK, content: { application/json: { schema: { type: object, properties: { liked: { type: boolean }, likeCount: { type: integer } } } } } }
 *       404: { description: Không tìm thấy }
 */
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

      try {
        const notification = await createNotification({
          userId: data.authorId as string,
          type: 'post_reaction',
          actorId: req.uid,
          entityType: 'post',
          entityId: req.params.id,
          message: `${reactor?.displayName ?? 'Ai đó'} đã thả cảm xúc ${reaction} vào bài viết của bạn.`,
        });

        if (notification) {
          const unreadCount = await getUnreadNotificationCount(data.authorId as string);
          emitNotificationNew(data.authorId as string, toApiNotification(notification));
          emitNotificationUnreadCount(data.authorId as string, unreadCount);
        }
      } catch (error) {
        console.warn('⚠️ Không tạo được notification post_reaction:', error);
      }
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

/**
 * @swagger
 * /api/posts/{id}/share:
 *   post:
 *     tags: [Posts]
 *     summary: Chia sẻ bài viết (tạo post mới có sharedFrom)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content: { type: string }
 *               privacy: { type: string, enum: [public, friends, only-me] }
 *     responses:
 *       201: { description: Đã chia sẻ }
 *       404: { description: Không tìm thấy }
 */
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

    let original = originalDoc.data()!;
    let targetPostId = req.params.id;

    // Nếu bài viết này đã là một bài chia sẻ, lấy thông tin bài gốc thay thế
    if (original.sharedFrom) {
      targetPostId = original.sharedFrom.id;
      // Lưu ý: Dữ liệu của bài gốc đã được lưu sẵn trong sharedFrom,
      // ta gán lại vào `original` để dùng cho việc tạo sharedFrom mới.
      original = {
        ...original,
        authorId: original.sharedFrom.authorId,
        authorDisplayName: original.sharedFrom.authorDisplayName,
        authorPhotoURL: original.sharedFrom.authorPhotoURL,
        content: original.sharedFrom.content,
        mediaUrls: original.sharedFrom.mediaUrls,
        createdAt: original.sharedFrom.createdAt,
      };
    }

    const userDoc = await usersRef.doc(req.uid!).get();
    const user = userDoc.data();

    const { content = '', reaction } = req.body;
    const shareContent = (content as string).trim();

    // AI Moderation cho caption của bài share
    const moderation = await moderatePost(shareContent, []);
    if (!moderation.allowed) {
      try {
        await db.collection('moderation_logs').add({
          userId: req.uid,
          contentSnippet: shareContent.substring(0, 200),
          mediaUrls: [],
          reason: moderation.reason ?? 'Nội dung không phù hợp',
          type: 'share_post',
          createdAt: new Date(),
        });
      } catch {
        // ignore log error
      }
      res.status(422).json({ error: `Caption vi phạm tiêu chuẩn cộng đồng: ${moderation.reason ?? 'Nội dung không phù hợp'}` });
      return;
    }

    const sharedPostRef = postsRef.doc();
    await sharedPostRef.set({
      authorId: req.uid,
      authorDisplayName: user?.displayName ?? 'Anonymous',
      authorPhotoURL: user?.photoURL ?? null,
      content: shareContent,
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
        id: targetPostId,
        authorId: original.authorId ?? null,
        authorDisplayName: original.authorDisplayName ?? 'Unknown',
        authorPhotoURL: original.authorPhotoURL ?? null,
        content: original.content ?? '',
        mediaUrls: original.mediaUrls ?? [],
        createdAt: original.createdAt ?? null,
      },
    });

    // Increment shareCount on original post
    await postsRef.doc(targetPostId).update({
      shareCount: FieldValue.increment(1),
    });

    const created = await sharedPostRef.get();
    // Emit real-time update for share count
    getIo().emit('post:shared', { postId: targetPostId });
    res.status(201).json({ id: created.id, ...created.data() });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/posts/{id}/reactions:
 *   get:
 *     tags: [Posts]
 *     summary: Danh sách người đã react
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 */
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
