import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { getDb } from '../config/firebase-admin.js';
import { FieldValue } from 'firebase-admin/firestore';
import { io } from '../index.js';

const router = Router();
const db = () => getDb();

/** GET /api/friends — danh sách bạn bè */
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const friendDoc = await db().collection('friends').doc(uid).get();
    const friendIds: string[] = friendDoc.exists ? (friendDoc.data()?.friendIds ?? []) : [];
    if (friendIds.length === 0) {
      res.json({ friends: [] });
      return;
    }
    const usersSnap = await db().collection('users').get();
    const usersMap = new Map(usersSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
    const myFriendsSet = new Set(friendIds);
    // Batch-load friend lists to compute mutual counts
    const fDocs = await db().getAll(...friendIds.map((id) => db().collection('friends').doc(id)));
    const friendFriendsMap = new Map<string, string[]>();
    fDocs.forEach((d) => { if (d.exists) friendFriendsMap.set(d.id, d.data()?.friendIds ?? []); });

    const friends = friendIds
      .map((id) => usersMap.get(id))
      .filter(Boolean)
      .map((u) => {
        const theirFriends = friendFriendsMap.get(u!.id) ?? [];
        const mutualCount = theirFriends.filter((id: string) => id !== uid && myFriendsSet.has(id)).length;
        return {
          id: u!.id,
          name: (u as { displayName?: string }).displayName ?? 'Unknown',
          avatarUrl: (u as { photoURL?: string }).photoURL,
          mutualCount,
        };
      });
    res.json({ friends });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/friends/requests — lời mời gửi đến tôi (pending) */
router.get('/requests', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const snap = await db()
      .collection('friend_requests')
      .where('toUid', '==', uid)
      .where('status', '==', 'pending')
      .get();
    const fromIds = snap.docs.map((d) => d.data().fromUid);
    if (fromIds.length === 0) {
      res.json({ requests: [] });
      return;
    }
    const usersSnap = await db().collection('users').get();
    const usersMap = new Map(usersSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
    const requests = snap.docs.map((d) => {
      const data = d.data();
      const u = usersMap.get(data.fromUid);
      return {
        id: d.id,
        fromUid: data.fromUid,
        name: (u as { displayName?: string } | undefined)?.displayName ?? 'Unknown',
        avatarUrl: (u as { photoURL?: string } | undefined)?.photoURL,
      };
    });
    res.json({ requests });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** POST /api/friends/requests — gửi lời mời kết bạn (body: { toUid }) */
router.post('/requests', requireAuth, async (req: AuthRequest, res) => {
  try {
    const fromUid = req.uid!;
    const { toUid } = req.body as { toUid?: string };
    if (!toUid || typeof toUid !== 'string') {
      res.status(400).json({ error: 'toUid is required' });
      return;
    }
    if (toUid === fromUid) {
      res.status(400).json({ error: 'Cannot send request to yourself' });
      return;
    }
    const toUser = await db().collection('users').doc(toUid).get();
    if (!toUser.exists) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const existing = await db()
      .collection('friend_requests')
      .where('fromUid', '==', fromUid)
      .where('toUid', '==', toUid)
      .limit(1)
      .get();
    if (!existing.empty) {
      res.status(400).json({ error: 'Request already sent' });
      return;
    }
    const friendDoc = await db().collection('friends').doc(fromUid).get();
    const friendIds: string[] = friendDoc.exists ? (friendDoc.data()?.friendIds ?? []) : [];
    if (friendIds.includes(toUid)) {
      res.status(400).json({ error: 'Already friends' });
      return;
    }
    const ref = await db().collection('friend_requests').add({
      fromUid,
      toUid,
      status: 'pending',
      createdAt: new Date(),
    });

    // Auto-follow người được gửi lời mời (gửi lời mời = quan tâm người đó)
    await db().collection('follows').doc(fromUid)
      .set({ followingIds: FieldValue.arrayUnion(toUid) }, { merge: true });
    
    // Emit Socket.io event để người nhận cập nhật real-time
    const fromUser = await db().collection('users').doc(fromUid).get();
    const fromData = fromUser.data();
    const requestData = {
      id: ref.id,
      fromUid,
      name: fromData?.displayName ?? 'Unknown',
      avatarUrl: fromData?.photoURL,
    };
    console.log(`🔔 Emitting friendRequestReceived to user:${toUid}`, requestData);
    io.to(`user:${toUid}`).emit('friendRequestReceived', requestData);
    
    res.status(201).json({ id: ref.id, toUid, status: 'pending' });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** PATCH /api/friends/requests/:id — chấp nhận hoặc từ chối (body: { action: 'accept'|'reject' }) */
router.patch('/requests/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const { id } = req.params;
    const { action } = req.body as { action?: string };
    if (action !== 'accept' && action !== 'reject') {
      res.status(400).json({ error: 'action must be accept or reject' });
      return;
    }
    const ref = db().collection('friend_requests').doc(id);
    const doc = await ref.get();
    if (!doc.exists || doc.data()?.toUid !== uid) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    if (doc.data()?.status !== 'pending') {
      res.status(400).json({ error: 'Request already handled' });
      return;
    }
    const fromUid = doc.data()!.fromUid;
    await ref.update({ status: action });
    if (action === 'accept') {
      const batch = db().batch();
      const myRef = db().collection('friends').doc(uid);
      const theirRef = db().collection('friends').doc(fromUid);
      const myDoc = await myRef.get();
      const theirDoc = await theirRef.get();
      const myIds: string[] = myDoc.exists ? (myDoc.data()?.friendIds ?? []) : [];
      const theirIds: string[] = theirDoc.exists ? (theirDoc.data()?.friendIds ?? []) : [];
      if (!myIds.includes(fromUid)) myIds.push(fromUid);
      if (!theirIds.includes(uid)) theirIds.push(uid);
      batch.set(myRef, { friendIds: myIds }, { merge: true });
      batch.set(theirRef, { friendIds: theirIds }, { merge: true });
      await batch.commit();
    }
    res.json({ id, action });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/friends/sent — lời mời đã gửi (còn pending) */
router.get('/sent', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const snap = await db()
      .collection('friend_requests')
      .where('fromUid', '==', uid)
      .where('status', '==', 'pending')
      .get();
    if (snap.empty) { res.json({ sent: [] }); return; }
    const toIds = snap.docs.map((d) => d.data().toUid as string);
    const usersSnap = await db().collection('users').get();
    const usersMap = new Map(usersSnap.docs.map((d) => [d.id, d.data()]));
    const sent = snap.docs.map((d) => {
      const data = d.data();
      const u = usersMap.get(data.toUid);
      return {
        id: d.id,
        toUid: data.toUid,
        name: (u?.displayName as string) ?? 'Unknown',
        avatarUrl: u?.photoURL as string | undefined,
      };
    });
    res.json({ sent });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

/** GET /api/friends/suggestions — gợi ý (user chưa là bạn, chưa có request pending) */
router.get('/suggestions', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const friendDoc = await db().collection('friends').doc(uid).get();
    const friendIds: string[] = friendDoc.exists ? (friendDoc.data()?.friendIds ?? []) : [];
    const myFriendsSet = new Set(friendIds);
    const sent = await db().collection('friend_requests').where('fromUid', '==', uid).get();
    const received = await db().collection('friend_requests').where('toUid', '==', uid).get();
    const requested = new Set([
      ...sent.docs.map((d) => d.data().toUid),
      ...received.docs.map((d) => d.data().fromUid),
    ]);
    const exclude = new Set([uid, ...friendIds, ...requested]);
    const usersSnap = await db().collection('users').get();

    // Batch-load friend lists of suggestions to compute mutual counts
    const candidates = usersSnap.docs.filter((d) => !exclude.has(d.id)).slice(0, 40);
    const candidateIds = candidates.map((d) => d.id);
    const friendDocs = candidateIds.length > 0
      ? await db().getAll(...candidateIds.map((id) => db().collection('friends').doc(id)))
      : [];
    const candidateFriendsMap = new Map<string, string[]>();
    friendDocs.forEach((d) => {
      if (d.exists) candidateFriendsMap.set(d.id, d.data()?.friendIds ?? []);
    });

    const suggestions = candidates
      .map((d) => {
        const data = d.data();
        const theirFriends = candidateFriendsMap.get(d.id) ?? [];
        const mutualCount = theirFriends.filter((id: string) => myFriendsSet.has(id)).length;
        return {
          id: d.id,
          name: (data.displayName as string) ?? 'Unknown',
          avatarUrl: data.photoURL as string | undefined,
          mutualCount,
        };
      })
      // Sắp xếp gợi ý theo số bạn chung giảm dần
      .sort((a, b) => b.mutualCount - a.mutualCount)
      .slice(0, 20);
    res.json({ suggestions });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/friends/status/:uid — kiểm tra trạng thái quan hệ bạn bè với user khác */
router.get('/status/:uid', requireAuth, async (req: AuthRequest, res) => {
  try {
    const me = req.uid!;
    const other = req.params.uid;

    if (me === other) {
      res.json({ status: 'self' });
      return;
    }

    // Check if already friends
    const friendDoc = await db().collection('friends').doc(me).get();
    const friendIds: string[] = friendDoc.exists ? (friendDoc.data()?.friendIds ?? []) : [];
    if (friendIds.includes(other)) {
      res.json({ status: 'friends' });
      return;
    }

    // Check if I sent a request
    const sentSnap = await db()
      .collection('friend_requests')
      .where('fromUid', '==', me)
      .where('toUid', '==', other)
      .where('status', '==', 'pending')
      .limit(1)
      .get();
    if (!sentSnap.empty) {
      res.json({ status: 'request_sent', requestId: sentSnap.docs[0].id });
      return;
    }

    // Check if they sent me a request
    const receivedSnap = await db()
      .collection('friend_requests')
      .where('fromUid', '==', other)
      .where('toUid', '==', me)
      .where('status', '==', 'pending')
      .limit(1)
      .get();
    if (!receivedSnap.empty) {
      res.json({ status: 'request_received', requestId: receivedSnap.docs[0].id });
      return;
    }

    res.json({ status: 'stranger' });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** DELETE /api/friends/requests/:id — xóa lời mời (từ chối hoặc thu hồi) */
router.delete('/requests/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const { id } = req.params;
    const doc = await db().collection('friend_requests').doc(id).get();
    if (!doc.exists) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    const data = doc.data()!;
    if (data.toUid !== uid && data.fromUid !== uid) {
      res.status(403).json({ error: 'Not your request' });
      return;
    }
    await db().collection('friend_requests').doc(id).delete();
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/* ======================================================================== */
/*  NICKNAMES — biệt danh cá nhân, chỉ user tự thấy                       */
/*  Firestore: nicknames/{uid}  → { entries: { [friendUid]: string } }      */
/* ======================================================================== */

/** GET /api/friends/mutual/:uid — bạn chung giữa mình và user khác */
router.get('/mutual/:uid', requireAuth, async (req: AuthRequest, res) => {
  try {
    const me = req.uid!;
    const other = req.params.uid;
    if (me === other) { res.json({ mutualFriends: [], count: 0 }); return; }
    const [myDoc, theirDoc] = await Promise.all([
      db().collection('friends').doc(me).get(),
      db().collection('friends').doc(other).get(),
    ]);
    const myIds: string[] = myDoc.exists ? (myDoc.data()?.friendIds ?? []) : [];
    const theirIds = new Set<string>(theirDoc.exists ? (theirDoc.data()?.friendIds ?? []) : []);
    const mutualIds = myIds.filter((id) => theirIds.has(id));
    if (mutualIds.length === 0) { res.json({ mutualFriends: [], count: 0 }); return; }
    const usersSnap = await db().getAll(...mutualIds.slice(0, 20).map((id) => db().collection('users').doc(id)));
    const mutualFriends = usersSnap
      .filter((d) => d.exists)
      .map((d) => ({
        id: d.id,
        name: (d.data() as { displayName?: string }).displayName ?? 'Unknown',
        avatarUrl: (d.data() as { photoURL?: string }).photoURL,
      }));
    res.json({ mutualFriends, count: mutualIds.length });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/* ======================================================================== */
/*  FRIEND TIER — ưu tiên / bình thường / hạn chế                          */
/*  Firestore: friend_tiers/{uid} → { tiers: { [friendUid]: string } }     */
/* ======================================================================== */

/** GET /api/friends/tier/:friendUid — lấy tier hiện tại */
router.get('/tier/:friendUid', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const doc = await db().collection('friend_tiers').doc(uid).get();
    const tiers: Record<string, string> = doc.exists ? (doc.data()?.tiers ?? {}) : {};
    res.json({ tier: tiers[req.params.friendUid] ?? 'normal' });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** PUT /api/friends/tier/:friendUid — đặt tier (body: { tier: 'priority'|'normal'|'restricted' }) */
router.put('/tier/:friendUid', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const { friendUid } = req.params;
    const { tier } = req.body as { tier?: string };
    if (!tier || !['priority', 'normal', 'restricted'].includes(tier)) {
      res.status(400).json({ error: 'tier must be priority, normal, or restricted' });
      return;
    }
    // Verify friendship
    const friendDoc = await db().collection('friends').doc(uid).get();
    const friendIds: string[] = friendDoc.exists ? (friendDoc.data()?.friendIds ?? []) : [];
    if (!friendIds.includes(friendUid)) {
      res.status(400).json({ error: 'Not friends with this user' });
      return;
    }
    await db().collection('friend_tiers').doc(uid).set(
      { tiers: { [friendUid]: tier } },
      { merge: true },
    );
    res.json({ friendUid, tier });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/friends/tiers — lấy tất cả tiers */
router.get('/tiers', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const doc = await db().collection('friend_tiers').doc(uid).get();
    const tiers: Record<string, string> = doc.exists ? (doc.data()?.tiers ?? {}) : {};
    res.json({ tiers });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/* ======================================================================== */
/*  AFFINITY — điểm thân thiết (EdgeRank)                                   */
/*  Firestore: affinity/{uid} → { scores: { [friendUid]: number } }        */
/* ======================================================================== */

/** GET /api/friends/affinity — lấy tất cả affinity scores */
router.get('/affinity', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const doc = await db().collection('affinity').doc(uid).get();
    const scores: Record<string, number> = doc.exists ? (doc.data()?.scores ?? {}) : {};
    res.json({ scores });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** GET /api/friends/nicknames — lấy tất cả biệt danh của mình */
router.get('/nicknames', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const doc = await db().collection('nicknames').doc(uid).get();
    const entries: Record<string, string> = doc.exists ? (doc.data()?.entries ?? {}) : {};
    res.json({ nicknames: entries });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** PUT /api/friends/nicknames/:friendUid — đặt / cập nhật biệt danh cho 1 bạn */
router.put('/nicknames/:friendUid', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const { friendUid } = req.params;
    const { nickname } = req.body as { nickname?: string };
    if (!nickname || typeof nickname !== 'string' || nickname.trim().length === 0) {
      res.status(400).json({ error: 'nickname is required' });
      return;
    }
    if (nickname.trim().length > 50) {
      res.status(400).json({ error: 'nickname too long (max 50)' });
      return;
    }
    // Verify they are friends
    const friendDoc = await db().collection('friends').doc(uid).get();
    const friendIds: string[] = friendDoc.exists ? (friendDoc.data()?.friendIds ?? []) : [];
    if (!friendIds.includes(friendUid)) {
      res.status(400).json({ error: 'Not friends with this user' });
      return;
    }
    await db().collection('nicknames').doc(uid).set(
      { entries: { [friendUid]: nickname.trim() } },
      { merge: true },
    );
    res.json({ friendUid, nickname: nickname.trim() });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** DELETE /api/friends/nicknames/:friendUid — xóa biệt danh */
router.delete('/nicknames/:friendUid', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const { friendUid } = req.params;
    const ref = db().collection('nicknames').doc(uid);
    const doc = await ref.get();
    if (!doc.exists) { res.status(204).send(); return; }
    const entries = { ...(doc.data()?.entries ?? {}) } as Record<string, string>;
    delete entries[friendUid];
    await ref.set({ entries }, { merge: false });
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
