import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { getDb } from '../config/firebase-admin.js';
import { FieldValue, type DocumentData, type Firestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Bỏ dấu tiếng Việt & chuyển thường để full-text search */
function normalizeTitle(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

const VALID_CATEGORIES = ['electronics', 'clothing', 'vehicles', 'home', 'sports', 'other'] as const;
const VALID_CONDITIONS = ['new', 'like_new', 'good', 'fair'] as const;
const PAGE_SIZE = 20;

type Category = typeof VALID_CATEGORIES[number];
type Condition = typeof VALID_CONDITIONS[number];

interface ListingData {
  sellerId: string;
  sellerDisplayName: string;
  sellerPhotoURL: string | null;
  title: string;
  titleNormalized: string;
  description: string;
  price: number;
  currency: 'VND';
  category: Category;
  condition: Condition;
  mediaUrls: string[];
  location: string;
  status: 'active' | 'sold' | 'deleted';
  savedBy: string[];
  viewCount: number;
  createdAt: Date;
  updatedAt: Date;
}

type ListingItem = ListingData & { id: string };

function listingFromDoc(doc: QueryDocumentSnapshot<DocumentData>): ListingItem {
  return { id: doc.id, ...(doc.data() as ListingData) };
}

function getTimeValue(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return new Date(value).getTime() || 0;
  if (typeof value === 'object') {
    const raw = value as { toDate?: () => Date; _seconds?: number; seconds?: number };
    if (typeof raw.toDate === 'function') return raw.toDate().getTime();
    const seconds = typeof raw._seconds === 'number' ? raw._seconds : raw.seconds;
    return typeof seconds === 'number' ? seconds * 1000 : 0;
  }
  return 0;
}

async function getPublicListingsFallback(db: Firestore, category?: Category) {
  const snap = await db.collection('marketplace').limit(200).get();
  const items = snap.docs
    .map(listingFromDoc)
    .filter((item) => item.status === 'active' && (!category || item.category === category))
    .sort((a, b) => getTimeValue(b.createdAt) - getTimeValue(a.createdAt))
    .slice(0, PAGE_SIZE);
  return { items, nextCursor: null };
}

// ── POST /api/marketplace — Đăng tin bán ─────────────────────────────────────
router.post('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const {
      title,
      description = '',
      price = 0,
      category = 'other',
      condition = 'good',
      mediaUrls = [],
      location = '',
    } = req.body;

    if (!title?.trim()) {
      res.status(400).json({ error: 'Tiêu đề là bắt buộc' });
      return;
    }
    if (!VALID_CATEGORIES.includes(category)) {
      res.status(400).json({ error: 'Danh mục không hợp lệ' });
      return;
    }
    if (!VALID_CONDITIONS.includes(condition)) {
      res.status(400).json({ error: 'Tình trạng không hợp lệ' });
      return;
    }
    if (typeof price !== 'number' || price < 0) {
      res.status(400).json({ error: 'Giá không hợp lệ' });
      return;
    }

    const userDoc = await db.collection('users').doc(req.uid!).get();
    const user = userDoc.data();

    const docRef = db.collection('marketplace').doc();
    const listing: ListingData = {
      sellerId: req.uid!,
      sellerDisplayName: user?.displayName ?? 'Ẩn danh',
      sellerPhotoURL: user?.photoURL ?? null,
      title: title.trim(),
      titleNormalized: normalizeTitle(title),
      description: description.trim(),
      price: Number(price),
      currency: 'VND',
      category: category as Category,
      condition: condition as Condition,
      mediaUrls: Array.isArray(mediaUrls) ? mediaUrls.slice(0, 10) : [],
      location: location.trim(),
      status: 'active',
      savedBy: [],
      viewCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await docRef.set(listing);
    res.status(201).json({ id: docRef.id, ...listing });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ── GET /api/marketplace/my — Tin của tôi ────────────────────────────────────
// Phải đặt TRƯỚC /:id để tránh bị override
router.get('/my', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const { cursor, status = 'active' } = req.query;

    let query = db
      .collection('marketplace')
      .where('sellerId', '==', req.uid!)
      .where('status', 'in', status === 'all' ? ['active', 'sold'] : [status === 'sold' ? 'sold' : 'active'])
      .orderBy('createdAt', 'desc')
      .limit(PAGE_SIZE);

    if (cursor && typeof cursor === 'string') {
      const cursorDoc = await db.collection('marketplace').doc(cursor).get();
      if (cursorDoc.exists) query = query.startAfter(cursorDoc);
    }

    const snap = await query.get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const nextCursor = snap.docs.length === PAGE_SIZE ? snap.docs[snap.docs.length - 1].id : null;

    res.json({ items, nextCursor });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ── GET /api/marketplace/saved — Tin đã lưu ──────────────────────────────────
router.get('/saved', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const { cursor } = req.query;

    // savedBy array-contains + status filter cần composite index
    let query = db
      .collection('marketplace')
      .where('savedBy', 'array-contains', req.uid!)
      .where('status', '==', 'active')
      .orderBy('createdAt', 'desc')
      .limit(PAGE_SIZE);

    if (cursor && typeof cursor === 'string') {
      const cursorDoc = await db.collection('marketplace').doc(cursor).get();
      if (cursorDoc.exists) query = query.startAfter(cursorDoc);
    }

    const snap = await query.get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const nextCursor = snap.docs.length === PAGE_SIZE ? snap.docs[snap.docs.length - 1].id : null;

    res.json({ items, nextCursor });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ── GET /api/marketplace/search — Tìm kiếm ───────────────────────────────────
router.get('/search', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const raw = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const category = typeof req.query.category === 'string' ? req.query.category : '';

    if (!raw) {
      res.json({ items: [], nextCursor: null });
      return;
    }

    const normQ = normalizeTitle(raw);

    // Tìm theo titleNormalized đã được lưu sẵn khi tạo tin
    // Firestore không hỗ trợ LIKE, nên dùng range query (prefix search)
    // Để search substring, ta dùng array chứa mảng normalized words
    // Đơn giản hơn: fetch limit 200 rồi filter in-memory (hợp lý cho marketplace vừa nhỏ)
    let baseQuery = db
      .collection('marketplace')
      .where('status', '==', 'active')
      .orderBy('createdAt', 'desc')
      .limit(200);

    if (category && VALID_CATEGORIES.includes(category as Category)) {
      baseQuery = db
        .collection('marketplace')
        .where('status', '==', 'active')
        .where('category', '==', category)
        .orderBy('createdAt', 'desc')
        .limit(200);
    }

    const snap = await baseQuery.get();
    const items = snap.docs
      .map((d) => ({ id: d.id, ...d.data() as ListingData }))
      .filter((item) => item.titleNormalized?.includes(normQ) || normalizeTitle(item.description ?? '').includes(normQ))
      .slice(0, PAGE_SIZE);

    res.json({ items, nextCursor: null });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ── GET /api/marketplace — Danh sách tin (cursor pagination) ──────────────────
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const { cursor, category } = req.query;
    const validCategory =
      category && typeof category === 'string' && VALID_CATEGORIES.includes(category as Category)
        ? (category as Category)
        : undefined;

    // Dùng composite index: (status, category, createdAt DESC) hoặc (status, createdAt DESC)
    let query;
    if (validCategory) {
      query = db
        .collection('marketplace')
        .where('status', '==', 'active')
        .where('category', '==', validCategory)
        .orderBy('createdAt', 'desc')
        .limit(PAGE_SIZE);
    } else {
      query = db
        .collection('marketplace')
        .where('status', '==', 'active')
        .orderBy('createdAt', 'desc')
        .limit(PAGE_SIZE);
    }

    // Cursor-based pagination: startAfter document snapshot
    if (cursor && typeof cursor === 'string') {
      const cursorDoc = await db.collection('marketplace').doc(cursor).get();
      if (cursorDoc.exists) query = query.startAfter(cursorDoc);
    }

    let snap;
    try {
      snap = await query.get();
    } catch {
      const fallback = await getPublicListingsFallback(db, validCategory);
      res.json(fallback);
      return;
    }
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // nextCursor = id của document cuối cùng trong trang
    const nextCursor = snap.docs.length === PAGE_SIZE ? snap.docs[snap.docs.length - 1].id : null;

    res.json({ items, nextCursor });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ── GET /api/marketplace/:id — Chi tiết tin ───────────────────────────────────
router.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const ref = db.collection('marketplace').doc(req.params.id);
    const doc = await ref.get();

    if (!doc.exists || doc.data()?.status === 'deleted') {
      res.status(404).json({ error: 'Không tìm thấy tin đăng' });
      return;
    }

    // Tăng viewCount (fire-and-forget, không block response)
    ref.update({ viewCount: FieldValue.increment(1) }).catch(() => {});

    res.json({ id: doc.id, ...doc.data() });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ── PATCH /api/marketplace/:id — Sửa tin ─────────────────────────────────────
router.patch('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const ref = db.collection('marketplace').doc(req.params.id);
    const doc = await ref.get();

    if (!doc.exists || doc.data()?.status === 'deleted') {
      res.status(404).json({ error: 'Không tìm thấy tin đăng' });
      return;
    }
    if (doc.data()?.sellerId !== req.uid) {
      res.status(403).json({ error: 'Không có quyền chỉnh sửa' });
      return;
    }

    const { title, description, price, category, condition, mediaUrls, location, status } = req.body;
    const update: Record<string, unknown> = { updatedAt: new Date() };

    if (title !== undefined) {
      update.title = title.trim();
      update.titleNormalized = normalizeTitle(title);
    }
    if (description !== undefined) update.description = description.trim();
    if (price !== undefined) update.price = Number(price);
    if (category !== undefined && VALID_CATEGORIES.includes(category)) update.category = category;
    if (condition !== undefined && VALID_CONDITIONS.includes(condition)) update.condition = condition;
    if (mediaUrls !== undefined) update.mediaUrls = Array.isArray(mediaUrls) ? mediaUrls.slice(0, 10) : [];
    if (location !== undefined) update.location = location.trim();
    if (status === 'sold' || status === 'active') update.status = status;

    await ref.update(update);
    const updated = await ref.get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ── DELETE /api/marketplace/:id — Xóa mềm ────────────────────────────────────
router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const ref = db.collection('marketplace').doc(req.params.id);
    const doc = await ref.get();

    if (!doc.exists || doc.data()?.status === 'deleted') {
      res.status(404).json({ error: 'Không tìm thấy tin đăng' });
      return;
    }
    if (doc.data()?.sellerId !== req.uid) {
      res.status(403).json({ error: 'Không có quyền xóa' });
      return;
    }

    await ref.update({ status: 'deleted', updatedAt: new Date() });
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// ── POST /api/marketplace/:id/save — Lưu / bỏ lưu ───────────────────────────
router.post('/:id/save', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const ref = db.collection('marketplace').doc(req.params.id);
    const doc = await ref.get();

    if (!doc.exists || doc.data()?.status === 'deleted') {
      res.status(404).json({ error: 'Không tìm thấy tin đăng' });
      return;
    }

    const savedBy: string[] = doc.data()?.savedBy ?? [];
    const isSaved = savedBy.includes(req.uid!);

    if (isSaved) {
      await ref.update({ savedBy: FieldValue.arrayRemove(req.uid!) });
      res.json({ saved: false });
    } else {
      await ref.update({ savedBy: FieldValue.arrayUnion(req.uid!) });
      res.json({ saved: true });
    }
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
