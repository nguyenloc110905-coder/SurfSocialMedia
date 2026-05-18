/**
 * Upload ảnh lên Cloudinary từ trình duyệt (unsigned upload).
 * Hỗ trợ round-robin qua nhiều tài khoản để bypass limit bản free.
 */

import {
  CLOUDINARY_CLOUD_NAME as CONFIG_CLOUD_NAME,
  CLOUDINARY_API_KEY as CONFIG_API_KEY,
  CLOUDINARY_UPLOAD_PRESET as CONFIG_UPLOAD_PRESET,
  CLOUDINARY_ACCOUNTS,
} from './cloudinary-config';

declare global {
  interface Window {
    __CLOUDINARY_CONFIG__?: { cloudName?: string; apiKey?: string; uploadPreset?: string };
  }
}

function getRandomConfig() {
  // Lấy danh sách hợp lệ
  const validAccounts = CLOUDINARY_ACCOUNTS?.filter(acc => acc.cloudName && acc.apiKey && acc.uploadPreset);
  if (validAccounts && validAccounts.length > 0) {
    const randomIndex = Math.floor(Math.random() * validAccounts.length);
    const selected = validAccounts[randomIndex];
    console.log('[Cloudinary LoadBalancer] Đang upload qua tài khoản:', selected.cloudName);
    return selected;
  }

  // Fallback
  const w = typeof window !== 'undefined' ? window.__CLOUDINARY_CONFIG__ : undefined;
  return {
    cloudName:
      CONFIG_CLOUD_NAME ||
      w?.cloudName ||
      (import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined),
    apiKey:
      CONFIG_API_KEY ||
      w?.apiKey ||
      (import.meta.env.VITE_CLOUDINARY_API_KEY as string | undefined),
    uploadPreset:
      CONFIG_UPLOAD_PRESET ||
      w?.uploadPreset ||
      (import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined),
  };
}

export type UploadOptions = {
  folder?: string;
  publicId?: string;
};

interface CloudinaryUploadResponse {
  secure_url: string;
  public_id: string;
  error?: { message: string };
}

/**
 * Upload một file hoặc blob lên Cloudinary, trả về secure_url.
 */
export async function uploadImage(file: File | Blob, options: UploadOptions = {}): Promise<string> {
  const conf = getRandomConfig();
  if (!conf.apiKey || !conf.uploadPreset || !conf.cloudName) {
    throw new Error('Cloudinary config is missing');
  }

  const UPLOAD_URL = `https://api.cloudinary.com/v1_1/${conf.cloudName}/image/upload`;
  const formData = new FormData();
  if (file instanceof File) {
    formData.append('file', file);
  } else {
    formData.append('file', file, 'image.jpg');
  }
  formData.append('upload_preset', conf.uploadPreset);
  formData.append('api_key', conf.apiKey);
  if (options.folder) formData.append('folder', options.folder);
  if (options.publicId) formData.append('public_id', options.publicId);

  const res = await fetch(UPLOAD_URL, {
    method: 'POST',
    body: formData,
  });

  let data: CloudinaryUploadResponse & { error?: { message: string } };
  try {
    data = (await res.json()) as CloudinaryUploadResponse & { error?: { message: string } };
  } catch {
    throw new Error(`Cloudinary: invalid response (${res.status})`);
  }

  if (!res.ok) {
    const msg = data?.error?.message ?? data?.error ?? JSON.stringify(data);
    throw new Error(`Cloudinary ${res.status}: ${msg}`);
  }
  if (data.error) {
    throw new Error(data.error.message || 'Cloudinary upload failed');
  }
  if (!data.secure_url) {
    throw new Error('No URL returned from Cloudinary');
  }
  return data.secure_url;
}

/**
 * Upload tệp (pdf/doc/xlsx/zip/...) lên Cloudinary raw endpoint, trả về secure_url.
 */
export async function uploadFile(file: File | Blob, options: UploadOptions = {}): Promise<string> {
  const conf = getRandomConfig();
  if (!conf.apiKey || !conf.uploadPreset || !conf.cloudName) {
    throw new Error('Cloudinary config is missing');
  }

  const RAW_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${conf.cloudName}/raw/upload`;
  const formData = new FormData();
  if (file instanceof File) {
    formData.append('file', file);
  } else {
    formData.append('file', file, 'file.bin');
  }
  formData.append('upload_preset', conf.uploadPreset);
  formData.append('api_key', conf.apiKey);
  if (options.folder) formData.append('folder', options.folder);
  if (options.publicId) formData.append('public_id', options.publicId);

  const res = await fetch(RAW_UPLOAD_URL, {
    method: 'POST',
    body: formData,
  });

  let data: CloudinaryUploadResponse & { error?: { message: string } };
  try {
    data = (await res.json()) as CloudinaryUploadResponse & { error?: { message: string } };
  } catch {
    throw new Error(`Cloudinary: invalid response (${res.status})`);
  }

  if (!res.ok) {
    const msg = data?.error?.message ?? data?.error ?? JSON.stringify(data);
    throw new Error(`Cloudinary ${res.status}: ${msg}`);
  }
  if (data.error) {
    throw new Error(data.error.message || 'Cloudinary upload failed');
  }
  if (!data.secure_url) {
    throw new Error('No URL returned from Cloudinary');
  }
  return data.secure_url;
}

/**
 * Upload một file video lên Cloudinary, trả về secure_url.
 */
export async function uploadVideo(file: File, options: UploadOptions = {}): Promise<string> {
  const conf = getRandomConfig();
  if (!conf.apiKey || !conf.uploadPreset || !conf.cloudName) {
    throw new Error('Cloudinary config is missing');
  }

  const VIDEO_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${conf.cloudName}/video/upload`;
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', conf.uploadPreset);
  formData.append('api_key', conf.apiKey);
  if (options.folder) formData.append('folder', options.folder);
  if (options.publicId) formData.append('public_id', options.publicId);

  const res = await fetch(VIDEO_UPLOAD_URL, { method: 'POST', body: formData });

  let data: CloudinaryUploadResponse & { error?: { message: string } };
  try {
    data = (await res.json()) as CloudinaryUploadResponse & { error?: { message: string } };
  } catch {
    throw new Error(`Cloudinary: invalid response (${res.status})`);
  }

  if (!res.ok) {
    const msg = data?.error?.message ?? JSON.stringify(data);
    throw new Error(`Cloudinary ${res.status}: ${msg}`);
  }
  if (data.error) throw new Error(data.error.message || 'Cloudinary video upload failed');
  if (!data.secure_url) throw new Error('No URL returned from Cloudinary');
  return data.secure_url;
}

/** Trả về true nếu URL là video Cloudinary hoặc có đuôi video */
export function isVideoUrl(url: string): boolean {
  if (!url) return false;
  if (url.includes('/video/upload/')) return true;
  return /\.(mp4|webm|mov|avi|mkv|ogv)(\?|$)/i.test(url);
}
