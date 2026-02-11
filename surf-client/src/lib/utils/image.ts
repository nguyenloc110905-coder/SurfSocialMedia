/**
 * Resize và nén ảnh (canvas) để upload nhanh hơn.
 * Trả về Blob dạng image/jpeg.
 */
export function resizeImage(
  file: File,
  maxWidth: number,
  maxHeight: number,
  quality = 0.85
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = document.createElement('img');
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width <= maxWidth && height <= maxHeight) {
        width = img.naturalWidth;
        height = img.naturalHeight;
      } else {
        const r = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * r);
        height = Math.round(height * r);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas not supported'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

/** Avatar: tối đa 512px, nén 0.85 */
export function resizeAvatar(file: File): Promise<Blob> {
  return resizeImage(file, 512, 512, 0.85);
}

/** Ảnh bìa: tối đa 1200px cạnh dài, nén 0.85 */
export function resizeCover(file: File): Promise<Blob> {
  return resizeImage(file, 1200, 630, 0.85);
}
