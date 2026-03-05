import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { getDb } from '../config/firebase-admin.js';
import { FieldValue } from 'firebase-admin/firestore';

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

/** GET /api/users/search?q=... */
router.get('/search', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) { res.json({ users: [] }); return; }
    const snap = await getDb().collection('users').get();
    const lower = q.toLowerCase();
    type UserDoc = { id: string; displayName?: string; photoURL?: string };
    const users = snap.docs
      .filter((d) => d.id !== uid)
      .map((d) => ({ id: d.id, ...d.data() } as UserDoc))
      .filter((u) => (u.displayName ?? '').toLowerCase().includes(lower))
      .slice(0, 20)
      .map((u) => ({ id: u.id, name: u.displayName ?? 'Unknown', avatarUrl: u.photoURL }));
    res.json({ users });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

/** GET /api/users/me */
router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const doc = await getDb().collection('users').doc(req.uid!).get();
    if (!doc.exists) { res.status(404).json({ error: 'Profile not found' }); return; }
    res.json({ id: doc.id, ...doc.data() });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

/** PUT /api/users/me */
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
      data.uid = req.uid; data.email = email ?? ''; data.createdAt = new Date();
      await ref.set(data);
    } else { await ref.update(data); }
    const updated = await ref.get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// ─── Follow routes ───────────────────────────────────────────────────────────

/** GET /api/users/:uid/follow-status */
router.get('/:uid/follow-status', requireAuth, async (req: AuthRequest, res) => {
  try {
    const viewerUid = req.uid!;
    const targetUid = req.params.uid;
    if (viewerUid === targetUid) { res.json({ isFollowing: false, isSelf: true }); return; }
    const { isFriend, isFollowing } = await getRelationship(viewerUid, targetUid);
    // Đếm followers của target
    const followersSnap = await getDb().collection('follows')
      .where('followingIds', 'array-contains', targetUid).get();
    // Đếm following của target
    const targetFollowDoc = await getDb().collection('follows').doc(targetUid).get();
    const followingCount: number = targetFollowDoc.exists
      ? (targetFollowDoc.data()?.followingIds ?? []).length : 0;
    res.json({ isFollowing, isFriend, followerCount: followersSnap.size, followingCount });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

/** POST /api/users/:uid/follow */
router.post('/:uid/follow', requireAuth, async (req: AuthRequest, res) => {
  try {
    const viewerUid = req.uid!;
    const targetUid = req.params.uid;
    if (viewerUid === targetUid) { res.status(400).json({ error: 'Cannot follow yourself' }); return; }
    await getDb().collection('follows').doc(viewerUid)
      .set({ followingIds: FieldValue.arrayUnion(targetUid) }, { merge: true });
    res.json({ success: true, isFollowing: true });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

/** POST /api/users/:uid/unfollow */
router.post('/:uid/unfollow', requireAuth, async (req: AuthRequest, res) => {
  try {
    const viewerUid = req.uid!;
    const targetUid = req.params.uid;
    await getDb().collection('follows').doc(viewerUid)
      .set({ followingIds: FieldValue.arrayRemove(targetUid) }, { merge: true });
    res.json({ success: true, isFollowing: false });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

// ─── Sub-collection routes (phải đặt trước /:uid GET) ──────────────────────

/** GET /api/users/:uid/posts — lọc theo mối quan hệ */
router.get('/:uid/posts', requireAuth, async (req: AuthRequest, res) => {
  try {
    const viewerUid = req.uid!;
    const targetUid = req.params.uid;
    const limitNum = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const snap = await getDb().collection('posts')
      .where('authorId', '==', targetUid)
      .where('parentId', '==', null)
      .orderBy('createdAt', 'desc')
      .limit(limitNum)
      .get();

    let posts = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

    if (viewerUid !== targetUid) {
      const { isFriend } = await getRelationship(viewerUid, targetUid);
      posts = posts.filter((p: any) => {
        const privacy = p.privacy ?? 'public';
        if (privacy === 'only-me') return false;
        if (privacy === 'friends') return isFriend;
        return true; // public / custom → ai cũng thấy
      });
    }

    res.json({ posts });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

/** GET /api/users/:uid/friends */
router.get('/:uid/friends', requireAuth, async (req, res) => {
  try {
    const friendDoc = await getDb().collection('friends').doc(req.params.uid).get();
    const friendIds: string[] = friendDoc.exists ? (friendDoc.data()?.friendIds ?? []) : [];
    if (friendIds.length === 0) { res.json({ friends: [] }); return; }
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
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

/** GET /api/users/:uid/photos */
router.get('/:uid/photos', requireAuth, async (req, res) => {
  try {
    const limitNum = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const snap = await getDb().collection('posts')
      .where('authorId', '==', req.params.uid)
      .orderBy('createdAt', 'desc')
      .limit(limitNum)
      .get();
    const photos: Array<{ url: string; postId: string; createdAt: any }> = [];
    snap.docs.forEach((doc) => {
      const data = doc.data();
      if (data.mediaUrls && Array.isArray(data.mediaUrls)) {
        data.mediaUrls.forEach((url: string) => {
          photos.push({ url, postId: doc.id, createdAt: data.createdAt });
        });
      }
    });
    res.json({ photos });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

/** GET /api/users/:uid — profile bất kỳ (phải đặt SAU tất cả sub-routes) */
router.get('/:uid', requireAuth, async (req, res) => {
  try {
    const doc = await getDb().collection('users').doc(req.params.uid).get();
    if (!doc.exists) { res.status(404).json({ error: 'User not found' }); return; }
    res.json({ id: doc.id, ...doc.data() });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

export default router;

