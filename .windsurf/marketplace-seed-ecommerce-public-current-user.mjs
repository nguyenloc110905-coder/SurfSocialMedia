(async () => {
  const CONFIG = {
    count: 40,
    fetchLimit: 100,
    minRating: 4.25,
    apiBase: '',
    expectedEmailPrefix: 'letrandat8905@',
    titlePrefix: '[Demo] ',
    sourceUrl: 'https://dummyjson.com/products',
    delayMs: 220,
  };

  const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

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

  const user = await getCurrentAuthUser();
  const userLabel = user.email || user.uid || 'current user';
  if (!user.email.toLowerCase().startsWith(CONFIG.expectedEmailPrefix)) {
    const ok = window.confirm(
      `Account hiện tại là ${userLabel}, không khớp prefix ${CONFIG.expectedEmailPrefix}.\n\nBạn vẫn muốn tạo listing cho account này?`
    );
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

  const mapCategory = (sourceCategory) => {
    const value = String(sourceCategory || '').toLowerCase();
    if (/(smartphones|laptops|tablets|mobile|accessories)/.test(value)) return 'electronics';
    if (/(shirt|tops|dress|shoe|bag|jewel|watch|sunglasses|mens|womens)/.test(value)) return 'clothing';
    if (/(vehicle|motorcycle|automotive)/.test(value)) return 'vehicles';
    if (/(home|furniture|kitchen|decoration)/.test(value)) return 'home';
    if (/(sport|fitness|ball)/.test(value)) return 'sports';
    return 'other';
  };

  const toVnd = (usd, discountPercentage) => {
    const baseUsd = Number.isFinite(Number(usd)) ? Number(usd) : 10;
    const discount = Math.max(0, Math.min(Number(discountPercentage) || 0, 60));
    const discountedUsd = baseUsd * (1 - discount / 100);
    return Math.max(20000, Math.round((discountedUsd * 25000) / 10000) * 10000);
  };

  const cleanImageUrls = (product) => {
    const urls = [...(Array.isArray(product.images) ? product.images : []), product.thumbnail]
      .filter(Boolean)
      .map((url) => String(url).trim())
      .filter((url) => /^https?:\/\//.test(url));
    return Array.from(new Set(urls)).slice(0, 5);
  };

  const locations = [
    'Quận 1, TP. Hồ Chí Minh',
    'Quận 7, TP. Hồ Chí Minh',
    'Thủ Đức, TP. Hồ Chí Minh',
    'Cầu Giấy, Hà Nội',
    'Đống Đa, Hà Nội',
    'Hải Châu, Đà Nẵng',
    'Ninh Kiều, Cần Thơ',
    'Biên Hòa, Đồng Nai',
  ];

  console.log('Đang tải dữ liệu ecommerce public từ DummyJSON...');
  const sourceResponse = await fetch(`${CONFIG.sourceUrl}?limit=${CONFIG.fetchLimit}&skip=0`);
  if (!sourceResponse.ok) {
    throw new Error(`Không tải được nguồn sản phẩm: ${sourceResponse.status}`);
  }
  const sourceData = await sourceResponse.json();
  const sourceProducts = Array.isArray(sourceData.products) ? sourceData.products : [];
  const preferredProducts = sourceProducts.filter(
    (product) => Number(product.rating) >= CONFIG.minRating && cleanImageUrls(product).length > 0
  );
  const productPool = preferredProducts.length >= CONFIG.count ? preferredProducts : sourceProducts;

  const myListings = await requestJson('/api/marketplace/my?status=all');
  const existingListings = Array.isArray(myListings.items) ? myListings.items : [];
  const existingSourceIds = new Set(
    existingListings.flatMap((item) =>
      Array.isArray(item.tags)
        ? item.tags.filter((tag) => String(tag).startsWith('dummyjson-')).map(String)
        : []
    )
  );

  const payloads = productPool
    .filter((product) => !existingSourceIds.has(`dummyjson-${product.id}`))
    .slice(0, CONFIG.count)
    .map((product, index) => {
      const brand = String(product.brand || product.category || 'Ecommerce').trim();
      const sourceCategory = String(product.category || 'other').trim();
      const tags = [
        'surf-demo-seed',
        'public-ecommerce-seed',
        'dummyjson',
        `dummyjson-${product.id}`,
        sourceCategory,
        brand,
      ]
        .map((tag) => tag.toLowerCase().replace(/\s+/g, '-'))
        .filter(Boolean)
        .slice(0, 20);

      return {
        title: `${CONFIG.titlePrefix}${String(product.title || 'Sản phẩm ecommerce').trim()}`.slice(0, 100),
        description: [
          'Sản phẩm seed từ nguồn ecommerce public DummyJSON, dùng để demo/test Surf Market; không phải tin bán thật.',
          String(product.description || '').trim(),
          `Thông tin nguồn: rating ${product.rating ?? 'N/A'}/5, tồn kho mẫu ${product.stock ?? 'N/A'}, danh mục gốc ${sourceCategory}.`,
        ]
          .filter(Boolean)
          .join('\n\n'),
        price: toVnd(product.price, product.discountPercentage),
        category: mapCategory(sourceCategory),
        condition: Number(product.rating) >= 4.6 ? 'new' : 'like_new',
        mediaUrls: cleanImageUrls(product),
        location: locations[index % locations.length],
        brand,
        productType: sourceCategory.replace(/-/g, ' '),
        material: '',
        availability: 'in_stock',
        saleStatus: 'available',
        tags,
        sku: `DUMMYJSON-${product.id}`,
        meetingPreferences: ['public_meetup'],
        hideFromFriends: false,
        boostEnabled: false,
      };
    });

  if (payloads.length === 0) {
    console.log('Không có sản phẩm mới để seed. Có thể các sản phẩm DummyJSON đã được tạo trước đó.');
    return;
  }

  console.table(
    payloads.map((item) => ({
      title: item.title,
      price: item.price,
      category: item.category,
      images: item.mediaUrls.length,
      location: item.location,
    }))
  );

  const confirmed = window.confirm(
    `Sẽ tạo ${payloads.length} listing Marketplace cho account ${userLabel}.\n\nNguồn: DummyJSON public ecommerce API.\nTitle có prefix ${CONFIG.titlePrefix || '(không có)'}.\n\nTiếp tục?`
  );
  if (!confirmed) {
    console.log('Đã hủy seed Marketplace.');
    return;
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
      console.log(`Created ${created.length}/${payloads.length}:`, listing.title, listing.id, listing.status);
      await sleep(CONFIG.delayMs);
    } catch (error) {
      failed.push({ title: payload.title, error });
      console.error('Create failed:', payload.title, error);
    }
  }

  console.log(`Hoàn tất. Created: ${created.length}, failed: ${failed.length}`);
  if (failed.length > 0) console.table(failed.map((item) => ({ title: item.title, error: String(item.error?.message || item.error) })));
  console.log('Lưu ý: nếu Marketplace moderation đang bật, listing mới có thể ở trạng thái pending trước khi active.');
})();
