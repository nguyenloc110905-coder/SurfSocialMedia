import { Link } from 'react-router-dom';

export type AdItem = { id: string; title: string; href?: string; imageUrl?: string };
export type FriendOnlineItem = { id: string; name: string; avatarUrl?: string };
export type ChatGroupItem = { id: string; name: string; href?: string; lastMessage?: string };

type MainRightSidebarProps = {
  ads?: AdItem[];
  friendsOnline?: FriendOnlineItem[];
  chatGroups?: ChatGroupItem[];
};

function Section({
  title,
  empty,
  emptyMessage,
  children,
}: {
  title: string;
  empty: boolean;
  emptyMessage: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex-shrink-0 pt-4 first:pt-0">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
        {title}
      </h3>
      {empty ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 py-2">{emptyMessage}</p>
      ) : (
        children
      )}
    </section>
  );
}

/** Cột phải: Quảng cáo, Bạn bè đang online, Nhóm chat. Chưa có dữ liệu thì hiển thị trống. */
export default function MainRightSidebar({
  ads = [],
  friendsOnline = [],
  chatGroups = [],
}: MainRightSidebarProps) {
  return (
    <aside className="hidden lg:flex flex-col min-w-0 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide bg-white/60 dark:bg-gray-900/60 p-4">
      {/* 1. Quảng cáo — gọi mềm hơn */}
      <Section title="Được tài trợ" empty={ads.length === 0} emptyMessage="Chưa có nội dung.">
        <ul className="space-y-2">
            {ads.map((ad) => (
              <li key={ad.id}>
                {ad.href ? (
                  <Link
                    to={ad.href}
                    className="block rounded-xl overflow-hidden border border-gray-200 dark:border-gray-600 hover:border-surf-primary/40 dark:hover:border-surf-secondary/40 transition-colors"
                  >
                    {ad.imageUrl ? (
                      <img src={ad.imageUrl} alt="" className="w-full aspect-[2/1] object-cover" />
                    ) : null}
                    <span className="block p-2 text-xs font-medium text-gray-800 dark:text-gray-200 line-clamp-2">
                      {ad.title}
                    </span>
                  </Link>
                ) : (
                  <div className="rounded-xl border border-gray-200 dark:border-gray-600 p-2">
                    <span className="block text-xs font-medium text-gray-800 dark:text-gray-200 line-clamp-2">
                      {ad.title}
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
      </Section>

      {/* 2. Bạn bè đang online — gọi mềm hơn */}
      <Section title="Đang hoạt động" empty={friendsOnline.length === 0} emptyMessage="Chưa có ai đang hoạt động.">
        <ul className="space-y-1.5">
            {friendsOnline.map((friend) => (
              <li key={friend.id}>
                <Link
                  to={`/feed/profile/${friend.id}`}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/80 transition-colors"
                >
                  <span className="relative flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 overflow-hidden">
                    {friend.avatarUrl ? (
                      <img src={friend.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center text-xs font-medium text-gray-600 dark:text-gray-300">
                        {friend.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-gray-800" title="Đang hoạt động" />
                  </span>
                  <span className="text-sm text-gray-800 dark:text-gray-200 truncate flex-1 min-w-0">
                    {friend.name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
      </Section>

      {/* 3. Nhóm chat — gọi mềm hơn */}
      <Section title="Trò chuyện" empty={chatGroups.length === 0} emptyMessage="Chưa có cuộc trò chuyện.">
        <ul className="space-y-1.5">
            {chatGroups.map((group) => (
              <li key={group.id}>
                <Link
                  to={group.href || '/feed/waves'}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/80 transition-colors"
                >
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-surf-primary/20 dark:bg-surf-secondary/20 flex items-center justify-center">
                    <svg className="w-4 h-4 text-surf-primary dark:text-surf-secondary" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" />
                    </svg>
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                      {group.name}
                    </span>
                    {group.lastMessage != null && (
                      <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">
                        {group.lastMessage}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
      </Section>
    </aside>
  );
}
