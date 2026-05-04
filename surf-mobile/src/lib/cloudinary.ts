type CloudinaryUploadResponse = {
  secure_url?: string;
  url?: string;
  error?: { message?: string };
};

type UploadAsset = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
};

const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

function getFileName(asset: UploadAsset, index: number) {
  if (asset.fileName) return asset.fileName;
  const extension = asset.uri.split('.').pop()?.split('?')[0] || 'jpg';
  return `marketplace-${Date.now()}-${index}.${extension}`;
}

function getMimeType(asset: UploadAsset) {
  if (asset.mimeType) return asset.mimeType;
  const extension = asset.uri.split('.').pop()?.toLowerCase().split('?')[0];
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'heic') return 'image/heic';
  return 'image/jpeg';
}

export async function uploadMarketplaceImages(assets: UploadAsset[]) {
  if (assets.length === 0) return [];
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error('Chưa cấu hình Cloudinary cho mobile. Vui lòng thêm EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME và EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET.');
  }

  const uploads = assets.slice(0, 10).map(async (asset, index) => {
    const formData = new FormData();
    formData.append('file', {
      uri: asset.uri,
      name: getFileName(asset, index),
      type: getMimeType(asset),
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
