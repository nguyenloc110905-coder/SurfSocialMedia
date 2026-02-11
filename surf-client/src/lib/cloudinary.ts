/**
 * Upload ảnh lên Cloudinary từ trình duyệt (unsigned upload).
 * Ưu tiên: 1) cloudinary-config.ts  2) window.__CLOUDINARY_CONFIG__  3) import.meta.env
 */

import {
  CLOUDINARY_CLOUD_NAME as CONFIG_CLOUD_NAME,
  CLOUDINARY_API_KEY as CONFIG_API_KEY,
  CLOUDINARY_UPLOAD_PRESET as CONFIG_UPLOAD_PRESET,
} from './cloudinary-config';

declare global {
  interface Window {
    __CLOUDINARY_CONFIG__?: { cloudName?: string; apiKey?: string; uploadPreset?: string };
  }
}

function getConfig() {
  const w = typeof window !== 'undefined' ? window.__CLOUDINARY_CONFIG__ : undefined;
  return {
    cloudName: CONFIG_CLOUD_NAME || w?.cloudName || (import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined),
    apiKey: CONFIG_API_KEY || w?.apiKey || (import.meta.env.VITE_CLOUDINARY_API_KEY as string | undefined),
    uploadPreset: CONFIG_UPLOAD_PRESET || w?.uploadPreset || (import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined),
  };
}

const CLOUD_NAME = getConfig().cloudName;
const API_KEY = getConfig().apiKey;
const UPLOAD_PRESET = getConfig().uploadPreset;

if (import.meta.env.DEV) {
  const ok = !!(CLOUD_NAME && API_KEY && UPLOAD_PRESET);
  console.log(ok ? '[Cloudinary] env OK' : '[Cloudinary] env thiếu: cloud_name=' + !!CLOUD_NAME + ', api_key=' + !!API_KEY + ', preset=' + !!UPLOAD_PRESET);
}

const UPLOAD_URL = () => {
  if (!CLOUD_NAME) throw new Error('VITE_CLOUDINARY_CLOUD_NAME is required');
  return `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
};

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
export async function uploadImage(
  file: File | Blob,
  options: UploadOptions = {}
): Promise<string> {
  if (!API_KEY || !UPLOAD_PRESET) {
    throw new Error('VITE_CLOUDINARY_API_KEY and VITE_CLOUDINARY_UPLOAD_PRESET are required');
  }

  const formData = new FormData();
  if (file instanceof File) {
    formData.append('file', file);
  } else {
    formData.append('file', file, 'image.jpg');
  }
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('api_key', API_KEY);
  if (options.folder) formData.append('folder', options.folder);
  if (options.publicId) formData.append('public_id', options.publicId);

  const res = await fetch(UPLOAD_URL(), {
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
