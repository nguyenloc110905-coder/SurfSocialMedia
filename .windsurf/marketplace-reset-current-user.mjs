// Paste this whole file into the browser console while logged in on the Surf web app.
// It uses the current Firebase auth user and the normal Marketplace API flow.
(async () => {
  const { auth } = await import('/src/lib/firebase/auth.ts');
  if (!auth.currentUser) {
    throw new Error('Bạn cần đăng nhập trước khi reset demo Marketplace.');
  }

  const token = await auth.currentUser.getIdToken(false);
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const requestJson = async (path, options = {}) => {
    const response = await fetch(path, {
      ...options,
      headers: {
        ...headers,
        ...(options.headers || {}),
      },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${options.method || 'GET'} ${path} failed: ${response.status} ${text}`);
    }
    if (response.status === 204) return null;
    return response.json();
  };

  const myListings = await requestJson('/api/marketplace/my?status=all');
  const listings = Array.isArray(myListings.items) ? myListings.items : [];
  const demoCandidates = listings.filter((item) => {
    const title = String(item.title || '').toLowerCase();
    const tags = Array.isArray(item.tags) ? item.tags.map((tag) => String(tag).toLowerCase()) : [];
    return (
      tags.includes('surf-demo-seed') ||
      tags.includes('demo') ||
      title.includes('demo') ||
      title.includes('test fe') ||
      title.includes('bộ cắm cổng usb') ||
      title.includes('bo cam cong usb')
    );
  });

  const deleteAllCurrentListings = demoCandidates.length === 0;
  const deleteTargets = deleteAllCurrentListings ? listings : demoCandidates;
  const deleteSummary = deleteTargets.map((item) => `- ${item.title} (${item.status})`).join('\n') || '- Không có listing nào';
  const confirmMessage = deleteAllCurrentListings
    ? `Không tìm thấy marker demo rõ ràng. Script sẽ xoá TOÀN BỘ ${deleteTargets.length} listing hiện tại của account ${auth.currentUser.email || auth.currentUser.uid} rồi tạo 10 listing mới.\n\n${deleteSummary}\n\nTiếp tục?`
    : `Sẽ xoá ${deleteTargets.length} listing demo của account ${auth.currentUser.email || auth.currentUser.uid} rồi tạo 10 listing mới.\n\n${deleteSummary}\n\nTiếp tục?`;

  if (!window.confirm(confirmMessage)) {
    console.log('Đã huỷ reset Marketplace demo.');
    return;
  }

  for (const item of deleteTargets) {
    await requestJson(`/api/marketplace/${item.id}`, { method: 'DELETE' });
    console.log('Deleted:', item.title);
  }

  const products = [
    {
      title: 'Baseus Hub USB-C 7 in 1 cho MacBook iPad',
      description: 'Hub Baseus USB-C 7 cổng gồm HDMI, USB 3.0, SD/TF và PD sạc nhanh. Ngoại hình đẹp, dùng ổn cho học tập và làm việc, phù hợp MacBook, iPad Pro và laptop Type-C.',
      price: 450000,
      category: 'electronics',
      condition: 'like_new',
      mediaUrls: ['https://images.unsplash.com/photo-1625842268584-8f3296236761?auto=format&fit=crop&w=1200&q=80'],
      location: 'Hà Nội',
      brand: 'Baseus',
      productType: 'USB-C Hub',
      material: 'Vỏ nhôm, cáp USB-C liền thân',
      tags: ['surf-demo-seed', 'baseus', 'usb-c', 'hub'],
      sku: 'SURF-DEMO-001',
    },
    {
      title: 'Tai nghe Sony WH-CH520 Bluetooth pin lâu',
      description: 'Tai nghe Sony WH-CH520 kết nối Bluetooth ổn định, pin dùng lâu, đệm tai còn êm. Phù hợp nghe nhạc, học online và họp video hằng ngày.',
      price: 690000,
      category: 'electronics',
      condition: 'good',
      mediaUrls: ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1200&q=80'],
      location: 'TP. Hồ Chí Minh',
      brand: 'Sony',
      productType: 'Tai nghe Bluetooth',
      material: 'Nhựa nhám, đệm tai mềm',
      tags: ['surf-demo-seed', 'sony', 'headphone'],
      sku: 'SURF-DEMO-002',
    },
    {
      title: 'Bàn phím cơ Logitech K835 TKL switch blue',
      description: 'Bàn phím cơ Logitech K835 layout TKL gọn bàn, switch blue gõ nảy và rõ tiếng. Hàng dùng kỹ, keycap sạch, dây zin, phù hợp làm việc và setup học tập.',
      price: 850000,
      category: 'electronics',
      condition: 'good',
      mediaUrls: ['https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=1200&q=80'],
      location: 'Đà Nẵng',
      brand: 'Logitech',
      productType: 'Bàn phím cơ',
      material: 'Khung nhôm, keycap ABS',
      tags: ['surf-demo-seed', 'logitech', 'keyboard'],
      sku: 'SURF-DEMO-003',
    },
    {
      title: 'Áo khoác local brand form rộng màu kem',
      description: 'Áo khoác local brand form rộng, màu kem dễ phối, chất vải dày vừa. Mặc vài lần, không lỗi, phù hợp đi học, đi chơi hoặc phối outfit streetwear.',
      price: 320000,
      category: 'clothing',
      condition: 'like_new',
      mediaUrls: ['https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=1200&q=80'],
      location: 'Hà Nội',
      brand: 'Local Brand',
      productType: 'Áo khoác',
      material: 'Cotton pha polyester',
      tags: ['surf-demo-seed', 'fashion', 'jacket'],
      sku: 'SURF-DEMO-004',
    },
    {
      title: 'Giày sneaker trắng basic size 42 còn đẹp',
      description: 'Giày sneaker trắng basic size 42, kiểu tối giản dễ phối đồ. Đế còn tốt, đã vệ sinh sạch, phù hợp đi học hoặc đi làm hằng ngày.',
      price: 280000,
      category: 'clothing',
      condition: 'good',
      mediaUrls: ['https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=1200&q=80'],
      location: 'TP. Hồ Chí Minh',
      brand: 'Basic',
      productType: 'Sneaker',
      material: 'Da tổng hợp, đế cao su',
      tags: ['surf-demo-seed', 'sneaker', 'white'],
      sku: 'SURF-DEMO-005',
    },
    {
      title: 'Ghế công thái học lưng lưới có tựa đầu',
      description: 'Ghế công thái học lưng lưới thoáng, có tựa đầu và kê tay. Ngồi học/làm việc lâu đỡ mỏi, piston còn tốt, bánh xe di chuyển mượt.',
      price: 1250000,
      category: 'home',
      condition: 'good',
      mediaUrls: ['https://images.unsplash.com/photo-1580480055273-228ff5388ef8?auto=format&fit=crop&w=1200&q=80'],
      location: 'Hà Nội',
      brand: 'ErgoHome',
      productType: 'Ghế công thái học',
      material: 'Lưng lưới, chân nhựa chịu lực',
      tags: ['surf-demo-seed', 'chair', 'home-office'],
      sku: 'SURF-DEMO-006',
    },
    {
      title: 'Đèn bàn LED Xiaomi chỉnh sáng 3 mức',
      description: 'Đèn bàn LED Xiaomi ánh sáng dịu, có 3 mức chỉnh sáng, tiết kiệm điện. Phù hợp góc học tập, bàn làm việc hoặc đọc sách buổi tối.',
      price: 390000,
      category: 'home',
      condition: 'like_new',
      mediaUrls: ['https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1200&q=80'],
      location: 'Cần Thơ',
      brand: 'Xiaomi',
      productType: 'Đèn bàn LED',
      material: 'Nhựa ABS, thân kim loại',
      tags: ['surf-demo-seed', 'xiaomi', 'desk-lamp'],
      sku: 'SURF-DEMO-007',
    },
    {
      title: 'Xe đạp thể thao Giant Escape size M',
      description: 'Xe đạp Giant Escape size M, khung nhẹ, sang số ổn, phanh ăn. Phù hợp đi học, đi làm, tập thể dục cuối tuần, ưu tiên xem xe trực tiếp.',
      price: 4200000,
      category: 'vehicles',
      condition: 'good',
      mediaUrls: ['https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=1200&q=80'],
      location: 'Đà Nẵng',
      brand: 'Giant',
      productType: 'Xe đạp thể thao',
      material: 'Khung nhôm',
      tags: ['surf-demo-seed', 'bike', 'giant'],
      sku: 'SURF-DEMO-008',
    },
    {
      title: 'Vợt cầu lông Yonex Astrox nhẹ dễ đánh',
      description: 'Vợt cầu lông Yonex Astrox trọng lượng nhẹ, dễ xoay trở, phù hợp người chơi phong trào. Đã căng dây, có bao vợt, cán quấn mới.',
      price: 780000,
      category: 'sports',
      condition: 'good',
      mediaUrls: ['https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?auto=format&fit=crop&w=1200&q=80'],
      location: 'Hà Nội',
      brand: 'Yonex',
      productType: 'Vợt cầu lông',
      material: 'Carbon graphite',
      tags: ['surf-demo-seed', 'badminton', 'yonex'],
      sku: 'SURF-DEMO-009',
    },
    {
      title: 'Máy ảnh Canon EOS M10 kèm lens kit',
      description: 'Canon EOS M10 kèm lens kit nhỏ gọn, chụp ảnh du lịch và quay vlog cơ bản tốt. Máy hoạt động ổn, màn hình lật, có pin và sạc đi kèm.',
      price: 3650000,
      category: 'electronics',
      condition: 'good',
      mediaUrls: ['https://images.unsplash.com/photo-1502920917128-1aa500764cbd?auto=format&fit=crop&w=1200&q=80'],
      location: 'TP. Hồ Chí Minh',
      brand: 'Canon',
      productType: 'Máy ảnh mirrorless',
      material: 'Thân máy nhựa cao cấp, lens kính',
      tags: ['surf-demo-seed', 'canon', 'camera'],
      sku: 'SURF-DEMO-010',
    },
  ];

  const created = [];
  for (const product of products) {
    const listing = await requestJson('/api/marketplace', {
      method: 'POST',
      body: JSON.stringify({
        ...product,
        availability: 'in_stock',
        saleStatus: 'available',
        meetingPreferences: ['public_meetup', 'door_pickup'],
        hideFromFriends: false,
        boostEnabled: false,
        boostPlan: null,
      }),
    });
    created.push(listing);
    console.log('Created pending listing:', listing.title, listing.id, listing.status, listing.moderationReason);
  }

  console.table(created.map((item) => ({ id: item.id, title: item.title, status: item.status, moderation: item.moderationReason })));
  window.alert(`Đã xoá ${deleteTargets.length} listing và tạo ${created.length} listing mới. Các listing đã đi qua API tạo tin nên vẫn vào kiểm duyệt bình thường.`);
})();
