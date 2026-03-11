import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { getDb } from '../config/firebase-admin.js';

const router = Router();

/**
 * EdgeRank: tính điểm ưu tiên cho bài viết trên feed.
 * Score = tierBonus + affinityScore + recencyScore
 */
function computeEdgeRank(
  post: any,
  uid: string,
  affinityScores: Record<string, number>,
  friendTiers: Record<string, string>,
  friendIds: string[],
  now: number,
): number {
  const authorId = post.authorId as string;
  // Bài của mình luôn hiện bình thường (no boost)
  if (authorId === uid) {
    const ts = post.createdAt?.toMillis?.() ?? post.createdAt?._seconds * 1000 ?? now;
    return ts; // chỉ sort theo thời gian
  }
  let score = 0;
  // Tier bonus: priority = +50000000, restricted = -50000000
  const tier = friendTiers[authorId];
  if (tier === 'priority') score += 50_000_000;
  else if (tier === 'restricted') score -= 50_000_000;
  // Affinity bonus: mỗi điểm tương tác = +1000000
  const affinity = affinityScores[authorId] ?? 0;
  score += affinity * 1_000_000;
  // Recency: timestamp in millis
  const ts = post.createdAt?.toMillis?.() ?? post.createdAt?._seconds * 1000 ?? now;
  score += ts;
  return score;
}

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const postsRef = getDb().collection('posts');
    const limitNum = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const lastId = req.query.lastId as string | undefined;

    // Lấy danh sách bạn bè + đang theo dõi + affinity scores + friend tiers
    const [friendDoc, followDoc, affinityDoc, tierDoc] = await Promise.all([
      getDb().collection('friends').doc(uid).get(),
      getDb().collection('follows').doc(uid).get(),
      getDb().collection('affinity').doc(uid).get(),
      getDb().collection('friend_tiers').doc(uid).get(),
    ]);
    const friendIds: string[] = friendDoc.exists ? (friendDoc.data()?.friendIds ?? []) : [];
    const followingIds: string[] = followDoc.exists ? (followDoc.data()?.followingIds ?? []) : [];
    const affinityScores: Record<string, number> = affinityDoc.exists ? (affinityDoc.data()?.scores ?? {}) : {};
    const friendTiers: Record<string, string> = tierDoc.exists ? (tierDoc.data()?.tiers ?? {}) : {};

    // Tập hợp người quen (bản thân + bạn + đang follow)
    const visibleAuthors = new Set([uid, ...friendIds, ...followingIds]);
    const isNewUser = friendIds.length === 0 && followingIds.length === 0;

    let q = postsRef
      .where('parentId', '==', null)
      .orderBy('createdAt', 'desc')
      .limit(limitNum * 4);

    if (lastId) {
      const lastDoc = await postsRef.doc(lastId).get();
      if (lastDoc.exists) q = q.startAfter(lastDoc);
    }

    const snap = await q.get();
    const allDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

    // ── Feed cá nhân hoá ──────────────────────────────────────────────────
    const personalizedPosts = isNewUser ? [] : allDocs.filter((p: any) => {
      const authorId = p.authorId as string;
      const privacy = p.privacy ?? 'public';
      if (authorId === uid) return true;
      if (!visibleAuthors.has(authorId)) return false;
      // Restricted friends: chỉ hiện bài public
      if (friendTiers[authorId] === 'restricted') return privacy === 'public';
      if (friendIds.includes(authorId)) return privacy === 'public' || privacy === 'friends';
      return privacy === 'public'; // chỉ follow
    });

    // ── EdgeRank sorting ─────────────────────────────────────────────────
    // Score = tierBonus + affinityScore + recencyScore
    const now = Date.now();
    personalizedPosts.sort((a: any, b: any) => {
      const scoreA = computeEdgeRank(a, uid, affinityScores, friendTiers, friendIds, now);
      const scoreB = computeEdgeRank(b, uid, affinityScores, friendTiers, friendIds, now);
      return scoreB - scoreA;
    });

    // ── Bổ sung "Khám phá" khi feed cá nhân thiếu ────────────────────────
    const needDiscover = personalizedPosts.length < limitNum;
    let posts = personalizedPosts;

    if (needDiscover) {
      const personalIds = new Set(personalizedPosts.map((p: any) => p.id));
      const discoverPosts = allDocs.filter((p: any) => {
        if (personalIds.has(p.id)) return false;           // đã có rồi
        if (p.authorId === uid) return false;               // bài của mình
        return (p.privacy ?? 'public') === 'public';        // chỉ lấy public
      });
      // Đánh dấu bài khám phá để client có thể hiện label "Khám phá"
      discoverPosts.forEach((p: any) => { p._discover = true; });
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

