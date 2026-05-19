(async () => {
  const CONFIG = {
    apiBase: '',
    expectedEmailPrefix: 'letrandat8905@',
    perCategory: 10,
    delayMs: 220,
    deleteOldSeedListings: true,
  };

  const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
  const slugify = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const hash = (value) => Array.from(String(value || '')).reduce((acc, char) => ((acc << 5) - acc + char.charCodeAt(0)) | 0, 0);
  const image = (query) => {
    const slug = slugify(query).replace(/-/g, ',') || 'marketplace,product';
    const lock = Math.abs(hash(query)) % 100000;
    return `https://loremflickr.com/1200/900/${slug}?lock=${lock}`;
  };

  async function getCurrentAuthUser() {
    try {
      const { auth } = await import('/src/lib/firebase/auth.ts');
      if (auth.currentUser) {
        return {
          uid: auth.currentUser.uid,
          email: auth.currentUser.email || '',
          getToken: () => auth.currentUser.getIdToken(false),
        };
      }
    } catch (error) {
      void error;
    }

    const storages = [window.localStorage, window.sessionStorage];
    for (const storage of storages) {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index) || '';
        if (!key.startsWith('firebase:authUser:')) continue;
        try {
          const raw = JSON.parse(storage.getItem(key) || '{}');
          const token = raw?.stsTokenManager?.accessToken;
          if (token) {
            return {
              uid: raw.uid || '',
              email: raw.email || '',
              getToken: async () => token,
            };
          }
        } catch (error) {
          void error;
        }
      }
    }

    throw new Error('Không tìm thấy Firebase user. Hãy mở Surf web app và đăng nhập Google trước khi chạy script.');
  }

  const locations = [
    'Quận 1, TP. Hồ Chí Minh',
    'Quận 7, TP. Hồ Chí Minh',
    'Thủ Đức, TP. Hồ Chí Minh',
    'Cầu Giấy, Hà Nội',
    'Đống Đa, Hà Nội',
    'Hải Châu, Đà Nẵng',
    'Ninh Kiều, Cần Thơ',
    'Biên Hòa, Đồng Nai',
    'Hạ Long, Quảng Ninh',
    'Vinh, Nghệ An',
  ];

  const data = {
    electronics: [
      ['iPhone 13 Pro 128GB màu xanh Sierra', 'Apple', 'Điện thoại', 13900000, 'like_new', 'Máy quốc tế, Face ID nhạy, pin còn khoảng 88%, màn hình zin không ám màu.', 'iphone 13 pro'],
      ['MacBook Air M1 8GB 256GB nguyên hộp', 'Apple', 'Laptop', 14500000, 'like_new', 'Máy dùng văn phòng, sạc ít chu kỳ, bàn phím và trackpad hoạt động mượt.', 'macbook air m1'],
      ['Tai nghe Sony WH-1000XM4 chống ồn', 'Sony', 'Tai nghe Bluetooth', 3650000, 'good', 'Chống ồn tốt, pin trâu, đệm tai còn êm, kèm hộp và cáp sạc.', 'sony headphones'],
      ['iPad Gen 9 64GB Wi-Fi kèm bút cảm ứng', 'Apple', 'Máy tính bảng', 6100000, 'good', 'Màn hình đẹp, loa rõ, phù hợp học online, ghi chú và xem phim.', 'ipad tablet'],
      ['Samsung Galaxy S23 256GB màu kem', 'Samsung', 'Điện thoại', 11800000, 'like_new', 'Máy ngoại hình đẹp, camera nét, pin ổn, dùng ốp từ ngày đầu.', 'samsung galaxy phone'],
      ['Máy ảnh Canon EOS M50 kèm lens kit', 'Canon', 'Máy ảnh mirrorless', 9300000, 'good', 'Chụp ảnh du lịch và quay vlog tốt, màn hình xoay lật, có pin sạc đầy đủ.', 'canon camera'],
      ['Loa JBL Charge 5 chống nước', 'JBL', 'Loa Bluetooth', 2350000, 'good', 'Âm bass chắc, pin lâu, vỏ còn đẹp, phù hợp dã ngoại và phòng ngủ.', 'jbl bluetooth speaker'],
      ['Màn hình Dell Ultrasharp 24 inch Full HD', 'Dell', 'Màn hình', 2450000, 'good', 'Tấm nền IPS màu đẹp, chân xoay linh hoạt, không sọc không điểm chết.', 'dell monitor'],
      ['Bàn phím cơ Keychron K2 Pro hotswap', 'Keychron', 'Bàn phím cơ', 2050000, 'like_new', 'Layout gọn, gõ êm, kết nối Bluetooth ổn, còn keycap và hộp.', 'mechanical keyboard'],
      ['Router Wi-Fi 6 TP-Link Archer AX55', 'TP-Link', 'Router Wi-Fi', 1250000, 'like_new', 'Phủ sóng tốt căn hộ, băng tần kép, cấu hình dễ qua app.', 'wifi router'],
    ],
    clothing: [
      ['Áo khoác bomber local brand màu đen', 'DirtyCoins', 'Áo khoác', 420000, 'like_new', 'Form rộng dễ phối, bo tay chắc, vải dày vừa, mặc vài lần còn mới.', 'black bomber jacket'],
      ['Giày Nike Air Force 1 trắng size 42', 'Nike', 'Sneaker', 1450000, 'good', 'Đế còn chắc, da đã vệ sinh sạch, phù hợp đi học đi làm hằng ngày.', 'white sneakers'],
      ['Túi đeo chéo MLB Yankees màu kem', 'MLB', 'Túi đeo chéo', 680000, 'like_new', 'Túi nhỏ gọn, khóa kéo mượt, đựng vừa ví điện thoại và phụ kiện.', 'crossbody bag'],
      ['Áo sơ mi linen Uniqlo màu xanh nhạt', 'Uniqlo', 'Áo sơ mi', 290000, 'good', 'Vải thoáng, ít nhăn, hợp đi làm hoặc đi chơi cuối tuần.', 'linen shirt'],
      ['Quần jean Levi’s 511 slim fit size 31', 'Levi’s', 'Quần jean', 780000, 'good', 'Denim dày, form slim dễ mặc, màu còn đều, không rách gối.', 'blue jeans'],
      ['Đầm midi Zara hoa nhí size M', 'Zara', 'Đầm nữ', 520000, 'like_new', 'Chất vải nhẹ, lên dáng nữ tính, phù hợp đi làm và đi cà phê.', 'floral midi dress'],
      ['Đồng hồ Casio G-Shock GA-2100 đen', 'Casio', 'Đồng hồ', 1650000, 'good', 'Mặt kính đẹp, chống nước, dây còn chắc, hoạt động ổn định.', 'casio watch'],
      ['Áo hoodie Adidas Essentials màu xám', 'Adidas', 'Áo hoodie', 490000, 'good', 'Nỉ bông mềm, mũ rộng, logo đẹp, giữ ấm tốt khi đi tối.', 'gray hoodie'],
      ['Giày Converse Chuck 70 cổ cao đen', 'Converse', 'Sneaker', 990000, 'good', 'Canvas dày, đế còn bám, phối đồ basic rất dễ.', 'converse shoes'],
      ['Kính mát Ray-Ban Wayfarer gọng đen', 'Ray-Ban', 'Kính mát', 1850000, 'like_new', 'Tròng kính trong, gọng chắc, có hộp và khăn lau đi kèm.', 'rayban sunglasses'],
    ],
    vehicles: [
      ['Xe máy Honda Vision 2021 màu trắng', 'Honda', 'Xe tay ga', 28500000, 'good', 'Xe chính chủ, máy êm, tiết kiệm xăng, giấy tờ đầy đủ.', 'honda scooter'],
      ['Xe đạp Giant Escape 2 size M', 'Giant', 'Xe đạp thể thao', 5200000, 'good', 'Khung nhôm nhẹ, sang số mượt, phanh ăn, phù hợp đi làm và tập luyện.', 'giant bicycle'],
      ['Xe máy Yamaha Grande 2020 xanh đen', 'Yamaha', 'Xe tay ga', 29500000, 'good', 'Cốp rộng, đề nhẹ, ngoại hình giữ kỹ, ưu tiên xem xe trực tiếp.', 'yamaha scooter'],
      ['Mũ bảo hiểm 3/4 Royal M139 kính âm', 'Royal', 'Phụ kiện xe', 520000, 'like_new', 'Kính âm trong, lót sạch, size L, phù hợp đi phố và touring nhẹ.', 'motorcycle helmet'],
      ['Xe đạp gấp Dahon Vybe D7 màu bạc', 'Dahon', 'Xe đạp gấp', 6800000, 'good', 'Gấp gọn nhanh, bánh 20 inch, phù hợp chung cư hoặc đi metro.', 'folding bike'],
      ['Camera hành trình Vietmap C61 trước sau', 'Vietmap', 'Camera hành trình', 1850000, 'like_new', 'Ghi hình rõ, có GPS, dây nguồn đầy đủ, dùng tốt cho ô tô gia đình.', 'dash camera'],
      ['Baga sau Givi cho xe tay ga', 'Givi', 'Phụ kiện xe', 650000, 'good', 'Khung chắc, sơn còn đẹp, gắn được thùng sau phổ thông.', 'motorcycle luggage rack'],
      ['Xe đạp trẻ em RoyalBaby 16 inch', 'RoyalBaby', 'Xe đạp trẻ em', 1550000, 'good', 'Xe chắc chắn, yên chỉnh cao thấp, phù hợp bé 4-7 tuổi.', 'kids bicycle'],
      ['Máy bơm lốp ô tô Xiaomi Portable 2', 'Xiaomi', 'Bơm lốp', 980000, 'like_new', 'Bơm nhanh, có màn hình áp suất, nhỏ gọn để cốp xe.', 'portable tire inflator'],
      ['Áo giáp bảo hộ Komine mùa hè', 'Komine', 'Đồ bảo hộ', 1750000, 'good', 'Lưới thoáng, giáp vai khuỷu lưng đầy đủ, phù hợp chạy xe đường dài.', 'motorcycle jacket'],
    ],
    property: [
      ['Căn hộ studio full nội thất gần Landmark 81', 'Chủ nhà', 'Căn hộ cho thuê', 7800000, 'good', 'Phòng sáng, có máy lạnh, máy giặt, bếp riêng; vào ở được ngay.', 'modern studio apartment'],
      ['Phòng trọ ban công riêng gần Đại học Bách Khoa', 'Chủ nhà', 'Phòng trọ', 3900000, 'good', 'Khu an ninh, giờ giấc tự do, ban công thoáng, chỗ để xe rộng.', 'rental room'],
      ['Căn hộ 2PN Masteri Thảo Điền view sông', 'Chủ nhà', 'Căn hộ', 18500000, 'like_new', 'Nội thất đẹp, tầng cao, hồ bơi gym đầy đủ, gần metro và trung tâm thương mại.', 'apartment interior'],
      ['Nhà nguyên căn hẻm xe hơi Phú Nhuận', 'Chính chủ', 'Nhà thuê', 16000000, 'good', 'Một trệt hai lầu, bếp rộng, phù hợp gia đình nhỏ hoặc làm văn phòng.', 'townhouse vietnam'],
      ['Mặt bằng kinh doanh đường Nguyễn Văn Cừ', 'Chính chủ', 'Mặt bằng', 22000000, 'good', 'Mặt tiền dễ nhận diện, khu đông dân, phù hợp cafe nhỏ hoặc showroom.', 'retail storefront'],
      ['Căn hộ mini mới xây có gác Bình Thạnh', 'Chủ nhà', 'Căn hộ mini', 5200000, 'like_new', 'Nội thất cơ bản, cửa sổ lớn, có thang máy và camera an ninh.', 'small apartment'],
      ['Phòng trong nhà chung cư Quận 7', 'Chủ nhà', 'Phòng ở ghép', 3300000, 'good', 'Phòng sạch, dùng chung bếp và máy giặt, ưu tiên người đi làm ổn định.', 'bedroom apartment'],
      ['Đất nền sổ riêng gần khu công nghiệp Long Đức', 'Chính chủ', 'Đất nền', 850000000, 'good', 'Đường ô tô vào được, khu dân cư hiện hữu, pháp lý rõ ràng.', 'land plot'],
      ['Căn hộ 1PN Vinhomes Ocean Park đủ đồ', 'Chủ nhà', 'Căn hộ', 6500000, 'like_new', 'Nhà mới, nội thất gọn đẹp, view thoáng, tiện ích nội khu đầy đủ.', 'cozy apartment'],
      ['Kho nhỏ 60m2 gần quốc lộ 13', 'Chính chủ', 'Kho xưởng', 9000000, 'good', 'Nền cao ráo, xe tải nhỏ vào được, có điện nước và cửa cuốn.', 'warehouse'],
    ],
    home: [
      ['Ghế công thái học Sihoo M57 lưng lưới', 'Sihoo', 'Ghế làm việc', 2650000, 'good', 'Tựa lưng thoáng, kê tay chỉnh được, piston còn tốt, ngồi lâu đỡ mỏi.', 'ergonomic chair'],
      ['Máy lọc không khí Xiaomi Air Purifier 4', 'Xiaomi', 'Máy lọc không khí', 2450000, 'like_new', 'Lọc phòng ngủ tốt, app điều khiển ổn, màng lọc còn dùng được lâu.', 'air purifier'],
      ['Bàn làm việc gỗ cao su 120x60cm', 'Nội thất Hòa Phát', 'Bàn làm việc', 950000, 'good', 'Mặt bàn chắc, chân sắt sơn tĩnh điện, phù hợp góc học tập tại nhà.', 'wood desk'],
      ['Nồi chiên không dầu Philips 4.1L', 'Philips', 'Đồ bếp', 1650000, 'good', 'Khoang nồi sạch, hoạt động ổn, dùng tiện cho gia đình 2-4 người.', 'air fryer'],
      ['Máy hút bụi Dyson V8 Absolute', 'Dyson', 'Máy hút bụi', 5200000, 'good', 'Hút mạnh, pin còn ổn, đủ đầu hút sàn và sofa.', 'dyson vacuum'],
      ['Kệ sách gỗ 5 tầng màu óc chó', 'HomeBase', 'Kệ sách', 780000, 'like_new', 'Kệ chắc, màu đẹp, để sách và đồ decor gọn gàng.', 'bookshelf'],
      ['Đèn bàn LED Xiaomi Mi Smart Lamp', 'Xiaomi', 'Đèn bàn', 690000, 'like_new', 'Ánh sáng dịu, chỉnh nhiệt màu, hợp học tập và làm việc buổi tối.', 'desk lamp'],
      ['Bộ chăn ga cotton Hàn Quốc 1m8', 'Everon', 'Chăn ga', 850000, 'like_new', 'Vải mềm, họa tiết nhã, đã giặt sạch, dùng cho giường 1m8.', 'bedding set'],
      ['Tủ lạnh mini Aqua 90L còn bảo hành', 'Aqua', 'Tủ lạnh mini', 1950000, 'good', 'Làm lạnh nhanh, chạy êm, phù hợp phòng trọ hoặc văn phòng nhỏ.', 'mini fridge'],
      ['Bộ nồi inox 3 món Elmich đáy từ', 'Elmich', 'Bộ nồi', 720000, 'good', 'Inox dày, dùng được bếp từ, nắp kính còn đẹp.', 'stainless cookware'],
    ],
    sports: [
      ['Vợt cầu lông Yonex Astrox 77 đỏ', 'Yonex', 'Vợt cầu lông', 1850000, 'good', 'Thân vợt nhẹ, trợ lực tốt, đã căng dây, kèm bao vợt.', 'badminton racket'],
      ['Giày chạy bộ Nike Pegasus 39 size 42', 'Nike', 'Giày chạy bộ', 1350000, 'good', 'Đệm còn êm, form ôm chân, phù hợp chạy nhẹ và đi bộ.', 'running shoes'],
      ['Thảm yoga Manduka Prolite màu tím', 'Manduka', 'Thảm yoga', 980000, 'like_new', 'Độ bám tốt, dày vừa, ít dùng, đã vệ sinh sạch.', 'yoga mat'],
      ['Bộ tạ tay Bowflex chỉnh cân 2-24kg', 'Bowflex', 'Tạ tay', 6800000, 'good', 'Chỉnh cân nhanh, tiết kiệm diện tích, phù hợp tập tại nhà.', 'adjustable dumbbells'],
      ['Xe đạp tập trong nhà Xiaomi Yesoul S3', 'Yesoul', 'Xe đạp tập', 4200000, 'good', 'Khung chắc, đạp êm, kết nối app, phù hợp cardio tại nhà.', 'exercise bike'],
      ['Bóng rổ Spalding TF-250 size 7', 'Spalding', 'Bóng rổ', 520000, 'like_new', 'Da bám tay, nảy tốt, chơi sân trong nhà hoặc ngoài trời đều ổn.', 'basketball'],
      ['Gậy golf TaylorMade SIM2 Rescue', 'TaylorMade', 'Gậy golf', 3900000, 'good', 'Mặt gậy đẹp, grip còn bám, phù hợp golfer muốn nâng cấp.', 'golf club'],
      ['Kính bơi Speedo chống mờ', 'Speedo', 'Kính bơi', 280000, 'like_new', 'Ôm mắt tốt, dây còn đàn hồi, phù hợp bơi hồ thường xuyên.', 'swimming goggles'],
      ['Ván trượt cruiser Penny 22 inch', 'Penny', 'Ván trượt', 1450000, 'good', 'Bánh lăn mượt, mặt ván chắc, hợp đi phố và tập cơ bản.', 'skateboard'],
      ['Ba lô leo núi Deuter 30L', 'Deuter', 'Ba lô thể thao', 1650000, 'good', 'Đệm lưng thoáng, nhiều ngăn, phù hợp trekking ngắn ngày.', 'hiking backpack'],
    ],
    other: [
      ['Sách Atomic Habits bản tiếng Việt', 'First News', 'Sách', 120000, 'like_new', 'Sách còn sạch, không rách gáy, phù hợp đọc phát triển thói quen cá nhân.', 'vietnamese book'],
      ['Đàn guitar acoustic Yamaha F310', 'Yamaha', 'Nhạc cụ', 1850000, 'good', 'Âm sáng, action vừa tay, phù hợp người mới học, kèm bao đàn.', 'acoustic guitar'],
      ['Bộ LEGO hoa hướng dương trang trí', 'LEGO', 'Đồ sưu tầm', 680000, 'like_new', 'Đã ráp một lần, đủ mảnh, hợp trang trí bàn làm việc.', 'lego flowers'],
      ['Máy pha cà phê Delonghi Dedica EC685', 'Delonghi', 'Máy pha cà phê', 3950000, 'good', 'Pha espresso ổn, vòi đánh sữa hoạt động tốt, ngoại hình đẹp.', 'espresso machine'],
      ['Balo laptop Tomtoc 15.6 inch chống sốc', 'Tomtoc', 'Balo laptop', 850000, 'like_new', 'Nhiều ngăn, đệm lưng êm, chống sốc tốt cho laptop và iPad.', 'laptop backpack'],
      ['Máy đọc sách Kindle Paperwhite Gen 10', 'Amazon', 'Máy đọc sách', 2150000, 'good', 'Màn hình rõ, pin lâu, có đèn nền, phù hợp đọc sách ban đêm.', 'kindle ereader'],
      ['Chuồng mèo gỗ 2 tầng kèm khay vệ sinh', 'PetHome', 'Đồ thú cưng', 1250000, 'good', 'Gỗ chắc, dễ vệ sinh, phù hợp mèo nhỏ hoặc mèo mới về nhà.', 'cat furniture'],
      ['Vali kéo Samsonite 24 inch màu navy', 'Samsonite', 'Vali', 2450000, 'good', 'Bánh xe êm, khóa số tốt, lòng vali sạch, hợp đi công tác.', 'travel suitcase'],
      ['Máy khoan pin Bosch GSR 120-LI', 'Bosch', 'Dụng cụ', 1550000, 'good', 'Máy khỏe, pin còn tốt, kèm sạc và hộp, dùng sửa nhà cơ bản.', 'cordless drill'],
      ['Bộ mỹ phẩm Kiehl’s dưỡng ẩm còn seal', 'Kiehl’s', 'Mỹ phẩm', 980000, 'new', 'Hàng mua dư, còn nguyên seal, hạn sử dụng xa, phù hợp da khô.', 'skincare products'],
    ],
  };

  const buildDescription = (item) => {
    const [title, brand, productType, price, condition, detail] = item;
    void brand;
    void productType;
    void price;
    const conditionText = condition === 'new' ? 'mới nguyên seal' : condition === 'like_new' ? 'gần như mới' : 'đã qua sử dụng nhưng giữ kỹ';
    return [
      `${title} tình trạng ${conditionText}. ${detail}`,
      'Người bán ưu tiên giao dịch trực tiếp tại nơi công cộng hoặc nhận hàng tại nhà sau khi kiểm tra kỹ sản phẩm.',
      'Giá có thể thương lượng nhẹ cho người mua nhanh, vui lòng nhắn tin để xem thêm ảnh thật và hẹn thời gian xem hàng.',
    ].join('\n\n');
  };

  const buildPayloads = () => {
    const payloads = [];
    Object.entries(data).forEach(([category, items]) => {
      items.slice(0, CONFIG.perCategory).forEach((item, index) => {
        const [title, brand, productType, price, condition, detail, imageQuery] = item;
        void detail;
        payloads.push({
          title,
          description: buildDescription(item),
          price,
          category,
          condition,
          mediaUrls: [image(imageQuery || `${brand} ${productType}`)],
          location: locations[payloads.length % locations.length],
          brand,
          productType,
          material: '',
          availability: 'in_stock',
          saleStatus: 'available',
          tags: ['surf-demo-seed', 'surf-vietnamese-seed', 'curated-seed', category, slugify(brand), slugify(productType), `seed-${category}-${index + 1}`].filter(Boolean),
          sku: `SURF-VN-${category.toUpperCase()}-${String(index + 1).padStart(2, '0')}`,
          meetingPreferences: ['public_meetup', 'door_pickup'],
          hideFromFriends: false,
          boostEnabled: false,
          boostPlan: null,
        });
      });
    });
    return payloads;
  };

  const user = await getCurrentAuthUser();
  const userLabel = user.email || user.uid || 'người dùng hiện tại';
  if (!user.email.toLowerCase().startsWith(CONFIG.expectedEmailPrefix)) {
    const ok = window.confirm(`Tài khoản hiện tại là ${userLabel}, không khớp tiền tố email ${CONFIG.expectedEmailPrefix}.\n\nBạn vẫn muốn tạo tin đăng cho tài khoản này?`);
    if (!ok) return;
  }

  const token = await user.getToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const requestJson = async (path, options = {}) => {
    const response = await fetch(`${CONFIG.apiBase}${path}`, {
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

  const fetchAllMyListings = async (status) => {
    const items = [];
    let cursor = '';
    do {
      const path = `/api/marketplace/my?status=${encodeURIComponent(status)}&limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const response = await requestJson(path);
      items.push(...(Array.isArray(response.items) ? response.items : []));
      cursor = response.nextCursor || '';
    } while (cursor);
    return items;
  };

  const listResponses = await Promise.all([
    fetchAllMyListings('all'),
    fetchAllMyListings('error'),
  ]);
  const existingListings = Array.from(new Map(listResponses.flat().map((item) => [item.id, item])).values());
  const existingSeedListings = existingListings.filter((item) => {
    const title = String(item.title || '').toLowerCase();
    const tags = Array.isArray(item.tags) ? item.tags.map((tag) => String(tag).toLowerCase()) : [];
    return tags.some((tag) => ['surf-demo-seed', 'surf-vietnamese-seed', 'public-ecommerce-seed', 'dummyjson'].includes(tag)) || title.includes('[demo]');
  });

  const payloads = buildPayloads();
  const counts = payloads.reduce((acc, item) => ({ ...acc, [item.category]: (acc[item.category] || 0) + 1 }), {});
  console.table(Object.entries(counts).map(([category, count]) => ({ category, count })));
  console.table(payloads.map((item) => ({ title: item.title, price: item.price, category: item.category, location: item.location })));

  const deleteLine = CONFIG.deleteOldSeedListings && existingSeedListings.length > 0
    ? `\n\nScript cũng sẽ xoá ${existingSeedListings.length} tin dữ liệu cũ để tránh còn tiêu đề/mô tả cũ.`
    : '';
  const confirmed = window.confirm(`Sẽ tạo ${payloads.length} tin đăng tiếng Việt cho tài khoản ${userLabel}.\nMỗi danh mục có ${CONFIG.perCategory} tin, tiêu đề và mô tả đều theo phong cách tin bán thật.${deleteLine}\n\nTiếp tục?`);
  if (!confirmed) {
    console.log('Đã hủy tạo dữ liệu Marketplace.');
    return;
  }

  if (CONFIG.deleteOldSeedListings) {
    for (const item of existingSeedListings) {
      await requestJson(`/api/marketplace/${item.id}`, { method: 'DELETE' });
      console.log('Đã xoá tin dữ liệu cũ:', item.title);
      await sleep(80);
    }
  }

  const created = [];
  const failed = [];
  for (const payload of payloads) {
    try {
      const listing = await requestJson('/api/marketplace', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      created.push(listing);
      console.log(`Đã tạo ${created.length}/${payloads.length}:`, listing.title, listing.id, listing.status);
      await sleep(CONFIG.delayMs);
    } catch (error) {
      failed.push({ title: payload.title, error });
      console.error('Tạo thất bại:', payload.title, error);
    }
  }

  console.log(`Hoàn tất. Đã tạo: ${created.length}, lỗi: ${failed.length}`);
  if (failed.length > 0) console.table(failed.map((item) => ({ title: item.title, error: String(item.error?.message || item.error) })));
  console.log('Lưu ý: nếu Marketplace moderation đang bật, listing mới có thể ở trạng thái chờ duyệt trước khi hiển thị công khai.');
})();
