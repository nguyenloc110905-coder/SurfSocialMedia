import fs from 'fs';
import path from 'path';
import { getDb, admin } from '../config/firebase-admin.js';
import { getStorage } from 'firebase-admin/storage';

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomItem = <T>(arr: T[]): T => arr[randomInt(0, arr.length - 1)];

const TITLES = [
  'Pha highlight không tưởng 😱',
  'Anh em thấy kỹ năng tôi thế nào?',
  'Trend mới nè cả nhà ơi 🔥',
  'Cười rớt hàm với thanh niên này 🤣',
  'Đẳng cấp là đây chứ đâu',
  'Lên rank cùng đồng đội',
  'Quá xuất sắc 💯',
  'Góc thư giãn cuối ngày ☕',
  'Một ngày bình yên 🌿',
  'Chưa từng thấy cảnh này bao giờ',
];

const FAKE_COMMENTS = [
  'Đỉnh quá chủ thớt ơi! 🤩',
  'Video cuốn quá!',
  'Bao giờ ra phần tiếp theo vậy bạn?',
  'Xin link nhạc với ạ 🎵',
  'Mình xem đi xem lại nãy giờ không chán',
  'Tuyệt vời! 🔥',
  'Quay bằng máy gì mà nét thế?',
  'Haha, cười đau cả ruột 🤣',
  'Hay quá, lưu lại học hỏi thôi.',
  'Đỉnh của chóp luôn 💯',
  'Người chơi hệ xuất sắc',
  'Nghe vô lý nhưng lại rất thuyết phục 🤔',
  'Ủng hộ bạn 1 tim ❤️',
  'Idol của lòng em',
  'Bác nói chí phải!',
];

async function seedVideos() {
  console.log('🚀 Bắt đầu seed 20 video từ thư mục Surf-clips-seed...');
  const db = getDb();
  const bucket = getStorage().bucket('surf-7ce71.firebasestorage.app');

  const videoDir = path.resolve(process.cwd(), '../docs/Surf-clips-seed');
  if (!fs.existsSync(videoDir)) {
    console.error('Không tìm thấy thư mục:', videoDir);
    return;
  }

  const files = fs.readdirSync(videoDir).filter((f) => f.endsWith('.mp4'));
  if (files.length === 0) {
    console.error('Không có file .mp4 nào trong thư mục.');
    return;
  }

  console.log(`Tìm thấy ${files.length} video. Đang lấy danh sách users mẫu...`);

  const seedUserIds = Array.from({ length: 20 }, (_, i) => `seed_user_${i}`);
  const [usersSnap1, usersSnap2] = await Promise.all([
    db.collection('users').where('uid', 'in', seedUserIds.slice(0, 10)).get(),
    db.collection('users').where('uid', 'in', seedUserIds.slice(10, 20)).get(),
  ]);
  const allSeedUsers = [...usersSnap1.docs, ...usersSnap2.docs].map((d) => d.data());

  if (allSeedUsers.length === 0) {
    console.error('Không tìm thấy users mẫu! Bạn cần chạy seedRealistic.ts trước.');
    return;
  }

  const batchArray = [db.batch()];
  let opCount = 0;

  for (const file of files) {
    const filePath = path.join(videoDir, file);
    const destPath = `seed_videos/${file}`;

    // Upload file to Firebase Storage
    console.log(`Đang upload ${file}...`);
    try {
      await bucket.upload(filePath, {
        destination: destPath,
        metadata: {
          contentType: 'video/mp4',
        },
      });
      // Set file public to get direct URL
      await bucket.file(destPath).makePublic();
    } catch (err) {
      console.log(`Upload ${file} lỗi (có thể đã tồn tại):`, (err as Error).message);
    }

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destPath}`;

    // Tạo video doc
    const author = randomItem(allSeedUsers);
    const videoRef = db.collection('videos').doc();
    const createdAt = new Date(Date.now() - randomInt(1, 48) * 3600000);

    const realLikeCount = randomInt(5, 20);
    const shuffledUsers = [...allSeedUsers].sort(() => 0.5 - Math.random());
    const likers = shuffledUsers.slice(0, realLikeCount);

    const videoData = {
      authorId: author.uid,
      authorDisplayName: author.displayName,
      authorPhotoURL: author.photoURL,
      title: randomItem(TITLES),
      description:
        'Video chất lượng cao từ dự án Surf 🌊 #' +
        randomItem(['surf', 'trending', 'foryou', 'highlight']),
      videoUrl: publicUrl,
      thumbnailUrl: null,
      duration: 0,
      tags: ['surf', 'trending', 'foryou', 'highlight'].slice(0, randomInt(1, 4)),
      privacy: 'public',
      location: null,
      allowComments: true,
      aiGenerated: false,
      editOptions: {},
      textOverlays: [],
      likeCount: realLikeCount,
      likedBy: likers.map((u) => u.uid),
      commentCount: 0,
      viewCount: randomInt(100, 2000),
      createdAt: createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    };

    // Tạo Comments thật
    const realCommentCount = randomInt(3, 8);
    videoData.commentCount = realCommentCount;
    const commenters = [...allSeedUsers].sort(() => 0.5 - Math.random()).slice(0, realCommentCount);

    for (const commenter of commenters) {
      const commentRef = db.collection('comments').doc();
      const commentObj = {
        postId: videoRef.id,
        authorId: commenter.uid,
        authorDisplayName: commenter.displayName,
        authorPhotoURL: commenter.photoURL,
        content: randomItem(FAKE_COMMENTS),
        createdAt: new Date(createdAt.getTime() + randomInt(1, 60) * 60000),
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

    batchArray[batchArray.length - 1].set(videoRef, videoData);
    opCount++;
    if (opCount >= 400) {
      batchArray.push(db.batch());
      opCount = 0;
    }
  }

  for (const b of batchArray) {
    await b.commit();
  }

  console.log('✅ Đã seed thành công 20 video clip với tương tác THẬT (Comments/Likes)!');
}

seedVideos().catch(console.error);
