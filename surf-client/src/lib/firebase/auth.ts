import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  FacebookAuthProvider,
  sendPasswordResetEmail as fbSendPasswordResetEmail,
  signOut as fbSignOut,
  onAuthStateChanged,
  updateProfile,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  fetchSignInMethodsForEmail,
  User,
} from 'firebase/auth';
import { app } from './config';

export const auth = getAuth(app);

export async function setAuthPersistence(rememberMe: boolean) {
  await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
}

export async function signIn(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signUp(email: string, password: string, displayName?: string) {
  // Kiểm tra email đã được dùng bởi tài khoản khác (VD: Google) chưa
  const methods = await fetchSignInMethodsForEmail(auth, email);
  if (methods.length > 0) {
    const error = new Error('Email này đã được sử dụng.') as Error & { code: string };
    error.code = 'auth/email-already-in-use';
    throw error;
  }
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName && cred.user) await updateProfile(cred.user, { displayName });
  return cred;
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(auth, provider);
}

export async function signInWithFacebook() {
  const provider = new FacebookAuthProvider();
  return signInWithRedirect(auth, provider);
}

export function getFacebookRedirectResult() {
  return getRedirectResult(auth);
}

export function sendPasswordResetEmail(email: string) {
  return fbSendPasswordResetEmail(auth, email);
}

export async function signOut() {
  // Chuyển sang session persistence để xóa token đã lưu trong localStorage
  await setPersistence(auth, browserSessionPersistence);
  return fbSignOut(auth);
}

export function subscribeAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export async function updateUserProfile(updates: { displayName?: string; photoURL?: string }) {
  const u = auth.currentUser;
  if (!u) throw new Error('Chưa đăng nhập');
  await updateProfile(u, updates);
}

export type { User };
