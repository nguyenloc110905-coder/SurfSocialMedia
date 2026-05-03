import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { getDb } from '../config/firebase-admin.js';
import { getRedis } from '../config/redis.js';

const router = Router();

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const postsRef = getDb().collection('posts');
    const limitNum = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const lastId = req.query.lastId as string | undefined;

    // Lấy danh sách bạn bè + đang theo dõi (sử dụng Redis cache)
    const redis = getRedis();
    let friendIds: string[] = [];
    let followingIds: string[] = [];

    if (redis) {
      const [cachedFriends, cachedFollows] = await Promise.all([
        redis.get(`friends:${uid}`),
        redis.get(`follows:${uid}`)
      ]);
      
      if (cachedFriends) friendIds = JSON.parse(cachedFriends);
      if (cachedFollows) followingIds = JSON.parse(cachedFollows);
      
      if (!cachedFriends || !cachedFollows) {
        const [friendDoc, followDoc] = await Promise.all([
          !cachedFriends ? getDb().collection('friends').doc(uid).get() : Promise.resolve(null),
          !cachedFollows ? getDb().collection('follows').doc(uid).get() : Promise.resolve(null),
        ]);
        
        if (!cachedFriends && friendDoc) {
          friendIds = friendDoc.exists ? (friendDoc.data()?.friendIds ?? []) : [];
          await redis.set(`friends:${uid}`, JSON.stringify(friendIds), { EX: 300 }); // 5 minutes cache
        }
        
        if (!cachedFollows && followDoc) {
          followingIds = followDoc.exists ? (followDoc.data()?.followingIds ?? []) : [];
          await redis.set(`follows:${uid}`, JSON.stringify(followingIds), { EX: 300 }); // 5 minutes cache
        }
      }
    } else {
      const [friendDoc, followDoc] = await Promise.all([
        getDb().collection('friends').doc(uid).get(),
        getDb().collection('follows').doc(uid).get(),
      ]);
      friendIds = friendDoc.exists ? (friendDoc.data()?.friendIds ?? []) : [];
      followingIds = followDoc.exists ? (followDoc.data()?.followingIds ?? []) : [];
    }

    // Tập hợp người quen (bản thân + bạn + đang follow)
    const visibleAuthors = new Set([uid, ...friendIds, ...followingIds]);
    const isNewUser = friendIds.length === 0 && followingIds.length === 0;

    let q = postsRef
      .where('parentId', '==', null)
      .orderBy('createdAt', 'desc')
      .limit(limitNum * 2);

    if (lastId) {
      const lastDoc = await postsRef.doc(lastId).get();
      if (lastDoc.exists) q = q.startAfter(lastDoc);
    }

    const snap = await q.get();

    type PostDoc = {
      id: string;
      authorId: string;
      privacy?: string;
      deleted?: boolean;
      _discover?: boolean;
      deletedAt?: { toMillis?: () => number };
      [key: string]: unknown;
    };

    const allDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PostDoc);

    // Loại bỏ bài đã xóa (đang trong thùng rác)
    const activeDocs = allDocs.filter((p) => p.deleted !== true);

    // ── Feed cá nhân hoá ──────────────────────────────────────────────────
    const personalizedPosts = isNewUser
      ? []
      : activeDocs.filter((p) => {
          const authorId = p.authorId;
          const privacy = p.privacy ?? 'public';
          if (authorId === uid) return true;
          if (!visibleAuthors.has(authorId)) return false;
          if (friendIds.includes(authorId)) return privacy === 'public' || privacy === 'friends';
          return privacy === 'public'; // chỉ follow
        });

    // ── Bổ sung "Khám phá" khi feed cá nhân thiếu ────────────────────────
    const needDiscover = personalizedPosts.length < limitNum;
    let posts = personalizedPosts;

    if (needDiscover) {
      const personalIds = new Set(personalizedPosts.map((p) => p.id));
      const discoverPosts = activeDocs.filter((p) => {
        if (personalIds.has(p.id)) return false; // đã có rồi
        if (p.authorId === uid) return false; // bài của mình
        return (p.privacy ?? 'public') === 'public'; // chỉ lấy public
      });
      // Đánh dấu bài khám phá để client có thể hiện label "Khám phá"
      discoverPosts.forEach((p) => {
        p._discover = true;
      });
      posts = [...personalizedPosts, ...discoverPosts].slice(0, limitNum);
    }

    const hasMore = allDocs.length > limitNum;
    const nextLastId = posts.length ? posts[posts.length - 1].id : null;

    res.json({ posts, hasMore, nextLastId });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
