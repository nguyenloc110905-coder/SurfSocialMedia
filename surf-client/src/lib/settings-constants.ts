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
    title: 'Tài khoản',
    key: 'account',
    subtitle: 'Quản lý cài đặt tài khoản và bảo mật.',
    items: [
      { label: 'Bảo mật tài khoản', icon: 'shield', key: 'account-security' },
      { label: 'Xóa tài khoản', icon: 'trash', key: 'delete-account' },
      { label: 'Ngôn ngữ & Múi giờ', icon: 'globe', key: 'language-timezone' },
    ],
  },
  {
    title: 'Quyền riêng tư',
    key: 'privacy',
    subtitle: 'Kiểm soát ai có thể xem nội dung và hoạt động của bạn.',
    items: [
      { label: 'Kiểm tra quyền riêng tư', icon: 'lock', key: 'privacy-checkup' },
      { label: 'Đối tượng xem mặc định', icon: 'gear', key: 'default-audience' },
      {
        label: 'Ai có thể gửi lời mời kết bạn',
        icon: 'people',
        key: 'friend-request-privacy',
      },
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
      { label: 'Cài đặt quyền riêng tư nội dung', icon: 'shield', key: 'privacy-settings' },
      { label: 'Bảo vệ trang cá nhân', icon: 'shield', key: 'profile-protection' },
      { label: 'Thông tin công khai', icon: 'person', key: 'public-info' },
      { label: 'Tìm kiếm & Kết nối', icon: 'people', key: 'search-connect' },
      { label: 'Hiển thị bài đăng', icon: 'doc', key: 'posts-visibility' },
      { label: 'Hiển thị tin 24h', icon: 'story', key: 'stories-visibility' },
      { label: 'Hiển thị Surf Clips', icon: 'reel', key: 'clips-visibility' },
      { label: 'Người theo dõi & Nội dung công khai', icon: 'follow', key: 'followers-public' },
      { label: 'Gắn thẻ & Gợi ý', icon: 'tag', key: 'tagging-visibility' },
      { label: 'Danh sách chặn', icon: 'block', key: 'block-list' },
    ],
  },
  {
    title: 'Thông báo',
    key: 'notifications',
    subtitle: 'Quản lý tùy chọn thông báo của bạn.',
    items: [
      { label: 'Thông báo & Nhắc nhở', icon: 'bell', key: 'notifications' },
    ],
  },
  {
    title: 'Giao diện',
    key: 'appearance',
    subtitle: 'Tùy chỉnh giao diện và cảm nhận của ứng dụng.',
    items: [
      { label: 'Trợ năng & Hiển thị', icon: 'accessibility', key: 'accessibility-display' },
      { label: 'Cảm xúc & Phản hồi', icon: 'like', key: 'emotions-feedback' },
      { label: 'Tệp phương tiện', icon: 'play', key: 'media-files' },
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
    label: 'Danh sách chặn',
    desc: 'Xem và quản lý những người bạn đã chặn.',
    icon: 'block' as const,
  },
  { label: 'Bảo mật tài khoản', desc: 'Quản lý cài đặt bảo mật tài khoản của bạn.', icon: 'shield' as const },
  { label: 'Thông báo', desc: 'Tùy chỉnh tùy chọn thông báo của bạn.', icon: 'bell' as const },
];
