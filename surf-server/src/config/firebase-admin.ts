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
    console.log('✅ Firebase Admin already initialized');
    return;
  }

  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  try {
    if (json) {
      console.log('🔑 Initializing Firebase Admin from FIREBASE_SERVICE_ACCOUNT_JSON...');
      const credentials = JSON.parse(json);
      admin.initializeApp({ credential: admin.credential.cert(credentials) });
      _auth = admin.auth();
      _db = admin.firestore();
      console.log('✅ Firebase Admin initialized successfully (from env var)');
      return;
    }

    if (keyPath) {
      console.log('🔑 Initializing Firebase Admin from FIREBASE_SERVICE_ACCOUNT_PATH...');
      const resolved = path.isAbsolute(keyPath) ? keyPath : path.resolve(process.cwd(), keyPath);
      admin.initializeApp({ credential: admin.credential.cert(resolved) });
      _auth = admin.auth();
      _db = admin.firestore();
      console.log('✅ Firebase Admin initialized successfully (from file path)');
      return;
    }

    // Fallback: Try default serviceAccountKey.json
    const defaultPath = path.resolve(__dirname, '../../serviceAccountKey.json');
    console.log('🔑 Trying default path:', defaultPath);
    admin.initializeApp({ credential: admin.credential.cert(defaultPath) });
    _auth = admin.auth();
    _db = admin.firestore();
    console.log('✅ Firebase Admin initialized successfully (from default path)');
  } catch (error) {
    console.error('❌ CRITICAL: Failed to initialize Firebase Admin SDK!');
    console.error('Error:', error);
    console.error('\n💡 Please set one of these environment variables:');
    console.error('   - FIREBASE_SERVICE_ACCOUNT_JSON (minified JSON string)');
    console.error('   - FIREBASE_SERVICE_ACCOUNT_PATH (path to serviceAccountKey.json)');
    throw new Error('Firebase Admin SDK initialization failed. Server cannot start without valid credentials.');
  }
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
