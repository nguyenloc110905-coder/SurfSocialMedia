import { uploadImage } from '@/lib/cloudinary';

export type UploadPath = 'avatar' | 'cover' | 'highlight';

/**
 * Upload ảnh profile lên Cloudinary, trả về URL.
 * Dùng public_id duy nhất mỗi lần (avatar_ts, cover_ts, highlight_ts) vì preset Unsigned không cho overwrite.
 * Folder: users/{uid}.
 */
export async function uploadProfileImage(
  uid: string,
  file: File | Blob,
  type: UploadPath,
  highlightIndex?: number
): Promise<string> {
  const folder = `users/${uid}`;
  const ts = highlightIndex ?? Date.now();
  const publicId =
    type === 'highlight' ? `highlight_${ts}` : `${type}_${ts}`;
  return uploadImage(file, { folder, publicId });
}
