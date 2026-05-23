import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from '../config/firebase-admin.js';

const HASHTAG_REGEX = /#([a-zA-Z0-9_\u00C0-\u1EF9-]+)/g;
const DAILY_COUNTS_COLLECTION = 'hashtag_daily_counts';
const POSTS_FALLBACK_LIMIT = 500;

type PostSnapshot = {
  id: string;
  content?: string;
  createdAt?: unknown;
  deleted?: boolean;
  privacy?: string;
};

export type TrendingHashtag = {
  tag: string;
  count: number;
  dailyCounts: Record<string, number>;
};

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().slice(0, 80);
}

export function extractHashtags(content: string): string[] {
  const tags = new Set<string>();
  let match: RegExpExecArray | null;
  const regex = new RegExp(HASHTAG_REGEX.source, 'g');

  while ((match = regex.exec(content)) !== null) {
    const tag = normalizeTag(match[1] ?? '');
    if (tag) tags.add(tag);
  }

  return Array.from(tags);
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getStartDate(days: number): Date {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - Math.max(days - 1, 0));
  return start;
}

function toMillis(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return new Date(value).getTime() || 0;
  if (typeof value !== 'object') return 0;

  const maybeTimestamp = value as {
    toMillis?: () => number;
    seconds?: number;
    _seconds?: number;
  };

  if (typeof maybeTimestamp.toMillis === 'function') return maybeTimestamp.toMillis();
  const seconds = maybeTimestamp.seconds ?? maybeTimestamp._seconds;
  return typeof seconds === 'number' ? seconds * 1000 : 0;
}

function pushCount(totals: Map<string, TrendingHashtag>, tag: string, date: string, count: number) {
  if (!tag || !date || count <= 0) return;

  const current = totals.get(tag) ?? { tag, count: 0, dailyCounts: {} };
  current.count += count;
  current.dailyCounts[date] = (current.dailyCounts[date] ?? 0) + count;
  totals.set(tag, current);
}

function sortTrending(items: TrendingHashtag[], limit: number): TrendingHashtag[] {
  return items
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.tag.localeCompare(b.tag);
    })
    .slice(0, limit);
}

export async function recordPostHashtags(postId: string, content: string, createdAt = new Date()) {
  const tags = extractHashtags(content);
  if (tags.length === 0) return;

  const db = getDb();
  const date = toDateKey(createdAt);
  const batch = db.batch();

  tags.forEach((tag) => {
    const ref = db.collection(DAILY_COUNTS_COLLECTION).doc(`${date}_${tag}`);
    batch.set(
      ref,
      {
        date,
        tag,
        count: FieldValue.increment(1),
        lastPostId: postId,
        updatedAt: new Date(),
      },
      { merge: true }
    );
  });

  await batch.commit();
}

async function getTrendingFromDailyCounts(days: number, limit: number) {
  const db = getDb();
  const startDate = getStartDate(days);
  const startDateKey = toDateKey(startDate);
  const snap = await db
    .collection(DAILY_COUNTS_COLLECTION)
    .where('date', '>=', startDateKey)
    .limit(5000)
    .get();
  const totals = new Map<string, TrendingHashtag>();

  snap.docs.forEach((doc) => {
    const data = doc.data();
    const tag = typeof data.tag === 'string' ? normalizeTag(data.tag) : '';
    const date = typeof data.date === 'string' ? data.date : '';
    const count = typeof data.count === 'number' ? data.count : 0;
    pushCount(totals, tag, date, count);
  });

  return sortTrending(Array.from(totals.values()), limit);
}

async function getTrendingFromRecentPosts(days: number, limit: number) {
  const db = getDb();
  const cutoff = getStartDate(days).getTime();
  const snap = await db
    .collection('posts')
    .orderBy('createdAt', 'desc')
    .limit(POSTS_FALLBACK_LIMIT)
    .get();
  const totals = new Map<string, TrendingHashtag>();

  snap.docs.forEach((doc) => {
    const post = { id: doc.id, ...doc.data() } as PostSnapshot;
    const createdAt = toMillis(post.createdAt);
    if (!createdAt || createdAt < cutoff || post.deleted || post.privacy === 'only-me') return;

    const date = toDateKey(new Date(createdAt));
    extractHashtags(post.content ?? '').forEach((tag) => pushCount(totals, tag, date, 1));
  });

  return sortTrending(Array.from(totals.values()), limit);
}

export async function getTrendingHashtags(days: number, limit: number): Promise<TrendingHashtag[]> {
  const fromDailyCounts = await getTrendingFromDailyCounts(days, limit);
  if (fromDailyCounts.length > 0) return fromDailyCounts;
  return getTrendingFromRecentPosts(days, limit);
}
