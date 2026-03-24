/** Dữ liệu và hằng số dùng chung cho Cài đặt */

export const iconCls = 'w-5 h-5 text-gray-600 dark:text-gray-400 flex-shrink-0';

export const SIDEBAR_ITEMS: { label: string; icon: string }[] = [
  { label: 'Cài đặt', icon: 'gear' },
  { label: 'Ngôn ngữ & khu vực', icon: 'globe' },
  { label: 'Rà soát quyền riêng tư', icon: 'lock-heart' },
  { label: 'Trung tâm bảo mật', icon: 'lock' },
  { label: 'Lịch sử hoạt động', icon: 'list' },
  { label: 'Lọc nội dung', icon: 'filter' },
];

export const SETTINGS_DETAIL_SECTIONS: {
  title: string;
  subtitle?: string;
  key: string;
  items: { label: string; icon: string; key: string }[];
}[] = [
  {
    title: 'Hỗ trợ & kiểm soát',
    key: 'support-control',
    subtitle: 'Dùng công cụ Surf để quản lý bảo mật và quyền riêng tư.',
    items: [
      { label: 'Kiểm tra quyền riêng tư', icon: 'lock', key: 'privacy-checkup' },
      { label: 'Đối tượng xem mặc định', icon: 'gear', key: 'default-audience' },
    ],
  },
  {
    title: 'Cá nhân hóa',
    key: 'personalization',
    subtitle: 'Làm Surf hoạt động đúng cách bạn muốn.',
    items: [
      { label: 'Cảm xúc & phản hồi', icon: 'like', key: 'emotions-feedback' },
      { label: 'Thông báo & nhắc', icon: 'bell', key: 'notifications' },
      { label: 'Trợ năng & hiển thị', icon: 'accessibility', key: 'accessibility-display' },
      { label: 'Ngôn ngữ & múi giờ', icon: 'globe', key: 'language-timezone' },
      { label: 'Ảnh, video & file', icon: 'play', key: 'media-files' },
    ],
  },
  {
    title: 'Ai thấy nội dung của bạn',
    key: 'content-visibility',
    subtitle: 'Chọn ai có thể xem từng loại nội dung.',
    items: [
      { label: 'Bảo vệ trang cá nhân', icon: 'shield', key: 'profile-protection' },
      { label: 'Thông tin hiển thị công khai', icon: 'person', key: 'public-info' },
      { label: 'Tìm kiếm & kết nối với bạn', icon: 'people', key: 'search-connect' },
      { label: 'Bài đăng', icon: 'doc', key: 'posts-visibility' },
      { label: 'Tin 24h', icon: 'story', key: 'stories-visibility' },
      { label: 'Surf Clips', icon: 'reel', key: 'clips-visibility' },
      { label: 'Người theo dõi & nội dung công khai', icon: 'follow', key: 'followers-public' },
      { label: 'Gắn thẻ & đề xuất', icon: 'tag', key: 'tagging-visibility' },
    ],
  },
  {
    title: 'Chặn & gắn thẻ',
    key: 'blocking-tagging',
    items: [
      { label: 'Gắn thẻ & đề xuất', icon: 'tag', key: 'tagging-suggestions' },
      { label: 'Danh sách chặn', icon: 'block', key: 'block-list' },
    ],
  },
  {
    title: 'Thanh toán & giao dịch',
    key: 'payment',
    subtitle: 'Phương thức thanh toán và lịch sử giao dịch.',
    items: [{ label: 'Quảng cáo đã thanh toán', icon: 'card', key: 'paid-ads' }],
  },
  {
    title: 'Hoạt động & dữ liệu',
    key: 'activity-data',
    subtitle: 'Xem nhật ký và nội dung bạn được gắn thẻ.',
    items: [
      { label: 'Lịch sử hoạt động', icon: 'list', key: 'activity-log' },
      { label: 'Ứng dụng đã kết nối', icon: 'box', key: 'connected-apps' },
      { label: 'Công cụ doanh nghiệp', icon: 'briefcase', key: 'business-tools' },
      { label: 'Quản lý dữ liệu của bạn', icon: 'help', key: 'manage-data' },
    ],
  },
  {
    title: 'Quy định & chính sách',
    key: 'policies',
    items: [
      { label: 'Điều khoản sử dụng', icon: 'book', key: 'terms' },
      { label: 'Chính sách bảo mật', icon: 'lock', key: 'privacy-policy' },
      { label: 'Cookie & dữ liệu trang', icon: 'cookie', key: 'cookies' },
      { label: 'Quy tắc cộng đồng', icon: 'handshake', key: 'community-rules' },
    ],
  },
  {
    title: 'Quản lý tài khoản',
    key: 'account-danger',
    items: [
      { label: 'Bảo mật', icon: 'shield', key: 'account-security' },
      { label: 'Xóa tài khoản', icon: 'trash', key: 'delete-account' },
    ],
  },
];

/** Map item key → section key để route nhanh */
export const ITEM_TO_SECTION: Record<string, string> = {};
for (const section of SETTINGS_DETAIL_SECTIONS) {
  for (const item of section.items) {
    ITEM_TO_SECTION[item.key] = section.key;
  }
}

export const MOST_ACCESSED = [
  {
    label: 'Chặn',
    desc: 'Xem lại những người mà bạn từng chặn hoặc thêm ai đó vào danh sách chặn của bạn.',
    icon: 'block' as const,
  },
  { label: 'Nhật ký hoạt động', desc: 'Xem và quản lý hoạt động của bạn.', icon: 'list' as const },
  { label: 'Chế độ tối', desc: '', icon: 'moon' as const },
];
