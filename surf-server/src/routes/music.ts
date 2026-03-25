import { Router } from 'express';

const router = Router();

/**
 * GET /api/music/search?q=&limit=
 * Tìm kiếm bài hát trên YouTube Data API v3.
 * Yêu cầu YOUTUBE_API_KEY trong .env
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
      console.error('[music/search] YouTube API error:', errText);
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
    console.error('[music/search]', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
