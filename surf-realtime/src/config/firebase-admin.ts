import admin from 'firebase-admin';
import path from 'path';

let authInstance: admin.auth.Auth | null = null;
let dbInstance: admin.firestore.Firestore | null = null;

const initFirebaseAdmin = () => {
  if (admin.apps.length > 0) {
    authInstance = admin.auth();
    dbInstance = admin.firestore();
    return;
  }

  const credentialsJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const credentialsPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  if (credentialsJson) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(credentialsJson)),
    });
    authInstance = admin.auth();
    dbInstance = admin.firestore();
    return;
  }

  if (credentialsPath) {
    const resolved = path.isAbsolute(credentialsPath)
      ? credentialsPath
      : path.resolve(process.cwd(), credentialsPath);
    admin.initializeApp({
      credential: admin.credential.cert(resolved),
    });
    authInstance = admin.auth();
    dbInstance = admin.firestore();
    return;
  }

  throw new Error(
    'Missing Firebase Admin credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH.',
  );
};

const ensureInit = () => {
  initFirebaseAdmin();
  if (!authInstance || !dbInstance) {
    throw new Error('Firebase Admin initialization failed.');
  }
};

export const getAuth = () => {
  ensureInit();
  return authInstance!;
};

export const getDb = () => {
  ensureInit();
  return dbInstance!;
};
