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
      { label: 'Thiết bị đăng nhập', icon: 'smartphone', key: 'active-sessions' },
      { label: 'Ngôn ngữ & Múi giờ', icon: 'globe', key: 'language-timezone' },
      { label: 'Xóa tài khoản', icon: 'trash', key: 'delete-account' },
    ],
  },
  {
    title: 'Quyền riêng tư & Bảo vệ',
    key: 'privacy',
    subtitle: 'Kiểm soát ai có thể xem nội dung và tương tác với bạn.',
    items: [
      { label: 'Kiểm tra quyền riêng tư', icon: 'lock', key: 'privacy-checkup' },
      { label: 'Cài đặt quyền riêng tư', icon: 'eye', key: 'privacy-settings' },
      { label: 'Đối tượng xem mặc định', icon: 'gear', key: 'default-audience' },
      { label: 'Lời mời kết bạn', icon: 'people', key: 'friend-request-privacy' },
      { label: 'Danh sách chặn', icon: 'block', key: 'block-list' },
    ],
  },
  {
    title: 'Tùy chỉnh & Giao diện',
    key: 'personalization',
    subtitle: 'Cá nhân hóa trải nghiệm lướt Surf.',
    items: [
      { label: 'Giao diện hiển thị', icon: 'moon', key: 'appearance' },
      { label: 'Thông báo & Nhắc nhở', icon: 'bell', key: 'notifications' },
    ],
  },
  {
    title: 'Hỗ trợ & Chính sách',
    key: 'support',
    subtitle: 'Tiêu chuẩn cộng đồng, điều khoản và quyền lợi của bạn.',
    items: [
      { label: 'Báo cáo vi phạm', icon: 'shield', key: 'reports' },
      { label: 'Chính sách cộng đồng & Điều khoản', icon: 'doc', key: 'policy' },
    ],
  }
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
