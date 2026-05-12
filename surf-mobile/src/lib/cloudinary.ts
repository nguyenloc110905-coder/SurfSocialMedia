const CLOUD_NAME =
  process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || 'dg8oqqjes';
const API_KEY =
  process.env.EXPO_PUBLIC_CLOUDINARY_API_KEY || '244888796188991';
const UPLOAD_PRESET =
  process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'Surf_Project2';

type UploadOptions = {
  folder?: string;
};

type UploadableAsset = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  type?: 'image' | 'video' | 'livePhoto' | 'pairedVideo' | null;
};

type CloudinaryUploadResponse = {
  secure_url?: string;
  error?: { message?: string };
};

function endpoint(kind: 'image' | 'video') {
  if (!CLOUD_NAME) throw new Error('Cloudinary cloud name is required');
  return `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${kind}/upload`;
}

function fileNameFor(asset: UploadableAsset, kind: 'image' | 'video') {
  if (asset.fileName) return asset.fileName;
  const extension = kind === 'video' ? 'mp4' : 'jpg';
  return `surf-upload-${Date.now()}.${extension}`;
}

async function uploadAsset(asset: UploadableAsset, kind: 'image' | 'video', options: UploadOptions = {}) {
  if (!API_KEY || !UPLOAD_PRESET) {
    throw new Error('Cloudinary upload config is missing');
  }

  const formData = new FormData();
  formData.append('file', {
    uri: asset.uri,
    name: fileNameFor(asset, kind),
    type: asset.mimeType || (kind === 'video' ? 'video/mp4' : 'image/jpeg'),
  } as unknown as Blob);
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('api_key', API_KEY);
  if (options.folder) formData.append('folder', options.folder);

  const res = await fetch(endpoint(kind), {
    method: 'POST',
    body: formData,
  });
  const data = (await res.json().catch(() => ({}))) as CloudinaryUploadResponse;

  if (!res.ok || data.error || !data.secure_url) {
    throw new Error(data.error?.message || `Cloudinary upload failed (${res.status})`);
  }

  return data.secure_url;
}

export function uploadImage(asset: UploadableAsset, options?: UploadOptions) {
  return uploadAsset(asset, 'image', options);
}

export function uploadVideo(asset: UploadableAsset, options?: UploadOptions) {
  return uploadAsset(asset, 'video', options);
}

export function isVideoAsset(asset: UploadableAsset) {
  return asset.type === 'video' || asset.mimeType?.startsWith('video/');
}
