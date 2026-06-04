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
  url?: string;
  error?: { message?: string };
};

function endpoint(kind: 'image' | 'video' | 'raw') {
  if (!CLOUD_NAME) throw new Error('Cloudinary cloud name is required');
  const resourceType = kind === 'video' ? 'auto' : kind;
  return `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`;
}

function fileNameFor(asset: UploadableAsset, kind: 'image' | 'video' | 'raw') {
  if (asset.fileName) return asset.fileName;
  const extension = kind === 'video' ? 'mp4' : kind === 'raw' ? 'bin' : 'jpg';
  return `surf-upload-${Date.now()}.${extension}`;
}

async function uploadAsset(asset: UploadableAsset, kind: 'image' | 'video' | 'raw', options: UploadOptions = {}) {
  if (!API_KEY || !UPLOAD_PRESET) {
    throw new Error('Cloudinary upload config is missing');
  }

  const formData = new FormData();
  formData.append('file', {
    uri: asset.uri,
    name: fileNameFor(asset, kind),
    type: asset.mimeType || (kind === 'video' ? 'video/mp4' : kind === 'raw' ? 'application/octet-stream' : 'image/jpeg'),
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
    if (res.status === 413) {
      throw new Error('Video vượt giới hạn upload trực tiếp 100MB của Cloudinary.');
    }
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

export function uploadRawFile(asset: UploadableAsset, options?: UploadOptions) {
  return uploadAsset(asset, 'raw', options);
}

export function isVideoAsset(asset: UploadableAsset) {
  return asset.type === 'video' || asset.mimeType?.startsWith('video/');
}

function getMarketplaceFileName(asset: UploadableAsset, index: number) {
  if (asset.fileName) return asset.fileName;
  const extension = asset.uri.split('.').pop()?.split('?')[0] || 'jpg';
  return `marketplace-${Date.now()}-${index}.${extension}`;
}

function getMarketplaceMimeType(asset: UploadableAsset) {
  if (asset.mimeType) return asset.mimeType;
  const extension = asset.uri.split('.').pop()?.toLowerCase().split('?')[0];
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'heic') return 'image/heic';
  return 'image/jpeg';
}

export async function uploadMarketplaceImages(assets: UploadableAsset[]) {
  if (assets.length === 0) return [];
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error('Chưa cấu hình Cloudinary cho mobile. Vui lòng thêm EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME và EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET.');
  }

  const uploads = assets.slice(0, 10).map(async (asset, index) => {
    const formData = new FormData();
    formData.append('file', {
      uri: asset.uri,
      name: getMarketplaceFileName(asset, index),
      type: getMarketplaceMimeType(asset),
    } as unknown as Blob);
    formData.append('upload_preset', UPLOAD_PRESET);
    formData.append('folder', 'surf/marketplace');

    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
      method: 'POST',
      body: formData,
    });
    const text = await response.text();
    let data: CloudinaryUploadResponse = {};
    if (text) {
      try {
        data = JSON.parse(text) as CloudinaryUploadResponse;
      } catch {
        data = { error: { message: text } };
      }
    }

    if (!response.ok || (!data.secure_url && !data.url)) {
      throw new Error(data.error?.message ?? 'Không thể tải ảnh sản phẩm lên Cloudinary.');
    }

    return data.secure_url ?? data.url!;
  });

  return Promise.all(uploads);
}
