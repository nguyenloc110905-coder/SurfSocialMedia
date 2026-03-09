import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import CreatePost from '../components/feed/CreatePost';
import MomentsBar from '../components/feed/MomentsBar';
import PostCard from '../components/feed/PostCard';

interface Post {
  id: string;
  authorId?: string;
  authorDisplayName: string;
  authorPhotoURL: string | null;
  content: string;
  mediaUrls: string[];
  createdAt: import('firebase/firestore').Timestamp | string | number;
  likeCount: number;
  replyCount: number;
  likedBy: string[];
  feeling?: string;
  location?: string;
  taggedFriends?: Array<{ uid: string; displayName: string; photoURL?: string | null }>;
  privacy?: 'public' | 'friends' | 'only-me' | 'custom';
  _discover?: boolean;
}

export default function Feed() {
  const { user } = useAuthStore();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadPosts = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get<{ posts: Post[]; nextLastId?: string }>('/api/feed');
      setPosts(response.posts || []);
      setNextCursor(response.nextLastId ?? null);
      setHasMore(!!response.nextLastId);
    } catch (err) {
      console.error('Failed to load feed:', err);
      const message = err instanceof Error ? err.message : '';
      if (message.includes('currently building')) {
        setError('⏳ Database đang chuẩn bị... Vui lòng đợi 1-2 phút và reload lại trang!');
      } else {
        setError('Không thể tải bảng tin. Vui lòng thử lại!');
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
      setPosts((prev) => [...prev, ...(response.posts || [])]);
      setNextCursor(response.nextLastId ?? null);
      setHasMore(!!response.nextLastId);
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
    loadPosts();
  }, []);

  // Vị trí đầu tiên của bài "Khám phá" để hiện divider
  const firstDiscoverIndex = posts.findIndex((p) => p._discover);

  return (
    <div className="w-full mx-auto pt-2 sm:pt-4 pb-6 px-2 sm:px-3">
      <CreatePost />
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

      {!loading && !error && posts.length === 0 && (
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
            Chưa có bài viết nào
          </h3>
          <p className="text-gray-500 dark:text-gray-500">
            Hãy là người đầu tiên chia sẻ điều gì đó!
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
                  Khám phá
                </div>
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-700 to-transparent" />
              </div>
            )}
            <PostCard post={post} currentUserId={user?.uid} />
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
          Bạn đã xem hết bảng tin 🎉
        </p>
      )}
    </div>
  );
}
