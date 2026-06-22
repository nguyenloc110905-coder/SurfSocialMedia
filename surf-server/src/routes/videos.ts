import { Router } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { getDb } from '../config/firebase-admin.js';
import { logger } from '../config/logger.js';
import { emitCommentNew } from '../realtime/emitters/post.emitter.js';
import { moderateText } from '../services/aiModeration.js';

const router = Router();

/**
 * @swagger
 * /api/videos:
 *   post:
 *     tags: [Videos]
 *     summary: Tạo video ngắn mới (Surf Clips)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [videoUrl]
 *             properties:
 *               videoUrl: { type: string }
 *               thumbnailUrl: { type: string, nullable: true }
 *               caption: { type: string, nullable: true }
 *               privacy: { type: string, enum: [public, friends, only-me], default: public }
 *               location: { type: string, nullable: true }
 *               allowComments: { type: boolean, default: true }
 *               aiGenerated: { type: boolean, default: false }
 *     responses:
 *       201: { description: Video đã tạo }
 *       400: { description: Thiếu videoUrl }
 */
// ── POST / — create short video (client uploads to Cloudinary, sends back URL) ──
router.post('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const {
      title = '',
      description = '',
      videoUrl,
      thumbnailUrl = null,
      duration = null,
      tags = [],
      privacy = 'public',
      location = null,
      allowComments = true,
      aiGenerated = false,
      editOptions = {},
      textOverlays = [],
    } = req.body as {
      title?: string;
      description?: string;
      videoUrl: string;
      thumbnailUrl?: string | null;
      duration?: number | null;
      tags?: string[];
      privacy?: string;
      location?: string | null;
      allowComments?: boolean;
      aiGenerated?: boolean;
      editOptions?: {
        contentFit?: string;
        mutedOriginal?: boolean;
      };
      textOverlays?: Array<{
        id?: string;
        text?: string;
        color?: string;
        fontSize?: number;
        placement?: string;
      }>;
    };

    if (!videoUrl?.trim()) {
      res.status(400).json({ error: 'videoUrl is required' });
      return;
    }

    const { getAuth } = await import('firebase-admin/auth');
    const user = await getAuth().getUser(req.uid!);

    const now = new Date();
    const normalizedPrivacy = ['public', 'friends', 'only-me'].includes(privacy)
      ? privacy
      : 'public';
    const normalizedEditOptions = {
      contentFit: editOptions?.contentFit === 'contain' ? 'contain' : 'cover',
      mutedOriginal: editOptions?.mutedOriginal === true,
    };
    const normalizedTextOverlays = Array.isArray(textOverlays)
      ? textOverlays
          .map((overlay) => ({
            id: String(overlay.id ?? Date.now()),
            text: String(overlay.text ?? '')
              .trim()
              .slice(0, 90),
            color: /^#[0-9A-Fa-f]{6}$/.test(String(overlay.color ?? ''))
              ? String(overlay.color)
              : '#ffffff',
            fontSize: Math.min(40, Math.max(20, Number(overlay.fontSize) || 28)),
            placement: ['top', 'center', 'bottom'].includes(String(overlay.placement))
              ? String(overlay.placement)
              : 'center',
          }))
          .filter((overlay) => overlay.text)
          .slice(0, 3)
      : [];
    const normalizedTags = Array.isArray(tags)
      ? tags
          .map((tag) => String(tag).trim().replace(/^#/, '').slice(0, 40))
          .filter(Boolean)
          .slice(0, 8)
      : [];

    const videoData = {
      authorId: req.uid!,
      authorDisplayName: user.displayName ?? 'Anonymous',
      authorPhotoURL: user.photoURL ?? null,
      title: (title as string).trim(),
      description: (description as string).trim(),
      videoUrl: videoUrl.trim(),
      thumbnailUrl: thumbnailUrl ?? null,
      duration: duration ?? null,
      tags: normalizedTags,
      privacy: normalizedPrivacy,
      location:
        typeof location === 'string' && location.trim() ? location.trim().slice(0, 120) : null,
      allowComments: allowComments !== false,
      aiGenerated: aiGenerated === true,
      editOptions: normalizedEditOptions,
      textOverlays: normalizedTextOverlays,
      likeCount: 0,
      likedBy: [] as string[],
      commentCount: 0,
      viewCount: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    const ref = await db.collection('videos').add(videoData);
    res.status(201).json({ id: ref.id, ...videoData });
  } catch (e) {
    logger.error('Error creating video:', { stack: e instanceof Error ? e.stack : String(e) });
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/videos:
 *   get:
 *     tags: [Videos]
 *     summary: Lấy danh sách video (lọc theo hashtag)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: tag
 *         schema: { type: string }
 *     responses:
 *       200: { description: Danh sách video }
 */
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const tag = typeof req.query.tag === 'string' ? req.query.tag.trim() : '';
    const db = getDb();
    let videos: any[] = [];

    if (tag) {
      const snap = await db.collection('videos').where('tags', 'array-contains', tag).get();

      videos = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((v: any) => !v.deletedAt && v.privacy !== 'only-me')
        .sort((a: any, b: any) => {
          const timeA =
            typeof a.createdAt === 'object' && a.createdAt !== null
              ? ((a.createdAt as any)._seconds || (a.createdAt as any).seconds || 0) * 1000
              : new Date(a.createdAt as string).getTime() || 0;
          const timeB =
            typeof b.createdAt === 'object' && b.createdAt !== null
              ? ((b.createdAt as any)._seconds || (b.createdAt as any).seconds || 0) * 1000
              : new Date(b.createdAt as string).getTime() || 0;
          return timeB - timeA;
        })
        .slice(0, 50);
    } else {
      const snap = await db.collection('videos').orderBy('createdAt', 'desc').limit(50).get();

      videos = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((v: any) => !v.deletedAt && v.privacy !== 'only-me');
    }

    res.json({ videos });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/videos/foryou:
 *   get:
 *     tags: [Videos]
 *     summary: Thuật toán đề xuất video dựa trên lịch sử xem (For You Page)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 20 }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *     responses:
 *       200: { description: Danh sách video đã được chấm điểm }
 */
// ── GET /foryou — algorithm-driven feed based on watch history and tags ────
router.get('/foryou', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const limit = Math.min(Number(req.query.limit) || 10, 20);
    const page = Math.max(Number(req.query.page) || 1, 1);

    // Fetch user's watch history (interested tags)
    const userDoc = await db.collection('users').doc(req.uid!).get();
    const interestedTags: Record<string, number> = userDoc.exists
      ? userDoc.data()?.interestedTags || {}
      : {};

    type FsTs = { toMillis(): number };
    const toMs = (val: unknown): number => {
      if (!val) return 0;
      if (typeof (val as FsTs).toMillis === 'function') return (val as FsTs).toMillis();
      if (val instanceof Date) return val.getTime();
      return 0;
    };

    // Fetch pool of recent videos (say 200) to score
    // In a real app this would use a recommendation engine or vector DB
    const videosQ = db.collection('videos').orderBy('createdAt', 'desc').limit(200);
    const postsQ = db.collection('posts').orderBy('createdAt', 'desc').limit(200);

    const [videoSnap, postsSnap] = await Promise.all([videosQ.get(), postsQ.get()]);

    const clipItems = videoSnap.docs
      .filter((d) => {
        const data = d.data();
        return data.deletedAt == null && data.privacy === 'public';
      })
      .map((d) => ({
        _source: 'clip' as const,
        id: d.id,
        ...(d.data() as object),
      }));

    type PostData = {
      deleted?: boolean;
      mediaUrls?: string[];
      authorId?: string;
      authorDisplayName?: string;
      authorPhotoURL?: string | null;
      content?: string;
      privacy?: string;
      likeCount?: number;
      likedBy?: string[];
      replyCount?: number;
      createdAt?: unknown;
      updatedAt?: unknown;
    };

    const isVideoUrl = (u: string) =>
      u.includes('/video/upload/') || /\.(mp4|webm|mov|avi|mkv|ogv)(\?|$)/i.test(u);

    const postItems = postsSnap.docs
      .map((d) => {
        const data = d.data() as PostData;
        if (data.deleted === true) return null;
        const videoUrl = (data.mediaUrls ?? []).find((u) => isVideoUrl(u));
        if (!videoUrl) return null;
        return {
          _source: 'post' as const,
          id: d.id,
          authorId: data.authorId ?? '',
          authorDisplayName: data.authorDisplayName ?? 'Anonymous',
          authorPhotoURL: data.authorPhotoURL ?? null,
          title: '',
          description: data.content ?? '',
          videoUrl,
          thumbnailUrl: null,
          duration: null,
          tags: [], // Posts don't natively have tags array currently, but we could extract hashtags
          privacy: data.privacy ?? 'public',
          likeCount: data.likeCount ?? 0,
          likedBy: data.likedBy ?? [],
          commentCount: data.replyCount ?? 0,
          viewCount: 0,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt ?? data.createdAt,
          deletedAt: null,
        };
      })
      .filter(Boolean) as object[];

    const all = [...clipItems, ...postItems] as Array<any>;

    // Add extracted hashtags from post content
    for (const item of all) {
      if (item._source === 'post' && typeof item.description === 'string') {
        const hashtags = item.description.match(/#[\w\u00C0-\u1FFF\u2C00-\uD7FF]+/g) || [];
        item.tags = hashtags.map((t: string) => t.substring(1).toLowerCase());
      }
    }

    // Scoring algorithm
    const scoredVideos = all.map((video) => {
      // 1. Base engagement score
      const likes = video.likeCount || 0;
      const comments = video.commentCount || 0;
      const views = video.viewCount || 0;
      let score = likes * 5 + comments * 3 + views * 0.5;

      // 2. Personalization score based on tags
      let tagBonus = 0;
      const tags = video.tags || [];
      for (const tag of tags) {
        if (interestedTags[tag]) {
          tagBonus += interestedTags[tag] * 2; // +2 for each time user watched this tag
        }
      }

      // 3. Recency penalty (newer is better)
      const ageMs = Date.now() - toMs(video.createdAt);
      const ageHours = ageMs / (1000 * 60 * 60);
      const recencyMultiplier = Math.max(0.1, 1 - ageHours / 168); // linear decay over 7 days

      score = (score + tagBonus + 10) * recencyMultiplier; // +10 base score to ensure new videos still surface

      // Small random factor to ensure variety
      score += Math.random() * 5;

      return { ...video, _score: score };
    });

    // Sort by score
    scoredVideos.sort((a, b) => b._score - a._score);

    // Paginate
    const startIndex = (page - 1) * limit;
    const items = scoredVideos.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < scoredVideos.length;

    res.json({
      videos: items.map((v) => {
        const { _score, ...rest } = v;
        return rest;
      }),
      hasMore,
      nextPage: hasMore ? page + 1 : null,
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/videos/feed:
 *   get:
 *     tags: [Videos]
 *     summary: Feed video ngắn (ghép Videos + Posts có video, phân trang)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 20 }
 *       - in: query
 *         name: lastId
 *         schema: { type: string }
 *     responses:
 *       200: { description: Danh sách video }
 */
// ── GET /feed — paginated feed merging Videos collection + Posts with video ────
router.get('/feed', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const limit = Math.min(Number(req.query.limit) || 10, 20);
    // Timestamp cursor: ms since epoch of the oldest item from the previous page
    const before = req.query.before ? new Date(Number(req.query.before)) : null;

    type FsTs = { toMillis(): number };
    const toMs = (val: unknown): number => {
      if (!val) return 0;
      if (typeof (val as FsTs).toMillis === 'function') return (val as FsTs).toMillis();
      if (val instanceof Date) return val.getTime();
      return 0;
    };

    // ── 1. Surf Clips (videos collection) ─────────────────────────────────
    // Use only orderBy (single-field auto-index) and filter deletedAt/privacy in JS
    // to avoid needing a composite index while it builds.
    type Q = FirebaseFirestore.Query;
    let videosQ: Q = db.collection('videos').orderBy('createdAt', 'desc');
    if (before) videosQ = videosQ.where('createdAt', '<', before);
    videosQ = videosQ.limit((limit + 1) * 4); // overfetch since we filter in JS

    // ── 2. Feed Posts that contain a video URL ─────────────────────────────
    // Dùng orderBy đơn (auto-index), lọc hasVideo + deleted trong JS
    // để không cần composite index đang build.
    let postsQ: Q = db.collection('posts').orderBy('createdAt', 'desc');
    if (before) postsQ = postsQ.where('createdAt', '<', before);
    postsQ = postsQ.limit((limit + 1) * 8); // overfetch vì filter trong JS

    const [videoSnap, postsSnap] = await Promise.all([videosQ.get(), postsQ.get()]);

    // Normalize videos — filter deletedAt/privacy in JS
    const clipItems = videoSnap.docs
      .filter((d) => {
        const data = d.data();
        return data.deletedAt == null && data.privacy === 'public';
      })
      .map((d) => ({
        _source: 'clip' as const,
        id: d.id,
        ...(d.data() as object),
      }));

    // Normalize posts → clip shape
    type PostData = {
      deleted?: boolean;
      mediaUrls?: string[];
      authorId?: string;
      authorDisplayName?: string;
      authorPhotoURL?: string | null;
      content?: string;
      privacy?: string;
      likeCount?: number;
      likedBy?: string[];
      replyCount?: number;
      createdAt?: unknown;
      updatedAt?: unknown;
    };

    const isVideoUrl = (u: string) =>
      u.includes('/video/upload/') || /\.(mp4|webm|mov|avi|mkv|ogv)(\?|$)/i.test(u);

    const postItems = postsSnap.docs
      .map((d) => {
        const data = d.data() as PostData;
        if (data.deleted === true) return null;
        const videoUrl = (data.mediaUrls ?? []).find((u) => isVideoUrl(u));
        if (!videoUrl) return null;
        return {
          _source: 'post' as const,
          id: d.id,
          authorId: data.authorId ?? '',
          authorDisplayName: data.authorDisplayName ?? 'Anonymous',
          authorPhotoURL: data.authorPhotoURL ?? null,
          title: '',
          description: data.content ?? '',
          videoUrl,
          thumbnailUrl: null,
          duration: null,
          tags: [],
          privacy: data.privacy ?? 'public',
          location: null,
          allowComments: true,
          aiGenerated: false,
          editOptions: { contentFit: 'contain', mutedOriginal: false },
          textOverlays: [],
          likeCount: data.likeCount ?? 0,
          likedBy: data.likedBy ?? [],
          commentCount: data.replyCount ?? 0,
          viewCount: 0,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt ?? data.createdAt,
          deletedAt: null,
        };
      })
      .filter(Boolean) as object[];

    // Merge, sort newest-first, paginate
    const all = [...clipItems, ...postItems].sort(
      (a, b) =>
        toMs((b as { createdAt: unknown }).createdAt) -
        toMs((a as { createdAt: unknown }).createdAt)
    );

    const hasMore = all.length > limit;
    const items = all.slice(0, limit);
    const nextCursor =
      items.length > 0 ? toMs((items[items.length - 1] as { createdAt: unknown }).createdAt) : null;

    res.json({ videos: items, hasMore, nextCursor });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/videos/user/{uid}:
 *   get:
 *     tags: [Videos]
 *     summary: Video của một user cụ thể
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: uid
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Danh sách video }
 */
// ── GET /user/:uid — videos by a specific user ──────────────────────────────────────
router.get('/user/:uid', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const snapshot = await db
      .collection('videos')
      .where('authorId', '==', req.params.uid)
      .where('deletedAt', '==', null)
      .orderBy('createdAt', 'desc')
      .get();

    const videos = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json(videos);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/videos/{id}/like:
 *   post:
 *     tags: [Videos]
 *     summary: Toggle like video
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 */
// ── POST /:id/like — toggle like ──────────────────────────────────────────────────────────────
router.post('/:id/like', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const ref = db.collection('videos').doc(req.params.id);
    const doc = await ref.get();

    if (!doc.exists || doc.data()?.deletedAt) {
      res.status(404).json({ error: 'Video not found' });
      return;
    }

    const likedBy: string[] = doc.data()?.likedBy ?? [];
    const idx = likedBy.indexOf(req.uid!);
    if (idx === -1) {
      likedBy.push(req.uid!);
    } else {
      likedBy.splice(idx, 1);
    }

    await ref.update({ likedBy, likeCount: likedBy.length });
    res.json({ liked: idx === -1, likeCount: likedBy.length });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/videos/{id}/view:
 *   post:
 *     tags: [Videos]
 *     summary: Tăng view count của video
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 */
// ── POST /:id/view — increment view count (atomic) ─────────────────────────────────────
router.post('/:id/view', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const ref = db.collection('videos').doc(req.params.id);
    const doc = await ref.get();

    if (!doc.exists || doc.data()?.deletedAt) {
      res.status(404).json({ error: 'Video not found' });
      return;
    }

    const data = doc.data()!;
    const tags = Array.isArray(data.tags) ? data.tags : [];

    // Increment global view count
    await ref.update({ viewCount: FieldValue.increment(1) });

    // Track user's interested tags based on watch history
    if (tags.length > 0 && req.uid) {
      const userRef = db.collection('users').doc(req.uid);
      const userDoc = await userRef.get();
      if (userDoc.exists) {
        const userData = userDoc.data()!;
        let interestedTags: Record<string, number> = userData.interestedTags || {};

        // Decay older scores occasionally to prefer recent interests (simplified)
        for (const tag of tags) {
          interestedTags[tag] = (interestedTags[tag] || 0) + 1;
        }

        // Keep only top 50 tags to avoid huge document size
        const sortedTags = Object.entries(interestedTags)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 50);
        interestedTags = Object.fromEntries(sortedTags);

        await userRef.update({ interestedTags });
      }
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/videos/{id}/share:
 *   post:
 *     tags: [Videos]
 *     summary: Tăng share count của video
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 */
// ── POST /:id/share — increment share count (atomic) ─────────────────────────────────────
router.post('/:id/share', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const ref = db.collection('videos').doc(req.params.id);
    const doc = await ref.get();

    if (!doc.exists || doc.data()?.deletedAt) {
      res.status(404).json({ error: 'Video not found' });
      return;
    }

    await ref.update({ shareCount: FieldValue.increment(1) });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/videos/{id}:
 *   delete:
 *     tags: [Videos]
 *     summary: Xóa video (soft delete, chỉ owner)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *       403: { description: Không phải owner }
 *   get:
 *     tags: [Videos]
 *     summary: Xem chi tiết 1 video
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *       404: { description: Không tìm thấy }
 */
// ── DELETE /:id — soft delete (owner only) ─────────────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const ref = db.collection('videos').doc(req.params.id);
    const doc = await ref.get();

    if (!doc.exists || doc.data()?.deletedAt) {
      res.status(404).json({ error: 'Video not found' });
      return;
    }

    if (doc.data()?.authorId !== req.uid) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    await ref.update({ deletedAt: new Date() });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ── GET /:id — single video (must be last to avoid conflicting with /feed, /user/:uid) ──
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const doc = await db.collection('videos').doc(req.params.id).get();

    if (!doc.exists || doc.data()?.deletedAt) {
      // Fallback to posts
      const postDoc = await db.collection('posts').doc(req.params.id).get();
      const data = postDoc.data();
      if (!postDoc.exists || data?.deleted === true) {
        res.status(404).json({ error: 'Video not found' });
        return;
      }
      const isVideoUrl = (u: string) =>
        u.includes('/video/upload/') || /\.(mp4|webm|mov|avi|mkv|ogv)(\?|$)/i.test(u);
      const videoUrl = (data?.mediaUrls ?? []).find(isVideoUrl);
      if (!videoUrl) {
        res.status(404).json({ error: 'Video not found' });
        return;
      }
      res.json({
        id: postDoc.id,
        _source: 'post',
        authorId: data?.authorId ?? '',
        authorDisplayName: data?.authorDisplayName ?? 'Anonymous',
        authorPhotoURL: data?.authorPhotoURL ?? null,
        title: '',
        description: data?.content ?? '',
        videoUrl,
        thumbnailUrl: null,
        duration: null,
        tags: [],
        privacy: data?.privacy ?? 'public',
        location: null,
        allowComments: true,
        aiGenerated: false,
        editOptions: { contentFit: 'contain', mutedOriginal: false },
        textOverlays: [],
        likeCount: data?.likeCount ?? 0,
        likedBy: data?.likedBy ?? [],
        commentCount: data?.replyCount ?? 0,
        viewCount: 0,
        createdAt: data?.createdAt,
        updatedAt: data?.updatedAt ?? data?.createdAt,
      });
      return;
    }

    res.json({ id: doc.id, ...doc.data() });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ── VID-6: Comments on video ─────────────────────────────────────────────────

// GET /api/videos/:id/comments
router.get('/:id/comments', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const snap = await db
      .collection('comments')
      .where('postId', '==', req.params.id)
      .orderBy('createdAt', 'asc')
      .get();
    const comments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ comments });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// POST /api/videos/:id/comments
router.post('/:id/comments', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const { content, parentId } = req.body;
    if (!content?.trim()) {
      res.status(400).json({ error: 'Comment content is required' });
      return;
    }

    const videoDoc = await db.collection('videos').doc(req.params.id).get();
    if (!videoDoc.exists) {
      res.status(404).json({ error: 'Video not found' });
      return;
    }

    const moderation = await moderateText(content.trim());
    if (!moderation.allowed) {
      res.status(422).json({
        error: `Bình luận vi phạm tiêu chuẩn cộng đồng: ${moderation.reason ?? 'Nội dung không phù hợp'}`,
      });
      return;
    }

    const userDoc = await db.collection('users').doc(req.uid!).get();
    const user = userDoc.data();

    const commentRef = db.collection('comments').doc();
    const commentData: Record<string, unknown> = {
      postId: req.params.id,
      authorId: req.uid,
      authorDisplayName: user?.displayName ?? 'Anonymous',
      authorPhotoURL: user?.photoURL ?? null,
      content: content.trim(),
      createdAt: new Date(),
      updatedAt: new Date(),
      likeCount: 0,
      likedBy: [],
    };
    if (parentId) commentData.parentId = parentId;

    await commentRef.set(commentData);
    await db
      .collection('videos')
      .doc(req.params.id)
      .update({ commentCount: FieldValue.increment(1) });

    const responseData = { id: commentRef.id, ...commentData };
    emitCommentNew(req.params.id, responseData);

    res.status(201).json(responseData);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
