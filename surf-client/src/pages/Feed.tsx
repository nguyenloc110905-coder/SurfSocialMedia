import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import CreatePost from '../components/feed/CreatePost';
import MomentsBar from '../components/feed/MomentsBar';
import PostCard from '../components/feed/PostCard';

interface Post {
  id: string;
  authorDisplayName: string;
  authorPhotoURL: string | null;
  content: string;
  mediaUrls: string[];
  createdAt: any;
  likeCount: number;
  replyCount: number;
  likedBy: string[];
  feeling?: string;
  location?: string;
  taggedFriends?: Array<{ uid: string; displayName: string; photoURL?: string | null }>;
  privacy?: 'public' | 'friends' | 'only-me' | 'custom';
}

export default function Feed() {
  const { user } = useAuthStore();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPosts();
  }, []);

  const loadPosts = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get<{ posts: Post[] }>('/api/feed');
      setPosts(response.posts || []);
    } catch (err: any) {
      console.error('Failed to load feed:', err);
      
      // Check if it's an index building error
      if (err?.message?.includes('currently building')) {
        setError('⏳ Database đang chuẩn bị... Vui lòng đợi 1-2 phút và reload lại trang!');
      } else {
        setError('Không thể tải bảng tin. Vui lòng thử lại!');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full mx-auto pt-2 sm:pt-4 pb-6 px-2 sm:px-3">
      <CreatePost />
      
      {/* Moments Bar - Surf Style Stories */}
      <MomentsBar />

      {loading && (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-cyan-500"></div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/50 rounded-xl p-4 mb-4 text-red-600 dark:text-red-400 text-center">
          {error}
        </div>
      )}

      {!loading && !error && posts.length === 0 && (
        <div className="bg-white dark:bg-slate-800/40 backdrop-blur-sm rounded-2xl p-12 text-center border border-gray-200 dark:border-slate-700/50 shadow-sm">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-400 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">Chưa có bài viết nào</h3>
          <p className="text-gray-500 dark:text-gray-500">Hãy là người đầu tiên chia sẻ điều gì đó!</p>
        </div>
      )}

      {!loading && !error && posts.map((post) => (
        <PostCard key={post.id} post={post} currentUserId={user?.uid} />
      ))}
    </div>
  );
}
