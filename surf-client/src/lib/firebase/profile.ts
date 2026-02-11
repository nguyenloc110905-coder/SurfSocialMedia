import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore';
import { app } from './config';

const db = getFirestore(app);

export interface AboutDetail {
  icon: string;
  text: string;
}

export interface UserProfile {
  displayName?: string | null;
  photoURL?: string | null;
  bio: string | null;
  coverImageUrl: string | null;
  aboutDetails: AboutDetail[];
  highlightPhotos: string[];
}

const DEFAULT_PROFILE: UserProfile = {
  bio: null,
  coverImageUrl: null,
  aboutDetails: [],
  highlightPhotos: [],
};

export async function getProfile(uid: string): Promise<UserProfile> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return { ...DEFAULT_PROFILE };
  const data = snap.data() as DocumentData;
  return {
    displayName: data.displayName ?? null,
    photoURL: data.photoURL ?? null,
    bio: data.bio ?? null,
    coverImageUrl: data.coverImageUrl ?? null,
    aboutDetails: Array.isArray(data.aboutDetails) ? data.aboutDetails : [],
    highlightPhotos: Array.isArray(data.highlightPhotos) ? data.highlightPhotos : [],
  };
}

export async function updateProfileFields(
  uid: string,
  fields: Partial<UserProfile>
): Promise<void> {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, fields as DocumentData);
  } else {
    await setDoc(ref, { ...DEFAULT_PROFILE, ...fields });
  }
}
