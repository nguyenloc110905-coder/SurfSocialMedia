/**
 * Image CDN utility – tối ưu URL ảnh qua Cloudflare cache hoặc Cloudinary transforms.
 *
 * Luồng:
 *  1. Nếu có CLOUDFLARE_WORKER_URL → proxy ảnh qua Cloudflare Worker (cache tại edge)
 *  2. Nếu URL là Cloudinary → chèn transforms (f_auto, q_auto, w_…) để tối ưu delivery
 *  3. URL khác → trả nguyên gốc
 */

// Cloudflare Worker URL – set trong .env hoặc để trống nếu chưa deploy Worker
const CF_WORKER_URL = (import.meta.env.VITE_CF_WORKER_URL as string | undefined) ?? '';

export interface ImageOptions {
  /** Chiều rộng tối đa (px) */
  width?: number;
  /** Chiều cao tối đa (px) */
  height?: number;
  /** Chất lượng 1-100 (mặc định auto) */
  quality?: 'auto' | number;
  /** Cách crop: fill | scale | fit | thumb | crop */
  crop?: string;
  /** Format: auto | webp | avif | jpg | png */
  format?: 'auto' | 'webp' | 'avif' | 'jpg' | 'png';
}

/**
 * Tối ưu URL ảnh: qua Cloudflare Worker cache.
 * Cloudinary đã bị loại bỏ.
 */
export function optimizeImageUrl(url: string | null | undefined, opts: ImageOptions = {}): string {
  if (!url) return '';

  // Base64 / data URL → trả nguyên
  if (url.startsWith('data:')) return url;

  // 1️⃣ Cloudflare Worker proxy (nếu đã cấu hình)
  if (CF_WORKER_URL) {
    const params = new URLSearchParams({ url });
    if (opts.width) params.set('w', String(opts.width));
    if (opts.height) params.set('h', String(opts.height));
    if (opts.format) params.set('f', opts.format);
    if (opts.quality) params.set('q', String(opts.quality));
    return `${CF_WORKER_URL}?${params.toString()}`;
  }

  // 2️⃣ URL khác (Firebase Storage, external) → trả nguyên
  return url;
}

/**
 * Preset tối ưu cho avatar (nhỏ, tròn).
 */
export function optimizeAvatar(url: string | null | undefined, size: number = 128): string {
  return optimizeImageUrl(url, {
    width: size,
    height: size,
    crop: 'fill',
    format: 'auto',
    quality: 'auto',
  });
}

/**
 * Preset tối ưu cho ảnh trong feed.
 */
export function optimizeFeedImage(url: string | null | undefined, maxWidth: number = 800): string {
  return optimizeImageUrl(url, {
    width: maxWidth,
    format: 'auto',
    quality: 'auto',
  });
}

/**
 * Preset tối ưu cho cover photo.
 */
export function optimizeCoverImage(url: string | null | undefined): string {
  return optimizeImageUrl(url, {
    width: 1200,
    format: 'auto',
    quality: 'auto',
  });
}
