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

export interface WorkEntry {
  company: string;
  title: string;
  current: boolean;
}

export interface EducationEntry {
  school: string;
  degree: string;
  year?: number;
}

export interface Birthday {
  day: number;
  month: number;
  year: number;
  showYear: boolean;
}

export interface UserProfile {
  displayName?: string | null;
  photoURL?: string | null;
  email?: string | null;
  // Section 1: User typed
  bio: string | null;
  website?: string | null;
  contactEmail?: string | null;
  phone?: string | null;
  // Section 2: Chosen from list
  work?: WorkEntry[];
  education?: EducationEntry[];
  currentCity?: string | null;
  hometown?: string | null;
  relationship?: string | null;
  birthday?: Birthday | null;
  gender?: string | null;
  customGender?: string | null;
  languages?: string[];
  religion?: string | null;
  politicalViews?: string | null;
  // Auto / legacy
  joinedAt?: any;
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
    email: data.email ?? null,
    bio: data.bio ?? null,
    website: data.website ?? null,
    contactEmail: data.contactEmail ?? null,
    phone: data.phone ?? null,
    work: Array.isArray(data.work) ? data.work : [],
    education: Array.isArray(data.education) ? data.education : [],
    currentCity: data.currentCity ?? null,
    hometown: data.hometown ?? null,
    relationship: data.relationship ?? null,
    birthday: data.birthday ?? null,
    gender: data.gender ?? null,
    customGender: data.customGender ?? null,
    languages: Array.isArray(data.languages) ? data.languages : [],
    religion: data.religion ?? null,
    politicalViews: data.politicalViews ?? null,
    joinedAt: data.createdAt ?? null,
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
