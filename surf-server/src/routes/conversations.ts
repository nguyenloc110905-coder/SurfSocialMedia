import { Router } from 'express';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import { createOrGetDmConversation, toApiConversation } from '../services/conversations.js';

const router = Router();

router.post('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const actorUid = req.uid!;
    const peerUid = typeof req.body?.peerUid === 'string' ? req.body.peerUid : '';

    const result = await createOrGetDmConversation(actorUid, peerUid);
    if (!result.ok) {
      if (result.reason === 'invalid_peer') {
        res.status(400).json({ error: 'Invalid peer UID' });
        return;
      }
      if (result.reason === 'peer_not_found') {
        res.status(404).json({ error: 'Peer user not found' });
        return;
      }
      res.status(403).json({ error: 'Blocked users cannot interact', code: 'USER_BLOCKED' });
      return;
    }

    res.status(result.created ? 201 : 200).json({
      created: result.created,
      item: toApiConversation(result.item),
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
