import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

const TABS: { id: string; label: string; hasArrow?: boolean }[] = [
  { id: 'posts', label: 'Bài viết' },
  { id: 'about', label: 'Giới thiệu' },
  { id: 'friends', label: 'Bạn bè' },
  { id: 'photos', label: 'Ảnh' },
  { id: 'reels', label: 'Surf Clips' },
  { id: 'more', label: 'Xem thêm', hasArrow: true },
];

export default function Profile() {
  const { uid } = useParams<{ uid: string }>();
  const user = useAuthStore((s) => s.user);
  const [activeTab, setActiveTab] = useState<string>('posts');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');

  const isOwnProfile = user?.uid === uid;
  const displayName = user?.displayName?.trim() || 'Người dùng';
  const initial = displayName.charAt(0).toUpperCase();
  const username = user?.email?.split('@')[0]?.trim();

  // Dữ liệu do người dùng tự cài đặt - tài khoản mới sẽ rỗng, sau này lấy từ API/Firestore
  const [coverImageUrl] = useState<string | null>(null);
  const [bio] = useState<string | null>(null);
  const [aboutDetails] = useState<{ icon: string; text: string }[]>([]);
  const [posts] = useState<{ id: string; time: string; text: string; hasImage?: boolean }[]>([]);
  const [highlightPhotos] = useState<string[]>([]); // ảnh nổi bật do người dùng thêm
  const friendCount: number | null = null;

  return (
    <div className="profile-page -mx-4 sm:-mx-6 md:mx-0 md:max-w-4xl md:mx-auto space-y-4">
      {/* Thẻ hồ sơ Surf: dải Surf + ảnh bìa + thông tin */}
      <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-700/80 overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-surf-primary to-surf-secondary" aria-hidden />
        {/* Ảnh bìa: trong thẻ, dưới dải Surf. h-28 mobile / h-36 desktop. Chưa ảnh = gradient; có coverImageUrl = ảnh object-cover. Nút "Ảnh bìa" góc dưới phải. Avatar đè lên (-mt-12/-mt-14), viền trắng + shadow. */}
        <div className="relative h-28 sm:h-36 bg-gradient-to-br from-surf-primary/20 via-surf-primary/10 to-surf-secondary/20 dark:from-surf-primary/15 dark:to-surf-secondary/15">
          {coverImageUrl && (
            <img src={coverImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          )}
          {isOwnProfile && (
            <button
              type="button"
              className="absolute bottom-2 right-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/50 dark:bg-black/60 text-white text-xs font-medium hover:bg-black/60 dark:hover:bg-black/70 transition-colors"
              title="Chỉnh sửa ảnh bìa"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.65.07-1 0-.35-.03-.68-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.4-1.06-.73-1.62-1l-.37-2.54A.488.488 0 0 0 14 2h-4c-.25 0-.46.18-.49.42l-.37 2.54c-.56.27-1.1.6-1.62 1l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.32-.07.65-.07 1 0 .35.03.68.07 1l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.06.73 1.62 1l.37 2.54c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.37-2.54c.56-.27 1.1-.6 1.62-1l2.49 1c.22.08.49 0 .61-.22l2-3.46c.12-.22.06-.49-.12-.64l-2.11-1.66Z" />
              </svg>
              Ảnh bìa
            </button>
          )}
        </div>
        <div className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 -mt-12 sm:-mt-14 relative">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className="relative flex-shrink-0 z-10">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-white dark:bg-gray-900 border-2 border-white dark:border-gray-900 shadow-md flex items-center justify-center text-3xl sm:text-4xl font-bold text-surf-primary dark:text-surf-primary/90 overflow-hidden">
                {user?.photoURL ? (
                  <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
                ) : (
                  initial
                )}
              </div>
              {isOwnProfile && (
                <button
                  type="button"
                  className="absolute -bottom-1 -right-1 w-8 h-8 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
                  aria-label="Đổi ảnh đại diện"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.65.07-1 0-.35-.03-.68-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.4-1.06-.73-1.62-1l-.37-2.54A.488.488 0 0 0 14 2h-4c-.25 0-.46.18-.49.42l-.37 2.54c-.56.27-1.1.6-1.62 1l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.32-.07.65-.07 1 0 .35.03.68.07 1l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.06.73 1.62 1l.37 2.54c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.37-2.54c.56-.27 1.1-.6 1.62-1l2.49 1c.22.08.49 0 .61-.22l2-3.46c.12-.22.06-.49-.12-.64l-2.11-1.66Z" />
                  </svg>
                </button>
              )}
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">{displayName}</h1>
              {username && (
                <p className="text-sm text-surf-primary dark:text-surf-primary/90 font-medium truncate">@{username}</p>
              )}
              {friendCount != null && (
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">{friendCount} kết nối</p>
              )}
              {isOwnProfile && friendCount == null && (
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Chưa có bạn bè · Thêm bạn để kết nối</p>
              )}
            </div>
          </div>
          {isOwnProfile && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-xl bg-surf-primary text-white text-sm font-semibold hover:bg-surf-primary/90 dark:hover:bg-surf-primary/80 transition-colors"
                title="Chỉnh sửa hồ sơ"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                </svg>
                Chỉnh sửa hồ sơ
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                aria-label="Tin mới"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                </svg>
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                aria-label="Khác"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                </svg>
              </button>
            </div>
          )}
        </div>
        <nav className="px-4 sm:px-6 pb-4" aria-label="Hồ sơ">
          <div className="flex overflow-x-auto scrollbar-hide gap-1 p-1 rounded-xl bg-gray-100 dark:bg-gray-800/80 w-fit min-w-0">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={[
                  'flex items-center gap-1 flex-shrink-0 py-2 px-3 sm:px-4 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
                  activeTab === tab.id
                    ? 'bg-white dark:bg-gray-700 text-surf-primary dark:text-surf-primary shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200',
                ].join(' ')}
              >
                {tab.label}
                {tab.hasArrow && (
                  <svg className="w-3.5 h-3.5 opacity-70" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7 10l5 5 5-5z" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </nav>
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <section className="lg:col-span-2 space-y-4 order-1">
          {isOwnProfile && (
            <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-700/80 p-3">
              <div className="flex gap-3 items-center">
                <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-sm font-semibold text-surf-primary flex-shrink-0">
                  {initial}
                </div>
                <button
                  type="button"
                  className="flex-1 text-left px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  Chia sẻ gì đó...
                </button>
                <button type="button" className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800" title="Ảnh">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" /></svg>
                </button>
                <button type="button" className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800" title="Video">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M18 11c0-.55-.45-1-1-1h-2V7c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v3H1c-.55 0-1 .45-1 1s.45 1 1 1h2v7c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2v-7h2c.55 0 1-.45 1-1z" /></svg>
                </button>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-surf-primary" />
              Bài viết
            </h2>
            {posts.length > 0 && (
              <div className="flex items-center gap-1">
                {isOwnProfile && (
                  <button type="button" className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800" title="Bộ lọc">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" /></svg>
                  </button>
                )}
                <div className="flex rounded-xl overflow-hidden border border-gray-200/80 dark:border-gray-700/80">
                  <button type="button" onClick={() => setViewMode('list')} className={`p-2 ${viewMode === 'list' ? 'bg-surf-primary text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`} title="Danh sách">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm4 4h14v-2H7v2zm0-4h14v-2H7v2zM7 7v2h14V7H7z" /></svg>
                  </button>
                  <button type="button" onClick={() => setViewMode('grid')} className={`p-2 ${viewMode === 'grid' ? 'bg-surf-primary text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`} title="Lưới">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3v8h8V3H3zm10 0v8h8V3h-8zM3 13v8h8v-8H3zm10 0v8h8v-8h-8z" /></svg>
                  </button>
                </div>
              </div>
            )}
          </div>
          {posts.length === 0 ? (
            <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-700/80 p-8 sm:p-12 text-center">
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">Chưa có bài viết nào</p>
              {isOwnProfile && <p className="text-gray-400 dark:text-gray-500 text-sm">Hãy đăng bài đầu tiên từ ô phía trên</p>}
            </div>
          ) : (
            <div className={viewMode === 'grid' ? 'grid grid-cols-2 sm:grid-cols-3 gap-3' : 'flex flex-col gap-3'}>
              {posts.map((post) => (
                <article key={post.id} className={`rounded-2xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-700/80 overflow-hidden ${viewMode === 'list' ? 'flex gap-3 p-3' : ''}`}>
                  {viewMode === 'grid' ? (
                    <>
                      <div className="aspect-square bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 dark:text-gray-500 text-xs">{post.hasImage ? 'Ảnh' : '📝'}</div>
                      <div className="p-2 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-gray-700 dark:text-gray-300 truncate">{post.text}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{post.time}</p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-20 h-20 rounded-xl bg-gray-100 dark:bg-gray-800 flex-shrink-0 flex items-center justify-center text-gray-400 text-xs">{post.hasImage ? 'Ảnh' : '📝'}</div>
                      <div className="min-w-0 flex-1 py-1">
                        <p className="text-sm text-gray-700 dark:text-gray-300">{post.text}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{post.time}</p>
                      </div>
                    </>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
        <aside className="lg:col-span-1 space-y-4 order-2">
          <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-700/80 overflow-hidden">
            <h2 className="px-4 py-3 text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-surf-primary" />
              Giới thiệu
            </h2>
            <div className="p-4">
              {bio ? (
                <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">{bio}</p>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 text-sm">Chưa thêm tiểu sử</p>
              )}
              {isOwnProfile && (
                <button type="button" className="mt-3 w-full py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                  {bio ? 'Chỉnh sửa tiểu sử' : 'Thêm tiểu sử'}
                </button>
              )}
              {aboutDetails.length > 0 ? (
                <ul className="mt-4 space-y-2 text-sm text-gray-700 dark:text-gray-300">
                  {aboutDetails.map((item) => (
                    <li key={item.text}>{item.text}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-gray-500 dark:text-gray-400 text-sm">Chưa thêm thông tin chi tiết</p>
              )}
              {isOwnProfile && (
                <button type="button" className="mt-3 w-full py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                  {aboutDetails.length > 0 ? 'Chỉnh sửa chi tiết' : 'Thêm chi tiết'}
                </button>
              )}
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Nổi bật</p>
                {highlightPhotos.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {highlightPhotos.map((url, i) => (
                      <img key={i} src={url} alt="" className="w-20 h-20 flex-shrink-0 rounded-xl object-cover" />
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Chưa thêm ảnh</p>
                )}
                {isOwnProfile && (
                  <button type="button" className="mt-2 text-sm text-surf-primary dark:text-surf-primary/90 font-medium hover:underline">Thêm ảnh đáng chú ý</button>
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
