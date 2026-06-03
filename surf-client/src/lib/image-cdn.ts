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
 * Tối ưu URL Firebase Storage khi cài extension Resize Images
 */
function getFirebaseResizedUrl(url: string, width: number): string {
  // Chỉ xử lý link Firebase Storage
  if (!url.includes('firebasestorage.googleapis.com')) return url;

  // Xác định size cần request (phải map với cấu hình extension)
  let sizeSuffix = '';
  if (width <= 400) sizeSuffix = '400x400';
  else if (width <= 800) sizeSuffix = '800x800';
  else sizeSuffix = '1200x1200';

  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split('/');
    const objectPathIndex = pathParts.findIndex((p) => p === 'o');
    if (objectPathIndex === -1) return url;

    const encodedObjectPath = pathParts.slice(objectPathIndex + 1).join('/');
    const objectPath = decodeURIComponent(encodedObjectPath);

    // Bỏ qua nếu đã có suffix
    if (objectPath.match(/_\d+x\d+\.\w+$/)) return url;

    const lastDotIndex = objectPath.lastIndexOf('.');
    if (lastDotIndex === -1) return url;

    const name = objectPath.substring(0, lastDotIndex);
    const ext = objectPath.substring(lastDotIndex);

    // Đổi tên file thêm đuôi size (VD: image_400x400.jpg)
    const newObjectPath = `${name}_${sizeSuffix}${ext}`;
    pathParts.splice(objectPathIndex + 1, pathParts.length - objectPathIndex - 1, encodeURIComponent(newObjectPath));
    parsed.pathname = pathParts.join('/');

    // Xóa token vì file resize sẽ có token khác, ta dùng quyền Public Read
    parsed.searchParams.delete('token');

    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Tối ưu URL ảnh: qua Cloudflare Worker cache hoặc Firebase Resize
 */
export function optimizeImageUrl(url: string | null | undefined, opts: ImageOptions = {}): string {
  if (!url) return '';

  if (url.startsWith('data:')) return url;

  if (CF_WORKER_URL) {
    const params = new URLSearchParams({ url });
    if (opts.width) params.set('w', String(opts.width));
    if (opts.height) params.set('h', String(opts.height));
    if (opts.format) params.set('f', opts.format);
    if (opts.quality) params.set('q', String(opts.quality));
    return `${CF_WORKER_URL}?${params.toString()}`;
  }

  // Bật resize Firebase bằng cách comment out lệnh return url bên dưới
  // Nếu đã cài Firebase Extension (Resize Images) với các size: 400x400,800x800,1200x1200
  if (opts.width) return getFirebaseResizedUrl(url, opts.width);

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
