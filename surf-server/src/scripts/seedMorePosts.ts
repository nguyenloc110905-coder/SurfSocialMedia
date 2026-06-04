import { getDb } from '../config/firebase-admin.js';

// Các chủ đề game và đời sống (Có thể phong phú hơn)
const POST_TEMPLATES = [
  'Nay chuỗi lên rank Đại Cao Thủ mà gặp toàn yasuo gánh team bạn. Trầm cảm thực sự 😭',
  'Tìm dual leo rank Kim Cương tối nay. Mình chuyên Support Lulu, Nami nha. Ai kéo mị với 🥺',
  'Trận hôm qua T1 đánh khét lẹt, Faker vẫn là một hệ tư tưởng quá khác biệt! 🐐',
  'Skin mới của Ahri đẹp xỉu, nhưng mà giá hơi chát. Có bác nào hiến máu chưa cho xin review? 🦊',
  'Rank Cao Thủ Liên Quân giờ toxic quá, hở tí là afk chửi thề. Chắc nghỉ game chuyển qua chơi nông trại 🌽',
  'Flo múa lủng màng nhĩ, vừa vào combat đã bay màu. Ai dạy mình múa Flo với 🙏',
  'Đang tìm team đánh giải ao làng cuối tuần này, thiếu 1 slot đi Rừng. Inbox lẹ anh em ơi!',
  'Bắn Valorant ping 100ms thì chơi bời gì nữa? Mạng VNPT dạo này chán quá 😡',
  'Vừa mở hòm CS2 ra con dao 2 triệu, hên quá anh em ơi! Cảm giác như trúng số 💸',
  'Aim dạo này phế quá, chắc già rồi tay chậm mắt mờ. Bắn 10 viên trượt cả 10 😢',
  'Mưa Sài Gòn buồn quá, thèm một nồi lẩu Thái chua cay ghê 🍲🌧️',
  'Nay deadline sấp mặt, code mãi không hết bug. Cứu tôi! 💻🚨',
  'Cuối tuần rồi, xách balo lên và đi Đà Lạt thôi ae ơi! 🌲🏕️',
  'Cà phê sáng một mình, suy nghĩ về nhân sinh quan và... tối nay ăn gì ☕🤔',
  'Vừa xem xong phim mới, cười đau cả bụng. Đỉnh của chóp! 🍿🎬',
  'Lương chưa về mà giỏ hàng Shopee đã 10 củ. Đau ví quá 💸',
  'Dạo này ghiền nghe nhạc lofi chill chill lúc code, anh em có playlist nào hay share mình với 🎵',
  'Sáng thức dậy thấy trời xanh mây trắng, tự nhiên thấy yêu đời ngang ☀️',
  'Nuôi con mèo mập này tốn cơm quá, suốt ngày chỉ biết ngủ và đòi ăn 🐈',
  'Chạy bộ 5km xong thở không nổi. Quyết tâm giảm cân từ hôm nay! 🏃‍♂️💪'
];

const IMAGE_URLS = [
  'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1552820728-8b83bb6b773f?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1605810230434-7631ac76ec81?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1498837167922-ddd27525d352?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1517331156700-3c241d2b4d83?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1495360010541-f48722b34f7d?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1506744626753-eda814117714?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1449844908441-8829872d2607?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1498050108023-c5249f4df085?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1511376868136-742c0de8c9a8?q=80&w=800&auto=format&fit=crop'
];

const FAKE_COMMENTS = [
  'Đỉnh quá chủ thớt ơi! 🤩', 'Chuẩn luôn, không thể đồng ý hơn!', 'Cho xin thêm thông tin với ạ.',
  'Bài viết rất hay, cảm ơn bạn đã chia sẻ.', 'Ui cái này mình cũng bị y chang 🥲', 'Tuyệt vời! 🔥',
  'Thực sự đọc xong thấy mở mang tầm mắt.', 'Haha, cười đau cả ruột 🤣', 'Mình đã thử và thành công, thanks nhé!',
  'Đỉnh của chóp luôn 💯', 'Có link không bạn ơi?', 'Nghe vô lý nhưng lại rất thuyết phục 🤔',
  'Ủng hộ bạn 1 tim ❤️', 'Hay quá, lưu lại học hỏi thôi.', 'Bác nói chí phải!'
];

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomItem = <T>(arr: T[]): T => arr[randomInt(0, arr.length - 1)];

async function seedMorePosts() {
  console.log('🚀 Bắt đầu seed thêm 100 bài viết mới (kèm tương tác thật)...');
  const db = getDb();

  // 1. Lấy 20 users mẫu để làm tác giả
  const seedUserIds = Array.from({ length: 20 }, (_, i) => `seed_user_${i}`);
  const [usersSnap1, usersSnap2] = await Promise.all([
    db.collection('users').where('uid', 'in', seedUserIds.slice(0, 10)).get(),
    db.collection('users').where('uid', 'in', seedUserIds.slice(10, 20)).get(),
  ]);
  const allSeedUsers = [...usersSnap1.docs, ...usersSnap2.docs].map(d => d.data());

  if (allSeedUsers.length === 0) {
    console.error('Không tìm thấy users mẫu! Bạn cần chạy seedRealistic.ts trước.');
    return;
  }

  const batchArray = [db.batch()];
  let opCount = 0;

  for (let i = 0; i < 100; i++) {
    const postRef = db.collection('posts').doc();
    const author = randomItem(allSeedUsers);
    
    // Tỉ lệ có ảnh là 60%
    const hasImage = Math.random() > 0.4;
    const mediaUrls = hasImage ? [randomItem(IMAGE_URLS)] : [];
    
    // Mix nội dung text
    let content = randomItem(POST_TEMPLATES);
    if (Math.random() > 0.5) content += ` (Phần ${randomInt(1, 99)})`;

    // Thời gian đăng: ngẫu nhiên trong vòng 48 giờ qua để có điểm thuật toán cao
    const createdAt = new Date(Date.now() - randomInt(1, 48) * 3600000);

    // Tương tác thật: Likes
    const shuffledUsers = [...allSeedUsers].sort(() => 0.5 - Math.random());
    const realLikeCount = randomInt(5, 20);
    const likers = shuffledUsers.slice(0, realLikeCount);
    const likedBy = likers.map(u => u.uid);
    const reactions: Record<string, string> = {};
    likers.forEach(u => {
      reactions[u.uid] = '❤️';
    });

    // Tương tác thật: Comments
    const realCommentCount = randomInt(3, 8);
    const commenters = [...allSeedUsers].sort(() => 0.5 - Math.random()).slice(0, realCommentCount);
    
    for (const commenter of commenters) {
      const commentRef = db.collection('comments').doc();
      const commentObj = {
        postId: postRef.id,
        authorId: commenter.uid,
        authorDisplayName: commenter.displayName,
        authorPhotoURL: commenter.photoURL,
        content: randomItem(FAKE_COMMENTS),
        createdAt: new Date(createdAt.getTime() + randomInt(1, 60) * 60000), // Comment sau khi đăng vài phút
        updatedAt: new Date(),
        likeCount: 0,
        likedBy: [],
        deleted: false
      };
      
      batchArray[batchArray.length - 1].set(commentRef, commentObj);
      opCount++;
      if (opCount >= 400) {
        batchArray.push(db.batch());
        opCount = 0;
      }
    }

    const postObj = {
      authorId: author.uid,
      authorDisplayName: author.displayName,
      authorPhotoURL: author.photoURL,
      content: content,
      mediaUrls: mediaUrls,
      privacy: 'public',
      createdAt: createdAt,
      updatedAt: createdAt,
      likeCount: realLikeCount,
      likedBy: likedBy,
      reactions: reactions,
      replyCount: realCommentCount,
      hasVideo: false,
      deleted: false,
      parentId: null // Rất quan trọng để hiện lên feed!
    };

    batchArray[batchArray.length - 1].set(postRef, postObj);
    opCount++;
    if (opCount >= 400) {
      batchArray.push(db.batch());
      opCount = 0;
    }
  }

  for (const b of batchArray) {
    await b.commit();
  }
  
  console.log('✅ Đã tạo thành công 100 bài viết mới với tương tác THẬT (Comments/Likes)!');
}

seedMorePosts().catch(console.error);
