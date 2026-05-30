import {
  initializeAuth,
  getAuth,
  // @ts-ignore - available in the React Native Firebase Auth bundle.
  getReactNativePersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail as fbSendPasswordResetEmail,
  signOut as fbSignOut,
  onAuthStateChanged,
  updateProfile,
  GoogleAuthProvider,
  EmailAuthProvider,
  reauthenticateWithCredential,
  signInWithCredential,
  User,
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { app } from './config';

export const AUTH_PERSIST_MODE_KEY = 'firebase_persist_mode';
export type AuthPersistMode = 'local' | 'session';

let auth: ReturnType<typeof getAuth>;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  auth = getAuth(app);
}
export { auth };

export async function setAuthPersistence(rememberMe: boolean): Promise<void> {
  // React Native Firebase Auth uses durable AsyncStorage persistence.
  // Store the user's preference so bootstrap can decide whether to restore
  // the first hydrated Firebase user or treat it as a one-session login.
  await AsyncStorage.setItem(AUTH_PERSIST_MODE_KEY, rememberMe ? 'local' : 'session');
}

export async function getAuthPersistMode(): Promise<AuthPersistMode | null> {
  const mode = await AsyncStorage.getItem(AUTH_PERSIST_MODE_KEY);
  return mode === 'local' || mode === 'session' ? mode : null;
}

export async function clearAuthPersistencePreference(): Promise<void> {
  await AsyncStorage.removeItem(AUTH_PERSIST_MODE_KEY);
}

export async function signIn(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function getCurrentUser() {
  return auth.currentUser;
}

export async function signUp(email: string, password: string, displayName?: string) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName && cred.user) {
    await updateProfile(cred.user, { displayName });
  }
  return cred;
}

export async function signInWithGoogle() {
  throw new Error('Đăng nhập Google sẽ được hỗ trợ sớm trên mobile.');
}

export async function signInWithGoogleCredential(idToken: string) {
  const credential = GoogleAuthProvider.credential(idToken);
  return signInWithCredential(auth, credential);
}

export function sendPasswordResetEmail(email: string, actionCodeSettings?: any) {
  return fbSendPasswordResetEmail(auth, email, actionCodeSettings);
}

export async function reauthenticate(password: string) {
  const u = auth.currentUser;
  if (!u?.email) throw new Error('Chưa đăng nhập');
  const credential = EmailAuthProvider.credential(u.email, password);
  return reauthenticateWithCredential(u, credential);
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
