import { useState, useEffect, useRef } from 'react';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';

interface Comment {
  id: string;
  postId: string;
  authorId: string;
  authorDisplayName: string;
  authorPhotoURL: string | null;
  content: string;
  createdAt: any;
  likeCount: number;
  likedBy: string[];
}

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
    feeling?: string;
    location?: string;
    taggedFriends?: Array<{ uid: string; displayName: string }>;
    privacy?: 'public' | 'friends' | 'only-me' | 'custom';
  };
  currentUserId?: string;
}

export default function PostCard({ post, currentUserId }: PostCardProps) {
  const { user } = useAuthStore();
  const commentInputRef = useRef<HTMLInputElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const [isLiked, setIsLiked] = useState(currentUserId ? post.likedBy?.includes(currentUserId) : false);
  const [likeCount, setLikeCount] = useState(post.likeCount || 0);
  const [showComments, setShowComments] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [selectedReaction, setSelectedReaction] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentLikes, setCommentLikes] = useState<Record<string, boolean>>({});
  const [isClosing, setIsClosing] = useState(false);
  // Handle closing with animation
  const handleCloseComments = () => {
    setIsClosing(true);
    setTimeout(() => {
      setShowComments(false);
      setIsClosing(false);
    }, 400);
  };
  // Load comments when showComments changes and focus input
  useEffect(() => {
    if (showComments) {
      // Always load comments when opening
      loadComments();
      // Focus input after a brief delay to ensure it's rendered
      setTimeout(() => {
        commentInputRef.current?.focus();
      }, 300);
    }
  }, [showComments]);

  // Prevent body scroll when comments are open
  useEffect(() => {
    if (showComments) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    // Cleanup on unmount
    return () => {
      document.body.style.overflow = '';
    };
  }, [showComments]);

  const loadComments = async () => {
    try {
      setLoadingComments(true);
      console.log(`📥 Loading comments for post ${post.id}...`);
      const response = await api.get<{ comments: Comment[] }>(`/api/comments/${post.id}`);
      console.log(`✅ Loaded ${response.comments?.length || 0} comments:`, response.comments);
      setComments(response.comments || []);
      // Initialize comment likes state
      const likes: Record<string, boolean> = {};
      response.comments?.forEach(comment => {
        if (currentUserId) {
          likes[comment.id] = comment.likedBy?.includes(currentUserId) || false;
        }
      });
      setCommentLikes(likes);
    } catch (error) {
      console.error('❌ Error loading comments:', error);
    } finally {
      setLoadingComments(false);
    }
  };

  const handleSubmitComment = async () => {
    if (!commentText.trim() || submittingComment) return;

    try {
      setSubmittingComment(true);
      console.log(`📤 Submitting comment to post ${post.id}:`, commentText.trim());
      const response = await api.post<Comment>(`/api/comments/${post.id}`, {
        content: commentText.trim(),
      });
      console.log(`✅ Comment created:`, response);
      
      // Reload comments from server to get fresh data
      await loadComments();
      setCommentText('');
    } catch (error) {
      console.error('❌ Error submitting comment:', error);
      alert('Không thể gửi bình luận. Vui lòng thử lại.');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await api.delete(`/api/comments/${post.id}/${commentId}`);
      setComments(comments.filter(c => c.id !== commentId));
    } catch (error) {
      console.error('Error deleting comment:', error);
    }
  };

  const handleLikeComment = async (commentId: string) => {
    try {
      const isCurrentlyLiked = commentLikes[commentId] || false;
      
      // Optimistic update
      setCommentLikes(prev => ({ ...prev, [commentId]: !isCurrentlyLiked }));
      setComments(prev => prev.map(c => {
        if (c.id === commentId) {
          return {
            ...c,
            likeCount: isCurrentlyLiked ? c.likeCount - 1 : c.likeCount + 1,
            likedBy: isCurrentlyLiked 
              ? c.likedBy.filter(uid => uid !== currentUserId)
              : [...c.likedBy, currentUserId || '']
          };
        }
        return c;
      }));

      // API call
      await api.post(`/api/comments/${post.id}/${commentId}/like`);
    } catch (error) {
      console.error('Error liking comment:', error);
      // Revert on error
      setCommentLikes(prev => ({ ...prev, [commentId]: !prev[commentId] }));
      setComments(prev => prev.map(c => {
        if (c.id === commentId) {
          return {
            ...c,
            likeCount: commentLikes[commentId] ? c.likeCount + 1 : c.likeCount - 1,
            likedBy: commentLikes[commentId]
              ? [...c.likedBy, currentUserId || '']
              : c.likedBy.filter(uid => uid !== currentUserId)
          };
        }
        return c;
      }));
    }
  };

  // Reaction mapping
  const reactions: Record<string, { label: string; color: string; bgColor: string; borderColor: string; shadowColor: string }> = {
    '❤️': { 
      label: 'Thích', 
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'from-red-500/15 to-pink-500/15 hover:from-red-500/25 hover:to-pink-500/25',
      borderColor: 'border-red-200 dark:border-red-900/30',
      shadowColor: 'shadow-red-500/10'
    },
    '🌊': { 
      label: 'Sóng', 
      color: 'text-cyan-600 dark:text-cyan-400',
      bgColor: 'from-cyan-500/15 to-blue-500/15 hover:from-cyan-500/25 hover:to-blue-500/25',
      borderColor: 'border-cyan-200 dark:border-cyan-900/30',
      shadowColor: 'shadow-cyan-500/10'
    },
    '😂': { 
      label: 'Haha', 
      color: 'text-yellow-600 dark:text-yellow-400',
      bgColor: 'from-yellow-500/15 to-orange-500/15 hover:from-yellow-500/25 hover:to-orange-500/25',
      borderColor: 'border-yellow-200 dark:border-yellow-900/30',
      shadowColor: 'shadow-yellow-500/10'
    },
    '😮': { 
      label: 'Wow', 
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'from-orange-500/15 to-amber-500/15 hover:from-orange-500/25 hover:to-amber-500/25',
      borderColor: 'border-orange-200 dark:border-orange-900/30',
      shadowColor: 'shadow-orange-500/10'
    },
    '😢': { 
      label: 'Buồn', 
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'from-blue-500/15 to-indigo-500/15 hover:from-blue-500/25 hover:to-indigo-500/25',
      borderColor: 'border-blue-200 dark:border-blue-900/30',
      shadowColor: 'shadow-blue-500/10'
    },
    '👍': { 
      label: 'Tuyệt', 
      color: 'text-indigo-600 dark:text-indigo-400',
      bgColor: 'from-indigo-500/15 to-purple-500/15 hover:from-indigo-500/25 hover:to-purple-500/25',
      borderColor: 'border-indigo-200 dark:border-indigo-900/30',
      shadowColor: 'shadow-indigo-500/10'
    }
  };

  const formatTime = (timestamp: any) => {
    try {
      if (!timestamp) return 'vừa xong';
      
      // Handle different timestamp formats
      let date: Date;
      if (timestamp?.toDate && typeof timestamp.toDate === 'function') {
        // Firestore Timestamp
        date = timestamp.toDate();
      } else if (typeof timestamp === 'string' || typeof timestamp === 'number') {
        // ISO string or milliseconds
        date = new Date(timestamp);
      } else if (timestamp instanceof Date) {
        date = timestamp;
      } else {
        return 'vừa xong';
      }
      
      // Validate date
      if (isNaN(date.getTime())) {
        return 'vừa xong';
      }
      
      const now = new Date();
      const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
      
      // Dưới 1 phút
      if (diffInSeconds < 60) {
        return 'vừa xong';
      }
      
      // Dưới 1 giờ - hiển thị phút
      const diffInMinutes = Math.floor(diffInSeconds / 60);
      if (diffInMinutes < 60) {
        return `${diffInMinutes} phút trước`;
      }
      
      // Dưới 24 giờ - hiển thị giờ
      const diffInHours = Math.floor(diffInMinutes / 60);
      if (diffInHours < 24) {
        return `${diffInHours} giờ trước`;
      }
      
      // Dưới 7 ngày - hiển thị ngày
      const diffInDays = Math.floor(diffInHours / 24);
      if (diffInDays < 7) {
        return `${diffInDays} ngày trước`;
      }
      
      // Dưới 4 tuần - hiển thị tuần
      const diffInWeeks = Math.floor(diffInDays / 7);
      if (diffInWeeks < 4) {
        return `${diffInWeeks} tuần trước`;
      }
      
      // Dưới 12 tháng - hiển thị tháng
      const diffInMonths = Math.floor(diffInDays / 30);
      if (diffInMonths < 12) {
        return `${diffInMonths} tháng trước`;
      }
      
      // Trên 1 năm - hiển thị năm
      const diffInYears = Math.floor(diffInDays / 365);
      return `${diffInYears} năm trước`;
    } catch (error) {
      console.error('Error formatting time:', error, timestamp);
      return 'vừa xong';
    }
  };

  const handleLike = () => {
    if (isLiked) {
      // Unlike - reset reaction
      setIsLiked(false);
      setSelectedReaction(null);
      setLikeCount(likeCount - 1);
    } else {
      // Default like with heart
      setIsLiked(true);
      setSelectedReaction('❤️');
      setLikeCount(likeCount + 1);
    }
    // TODO: Call API to update like status
  };

  const getPrivacyIcon = () => {
    switch (post.privacy) {
      case 'friends':
        return (
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
          </svg>
        );
      case 'only-me':
        return (
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
        );
      default:
        return (
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  return (
    <>
      {/* Backdrop Overlay - Shows when comments are open */}
      {showComments && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          onClick={handleCloseComments}
          style={{ 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0,
            animation: isClosing ? 'fadeOut 0.4s ease-out' : 'fadeIn 0.4s ease-out'
          }}
        />
      )}
      
      <article 
        ref={articleRef}
        className={`overflow-hidden bg-gradient-to-br from-cyan-50 via-blue-50 to-purple-50 dark:from-slate-800 dark:via-slate-800 dark:to-slate-900/80 backdrop-blur-sm rounded-3xl border-2 border-blue-200 dark:border-slate-700/50 group ${
          showComments 
            ? 'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[95vw] max-w-3xl max-h-[90vh] shadow-2xl shadow-cyan-500/50 dark:shadow-cyan-500/30 border-cyan-400 dark:border-cyan-500/50' 
            : 'relative mb-4 shadow-xl shadow-blue-500/20 dark:shadow-xl hover:shadow-2xl hover:shadow-cyan-500/30 dark:hover:shadow-2xl hover:border-cyan-400 dark:hover:border-cyan-500/30 transition-shadow duration-500'
        }`}
        style={showComments ? {
          animation: isClosing 
            ? 'scaleOut 0.4s cubic-bezier(0.4, 0, 0.6, 1) forwards' 
            : 'scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)'
        } : undefined}
      >
      {/* Wave Accent - Subtle */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500 opacity-30 group-hover:opacity-100 transition-opacity duration-500"></div>
      
      {/* Floating Wave Background */}
      <div className="absolute inset-0 opacity-[0.08] group-hover:opacity-[0.12] dark:opacity-0 dark:group-hover:opacity-[0.05] pointer-events-none transition-opacity duration-700">
        <svg className="w-full h-full" viewBox="0 0 1200 120" preserveAspectRatio="none">
          <path d="M0,0V46.29c47.79,22.2,103.59,32.17,158,28,70.36-5.37,136.33-33.31,206.8-37.5C438.64,32.43,512.34,53.67,583,72.05c69.27,18,138.3,24.88,209.4,13.08,36.15-6,69.85-17.84,104.45-29.34C989.49,25,1113-14.29,1200,52.47V0Z" className="fill-cyan-500" />
        </svg>
      </div>

      <div className={`relative z-10 p-5 sm:p-6 ${showComments ? 'overflow-y-auto max-h-[90vh] custom-scrollbar' : ''}`}>
        {/* Close Button - Only show when comments are open */}
        {showComments && (
          <button
            onClick={handleCloseComments}
            className="absolute top-4 right-4 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white transition-all duration-200 hover:scale-110 active:scale-95 shadow-lg"
            title="Đóng"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        
        {/* Author Header */}
        <div className="flex items-start gap-3 mb-4">
          <div className="relative group/avatar">
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full blur-md opacity-0 group-hover/avatar:opacity-50 transition-opacity duration-300"></div>
            {post.authorPhotoURL ? (
              <img 
                src={post.authorPhotoURL} 
                alt={post.authorDisplayName}
                className="relative w-12 h-12 rounded-full ring-2 ring-white dark:ring-slate-800 shadow-lg cursor-pointer hover:scale-105 transition-transform object-cover"
              />
            ) : (
              <div className="relative w-12 h-12 rounded-full ring-2 ring-white dark:ring-slate-800 shadow-lg cursor-pointer hover:scale-105 transition-transform bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                <span className="text-lg font-bold text-white drop-shadow-md">
                  {(() => {
                    const name = post.authorDisplayName || 'U';
                    const words = name.split(' ');
                    if (words.length >= 2) {
                      return (words[0][0] + words[words.length - 1][0]).toUpperCase();
                    }
                    return name.substring(0, 1).toUpperCase();
                  })()}
                </span>
              </div>
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="text-sm leading-relaxed mb-1">
              <h3 className="inline font-bold text-gray-900 dark:text-gray-100 hover:text-cyan-600 dark:hover:text-cyan-400 cursor-pointer transition-colors">
                {post.authorDisplayName}
              </h3>
              {post.feeling && (
                <span className="text-gray-600 dark:text-gray-400">
                  {' '}đang cảm thấy <span className="font-medium">{post.feeling}</span>
                </span>
              )}
              {post.taggedFriends && post.taggedFriends.length > 0 && (
                <span className="text-gray-600 dark:text-gray-400">
                  {' '}cùng với{' '}
                  {post.taggedFriends.map((friend, idx) => (
                    <span key={friend.uid}>
                      <span className="font-medium text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer">
                        {friend.displayName}
                      </span>
                      {idx < post.taggedFriends!.length - 1 && ', '}
                    </span>
                  ))}
                </span>
              )}
              {post.location && (
                <span className="text-gray-600 dark:text-gray-400">
                  {' '}tại <span className="font-medium">📍 {post.location}</span>
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="hover:underline cursor-pointer">{formatTime(post.createdAt)}</span>
              <span>•</span>
              <button className="flex items-center gap-1 hover:text-cyan-500 dark:hover:text-cyan-400 transition-colors">
                {getPrivacyIcon()}
              </button>
            </div>
          </div>

          {/* Options Menu */}
          <div className="relative">
            <button 
              onClick={() => setShowOptions(!showOptions)}
              className="w-9 h-9 flex items-center justify-center rounded-full text-gray-400 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700/50 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
              </svg>
            </button>
            
            {showOptions && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 py-2 z-20 animate-in fade-in slide-in-from-top-2 duration-200">
                <button className="w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700/50 flex items-center gap-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                  Lưu bài viết
                </button>
                <button className="w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700/50 flex items-center gap-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                  Ẩn bài viết
                </button>
                <hr className="my-2 border-gray-200 dark:border-slate-700" />
                <button className="w-full px-4 py-2.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Báo cáo bài viết
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        {post.content && (
          <div className="mb-4">
            <p className="text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap text-[15px]">
              {post.content}
            </p>
          </div>
        )}

        {/* Media Gallery */}
        {post.mediaUrls && post.mediaUrls.length > 0 && (
          <div className={`mb-4 rounded-2xl overflow-hidden ${
            post.mediaUrls.length === 1 ? '' : 
            post.mediaUrls.length === 2 ? 'grid grid-cols-2 gap-1' :
            post.mediaUrls.length === 3 ? 'grid grid-cols-2 gap-1' :
            'grid grid-cols-2 gap-1'
          }`}>
            {post.mediaUrls.slice(0, 4).map((url, idx) => (
              <div 
                key={idx} 
                className={`relative ${
                  post.mediaUrls.length === 3 && idx === 0 ? 'col-span-2' : ''
                } ${post.mediaUrls.length > 4 && idx === 3 ? 'relative' : ''}`}
              >
                <img 
                  src={url} 
                  alt={`Media ${idx + 1}`} 
                  className="w-full h-full object-cover cursor-pointer hover:opacity-95 transition-opacity"
                  style={{ maxHeight: post.mediaUrls.length === 1 ? '500px' : '250px' }}
                />
                {post.mediaUrls.length > 4 && idx === 3 && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center cursor-pointer hover:bg-black/70 transition-colors">
                    <span className="text-white text-3xl font-bold">+{post.mediaUrls.length - 4}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Stats Bar with Wave Accent - Only show if there are interactions */}
        {((likeCount && likeCount > 0) || (post.replyCount && post.replyCount > 0)) && (
          <div className="relative flex items-center justify-between py-3 mb-3">
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-300 dark:via-slate-700 to-transparent"></div>
            
            <div className="flex items-center gap-1">
              {likeCount > 0 && (
                <button className="flex items-center gap-2 text-sm hover:underline cursor-pointer group/likes">
                  <div className="flex -space-x-1">
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-red-500 to-pink-500 flex items-center justify-center text-white text-xs shadow-md">
                      ❤️
                    </div>
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center text-white text-xs shadow-md">
                      🌊
                    </div>
                  </div>
                  <span className="text-gray-700 dark:text-gray-400 group-hover/likes:text-cyan-600 dark:group-hover/likes:text-cyan-400 transition-colors font-medium">
                    {likeCount} lượt thích
                  </span>
                </button>
              )}
            </div>
            
            <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
              {post.replyCount > 0 && (
                <button 
                  onClick={() => setShowComments(!showComments)}
                  className="hover:text-cyan-500 dark:hover:text-cyan-400 hover:underline cursor-pointer transition-colors"
                >
                  {post.replyCount} bình luận
                </button>
              )}
            </div>
          </div>
        )}

        {/* Action Bar with Surf Style */}
        <div className="flex items-center gap-1 pt-2">
          {/* Like/React Button */}
          <div className="relative flex-1">
            <button 
              onClick={handleLike}
              onMouseEnter={() => setShowReactions(true)}
              onMouseLeave={() => setShowReactions(false)}
              className={`group w-full flex items-center justify-center gap-1.5 py-2 rounded-lg font-medium text-xs transition-all duration-300 ease-in-out border hover:scale-[1.02] active:scale-95 ${
                isLiked && selectedReaction
                  ? `bg-gradient-to-r ${reactions[selectedReaction].bgColor} ${reactions[selectedReaction].color} ${reactions[selectedReaction].borderColor} shadow-sm ${reactions[selectedReaction].shadowColor}` 
                  : 'text-gray-700 dark:text-gray-400 hover:bg-gradient-to-r hover:from-cyan-500/15 hover:to-blue-500/15 hover:text-cyan-700 dark:hover:text-cyan-400 border-gray-200 dark:border-slate-700 hover:border-cyan-300 dark:hover:border-cyan-800 hover:shadow-sm hover:shadow-cyan-500/10'
              }`}
            >
              {isLiked && selectedReaction ? (
                <>
                  <span 
                    className="text-base transition-all duration-300 ease-out animate-pulse"
                  >
                    {selectedReaction}
                  </span>
                  <span className="transition-all duration-200">{reactions[selectedReaction].label}</span>
                </>
              ) : (
                <>
                  <svg 
                    className="w-4 h-4 transition-all duration-300 ease-out group-hover:scale-125 group-hover:rotate-12" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                  <span className="transition-all duration-200">Thích</span>
                </>
              )}
            </button>
            
            {/* Reaction Picker */}
            {showReactions && (
              <div 
                onMouseEnter={() => setShowReactions(true)}
                onMouseLeave={() => setShowReactions(false)}
                className="absolute bottom-full left-1/2 transform -translate-x-1/2 pb-1 z-20"
              >
                <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl rounded-full shadow-2xl shadow-cyan-500/20 border-2 border-cyan-200 dark:border-slate-700 p-2 flex gap-1 animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-300">
                  {['❤️', '🌊', '😂', '😮', '😢', '👍'].map((emoji, index) => (
                    <button
                      key={emoji}
                      onClick={() => {
                        setIsLiked(true);
                        setSelectedReaction(emoji);
                        setLikeCount(isLiked ? likeCount : likeCount + 1);
                        setShowReactions(false);
                      }}
                      className="w-10 h-10 flex items-center justify-center text-2xl transition-all duration-300 ease-out hover:scale-150 hover:-translate-y-1 active:scale-110 rounded-full hover:bg-gradient-to-br hover:from-cyan-50 hover:to-blue-50 dark:hover:bg-slate-700 hover:shadow-lg hover:shadow-cyan-500/30"
                      style={{
                        animation: `fadeInScale 0.2s ease-out ${index * 0.05}s both`
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Comment Button */}
          <button 
            onClick={() => setShowComments(!showComments)}
            className="group flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg font-medium text-xs text-gray-700 dark:text-gray-400 hover:bg-gradient-to-r hover:from-blue-500/15 hover:to-indigo-500/15 hover:text-blue-700 dark:hover:text-blue-400 transition-all duration-300 ease-in-out border border-gray-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-800 hover:scale-[1.02] active:scale-95">
            <svg className="w-4 h-4 transition-transform duration-300 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span>Bình luận</span>
          </button>

          {/* Share Button */}
          <div className="relative flex-1">
            <button 
              onClick={() => setShowShareMenu(!showShareMenu)}
              className="group w-full flex items-center justify-center gap-1.5 py-2 rounded-lg font-medium text-xs text-gray-700 dark:text-gray-400 hover:bg-gradient-to-r hover:from-green-500/15 hover:to-emerald-500/15 hover:text-green-700 dark:hover:text-green-400 transition-all duration-300 ease-in-out border border-gray-200 dark:border-slate-700 hover:border-green-300 dark:hover:border-green-800 hover:scale-[1.02] active:scale-95">
              <svg className="w-4 h-4 transition-transform duration-300 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              <span>Chia sẻ</span>
            </button>
            
            {showShareMenu && (
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-slate-800 rounded-xl shadow-2xl shadow-blue-500/20 border-2 border-blue-200 dark:border-slate-700 py-2 z-20 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <button className="w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gradient-to-r hover:from-cyan-500/15 hover:to-blue-500/15 dark:hover:bg-slate-700/50 hover:text-cyan-700 dark:hover:text-cyan-400 flex items-center gap-3 transition-all duration-200">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Sao chép liên kết
                </button>
                <button className="w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gradient-to-r hover:from-cyan-500/15 hover:to-blue-500/15 dark:hover:bg-slate-700/50 hover:text-cyan-700 dark:hover:text-cyan-400 flex items-center gap-3 transition-all duration-200">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  Gửi tin nhắn
                </button>
              </div>
            )}
          </div>

          {/* Save Button */}
          <button 
            onClick={() => setIsSaved(!isSaved)}
            className={`group flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-300 ease-in-out border hover:scale-110 active:scale-95 ${
              isSaved
                ? 'bg-gradient-to-r from-yellow-500/15 to-amber-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-900/30 shadow-sm shadow-yellow-500/10'
                : 'text-gray-700 dark:text-gray-400 hover:bg-gradient-to-br hover:from-yellow-500/10 hover:to-amber-500/10 hover:text-yellow-700 dark:hover:text-yellow-400 border-gray-200 dark:border-slate-700 hover:border-yellow-300 dark:hover:border-yellow-800'
            }`}
            title={isSaved ? 'Đã lưu' : 'Lưu bài viết'}
          >
            <svg className={`w-4 h-4 transition-transform duration-300 ${isSaved ? 'scale-110' : 'group-hover:scale-110'}`} fill={isSaved ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </button>
        </div>

        {/* Comments Section */}
        {showComments && (
          <div className="mt-4 pt-4 border-t-2 border-blue-200 dark:border-slate-700/50 animate-in fade-in slide-in-from-top-2 duration-300">
            {/* Comments List */}
            {loadingComments ? (
              <div className="text-center py-4">
                <div className="inline-block w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : comments.length === 0 ? (
              <div className="text-sm text-gray-500 dark:text-gray-400 text-center font-medium py-4">
                Chưa có bình luận nào
              </div>
            ) : (
              <div className="mb-4">
                <div className="space-y-3">
                  {comments.map((comment) => (
                  <div key={comment.id} className="flex gap-2 group">
                    {/* Comment Avatar */}
                    {comment.authorPhotoURL ? (
                      <img
                        src={comment.authorPhotoURL}
                        alt={comment.authorDisplayName}
                        className="w-8 h-8 rounded-full flex-shrink-0 object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full flex-shrink-0 bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                        <span className="text-xs font-bold text-white">
                          {(() => {
                            const name = comment.authorDisplayName || 'U';
                            const words = name.split(' ');
                            if (words.length >= 2) {
                              return (words[0][0] + words[words.length - 1][0]).toUpperCase();
                            }
                            return name.substring(0, 1).toUpperCase();
                          })()}
                        </span>
                      </div>
                    )}
                    
                    {/* Comment Content */}
                    <div className="flex-1 min-w-0">
                      <div className="bg-gray-100 dark:bg-slate-800/60 rounded-2xl px-3 py-2">
                        <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                          {comment.authorDisplayName}
                        </div>
                        <div className="text-sm text-gray-800 dark:text-gray-200 mt-0.5">
                          {comment.content}
                        </div>
                      </div>
                      
                      {/* Comment Actions */}
                      <div className="flex items-center gap-4 mt-1 px-3 text-xs font-semibold">
                        <button
                          onClick={() => handleLikeComment(comment.id)}
                          className={`hover:underline transition-colors ${
                            commentLikes[comment.id]
                              ? 'text-cyan-600 dark:text-cyan-400'
                              : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300'
                          }`}
                        >
                          Thích
                        </button>
                        
                        <button className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 hover:underline transition-colors">
                          Trả lời
                        </button>
                        
                        <span className="text-gray-500 dark:text-gray-400 font-normal">
                          {comment.createdAt && formatTime(comment.createdAt)}
                        </span>
                        
                        {comment.likeCount > 0 && (
                          <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                            <svg className="w-3 h-3 fill-cyan-500" viewBox="0 0 20 20">
                              <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
                            </svg>
                            <span className="font-normal">{comment.likeCount}</span>
                          </div>
                        )}
                        
                        {currentUserId === comment.authorId && (
                          <button
                            onClick={() => handleDeleteComment(comment.id)}
                            className="text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:underline transition-colors ml-auto"
                          >
                            Xóa
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              </div>
            )}
            
            {/* Comment Input - Always visible at bottom */}
            <div className="flex gap-3 mt-4 pt-4 border-t border-gray-200 dark:border-slate-700/50">
              {user?.photoURL ? (
                <img 
                  src={user.photoURL} 
                  alt="You"
                  className="w-8 h-8 rounded-full flex-shrink-0 object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full flex-shrink-0 bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                  <span className="text-xs font-bold text-white">
                    {(() => {
                      const name = user?.displayName || user?.email || 'U';
                      const words = name.split(' ');
                      if (words.length >= 2) {
                        return (words[0][0] + words[words.length - 1][0]).toUpperCase();
                      }
                      return name.substring(0, 1).toUpperCase();
                    })()}
                  </span>
                </div>
              )}
              <div className="flex-1">
                <div className="relative">
                  <input
                    ref={commentInputRef}
                    type="text"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSubmitComment()}
                    placeholder="Viết bình luận của bạn..."
                    disabled={submittingComment}
                    className="w-full bg-white dark:bg-slate-900/50 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-500 rounded-full px-4 py-2.5 pr-36 border-2 border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-400 dark:focus:ring-cyan-500/50 dark:focus:border-cyan-500 transition-all shadow-sm disabled:opacity-50"
                  />
                  
                  {/* Action Buttons */}
                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
                    {/* Emoji Button */}
                    <button 
                      type="button"
                      className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                      title="Chèn emoji"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
                      </svg>
                    </button>
                    
                    {/* GIF Button */}
                    <button 
                      type="button"
                      className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                      title="Chèn GIF"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                      </svg>
                    </button>
                    
                    {/* Sticker Button */}
                    <button 
                      type="button"
                      className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                      title="Chèn sticker"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                    
                    {/* Tag Friends Button */}
                    <button 
                      type="button"
                      className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                      title="Gắn thẻ bạn bè"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </button>
                    
                    {/* Send Button */}
                    <button 
                      onClick={handleSubmitComment}
                      disabled={!commentText.trim() || submittingComment}
                      className="p-1.5 rounded-full text-cyan-600 hover:text-cyan-700 dark:text-cyan-500 dark:hover:text-cyan-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:bg-cyan-50 dark:hover:bg-cyan-900/20"
                      title="Gửi"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </article>
    </>
  );
}
