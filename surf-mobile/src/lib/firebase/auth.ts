import {
  initializeAuth,
  getAuth,
  // @ts-ignore — chỉ available trong React Native bundler, không thấy trong Node
  getReactNativePersistence,
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { app } from './config';

// initializeAuth một lần, fallback getAuth nếu đã init rồi
let auth: ReturnType<typeof getAuth>;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  auth = getAuth(app);
}
export { auth };

/**
 * Set Firebase persistence.
 * On React Native, persistence is always enabled via AsyncStorage by default.
 * This is for compatibility with web-like API.
 */
export async function setAuthPersistence(rememberMe: boolean): Promise<void> {
  // On React Native, persistence is automatic via AsyncStorage
  // This function exists for API compatibility with surf-client
  if (rememberMe) {
    // When Remember me is true, we let AsyncStorage handle persistence
    await AsyncStorage.setItem('firebase_persist_mode', 'local');
  } else {
    // When unchecked, clear future persistence (for next login)
    await AsyncStorage.removeItem('firebase_persist_mode');
  }
}

export async function signIn(email: string, password: string) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result;
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
  // Google Sign-In trên mobile cần native SDK (expo-auth-session hoặc @react-native-google-signin)
  // Tạm thời throw lỗi thân thiện để tránh crash
  throw new Error('Đăng nhập Google sẽ được hỗ trợ sớm trên mobile.');
}

export async function signInWithGoogleCredential(idToken: string) {
  const credential = GoogleAuthProvider.credential(idToken);
  return signInWithCredential(auth, credential);
}

export function sendPasswordResetEmail(email: string, actionCodeSettings?: any) {
  return fbSendPasswordResetEmail(auth, email, actionCodeSettings);
}

export async function signOut() {
  return fbSignOut(auth);
}

export function subscribeAuth(callback: (user: User | null) => void) {
  console.log('🎧 subscribeAuth: Setting up onAuthStateChanged listener');
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    console.log(`📡 onAuthStateChanged fired: user=${user ? user.email : 'null'}`);
    callback(user);
  });
  console.log('✅ subscribeAuth: onAuthStateChanged listener registered');
  return unsubscribe;
}

export async function updateUserProfile(updates: { displayName?: string; photoURL?: string }) {
  const u = auth.currentUser;
  if (!u) throw new Error('Chưa đăng nhập');
  await updateProfile(u, updates);
}

export type { User };
