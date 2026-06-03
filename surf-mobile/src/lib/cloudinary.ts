import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { app } from './firebase/config';

type UploadOptions = {
  folder?: string;
};

type UploadableAsset = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  type?: 'image' | 'video' | 'livePhoto' | 'pairedVideo' | null;
};

function generateFileName(asset: UploadableAsset, kind: 'image' | 'video' | 'market', index?: number) {
  if (asset.fileName) return asset.fileName;
  const extension = kind === 'video' ? 'mp4' : 'jpg';
  const ts = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  if (kind === 'market') return `marketplace-${ts}-${index}-${randomStr}.${extension}`;
  return `surf-upload-${ts}-${randomStr}.${extension}`;
}

async function uploadAsset(asset: UploadableAsset, kind: 'image' | 'video', options: UploadOptions = {}) {
  const storage = getStorage(app);
  const folder = options.folder ? `${options.folder}/` : `surf/${kind}s/`;
  const filename = generateFileName(asset, kind);
  const storageRef = ref(storage, `${folder}${filename}`);

  // Chuyển local URI thành Blob để upload
  const response = await fetch(asset.uri);
  const blob = await response.blob();

  const snapshot = await uploadBytesResumable(storageRef, blob);
  return await getDownloadURL(snapshot.ref);
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

export async function uploadMarketplaceImages(assets: UploadableAsset[]) {
  if (assets.length === 0) return [];
  
  const storage = getStorage(app);
  
  const uploads = assets.slice(0, 10).map(async (asset, index) => {
    const filename = generateFileName(asset, 'market', index);
    const storageRef = ref(storage, `surf/marketplace/${filename}`);

    const response = await fetch(asset.uri);
    const blob = await response.blob();

    const snapshot = await uploadBytesResumable(storageRef, blob);
    return await getDownloadURL(snapshot.ref);
  });

  return Promise.all(uploads);
}
