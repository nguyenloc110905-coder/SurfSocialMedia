import 'dotenv/config';
import { getDb } from '../src/config/firebase-admin.js';

async function main() {
  const db = getDb();
  const snap = await db.collection('users').limit(30).get();
  console.log(`\n📋 Danh sách users (${snap.size}):\n`);
  snap.docs.forEach((d) => {
    const data = d.data();
    console.log(`  ${d.id}  |  ${data.displayName || '(no name)'}  |  ${data.email || ''}`);
  });
}

main().catch(console.error);
