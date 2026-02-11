import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  updateProfile,
  User,
} from 'firebase/auth';
import { app } from './config';

export const auth = getAuth(app);

export async function signIn(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signUp(email: string, password: string, displayName?: string) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName && cred.user) await updateProfile(cred.user, { displayName });
  return cred;
}

export function signOut() {
  return fbSignOut(auth);
}

export function subscribeAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export type { User };
