import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { useFeedStore, type FeedPost } from '../stores/feedStore';
import { type Listing } from '../stores/marketplaceStore';
import { useT } from '../lib/i18n';
import CreatePost from '../components/feed/CreatePost';
import MomentsBar from '../components/feed/MomentsBar';
import PostCard from '../components/feed/PostCard';
import Avatar from '../components/ui/Avatar';
import AdBanner from '../components/ui/AdBanner';

type Post = FeedPost;

function formatListingPrice(price: number, free: string) {
  if (price === 0) return free;
  return price.toLocaleString('vi-VN') + ' ₫';
}

function getListingTimeValue(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return new Date(value).getTime() || 0;
  if (typeof value === 'object') {
    const raw = value as { toDate?: () => Date; _seconds?: number; seconds?: number };
    if (typeof raw.toDate === 'function') return raw.toDate().getTime();
    const seconds = typeof raw._seconds === 'number' ? raw._seconds : raw.seconds;
    return typeof seconds === 'number' ? seconds * 1000 : 0;
  }
  return 0;
}

function isBoostStillInWindow(listing: Listing) {
  const endsAt = getListingTimeValue(listing.boostEndsAt);
  return !endsAt || endsAt > Date.now();
}

function isFeedBoostListing(listing: Listing) {
  return (
    listing.boostEnabled &&
    listing.boostStatus === 'active' &&
    isBoostStillInWindow(listing) &&
    listing.boostPlan?.placements?.includes('surf_feed')
  );
}

function FeedBoostPlacement({ listing, onOpen }: { listing: Listing; onOpen: (listing: Listing) => void }) {
  const t = useT();
  const imageUrl = listing.mediaUrls?.[0];
  return (
    <article className="mt-4 overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-sm dark:border-sky-500/20 dark:bg-slate-800/50">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-slate-700/60">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar src={listing.sellerPhotoURL} name={listing.sellerDisplayName} size="md" />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-gray-900 dark:text-white">{listing.sellerDisplayName}</div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-sky-600 dark:text-sky-300">
              <span className="font-black">Được tài trợ</span>
              <span>Surf Boost · Feed</span>
            </div>
          </div>
        </div>
        <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-black text-sky-700 dark:bg-sky-500/15 dark:text-sky-200">
          Surf Market
        </span>
      </div>
      <div className="px-4 pb-4 pt-3">
        <p className="text-sm text-gray-600 dark:text-slate-300">{t('feed_market_boost_desc')}</p>
        <button
          type="button"
          onClick={() => onOpen(listing)}
          className="mt-3 w-full overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 text-left transition hover:border-sky-300 hover:bg-sky-50 dark:border-slate-700 dark:bg-slate-900/70 dark:hover:border-sky-500/50 dark:hover:bg-sky-500/10"
        >
          {imageUrl ? (
            <div className="aspect-[16/10] bg-gray-100 dark:bg-slate-900">
              <img src={imageUrl} alt={listing.title} className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className="flex aspect-[16/10] items-center justify-center bg-gray-100 text-gray-400 dark:bg-slate-900 dark:text-slate-600">
              <svg className="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.4} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
          <div className="p-4">
            <div className="text-base font-black text-gray-900 dark:text-white">{listing.title}</div>
            <div className="mt-1 text-sm font-bold text-sky-600 dark:text-sky-300">{formatListingPrice(listing.price, t('feed_free'))}</div>
            <div className="mt-2 line-clamp-2 text-sm text-gray-500 dark:text-slate-400">{listing.description || listing.location || t('feed_market_explore')}</div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="truncate text-xs font-semibold text-gray-500 dark:text-slate-500">{listing.location || 'Surf Market'}</span>
              <span className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-black text-white">{t('feed_view_in_market')}</span>
            </div>
          </div>
        </button>
      </div>
    </article>
  );
}

export default function Feed() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const t = useT();
  const { posts, hasMore, nextCursor, loaded, setPosts, appendPosts, prependPost, updatePost, scrollTop, setScrollTop } =
    useFeedStore();
  const [loading, setLoading] = useState(posts.length === 0 && !loaded);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedBoostListings, setFeedBoostListings] = useState<Listing[]>([]);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const handlePostUpdated = (updated: Post & Record<string, unknown>) => {
    updatePost(updated as Post);
  };

  const loadFeedBoostListings = async () => {
    try {
      const response = await api.get<{ items: Listing[]; nextCursor: string | null }>('/api/marketplace');
      setFeedBoostListings((response.items || []).filter(isFeedBoostListing).slice(0, 3));
    } catch (err) {
      console.error('Failed to load Surf Boost feed placements:', err);
      setFeedBoostListings([]);
    }
  };

  const loadPosts = async () => {
    try {
      if (posts.length === 0) setLoading(true);
      setError(null);
      const response = await api.get<{ posts: Post[]; nextLastId?: string }>('/api/feed');
      setPosts(response.posts || [], !!response.nextLastId, response.nextLastId ?? null);
    } catch (err) {
      console.error('Failed to load feed:', err);
      const message = err instanceof Error ? err.message : '';
      if (message.includes('currently building')) {
        setError(t('feed_error_building'));
      } else {
        setError(t('feed_error_load'));
      }
    } finally {
      setLoading(false);
    }
  };

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !nextCursor) return;
    try {
      setLoadingMore(true);
      const response = await api.get<{ posts: Post[]; nextLastId?: string }>(
        `/api/feed?lastId=${nextCursor}`
      );
      appendPosts(response.posts || [], !!response.nextLastId, response.nextLastId ?? null);
    } catch (err) {
      console.error('Failed to load more posts:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, nextCursor]);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  useEffect(() => {
    // Luôn gọi API để lấy dữ liệu mới nhất (revalidate)
    // Nhưng nếu đã có dữ liệu cache, nó sẽ tự động render ra màn hình TRƯỚC khi API chạy xong
    void loadPosts();
  }, []);

  useEffect(() => {
    void loadFeedBoostListings();
  }, []);

  // Save scroll position on unmount, restore on mount
  useLayoutEffect(() => {
    const container = document.getElementById('main-feed-scroll');
    if (container && scrollTop > 0) {
      // setTimeout to ensure images/components have rendered
      setTimeout(() => {
        container.scrollTop = scrollTop;
      }, 10);
    }
    return () => {
      const c = document.getElementById('main-feed-scroll');
      if (c) setScrollTop(c.scrollTop);
    };
  }, []);

  const handlePostCreated = (newPost: Record<string, unknown>) => {
    prependPost(newPost as unknown as Post);
  };

  const handleOpenBoostListing = (listing: Listing) => {
    navigate(`/feed/market/${listing.id}`);
  };

  // Vị trí đầu tiên của bài "Khám phá" để hiện divider
  const firstDiscoverIndex = posts.findIndex((p) => p._discover);

  return (
    <div className="w-full mx-auto pt-2 sm:pt-4 pb-6 px-2 sm:px-3">
      <CreatePost onPostCreated={handlePostCreated} />
      <MomentsBar />

      {loading && (
        <div className="space-y-4 mt-4">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="bg-white dark:bg-slate-800/40 rounded-2xl p-4 border border-gray-200 dark:border-slate-700/50 animate-pulse"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-slate-700" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-1/3" />
                  <div className="h-2 bg-gray-200 dark:bg-slate-700 rounded w-1/4" />
                </div>
              </div>
              <div className="space-y-2 mb-3">
                <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-full" />
                <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-5/6" />
              </div>
              <div className="h-48 bg-gray-200 dark:bg-slate-700 rounded-xl" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/50 rounded-xl p-4 mb-4 text-red-600 dark:text-red-400 text-center">
          {error}
        </div>
      )}

      {!loading && !error && feedBoostListings[0] && (
        <FeedBoostPlacement listing={feedBoostListings[0]} onOpen={handleOpenBoostListing} />
      )}

      {!loading && !error && posts.length === 0 && feedBoostListings.length === 0 && (
        <div className="bg-white dark:bg-slate-800/40 backdrop-blur-sm rounded-2xl p-12 text-center border border-gray-200 dark:border-slate-700/50 shadow-sm">
          <svg
            className="w-16 h-16 mx-auto mb-4 text-gray-400 dark:text-gray-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
            />
          </svg>
          <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
            {t('feed_no_posts')}
          </h3>
          <p className="text-gray-500 dark:text-gray-500">
            {t('feed_be_first')}
          </p>
        </div>
      )}

      {!loading &&
        !error &&
        posts.map((post, idx) => (
          <div key={post.id}>
            {/* Divider "Khám phá" xuất hiện trước bài discover đầu tiên */}
            {post._discover && idx === firstDiscoverIndex && (
              <div className="flex items-center gap-3 my-4 px-1">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-700 to-transparent" />
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-xs font-semibold text-gray-500 dark:text-gray-400">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
                  </svg>
                  {t('feed_discover')}
                </div>
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-700 to-transparent" />
              </div>
            )}
            <PostCard post={post} currentUserId={user?.uid} onPostUpdated={handlePostUpdated} onPostCreated={handlePostCreated} />
            {idx === 2 && feedBoostListings[1] && (
              <FeedBoostPlacement listing={feedBoostListings[1]} onOpen={handleOpenBoostListing} />
            )}
            {idx === 6 && feedBoostListings[2] && (
              <FeedBoostPlacement listing={feedBoostListings[2]} onOpen={handleOpenBoostListing} />
            )}
            {/* Hiện quảng cáo Google AdSense sau mỗi 4 bài viết */}
            {(idx + 1) % 4 === 0 && <AdBanner />}
          </div>
        ))}

      {/* Sentinel cho IntersectionObserver */}
      <div ref={sentinelRef} className="h-4" />

      {/* Loading skeleton khi load thêm */}
      {loadingMore && (
        <div className="space-y-4 mt-2">
          {[...Array(2)].map((_, i) => (
            <div
              key={i}
              className="bg-white dark:bg-slate-800/40 rounded-2xl p-4 border border-gray-200 dark:border-slate-700/50 animate-pulse"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-slate-700" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-1/3" />
                  <div className="h-2 bg-gray-200 dark:bg-slate-700 rounded w-1/4" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-full" />
                <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-4/5" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !hasMore && posts.length > 0 && (
        <p className="text-center text-sm text-gray-400 dark:text-gray-600 py-6">
          {t('feed_all_caught_up')}
        </p>
      )}
    </div>
  );
}
