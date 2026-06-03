import { getDb } from '../config/firebase-admin.js';

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

async function boostSeedData() {
  console.log('🚀 Đang buff tương tác cho các bài viết mẫu để đẩy lên top Khám phá...');
  const db = getDb();

  // Tìm tất cả bài viết của các user mẫu (seed_user_0 đến seed_user_19)
  const seedUserIds = Array.from({ length: 20 }, (_, i) => `seed_user_${i}`);
  
  // Do giới hạn in của 'in' là 10, ta query thành 2 batch
  const batch1Ids = seedUserIds.slice(0, 10);
  const batch2Ids = seedUserIds.slice(10, 20);

  const [snap1, snap2] = await Promise.all([
    db.collection('posts').where('authorId', 'in', batch1Ids).get(),
    db.collection('posts').where('authorId', 'in', batch2Ids).get(),
  ]);

  const allDocs = [...snap1.docs, ...snap2.docs];
  console.log(`Tìm thấy ${allDocs.length} bài viết mẫu. Bắt đầu buff...`);

  const batchArray = [db.batch()];
  let opCount = 0;

  for (const doc of allDocs) {
    // Tăng like và comment cực cao để ăn điểm thuật toán
    const fakeLikeCount = randomInt(50, 500);
    const fakeReplyCount = randomInt(10, 100);
    // Kéo thời gian đăng lại gần đây (trong vòng 24h qua) để không bị trừ điểm time decay
    const recentDate = new Date(Date.now() - randomInt(1, 24) * 60 * 60 * 1000);

    batchArray[batchArray.length - 1].update(doc.ref, {
      likeCount: fakeLikeCount,
      replyCount: fakeReplyCount,
      createdAt: recentDate,
      updatedAt: recentDate,
      parentId: null
    });

    opCount++;
    if (opCount === 400) {
      batchArray.push(db.batch());
      opCount = 0;
    }
  }

  for (const b of batchArray) {
    await b.commit();
  }

  console.log('✅ Đã buff điểm thuật toán thành công! Các bài viết mẫu giờ sẽ ưu tiên hiển thị ở mục Khám phá.');
}

boostSeedData().catch(console.error);
