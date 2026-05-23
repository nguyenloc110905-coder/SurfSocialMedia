import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import PostCard from '@/components/feed/PostCard';

interface Post {
  id: string;
  content: string;
  authorId?: string;
  authorDisplayName: string;
  authorPhotoURL: string | null;
  mediaUrls: string[];
  createdAt:
    | { _seconds: number }
    | { seconds: number }
    | string
    | number
    | null;
  likeCount: number;
  replyCount: number;
  likedBy: string[];
  reactions?: Record<string, string>;
  privacy?: 'public' | 'friends' | 'only-me' | 'custom';
  feeling?: string;
  location?: string;
  hasVideo?: boolean;
  isEdited?: boolean;
  isAnonymous?: boolean;
  pinnedAt?: string | null;
  savedBy?: string[];
  sharedFrom?: {
    id: string;
    authorId?: string;
    authorDisplayName: string;
    authorPhotoURL: string | null;
    content: string;
    mediaUrls: string[];
    createdAt:
    | { _seconds: number }
    | { seconds: number }
    | string
    | number
    | null;
  };
  poll?: { options: { id: string; text: string; votes: string[] }[] };
}

export default function HashtagPage() {
  const { tag } = useParams<{ tag: string }>();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPosts = useCallback(async () => {
    if (!tag) return;
    setLoading(true);
    setError(null);
    try {
      const [postsRes, videosRes] = await Promise.all([
        api.get<{ posts: Post[] }>(`/api/posts?hashtag=${encodeURIComponent(tag)}`),
        api.get<{ videos: any[] }>(`/api/videos?tag=${encodeURIComponent(tag)}`).catch(() => ({ videos: [] }))
      ]);
      
      const mappedVideos = (videosRes.videos ?? []).map((v: any) => ({
        id: v.id,
        content: v.description || v.title || '',
        authorId: v.authorId,
        authorDisplayName: v.authorDisplayName,
        authorPhotoURL: v.authorPhotoURL,
        mediaUrls: v.videoUrl ? [v.videoUrl] : [],
        createdAt: v.createdAt,
        likeCount: v.likeCount || 0,
        replyCount: v.commentCount || 0,
        likedBy: v.likedBy || [],
        privacy: v.privacy,
        hasVideo: true,
        _source: 'clip'
      } as unknown as Post));
      
      const all = [...(postsRes.posts ?? []), ...mappedVideos];
      all.sort((a, b) => {
        const timeA = typeof a.createdAt === 'object' && a.createdAt !== null 
          ? ((a.createdAt as any)._seconds || (a.createdAt as any).seconds || 0) * 1000 
          : new Date(a.createdAt as string).getTime() || 0;
        const timeB = typeof b.createdAt === 'object' && b.createdAt !== null 
          ? ((b.createdAt as any)._seconds || (b.createdAt as any).seconds || 0) * 1000 
          : new Date(b.createdAt as string).getTime() || 0;
        return timeB - timeA;
      });
      
      setPosts(all);
    } catch (e) {
      setError('Không thể tải bài viết. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, [tag]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const handleBack = () => navigate(-1);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border-b border-gray-200 dark:border-slate-700">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBack}
              className="p-2 -ml-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
              title="Quay lại"
            >
              <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                #{tag}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {loading ? 'Đang tải...' : `${posts.length} bài viết`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Đang tải bài viết...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-500 dark:text-red-400">{error}</p>
            <button
              onClick={fetchPosts}
              className="mt-3 px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors"
            >
              Thử lại
            </button>
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center">
              <span className="text-2xl">#</span>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Chưa có bài viết nào
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Hashtag #{tag} chưa có bài viết nào. Hãy là người đầu tiên!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
