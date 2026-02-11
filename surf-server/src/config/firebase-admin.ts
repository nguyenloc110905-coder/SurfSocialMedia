import admin from 'firebase-admin';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _auth: admin.auth.Auth | null = null;
let _db: admin.firestore.Firestore | null = null;

function initFirebaseAdmin() {
  if (admin.apps.length > 0) {
    _auth = admin.auth();
    _db = admin.firestore();
    return;
  }

  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  if (json) {
    const credentials = JSON.parse(json);
    admin.initializeApp({ credential: admin.credential.cert(credentials) });
    _auth = admin.auth();
    _db = admin.firestore();
    return;
  }

  if (keyPath) {
    const resolved = path.isAbsolute(keyPath) ? keyPath : path.resolve(process.cwd(), keyPath);
    admin.initializeApp({ credential: admin.credential.cert(resolved) });
    _auth = admin.auth();
    _db = admin.firestore();
    return;
  }

  // Chưa cấu hình Firebase → server vẫn chạy, API sẽ báo lỗi khi gọi
}

function ensureInit() {
  initFirebaseAdmin();
  if (!_auth || !_db) {
    throw new Error('Firebase chưa cấu hình. Đặt FIREBASE_SERVICE_ACCOUNT_JSON hoặc FIREBASE_SERVICE_ACCOUNT_PATH trong .env');
  }
}

export function getAuth() {
  ensureInit();
  return _auth!;
}

export function getDb() {
  ensureInit();
  return _db!;
}

export { admin };
