/** Constants & types dùng chung cho các component Settings */

export type DefaultAudience = 'public' | 'friends' | 'custom';

export type CustomSettingValue = 'public' | 'friends' | 'only_me' | 'friends_except' | 'specific_friends' | 'custom';

/** Chủ đề Kiểm tra quyền riêng tư — thiết kế Surf */
export const PRIVACY_CHECKUP_TOPICS = [
  { id: 'visibility', title: 'Ai có thể xem nội dung bạn chia sẻ', hint: 'Bài viết, Surf Clips, ảnh', icon: 'globe', accent: 'from-surf-primary to-cyan-400' },
  { id: 'find', title: 'Cách mọi người tìm thấy bạn trên Surf', hint: 'Tìm kiếm, lời mời kết bạn', icon: 'people', accent: 'from-sky-500 to-surf-secondary' },
  { id: 'data', title: 'Dữ liệu và quyền kiểm soát', hint: 'Tải dữ liệu, xóa tài khoản', icon: 'lock', accent: 'from-emerald-500 to-teal-400' },
  { id: 'security', title: 'Bảo vệ tài khoản', hint: 'Mật khẩu, đăng nhập', icon: 'shield', accent: 'from-surf-primary to-blue-500' },
  { id: 'ads', title: 'Tùy chọn quảng cáo', hint: 'Quảng cáo phù hợp với bạn', icon: 'bell', accent: 'from-violet-500 to-purple-400' },
];

/** Đối tượng xem mặc định — thiết kế Surf */
export const DEFAULT_AUDIENCE_OPTIONS: { value: DefaultAudience; title: string; desc: string; icon: 'globe' | 'people' | 'gear' }[] = [
  { value: 'public', title: 'Công khai', desc: 'Mọi người đều có thể xem và tương tác với nội dung bạn chia sẻ.', icon: 'globe' },
  { value: 'friends', title: 'Bạn bè', desc: 'Chỉ bạn bè thấy nội dung của bạn. Bài đăng công khai chỉ bạn bè mới bình luận được.', icon: 'people' },
  { value: 'custom', title: 'Tùy chỉnh', desc: 'Bạn chọn từng đối tượng cho từng loại nội dung. Có thể đổi bất kỳ lúc nào.', icon: 'gear' },
];

/** Các mục trong modal Xem lại lựa chọn — Surf */
export const REVIEW_ITEMS: { title: string; getValue: (audience: 'public' | 'friends' | 'custom') => string; icon: 'person' | 'comment' | 'globe' | 'people' | 'search' }[] = [
  { title: 'Ai có thể xem bài đăng, Tin 24h và Surf Clips?', getValue: (a) => a === 'public' ? 'Công khai' : a === 'friends' ? 'Bạn bè' : 'Tùy chỉnh', icon: 'person' },
  { title: 'Ai có thể bình luận bài đăng công khai?', getValue: (a) => a === 'public' ? 'Công khai' : a === 'friends' ? 'Bạn bè' : 'Tùy chỉnh', icon: 'comment' },
  { title: 'Thông tin công khai trên trang cá nhân', getValue: () => 'Công khai', icon: 'globe' },
  { title: 'Ai có thể xem danh sách theo dõi?', getValue: () => 'Chỉ mình tôi', icon: 'people' },
  { title: 'Tìm kiếm liên kết đến trang Surf?', getValue: () => 'Bật', icon: 'search' },
];

export const CUSTOM_SETTING_LABELS: Record<CustomSettingValue, string> = {
  public: 'Công khai',
  friends: 'Bạn bè',
  only_me: 'Chỉ mình tôi',
  friends_except: 'Bạn bè ngoại trừ',
  specific_friends: 'Bạn bè cụ thể',
  custom: 'Tùy chỉnh',
};

export const CUSTOM_SETTING_OPTIONS: CustomSettingValue[] = ['public', 'friends', 'only_me', 'friends_except', 'specific_friends', 'custom'];

/** Các mục trong modal Cài đặt tùy chỉnh */
export const CUSTOM_SETTINGS_ITEMS: { key: string; title: string }[] = [
  { key: 'posts', title: 'Ai có thể xem bài đăng của bạn trong tương lai?' },
  { key: 'stories', title: 'Ai có thể xem tin của bạn?' },
  { key: 'comments', title: 'Ai có thể bình luận về bài đăng công khai của bạn?' },
  { key: 'profile', title: 'Thông tin công khai trên trang cá nhân' },
  { key: 'follow_list', title: 'Ai có thể xem danh sách người bạn theo dõi?' },
];
