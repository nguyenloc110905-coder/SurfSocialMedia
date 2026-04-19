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
 * Kiểm tra URL có phải Cloudinary hay không.
 */
function isCloudinaryUrl(url: string): boolean {
  return url.includes('res.cloudinary.com') || url.includes('cloudinary.com');
}

function isCloudinaryTransformSegment(segment: string): boolean {
  // Example valid segment: c_fill,w_400,h_400
  return /^([a-z]{1,4}_[^,/]+)(,[a-z]{1,4}_[^,/]+)*$/i.test(segment);
}

function splitUrlAndSuffix(url: string): { base: string; suffix: string } {
  const qIdx = url.indexOf('?');
  const hIdx = url.indexOf('#');

  if (qIdx === -1 && hIdx === -1) {
    return { base: url, suffix: '' };
  }

  if (qIdx === -1) {
    return { base: url.slice(0, hIdx), suffix: url.slice(hIdx) };
  }

  if (hIdx === -1) {
    return { base: url.slice(0, qIdx), suffix: url.slice(qIdx) };
  }

  const cut = Math.min(qIdx, hIdx);
  return { base: url.slice(0, cut), suffix: url.slice(cut) };
}

/**
 * Chèn Cloudinary transforms vào URL gốc.
 * Ví dụ: https://res.cloudinary.com/dg8oqqjes/image/upload/v1234/photo.jpg
 *       → https://res.cloudinary.com/dg8oqqjes/image/upload/f_auto,q_auto,w_800/v1234/photo.jpg
 */
function applyCloudinaryTransforms(url: string, opts: ImageOptions): string {
  const desiredByKey = new Map<string, string>([
    ['f', 'f_auto'],
    ['q', 'q_auto'],
  ]);

  if (opts.width) desiredByKey.set('w', `w_${opts.width}`);
  if (opts.height) desiredByKey.set('h', `h_${opts.height}`);
  if (opts.crop) desiredByKey.set('c', `c_${opts.crop}`);
  if (opts.quality && opts.quality !== 'auto') desiredByKey.set('q', `q_${opts.quality}`);
  if (opts.format && opts.format !== 'auto') desiredByKey.set('f', `f_${opts.format}`);

  const uploadMarker = '/image/upload/';
  const { base, suffix } = splitUrlAndSuffix(url);
  const uploadIdx = base.indexOf(uploadMarker);
  if (uploadIdx === -1) return url;

  const prefix = base.slice(0, uploadIdx + uploadMarker.length);
  const rest = base.slice(uploadIdx + uploadMarker.length);
  const segments = rest.split('/').filter(Boolean);

  const existingTransformSegments: string[] = [];
  while (segments.length > 0 && isCloudinaryTransformSegment(segments[0])) {
    existingTransformSegments.push(segments.shift()!);
  }

  const existingParts = existingTransformSegments
    .join(',')
    .split(',')
    .filter(Boolean)
    .filter((part) => {
      const key = part.split('_', 1)[0];
      return !desiredByKey.has(key);
    });

  const mergedTransform = [...existingParts, ...Array.from(desiredByKey.values())].join(',');
  const restPath = segments.join('/');

  return `${prefix}${mergedTransform}/${restPath}${suffix}`;
}

/**
 * Tối ưu URL ảnh: qua Cloudflare Worker cache hoặc Cloudinary transforms.
 *
 * @example
 * // Cloudflare Worker proxy
 * optimizeImageUrl('https://res.cloudinary.com/.../photo.jpg', { width: 400 })
 * // → https://your-worker.workers.dev/?url=...&w=400&f=auto&q=auto
 *
 * @example
 * // Cloudinary transforms (khi không có Worker)
 * optimizeImageUrl('https://res.cloudinary.com/.../photo.jpg', { width: 400 })
 * // → https://res.cloudinary.com/.../f_auto,q_auto,w_400/photo.jpg
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

  // 2️⃣ Cloudinary transforms (miễn phí, không cần deploy thêm)
  if (isCloudinaryUrl(url)) {
    return applyCloudinaryTransforms(url, opts);
  }

  // 3️⃣ URL khác (Firebase Storage, external) → trả nguyên
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
