/**
 * Cloudflare Worker – Image Cache Proxy
 *
 * Worker này proxy ảnh từ Cloudinary (hoặc bất kỳ nguồn nào) và cache tại
 * Cloudflare edge, giúp giảm latency và tiết kiệm bandwidth Cloudinary.
 *
 * Deploy:
 *   1. Cài Wrangler: npm i -g wrangler
 *   2. wrangler login
 *   3. cd cf-worker && wrangler deploy
 *
 * Sử dụng:
 *   GET https://your-worker.workers.dev/?url=<image_url>&w=800&h=600&f=auto&q=auto
 *
 * Cache TTL mặc định: 30 ngày tại edge, 1 năm cho browser.
 */

// Danh sách domain được phép proxy (chống SSRF)
const ALLOWED_ORIGINS = [
  'res.cloudinary.com',
  'cloudinary.com',
  'firebasestorage.googleapis.com',
];

function isAllowedOrigin(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_ORIGINS.some(origin => parsed.hostname.endsWith(origin));
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/health') {
      return new Response('OK', { status: 200 });
    }

    const imageUrl = url.searchParams.get('url');

    if (!imageUrl) {
      return new Response('Missing ?url= parameter', { status: 400 });
    }

    // SSRF protection: chỉ cho phép proxy từ các domain đã whitelist
    if (!isAllowedOrigin(imageUrl)) {
      return new Response('Origin not allowed', { status: 403 });
    }

    // Validate URL format
    let parsedImageUrl: URL;
    try {
      parsedImageUrl = new URL(imageUrl);
      if (!['http:', 'https:'].includes(parsedImageUrl.protocol)) {
        return new Response('Invalid URL protocol', { status: 400 });
      }
    } catch {
      return new Response('Invalid URL', { status: 400 });
    }

    // Build Cloudflare Image Resizing options (nếu có Cloudflare Pro+)
    // Nếu không có Pro, Worker vẫ cache ảnh gốc tại edge
    const cfOptions: Record<string, unknown> = {};
    const w = url.searchParams.get('w');
    const h = url.searchParams.get('h');
    const f = url.searchParams.get('f');
    const q = url.searchParams.get('q');

    if (w) cfOptions.width = parseInt(w, 10);
    if (h) cfOptions.height = parseInt(h, 10);
    if (f && f !== 'auto') cfOptions.format = f;
    if (q && q !== 'auto') cfOptions.quality = parseInt(q, 10);

    // Cache key = original URL + transform params
    const cacheKey = new Request(imageUrl + url.search, request);
    const cache = caches.default;

    // Check cache first
    let response = await cache.match(cacheKey);
    if (response) {
      return response;
    }

    // Fetch từ origin
    const originResponse = await fetch(imageUrl, {
      headers: {
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'User-Agent': 'SurfSocialMedia-CDN/1.0',
      },
    });

    if (!originResponse.ok) {
      return new Response(`Origin returned ${originResponse.status}`, {
        status: originResponse.status,
      });
    }

    // Clone để có thể cache
    response = new Response(originResponse.body, originResponse);

    // Set cache headers
    response.headers.set('Cache-Control', 'public, max-age=31536000, s-maxage=2592000, immutable');
    response.headers.set('CDN-Cache-Control', 'public, max-age=2592000'); // 30 ngày tại Cloudflare edge
    response.headers.set('Vary', 'Accept');
    response.headers.set('X-Cache-Status', 'MISS');

    // CORS headers
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');

    // Store in cache (non-blocking)
    const cacheResponse = response.clone();
    // Đảm bảo response có thể cache
    const cacheable = new Response(cacheResponse.body, cacheResponse);
    cacheable.headers.set('X-Cache-Status', 'HIT');
    await cache.put(cacheKey, cacheable);

    return response;
  },
};
