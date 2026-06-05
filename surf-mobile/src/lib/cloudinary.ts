import { getDownloadURL, getStorage, ref, uploadBytesResumable } from 'firebase/storage';
import { auth } from '@/lib/firebase/auth';
import { app } from '@/lib/firebase/config';

type UploadOptions = {
  folder?: string;
};

type UploadableAsset = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  type?: 'image' | 'video' | 'livePhoto' | 'pairedVideo' | null;
};

function extensionFor(asset: UploadableAsset, fallback: string) {
  const source = asset.fileName || asset.uri;
  const match = source.match(/\.([a-zA-Z0-9]+)(?:\?|#|$)/);
  return (match?.[1] || fallback).toLowerCase();
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function fileNameFor(asset: UploadableAsset, kind: 'image' | 'video' | 'raw') {
  if (asset.fileName) return safeFileName(asset.fileName);
  const extension = extensionFor(asset, kind === 'video' ? 'mp4' : kind === 'raw' ? 'bin' : 'jpg');
  const random = Math.random().toString(36).slice(2, 10);
  return `surf-upload-${Date.now()}-${random}.${extension}`;
}

function mimeTypeFor(asset: UploadableAsset, kind: 'image' | 'video' | 'raw') {
  if (asset.mimeType) return asset.mimeType;
  const extension = extensionFor(asset, kind === 'video' ? 'mp4' : kind === 'raw' ? 'bin' : 'jpg');

  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'gif') return 'image/gif';
  if (extension === 'heic') return 'image/heic';
  if (extension === 'heif') return 'image/heif';
  if (extension === 'mov') return 'video/quicktime';
  if (extension === 'webm') return 'video/webm';
  if (extension === 'm4v') return 'video/x-m4v';
  if (extension === 'mp4') return 'video/mp4';

  if (kind === 'video') return 'video/mp4';
  if (kind === 'raw') return 'application/octet-stream';
  return 'image/jpeg';
}

function storageFolderFor(folder: string | undefined, kind: 'image' | 'video' | 'raw', uid: string) {
  const normalized = (folder || '').replace(/^\/+|\/+$/g, '');

  if (normalized.includes('avatar')) return `avatars/${uid}`;
  if (normalized.includes('clip')) return `videos/${uid}/clips`;
  if (normalized.includes('video')) return kind === 'video' ? `videos/${uid}/uploads` : `posts/${uid}/media`;
  if (normalized.includes('chat')) return `posts/${uid}/chat`;
  if (normalized.includes('moment')) return `posts/${uid}/moments`;
  if (normalized.includes('marketplace')) return `posts/${uid}/marketplace`;
  if (normalized.includes('cover')) return `posts/${uid}/covers`;
  if (normalized.includes('group')) return `posts/${uid}/groups`;
  if (kind === 'video') return `videos/${uid}/uploads`;
  if (kind === 'raw') return `posts/${uid}/files`;
  return `posts/${uid}/media`;
}

async function blobFromUri(uri: string) {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Cannot read selected file (${response.status})`);
  }
  return response.blob();
}

async function uploadAsset(asset: UploadableAsset, kind: 'image' | 'video' | 'raw', options: UploadOptions = {}) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Chua dang nhap');

  const blob = await blobFromUri(asset.uri);
  const storage = getStorage(app);
  const folder = storageFolderFor(options.folder, kind, uid);
  const fileName = fileNameFor(asset, kind);
  const storageRef = ref(storage, `${folder}/${fileName}`);
  const snapshot = await uploadBytesResumable(storageRef, blob, {
    contentType: mimeTypeFor(asset, kind),
  });

  return getDownloadURL(snapshot.ref);
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

export function uploadFile(asset: UploadableAsset, options?: UploadOptions) {
  return uploadRawFile(asset, options);
}

export function isVideoAsset(asset: UploadableAsset) {
  if (asset.type === 'video' || asset.mimeType?.startsWith('video/')) return true;
  const extension = extensionFor(asset, '');
  return ['mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv'].includes(extension);
}

export async function uploadMarketplaceImages(assets: UploadableAsset[]) {
  return Promise.all(
    assets.slice(0, 10).map((asset) => uploadImage(asset, { folder: 'surf/marketplace' }))
  );
}
