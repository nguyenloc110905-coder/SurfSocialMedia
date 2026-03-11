/**
 * Image CDN utility – tối ưu URL ảnh qua Cloudflare cache hoặc Cloudinary transforms.
 *
 * Luồng:
 *  1. Nếu có CLOUDFLARE_WORKER_URL → proxy ảnh qua Cloudflare Worker (cache tại edge)
 *  2. Nếu URL là Cloudinary → chèn transforms (f_auto, q_auto, w_…) để tối ưu delivery
 *  3. URL khác → trả nguyên gốc
 */

import { CLOUDINARY_CLOUD_NAME } from './cloudinary-config';

// Cloudflare Worker URL – set trong .env hoặc để trống nếu chưa deploy Worker
const CF_WORKER_URL =
  (import.meta.env.VITE_CF_WORKER_URL as string | undefined) ?? '';

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

/**
 * Chèn Cloudinary transforms vào URL gốc.
 * Ví dụ: https://res.cloudinary.com/dg8oqqjes/image/upload/v1234/photo.jpg
 *       → https://res.cloudinary.com/dg8oqqjes/image/upload/f_auto,q_auto,w_800/v1234/photo.jpg
 */
function applyCloudinaryTransforms(url: string, opts: ImageOptions): string {
  const parts: string[] = ['f_auto', 'q_auto'];

  if (opts.width) parts.push(`w_${opts.width}`);
  if (opts.height) parts.push(`h_${opts.height}`);
  if (opts.crop) parts.push(`c_${opts.crop}`);
  if (opts.quality && opts.quality !== 'auto') parts.push(`q_${opts.quality}`);
  if (opts.format && opts.format !== 'auto') parts.push(`f_${opts.format}`);

  const transformStr = parts.join(',');

  // Pattern: /image/upload/[existing-transforms/]v1234/...
  // Chèn transforms ngay sau /image/upload/
  const regex = /\/image\/upload\/((?:[a-z]_[^/]+\/)*)/;
  if (regex.test(url)) {
    return url.replace(regex, `/image/upload/${transformStr}/`);
  }

  // Fallback: nếu không match pattern, thử chèn trước phần cuối
  const uploadIdx = url.indexOf('/image/upload/');
  if (uploadIdx !== -1) {
    const prefix = url.substring(0, uploadIdx + '/image/upload/'.length);
    const suffix = url.substring(uploadIdx + '/image/upload/'.length);
    return `${prefix}${transformStr}/${suffix}`;
  }

  return url;
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
