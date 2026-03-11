import { useLocation } from 'react-router-dom';
import FriendsLeftNav from '@/components/layout/FriendsLeftNav';
import { FriendsProvider, useFriends } from './FriendsContext';
import { EmptyState } from './ui';
import HomeSection from './HomeSection';
import RequestsSection from './RequestsSection';
import SuggestionsSection from './SuggestionsSection';
import AllFriendsSection from './AllFriendsSection';
import NicknamesSection from './NicknamesSection';

function FriendsContent() {
  const { pathname } = useLocation();
  const { friends, requests, loading, error } = useFriends();

  const section = pathname === '/feed/friends'   ? 'home'
    : pathname.endsWith('/requests')             ? 'requests'
    : pathname.endsWith('/suggestions')          ? 'suggestions'
    : pathname.endsWith('/all')                  ? 'all'
    : pathname.endsWith('/birthdays')            ? 'birthdays'
    : pathname.endsWith('/nicknames')            ? 'nicknames'
    : 'home';

  return (
    <div className="px-4 py-5 space-y-5">
      {/* Top bar: Title + horizontal tab navigation */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Bạn bè</h1>
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surf-primary/10 text-surf-primary font-semibold">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3z" /></svg>
              {friends.length}
            </span>
            {requests.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 font-semibold">
                {requests.length} mới
              </span>
            )}
          </div>
        </div>
        <FriendsLeftNav />
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-2xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm border border-red-200/50 dark:border-red-800/50">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <span className="w-8 h-8 border-2 border-surf-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {section === 'home' && <HomeSection />}
          {section === 'requests' && <RequestsSection />}
          {section === 'suggestions' && <SuggestionsSection />}
          {section === 'all' && <AllFriendsSection />}
          {section === 'birthdays' && (
            <EmptyState
              icon={<svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor"><path d="M12 6c1.11 0 2-.9 2-2 0-.38-.1-.73-.29-1.03L12 0l-1.71 2.97c-.19.3-.29.65-.29 1.03 0 1.1.9 2 2 2zm4.6 9.99l-1.07-1.07-1.08 1.07c-1.3 1.3-3.58 1.31-4.89 0l-1.07-1.07-1.09 1.07C6.75 16.64 5.88 17 4.96 17c-.73 0-1.4-.23-1.96-.61V21c0 .55.45 1 1 1h16c.55 0 1-.45 1-1v-4.61c-.56.38-1.23.61-1.96.61-.92 0-1.79-.36-2.44-1.01zM18 9H6c-1.66 0-3 1.34-3 3v.68c0 1.01.54 1.95 1.43 2.45.49.28 1.06.37 1.57.23.51-.13.99-.45 1.35-.94.36.49.84.81 1.35.94.5.14 1.07.04 1.57-.23.49-.27.87-.67 1.14-1.15.27.48.65.88 1.14 1.15.5.27 1.07.37 1.57.23.51-.13.99-.45 1.35-.94.36.49.84.81 1.35.94.51.14 1.08.05 1.57-.22C20.46 14.63 21 13.69 21 12.68V12c0-1.66-1.34-3-3-3z" /></svg>}
              title="Sinh nhật bạn bè"
              desc="Sinh nhật sắp tới của bạn bè sẽ xuất hiện ở đây."
            />
          )}
          {section === 'nicknames' && <NicknamesSection />}
        </div>
      )}
    </div>
  );
}

export default function Friends() {
  return (
    <FriendsProvider>
      <FriendsContent />
    </FriendsProvider>
  );
}

