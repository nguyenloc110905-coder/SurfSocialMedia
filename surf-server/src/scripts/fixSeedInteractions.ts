import { getDb } from '../config/firebase-admin.js';

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomItem = <T>(arr: T[]): T => arr[randomInt(0, arr.length - 1)];

const FAKE_COMMENTS = [
  'Đỉnh quá chủ thớt ơi! 🤩',
  'Chuẩn luôn, không thể đồng ý hơn!',
  'Cho xin thêm thông tin với ạ.',
  'Bài viết rất hay, cảm ơn bạn đã chia sẻ.',
  'Ui cái này mình cũng bị y chang 🥲',
  'Tuyệt vời! 🔥',
  'Thực sự đọc xong thấy mở mang tầm mắt.',
  'Haha, cười đau cả ruột 🤣',
  'Mình đã thử và thành công, thanks nhé!',
  'Đỉnh của chóp luôn 💯',
  'Có link không bạn ơi?',
  'Nghe vô lý nhưng lại rất thuyết phục 🤔',
  'Ủng hộ bạn 1 tim ❤️',
  'Hay quá, lưu lại học hỏi thôi.',
  'Bác nói chí phải!',
];

async function fixInteractions() {
  console.log('🚀 Đang sửa lại tương tác thật cho 100 bài viết mẫu...');
  const db = getDb();

  // 1. Lấy 20 users mẫu để làm tác giả comment & like
  const seedUserIds = Array.from({ length: 20 }, (_, i) => `seed_user_${i}`);
  const usersSnap = await db.collection('users').where('uid', 'in', seedUserIds.slice(0, 10)).get();
  const usersSnap2 = await db
    .collection('users')
    .where('uid', 'in', seedUserIds.slice(10, 20))
    .get();
  const allSeedUsers = [...usersSnap.docs, ...usersSnap2.docs].map((d) => d.data());

  // 2. Lấy 100 bài viết mẫu
  const [snap1, snap2] = await Promise.all([
    db.collection('posts').where('authorId', 'in', seedUserIds.slice(0, 10)).get(),
    db.collection('posts').where('authorId', 'in', seedUserIds.slice(10, 20)).get(),
  ]);
  const allPosts = [...snap1.docs, ...snap2.docs];

  const batchArray = [db.batch()];
  let opCount = 0;

  console.log(`Tìm thấy ${allPosts.length} bài viết. Đang tạo dữ liệu tương tác THẬT...`);

  // Xóa các comment cũ của seed users để tạo lại cho sạch (optional, để đơn giản ta cứ tạo mới)

  for (const doc of allPosts) {
    // ---- 1. Fix LIKES ----
    // Chọn ngẫu nhiên 5-20 users để like bài này
    const shuffledUsers = [...allSeedUsers].sort(() => 0.5 - Math.random());
    const realLikeCount = randomInt(5, 20);
    const likers = shuffledUsers.slice(0, realLikeCount);

    const likedBy = likers.map((u) => u.uid);
    const reactions: Record<string, string> = {};
    likers.forEach((u) => {
      reactions[u.uid] = '❤️'; // Hoặc random cảm xúc khác
    });

    // ---- 2. Fix COMMENTS ----
    const realCommentCount = randomInt(3, 8);
    const commenters = [...allSeedUsers].sort(() => 0.5 - Math.random()).slice(0, realCommentCount);

    for (const commenter of commenters) {
      const commentRef = db.collection('comments').doc();
      const commentObj = {
        postId: doc.id,
        authorId: commenter.uid,
        authorDisplayName: commenter.displayName,
        authorPhotoURL: commenter.photoURL,
        content: randomItem(FAKE_COMMENTS),
        createdAt: new Date(Date.now() - randomInt(1, 10) * 3600000), // Random vài tiếng trước
        updatedAt: new Date(),
        likeCount: 0,
        likedBy: [],
        deleted: false,
      };

      batchArray[batchArray.length - 1].set(commentRef, commentObj);
      opCount++;
      if (opCount >= 400) {
        batchArray.push(db.batch());
        opCount = 0;
      }
    }

    // Cập nhật lại Post với con số thật
    batchArray[batchArray.length - 1].update(doc.ref, {
      likeCount: realLikeCount,
      likedBy: likedBy,
      reactions: reactions,
      replyCount: realCommentCount,
    });
    opCount++;
    if (opCount >= 400) {
      batchArray.push(db.batch());
      opCount = 0;
    }
  }

  for (const b of batchArray) {
    await b.commit();
  }

  console.log('✅ Đã tạo tương tác THẬT (Comments và Likes) thành công!');
}

fixInteractions().catch(console.error);
