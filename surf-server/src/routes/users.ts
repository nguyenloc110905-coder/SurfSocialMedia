import { Router } from 'express';
import { requireAuth, AuthRequest, requireNoBlock } from '../middleware/auth.js';
import { getDb } from '../config/firebase-admin.js';
import { FieldValue } from 'firebase-admin/firestore';
import {
  DEFAULT_NOTIFICATION_PREFS,
  NOTIFICATION_PREF_KEYS,
  normalizeNotificationPrefs,
  type NotificationType,
} from '../types/notification.js';
import {
  DEFAULT_FRIEND_REQUEST_PRIVACY,
  FRIEND_REQUEST_PRIVACY_OPTIONS,
  isFriendRequestPrivacy,
  normalizeFriendRequestPrivacy,
} from '../types/privacy.js';

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
    friendIds,
  };
}

function canViewByPrivacySetting(
  viewerUid: string,
  targetUid: string,
  setting?: string,
  isFriend = false
) {
  if (viewerUid === targetUid) return true;
  if (!setting || setting === 'public') return true;
  if (setting === 'friends') return isFriend;
  return false; // only-me or unknown values
}

function sanitizePrivacySettings(value: unknown) {
  if (typeof value !== 'object' || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  const allowedValues = new Set(['public', 'friends', 'only-me']);
  const output: Record<string, string> = {};
  for (const key of ['posts', 'friends', 'photos'] as const) {
    const candidate = raw[key];
    if (typeof candidate === 'string' && allowedValues.has(candidate)) {
      output[key] = candidate;
    }
  }
  return Object.keys(output).length ? output : undefined;
}

async function getUserPrivacySettings(uid: string) {
  const userDoc = await getDb().collection('users').doc(uid).get();
  return userDoc.exists ? (userDoc.data()?.privacySettings ?? {}) : {};
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
const ALLOWED_DEFAULT_POST_PRIVACY = ['public', 'friends', 'only-me', 'custom'] as const;
type DefaultPostPrivacy = (typeof ALLOWED_DEFAULT_POST_PRIVACY)[number];

function isDefaultPostPrivacy(value: unknown): value is DefaultPostPrivacy {
  return (
    typeof value === 'string' && ALLOWED_DEFAULT_POST_PRIVACY.includes(value as DefaultPostPrivacy)
  );
}

type NotificationPrefsPatch = Partial<Record<NotificationType, boolean>>;

function parseNotificationPrefsPatch(value: unknown): NotificationPrefsPatch | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const raw = value as Record<string, unknown>;
  const allowed = new Set<string>(NOTIFICATION_PREF_KEYS);
  const patch: NotificationPrefsPatch = {};

  for (const [key, prefValue] of Object.entries(raw)) {
    if (!allowed.has(key)) return null;
    if (typeof prefValue !== 'boolean') return null;
    patch[key as NotificationType] = prefValue;
  }

  return patch;
}

/** GET /api/users/search?q=... */
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
      getDb().collection('users').limit(300).get(),
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

    const data = doc.data() ?? {};
    res.json({
      id: doc.id,
      ...data,
      notificationPrefs: normalizeNotificationPrefs(data.notificationPrefs),
      friendRequestPrivacy: normalizeFriendRequestPrivacy(data.friendRequestPrivacy),
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/users/me/reports:
 *   get:
 *     tags: [Users]
 *     summary: Lấy danh sách báo cáo của bản thân
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Danh sách báo cáo }
 */
router.get('/me/reports', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    
    // Báo cáo bài viết (dùng reporterId)
    const postReportsSnap = await db.collection('reports')
      .where('reporterId', '==', req.uid!)
      .get();
      
    // Báo cáo bình luận (dùng reportedBy)
    const commentReportsSnap = await db.collection('reports')
      .where('reportedBy', '==', req.uid!)
      .get();
    
    const allDocs = [...postReportsSnap.docs, ...commentReportsSnap.docs];
    
    const reports = allDocs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        resolvedAt: data.resolvedAt?.toDate?.()?.toISOString()
      };
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({ reports });
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
    const {
      displayName,
      bio,
      photoURL,
      coverImageUrl,
      currentCity,
      hometown,
      birthday,
      relationship,
      email,
      defaultPostPrivacy,
      notificationPrefs,
      friendRequestPrivacy,
      privacySettings,
      work,
      education,
      gender,
      customGender,
      website,
      phone,
    } = req.body as {
      displayName?: unknown;
      bio?: unknown;
      photoURL?: unknown;
      coverImageUrl?: unknown;
      currentCity?: unknown;
      hometown?: unknown;
      birthday?: unknown;
      relationship?: unknown;
      email?: unknown;
      defaultPostPrivacy?: unknown;
      notificationPrefs?: unknown;
      friendRequestPrivacy?: unknown;
      privacySettings?: unknown;
      work?: unknown;
      education?: unknown;
      gender?: unknown;
      customGender?: unknown;
      website?: unknown;
      phone?: unknown;
    };

    if (defaultPostPrivacy !== undefined && !isDefaultPostPrivacy(defaultPostPrivacy)) {
      res.status(400).json({
        error: `defaultPostPrivacy must be one of: ${ALLOWED_DEFAULT_POST_PRIVACY.join(', ')}`,
      });
      return;
    }

    const notificationPrefsPatch =
      notificationPrefs === undefined ? undefined : parseNotificationPrefsPatch(notificationPrefs);

    if (notificationPrefsPatch === null) {
      res.status(400).json({
        error: 'notificationPrefs must be an object of boolean flags keyed by notification types',
      });
      return;
    }

    if (friendRequestPrivacy !== undefined && !isFriendRequestPrivacy(friendRequestPrivacy)) {
      res.status(400).json({
        error: `friendRequestPrivacy must be one of: ${FRIEND_REQUEST_PRIVACY_OPTIONS.join(', ')}`,
      });
      return;
    }

    const ref = getDb().collection('users').doc(req.uid!);
    const doc = await ref.get();
    const existing = (doc.data() ?? {}) as Record<string, unknown>;
    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (displayName !== undefined) data.displayName = displayName;
    if (bio !== undefined) data.bio = bio;
    if (photoURL !== undefined) data.photoURL = photoURL;
    if (coverImageUrl !== undefined) data.coverImageUrl = coverImageUrl;
    if (currentCity !== undefined) data.currentCity = currentCity;
    if (hometown !== undefined) data.hometown = hometown;
    if (birthday !== undefined) data.birthday = birthday;
    if (relationship !== undefined) data.relationship = relationship;
    if (defaultPostPrivacy !== undefined) data.defaultPostPrivacy = defaultPostPrivacy;
    if (friendRequestPrivacy !== undefined) data.friendRequestPrivacy = friendRequestPrivacy;
    if (work !== undefined) data.work = work;
    if (education !== undefined) data.education = education;
    if (gender !== undefined) data.gender = gender;
    if (customGender !== undefined) data.customGender = customGender;
    if (website !== undefined) data.website = website;
    if (phone !== undefined) data.phone = phone;
    if (coverImageUrl !== undefined) data.coverImageUrl = coverImageUrl;
    if (notificationPrefsPatch !== undefined) {
      const currentPrefs = normalizeNotificationPrefs(existing.notificationPrefs);
      data.notificationPrefs = {
        ...currentPrefs,
        ...notificationPrefsPatch,
      };
    }
    const sanitizedPrivacySettings = sanitizePrivacySettings(privacySettings);
    if (sanitizedPrivacySettings !== undefined) {
      data.privacySettings = sanitizedPrivacySettings;
    }

    if (!doc.exists) {
      data.uid = req.uid;
      data.email = email ?? '';
      data.defaultPostPrivacy = isDefaultPostPrivacy(defaultPostPrivacy)
        ? defaultPostPrivacy
        : 'public';
      data.friendRequestPrivacy = isFriendRequestPrivacy(friendRequestPrivacy)
        ? friendRequestPrivacy
        : DEFAULT_FRIEND_REQUEST_PRIVACY;
      data.notificationPrefs = data.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS;
      data.createdAt = new Date();
      await ref.set(data);
    } else {
      await ref.update(data);
    }
    const updated = await ref.get();
    const updatedData = updated.data() ?? {};

    // --- Fan-out profile update (Chạy ngầm để cập nhật ảnh/tên cũ trên các bài viết) ---
    if (displayName !== undefined || photoURL !== undefined) {
      setImmediate(async () => {
        try {
          const db = getDb();
          const updateObj: Record<string, any> = {};
          if (displayName !== undefined) updateObj.authorDisplayName = displayName;
          if (photoURL !== undefined) updateObj.authorPhotoURL = photoURL;

          const updateDocs = async (collectionName: string) => {
             const snap = await db.collection(collectionName).where('authorId', '==', req.uid).get();
             let count = 0;
             const promises = [];
             for (const d of snap.docs) {
               promises.push(d.ref.update(updateObj));
               count++;
               if (promises.length >= 100) {
                 await Promise.all(promises);
                 promises.length = 0;
               }
             }
             if (promises.length > 0) await Promise.all(promises);
             return count;
          };

          const pCount = await updateDocs('posts');
          const cCount = await updateDocs('comments');
          const vCount = await updateDocs('videos');
          console.log(`[ProfileSync] Updated profile for user ${req.uid} in ${pCount} posts, ${cCount} comments, ${vCount} videos.`);
        } catch (err) {
          console.error('[ProfileSync] Failed to sync profile updates:', err);
        }
      });
    }
    // --- End Fan-out ---

    res.json({
      id: updated.id,
      ...updatedData,
      notificationPrefs: normalizeNotificationPrefs(updatedData.notificationPrefs),
      friendRequestPrivacy: normalizeFriendRequestPrivacy(updatedData.friendRequestPrivacy),
    });
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

/** POST /api/users/find-by-phones */
router.post('/find-by-phones', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const { phones } = req.body as { phones?: unknown };
    if (!Array.isArray(phones)) {
      res.status(400).json({ error: 'phones must be an array' });
      return;
    }

    const normalized = (phones as unknown[])
      .filter((p): p is string => typeof p === 'string')
      .map((p) => p.replace(/\D/g, ''))
      .filter((p) => p.length >= 7 && p.length <= 15)
      .flatMap((p) => {
        const variants: string[] = [p];
        if (p.startsWith('0') && p.length === 10) variants.push('84' + p.slice(1));
        if (p.startsWith('84') && p.length === 11) variants.push('0' + p.slice(2));
        return variants;
      });

    const unique = [...new Set(normalized)];
    if (unique.length === 0) {
      res.json({ users: [] });
      return;
    }

    const db = getDb();
    const friendSnap = await db
      .collection('friends')
      .where('userId', '==', uid)
      .get();
    const friendIds = new Set(friendSnap.docs.map((d) => d.data().friendId as string));

    const seen = new Set<string>();
    const users: { id: string; name: string; avatarUrl: string | null }[] = [];

    const CHUNK = 10;
    for (let i = 0; i < unique.length; i += CHUNK) {
      const chunk = unique.slice(i, i + CHUNK);
      const snap = await db.collection('users').where('phone', 'in', chunk).get();
      snap.docs.forEach((doc) => {
        if (doc.id === uid || friendIds.has(doc.id) || seen.has(doc.id)) return;
        seen.add(doc.id);
        const data = doc.data();
        users.push({
          id: doc.id,
          name: (data.displayName as string) || (data.name as string) || 'Người dùng',
          avatarUrl: (data.photoURL as string) || null,
        });
      });
    }

    res.json({ users });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** PUT /api/users/me/fcm-token */
router.put('/me/fcm-token', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { fcmToken } = req.body as { fcmToken?: string };
    if (!fcmToken || typeof fcmToken !== 'string') {
      res.status(400).json({ error: 'fcmToken is required and must be a string' });
      return;
    }
    await getDb()
      .collection('users')
      .doc(req.uid!)
      .set({ 
        fcmTokens: FieldValue.arrayUnion(fcmToken),
        updatedAt: new Date()
      }, { merge: true });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** DELETE /api/users/me/fcm-token */
router.delete('/me/fcm-token', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { fcmToken } = req.body as { fcmToken?: string };
    if (!fcmToken || typeof fcmToken !== 'string') {
      res.status(400).json({ error: 'fcmToken is required and must be a string' });
      return;
    }
    await getDb()
      .collection('users')
      .doc(req.uid!)
      .set({ 
        fcmTokens: FieldValue.arrayRemove(fcmToken),
        updatedAt: new Date()
      }, { merge: true });
    res.json({ success: true });
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

    const userDoc = await getDb().collection('users').doc(targetUid).get();
    const targetPrivacySettings = userDoc.exists ? userDoc.data()?.privacySettings : {};
    const ownerPostsSetting = targetPrivacySettings?.posts ?? 'public';

    if (viewerUid !== targetUid) {
      const { isFriend } = await getRelationship(viewerUid, targetUid);
      if (!canViewByPrivacySetting(viewerUid, targetUid, ownerPostsSetting, isFriend)) {
        posts = [];
      } else {
        posts = posts.filter((p: Record<string, unknown>) => {
          const privacy = p.privacy ?? 'public';
          if (privacy === 'only-me') return false;
          if (privacy === 'friends') return isFriend;
          return true; // public / custom → ai cũng thấy
        });
      }
    }

    // Sort: pinned post first, then by createdAt desc
    posts.sort((a, b) => {
      const aPinned = !!(a as Record<string, unknown>).pinnedAt;
      const bPinned = !!(b as Record<string, unknown>).pinnedAt;
      if (aPinned !== bPinned) return aPinned ? -1 : 1;
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
router.get('/:uid/friends', requireAuth, async (req: AuthRequest, res) => {
  try {
    const friendDoc = await getDb().collection('friends').doc(req.params.uid).get();
    const friendIds: string[] = friendDoc.exists ? (friendDoc.data()?.friendIds ?? []) : [];

    const targetUid = req.params.uid;
    const { isFriend, friendIds: viewerFriendIds } = await getRelationship(req.uid!, targetUid);
    const targetDoc = await getDb().collection('users').doc(targetUid).get();
    const targetPrivacySettings = targetDoc.exists ? targetDoc.data()?.privacySettings : {};
    const friendsSetting = targetPrivacySettings?.friends ?? 'public';
    if (!canViewByPrivacySetting(req.uid!, targetUid, friendsSetting, isFriend)) {
      res.json({ friends: [] });
      return;
    }

    if (friendIds.length === 0) {
      res.json({ friends: [] });
      return;
    }
    const friendDocs = friendIds.length > 0
      ? await getDb().getAll(...friendIds.map((id) => getDb().collection('users').doc(id)))
      : [];
    const friends = friendDocs
      .filter((d) => d.exists)
      .map((d) => ({
        id: d.id,
        displayName: (d.data() as { displayName?: string }).displayName ?? 'User',
        photoURL: (d.data() as { photoURL?: string }).photoURL,
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
router.get('/:uid/photos', requireAuth, async (req: AuthRequest, res) => {
  try {
    const limitNum = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const targetUid = req.params.uid;
    const { isFriend } = await getRelationship(req.uid!, targetUid);
    const targetDoc = await getDb().collection('users').doc(targetUid).get();
    const targetPrivacySettings = targetDoc.exists ? targetDoc.data()?.privacySettings : {};
    const photosSetting = targetPrivacySettings?.photos ?? 'public';
    if (!canViewByPrivacySetting(req.uid!, targetUid, photosSetting, isFriend)) {
      res.json({ photos: [] });
      return;
    }

    // No orderBy — sort in memory to avoid needing a composite index
    const snap = await getDb()
      .collection('posts')
      .where('authorId', '==', targetUid)
      .limit(limitNum)
      .get();
    type Photo = { url: string; postId: string; createdAt: unknown };
    const photos: Photo[] = [];
    snap.docs.forEach((doc) => {
      const data = doc.data();
      if (data.deleted) return;
      const privacy = data.privacy ?? 'public';
      if (privacy === 'only-me') return;
      if (privacy === 'friends' && !isFriend && req.uid !== targetUid) return;
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
router.get('/:uid/clips', requireAuth, async (req: AuthRequest, res) => {
  try {
    const limitNum = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const targetUid = req.params.uid;
    const { isFriend } = await getRelationship(req.uid!, targetUid);
    const targetDoc = await getDb().collection('users').doc(targetUid).get();
    const targetPrivacySettings = targetDoc.exists ? targetDoc.data()?.privacySettings : {};
    const ownerPostsSetting = targetPrivacySettings?.posts ?? 'public';
    if (!canViewByPrivacySetting(req.uid!, targetUid, ownerPostsSetting, isFriend)) {
      res.json({ clips: [] });
      return;
    }

    const snap = await getDb()
      .collection('posts')
      .where('authorId', '==', targetUid)
      .limit(limitNum)
      .get();
    type Clip = { url: string; postId: string; content: string; createdAt: unknown };
    const clips: Clip[] = [];
    snap.docs.forEach((doc) => {
      const data = doc.data();
      if (data.deleted) return;
      const privacy = data.privacy ?? 'public';
      if (privacy === 'only-me') return;
      if (privacy === 'friends' && !isFriend && req.uid !== targetUid) return;
      if (data.mediaUrls && Array.isArray(data.mediaUrls)) {
        data.mediaUrls.forEach((url: string) => {
          const isVideo =
            typeof url === 'string' &&
            (url.includes('/video/upload/') || /\.(mp4|webm|mov|avi|mkv|ogv)(\?|$)/i.test(url));
          if (isVideo) {
            clips.push({
              url,
              postId: doc.id,
              content: data.content ?? '',
              createdAt: data.createdAt,
            });
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
