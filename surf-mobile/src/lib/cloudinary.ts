import { getDownloadURL, getStorage, ref, uploadBytesResumable } from 'firebase/storage';
import { app } from './firebase/config';

type UploadOptions = {
  folder?: string;
};

type UploadableAsset = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  type?: 'image' | 'video' | 'livePhoto' | 'pairedVideo' | null;
  width?: number | null;
  height?: number | null;
};

type UploadKind = 'image' | 'video' | 'raw' | 'market';

function extensionFor(asset: UploadableAsset, kind: UploadKind) {
  const fromName = asset.fileName?.split('.').pop();
  const fromUri = asset.uri.split('?')[0].split('.').pop();
  const extension = (fromName || fromUri || '').toLowerCase();
  if (extension && extension.length <= 5) return extension;
  if (kind === 'video') return 'mp4';
  if (kind === 'raw') return 'bin';
  return 'jpg';
}

function defaultMimeType(kind: UploadKind) {
  if (kind === 'video') return 'video/mp4';
  if (kind === 'raw') return 'application/octet-stream';
  return 'image/jpeg';
}

function normalizeFolder(folder: string) {
  return folder.replace(/^\/+|\/+$/g, '');
}

function storageFolder(kind: UploadKind, options: UploadOptions) {
  if (options.folder) return normalizeFolder(options.folder);
  if (kind === 'market') return 'surf/marketplace';
  if (kind === 'raw') return 'surf/files';
  return `surf/${kind}s`;
}

function generateFileName(asset: UploadableAsset, kind: UploadKind, index?: number) {
  if (asset.fileName) return asset.fileName;
  const ts = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const prefix = kind === 'market' ? `marketplace-${index ?? 0}` : `surf-${kind}`;
  return `${prefix}-${ts}-${randomStr}.${extensionFor(asset, kind)}`;
}

async function uploadAsset(asset: UploadableAsset, kind: UploadKind, options: UploadOptions = {}, index?: number) {
  const response = await fetch(asset.uri);
  const blob = await response.blob();

  const storage = getStorage(app);
  const filename = generateFileName(asset, kind, index);
  const storageRef = ref(storage, `${storageFolder(kind, options)}/${filename}`);
  const snapshot = await uploadBytesResumable(storageRef, blob, {
    contentType: asset.mimeType || blob.type || defaultMimeType(kind),
    customMetadata: {
      source: 'surf-mobile',
      mediaType: kind,
      ...(asset.width ? { width: String(Math.round(asset.width)) } : {}),
      ...(asset.height ? { height: String(Math.round(asset.height)) } : {}),
    },
  });

  return getDownloadURL(snapshot.ref);
}

export function uploadImage(asset: UploadableAsset, options?: UploadOptions) {
  return uploadAsset(asset, 'image', options);
}

export function uploadVideo(asset: UploadableAsset, options?: UploadOptions) {
  return uploadAsset(asset, 'video', options);
}

export function uploadFile(asset: UploadableAsset, options?: UploadOptions) {
  return uploadAsset(asset, 'raw', options);
}

export function isVideoAsset(asset: UploadableAsset) {
  return asset.type === 'video' || asset.mimeType?.startsWith('video/');
}

export async function uploadMarketplaceImages(assets: UploadableAsset[]) {
  const uploads = assets.slice(0, 10).map((asset, index) =>
    uploadAsset(asset, 'market', { folder: 'surf/marketplace' }, index)
  );
  return Promise.all(uploads);
}
