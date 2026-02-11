import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAnalytics, Analytics } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0] as FirebaseApp;
}

export { app };

// Analytics chỉ chạy trên browser (tránh lỗi khi build/SSR)
export function getAnalyticsSafe(): Analytics | null {
  if (typeof window === 'undefined') return null;
  try {
    return getAnalytics(app);
  } catch {
    return null;
  }
}
