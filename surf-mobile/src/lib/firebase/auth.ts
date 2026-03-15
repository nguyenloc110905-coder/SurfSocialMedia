import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail as fbSendPasswordResetEmail,
  signOut as fbSignOut,
  onAuthStateChanged,
  updateProfile,
  GoogleAuthProvider,
  signInWithCredential,
  User,
} from 'firebase/auth';
import { app } from './config';

export const auth = getAuth(app);

export async function signIn(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signUp(email: string, password: string, displayName?: string) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName && cred.user) {
    await updateProfile(cred.user, { displayName });
  }
  return cred;
}

export async function signInWithGoogle() {
  // Google Sign-In trên mobile cần native SDK (expo-auth-session hoặc @react-native-google-signin)
  // Tạm thời throw lỗi thân thiện để tránh crash
  throw new Error('Đăng nhập Google sẽ được hỗ trợ sớm trên mobile.');
}

export async function signInWithGoogleCredential(idToken: string) {
  const credential = GoogleAuthProvider.credential(idToken);
  return signInWithCredential(auth, credential);
}

export function sendPasswordResetEmail(email: string) {
  return fbSendPasswordResetEmail(auth, email);
}

export async function signOut() {
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
