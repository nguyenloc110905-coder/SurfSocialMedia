/**
 * Upload ảnh và video lên Firebase Storage (thay thế cho Cloudinary).
 */
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { app } from './firebase/config';

async function compressImageClient(file: File | Blob, maxWidth = 1080): Promise<Blob> {
  // Bỏ qua nếu không phải là môi trường trình duyệt
  if (typeof window === 'undefined') return file;
  
  // Nếu là file gif thì không nén vì sẽ mất hiệu ứng
  if (file instanceof File && file.type === 'image/gif') return file;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(file);
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else resolve(file);
        },
        'image/jpeg',
        0.8
      );
    };
    img.onerror = () => resolve(file); // fallback
  });
}

export type UploadOptions = {
  folder?: string;
  publicId?: string;
};

function generateFileName(file: File | Blob, prefix: string = 'file'): string {
  const ext = file instanceof File ? file.name.split('.').pop() : 'bin';
  const randomStr = Math.random().toString(36).substring(2, 10);
  return `${prefix}_${Date.now()}_${randomStr}.${ext}`;
}

/**
 * Upload một file hoặc blob lên Firebase Storage, trả về secure_url.
 */
export async function uploadImage(file: File | Blob, options: UploadOptions = {}): Promise<string> {
  const storage = getStorage(app);
  const folder = options.folder ? `${options.folder}/` : 'surf/images/';
  const filename = options.publicId ? `${options.publicId}.jpg` : generateFileName(file, 'img');
  
  // Nén ảnh trước khi upload để tăng tốc độ
  const compressedBlob = await compressImageClient(file);
  
  const storageRef = ref(storage, `${folder}${filename}`);
  const snapshot = await uploadBytesResumable(storageRef, compressedBlob);
  return await getDownloadURL(snapshot.ref);
}

/**
 * Upload tệp raw lên Firebase Storage.
 */
export async function uploadFile(file: File | Blob, options: UploadOptions = {}): Promise<string> {
  const storage = getStorage(app);
  const folder = options.folder ? `${options.folder}/` : 'surf/raw/';
  const filename = options.publicId ? `${options.publicId}.bin` : generateFileName(file, 'raw');
  
  const storageRef = ref(storage, `${folder}${filename}`);
  const snapshot = await uploadBytesResumable(storageRef, file);
  return await getDownloadURL(snapshot.ref);
}

/**
 * Upload một file video lên Firebase Storage, trả về secure_url.
 */
export async function uploadVideo(file: File, options: UploadOptions = {}): Promise<string> {
  const storage = getStorage(app);
  const folder = options.folder ? `${options.folder}/` : 'surf/videos/';
  const filename = options.publicId ? `${options.publicId}.mp4` : generateFileName(file, 'vid');
  
  const storageRef = ref(storage, `${folder}${filename}`);
  const snapshot = await uploadBytesResumable(storageRef, file);
  return await getDownloadURL(snapshot.ref);
}

/** Trả về true nếu URL là video (bao gồm cả Cloudinary cũ hoặc Firebase) */
export function isVideoUrl(url: string): boolean {
  if (!url) return false;
  if (url.includes('/video/upload/') || url.includes('/surf%2Fvideos%2F') || url.includes('/surf/videos/')) return true;
  return /\.(mp4|webm|mov|avi|mkv|ogv)(\?|$)/i.test(url);
}

