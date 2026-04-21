import { Router } from 'express';
import { logger } from '../config/logger.js';

const router = Router();

/**
 * @swagger
 * /api/music/search:
 *   get:
 *     tags: [Music]
 *     summary: Tìm kiếm bài nhạc qua YouTube Data API v3 (cần YOUTUBE_API_KEY)
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string }
 *         description: Từ khóa tìm kiếm
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 20 }
 *     responses:
 *       200:
 *         description: Danh sách video nhạc
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 videos:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       title: { type: string }
 *                       artist: { type: string }
 *                       thumbnail: { type: string }
 *       400: { description: Thiếu query q }
 *       503: { description: YouTube API key chưa cấu hình }
 */
router.get('/search', async (req, res) => {
  try {
    const q = String(req.query.q ?? '').trim();
    const limit = Math.min(Number(req.query.limit) || 10, 20);

    if (!q) {
      res.status(400).json({ error: 'Missing query parameter: q' });
      return;
    }

    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      res.status(503).json({ error: 'YouTube API key not configured' });
      return;
    }

    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('type', 'video');
    url.searchParams.set('videoCategoryId', '10'); // Music
    url.searchParams.set('q', q);
    url.searchParams.set('maxResults', String(limit));
    url.searchParams.set('key', apiKey);

    const response = await fetch(url.toString());
    if (!response.ok) {
      const errText = await response.text();
      logger.error('[music/search] YouTube API error:', { detail: errText });
      res.status(502).json({ error: 'YouTube API error' });
      return;
    }

    const data = (await response.json()) as {
      items?: Array<{
        id: { videoId: string };
        snippet: {
          title: string;
          channelTitle: string;
          thumbnails: { high?: { url: string }; default?: { url: string } };
        };
      }>;
    };

    const videos = (data.items ?? []).map((item) => ({
      id: item.id.videoId,
      title: item.snippet.title,
      artist: item.snippet.channelTitle,
      thumbnail:
        item.snippet.thumbnails.high?.url ??
        item.snippet.thumbnails.default?.url ??
        `https://img.youtube.com/vi/${item.id.videoId}/hqdefault.jpg`,
    }));

    res.json({ videos });
  } catch (err) {
    logger.error('[music/search]', { stack: err instanceof Error ? err.stack : String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
