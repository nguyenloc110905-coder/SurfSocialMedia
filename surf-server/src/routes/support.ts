import { Router, Response } from 'express';
import { FieldValue, type DocumentSnapshot, type Query } from 'firebase-admin/firestore';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { getDb } from '../config/firebase-admin.js';
import { sendSupportContactEmail } from '../services/email.js';

const router = Router();

const SUPPORT_TICKETS_COLLECTION = 'support_tickets';
const TICKET_STATUSES = ['new', 'open', 'pending', 'resolved', 'closed'] as const;
const SUPPORT_ROLES = new Set(['admin', 'support']);

type TicketStatus = (typeof TICKET_STATUSES)[number];

type SupportContactBody = {
  category?: unknown;
  subject?: unknown;
  message?: unknown;
};

type SupportReplyBody = {
  message?: unknown;
};

type SupportTicketPatchBody = {
  status?: unknown;
};

type UserProfile = {
  displayName: string;
  email: string;
};

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function isTicketStatus(value: unknown): value is TicketStatus {
  return typeof value === 'string' && TICKET_STATUSES.includes(value as TicketStatus);
}

function getEnvSet(keys: string[], lowerCase = true) {
  return new Set(
    keys
      .flatMap((key) => (process.env[key] ?? '').split(','))
      .map((value) => {
        const trimmed = value.trim();
        return lowerCase ? trimmed.toLowerCase() : trimmed;
      })
      .filter(Boolean)
  );
}

function toMillis(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return new Date(value).getTime() || 0;
  if (typeof value !== 'object') return 0;
  const timestamp = value as {
    toMillis?: () => number;
    seconds?: number;
    _seconds?: number;
  };
  if (typeof timestamp.toMillis === 'function') return timestamp.toMillis();
  const seconds = timestamp.seconds ?? timestamp._seconds;
  return typeof seconds === 'number' ? seconds * 1000 : 0;
}

function toIsoString(value: unknown): string | null {
  const millis = toMillis(value);
  return millis ? new Date(millis).toISOString() : null;
}

function serializeTicket(doc: DocumentSnapshot) {
  const data = doc.data() ?? {};
  const replies = Array.isArray(data.replies) ? data.replies : [];

  return {
    id: doc.id,
    uid: data.uid ?? '',
    displayName: data.displayName ?? 'Surf user',
    email: data.email ?? '',
    category: data.category ?? 'general',
    subject: data.subject ?? '',
    message: data.message ?? '',
    status: isTicketStatus(data.status) ? data.status : 'new',
    priority: data.priority ?? 'normal',
    assignedTo: data.assignedTo ?? null,
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
    lastMessageAt: toIsoString(data.lastMessageAt),
    replies: replies.map((reply) => ({
      id: reply.id ?? '',
      authorId: reply.authorId ?? '',
      authorName: reply.authorName ?? 'Surf user',
      authorRole: reply.authorRole === 'support' ? 'support' : 'user',
      message: reply.message ?? '',
      createdAt: toIsoString(reply.createdAt),
    })),
  };
}

async function getUserProfile(uid: string): Promise<UserProfile> {
  const userDoc = await getDb().collection('users').doc(uid).get();
  const user = userDoc.data() ?? {};
  const displayName =
    typeof user.displayName === 'string' && user.displayName.trim()
      ? user.displayName.trim()
      : 'Surf user';
  const email = typeof user.email === 'string' ? user.email.trim() : '';
  return { displayName, email };
}

async function canManageSupport(uid?: string) {
  if (!uid) return false;

  const uidSet = getEnvSet(['SUPPORT_ADMIN_UIDS', 'ADMIN_UIDS'], false);
  if (uidSet.has(uid)) return true;

  const userDoc = await getDb().collection('users').doc(uid).get();
  const user = userDoc.data() ?? {};
  const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
  const emailSet = getEnvSet(['SUPPORT_ADMIN_EMAILS', 'ADMIN_EMAILS']);
  if (email && emailSet.has(email)) return true;

  const roles = Array.isArray(user.roles)
    ? user.roles.map((role: unknown) => (typeof role === 'string' ? role : ''))
    : [];
  const role = typeof user.role === 'string' ? user.role.toLowerCase() : '';

  return (
    role === 'admin' ||
    role === 'support' ||
    user.isAdmin === true ||
    user.isSupport === true ||
    roles.some((role) => SUPPORT_ROLES.has(role.toLowerCase()))
  );
}

async function requireSupportAgent(req: AuthRequest, res: Response) {
  const allowed = await canManageSupport(req.uid);
  if (!allowed) {
    res.status(403).json({ error: 'Chỉ support/admin mới xem được support inbox' });
    return false;
  }
  return true;
}

/**
 * @swagger
 * /api/support/access:
 *   get:
 *     tags: [Support]
 *     summary: Kiểm tra quyền quản lý support inbox
 */
router.get('/access', requireAuth, async (req: AuthRequest, res) => {
  try {
    res.json({ canManageSupport: await canManageSupport(req.uid) });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/support/contact:
 *   post:
 *     tags: [Support]
 *     summary: Tạo support ticket từ form liên hệ
 */
router.post('/contact', requireAuth, async (req: AuthRequest, res) => {
  try {
    const body = req.body as SupportContactBody;
    const category = cleanText(body.category, 80) || 'general';
    const subject = cleanText(body.subject, 160);
    const message = cleanText(body.message, 4000);

    if (subject.length < 3 || message.length < 10) {
      res.status(400).json({ error: 'Subject and message are required' });
      return;
    }

    const db = getDb();
    const now = new Date();
    const { displayName, email } = await getUserProfile(req.uid!);
    const firstReply = {
      id: `${Date.now()}_${req.uid}`,
      authorId: req.uid,
      authorName: displayName,
      authorRole: 'user',
      message,
      createdAt: now,
    };

    const supportRef = await db.collection(SUPPORT_TICKETS_COLLECTION).add({
      uid: req.uid,
      displayName,
      email,
      category,
      subject,
      message,
      status: 'new',
      priority: 'normal',
      assignedTo: null,
      replies: [firstReply],
      createdAt: now,
      updatedAt: now,
      lastMessageAt: now,
    });

    sendSupportContactEmail({
      uid: req.uid!,
      displayName,
      email,
      category,
      subject,
      message,
      supportMessageId: supportRef.id,
    }).catch((error) => {
      console.warn('Không gửi được email support notification:', error);
    });

    const ticket = await supportRef.get();
    res.status(201).json({ success: true, ticket: serializeTicket(ticket) });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/support/my-tickets:
 *   get:
 *     tags: [Support]
 *     summary: User xem các support ticket của chính mình
 */
router.get('/my-tickets', requireAuth, async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(Number.parseInt(String(req.query.limit ?? '25'), 10) || 25, 100);
    const snap = await getDb()
      .collection(SUPPORT_TICKETS_COLLECTION)
      .where('uid', '==', req.uid!)
      .limit(limit)
      .get();
    const tickets = snap.docs
      .map(serializeTicket)
      .sort((a, b) => toMillis(b.lastMessageAt) - toMillis(a.lastMessageAt));
    res.json({ tickets });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/my-tickets/:ticketId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const doc = await getDb().collection(SUPPORT_TICKETS_COLLECTION).doc(req.params.ticketId).get();
    if (!doc.exists || doc.data()?.uid !== req.uid) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }
    res.json({ ticket: serializeTicket(doc) });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post('/my-tickets/:ticketId/replies', requireAuth, async (req: AuthRequest, res) => {
  try {
    const message = cleanText((req.body as SupportReplyBody).message, 4000);
    if (message.length < 2) {
      res.status(400).json({ error: 'Reply message is required' });
      return;
    }

    const db = getDb();
    const ref = db.collection(SUPPORT_TICKETS_COLLECTION).doc(req.params.ticketId);
    const doc = await ref.get();
    if (!doc.exists || doc.data()?.uid !== req.uid) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }
    if (doc.data()?.status === 'closed') {
      res.status(400).json({ error: 'Closed tickets cannot receive replies' });
      return;
    }

    const now = new Date();
    const { displayName } = await getUserProfile(req.uid!);
    await ref.update({
      replies: FieldValue.arrayUnion({
        id: `${Date.now()}_${req.uid}`,
        authorId: req.uid,
        authorName: displayName,
        authorRole: 'user',
        message,
        createdAt: now,
      }),
      status: 'open',
      updatedAt: now,
      lastMessageAt: now,
    });

    res.json({ ticket: serializeTicket(await ref.get()) });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/**
 * @swagger
 * /api/support/admin/tickets:
 *   get:
 *     tags: [Support]
 *     summary: Support/admin xem toàn bộ ticket
 */
router.get('/admin/tickets', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await requireSupportAgent(req, res))) return;

    const status = isTicketStatus(req.query.status) ? req.query.status : null;
    const limit = Math.min(Number.parseInt(String(req.query.limit ?? '50'), 10) || 50, 150);
    let query: Query = getDb().collection(SUPPORT_TICKETS_COLLECTION);
    if (status) query = query.where('status', '==', status);
    const snap = await query.limit(limit).get();
    const tickets = snap.docs
      .map(serializeTicket)
      .sort((a, b) => toMillis(b.lastMessageAt) - toMillis(a.lastMessageAt));
    res.json({ tickets, canManageSupport: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.get('/admin/tickets/:ticketId', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await requireSupportAgent(req, res))) return;

    const doc = await getDb().collection(SUPPORT_TICKETS_COLLECTION).doc(req.params.ticketId).get();
    if (!doc.exists) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }
    res.json({ ticket: serializeTicket(doc) });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.patch('/admin/tickets/:ticketId', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await requireSupportAgent(req, res))) return;

    const body = req.body as SupportTicketPatchBody;
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (body.status !== undefined) {
      if (!isTicketStatus(body.status)) {
        res.status(400).json({ error: `Status must be one of: ${TICKET_STATUSES.join(', ')}` });
        return;
      }
      updates.status = body.status;
    }

    const ref = getDb().collection(SUPPORT_TICKETS_COLLECTION).doc(req.params.ticketId);
    const doc = await ref.get();
    if (!doc.exists) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    await ref.update(updates);
    res.json({ ticket: serializeTicket(await ref.get()) });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

router.post('/admin/tickets/:ticketId/replies', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!(await requireSupportAgent(req, res))) return;

    const message = cleanText((req.body as SupportReplyBody).message, 4000);
    if (message.length < 2) {
      res.status(400).json({ error: 'Reply message is required' });
      return;
    }

    const db = getDb();
    const ref = db.collection(SUPPORT_TICKETS_COLLECTION).doc(req.params.ticketId);
    const doc = await ref.get();
    if (!doc.exists) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    const now = new Date();
    const { displayName } = await getUserProfile(req.uid!);
    await ref.update({
      replies: FieldValue.arrayUnion({
        id: `${Date.now()}_${req.uid}`,
        authorId: req.uid,
        authorName: displayName,
        authorRole: 'support',
        message,
        createdAt: now,
      }),
      status: 'pending',
      updatedAt: now,
      lastMessageAt: now,
    });

    res.json({ ticket: serializeTicket(await ref.get()) });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
