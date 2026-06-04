import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from 'firebase/auth';

export type RecentAccount = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  lastUsedAt: number;
};

export const RECENT_ACCOUNTS_KEY = 'surf_recent_accounts';
const MAX_RECENT_ACCOUNTS = 6;

function normalizeAccount(account: Partial<RecentAccount>): RecentAccount | null {
  if (!account.uid || typeof account.uid !== 'string') return null;
  return {
    uid: account.uid,
    email: typeof account.email === 'string' ? account.email : null,
    displayName: typeof account.displayName === 'string' ? account.displayName : null,
    photoURL: typeof account.photoURL === 'string' ? account.photoURL : null,
    lastUsedAt: typeof account.lastUsedAt === 'number' ? account.lastUsedAt : Date.now(),
  };
}

export async function getRecentAccounts(): Promise<RecentAccount[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => normalizeAccount(item))
      .filter((item): item is RecentAccount => item !== null)
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
      .slice(0, MAX_RECENT_ACCOUNTS);
  } catch {
    return [];
  }
}

export async function rememberAccount(user: User): Promise<void> {
  const account: RecentAccount = {
    uid: user.uid,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    photoURL: user.photoURL ?? null,
    lastUsedAt: Date.now(),
  };
  const current = await getRecentAccounts();
  const next = [account, ...current.filter((item) => item.uid !== account.uid)]
    .slice(0, MAX_RECENT_ACCOUNTS);
  await AsyncStorage.setItem(RECENT_ACCOUNTS_KEY, JSON.stringify(next));
}
