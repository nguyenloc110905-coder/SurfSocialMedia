/**
 * Tạo nhiều user test trong Firestore để Gợi ý kết bạn có người khi test local.
 * Chạy từ thư mục surf-server: npm run seed:test-users
 * (Cần đã cấu hình .env với FIREBASE_SERVICE_ACCOUNT_JSON hoặc PATH)
 */
import 'dotenv/config';
import { getDb } from '../src/config/firebase-admin.js';

const FIRST_NAMES = ['Minh', 'Anh', 'Hùng', 'Linh', 'Hương', 'Tuấn', 'Phương', 'Khoa', 'Trang', 'Dũng', 'Mai', 'Quân', 'Nga', 'Hải', 'Thảo'];
const LAST_NAMES = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Ngô', 'Dương'];

const AVATARS = [
  'https://i.pravatar.cc/150?img=1',
  'https://i.pravatar.cc/150?img=2',
  'https://i.pravatar.cc/150?img=3',
  'https://i.pravatar.cc/150?img=5',
  'https://i.pravatar.cc/150?img=8',
  'https://i.pravatar.cc/150?img=9',
  'https://i.pravatar.cc/150?img=12',
  'https://i.pravatar.cc/150?img=13',
  'https://i.pravatar.cc/150?img=14',
  'https://i.pravatar.cc/150?img=16',
];

/** Tạo 15 user test với tên và avatar ngẫu nhiên */
async function main() {
  const db = getDb();
  const usersRef = db.collection('users');
  const now = new Date();
  const count = 15;

  console.log(`🌱 Tạo ${count} user test...`);

  for (let i = 1; i <= count; i++) {
    const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
    const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
    const displayName = `${lastName} ${firstName}`;
    const email = `test${i}@surf.local`;
    const photoURL = Math.random() > 0.3 ? AVATARS[Math.floor(Math.random() * AVATARS.length)] : null;
    const id = `test-user-${i}`;

    await usersRef.doc(id).set(
      {
        uid: id,
        displayName,
        email,
        photoURL,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
    console.log(`✓ ${displayName} (${id})`);
  }

  console.log(`\n✅ Đã tạo ${count} user test!`);
  console.log('📝 Tải lại trang Bạn bè → Gợi ý để thấy danh sách user.');
  console.log('🔍 Hoặc tìm kiếm theo tên (vd: "Minh", "Anh", "Nguyễn").');
}

main().catch((e) => {
  console.error('❌ Lỗi:', e);
  process.exit(1);
});
