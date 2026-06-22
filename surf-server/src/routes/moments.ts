import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { getDb } from '../config/firebase-admin.js';
import { logger } from '../config/logger.js';

const router = Router();

/**
 * @swagger
 * /api/moments:
 *   post:
 *     tags: [Moments]
 *     summary: Tạo moment mới (Story 24h)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mediaUrl]
 *             properties:
 *               mediaUrl: { type: string }
 *               mediaType: { type: string, enum: [image, video], default: image }
 *               caption: { type: string, nullable: true }
 *               duration: { type: integer, description: 'Chỉ cho video (giây)' }
 *     responses:
 *       201: { description: Moment đã tạo }
 *       400: { description: Thiếu mediaUrl }
 */
// ── POST / — Tạo moment mới ────────────────────────────────────────────────
router.post('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const usersRef = db.collection('users');
    const momentsRef = db.collection('moments');

    const {
      mediaUrl,
      mediaType,
      caption,
      filter,
      textOverlay,
      textColor,
      textFont,
      textSize,
      textX,
      textY,
      textStyle,
      textRotation,
      stickers,
      musicUrl,
      musicTitle,
      musicArtist,
      audioMode,
      privacy = 'public',
      privacyAllowList,
      privacyBlockList,
    } = req.body;

    if (!mediaUrl) {
      res.status(400).json({ error: 'mediaUrl is required' });
      return;
    }

    const userDoc = await usersRef.doc(req.uid!).get();
    const user = userDoc.data();

    const docRef = momentsRef.doc();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h

    await docRef.set({
      userId: req.uid,
      userDisplayName: user?.displayName ?? 'Anonymous',
      userPhotoURL: user?.photoURL ?? null,
      mediaUrl,
      mediaType: mediaType || 'image',
      caption: caption || null,
      filter: filter || null,
      textOverlay: textOverlay || null,
      textColor: textColor || null,
      textFont: textFont || null,
      textSize: textSize ?? null,
      textX: textX ?? null,
      textY: textY ?? null,
      textStyle: textStyle || null,
      textRotation: textRotation ?? null,
      stickers: Array.isArray(stickers) ? stickers : null,
      musicUrl: musicUrl || null,
      musicTitle: musicTitle || null,
      musicArtist: musicArtist || null,
      audioMode: audioMode || 'original',
      privacy: privacy || 'public',
      privacyAllowList: Array.isArray(privacyAllowList) ? privacyAllowList : null,
      privacyBlockList: Array.isArray(privacyBlockList) ? privacyBlockList : null,
      reactions: {},
      reactionsList: [],
      viewedBy: [],
      viewCount: 0,
      createdAt: now,
      expiresAt,
    });

    const created = await docRef.get();
    res.status(201).json({ id: created.id, ...created.data() });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/moments/feed:
 *   get:
 *     tags: [Moments]
 *     summary: Feed moments của bạn bè (nhóm theo user, lọc 24h)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Danh sách moments nhóm theo user }
 */
// ── GET /feed — Lấy moments feed (nhóm theo user) ──────────────────────────
router.get('/feed', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const momentsRef = db.collection('moments');

    // Lấy tất cả moments chưa hết hạn
    const now = new Date();
    const snap = await momentsRef.where('expiresAt', '>', now).orderBy('expiresAt', 'asc').get();

    // Nhóm theo userId
    const groupMap = new Map<
      string,
      {
        userId: string;
        userDisplayName: string;
        userPhotoURL: string | null;
        moments: Array<{ id: string; [key: string]: unknown }>;
        hasUnviewed: boolean;
      }
    >();

    for (const doc of snap.docs) {
      const data = doc.data();
      // Kiểm tra privacy
      if (data.privacy === 'only_me' && data.userId !== req.uid) continue;
      if (data.privacy === 'custom_allow' && data.userId !== req.uid) {
        const allowList: string[] = data.privacyAllowList ?? [];
        if (!allowList.includes(req.uid!)) continue;
      }
      if (data.privacy === 'custom_block' && data.userId !== req.uid) {
        const blockList: string[] = data.privacyBlockList ?? [];
        if (blockList.includes(req.uid!)) continue;
      }

      const uid = data.userId as string;
      if (!groupMap.has(uid)) {
        groupMap.set(uid, {
          userId: uid,
          userDisplayName: data.userDisplayName ?? 'Anonymous',
          userPhotoURL: data.userPhotoURL ?? null,
          moments: [],
          hasUnviewed: false,
        });
      }

      const group = groupMap.get(uid)!;
      const viewedBy: string[] = data.viewedBy ?? [];
      if (!viewedBy.includes(req.uid!)) {
        group.hasUnviewed = true;
      }
      group.moments.push({ id: doc.id, ...data });
    }

    // Đưa moments của user hiện tại lên đầu
    const groups = Array.from(groupMap.values());
    // Sắp xếp moments trong mỗi group theo createdAt mới nhất
    for (const g of groups) {
      g.moments.sort((a, b) => {
        const aT =
          (a.createdAt as { toMillis?: () => number })?.toMillis?.() ??
          new Date(a.createdAt as string).getTime();
        const bT =
          (b.createdAt as { toMillis?: () => number })?.toMillis?.() ??
          new Date(b.createdAt as string).getTime();
        return bT - aT;
      });
    }
    groups.sort((a, b) => {
      if (a.userId === req.uid) return -1;
      if (b.userId === req.uid) return 1;
      // Ưu tiên group có unviewed
      if (a.hasUnviewed && !b.hasUnviewed) return -1;
      if (!a.hasUnviewed && b.hasUnviewed) return 1;
      return 0;
    });

    res.json({ groups });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/moments/{id}/view:
 *   post:
 *     tags: [Moments]
 *     summary: Đánh dấu đã xem moment
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
// ── POST /:id/view — Đánh dấu đã xem ──────────────────────────────────────
router.post('/:id/view', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const ref = db.collection('moments').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) {
      res.status(404).json({ error: 'Moment not found' });
      return;
    }

    const data = doc.data()!;
    const viewedBy: string[] = data.viewedBy ?? [];

    if (!viewedBy.includes(req.uid!)) {
      viewedBy.push(req.uid!);
      await ref.update({
        viewedBy,
        viewCount: viewedBy.length,
      });
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/moments/{id}/react:
 *   post:
 *     tags: [Moments]
 *     summary: Thêm emoji reaction vào moment
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
 *               emoji: { type: string, example: '❤️' }
 *     responses:
 *       200: { description: OK }
 *       404: { description: Không tìm thấy }
 */
// ── POST /:id/react — Thêm reaction ────────────────────────────────────────
router.post('/:id/react', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const usersRef = db.collection('users');
    const ref = db.collection('moments').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) {
      res.status(404).json({ error: 'Moment not found' });
      return;
    }

    const { emoji } = req.body;
    if (!emoji) {
      res.status(400).json({ error: 'emoji is required' });
      return;
    }

    const data = doc.data()!;
    const reactions: Record<string, number> = data.reactions ?? {};
    const reactionsList: Array<{
      uid: string;
      name: string;
      photoURL: string | null;
      emoji: string;
      ts: number;
    }> = data.reactionsList ?? [];

    // Giới hạn mỗi user tối đa 7 reactions
    const userReactions = reactionsList.filter((r) => r.uid === req.uid);
    if (userReactions.length >= 7) {
      res.status(429).json({ error: 'Max 7 reactions per user' });
      return;
    }

    // Lấy thông tin user
    const userDoc = await usersRef.doc(req.uid!).get();
    const userData = userDoc.data();

    // Thêm reaction entry
    reactionsList.push({
      uid: req.uid!,
      name: userData?.displayName ?? 'Anonymous',
      photoURL: userData?.photoURL ?? null,
      emoji,
      ts: Date.now(),
    });

    // Cập nhật tổng count
    reactions[emoji] = (reactions[emoji] ?? 0) + 1;

    await ref.update({ reactions, reactionsList });

    res.json({ reactions, reactionsList });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/moments/{id}:
 *   patch:
 *     tags: [Moments]
 *     summary: Chỉnh sửa moment (chỉ tác giả)
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
 *               caption: { type: string }
 *     responses:
 *       200: { description: OK }
 *       403: { description: Không phải tác giả }
 *   delete:
 *     tags: [Moments]
 *     summary: Xóa moment (chỉ tác giả)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *       403: { description: Không phải tác giả }
 */
// ── PATCH /:id — Chỉnh sửa moment ──────────────────────────────────────────
router.patch('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const ref = db.collection('moments').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists || doc.data()?.userId !== req.uid) {
      res.status(404).json({ error: 'Moment not found or forbidden' });
      return;
    }

    const {
      caption,
      privacy,
      privacyAllowList,
      privacyBlockList,
      textOverlay,
      textColor,
      textFont,
      textSize,
      textX,
      textY,
      textStyle,
      textRotation,
    } = req.body;

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (caption !== undefined) update.caption = caption;
    if (privacy !== undefined) update.privacy = privacy;
    if (privacyAllowList !== undefined) update.privacyAllowList = privacyAllowList;
    if (privacyBlockList !== undefined) update.privacyBlockList = privacyBlockList;
    if (textOverlay !== undefined) update.textOverlay = textOverlay;
    if (textColor !== undefined) update.textColor = textColor;
    if (textFont !== undefined) update.textFont = textFont;
    if (textSize !== undefined) update.textSize = textSize;
    if (textX !== undefined) update.textX = textX;
    if (textY !== undefined) update.textY = textY;
    if (textStyle !== undefined) update.textStyle = textStyle;
    if (textRotation !== undefined) update.textRotation = textRotation;

    await ref.update(update);
    const updated = await ref.get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/moments/{id}:
 *   delete:
 *     tags: [Moments]
 *     summary: Xóa moment (chỉ tác giả)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *       403: { description: Không phải tác giả }
 */
// ── DELETE /:id — Xóa moment ────────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const ref = db.collection('moments').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists || doc.data()?.userId !== req.uid) {
      res.status(404).json({ error: 'Moment not found or forbidden' });
      return;
    }

    await ref.delete();
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/moments/music/search:
 *   get:
 *     tags: [Moments]
 *     summary: Tìm kiếm nhạc cho moment qua Deezer
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Danh sách nhạc }
 *       400: { description: Thiếu query q }
 */
// ── GET /music/search — Tìm nhạc qua iTunes API ────────────────────────────
router.get('/music/search', requireAuth, async (req: AuthRequest, res) => {
  try {
    const q = (req.query.q as string)?.trim();
    if (!q) {
      res.json({ tracks: [] });
      return;
    }

    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&limit=15`;
    const response = await fetch(url);
    if (!response.ok) {
      res.json({ tracks: [] });
      return;
    }

    const data = (await response.json()) as {
      results?: Array<{
        trackId: number;
        trackName: string;
        artistName: string;
        previewUrl: string;
        artworkUrl100: string;
      }>;
    };

    const tracks = (data.results ?? [])
      .filter((t) => t.previewUrl) // chỉ lấy bài có preview 30s
      .map((t) => ({
        id: String(t.trackId),
        title: t.trackName,
        artist: t.artistName,
        preview: t.previewUrl,
        cover: t.artworkUrl100,
      }));

    res.json({ tracks });
  } catch (e) {
    logger.error('[moments/tracks]', { stack: e instanceof Error ? e.stack : String(e) });
    res.json({ tracks: [] });
  }
});

export default router;
