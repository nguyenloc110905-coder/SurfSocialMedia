import { getDb } from '../config/firebase-admin.js';

async function clearCollection(collectionPath: string) {
  const db = getDb();
  const collectionRef = db.collection(collectionPath);
  const snapshot = await collectionRef.get();

  if (snapshot.empty) {
    console.log(`Collection ${collectionPath} is empty.`);
    return;
  }

  const batchSize = 100;
  let batch = db.batch();
  let count = 0;

  for (const doc of snapshot.docs) {
    batch.delete(doc.ref);
    count++;

    if (count % batchSize === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }

  if (count % batchSize !== 0) {
    await batch.commit();
  }

  console.log(`Deleted ${count} documents from ${collectionPath}.`);
}

async function run() {
  try {
    console.log('Bắt đầu xóa dữ liệu cũ...');
    
    // Xóa các collection chứa ảnh/video Cloudinary
    await clearCollection('posts');
    await clearCollection('videos');
    await clearCollection('moments');
    await clearCollection('comments');
    await clearCollection('notifications');
    
    // Nếu muốn xóa luôn user thì mở comment dòng dưới:
    // await clearCollection('users');

    console.log('✅ Đã xóa sạch dữ liệu cũ!');
    process.exit(0);
  } catch (error) {
    console.error('Lỗi khi xóa dữ liệu:', error);
    process.exit(1);
  }
}

run();
