import { Router } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { getDb } from '../config/firebase-admin.js';

const router = Router();

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
    } = req.body as {
      title?: string;
      description?: string;
      videoUrl: string;
      thumbnailUrl?: string | null;
      duration?: number | null;
      tags?: string[];
      privacy?: string;
    };

    if (!videoUrl?.trim()) {
      res.status(400).json({ error: 'videoUrl is required' });
      return;
    }

    const { getAuth } = await import('firebase-admin/auth');
    const user = await getAuth().getUser(req.uid!);

    const now = new Date();
    const videoData = {
      authorId: req.uid!,
      authorDisplayName: user.displayName ?? 'Anonymous',
      authorPhotoURL: user.photoURL ?? null,
      title: (title as string).trim(),
      description: (description as string).trim(),
      videoUrl: videoUrl.trim(),
      thumbnailUrl: thumbnailUrl ?? null,
      duration: duration ?? null,
      tags: Array.isArray(tags) ? tags : [],
      privacy,
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
    console.error('Error creating video:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

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

// ── GET /user/:uid — videos by a specific user ────────────────────────────────
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

// ── POST /:id/like — toggle like ──────────────────────────────────────────────
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

// ── POST /:id/view — increment view count (atomic) ────────────────────────────
router.post('/:id/view', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const ref = db.collection('videos').doc(req.params.id);
    const doc = await ref.get();

    if (!doc.exists || doc.data()?.deletedAt) {
      res.status(404).json({ error: 'Video not found' });
      return;
    }

    await ref.update({ viewCount: FieldValue.increment(1) });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ── DELETE /:id — soft delete (owner only) ────────────────────────────────────
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
      res.status(404).json({ error: 'Video not found' });
      return;
    }

    res.json({ id: doc.id, ...doc.data() });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
