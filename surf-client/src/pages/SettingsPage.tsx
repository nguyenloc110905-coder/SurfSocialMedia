import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { SETTINGS_DETAIL_SECTIONS, MOST_ACCESSED, SettingsIcon } from '@/lib/settings-data.tsx';

/** Chủ đề Kiểm tra quyền riêng tư — thiết kế Surf */
const PRIVACY_CHECKUP_TOPICS = [
  { id: 'visibility', title: 'Ai có thể xem nội dung bạn chia sẻ', hint: 'Bài viết, Surf Clips, ảnh', icon: 'globe', accent: 'from-surf-primary to-cyan-400' },
  { id: 'find', title: 'Cách mọi người tìm thấy bạn trên Surf', hint: 'Tìm kiếm, lời mời kết bạn', icon: 'people', accent: 'from-sky-500 to-surf-secondary' },
  { id: 'data', title: 'Dữ liệu và quyền kiểm soát', hint: 'Tải dữ liệu, xóa tài khoản', icon: 'lock', accent: 'from-emerald-500 to-teal-400' },
  { id: 'security', title: 'Bảo vệ tài khoản', hint: 'Mật khẩu, đăng nhập', icon: 'shield', accent: 'from-surf-primary to-blue-500' },
  { id: 'ads', title: 'Tùy chọn quảng cáo', hint: 'Quảng cáo phù hợp với bạn', icon: 'bell', accent: 'from-violet-500 to-purple-400' },
];

type DefaultAudience = 'public' | 'friends' | 'custom';
/** Đối tượng xem mặc định — thiết kế Surf */
const DEFAULT_AUDIENCE_OPTIONS: { value: DefaultAudience; title: string; desc: string; icon: 'globe' | 'people' | 'gear' }[] = [
  { value: 'public', title: 'Công khai', desc: 'Mọi người đều có thể xem và tương tác với nội dung bạn chia sẻ.', icon: 'globe' },
  { value: 'friends', title: 'Bạn bè', desc: 'Chỉ bạn bè thấy nội dung của bạn. Bài đăng công khai chỉ bạn bè mới bình luận được.', icon: 'people' },
  { value: 'custom', title: 'Tùy chỉnh', desc: 'Bạn chọn từng đối tượng cho từng loại nội dung. Có thể đổi bất kỳ lúc nào.', icon: 'gear' },
];

/** Các mục trong modal Xem lại lựa chọn — Surf */
const REVIEW_ITEMS: { title: string; getValue: (audience: 'public' | 'friends') => string; icon: 'person' | 'comment' | 'globe' | 'people' | 'search' }[] = [
  { title: 'Ai có thể xem bài đăng, Tin 24h và Surf Clips?', getValue: (a) => a === 'public' ? 'Công khai' : 'Bạn bè', icon: 'person' },
  { title: 'Ai có thể bình luận bài đăng công khai?', getValue: (a) => a === 'public' ? 'Công khai' : 'Bạn bè', icon: 'comment' },
  { title: 'Thông tin công khai trên trang cá nhân', getValue: () => 'Công khai', icon: 'globe' },
  { title: 'Ai có thể xem danh sách theo dõi?', getValue: () => 'Chỉ mình tôi', icon: 'people' },
  { title: 'Tìm kiếm liên kết đến trang Surf?', getValue: () => 'Bật', icon: 'search' },
];

/** Giá trị có thể chọn cho từng mục cài đặt tùy chỉnh */
type CustomSettingValue = 'public' | 'friends' | 'only_me' | 'friends_except' | 'specific_friends' | 'custom';
const CUSTOM_SETTING_LABELS: Record<CustomSettingValue, string> = {
  public: 'Công khai',
  friends: 'Bạn bè',
  only_me: 'Chỉ mình tôi',
  friends_except: 'Bạn bè ngoại trừ',
  specific_friends: 'Bạn bè cụ thể',
  custom: 'Tùy chỉnh',
};
const CUSTOM_SETTING_OPTIONS: CustomSettingValue[] = ['public', 'friends', 'only_me', 'friends_except', 'specific_friends', 'custom'];

/** Các mục trong modal Cài đặt tùy chỉnh */
const CUSTOM_SETTINGS_ITEMS: { key: string; title: string }[] = [
  { key: 'posts', title: 'Ai có thể xem bài đăng của bạn trong tương lai?' },
  { key: 'stories', title: 'Ai có thể xem tin của bạn?' },
  { key: 'comments', title: 'Ai có thể bình luận về bài đăng công khai của bạn?' },
  { key: 'profile', title: 'Thông tin công khai trên trang cá nhân' },
  { key: 'follow_list', title: 'Ai có thể xem danh sách người bạn theo dõi?' },
];

/** Trang Cài đặt — thiết kế Surf: accent màu surf, gọn, khác biệt FB */
export default function SettingsPage() {
  const [selectedDetail, setSelectedDetail] = useState<string | null>(null);
  const [defaultAudience, setDefaultAudience] = useState<DefaultAudience>('custom');
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showCustomSettingsModal, setShowCustomSettingsModal] = useState(false);
  const [customSettingsValues, setCustomSettingsValues] = useState<Record<string, CustomSettingValue>>(() =>
    Object.fromEntries(CUSTOM_SETTINGS_ITEMS.map(({ key }) => [key, key === 'follow_list' ? 'only_me' : 'public']))
  );
  const [editingSettingKey, setEditingSettingKey] = useState<string | null>(null);
  const [searchEngineLink, setSearchEngineLink] = useState(true);

  useEffect(() => {
    if (!showReviewModal && !showCustomSettingsModal) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingSettingKey) setEditingSettingKey(null);
        else if (showCustomSettingsModal) setShowCustomSettingsModal(false);
        else setShowReviewModal(false);
      }
    };
    document.addEventListener('keydown', onEscape);
    document.body.style.overflow = showReviewModal || showCustomSettingsModal ? 'hidden' : '';
    return () => {
      document.removeEventListener('keydown', onEscape);
      document.body.style.overflow = '';
    };
  }, [showReviewModal, showCustomSettingsModal, editingSettingKey]);

  const handleContinueAudience = () => {
    if (defaultAudience === 'public' || defaultAudience === 'friends') {
      setShowReviewModal(true);
    } else if (defaultAudience === 'custom') {
      setShowCustomSettingsModal(true);
    } else {
      setSelectedDetail(null);
    }
  };

  return (
    <div className="flex-1 w-full min-h-0 flex flex-col bg-surf-light dark:bg-surf-dark border-b border-slate-200/80 dark:border-slate-700/80 overflow-hidden">
      {/* Thanh quay lại — accent Surf */}
      <div className="flex-shrink-0 flex items-center border-b border-slate-200/80 dark:border-slate-700/80 bg-white/80 dark:bg-surf-card/80 backdrop-blur-sm">
        <div className="flex-1 flex items-center h-12 pl-4 border-l-4 border-surf-primary">
          <Link
            to="/feed"
            className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:text-surf-primary dark:hover:text-surf-secondary transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
            </svg>
            <span className="font-medium">Quay lại</span>
          </Link>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 flex-col lg:flex-row">
        {/* Sidebar — viền trái màu Surf */}
        <aside className="w-80 lg:w-96 flex-shrink-0 border-r border-slate-200/80 dark:border-slate-700/80 flex flex-col overflow-hidden border-l-4 border-l-surf-primary bg-white dark:bg-surf-card/50">
          <div className="pt-5 pr-4 pb-4 pl-4 border-b border-slate-200/80 dark:border-slate-700/80">
            <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">
              Cài đặt
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Quản lý tài khoản và quyền riêng tư</p>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
              </svg>
              <input
                type="text"
                placeholder="Tìm kiếm cài đặt"
                className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 border-0 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-surf-primary/40 focus:ring-offset-0 transition-shadow"
              />
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto py-3 px-2">
            {SETTINGS_DETAIL_SECTIONS.map((section) => (
              <div key={section.title} className="mb-6">
                <h2 className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-surf-primary dark:text-surf-secondary mb-1">
                  {section.title}
                </h2>
                {section.subtitle && (
                  <p className="px-3 text-xs text-slate-500 dark:text-slate-400 mb-2 line-clamp-2">{section.subtitle}</p>
                )}
                <ul className="space-y-0.5">
                  {section.items.map((item) => {
                    const isPrivacyCheckup = item.label === 'Kiểm tra quyền riêng tư';
                    const isDefaultAudience = item.label === 'Đối tượng xem mặc định';
                    const isActive =
                      (isPrivacyCheckup && selectedDetail === 'privacy-checkup') ||
                      (isDefaultAudience && selectedDetail === 'default-audience');
                    const onItemClick = () => {
                      if (isPrivacyCheckup) setSelectedDetail('privacy-checkup');
                      else if (isDefaultAudience) setSelectedDetail('default-audience');
                      else setSelectedDetail(null);
                    };
                    return (
                      <li key={item.label}>
                        <button
                          type="button"
                          onClick={onItemClick}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors group ${
                            isActive
                              ? 'bg-surf-primary/15 dark:bg-surf-primary/25 text-surf-primary dark:text-surf-secondary'
                              : 'text-slate-700 dark:text-slate-200 hover:bg-surf-primary/10 dark:hover:bg-surf-primary/20'
                          }`}
                        >
                          <span className={`[&_svg]:!text-current opacity-90 group-hover:opacity-100 ${isActive ? 'text-surf-primary dark:text-surf-secondary' : 'text-surf-primary dark:text-surf-secondary'}`}>
                            <SettingsIcon name={item.icon} />
                          </span>
                          <span className="text-sm font-medium flex-1">{item.label}</span>
                          <svg className="w-4 h-4 text-slate-400 group-hover:text-surf-primary dark:group-hover:text-surf-secondary flex-shrink-0 transition-colors" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                          </svg>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* Nội dung chính — panel mặc định hoặc Kiểm tra quyền riêng tư */}
        <main className="flex-1 min-w-0 overflow-y-auto p-6 lg:p-8 bg-slate-50/50 dark:bg-slate-900/30">
          {selectedDetail === 'privacy-checkup' ? (
            /* Panel Kiểm tra quyền riêng tư — thiết kế Surf */
            <div className="max-w-3xl">
              <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">
                Kiểm tra quyền riêng tư
              </h1>
              <p className="text-slate-600 dark:text-slate-300 mb-8">
                Chọn chủ đề để chúng tôi hướng dẫn bạn thiết lập phù hợp với tài khoản Surf.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                {PRIVACY_CHECKUP_TOPICS.map((topic) => (
                  <button
                    key={topic.id}
                    type="button"
                    className="flex gap-4 p-5 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-600/80 hover:border-surf-primary/40 dark:hover:border-surf-secondary/50 hover:shadow-lg hover:shadow-surf-primary/10 dark:hover:shadow-surf-secondary/10 text-left transition-all group border-l-4 border-l-surf-primary dark:border-l-surf-secondary"
                  >
                    <span className={`w-12 h-12 rounded-xl bg-gradient-to-br ${topic.accent} flex items-center justify-center flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform [&_svg]:!text-white [&_svg]:w-6 [&_svg]:h-6 dark:opacity-95`}>
                      <SettingsIcon name={topic.icon} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{topic.title}</span>
                      {topic.hint && (
                        <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">{topic.hint}</span>
                      )}
                    </div>
                    <svg className="w-5 h-5 text-slate-300 dark:text-slate-500 group-hover:text-surf-primary dark:group-hover:text-surf-secondary flex-shrink-0 self-center transition-colors" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                    </svg>
                  </button>
                ))}
              </div>

              <p className="text-sm text-slate-500 dark:text-slate-400">
                Xem thêm trong{' '}
                <button type="button" onClick={() => setSelectedDetail(null)} className="text-surf-primary dark:text-surf-secondary font-medium hover:underline">
                  Cài đặt
                </button>
                .
              </p>
            </div>
          ) : selectedDetail === 'default-audience' ? (
            /* Panel Đối tượng xem mặc định — thiết kế Surf */
            <div className="max-w-2xl">
              <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">
                Đối tượng xem mặc định
              </h1>
              <p className="text-slate-600 dark:text-slate-300 mb-6">
                Surf sẽ dùng lựa chọn của bạn làm mặc định cho bài đăng, Tin 24h và Surf Clips. Bạn vẫn có thể đổi đối tượng cho từng nội dung khi đăng.
              </p>

              <div className="space-y-3 mb-6">
                {DEFAULT_AUDIENCE_OPTIONS.map((opt) => {
                  const selected = defaultAudience === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDefaultAudience(opt.value)}
                      className={`w-full flex items-start gap-4 p-4 rounded-2xl text-left transition-all border-2 ${
                        selected
                          ? 'border-surf-primary dark:border-surf-secondary bg-surf-primary/10 dark:bg-surf-secondary/15 shadow-md shadow-surf-primary/10 dark:shadow-surf-secondary/10'
                          : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/90 hover:border-slate-300 dark:hover:border-slate-500'
                      }`}
                    >
                      <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        selected ? 'bg-surf-primary dark:bg-surf-secondary text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                      } [&_svg]:w-5 [&_svg]:h-5`}>
                        {opt.icon === 'globe' && <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" /></svg>}
                        {opt.icon === 'people' && <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" /></svg>}
                        {opt.icon === 'gear' && <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.04.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" /></svg>}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="block font-semibold text-slate-800 dark:text-slate-100">{opt.title}</span>
                        <span className="block text-sm text-slate-500 dark:text-slate-400 mt-0.5">{opt.desc}</span>
                      </div>
                      <span className={`w-5 h-5 rounded-full border-2 flex-shrink-0 mt-1 ${
                        selected ? 'border-surf-primary dark:border-surf-secondary bg-surf-primary dark:bg-surf-secondary' : 'border-slate-300 dark:border-slate-500'
                      } ${selected ? 'ring-2 ring-surf-primary/30 dark:ring-surf-secondary/30 ring-offset-2 dark:ring-offset-surf-dark' : ''}`}>
                        {selected && <span className="block w-full h-full rounded-full bg-white scale-50" />}
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                className="text-sm text-surf-primary dark:text-surf-secondary hover:underline"
              >
                Bạn cần trợ giúp lựa chọn?
              </button>

              <div className="mt-8">
                <button
                  type="button"
                  onClick={handleContinueAudience}
                  className="w-full sm:w-auto px-8 py-3 rounded-xl font-semibold bg-surf-primary dark:bg-surf-secondary text-white hover:opacity-90 focus:ring-2 focus:ring-surf-primary/50 dark:focus:ring-surf-secondary/50 focus:ring-offset-2 dark:focus:ring-offset-surf-dark transition-opacity"
                >
                  Tiếp
                </button>
              </div>
            </div>
          ) : (
            <>
              <section className="mb-8">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4">
                  Truy cập nhanh
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {MOST_ACCESSED.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      className="flex items-center gap-4 p-4 rounded-xl bg-white dark:bg-surf-card/80 border border-slate-200/80 dark:border-slate-700/80 hover:border-surf-primary/50 dark:hover:border-surf-primary/50 hover:shadow-md hover:shadow-surf-primary/5 text-left transition-all group"
                    >
                      <span className="w-11 h-11 rounded-xl bg-surf-primary/15 dark:bg-surf-primary/25 flex items-center justify-center flex-shrink-0 text-surf-primary dark:text-surf-secondary group-hover:scale-105 transition-transform">
                        {item.icon === 'block' && <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" /></svg>}
                        {item.icon === 'list' && <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" /></svg>}
                        {item.icon === 'moon' && <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z" /></svg>}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{item.label}</span>
                        {item.desc && (
                          <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{item.desc}</span>
                        )}
                      </div>
                      <svg className="w-4 h-4 text-slate-400 group-hover:text-surf-primary dark:group-hover:text-surf-secondary flex-shrink-0 transition-colors" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                      </svg>
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Khác
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Duyệt các nhóm cài đặt ở cột bên trái hoặc dùng ô tìm kiếm phía trên.
                </p>
              </section>
            </>
          )}
        </main>
      </div>

      {/* Modal Xem lại lựa chọn — Surf style (chỉ khi chọn Công khai hoặc Bạn bè + bấm Tiếp) */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="review-modal-title">
          <div className="absolute inset-0 bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm" aria-hidden onClick={() => setShowReviewModal(false)} />
          <div className="relative flex flex-col w-full max-w-lg rounded-2xl bg-white dark:bg-slate-800 border-2 border-surf-primary/30 dark:border-surf-secondary/30 shadow-2xl shadow-surf-primary/10 dark:shadow-surf-secondary/10">
            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-600 bg-gradient-to-r from-surf-primary/10 to-transparent dark:from-surf-secondary/15 rounded-t-2xl">
              <h2 id="review-modal-title" className="text-lg font-bold text-slate-800 dark:text-slate-100">
                Xem lại lựa chọn
              </h2>
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-surf-primary dark:hover:text-surf-secondary transition-colors"
                aria-label="Đóng"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
              </button>
            </div>

            {/* Nội dung — gọn vừa, không cuộn */}
            <div className="flex-shrink-0 px-4 py-4">
              <p className="text-sm text-slate-700 dark:text-slate-200 mb-4">
                Đối tượng mặc định: <strong className="text-slate-800 dark:text-slate-100">{defaultAudience === 'public' ? 'Công khai' : 'Bạn bè'}</strong>
              </p>
              <div className="space-y-2">
                {REVIEW_ITEMS.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 py-2.5 px-3 rounded-lg bg-slate-50 dark:bg-slate-700/50 border-l-4 border-l-surf-primary dark:border-l-surf-secondary"
                  >
                    <span className="w-8 h-8 rounded-lg bg-surf-primary/20 dark:bg-surf-secondary/25 flex items-center justify-center flex-shrink-0 text-surf-primary dark:text-surf-secondary [&_svg]:w-4 [&_svg]:h-4">
                      {item.icon === 'person' && <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>}
                      {item.icon === 'comment' && <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" /></svg>}
                      {item.icon === 'globe' && <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" /></svg>}
                      {item.icon === 'people' && <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" /></svg>}
                      {item.icon === 'search' && <svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" /></svg>}
                    </span>
                    <div className="min-w-0 flex-1 flex items-center justify-between gap-3">
                      <span className="text-sm text-slate-800 dark:text-slate-100">{item.title}</span>
                      <span className="text-sm font-medium text-slate-600 dark:text-slate-300 flex-shrink-0">{item.getValue(defaultAudience)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer 2 nút */}
            <div className="flex-shrink-0 flex flex-col sm:flex-row gap-3 p-4 border-t border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/50 rounded-b-2xl">
              <button
                type="button"
                onClick={() => { setShowReviewModal(false); setSelectedDetail(null); }}
                className="flex-1 order-2 sm:order-1 px-4 py-3 rounded-xl font-semibold bg-surf-primary dark:bg-surf-secondary text-white hover:opacity-90 transition-opacity"
              >
                Xác nhận
              </button>
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                className="flex-1 order-1 sm:order-2 px-4 py-3 rounded-xl font-semibold border-2 border-slate-300 dark:border-slate-500 text-slate-700 dark:text-slate-200 hover:border-surf-primary dark:hover:border-surf-secondary hover:text-surf-primary dark:hover:text-surf-secondary transition-colors"
              >
                Chỉnh sửa phần cài đặt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Cài đặt tùy chỉnh — khi chọn Tùy chỉnh + Tiếp */}
      {showCustomSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="custom-modal-title">
          <div className="absolute inset-0 bg-slate-900/60 dark:bg-slate-950/70 backdrop-blur-sm" aria-hidden onClick={() => !editingSettingKey && setShowCustomSettingsModal(false)} />
          <div className="relative flex flex-col w-full max-w-lg rounded-2xl bg-white dark:bg-slate-800 border-2 border-surf-primary/30 dark:border-surf-secondary/30 shadow-2xl">
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-600 rounded-t-2xl bg-gradient-to-r from-surf-primary/10 to-transparent dark:from-surf-secondary/15">
              <h2 id="custom-modal-title" className="text-lg font-bold text-slate-800 dark:text-slate-100">Cài đặt tùy chỉnh</h2>
              <button type="button" onClick={() => setShowCustomSettingsModal(false)} className="p-2 rounded-lg text-slate-500 hover:text-surf-primary dark:hover:text-surf-secondary transition-colors" aria-label="Đóng">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg>
              </button>
            </div>
            <div className="flex-shrink-0 px-4 py-4 space-y-1">
              {CUSTOM_SETTINGS_ITEMS.map(({ key, title }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setEditingSettingKey(key)}
                  className="w-full flex items-center justify-between gap-3 py-3 px-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700/50 text-left border-l-4 border-l-surf-primary dark:border-l-surf-secondary"
                >
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-100 flex-1">{title}</span>
                  <span className="text-sm text-slate-500 dark:text-slate-400 flex-shrink-0">{CUSTOM_SETTING_LABELS[customSettingsValues[key] ?? 'public']}</span>
                  <svg className="w-4 h-4 text-slate-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" /></svg>
                </button>
              ))}
              <div className="pt-3 mt-3 border-t border-slate-200 dark:border-slate-600">
                <p className="text-sm text-slate-700 dark:text-slate-200 mb-2">Cho phép công cụ tìm kiếm liên kết đến trang cá nhân Surf?</p>
                <button
                  type="button"
                  role="switch"
                  aria-checked={searchEngineLink}
                  onClick={() => setSearchEngineLink((v) => !v)}
                  className={`relative inline-flex h-7 w-12 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:ring-2 focus:ring-surf-primary/50 ${searchEngineLink ? 'bg-surf-primary dark:bg-surf-secondary' : 'bg-slate-200 dark:bg-slate-600'}`}
                >
                  <span className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition ${searchEngineLink ? 'translate-x-5' : 'translate-x-1'}`} />
                </button>
                <span className="ml-2 text-sm text-slate-500 dark:text-slate-400">{searchEngineLink ? 'Bật' : 'Tắt'}</span>
              </div>
            </div>
            <div className="flex-shrink-0 p-4 border-t border-slate-200 dark:border-slate-600 rounded-b-2xl bg-slate-50/50 dark:bg-slate-800/50">
              <button
                type="button"
                onClick={() => { setShowCustomSettingsModal(false); setSelectedDetail(null); }}
                className="w-full py-3 rounded-xl font-semibold bg-surf-primary dark:bg-surf-secondary text-white hover:opacity-90 transition-opacity"
              >
                Xong
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Picker chọn đối tượng khi bấm vào 1 mục trong Cài đặt tùy chỉnh */}
      {editingSettingKey && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" aria-hidden onClick={() => setEditingSettingKey(null)} />
          <div className="relative w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-800 border-2 border-surf-primary/30 dark:border-surf-secondary/30 shadow-2xl p-4 pb-6">
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-3">Chọn đối tượng</p>
            <div className="space-y-1">
              {CUSTOM_SETTING_OPTIONS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setCustomSettingsValues((prev) => ({ ...prev, [editingSettingKey]: value }));
                    setEditingSettingKey(null);
                  }}
                  className="w-full flex items-center justify-between py-3 px-4 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700/50 text-left"
                >
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{CUSTOM_SETTING_LABELS[value]}</span>
                  {(customSettingsValues[editingSettingKey] ?? 'public') === value && (
                    <svg className="w-5 h-5 text-surf-primary dark:text-surf-secondary" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
