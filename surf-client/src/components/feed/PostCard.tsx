import { formatDistanceToNow } from 'date-fns';
import { vi } from 'date-fns/locale';

interface PostCardProps {
  post: {
    id: string;
    authorDisplayName: string;
    authorPhotoURL: string | null;
    content: string;
    mediaUrls: string[];
    createdAt: any;
    likeCount: number;
    replyCount: number;
    likedBy: string[];
  };
  currentUserId?: string;
}

export default function PostCard({ post, currentUserId }: PostCardProps) {
  const isLiked = currentUserId ? post.likedBy?.includes(currentUserId) : false;

  const formatTime = (timestamp: any) => {
    try {
      const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
      return formatDistanceToNow(date, { addSuffix: true, locale: vi });
    } catch {
      return 'vừa xong';
    }
  };

  return (
    <article className="bg-slate-800/40 backdrop-blur-sm rounded-2xl p-6 mb-4 shadow-lg hover:shadow-xl hover:shadow-cyan-500/10 transition-all duration-300 border border-slate-700/50 hover:border-cyan-500/30">
      {/* Author Header */}
      <div className="flex items-center gap-3 mb-4">
        <img 
          src={post.authorPhotoURL || 'https://via.placeholder.com/48'} 
          alt={post.authorDisplayName}
          className="w-12 h-12 rounded-full ring-2 ring-slate-700"
        />
        <div className="flex-1">
          <h3 className="font-semibold text-gray-100">{post.authorDisplayName}</h3>
          <p className="text-sm text-gray-400">{formatTime(post.createdAt)}</p>
        </div>
        <button className="text-gray-400 hover:text-gray-300 transition-colors">
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="mb-4">
        <p className="text-gray-200 leading-relaxed whitespace-pre-wrap">{post.content}</p>
      </div>

      {/* Media */}
      {post.mediaUrls && post.mediaUrls.length > 0 && (
        <div className="mb-4 rounded-xl overflow-hidden">
          <img 
            src={post.mediaUrls[0]} 
            alt="Post media" 
            className="w-full object-cover max-h-[500px]"
          />
        </div>
      )}

      {/* Stats Bar */}
      <div className="flex items-center gap-4 py-3 mb-3 border-b border-slate-700/50 text-sm text-gray-400">
        <span className="hover:text-cyan-400 cursor-pointer transition-colors">
          {post.likeCount > 0 && `${post.likeCount} lượt thích`}
        </span>
        <span className="hover:text-cyan-400 cursor-pointer transition-colors">
          {post.replyCount > 0 && `${post.replyCount} bình luận`}
        </span>
      </div>

      {/* Action Bar */}
      <div className="flex items-center gap-2">
        <button className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium transition-all ${
          isLiked 
            ? 'text-cyan-400 hover:bg-cyan-500/10' 
            : 'text-gray-400 hover:bg-slate-700/50 hover:text-cyan-400'
        }`}>
          <svg className="w-5 h-5" fill={isLiked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          <span className="text-sm">Thích</span>
        </button>

        <button className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-gray-400 hover:bg-slate-700/50 hover:text-cyan-400 transition-all">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span className="text-sm">Bình luận</span>
        </button>

        <button className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-gray-400 hover:bg-slate-700/50 hover:text-cyan-400 transition-all">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          <span className="text-sm">Chia sẻ</span>
        </button>
      </div>
    </article>
  );
}
