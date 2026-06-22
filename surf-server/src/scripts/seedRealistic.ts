import { getDb } from '../config/firebase-admin.js';

// Danh sách tên người dùng VN ngẫu nhiên
const VN_NAMES = [
  'Nguyễn Tấn Khang',
  'Trần Hà My',
  'Lê Hải Đăng',
  'Phạm Quỳnh Anh',
  'Hoàng Tuấn Kiệt',
  'Vũ Mai Phương',
  'Đặng Thành Công',
  'Bùi Ngọc Yến',
  'Đỗ Minh Trí',
  'Hồ Bích Ngọc',
  'Ngô Quốc Bảo',
  'Dương Thúy Quỳnh',
  'Lý Cẩm Tú',
  'Đào Duy Anh',
  'Đoàn Thanh Trúc',
  'Vương Trọng Nghĩa',
  'Trịnh Phương Linh',
  'Đinh Tiến Đạt',
  'Lâm Tường Vy',
  'Phan Thế Hiển',
];

// Các chủ đề game và đời sống
const POST_TEMPLATES = [
  // Game LOL
  'Nay chuỗi lên rank Đại Cao Thủ mà gặp toàn yasuo gánh team bạn. Trầm cảm thực sự 😭 #lol #lienminh',
  'Tìm dual leo rank Kim Cương tối nay. Mình chuyên Support Lulu, Nami nha. Ai kéo mị với 🥺',
  'Trận hôm qua T1 đánh khét lẹt, Faker vẫn là một hệ tư tưởng quá khác biệt! 🐐 #faker #t1',
  'Skin mới của Ahri đẹp xỉu, nhưng mà giá hơi chát. Có bác nào hiến máu chưa cho xin review? 🦊',
  // Liên Quân
  'Rank Cao Thủ Liên Quân giờ toxic quá, hở tí là afk chửi thề. Chắc nghỉ game chuyển qua chơi nông trại 🌽',
  'Flo múa lủng màng nhĩ, vừa vào combat đã bay màu. Ai dạy mình múa Flo với 🙏 #lienquan',
  'Đang tìm team đánh giải ao làng cuối tuần này, thiếu 1 slot đi Rừng. Inbox lẹ anh em ơi!',
  // CS2 / Valorant
  'Bắn Valorant ping 100ms thì chơi bời gì nữa? Mạng VNPT dạo này chán quá 😡 #valorant',
  'Vừa mở hòm CS2 ra con dao 2 triệu, hên quá anh em ơi! Cảm giác như trúng số 💸 #cs2 #luck',
  'Aim dạo này phế quá, chắc già rồi tay chậm mắt mờ. Bắn 10 viên trượt cả 10 😢',
  // Đời sống
  'Mưa Sài Gòn buồn quá, thèm một nồi lẩu Thái chua cay ghê 🍲🌧️',
  'Nay deadline sấp mặt, code mãi không hết bug. Cứu tôi! 💻🚨',
  'Cuối tuần rồi, xách balo lên và đi Đà Lạt thôi ae ơi! 🌲🏕️',
  'Cà phê sáng một mình, suy nghĩ về nhân sinh quan và... tối nay ăn gì ☕🤔',
  'Vừa xem xong phim Deadpool & Wolverine, cười đau cả bụng. Đỉnh của chóp! 🍿🎬',
  'Lương chưa về mà giỏ hàng Shopee đã 10 củ. Đau ví quá 💸',
  'Dạo này ghiền nghe nhạc lofi chill chill lúc code, anh em có playlist nào hay share mình với 🎵',
  'Sáng thức dậy thấy trời xanh mây trắng, tự nhiên thấy yêu đời ngang ☀️',
  'Nuôi con mèo mập này tốn cơm quá, suốt ngày chỉ biết ngủ và đòi ăn 🐈',
  'Chạy bộ 5km xong thở không nổi. Quyết tâm giảm cân từ hôm nay! 🏃‍♂️💪',
];

// Danh sách link ảnh từ Unsplash (chủ đề game, phong cảnh, đồ ăn, mèo, máy tính)
const IMAGE_URLS = [
  'https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=800&auto=format&fit=crop', // Game controller
  'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?q=80&w=800&auto=format&fit=crop', // Gaming PC
  'https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=800&auto=format&fit=crop', // Arcade
  'https://images.unsplash.com/photo-1552820728-8b83bb6b773f?q=80&w=800&auto=format&fit=crop', // Gaming setup
  'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=800&auto=format&fit=crop', // Retro game
  'https://images.unsplash.com/photo-1605810230434-7631ac76ec81?q=80&w=800&auto=format&fit=crop', // Cyberpunk
  'https://images.unsplash.com/photo-1498837167922-ddd27525d352?q=80&w=800&auto=format&fit=crop', // Food
  'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?q=80&w=800&auto=format&fit=crop', // Pizza
  'https://images.unsplash.com/photo-1517331156700-3c241d2b4d83?q=80&w=800&auto=format&fit=crop', // Cat
  'https://images.unsplash.com/photo-1495360010541-f48722b34f7d?q=80&w=800&auto=format&fit=crop', // Cat close up
  'https://images.unsplash.com/photo-1506744626753-eda814117714?q=80&w=800&auto=format&fit=crop', // Nature landscape
  'https://images.unsplash.com/photo-1449844908441-8829872d2607?q=80&w=800&auto=format&fit=crop', // City rain
  'https://images.unsplash.com/photo-1498050108023-c5249f4df085?q=80&w=800&auto=format&fit=crop', // Code
  'https://images.unsplash.com/photo-1511376868136-742c0de8c9a8?q=80&w=800&auto=format&fit=crop', // Cafe
];

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomItem = <T>(arr: T[]): T => arr[randomInt(0, arr.length - 1)];

const VN_CITIES = [
  'Hà Nội',
  'Hồ Chí Minh',
  'Đà Nẵng',
  'Cần Thơ',
  'Hải Phòng',
  'Huế',
  'Nha Trang',
  'Đà Lạt',
];
const JOBS = [
  'Software Engineer tại FPT Software',
  'UI/UX Designer tại VNG',
  'Sinh viên tại Đại học Bách Khoa',
  'Marketing Executive tại Shopee',
  'Freelancer',
  'Sinh viên tại RMIT',
  'Data Analyst tại Momo',
  'Game Developer tại VTC',
];
const EDUCATIONS = [
  'Đại học Bách Khoa Hà Nội',
  'Đại học Bách Khoa TP.HCM',
  'RMIT University',
  'Đại học FPT',
  'Đại học Tôn Đức Thắng',
  'Đại học Khoa học Tự nhiên',
];
const REL_STATUS = ['Độc thân', 'Đang hẹn hò', 'Đã kết hôn', 'Phức tạp'];
const BIOS = [
  'Thích chơi game và code dạo. 🚀',
  'Yêu mèo, thích ăn lẩu Thái và hay đi Đà Lạt. 🐈',
  'Một ngày không có cà phê là một ngày vô nghĩa. ☕',
  'Code is like humor. When you have to explain it, it’s bad. 💻',
  'Đang trong giai đoạn trầm cảm vì chạy deadline. 🥲',
  'Sống chậm lại, nghĩ khác đi và yêu thương nhiều hơn. ❤️',
  'Gamer part-time, dev full-time. 🎮',
  'Hãy sống như thể hôm nay là ngày cuối cùng! 🌟',
];

async function seedData() {
  console.log('🚀 Bắt đầu quá trình cập nhật thông tin cá nhân cho users...');
  const db = getDb();

  // 1. Tạo 20 Users giả lập
  console.log('Cập nhật 20 người dùng giả lập...');
  const users: any[] = [];
  const batch1 = db.batch();

  for (let i = 0; i < VN_NAMES.length; i++) {
    const userId = `seed_user_${i}`;
    const name = VN_NAMES[i];
    const photoURL = `https://i.pravatar.cc/150?u=${userId}`;
    const coverImageUrl = `https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=800&auto=format&fit=crop&sig=${i}`;

    // Random sinh nhật từ 1990 đến 2005
    const birthYear = randomInt(1990, 2005);
    const birthMonth = randomInt(1, 12);
    const birthDay = randomInt(1, 28);
    const birthday = `${birthYear}-${birthMonth.toString().padStart(2, '0')}-${birthDay.toString().padStart(2, '0')}`;

    const userObj = {
      uid: userId,
      displayName: name,
      photoURL: photoURL,
      coverImageUrl: coverImageUrl,
      email: `user${i}@surf.local`,
      defaultPostPrivacy: 'public',
      bio: randomItem(BIOS),
      currentCity: randomItem(VN_CITIES),
      hometown: randomItem(VN_CITIES),
      work: randomItem(JOBS),
      education: randomItem(EDUCATIONS),
      relationship: randomItem(REL_STATUS),
      gender: Math.random() > 0.5 ? 'Nam' : 'Nữ',
      birthday: birthday,
      website: 'https://github.com/nguyenloc110905-coder',
      createdAt: new Date(Date.now() - randomInt(1, 100) * 86400000),
      notificationPrefs: {},
    };
    users.push(userObj);
    // Sử dụng merge để không ghi đè mất các trường khác nếu có
    batch1.set(db.collection('users').doc(userId), userObj, { merge: true });
  }
  await batch1.commit();
  console.log('✅ Đã cập nhật xong thông tin cá nhân cho 20 Users');

  console.log('🎉 Hoàn thành cập nhật. Hãy F5 lại ứng dụng để xem kết quả.');
  process.exit(0); // Dừng script ở đây vì đã tạo posts rồi
}
seedData().catch(console.error);
