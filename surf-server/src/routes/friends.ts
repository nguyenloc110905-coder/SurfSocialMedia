import { Router } from 'express';
import {
  requireAuth,
  AuthRequest,
  requireNoBlock,
  rejectIfBlocked,
  hasBlockRelation,
} from '../middleware/auth.js';
import { getDb } from '../config/firebase-admin.js';
import { FieldValue } from 'firebase-admin/firestore';
import {
  createNotification,
  getUnreadNotificationCount,
  toApiNotification,
} from '../services/notifications.js';
import { emitFriendRequestReceived } from '../realtime/emitters/friend.emitter.js';
import {
  emitNotificationNew,
  emitNotificationUnreadCount,
} from '../realtime/emitters/notification.emitter.js';

const router = Router();
const db = () => getDb();

/**
 * @swagger
 * /api/friends:
 *   get:
 *     tags: [Friends]
 *     summary: Danh sách bạn bè của tôi
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 */
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
    fDocs.forEach((d) => {
      if (d.exists) friendFriendsMap.set(d.id, d.data()?.friendIds ?? []);
    });

    const friends = friendIds
      .map((id) => usersMap.get(id))
      .filter(Boolean)
      .map((u) => {
        const theirFriends = friendFriendsMap.get(u!.id) ?? [];
        const mutualCount = theirFriends.filter(
          (id: string) => id !== uid && myFriendsSet.has(id)
        ).length;
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

/**
 * @swagger
 * /api/friends/requests:
 *   get:
 *     tags: [Friends]
 *     summary: Lời mời kết bạn gửi đến tôi (pending)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 *   post:
 *     tags: [Friends]
 *     summary: Gửi lời mời kết bạn
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [toUid]
 *             properties:
 *               toUid: { type: string }
 *     responses:
 *       201: { description: Lời mời đã gửi }
 *       409: { description: Đã tồn tại hoặc đã là bạn }
 */
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
router.post(
  '/requests',
  requireAuth,
  requireNoBlock((req: AuthRequest) => (req.body as { toUid?: string })?.toUid),
  async (req: AuthRequest, res) => {
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
      await db()
        .collection('follows')
        .doc(fromUid)
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
      emitFriendRequestReceived(toUid, requestData);

      // Tạo notification lưu DB + push realtime cho chuông thông báo.
      try {
        const notification = await createNotification({
          userId: toUid,
          type: 'friend_request',
          actorId: fromUid,
          entityType: 'friend_request',
          entityId: ref.id,
          message: `${fromData?.displayName ?? 'Unknown'} đã gửi lời mời kết bạn cho bạn.`,
        });
        const unreadCount = await getUnreadNotificationCount(toUid);
        emitNotificationNew(toUid, toApiNotification(notification));
        emitNotificationUnreadCount(toUid, unreadCount);
      } catch (notifyError) {
        console.warn('⚠️ Không tạo được notification friend_request:', notifyError);
      }

      // Write notification doc + emit notification:new so the bell updates
      const notifRef = db().collection('notifications').doc();
      const notifPayload = {
        id: notifRef.id,
        type: 'friend_request',
        recipientId: toUid,
        actorId: fromUid,
        actorName: fromData?.displayName ?? 'Ai đó',
        actorPhoto: fromData?.photoURL ?? null,
        requestId: ref.id,
        read: false,
        createdAt: new Date(),
      };
      notifRef.set(notifPayload).catch(() => {});
      io.to(`user:${toUid}`).emit('notification:new', {
        ...notifPayload,
        createdAt: new Date().toISOString(),
      });

      res.status(201).json({ id: ref.id, toUid, status: 'pending' });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  }
);

/**
 * @swagger
 * /api/friends/requests/{id}:
 *   patch:
 *     tags: [Friends]
 *     summary: Chấp nhận hoặc từ chối lời mời
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action]
 *             properties:
 *               action: { type: string, enum: [accept, reject] }
 *     responses:
 *       200: { description: OK }
 *   delete:
 *     tags: [Friends]
 *     summary: Hủy lời mời (từ chối hoặc thu hồi)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 */
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
    const toUid = doc.data()!.toUid;
    const otherUid = uid === fromUid ? toUid : fromUid;
    if (await rejectIfBlocked(uid, otherUid, res)) return;

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

      // Tạo notification cho người đã gửi lời mời: yêu cầu đã được chấp nhận.
      try {
        const acceptorDoc = await db().collection('users').doc(uid).get();
        const acceptorName = acceptorDoc.data()?.displayName ?? 'Unknown';
        const notification = await createNotification({
          userId: fromUid,
          type: 'friend_accept',
          actorId: uid,
          entityType: 'friend_request',
          entityId: id,
          message: `${acceptorName} đã chấp nhận lời mời kết bạn của bạn.`,
        });
        const unreadCount = await getUnreadNotificationCount(fromUid);
        emitNotificationNew(fromUid, toApiNotification(notification));
        emitNotificationUnreadCount(fromUid, unreadCount);
      } catch (notifyError) {
        console.warn('⚠️ Không tạo được notification friend_accept:', notifyError);
      }
    }
    res.json({ id, action });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/friends/sent:
 *   get:
 *     tags: [Friends]
 *     summary: Lời mời đã gửi (còn pending)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 */
router.get('/sent', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const snap = await db()
      .collection('friend_requests')
      .where('fromUid', '==', uid)
      .where('status', '==', 'pending')
      .get();
    if (snap.empty) {
      res.json({ sent: [] });
      return;
    }
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
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/friends/suggestions:
 *   get:
 *     tags: [Friends]
 *     summary: Gợi ý kết bạn
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 */
router.get('/suggestions', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const [myUserDoc, blockedByMeSnap] = await Promise.all([
      db().collection('users').doc(uid).get(),
      db().collection('users').where('blockedBy', 'array-contains', uid).get(),
    ]);
    const blockedByOthers = new Set<string>(
      myUserDoc.exists ? ((myUserDoc.data()?.blockedBy ?? []) as string[]) : []
    );
    const blockedByMe = new Set<string>(blockedByMeSnap.docs.map((d) => d.id));

    const friendDoc = await db().collection('friends').doc(uid).get();
    const friendIds: string[] = friendDoc.exists ? (friendDoc.data()?.friendIds ?? []) : [];
    const sent = await db()
      .collection('friend_requests')
      .where('fromUid', '==', uid)
      .where('status', '==', 'pending')
      .get();
    const received = await db()
      .collection('friend_requests')
      .where('toUid', '==', uid)
      .where('status', '==', 'pending')
      .get();
    const requested = new Set([
      ...sent.docs.map((d) => d.data().toUid),
      ...received.docs.map((d) => d.data().fromUid),
    ]);
    const exclude = new Set([uid, ...friendIds, ...requested, ...blockedByOthers, ...blockedByMe]);

    // FOAF: chỉ lấy bạn của bạn bè rồi đếm mutualCount
    const mutualCountMap = new Map<string, number>();
    if (friendIds.length > 0) {
      const friendDocs = await db().getAll(
        ...friendIds.map((id) => db().collection('friends').doc(id))
      );
      friendDocs.forEach((doc) => {
        if (!doc.exists) return;
        const foafIds: string[] = doc.data()?.friendIds ?? [];
        foafIds.forEach((candidateId) => {
          if (exclude.has(candidateId)) return;
          mutualCountMap.set(candidateId, (mutualCountMap.get(candidateId) ?? 0) + 1);
        });
      });
    }

    // Ưu tiên danh sách FOAF có mutualCount > 0
    const foafIds = [...mutualCountMap.keys()].sort((a, b) => {
      const diff = (mutualCountMap.get(b) ?? 0) - (mutualCountMap.get(a) ?? 0);
      return diff !== 0 ? diff : a.localeCompare(b);
    });

    const maxSuggestions = 20;
    const mutualSuggestions =
      foafIds.length === 0
        ? []
        : (
            await db().getAll(
              ...foafIds.slice(0, 200).map((id) => db().collection('users').doc(id))
            )
          )
            .filter((d) => d.exists)
            .map((d) => {
              const data = d.data()!;
              return {
                id: d.id,
                name: (data.displayName as string) ?? 'Unknown',
                avatarUrl: data.photoURL as string | undefined,
                mutualCount: mutualCountMap.get(d.id) ?? 0,
              };
            })
            .sort((a, b) => {
              const diff = b.mutualCount - a.mutualCount;
              if (diff !== 0) return diff;
              return a.name.localeCompare(b.name);
            })
            .slice(0, maxSuggestions);

    // Phần còn lại: người dùng chưa bị loại, không trùng nhóm FOAF
    const remainingSlots = Math.max(0, maxSuggestions - mutualSuggestions.length);
    const excludeForOthers = new Set<string>([...exclude, ...mutualSuggestions.map((s) => s.id)]);

    const otherSuggestions =
      remainingSlots === 0
        ? []
        : (await db().collection('users').limit(500).get()).docs
            .filter((d) => !excludeForOthers.has(d.id))
            .map((d) => {
              const data = d.data();
              return {
                id: d.id,
                name: (data.displayName as string) ?? 'Unknown',
                avatarUrl: data.photoURL as string | undefined,
                mutualCount: 0,
              };
            })
            .slice(0, remainingSlots);

    res.json({ suggestions: [...mutualSuggestions, ...otherSuggestions] });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/friends/status/{uid}:
 *   get:
 *     tags: [Friends]
 *     summary: Kiểm tra trạng thái quan hệ bạn bè với user khác
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: uid
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 */
router.get('/status/:uid', requireAuth, async (req: AuthRequest, res) => {
  try {
    const me = req.uid!;
    const other = req.params.uid;

    if (me === other) {
      res.json({ status: 'self' });
      return;
    }
    if (await hasBlockRelation(me, other)) {
      res.json({ status: 'blocked' });
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
    const otherUid = data.toUid === uid ? data.fromUid : data.toUid;
    if (await rejectIfBlocked(uid, otherUid, res)) return;

    await db().collection('friend_requests').doc(id).delete();
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/friends/{uid}:
 *   delete:
 *     tags: [Friends]
 *     summary: Hủy kết bạn (unfriend)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: uid
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 */
router.delete('/:uid', requireAuth, async (req: AuthRequest, res) => {
  try {
    const me = req.uid!;
    const other = req.params.uid;
    if (me === other) {
      res.status(400).json({ error: 'Cannot unfriend yourself' });
      return;
    }
    const batch = db().batch();
    const myRef = db().collection('friends').doc(me);
    const theirRef = db().collection('friends').doc(other);
    const [myDoc, theirDoc] = await Promise.all([myRef.get(), theirRef.get()]);
    const myIds: string[] = myDoc.exists ? (myDoc.data()?.friendIds ?? []) : [];
    const theirIds: string[] = theirDoc.exists ? (theirDoc.data()?.friendIds ?? []) : [];
    batch.set(myRef, { friendIds: myIds.filter((id) => id !== other) }, { merge: true });
    batch.set(theirRef, { friendIds: theirIds.filter((id) => id !== me) }, { merge: true });
    // Clean up any lingering friend_requests between them
    const [req1, req2] = await Promise.all([
      db().collection('friend_requests').where('fromUid', '==', me).where('toUid', '==', other).get(),
      db().collection('friend_requests').where('fromUid', '==', other).where('toUid', '==', me).get(),
    ]);
    req1.docs.forEach((d) => batch.delete(d.ref));
    req2.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/* ========================================================================
   NICKNAMES — biệt danh cá nhân, chỉ user tự thấy                       */
/*  Firestore: nicknames/{uid}  → { entries: { [friendUid]: string } }      */
/* ======================================================================== */

/**
 * @swagger
 * /api/friends/mutual/{uid}:
 *   get:
 *     tags: [Friends]
 *     summary: Danh sách bạn chung với user khác
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: uid
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 */
router.get(
  '/mutual/:uid',
  requireAuth,
  requireNoBlock((req: AuthRequest) => req.params.uid),
  async (req: AuthRequest, res) => {
    try {
      const me = req.uid!;
      const other = req.params.uid;
      if (me === other) {
        res.json({ mutualFriends: [], count: 0 });
        return;
      }
      const [myDoc, theirDoc] = await Promise.all([
        db().collection('friends').doc(me).get(),
        db().collection('friends').doc(other).get(),
      ]);
      const myIds: string[] = myDoc.exists ? (myDoc.data()?.friendIds ?? []) : [];
      const theirIds = new Set<string>(theirDoc.exists ? (theirDoc.data()?.friendIds ?? []) : []);
      const mutualIds = myIds.filter((id) => theirIds.has(id));
      if (mutualIds.length === 0) {
        res.json({ mutualFriends: [], count: 0 });
        return;
      }
      const usersSnap = await db().getAll(
        ...mutualIds.slice(0, 20).map((id) => db().collection('users').doc(id))
      );
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
  }
);

/* ======================================================================== */
/*  FRIEND TIER — ưu tiên / bình thường / hạn chế                          */
/*  Firestore: friend_tiers/{uid} → { tiers: { [friendUid]: string } }     */
/* ======================================================================== */

/**
 * @swagger
 * /api/friends/tier/{friendUid}:
 *   get:
 *     tags: [Friends]
 *     summary: Lấy tier của một bạn (priority/normal/restricted)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: friendUid
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *   put:
 *     tags: [Friends]
 *     summary: Thiết lập tier cho bạn
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: friendUid
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tier: { type: string, enum: [priority, normal, restricted] }
 *     responses:
 *       200: { description: OK }
 */
router.get(
  '/tier/:friendUid',
  requireAuth,
  requireNoBlock((req: AuthRequest) => req.params.friendUid),
  async (req: AuthRequest, res) => {
    try {
      const uid = req.uid!;
      const doc = await db().collection('friend_tiers').doc(uid).get();
      const tiers: Record<string, string> = doc.exists ? (doc.data()?.tiers ?? {}) : {};
      res.json({ tier: tiers[req.params.friendUid] ?? 'normal' });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  }
);

/** PUT /api/friends/tier/:friendUid — đặt tier (body: { tier: 'priority'|'normal'|'restricted' }) */
router.put(
  '/tier/:friendUid',
  requireAuth,
  requireNoBlock((req: AuthRequest) => req.params.friendUid),
  async (req: AuthRequest, res) => {
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
      await db()
        .collection('friend_tiers')
        .doc(uid)
        .set({ tiers: { [friendUid]: tier } }, { merge: true });
      res.json({ friendUid, tier });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  }
);

/**
 * @swagger
 * /api/friends/tiers:
 *   get:
 *     tags: [Friends]
 *     summary: Lấy tất cả tiers
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 */
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

/**
 * @swagger
 * /api/friends/affinity:
 *   get:
 *     tags: [Friends]
 *     summary: Lấy tất cả affinity scores (mức độ thân thiết)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 */
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

/**
 * @swagger
 * /api/friends/nicknames:
 *   get:
 *     tags: [Friends]
 *     summary: Lấy tất cả biệt danh đã đặt
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 */
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

/**
 * @swagger
 * /api/friends/nicknames/{friendUid}:
 *   put:
 *     tags: [Friends]
 *     summary: Đặt / cập nhật biệt danh cho bạn
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: friendUid
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nickname: { type: string }
 *     responses:
 *       200: { description: OK }
 *   delete:
 *     tags: [Friends]
 *     summary: Xóa biệt danh
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: friendUid
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 */
router.put(
  '/nicknames/:friendUid',
  requireAuth,
  requireNoBlock((req: AuthRequest) => req.params.friendUid),
  async (req: AuthRequest, res) => {
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
      await db()
        .collection('nicknames')
        .doc(uid)
        .set({ entries: { [friendUid]: nickname.trim() } }, { merge: true });
      res.json({ friendUid, nickname: nickname.trim() });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  }
);

/** DELETE /api/friends/nicknames/:friendUid — xóa biệt danh */
router.delete(
  '/nicknames/:friendUid',
  requireAuth,
  requireNoBlock((req: AuthRequest) => req.params.friendUid),
  async (req: AuthRequest, res) => {
    try {
      const uid = req.uid!;
      const { friendUid } = req.params;
      const ref = db().collection('nicknames').doc(uid);
      const doc = await ref.get();
      if (!doc.exists) {
        res.status(204).send();
        return;
      }
      const entries = { ...(doc.data()?.entries ?? {}) } as Record<string, string>;
      delete entries[friendUid];
      await ref.set({ entries }, { merge: false });
      res.status(204).send();
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  }
);

export default router;
