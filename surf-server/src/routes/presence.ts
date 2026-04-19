import { Router } from 'express';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import { getDb } from '../config/firebase-admin.js';
import { getPresenceFromList } from '../services/presence.js';

const router = Router();

/** GET /api/presence/friends — online list + lastSeen timestamps for offline friends */
router.get('/friends', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const friendDoc = await getDb().collection('friends').doc(uid).get();
    const friendIds: string[] = friendDoc.exists
      ? (friendDoc.data()?.friendIds ?? [])
      : [];
    const { online, lastSeen } = await getPresenceFromList(friendIds);
    res.json({ online, lastSeen });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
