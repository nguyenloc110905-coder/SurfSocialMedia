/**
 * Backfill the `hasVideo` field on all existing posts.
 * Posts that contain at least one video URL in `mediaUrls` get hasVideo=true,
 * all others get hasVideo=false (so the index query works correctly).
 *
 * Run once from surf-server/:
 *   npm run backfill:has-video
 */
import 'dotenv/config';
import { getDb } from '../src/config/firebase-admin.js';

function isVideoUrl(url: string): boolean {
  if (!url) return false;
  if (url.includes('/video/upload/')) return true;
  return /\.(mp4|webm|mov|avi|mkv|ogv)(\?|$)/i.test(url);
}

async function main() {
  const db = getDb();
  const postsRef = db.collection('posts');

  console.log('🔍 Fetching all posts...');
  const snap = await postsRef.get();
  console.log(`   Found ${snap.size} posts total.`);

  const BATCH_SIZE = 400; // Firestore batch limit is 500
  let batch = db.batch();
  let opCount = 0;
  let updatedTrue = 0;
  let updatedFalse = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const mediaUrls: unknown[] = Array.isArray(data.mediaUrls) ? data.mediaUrls : [];
    const hasVideo = mediaUrls.some((u) => typeof u === 'string' && isVideoUrl(u));

    // Skip if already correctly set
    if (data.hasVideo === hasVideo) continue;

    batch.update(doc.ref, { hasVideo });
    opCount++;
    if (hasVideo) updatedTrue++;
    else updatedFalse++;

    if (opCount >= BATCH_SIZE) {
      await batch.commit();
      console.log(`   ✓ Committed batch of ${opCount}`);
      batch = db.batch();
      opCount = 0;
    }
  }

  if (opCount > 0) {
    await batch.commit();
    console.log(`   ✓ Committed final batch of ${opCount}`);
  }

  console.log(`\n✅ Done!`);
  console.log(`   Posts with video  → hasVideo=true  : ${updatedTrue}`);
  console.log(`   Posts without video → hasVideo=false: ${updatedFalse}`);
  console.log(`   Posts already correct (skipped)     : ${snap.size - updatedTrue - updatedFalse}`);
}

main().catch((e) => {
  console.error('❌ Error:', e);
  process.exit(1);
});
