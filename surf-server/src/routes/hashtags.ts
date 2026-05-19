import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getTrendingHashtags } from '../services/hashtags.js';

const router = Router();

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(parsed, max));
}

/**
 * @swagger
 * /api/hashtags/trending:
 *   get:
 *     tags: [Hashtags]
 *     summary: Lấy hashtag đang thịnh hành từ aggregate theo ngày
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: days
 *         schema: { type: integer, default: 7, minimum: 1, maximum: 30 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, minimum: 1, maximum: 50 }
 *     responses:
 *       200: { description: Danh sách hashtag thịnh hành }
 */
router.get('/trending', requireAuth, async (req, res) => {
  try {
    const days = clampNumber(req.query.days, 7, 1, 30);
    const limit = clampNumber(req.query.limit, 10, 1, 50);
    const hashtags = await getTrendingHashtags(days, limit);
    res.json({ hashtags, days });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
