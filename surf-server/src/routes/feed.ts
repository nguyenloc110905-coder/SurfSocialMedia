import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { getDb } from '../config/firebase-admin.js';
import { getRedis } from '../config/redis.js';
import type { DocumentData, QuerySnapshot } from 'firebase-admin/firestore';

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
    let groupsSnap: QuerySnapshot<DocumentData>;

    if (redis) {
      const [cachedFriends, cachedFollows, gSnap] = await Promise.all([
        redis.get(`friends:${uid}`),
        redis.get(`follows:${uid}`),
        getDb().collection('groups').where('memberIds', 'array-contains', uid).get(),
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

    const joinedGroupIds = new Set(groupsSnap.docs.map((d) => d.id));
    const groupDetails = new Map(
      groupsSnap.docs.map((d) => {
        const data = d.data() as { name?: string; coverImageUrl?: string | null };
        return [d.id, { name: data.name ?? 'Nhóm', coverImageUrl: data.coverImageUrl ?? null }] as const;
      })
    );

    // Tập hợp người quen (bản thân + bạn + đang follow)
    const visibleAuthors = new Set([uid, ...friendIds, ...followingIds]);
    const isNewUser = friendIds.length === 0 && followingIds.length === 0;

    // Tăng limit để lấy pool đủ lớn cho thuật toán ranking
    let q = postsRef
      .where('parentId', '==', null)
      .orderBy('createdAt', 'desc')
      .limit(200);

    const snap = await q.get();

    // Lấy danh sách bài đã đọc từ Redis để giảm điểm (ít xuất hiện lại)
    let seenPosts = new Set<string>();
    if (redis) {
      const seenStr = await redis.get(`seen_posts:${uid}`);
      if (seenStr) {
        try {
          seenPosts = new Set(JSON.parse(seenStr));
        } catch {}
      }
    }

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
      archived?: boolean;
    };

    const allDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PostDoc);

    // Loại bỏ bài đã xóa hoặc bài trong nhóm mà chưa tham gia
    const activeDocs = allDocs.filter((p) => {
      if (p.deleted === true) return false;
      if (p.archived === true) return false;
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
          if (privacy === 'custom') {
            const allowed = Array.isArray(p.allowedUserIds) ? p.allowedUserIds : [];
            return allowed.includes(uid);
          }
          if (isFriendAuthor) return privacy === 'public' || privacy === 'friends';
          return privacy === 'public'; // chỉ follow
        });

    // ── Gộp và Ranking Bài viết ──────────────────────────────────────────
    const personalIds = new Set(personalizedPosts.map((p) => p.id));
    const discoverPosts = activeDocs.filter((p) => {
      if (personalIds.has(p.id)) return false; // đã có rồi
      if (p.authorId === uid) return false; // bài của mình
      const authorPostsSetting = authorPrivacyMap.get(p.authorId) ?? 'public';
      if (authorPostsSetting === 'only-me') return false;
      const isFriendAuthor = friendIds.includes(p.authorId);
      if (authorPostsSetting === 'friends' && !isFriendAuthor) return false;
      const privacy = p.privacy ?? 'public';
      if (privacy === 'custom') {
        const allowed = Array.isArray(p.allowedUserIds) ? p.allowedUserIds : [];
        return allowed.includes(uid);
      }
      return privacy === 'public'; // chỉ lấy public
    });
    // Đánh dấu bài khám phá để client có thể hiện label "Khám phá"
    discoverPosts.forEach((p) => {
      p._discover = true;
    });

    let posts = [...personalizedPosts, ...discoverPosts];
    
    type FsTs = { toMillis?: () => number, _seconds?: number, seconds?: number };
    const toMs = (val: unknown): number => {
      if (!val) return Date.now();
      if (typeof (val as FsTs).toMillis === 'function') return (val as FsTs).toMillis!();
      if ((val as FsTs)._seconds) return (val as FsTs)._seconds! * 1000;
      if ((val as FsTs).seconds) return (val as FsTs).seconds! * 1000;
      if (val instanceof Date) return val.getTime();
      if (typeof val === 'string' || typeof val === 'number') return new Date(val).getTime();
      return Date.now();
    };

    // Tính điểm (Scoring) cho từng bài
    posts = posts.map(p => {
      const likes = (p.likeCount as number) || 0;
      const replies = (p.replyCount as number) || 0;
      const ageHours = (Date.now() - toMs(p.createdAt)) / (1000 * 60 * 60);
      
      let score = (likes * 2) + (replies * 3) + 100 - (ageHours * 1.5);
      
      // Ưu tiên bài cá nhân hóa (bạn bè, follow) hơn khám phá
      if (!p._discover) score += 20;
      if (p.authorId === uid) score += 1500;
      
      // Phạt nặng nếu đã đọc rồi (để rơi xuống đáy)
      if (p.authorId !== uid && seenPosts.has(p.id)) score -= 1000;

      // Yếu tố ngẫu nhiên nhỏ để làm mới feed
      score += Math.random() * 5;

      return { ...p, _score: score };
    });

    // Sắp xếp theo điểm giảm dần
    posts.sort((a, b) => (b._score as number) - (a._score as number));

    // Pagination dựa trên vị trí của lastId trong mảng đã sort
    let startIndex = 0;
    if (lastId) {
      const idx = posts.findIndex(p => p.id === lastId);
      if (idx !== -1) startIndex = idx + 1;
    }
    
    const hasMore = startIndex + limitNum < posts.length;
    posts = posts.slice(startIndex, startIndex + limitNum);

    // Lưu các bài đã trả về vào danh sách seen trong Redis
    if (redis && posts.length > 0) {
      posts.forEach(p => seenPosts.add(p.id));
      const seenArr = Array.from(seenPosts).slice(-1000); // Giữ tối đa 1000 bài gần nhất
      redis.set(`seen_posts:${uid}`, JSON.stringify(seenArr), { EX: 86400 * 3 }).catch(() => {});
    }

    posts = posts.map((p) => {
      const modified = { ...p };
      if (modified.isAnonymous && modified.authorId !== uid) {
        modified.authorId = `anon_${modified.id}`;
        modified.authorDisplayName = 'Thành viên ẩn danh';
        modified.authorPhotoURL = null;
      }
      const groupDetail = modified.groupId ? groupDetails.get(modified.groupId) : null;
      if (modified.groupId && groupDetail) {
        modified.group = {
          id: modified.groupId,
          ...groupDetail,
        };
      }
      return modified;
    });

    const nextLastId = posts.length ? posts[posts.length - 1].id : null;

    res.json({ posts, hasMore, nextLastId });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
