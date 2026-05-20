import 'dotenv/config';
import { FieldPath, type QueryDocumentSnapshot, type DocumentData } from 'firebase-admin/firestore';
import { getDb } from '../src/config/firebase-admin.js';

function normalizeTitle(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .trim();
}

function getMarketplaceSearchTokens(...values: unknown[]) {
  const tokens = new Set<string>();
  values.forEach((value) => {
    const normalized = normalizeTitle(String(value ?? '')).replace(/[^a-z0-9]+/g, ' ');
    normalized
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2 && token.length <= 32)
      .forEach((token) => tokens.add(token));
  });
  return Array.from(tokens).slice(0, 80);
}

function arraysEqual(a: unknown, b: string[]) {
  return Array.isArray(a) && a.length === b.length && a.every((value, index) => value === b[index]);
}

async function main() {
  const db = getDb();
  const listingsRef = db.collection('marketplace');
  const pageSize = 400;
  let lastDoc: QueryDocumentSnapshot<DocumentData> | null = null;
  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  for (;;) {
    let query = listingsRef.orderBy(FieldPath.documentId()).limit(pageSize);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snap = await query.get();
    if (snap.empty) break;

    const batch = db.batch();
    let opCount = 0;

    for (const doc of snap.docs) {
      scanned += 1;
      const data = doc.data();
      const tags = Array.isArray(data.tags) ? data.tags.join(' ') : '';
      const titleNormalized = normalizeTitle(String(data.title ?? ''));
      const searchTokens = getMarketplaceSearchTokens(
        data.title,
        data.description,
        data.category,
        data.brand,
        data.productType,
        data.material,
        data.location,
        tags
      );

      if (data.titleNormalized === titleNormalized && arraysEqual(data.searchTokens, searchTokens)) {
        skipped += 1;
        continue;
      }

      batch.update(doc.ref, { titleNormalized, searchTokens });
      opCount += 1;
      updated += 1;
    }

    if (opCount > 0) {
      await batch.commit();
      console.log(`Committed ${opCount} marketplace search-token updates.`);
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < pageSize) break;
  }

  console.log(`Done. Scanned=${scanned}, updated=${updated}, skipped=${skipped}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
