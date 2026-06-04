import { getDownloadURL, getStorage, ref, uploadBytesResumable } from 'firebase/storage';
import { app } from './firebase/config';
import { uploadAsync } from 'expo-file-system/src/legacy/FileSystem';
import { getAuth } from 'firebase/auth';

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
  const storage = getStorage(app);
  const filename = generateFileName(asset, kind, index);
  const path = `${storageFolder(kind, options)}/${filename}`;
  const contentType = asset.mimeType || defaultMimeType(kind);

  if (asset.uri.startsWith('file://')) {
    const bucket = storage.app.options.storageBucket;
    if (!bucket) throw new Error('Firebase Storage bucket not configured');
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?name=${encodeURIComponent(path)}`;
    
    const auth = getAuth(app);
    let token: string | undefined;
    if (auth.currentUser) {
      try { token = await auth.currentUser.getIdToken(); } catch {}
    }

    const response = await uploadAsync(url, asset.uri, {
      httpMethod: 'POST',
      uploadType: 0, // BINARY_CONTENT
      headers: {
        'Content-Type': contentType,
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });

    if (response.status !== 200) {
      throw new Error(`Upload failed with status ${response.status}: ${response.body}`);
    }

    const storageRef = ref(storage, path);
    return getDownloadURL(storageRef);
  }

  const blob: Blob = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onreadystatechange = () => {
      if (xhr.readyState === 4) {
        if (xhr.status === 200 || xhr.status === 0) {
          resolve(xhr.response as Blob);
        } else {
          reject(new Error(`XHR failed with status ${xhr.status}`));
        }
      }
    };
    xhr.onerror = () => reject(new Error('Failed to create blob from uri'));
    xhr.responseType = 'blob';
    xhr.open('GET', asset.uri, true);
    xhr.send(null);
  });

  const storageRef = ref(storage, path);
  const snapshot = await uploadBytesResumable(storageRef, blob, {
    contentType: asset.mimeType || blob.type || contentType,
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
