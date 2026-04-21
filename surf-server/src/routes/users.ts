import { Router } from 'express';
import { requireAuth, AuthRequest, requireNoBlock } from '../middleware/auth.js';
import { getDb } from '../config/firebase-admin.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

const router = Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getRelationship(viewerUid: string, targetUid: string) {
  const [friendDoc, followDoc] = await Promise.all([
    getDb().collection('friends').doc(viewerUid).get(),
    getDb().collection('follows').doc(viewerUid).get(),
  ]);
  const friendIds: string[] = friendDoc.exists ? (friendDoc.data()?.friendIds ?? []) : [];
  const followingIds: string[] = followDoc.exists ? (followDoc.data()?.followingIds ?? []) : [];
  return {
    isFriend: friendIds.includes(targetUid),
    isFollowing: followingIds.includes(targetUid),
  };
}

// ─── Static routes (phải đặt trước /:uid) ─────────────────────────────────

/** Bỏ dấu tiếng Việt & chuyển thường để so sánh không phân biệt dấu */
function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * @swagger
 * /api/users/search:
 *   get:
 *     tags: [Users]
 *     summary: Tìm kiếm user theo tên
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Danh sách user khớp }
 */
router.get('/search', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) {
      res.json({ users: [] });
      return;
    }
    const [myUserDoc, blockedByMeSnap, snap] = await Promise.all([
      getDb().collection('users').doc(uid).get(),
      getDb().collection('users').where('blockedBy', 'array-contains', uid).get(),
      getDb().collection('users').get(),
    ]);
    const blockedByOthers = new Set<string>(
      myUserDoc.exists ? ((myUserDoc.data()?.blockedBy ?? []) as string[]) : []
    );
    const blockedByMe = new Set<string>(blockedByMeSnap.docs.map((d) => d.id));
    const normQ = normalize(q);
    type UserDoc = { id: string; displayName?: string; photoURL?: string };
    const matched = snap.docs
      .filter((d) => d.id !== uid && !blockedByOthers.has(d.id) && !blockedByMe.has(d.id))
      .map((d) => ({ id: d.id, ...d.data() }) as UserDoc)
      .filter((u) => {
        const words = normalize(u.displayName ?? '').split(/\s+/);
        return words.some((w) => w.startsWith(normQ));
      })
      .slice(0, 20);

    // Compute mutual friend count for each result
    const myFriendDoc = await getDb().collection('friends').doc(uid).get();
    const myFriendIds = new Set<string>(
      myFriendDoc.exists ? (myFriendDoc.data()?.friendIds ?? []) : []
    );
    const matchedIds = matched.map((u) => u.id);
    const friendDocs =
      matchedIds.length > 0
        ? await getDb().getAll(...matchedIds.map((id) => getDb().collection('friends').doc(id)))
        : [];
    const theirFriendsMap = new Map<string, string[]>();
    friendDocs.forEach((d) => {
      if (d.exists) theirFriendsMap.set(d.id, d.data()?.friendIds ?? []);
    });

    const users = matched.map((u) => {
      const theirFriends = theirFriendsMap.get(u.id) ?? [];
      const mutualCount = theirFriends.filter((id: string) => myFriendIds.has(id)).length;
      return { id: u.id, name: u.displayName ?? 'Unknown', avatarUrl: u.photoURL, mutualCount };
    });
    res.json({ users });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/users/me:
 *   get:
 *     tags: [Users]
 *     summary: Lấy hồ sơ của bản thân
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 *       404: { description: User chưa tồn tại }
 */
router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const doc = await getDb().collection('users').doc(req.uid!).get();
    if (!doc.exists) {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }
    res.json({ id: doc.id, ...doc.data() });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/users/me:
 *   put:
 *     tags: [Users]
 *     summary: Cập nhật hồ sơ của bản thân
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               displayName: { type: string }
 *               bio: { type: string }
 *               photoURL: { type: string }
 *               email: { type: string }
 *     responses:
 *       200: { description: OK }
 */
router.put('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { displayName, bio, photoURL, email } = req.body;
    const ref = getDb().collection('users').doc(req.uid!);
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

/**
 * @swagger
 * /api/users/me/recent-searches:
 *   get:
 *     tags: [Users]
 *     summary: Lấy danh sách tìm kiếm gần đây
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 *   put:
 *     tags: [Users]
 *     summary: Cập nhật danh sách tìm kiếm gần đây
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               recentSearches: { type: array, items: { type: object } }
 *     responses:
 *       200: { description: OK }
 */
router.get('/me/recent-searches', requireAuth, async (req: AuthRequest, res) => {
  try {
    const doc = await getDb().collection('users').doc(req.uid!).get();
    const recentSearches = doc.exists ? (doc.data()?.recentSearches ?? []) : [];
    res.json({ recentSearches });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** PUT /api/users/me/recent-searches */
router.put('/me/recent-searches', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { recentSearches } = req.body as { recentSearches?: unknown[] };
    if (!Array.isArray(recentSearches)) {
      res.status(400).json({ error: 'recentSearches must be an array' });
      return;
    }
    const trimmed = recentSearches.slice(0, 8);
    await getDb()
      .collection('users')
      .doc(req.uid!)
      .set({ recentSearches: trimmed }, { merge: true });
    res.json({ recentSearches: trimmed });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/users/me/blocked:
 *   get:
 *     tags: [Users]
 *     summary: Danh sách user đã bị chặn
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 */
router.get('/me/blocked', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const limitNum = Math.min(parseInt(req.query.limit as string) || 200, 500);

    const snap = await getDb()
      .collection('users')
      .where('blockedBy', 'array-contains', uid)
      .limit(limitNum)
      .get();

    const blocked = snap.docs.map((d) => {
      const data = d.data() as {
        displayName?: string;
        photoURL?: string | null;
        email?: string | null;
      };
      return {
        id: d.id,
        name: data.displayName ?? 'Unknown',
        avatarUrl: data.photoURL ?? null,
        email: data.email ?? null,
      };
    });

    res.json({ blocked });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/users/{uid}/block-status:
 *   get:
 *     tags: [Users]
 *     summary: Kiểm tra trạng thái chặn giữa tôi và user khác
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: uid
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 */
router.get('/:uid/block-status', requireAuth, async (req: AuthRequest, res) => {
  try {
    const viewerUid = req.uid!;
    const targetUid = req.params.uid;

    if (viewerUid === targetUid) {
      res.json({
        isSelf: true,
        isBlocking: false,
        isBlockedBy: false,
        isBlocked: false,
      });
      return;
    }

    const [viewerDoc, targetDoc] = await Promise.all([
      getDb().collection('users').doc(viewerUid).get(),
      getDb().collection('users').doc(targetUid).get(),
    ]);

    if (!targetDoc.exists) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const viewerBlockedBy: string[] = viewerDoc.exists
      ? ((viewerDoc.data()?.blockedBy ?? []) as string[])
      : [];
    const targetBlockedBy: string[] = targetDoc.exists
      ? ((targetDoc.data()?.blockedBy ?? []) as string[])
      : [];

    const isBlocking = targetBlockedBy.includes(viewerUid);
    const isBlockedBy = viewerBlockedBy.includes(targetUid);

    res.json({
      isSelf: false,
      isBlocking,
      isBlockedBy,
      isBlocked: isBlocking || isBlockedBy,
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/users/{uid}/block:
 *   post:
 *     tags: [Users]
 *     summary: Chặn user
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: uid
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Đã chặn }
 *   delete:
 *     tags: [Users]
 *     summary: Bỏ chặn user
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: uid
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Đã bỏ chặn }
 */
router.post('/:uid/block', requireAuth, async (req: AuthRequest, res) => {
  try {
    const viewerUid = req.uid!;
    const targetUid = req.params.uid;

    if (viewerUid === targetUid) {
      res.status(400).json({ error: 'Cannot block yourself' });
      return;
    }

    const targetRef = getDb().collection('users').doc(targetUid);
    const targetDoc = await targetRef.get();
    if (!targetDoc.exists) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // 1) Ghi trạng thái block theo AC: blockedBy array trên user bị block
    await targetRef.set(
      {
        blockedBy: FieldValue.arrayUnion(viewerUid),
        updatedAt: new Date(),
      },
      { merge: true }
    );

    // 2) Dọn dữ liệu quan hệ để tránh còn tương tác cũ
    const [myFriendsDoc, theirFriendsDoc, req1, req2] = await Promise.all([
      getDb().collection('friends').doc(viewerUid).get(),
      getDb().collection('friends').doc(targetUid).get(),
      getDb()
        .collection('friend_requests')
        .where('fromUid', '==', viewerUid)
        .where('toUid', '==', targetUid)
        .get(),
      getDb()
        .collection('friend_requests')
        .where('fromUid', '==', targetUid)
        .where('toUid', '==', viewerUid)
        .get(),
    ]);

    const myFriendIds: string[] = myFriendsDoc.exists
      ? ((myFriendsDoc.data()?.friendIds ?? []) as string[])
      : [];
    const theirFriendIds: string[] = theirFriendsDoc.exists
      ? ((theirFriendsDoc.data()?.friendIds ?? []) as string[])
      : [];

    const batch = getDb().batch();
    batch.set(
      getDb().collection('friends').doc(viewerUid),
      { friendIds: myFriendIds.filter((id) => id !== targetUid) },
      { merge: true }
    );
    batch.set(
      getDb().collection('friends').doc(targetUid),
      { friendIds: theirFriendIds.filter((id) => id !== viewerUid) },
      { merge: true }
    );
    batch.set(
      getDb().collection('follows').doc(viewerUid),
      { followingIds: FieldValue.arrayRemove(targetUid) },
      { merge: true }
    );
    batch.set(
      getDb().collection('follows').doc(targetUid),
      { followingIds: FieldValue.arrayRemove(viewerUid) },
      { merge: true }
    );
    req1.docs.forEach((d) => batch.delete(d.ref));
    req2.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();

    res.json({ success: true, blocked: true, targetUid });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** DELETE /api/users/:uid/block */
router.delete('/:uid/block', requireAuth, async (req: AuthRequest, res) => {
  try {
    const viewerUid = req.uid!;
    const targetUid = req.params.uid;

    if (viewerUid === targetUid) {
      res.status(400).json({ error: 'Cannot unblock yourself' });
      return;
    }

    const targetRef = getDb().collection('users').doc(targetUid);
    const targetDoc = await targetRef.get();
    if (!targetDoc.exists) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    await targetRef.set(
      {
        blockedBy: FieldValue.arrayRemove(viewerUid),
        updatedAt: new Date(),
      },
      { merge: true }
    );

    res.json({ success: true, blocked: false, targetUid });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/users/:uid/unblock */
router.post('/:uid/unblock', requireAuth, async (req: AuthRequest, res) => {
  try {
    const viewerUid = req.uid!;
    const targetUid = req.params.uid;

    if (viewerUid === targetUid) {
      res.status(400).json({ error: 'Cannot unblock yourself' });
      return;
    }

    const targetRef = getDb().collection('users').doc(targetUid);
    const targetDoc = await targetRef.get();
    if (!targetDoc.exists) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    await targetRef.set(
      {
        blockedBy: FieldValue.arrayRemove(viewerUid),
        updatedAt: new Date(),
      },
      { merge: true }
    );

    res.json({ success: true, blocked: false, targetUid });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ─── Follow routes ───────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/users/{uid}/follow-status:
 *   get:
 *     tags: [Users]
 *     summary: Kiểm tra trạng thái follow
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: uid
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 */
router.get('/:uid/follow-status', requireAuth, async (req: AuthRequest, res) => {
  try {
    const viewerUid = req.uid!;
    const targetUid = req.params.uid;
    if (viewerUid === targetUid) {
      res.json({ isFollowing: false, isSelf: true });
      return;
    }
    const { isFriend, isFollowing } = await getRelationship(viewerUid, targetUid);
    // Đếm followers của target
    const followersSnap = await getDb()
      .collection('follows')
      .where('followingIds', 'array-contains', targetUid)
      .get();
    // Đếm following của target
    const targetFollowDoc = await getDb().collection('follows').doc(targetUid).get();
    const followingCount: number = targetFollowDoc.exists
      ? (targetFollowDoc.data()?.followingIds ?? []).length
      : 0;
    res.json({ isFollowing, isFriend, followerCount: followersSnap.size, followingCount });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/users/{uid}/follow:
 *   post:
 *     tags: [Users]
 *     summary: Follow user
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: uid
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Đã follow }
 */
router.post(
  '/:uid/follow',
  requireAuth,
  requireNoBlock((req: AuthRequest) => req.params.uid),
  async (req: AuthRequest, res) => {
    try {
      const viewerUid = req.uid!;
      const targetUid = req.params.uid;
      if (viewerUid === targetUid) {
        res.status(400).json({ error: 'Cannot follow yourself' });
        return;
      }
      await getDb()
        .collection('follows')
        .doc(viewerUid)
        .set({ followingIds: FieldValue.arrayUnion(targetUid) }, { merge: true });
      res.json({ success: true, isFollowing: true });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  }
);

/**
 * @swagger
 * /api/users/{uid}/unfollow:
 *   post:
 *     tags: [Users]
 *     summary: Unfollow user
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: uid
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Đã unfollow }
 */
router.post(
  '/:uid/unfollow',
  requireAuth,
  requireNoBlock((req: AuthRequest) => req.params.uid),
  async (req: AuthRequest, res) => {
    try {
      const viewerUid = req.uid!;
      const targetUid = req.params.uid;
      await getDb()
        .collection('follows')
        .doc(viewerUid)
        .set({ followingIds: FieldValue.arrayRemove(targetUid) }, { merge: true });
      res.json({ success: true, isFollowing: false });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  }
);

// ─── Sub-collection routes (phải đặt trước /:uid GET) ──────────────────────

/**
 * @swagger
 * /api/users/{uid}/posts:
 *   get:
 *     tags: [Users]
 *     summary: Bài viết của user (bao gồm bài chia sẻ)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: uid
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: lastId
 *         schema: { type: string }
 *     responses:
 *       200: { description: Danh sách bài viết }
 */
router.get('/:uid/posts', requireAuth, async (req: AuthRequest, res) => {
  try {
    const viewerUid = req.uid!;
    const targetUid = req.params.uid;
    const limitNum = Math.min(parseInt(req.query.limit as string) || 50, 100);

    // Fetch all posts authored by this user, filter deleted/replies in memory.
    // No orderBy here — compound index not guaranteed; sorting done in memory below.
    const snap = await getDb()
      .collection('posts')
      .where('authorId', '==', targetUid)
      .limit(limitNum)
      .get();

    let posts = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown>);

    // Filter out deleted posts and reply posts (parentId set) — only top-level posts and shares
    posts = posts.filter((p) => !p.deleted && !p.parentId);

    if (viewerUid !== targetUid) {
      const { isFriend } = await getRelationship(viewerUid, targetUid);
      posts = posts.filter((p: Record<string, unknown>) => {
        const privacy = p.privacy ?? 'public';
        if (privacy === 'only-me') return false;
        if (privacy === 'friends') return isFriend;
        return true; // public / custom → ai cũng thấy
      });
    }

    // Sort by createdAt desc (Firestore compound query may change order)
    posts.sort((a, b) => {
      const aTime = (a.createdAt as { _seconds?: number; seconds?: number })?._seconds
        ?? (a.createdAt as { _seconds?: number; seconds?: number })?.seconds ?? 0;
      const bTime = (b.createdAt as { _seconds?: number; seconds?: number })?._seconds
        ?? (b.createdAt as { _seconds?: number; seconds?: number })?.seconds ?? 0;
      return bTime - aTime;
    });

    res.json({ posts });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/users/{uid}/friends:
 *   get:
 *     tags: [Users]
 *     summary: Danh sách bạn bè của user
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: uid
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 */
router.get('/:uid/friends', requireAuth, async (req, res) => {
  try {
    const friendDoc = await getDb().collection('friends').doc(req.params.uid).get();
    const friendIds: string[] = friendDoc.exists ? (friendDoc.data()?.friendIds ?? []) : [];
    if (friendIds.length === 0) {
      res.json({ friends: [] });
      return;
    }
    const usersSnap = await getDb().collection('users').get();
    const usersMap = new Map(usersSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
    const friends = friendIds
      .map((id) => usersMap.get(id))
      .filter(Boolean)
      .map((u) => ({
        id: u!.id,
        displayName: (u as { displayName?: string }).displayName ?? 'User',
        photoURL: (u as { photoURL?: string }).photoURL,
      }));
    res.json({ friends });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/users/{uid}/photos:
 *   get:
 *     tags: [Users]
 *     summary: Ảnh của user
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: uid
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 */
router.get('/:uid/photos', requireAuth, async (req, res) => {
  try {
    const limitNum = Math.min(parseInt(req.query.limit as string) || 100, 500);
    // No orderBy — sort in memory to avoid needing a composite index
    const snap = await getDb()
      .collection('posts')
      .where('authorId', '==', req.params.uid)
      .limit(limitNum)
      .get();
    type Photo = { url: string; postId: string; createdAt: unknown };
    const photos: Photo[] = [];
    snap.docs.forEach((doc) => {
      const data = doc.data();
      if (data.deleted) return;
      if (data.mediaUrls && Array.isArray(data.mediaUrls)) {
        data.mediaUrls.forEach((url: string) => {
          // images only (exclude Cloudinary video uploads and common video extensions)
          const isVideo =
            typeof url === 'string' &&
            (url.includes('/video/upload/') || /\.(mp4|webm|mov|avi|mkv|ogv)(\?|$)/i.test(url));
          if (!isVideo) {
            photos.push({ url, postId: doc.id, createdAt: data.createdAt });
          }
        });
      }
    });
    // Sort newest first in memory
    photos.sort((a, b) => {
      const ts = (c: unknown) => {
        if (!c || typeof c !== 'object') return 0;
        const o = c as { _seconds?: number; seconds?: number };
        return (o._seconds ?? o.seconds ?? 0) * 1000;
      };
      return ts(b.createdAt) - ts(a.createdAt);
    });
    res.json({ photos: photos.slice(0, limitNum) });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/users/{uid}/clips:
 *   get:
 *     tags: [Users]
 *     summary: Video ngắn (Surf Clips) của user
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: uid
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 */
router.get('/:uid/clips', requireAuth, async (req, res) => {
  try {
    const limitNum = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const snap = await getDb()
      .collection('posts')
      .where('authorId', '==', req.params.uid)
      .limit(limitNum)
      .get();
    type Clip = { url: string; postId: string; content: string; createdAt: unknown };
    const clips: Clip[] = [];
    snap.docs.forEach((doc) => {
      const data = doc.data();
      if (data.deleted) return;
      if (data.mediaUrls && Array.isArray(data.mediaUrls)) {
        data.mediaUrls.forEach((url: string) => {
          const isVideo =
            typeof url === 'string' &&
            (url.includes('/video/upload/') || /\.(mp4|webm|mov|avi|mkv|ogv)(\?|$)/i.test(url));
          if (isVideo) {
            clips.push({ url, postId: doc.id, content: data.content ?? '', createdAt: data.createdAt });
          }
        });
      }
    });
    clips.sort((a, b) => {
      const ts = (c: unknown) => {
        if (!c || typeof c !== 'object') return 0;
        const o = c as { _seconds?: number; seconds?: number };
        return (o._seconds ?? o.seconds ?? 0) * 1000;
      };
      return ts(b.createdAt) - ts(a.createdAt);
    });
    res.json({ clips: clips.slice(0, limitNum) });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/users/{uid}:
 *   get:
 *     tags: [Users]
 *     summary: Xem hồ sơ public của user bất kỳ
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: uid
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *       404: { description: User không tồn tại }
 */
router.get('/:uid', requireAuth, async (req, res) => {
  try {
    const doc = await getDb().collection('users').doc(req.params.uid).get();
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
