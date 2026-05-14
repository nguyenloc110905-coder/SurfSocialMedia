import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { getDb } from '../config/firebase-admin.js';
import { getRedis } from '../config/redis.js';

const router = Router();

/**
 * @swagger
 * /api/feed:
 *   get:
 *     tags: [Feed]
 *     summary: Bảng tin cá nhân hóa (bạn bè + follow + nhóm, bổ sung Khám phá khi thiếu)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 50 }
 *       - in: query
 *         name: lastId
 *         schema: { type: string }
 *         description: ID của bài cuối cùng (cursor phân trang)
 *     responses:
 *       200:
 *         description: Danh sách bài viết
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 posts:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Post' }
 *                 hasMore: { type: boolean }
 *                 nextLastId: { type: string, nullable: true }
 */
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const postsRef = getDb().collection('posts');
    const limitNum = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const lastId = req.query.lastId as string | undefined;

    // Lấy danh sách bạn bè + đang theo dõi (sử dụng Redis cache) + nhóm đã tham gia
    const redis = getRedis();
    let friendIds: string[] = [];
    let followingIds: string[] = [];
    let groupsSnap: any;

    if (redis) {
      const [cachedFriends, cachedFollows, gSnap] = await Promise.all([
        redis.get(`friends:${uid}`),
        redis.get(`follows:${uid}`),
        getDb().collection('groups').where('memberIds', 'array-contains', uid).get()
      ]);
      groupsSnap = gSnap;
      
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
      const [friendDoc, followDoc, gSnap] = await Promise.all([
        getDb().collection('friends').doc(uid).get(),
        getDb().collection('follows').doc(uid).get(),
        getDb().collection('groups').where('memberIds', 'array-contains', uid).get(),
      ]);
      friendIds = friendDoc.exists ? (friendDoc.data()?.friendIds ?? []) : [];
      followingIds = followDoc.exists ? (followDoc.data()?.followingIds ?? []) : [];
      groupsSnap = gSnap;
    }

    const joinedGroupIds = new Set(groupsSnap.docs.map((d: any) => d.id));
    const groupDetails = new Map(groupsSnap.docs.map((d: any) => [d.id, { name: d.data().name, coverImageUrl: d.data().coverImageUrl }]));

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
      authorDisplayName?: string;
      authorPhotoURL?: string | null;
      privacy?: string;
      deleted?: boolean;
      _discover?: boolean;
      deletedAt?: { toMillis?: () => number };
      groupId?: string;
      isAnonymous?: boolean;
      group?: any;
      [key: string]: unknown;
    };

    const allDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PostDoc);

    // Loại bỏ bài đã xóa hoặc bài trong nhóm mà chưa tham gia
    const activeDocs = allDocs.filter((p) => {
      if (p.deleted === true) return false;
      if (p.groupId && !joinedGroupIds.has(p.groupId)) return false;
      return true;
    });

    // Load author privacy settings for visible posts
    const authorIds = Array.from(
      new Set(activeDocs.map((p) => p.authorId).filter((id) => id && id !== uid))
    );
    const authorRefs = authorIds.map((id) => getDb().collection('users').doc(id));
    const authorDocs = authorRefs.length > 0 ? await getDb().getAll(...authorRefs) : [];
    const authorPrivacyMap = new Map(
      authorDocs
        .filter((doc) => doc.exists)
        .map((doc) => [doc.id, doc.data()?.privacySettings?.posts ?? 'public'] as [string, string])
    );

    // ── Feed cá nhân hoá ──────────────────────────────────────────────────
    const personalizedPosts = isNewUser
      ? []
      : activeDocs.filter((p) => {
          const authorId = p.authorId;
          const privacy = p.privacy ?? 'public';
          if (authorId === uid) return true;
          const authorPostsSetting = authorPrivacyMap.get(authorId) ?? 'public';
          const isFriendAuthor = friendIds.includes(authorId);
          if (!visibleAuthors.has(authorId)) return false;
          if (authorPostsSetting === 'only-me') return false;
          if (authorPostsSetting === 'friends' && !isFriendAuthor) return false;
          if (isFriendAuthor) return privacy === 'public' || privacy === 'friends';
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
        const authorPostsSetting = authorPrivacyMap.get(p.authorId) ?? 'public';
        if (authorPostsSetting === 'only-me') return false;
        const isFriendAuthor = friendIds.includes(p.authorId);
        if (authorPostsSetting === 'friends' && !isFriendAuthor) return false;
        return (p.privacy ?? 'public') === 'public'; // chỉ lấy public
      });
      // Đánh dấu bài khám phá để client có thể hiện label "Khám phá"
      discoverPosts.forEach((p) => {
        p._discover = true;
      });
      posts = [...personalizedPosts, ...discoverPosts].slice(0, limitNum);
    }

    posts = posts.map(p => {
      const modified = { ...p };
      if (modified.isAnonymous && modified.authorId !== uid) {
        modified.authorId = `anon_${modified.id}`;
        modified.authorDisplayName = 'Thành viên ẩn danh';
        modified.authorPhotoURL = null;
      }
      if (modified.groupId && groupDetails.has(modified.groupId)) {
        modified.group = {
          id: modified.groupId,
          ...(groupDetails.get(modified.groupId) || {})
        };
      }
      return modified;
    });

    const hasMore = allDocs.length > limitNum;
    const nextLastId = posts.length ? posts[posts.length - 1].id : null;

    res.json({ posts, hasMore, nextLastId });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
