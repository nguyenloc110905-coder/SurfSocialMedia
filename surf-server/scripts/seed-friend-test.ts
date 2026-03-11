/**
 * Seed 10 tài khoản test + thiết lập quan hệ bạn bè để kiểm thử đầy đủ:
 *
 * - Bạn bè (mutual friends, tiers, affinity, nicknames)
 * - Lời mời kết bạn (nhận được, đã gửi)
 * - Gợi ý kết bạn (người lạ có bạn chung)
 * - Thông báo
 * - Bài viết để test EdgeRank
 *
 * Chạy: cd surf-server && npx tsx scripts/seed-friend-test.ts
 *
 * ⚠️  Bạn cần thay YOUR_UID bên dưới bằng UID thật của mình trong Firebase.
 */
import 'dotenv/config';
import { getDb } from '../src/config/firebase-admin.js';
import { FieldValue } from 'firebase-admin/firestore';

/* ═══════════════════════════════════════════════════════════════════════════
   CẤU HÌNH: Thay YOUR_UID bằng UID Firebase thật của bạn
   ═══════════════════════════════════════════════════════════════════════════ */
const MY_UID = process.argv[2] || '';
if (!MY_UID) {
  console.error('❌ Vui lòng truyền UID của bạn: npx tsx scripts/seed-friend-test.ts <YOUR_UID>');
  process.exit(1);
}

/* ═══════════════════════════════════════════════════════════════════════════
   10 TÀI KHOẢN TEST
   ═══════════════════════════════════════════════════════════════════════════ */
const TEST_USERS = [
  { id: 'friend-01', name: 'Nguyễn Minh Anh',   email: 'minhanh@surf.test',   photo: 'https://i.pravatar.cc/150?img=1' },
  { id: 'friend-02', name: 'Trần Đức Hùng',     email: 'duchung@surf.test',    photo: 'https://i.pravatar.cc/150?img=3' },
  { id: 'friend-03', name: 'Lê Thuỳ Linh',      email: 'thuylinh@surf.test',   photo: 'https://i.pravatar.cc/150?img=5' },
  { id: 'friend-04', name: 'Phạm Quốc Tuấn',    email: 'quoctuan@surf.test',   photo: 'https://i.pravatar.cc/150?img=8' },
  { id: 'friend-05', name: 'Hoàng Thanh Hương',  email: 'thanhhuong@surf.test', photo: 'https://i.pravatar.cc/150?img=9' },
  { id: 'friend-06', name: 'Võ Đình Khoa',       email: 'dinhkhoa@surf.test',   photo: 'https://i.pravatar.cc/150?img=12' },
  { id: 'friend-07', name: 'Đặng Ngọc Trang',    email: 'ngoctrang@surf.test',  photo: 'https://i.pravatar.cc/150?img=13' },
  { id: 'friend-08', name: 'Bùi Văn Dũng',       email: 'vandung@surf.test',    photo: 'https://i.pravatar.cc/150?img=14' },
  { id: 'friend-09', name: 'Đỗ Thu Hà',          email: 'thuha@surf.test',      photo: 'https://i.pravatar.cc/150?img=16' },
  { id: 'friend-10', name: 'Ngô Hải Nam',        email: 'hainam@surf.test',     photo: 'https://i.pravatar.cc/150?img=2' },
];

/*
  KẾ HOẠCH QUAN HỆ (với MY_UID = bạn):

  ┌────────────┬───────────────────────────────────────────────────────────┐
  │ Tài khoản  │ Quan hệ với bạn                                         │
  ├────────────┼───────────────────────────────────────────────────────────┤
  │ friend-01  │ ✅ Bạn bè — tier: priority — affinity: 15               │
  │ friend-02  │ ✅ Bạn bè — tier: normal — affinity: 5                  │
  │ friend-03  │ ✅ Bạn bè — tier: restricted — affinity: 1              │
  │ friend-04  │ ✅ Bạn bè — tier: normal (default) — affinity: 0        │
  │ friend-05  │ 📩 Gửi lời mời cho bạn (bạn nhận được)                  │
  │ friend-06  │ 📤 Bạn đã gửi lời mời cho họ (pending)                  │
  │ friend-07  │ 👤 Người lạ — có 3 bạn chung (01, 02, 03)              │
  │ friend-08  │ 👤 Người lạ — có 1 bạn chung (01)                      │
  │ friend-09  │ 👤 Người lạ — không có bạn chung                        │
  │ friend-10  │ 👤 Người lạ — có 2 bạn chung (01, 04)                  │
  └────────────┴───────────────────────────────────────────────────────────┘

  BẠN BÈ GIỮA CÁC TEST USERS (để tạo mutual friends):
  - 01 bạn bè với: 02, 03, 04, 07, 08, 10
  - 02 bạn bè với: 01, 03, 07
  - 03 bạn bè với: 01, 02, 07
  - 04 bạn bè với: 01, 10
  - 07 bạn bè với: 01, 02, 03
  - 08 bạn bè với: 01
  - 10 bạn bè với: 01, 04

  NICKNAMES:
  - Bạn đặt cho friend-01: "Anh Yêu"
  - Bạn đặt cho friend-02: "Hùng Bạn Thân"
*/

async function main() {
  const db = getDb();
  const now = new Date();

  console.log(`\n🌊 SURF — Seed dữ liệu test bạn bè`);
  console.log(`📌 UID của bạn: ${MY_UID}\n`);

  /* ── 1. Tạo 10 user documents ──────────────────────────────────────────── */
  console.log('👤 Tạo 10 tài khoản test...');
  for (const u of TEST_USERS) {
    await db.collection('users').doc(u.id).set({
      uid: u.id,
      displayName: u.name,
      email: u.email,
      photoURL: u.photo,
      createdAt: now,
      updatedAt: now,
    }, { merge: true });
    console.log(`  ✓ ${u.name} (${u.id})`);
  }

  /* ── 2. Thiết lập bạn bè (friendIds) ──────────────────────────────────── */
  console.log('\n🤝 Thiết lập quan hệ bạn bè...');

  // Bạn bè của bạn: 01, 02, 03, 04
  const myFriends = ['friend-01', 'friend-02', 'friend-03', 'friend-04'];

  // friendIds map cho tất cả
  const friendMap: Record<string, string[]> = {
    [MY_UID]:     myFriends,
    'friend-01':  [MY_UID, 'friend-02', 'friend-03', 'friend-04', 'friend-07', 'friend-08', 'friend-10'],
    'friend-02':  [MY_UID, 'friend-01', 'friend-03', 'friend-07'],
    'friend-03':  [MY_UID, 'friend-01', 'friend-02', 'friend-07'],
    'friend-04':  [MY_UID, 'friend-01', 'friend-10'],
    'friend-07':  ['friend-01', 'friend-02', 'friend-03'],
    'friend-08':  ['friend-01'],
    'friend-10':  ['friend-01', 'friend-04'],
  };

  for (const [uid, friendIds] of Object.entries(friendMap)) {
    await db.collection('friends').doc(uid).set({ friendIds }, { merge: true });
    const label = uid === MY_UID ? 'BẠN' : uid;
    console.log(`  ✓ ${label} → ${friendIds.length} bạn bè`);
  }

  /* ── 3. Friend requests ────────────────────────────────────────────────── */
  console.log('\n📩 Tạo lời mời kết bạn...');

  // friend-05 gửi lời mời cho bạn (bạn nhận được)
  const reqInRef = db.collection('friend_requests').doc('req-incoming-05');
  await reqInRef.set({
    fromUid: 'friend-05',
    toUid: MY_UID,
    status: 'pending',
    createdAt: now,
  }, { merge: true });
  console.log('  ✓ friend-05 → BẠN (nhận được)');

  // Bạn gửi lời mời cho friend-06 (đang chờ)
  const reqOutRef = db.collection('friend_requests').doc('req-outgoing-06');
  await reqOutRef.set({
    fromUid: MY_UID,
    toUid: 'friend-06',
    status: 'pending',
    createdAt: now,
  }, { merge: true });
  console.log('  ✓ BẠN → friend-06 (đã gửi)');

  /* ── 4. Friend Tiers ───────────────────────────────────────────────────── */
  console.log('\n⭐ Thiết lập friend tiers...');
  await db.collection('friend_tiers').doc(MY_UID).set({
    tiers: {
      'friend-01': 'priority',
      'friend-02': 'normal',
      'friend-03': 'restricted',
      // friend-04: no tier = normal by default
    },
  }, { merge: true });
  console.log('  ✓ friend-01: ⭐ priority');
  console.log('  ✓ friend-02: 👤 normal');
  console.log('  ✓ friend-03: 🔒 restricted');
  console.log('  ✓ friend-04: (default normal)');

  // friend-01 cũng đặt bạn là priority (để test thông báo 2 chiều)
  await db.collection('friend_tiers').doc('friend-01').set({
    tiers: {
      [MY_UID]: 'priority',
    },
  }, { merge: true });
  console.log('  ✓ friend-01 đặt BẠN: ⭐ priority');

  /* ── 5. Affinity scores ────────────────────────────────────────────────── */
  console.log('\n📊 Thiết lập affinity scores...');
  await db.collection('affinity').doc(MY_UID).set({
    scores: {
      'friend-01': 15,
      'friend-02': 5,
      'friend-03': 1,
    },
  }, { merge: true });
  console.log('  ✓ friend-01: 15 (cao — sẽ ở top feed)');
  console.log('  ✓ friend-02: 5 (trung bình)');
  console.log('  ✓ friend-03: 1 (thấp — restricted)');

  /* ── 6. Nicknames ──────────────────────────────────────────────────────── */
  console.log('\n✏️  Thiết lập nicknames...');
  await db.collection('nicknames').doc(MY_UID).set({
    entries: {
      'friend-01': 'Anh Yêu',
      'friend-02': 'Hùng Bạn Thân',
    },
  }, { merge: true });
  console.log('  ✓ friend-01 → "Anh Yêu"');
  console.log('  ✓ friend-02 → "Hùng Bạn Thân"');

  /* ── 7. Bài viết test (để test EdgeRank feed) ─────────────────────────── */
  console.log('\n📝 Tạo bài viết test...');

  const posts = [
    { authorId: 'friend-01', content: '🌊 Hôm nay đi biển cùng mọi người! Surf thật tuyệt vời! #SurfLife', privacy: 'public', likeCount: 12 },
    { authorId: 'friend-01', content: '☕ Buổi sáng đẹp trời, ai muốn đi cà phê không?', privacy: 'friends', likeCount: 5 },
    { authorId: 'friend-02', content: '🎮 Vừa hoàn thành game mới, review sẽ lên sớm!', privacy: 'public', likeCount: 8 },
    { authorId: 'friend-02', content: '📚 Đọc xong cuốn sách hay quá, recommend cho mọi người nè.', privacy: 'friends', likeCount: 3 },
    { authorId: 'friend-03', content: '🔒 Bài này chỉ bạn bè thấy thôi nha — restricted sẽ không thấy.', privacy: 'friends', likeCount: 2 },
    { authorId: 'friend-03', content: '🌍 Public post từ restricted friend — bạn vẫn thấy được.', privacy: 'public', likeCount: 7 },
    { authorId: 'friend-04', content: '🏀 Ai muốn chơi bóng rổ chiều nay không? Tìm người thứ 4!', privacy: 'public', likeCount: 4 },
    { authorId: 'friend-07', content: '🎨 Vẽ xong bức tranh mới, hóng feedback!', privacy: 'public', likeCount: 15 },
    { authorId: 'friend-10', content: '🚀 Launch sản phẩm mới hôm nay — excited!', privacy: 'public', likeCount: 20 },
  ];

  for (let i = 0; i < posts.length; i++) {
    const p = posts[i];
    const author = TEST_USERS.find((u) => u.id === p.authorId)!;
    const postTime = new Date(now.getTime() - (posts.length - i) * 3600_000); // mỗi post cách nhau 1h

    await db.collection('posts').doc(`test-post-${i + 1}`).set({
      authorId: p.authorId,
      authorDisplayName: author.name,
      authorPhotoURL: author.photo,
      content: p.content,
      mediaUrls: [],
      feeling: null,
      location: null,
      taggedFriends: [],
      privacy: p.privacy,
      parentId: null,
      createdAt: postTime,
      updatedAt: postTime,
      likeCount: p.likeCount,
      replyCount: 0,
      likedBy: [],
    }, { merge: true });
    console.log(`  ✓ [${p.authorId}] "${p.content.slice(0, 40)}..."`);
  }

  /* ── 8. Notifications test ─────────────────────────────────────────────── */
  console.log('\n🔔 Tạo notifications test...');

  const notifs = [
    { fromId: 'friend-01', type: 'new_post', message: 'vừa đăng một bài viết mới.', postId: 'test-post-1', read: false, ago: 30 },
    { fromId: 'friend-01', type: 'like_post', message: 'đã thích bài viết của bạn.', postId: 'test-post-1', read: false, ago: 60 },
    { fromId: 'friend-02', type: 'new_post', message: 'vừa đăng một bài viết mới.', postId: 'test-post-3', read: false, ago: 120 },
    { fromId: 'friend-01', type: 'new_post', message: 'vừa đăng: "Buổi sáng đẹp trời..."', postId: 'test-post-2', read: true, ago: 300 },
    { fromId: 'friend-04', type: 'like_post', message: 'đã thích bài viết của bạn.', postId: 'test-post-7', read: true, ago: 600 },
  ];

  for (let i = 0; i < notifs.length; i++) {
    const n = notifs[i];
    const from = TEST_USERS.find((u) => u.id === n.fromId)!;
    await db.collection('notifications').doc(`test-notif-${i + 1}`).set({
      toUid: MY_UID,
      fromUid: n.fromId,
      fromName: from.name,
      fromPhoto: from.photo,
      type: n.type,
      postId: n.postId,
      message: n.message,
      read: n.read,
      createdAt: new Date(now.getTime() - n.ago * 60_000),
    }, { merge: true });
    console.log(`  ✓ ${n.read ? '📖' : '🔴'} ${from.name}: ${n.message}`);
  }

  /* ── 9. Follows (để feed hoạt động) ────────────────────────────────────── */
  console.log('\n👁️  Thiết lập follows...');
  await db.collection('follows').doc(MY_UID).set({
    followingIds: myFriends,
  }, { merge: true });
  console.log(`  ✓ BẠN follow ${myFriends.length} bạn bè`);

  /* ═══════════════════════════════════════════════════════════════════════ */
  console.log('\n' + '═'.repeat(60));
  console.log('✅ SEED HOÀN TẤT! Tổng quan:');
  console.log('═'.repeat(60));
  console.log(`
  👤 10 tài khoản test (friend-01 → friend-10)
  🤝 4 bạn bè (01, 02, 03, 04) với tiers & affinity khác nhau
  📩 1 lời mời nhận được (từ friend-05)
  📤 1 lời mời đã gửi (đến friend-06)
  👀 3 người lạ có bạn chung (07: 3 chung, 08: 1 chung, 10: 2 chung)
  👤 1 người lạ không bạn chung (09)
  ✏️  2 nicknames (01: "Anh Yêu", 02: "Hùng Bạn Thân")
  📝 9 bài viết (để test EdgeRank feed)
  🔔 5 thông báo (3 chưa đọc, 2 đã đọc)

  🧪 KIỂM THỬ:
  ─────────────────────────────────────────
  1. Bạn bè      → /feed/friends/all (thấy 4 người + mutual counts)
  2. Lời mời     → /feed/friends/requests (1 nhận, 1 gửi)
  3. Gợi ý       → /feed/friends/suggestions (07, 08, 09, 10 + mutual counts)
  4. Tìm kiếm    → /feed/friends (tìm "Nguyễn", "Trần"...)
  5. Biệt danh   → /feed/friends/nicknames (2 đã đặt)
  6. Friend Tier  → Vào profile friend-01 → nút "Ưu tiên" dropdown
  7. Bạn chung   → Vào profile friend-07 → tab Bạn bè → "Bạn chung"
  8. EdgeRank    → /feed → bài friend-01 (priority+affinity cao) ở trên
  9. Thông báo   → Nhấn chuông → 3 chưa đọc + 2 đã đọc
  10. Restricted  → Feed không hiện bài "friends" của friend-03
  `);
}

main().catch((e) => {
  console.error('❌ Lỗi:', e);
  process.exit(1);
});
