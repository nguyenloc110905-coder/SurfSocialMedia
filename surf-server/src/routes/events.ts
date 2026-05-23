import { Router } from 'express';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getDb } from '../config/firebase-admin.js';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import {
  createNotification,
  getUnreadNotificationCount,
  toApiNotification,
} from '../services/notifications.js';
import {
  emitNotificationNew,
  emitNotificationUnreadCount,
} from '../realtime/emitters/notification.emitter.js';
import { getIo } from '../realtime/io.js';
import { userRoom } from '../realtime/rooms.js';

type EventRsvpStatus = 'going' | 'maybe' | 'not_going';

type EventDoc = {
  id: string;
  creatorId: string;
  creatorName: string;
  name: string;
  date: Date;
  location: string;
  description: string;
  coverImageUrl: string | null;
  attendeeCounts: Record<EventRsvpStatus, number>;
  myRsvp: EventRsvpStatus | null;
  createdAt: Date;
  updatedAt: Date;
};

const router = Router();
const db = () => getDb();

const rsvpStatuses: EventRsvpStatus[] = ['going', 'maybe', 'not_going'];

const isRsvpStatus = (value: unknown): value is EventRsvpStatus =>
  typeof value === 'string' && rsvpStatuses.includes(value as EventRsvpStatus);

const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const normalizeCounts = (value: unknown): Record<EventRsvpStatus, number> => {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    going: typeof raw.going === 'number' ? raw.going : 0,
    maybe: typeof raw.maybe === 'number' ? raw.maybe : 0,
    not_going: typeof raw.not_going === 'number' ? raw.not_going : 0,
  };
};

const mapEvent = (
  id: string,
  data: Record<string, unknown>,
  myRsvp: EventRsvpStatus | null
): EventDoc => ({
  id,
  creatorId: (data.creatorId as string) ?? '',
  creatorName: (data.creatorName as string) ?? 'Surf user',
  name: (data.name as string) ?? '',
  date: toDate(data.date) ?? new Date(),
  location: (data.location as string) ?? '',
  description: (data.description as string) ?? '',
  coverImageUrl: (data.coverImageUrl as string | null | undefined) ?? null,
  attendeeCounts: normalizeCounts(data.attendeeCounts),
  myRsvp,
  createdAt: toDate(data.createdAt) ?? new Date(),
  updatedAt: toDate(data.updatedAt) ?? new Date(),
});

const toApiEvent = (event: EventDoc) => ({
  ...event,
  date: event.date.toISOString(),
  createdAt: event.createdAt.toISOString(),
  updatedAt: event.updatedAt.toISOString(),
});

const listRsvpsByEvent = async (eventId: string): Promise<Map<string, EventRsvpStatus>> => {
  const snap = await db().collection('event_rsvps').where('eventId', '==', eventId).get();
  const result = new Map<string, EventRsvpStatus>();
  snap.docs.forEach((doc) => {
    const data = doc.data();
    if (typeof data.userId === 'string' && isRsvpStatus(data.status)) {
      result.set(data.userId, data.status);
    }
  });
  return result;
};

const notifyEventAttendees = async (
  eventId: string,
  actorId: string,
  eventName: string,
  attendeeIds: string[]
) => {
  const uniqueAttendeeIds = [...new Set(attendeeIds)].filter((id) => id !== actorId);
  if (uniqueAttendeeIds.length === 0) return;

  await Promise.all(
    uniqueAttendeeIds.map(async (userId) => {
      const notification = await createNotification({
        userId,
        type: 'system',
        actorId,
        entityType: 'event',
        entityId: eventId,
        message: `Sự kiện "${eventName}" vừa được cập nhật.`,
      });

      getIo()
        .to(userRoom(userId))
        .emit('event:updated', {
          eventId,
          title: eventName,
          message: `Sự kiện "${eventName}" vừa được cập nhật.`,
          updatedAt: new Date().toISOString(),
        });

      if (notification) {
        const unreadCount = await getUnreadNotificationCount(userId);
        emitNotificationNew(userId, toApiNotification(notification));
        emitNotificationUnreadCount(userId, unreadCount);
      }
    })
  );
};

router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const locationFilter =
      typeof req.query.location === 'string' ? req.query.location.trim().toLowerCase() : '';
    const now = new Date();

    const [eventsSnap, rsvpsSnap] = await Promise.all([
      db().collection('events').get(),
      db().collection('event_rsvps').where('userId', '==', uid).get(),
    ]);

    const myRsvps = new Map<string, EventRsvpStatus>();
    rsvpsSnap.docs.forEach((doc) => {
      const data = doc.data();
      if (typeof data.eventId === 'string' && isRsvpStatus(data.status)) {
        myRsvps.set(data.eventId, data.status);
      }
    });

    const items = eventsSnap.docs
      .map((doc) => toApiEvent(mapEvent(doc.id, doc.data(), myRsvps.get(doc.id) ?? null)))
      .filter((event) => new Date(event.date).getTime() >= now.getTime())
      .filter((event) =>
        locationFilter ? event.location.toLowerCase().includes(locationFilter) : true
      )
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    res.json({ items });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const body = (req.body ?? {}) as {
      name?: string;
      date?: string;
      location?: string;
      description?: string;
      coverImageUrl?: string | null;
    };

    const name = body.name?.trim().slice(0, 120) ?? '';
    const location = body.location?.trim().slice(0, 160) ?? '';
    const description = body.description?.trim().slice(0, 2000) ?? '';
    const date = body.date ? new Date(body.date) : null;
    const coverImageUrl = body.coverImageUrl?.trim() || null;

    if (!name || !location || !description || !date || Number.isNaN(date.getTime())) {
      res.status(400).json({ error: 'name, date, location, and description are required' });
      return;
    }

    const userDoc = await db().collection('users').doc(uid).get();
    const userData = userDoc.data() ?? {};
    const creatorName =
      (userData.displayName as string | undefined)?.trim() ||
      (userData.email as string | undefined)?.split('@')[0] ||
      'Surf user';

    const ref = await db()
      .collection('events')
      .add({
        creatorId: uid,
        creatorName,
        name,
        date,
        location,
        description,
        coverImageUrl,
        attendeeCounts: { going: 0, maybe: 0, not_going: 0 },
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

    const created = await ref.get();
    res.status(201).json({ item: toApiEvent(mapEvent(created.id, created.data() ?? {}, null)) });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.patch('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const ref = db().collection('events').doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const current = doc.data() ?? {};
    if (current.creatorId !== uid) {
      res.status(403).json({ error: 'Only the creator can edit this event' });
      return;
    }

    const body = (req.body ?? {}) as {
      name?: string;
      date?: string;
      location?: string;
      description?: string;
      coverImageUrl?: string | null;
    };
    const updates: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (typeof body.name === 'string') updates.name = body.name.trim().slice(0, 120);
    if (typeof body.location === 'string') updates.location = body.location.trim().slice(0, 160);
    if (typeof body.description === 'string') {
      updates.description = body.description.trim().slice(0, 2000);
    }
    if (typeof body.coverImageUrl === 'string' || body.coverImageUrl === null) {
      updates.coverImageUrl = body.coverImageUrl?.trim() || null;
    }
    if (typeof body.date === 'string') {
      const parsedDate = new Date(body.date);
      if (Number.isNaN(parsedDate.getTime())) {
        res.status(400).json({ error: 'date is invalid' });
        return;
      }
      updates.date = parsedDate;
    }

    if (updates.name === '' || updates.location === '' || updates.description === '') {
      res.status(400).json({ error: 'name, location, and description cannot be empty' });
      return;
    }

    await ref.update(updates);

    const rsvps = await listRsvpsByEvent(req.params.id);
    const attendeeIds = [...rsvps.entries()]
      .filter(([, status]) => status === 'going' || status === 'maybe')
      .map(([userId]) => userId);

    const updated = await ref.get();
    const item = toApiEvent(mapEvent(updated.id, updated.data() ?? {}, rsvps.get(uid) ?? null));
    await notifyEventAttendees(item.id, uid, item.name, attendeeIds);

    res.json({ item });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/:id/rsvp', requireAuth, async (req: AuthRequest, res) => {
  try {
    const uid = req.uid!;
    const body = (req.body ?? {}) as { status?: string };
    if (!isRsvpStatus(body.status)) {
      res.status(400).json({ error: 'status must be going, maybe, or not_going' });
      return;
    }
    const nextStatus = body.status;

    const eventRef = db().collection('events').doc(req.params.id);
    const rsvpRef = db().collection('event_rsvps').doc(`${req.params.id}_${uid}`);

    const result = await db().runTransaction(async (transaction) => {
      const [eventSnap, rsvpSnap] = await Promise.all([
        transaction.get(eventRef),
        transaction.get(rsvpRef),
      ]);

      if (!eventSnap.exists) return null;

      const previousStatus = isRsvpStatus(rsvpSnap.data()?.status)
        ? (rsvpSnap.data()?.status as EventRsvpStatus)
        : null;
      const counts = normalizeCounts(eventSnap.data()?.attendeeCounts);

      if (previousStatus && counts[previousStatus] > 0) {
        counts[previousStatus] -= 1;
      }
      counts[nextStatus] += 1;

      transaction.set(
        rsvpRef,
        {
          eventId: req.params.id,
          userId: uid,
          status: nextStatus,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      transaction.update(eventRef, {
        attendeeCounts: counts,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        data: eventSnap.data() ?? {},
        counts,
      };
    });

    if (!result) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const updated = await eventRef.get();
    res.json({
      item: toApiEvent(mapEvent(updated.id, updated.data() ?? {}, nextStatus)),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
