import { getDb } from '../config/firebase-admin.js';
import { FieldPath, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { NOTIFICATION_ICON_BY_TYPE, NotificationType } from '../types/notification.js';

const PAGE_SIZE = 300;
const dryRun = process.argv.includes('--dry-run');

const isNotificationType = (v: unknown): v is NotificationType =>
  typeof v === 'string' && v in NOTIFICATION_ICON_BY_TYPE;

const normalizeType = (v: unknown): NotificationType => {
  return isNotificationType(v) ? v : 'system';
};

async function main() {
  const db = getDb();
  const col = db.collection('notifications');

  let lastDoc: QueryDocumentSnapshot | undefined;
  let scanned = 0;
  let updated = 0;

  while (true) {
    let query = col.orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (lastDoc) query = query.startAfter(lastDoc);

    const snap = await query.get();
    if (snap.empty) break;

    const batch = db.batch();
    let changes = 0;

    for (const doc of snap.docs) {
      scanned++;
      const data = doc.data() as Record<string, unknown>;
      const hasIconKey = typeof data.iconKey === 'string' && data.iconKey.length > 0;
      if (hasIconKey) continue;

      const type = normalizeType(data.type);
      const iconKey = NOTIFICATION_ICON_BY_TYPE[type];

      batch.update(doc.ref, { type, iconKey });
      changes += 1;
    }
    if (!dryRun && changes > 0) {
      await batch.commit();
    }
    updated += changes;
    lastDoc = snap.docs[snap.docs.length - 1];
    console.log(`[page] scanned=${scanned}, updated=${updated}, dryRun=${dryRun}`);
  }
  console.log(`done: scanned=${scanned}, updated=${updated}, dryRun=${dryRun}`);
}

main().catch((e) => {
  console.error('backfill failed', e);
  process.exit(1);
});
