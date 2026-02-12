/** Dữ liệu và icon dùng chung cho Cài đặt và quyền riêng tư (panel + trang full) */

export const iconCls = 'w-5 h-5 text-gray-600 dark:text-gray-400 flex-shrink-0';

export const SIDEBAR_ITEMS: { label: string; icon: string }[] = [
  { label: 'Cài đặt', icon: 'gear' },
  { label: 'Ngôn ngữ & khu vực', icon: 'globe' },
  { label: 'Rà soát quyền riêng tư', icon: 'lock-heart' },
  { label: 'Trung tâm bảo mật', icon: 'lock' },
  { label: 'Lịch sử hoạt động', icon: 'list' },
  { label: 'Lọc nội dung', icon: 'filter' },
];

export const SETTINGS_DETAIL_SECTIONS: { title: string; subtitle?: string; items: { label: string; icon: string }[] }[] = [
  { title: 'Hỗ trợ & kiểm soát', subtitle: 'Dùng công cụ Surf để quản lý bảo mật và quyền riêng tư.', items: [{ label: 'Kiểm tra quyền riêng tư', icon: 'lock' }, { label: 'Đối tượng xem mặc định', icon: 'gear' }] },
  { title: 'Cá nhân hóa', subtitle: 'Làm Surf hoạt động đúng cách bạn muốn.', items: [{ label: 'Cảm xúc & phản hồi', icon: 'like' }, { label: 'Thông báo & nhắc', icon: 'bell' }, { label: 'Trợ năng & hiển thị', icon: 'accessibility' }, { label: 'Ngôn ngữ & múi giờ', icon: 'globe' }, { label: 'Ảnh, video & file', icon: 'play' }] },
  { title: 'Ai thấy nội dung của bạn', subtitle: 'Chọn ai có thể xem từng loại nội dung.', items: [{ label: 'Bảo vệ trang cá nhân', icon: 'shield' }, { label: 'Thông tin hiển thị công khai', icon: 'person' }, { label: 'Tìm kiếm & kết nối với bạn', icon: 'people' }, { label: 'Bài đăng', icon: 'doc' }, { label: 'Tin 24h', icon: 'story' }, { label: 'Surf Clips', icon: 'reel' }, { label: 'Người theo dõi & nội dung công khai', icon: 'follow' }, { label: 'Gắn thẻ & đề xuất', icon: 'tag' }] },
  { title: 'Chặn & gắn thẻ', items: [{ label: 'Gắn thẻ & đề xuất', icon: 'tag' }, { label: 'Danh sách chặn', icon: 'block' }] },
  { title: 'Thanh toán & giao dịch', subtitle: 'Phương thức thanh toán và lịch sử giao dịch.', items: [{ label: 'Quảng cáo đã thanh toán', icon: 'card' }] },
  { title: 'Hoạt động & dữ liệu', subtitle: 'Xem nhật ký và nội dung bạn được gắn thẻ.', items: [{ label: 'Lịch sử hoạt động', icon: 'list' }, { label: 'Ứng dụng đã kết nối', icon: 'box' }, { label: 'Công cụ doanh nghiệp', icon: 'briefcase' }, { label: 'Quản lý dữ liệu của bạn', icon: 'help' }] },
  { title: 'Quy định & chính sách', items: [{ label: 'Điều khoản sử dụng', icon: 'book' }, { label: 'Chính sách bảo mật', icon: 'lock' }, { label: 'Cookie & dữ liệu trang', icon: 'cookie' }, { label: 'Quy tắc cộng đồng', icon: 'handshake' }] },
];

export const MOST_ACCESSED = [
  { label: 'Chặn', desc: 'Xem lại những người mà bạn từng chặn hoặc thêm ai đó vào danh sách chặn của bạn.', icon: 'block' as const },
  { label: 'Nhật ký hoạt động', desc: 'Xem và quản lý hoạt động của bạn.', icon: 'list' as const },
  { label: 'Chế độ tối', desc: '', icon: 'moon' as const },
];

export function SettingsIcon({ name }: { name: string }) {
  const cls = iconCls;
  if (name === 'gear') return <svg className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.04.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" /></svg>;
  if (name === 'lock') return <svg className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" /></svg>;
  if (name === 'home') return <svg className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" /></svg>;
  if (name === 'globe') return <svg className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm6.93 6h-2.95c-.32-1.25-.78-2.45-1.38-3.56 1.84.63 3.37 1.91 4.33 3.56zM12 4.04c.96 1.29 1.73 2.69 2.21 4.16h-4.42c.48-1.47 1.25-2.87 2.21-4.16zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2s.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56-1.84-.63-3.37-1.9-4.33-3.56zm2.95-8H4.26C4.1 10.64 4 11.31 4 12s.1 1.36.26 2h2.95c-.08-.66-.14-1.32-.14-2s.06-1.34.14-2zM12 19.96c-.96-1.29-1.73-2.69-2.21-4.16h4.42c-.48 1.47-1.25 2.87-2.21 4.16zM14.66 14c.08-.66.14-1.32.14-2s-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z" /></svg>;
  if (name === 'like') return <svg className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" /></svg>;
  if (name === 'bell') return <svg className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" /></svg>;
  if (name === 'accessibility') return <svg className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2zm9 7h-6v13h-2v-6h-2v6H9V9H3V7h18v2z" /></svg>;
  if (name === 'play') return <svg className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>;
  if (name === 'shield') return <svg className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" /></svg>;
  if (name === 'person') return <svg className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>;
  if (name === 'people') return <svg className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" /></svg>;
  if (name === 'doc') return <svg className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z" /></svg>;
  if (name === 'story') return <svg className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z" /></svg>;
  if (name === 'reel') return <svg className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM4 6h4v12H4V6zm16 12h-4V6h4v12z" /></svg>;
  if (name === 'follow') return <svg className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" /></svg>;
  if (name === 'tag') return <svg className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-4 14H4v-6h12v6zm4-8H4V6h16v4z" /></svg>;
  if (name === 'block') return <svg className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" /></svg>;
  if (name === 'card') return <svg className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z" /></svg>;
  if (name === 'list') return <svg className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" /></svg>;
  if (name === 'box') return <svg className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>;
  if (name === 'briefcase') return <svg className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z" /></svg>;
  if (name === 'help') return <svg className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z" /></svg>;
  if (name === 'book') return <svg className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z" /></svg>;
  if (name === 'cookie') return <svg className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" /></svg>;
  if (name === 'handshake') return <svg className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M11.56 5.5L10 4 6 8l2 2 3.56-3.5zM20 10l-4-4-2.56 2.5L16 10l4 4 2.5-2.5L20 10zM4 18l4 4 2.56-2.5L8 18l-4-4 2.5-2.5L4 18zm16 0l-2.5-2.5L16 18l4 4 2.56-2.5L20 18z" /></svg>;
  if (name === 'lock-heart') return <svg className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" /></svg>;
  if (name === 'filter') return <svg className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" /></svg>;
  return null;
}
