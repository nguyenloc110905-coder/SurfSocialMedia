import { Router } from 'express';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import { getDb } from '../config/firebase-admin.js';
import { getPresenceFromList } from '../services/presence.js';

const router = Router();

/**
 * @swagger
 * /api/presence/friends:
 *   get:
 *     tags: [Presence]
 *     summary: Danh sách bạn bè online và lastSeen của offline
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 online: { type: array, items: { type: string }, description: 'Danh sách uid đang online' }
 *                 lastSeen: { type: object, description: 'Map uid -> ISO timestamp' }
 *                 friendIds: { type: array, items: { type: string }, description: 'Danh sách uid của tất cả bạn bè' }
 */
router.get('/friends', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const friendDoc = await getDb().collection('friends').doc(uid).get();
    const friendIds: string[] = friendDoc.exists
      ? (friendDoc.data()?.friendIds ?? [])
      : [];
    const { online, lastSeen } = await getPresenceFromList(friendIds);
    res.json({ online, lastSeen, friendIds });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/users/:uid', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = String(req.params.uid || '').trim();
    if (!uid) {
      res.status(400).json({ error: 'Missing uid' });
      return;
    }

    const { online, lastSeen } = await getPresenceFromList([uid]);
    res.json({
      uid,
      online: online.includes(uid),
      lastSeen: lastSeen[uid] ?? null,
    });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
