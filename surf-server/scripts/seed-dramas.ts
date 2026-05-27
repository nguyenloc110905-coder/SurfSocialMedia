import 'dotenv/config';
import { getDb } from '../src/config/firebase-admin.js';

const USERS = [
  { name: 'Nguyễn Tiến Thịnh', avatar: 'https://i.pravatar.cc/150?img=11' },
  { name: 'Trần Quỳnh Hương', avatar: 'https://i.pravatar.cc/150?img=12' },
  { name: 'Lê Gia Huy', avatar: 'https://i.pravatar.cc/150?img=13' },
  { name: 'Phạm Phương Thảo', avatar: 'https://i.pravatar.cc/150?img=14' },
  { name: 'Hoàng Quốc Việt', avatar: 'https://i.pravatar.cc/150?img=15' },
  { name: 'Vũ Thanh Hằng', avatar: 'https://i.pravatar.cc/150?img=16' },
  { name: 'Đặng Thái Sơn', avatar: 'https://i.pravatar.cc/150?img=17' },
  { name: 'Bùi Mai Phương', avatar: 'https://i.pravatar.cc/150?img=18' },
  { name: 'Đỗ Tuấn Kiệt', avatar: 'https://i.pravatar.cc/150?img=19' },
  { name: 'Ngô Hà My', avatar: 'https://i.pravatar.cc/150?img=20' },
];

const POSTS = [
  {
    content: "Lần đầu đi ăn nhà hàng Michelin ở Quận 1 mà thất vọng tràn trề. Gọi đĩa bò Wagyu 2 củ rưỡi mà nướng chín quéo lại dai nhách. Vừa ăn vừa bực, khuyên thật mọi người đừng phí tiền! 😤🍖",
    mediaUrls: ["https://images.unsplash.com/photo-1544025162-811114bd4232?auto=format&fit=crop&q=80&w=1200"],
  },
  {
    content: "Cảnh báo lừa đảo book phòng Phú Quốc! 🚨🚨 Tưởng vớ được deal Villa rẻ bằng nửa giá gốc, chuyển khoản cọc 5 củ xong page lặn mất tăm. Nhìn hình đẹp lộng lẫy mà tức sôi máu. Mọi người cẩn thận nha...",
    mediaUrls: ["https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?auto=format&fit=crop&q=80&w=1200"],
  },
  {
    content: "Môi trường công sở toxic nhất mình từng thấy: Sếp bắt OT không lương, hr thì ép KPI vô lý, hội chị em thì chia bè kéo phái nói xấu sau lưng. Bái bai sau 1 tháng thử việc! 👋",
    mediaUrls: ["https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&q=80&w=1200"],
  },
  {
    content: "Cười ẻ phe phe ôm vé concert BlackPink ôm mộng làm giàu. Giờ vé VIP từ 10 củ rớt xuống còn 3 củ bán không ai thèm mua. Cho chừa cái thói đầu cơ trục lợi nhé! 😂",
    mediaUrls: ["https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&q=80&w=1200"],
  },
  {
    content: "Kẹt xe kinh hoàng ở nút giao An Phú. Mưa ngập nửa bánh xe, kẹt cứng 2 tiếng đồng hồ không nhích được cm nào. Sài Gòn mùa mưa đúng là ác mộng ☔🛵",
    mediaUrls: ["https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&q=80&w=1200"],
  },
  {
    content: "Bóc phốt cái bar 'chill chill' trên đường PNL. Ghi trên mạng combo 599k, vô gọi ra thì bắt tính thêm phí dịch vụ 20%, VAT 10%, phí bàn 200k. Tổng bill 1 củ 2? Ơ kìa làm ăn kiểu gì vậy chời? 🤨🍸",
    mediaUrls: ["https://images.unsplash.com/photo-1566737236500-c8ac43014a67?auto=format&fit=crop&q=80&w=1200"],
  },
  {
    content: "Trời ơi cứu tui cứu tui! Boss nhà tui vừa cào rách cái sofa 15 củ mới mua tuần trước xong mặt nó còn tỉnh bơ lườm tui như kiểu 'sofa của trẫm, trẫm thích làm gì thì làm' 😭😭😭",
    mediaUrls: ["https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&q=80&w=1200"],
  },
  {
    content: "Trend flex lương trên mạng dạo này ảo ma vãi. Ai cũng kêu sinh viên mới ra trường thu nhập 50-100 triệu/tháng? Điêu vừa thôi cho người ta còn sống với chứ, tui đi làm 5 năm lương 15 củ đang trầm cảm đây 🥲",
    mediaUrls: ["https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&q=80&w=1200"],
  },
  {
    content: "Mấy ông PT phòng gym bây giờ chảnh ghê. Mình đi tập không thuê PT thì bị lườm nguýt, lúc xài máy thì bị đuổi khéo để nhường cho khách VIP của mấy ổng. Huỷ thẻ chuyển chỗ khác gấp! 🏋️‍♂️",
    mediaUrls: ["https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&q=80&w=1200"],
  },
  {
    content: "Cú lừa ngoạn mục ngày săn sale: Đặt mua cái áo khoác da xịn xò freesize, hàng giao tới thì là cái áo thun mỏng dính bé tí như nùi giẻ. Nhắn shop thì seen không rep. Mọi người né cái shop này ra nhé 🤬",
    mediaUrls: ["https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&q=80&w=1200"],
  }
];

async function main() {
  const db = getDb();
  
  // 1. Tạo users thật để đăng bài (tránh lỗi ẩn danh)
  console.log('🌱 Đang tạo danh sách users ảo để đăng bài...');
  const userDocs = [];
  for (let i = 0; i < USERS.length; i++) {
    const id = `drama-user-${i}`;
    const user = USERS[i];
    await db.collection('users').doc(id).set({
      uid: id,
      displayName: user.name,
      photoURL: user.avatar,
      email: `drama${i}@surf.local`,
      createdAt: new Date(),
      updatedAt: new Date()
    }, { merge: true });
    userDocs.push({ id, ...user });
  }

  // 2. Đăng bài với hình ảnh đa dạng
  const postsRef = db.collection('posts');
  console.log(`🌱 Bắt đầu seed ${POSTS.length} bài viết đa dạng, full hình ảnh...`);

  for (let i = 0; i < POSTS.length; i++) {
    const post = POSTS[i];
    const user = userDocs[i % userDocs.length];
    
    const likeCount = Math.floor(Math.random() * 2000) + 500; // Siêu khủng để luôn top feed
    const replyCount = Math.floor(Math.random() * 500) + 100;
    
    // Bài viết rất mới (vài giờ trước)
    const now = Date.now();
    const createdAtMs = now - Math.floor(Math.random() * 5 * 60 * 60 * 1000);
    const createdAt = new Date(createdAtMs);

    const newPost = {
      ...post,
      authorId: user.id,
      authorDisplayName: user.name,
      authorPhotoURL: user.avatar,
      privacy: 'public',
      parentId: null,
      likeCount,
      replyCount,
      repostCount: 0,
      createdAt,
      updatedAt: createdAt,
    };

    await postsRef.add(newPost);
    console.log(`✓ Đã tạo bài viết của ${user.name}`);
  }

  console.log(`\n✅ Đã seed xong! Hình ảnh xịn xò, user avatar đầy đủ, tương tác khủng!`);
}

main().catch((e) => {
  console.error('❌ Lỗi:', e);
  process.exit(1);
});
