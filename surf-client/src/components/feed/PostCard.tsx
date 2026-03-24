import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import Modal from '../ui/Modal';
import { isVideoUrl } from '../../lib/cloudinary';

interface Comment {
  id: string;
  postId: string;
  authorId: string;
  authorDisplayName: string;
  authorPhotoURL: string | null;
  content: string;
  createdAt:
    | import('firebase/firestore').Timestamp
    | { _seconds: number }
    | { seconds: number }
    | string
    | number
    | null;
  likeCount: number;
  likedBy: string[];
}

interface PostCardProps {
  post: {
    id: string;
    authorId?: string;
    authorDisplayName: string;
    authorPhotoURL: string | null;
    content: string;
    mediaUrls: string[];
    createdAt:
      | import('firebase/firestore').Timestamp
      | { _seconds: number }
      | { seconds: number }
      | string
      | number
      | null;
    likeCount: number;
    replyCount: number;
    likedBy: string[];
    reactions?: Record<string, string>;
    feeling?: string;
    location?: string;
    taggedFriends?: Array<{ uid: string; displayName: string }>;
    privacy?: 'public' | 'friends' | 'only-me' | 'custom';
  };
  currentUserId?: string;
}

/** Plays video when ≥30% visible in the viewport; pauses when scrolled away. */
function FeedVideo({
  src,
  fill = true,
  style,
  onExpand,
}: {
  src: string;
  fill?: boolean;
  style?: React.CSSProperties;
  onExpand?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [focused, setFocused] = useState(false);

  // Auto play/pause based on visibility
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.play().catch(() => {});
        } else {
          el.pause();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [src]);

  // Spacebar toggles play/pause when focused
  useEffect(() => {
    if (!focused) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        const el = videoRef.current;
        if (!el) return;
        if (el.paused) {
          el.play().catch(() => {});
        } else {
          el.pause();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [focused]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const el = videoRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const el = videoRef.current;
    if (!el || !el.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    el.currentTime = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * el.duration;
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <div
      className={`relative group ${fill ? 'w-full h-full' : 'w-full'}`}
      style={style}
      tabIndex={0}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onMouseEnter={() => setFocused(true)}
      onMouseLeave={() => setFocused(false)}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Raw video — no native controls, no layout shift */}
      <video
        ref={videoRef}
        src={src}
        className={fill ? 'w-full h-full block object-cover' : 'w-full block'}
        muted
        loop
        playsInline
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)}
        onClick={togglePlay}
      />

      {/* Paused indicator — center */}
      {paused && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="w-14 h-14 rounded-full bg-black/50 flex items-center justify-center">
            <svg className="w-7 h-7 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}

      {/* Custom controls — fade in on hover, always interactable */}
      <div
        className="absolute bottom-0 left-0 right-0 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-2 pt-10">
          {/* Seek bar */}
          <div
            className="w-full h-1 bg-white/30 rounded-full cursor-pointer mb-2 hover:h-2 transition-all"
            onClick={seek}
          >
            <div
              className="h-full bg-white rounded-full pointer-events-none"
              style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
            />
          </div>
          {/* Buttons */}
          <div className="flex items-center gap-3">
            {/* Play / Pause */}
            <button
              className="text-white hover:text-white/70 transition-colors"
              onClick={togglePlay}
            >
              {paused ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              )}
            </button>
            {/* Mute */}
            <button
              className="text-white hover:text-white/70 transition-colors"
              onClick={toggleMute}
            >
              {muted ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M16.5 12A4.5 4.5 0 0014 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM18.5 12c0-2.77-1.5-5.17-3.8-6.47v2.15l3.76 3.76c.04-.27.04-.43.04-.44z" />
                </svg>
              )}
            </button>
            {/* Time */}
            {duration > 0 && (
              <span className="text-white/80 text-xs tabular-nums select-none">
                {fmt(currentTime)} / {fmt(duration)}
              </span>
            )}
            <div className="flex-1" />
            {/* Expand to lightbox */}
            {onExpand && (
              <button
                className="text-white hover:text-white/70 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  onExpand();
                }}
                title="Xem toàn màn hình"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PostCard({ post, currentUserId }: PostCardProps) {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const goToProfile = (uid?: string) => uid && navigate(`/feed/profile/${uid}`);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const initialLiked = currentUserId ? (post.likedBy?.includes(currentUserId) ?? false) : false;
  const initialReaction = currentUserId ? (post.reactions?.[currentUserId] ?? null) : null;
  const [isLiked, setIsLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(post.likeCount || 0);
  const [showComments, setShowComments] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [selectedReaction, setSelectedReaction] = useState<string | null>(
    initialReaction ?? (initialLiked ? '❤️' : null)
  );
  const [commentCount, setCommentCount] = useState(post.replyCount || 0);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentLikes, setCommentLikes] = useState<Record<string, boolean>>({});
  const [isClosing, setIsClosing] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  const [contentExpanded, setContentExpanded] = useState(false);
  const CONTENT_COLLAPSE_LIMIT = 100; // chars before showing "Xem thêm"
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxCommentOpen, setLightboxCommentOpen] = useState(false);
  const [lightboxShowReactions, setLightboxShowReactions] = useState(false);
  const lightboxCommentRef = useRef<HTMLInputElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const shareRef = useRef<HTMLDivElement>(null);
  const reactionHideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lightboxReactionHideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close menus when clicking outside
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (optionsRef.current && !optionsRef.current.contains(e.target as Node)) {
      setShowOptions(false);
    }
    if (shareRef.current && !shareRef.current.contains(e.target as Node)) {
      setShowShareMenu(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [handleClickOutside]);

  // Auto-refresh time display every 30s (vừa xong → X phút trước, etc.)
  const [, setTimeTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTimeTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const openLightbox = useCallback((index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
    setLightboxCommentOpen(false);
  }, []);

  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
      if (e.key === 'ArrowLeft') setLightboxIndex((prev) => Math.max(0, prev - 1));
      if (e.key === 'ArrowRight')
        setLightboxIndex((prev) => Math.min(post.mediaUrls.length - 1, prev + 1));
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [lightboxOpen, post.mediaUrls.length]);

  // Handle closing with animation
  const handleCloseComments = () => {
    setIsClosing(true);
    setTimeout(() => {
      setShowComments(false);
      setIsClosing(false);
    }, 400);
  };

  const loadComments = useCallback(async () => {
    try {
      setLoadingComments(true);
      console.log(`📥 Loading comments for post ${post.id}...`);
      const response = await api.get<{ comments: Comment[] }>(`/api/comments/${post.id}`);
      console.log(`✅ Loaded ${response.comments?.length || 0} comments:`, response.comments);
      setComments(response.comments || []);
      setCommentCount(response.comments?.length ?? 0);
      // Initialize comment likes state
      const likes: Record<string, boolean> = {};
      response.comments?.forEach((comment) => {
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
  }, [post.id, currentUserId]);

  // Load comments when showComments changes and focus input
  useEffect(() => {
    if (showComments) {
      loadComments();
      setTimeout(() => {
        commentInputRef.current?.focus();
      }, 300);
    }
  }, [showComments, loadComments]);

  // Prevent body scroll when comments are open
  useEffect(() => {
    if (showComments) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showComments]);

  const handleSubmitComment = async () => {
    if (!commentText.trim() || submittingComment) return;

    try {
      setSubmittingComment(true);
      console.log(`📤 Submitting comment to post ${post.id}:`, commentText.trim());
      const response = await api.post<Comment>(`/api/comments/${post.id}`, {
        content: commentText.trim(),
      });
      console.log(`✅ Comment created:`, response);

      // Reload comments from server to get fresh data (also syncs commentCount)
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
      setComments(comments.filter((c) => c.id !== commentId));
      setCommentCount((c) => Math.max(0, c - 1));
    } catch (error) {
      console.error('Error deleting comment:', error);
    }
  };

  const handleLikeComment = async (commentId: string) => {
    try {
      const isCurrentlyLiked = commentLikes[commentId] || false;

      // Optimistic update
      setCommentLikes((prev) => ({ ...prev, [commentId]: !isCurrentlyLiked }));
      setComments((prev) =>
        prev.map((c) => {
          if (c.id === commentId) {
            return {
              ...c,
              likeCount: isCurrentlyLiked ? c.likeCount - 1 : c.likeCount + 1,
              likedBy: isCurrentlyLiked
                ? c.likedBy.filter((uid) => uid !== currentUserId)
                : [...c.likedBy, currentUserId || ''],
            };
          }
          return c;
        })
      );

      // API call
      await api.post(`/api/comments/${post.id}/${commentId}/like`);
    } catch (error) {
      console.error('Error liking comment:', error);
      // Revert on error
      setCommentLikes((prev) => ({ ...prev, [commentId]: !prev[commentId] }));
      setComments((prev) =>
        prev.map((c) => {
          if (c.id === commentId) {
            return {
              ...c,
              likeCount: commentLikes[commentId] ? c.likeCount + 1 : c.likeCount - 1,
              likedBy: commentLikes[commentId]
                ? [...c.likedBy, currentUserId || '']
                : c.likedBy.filter((uid) => uid !== currentUserId),
            };
          }
          return c;
        })
      );
    }
  };

  // Reaction mapping
  const reactions: Record<
    string,
    { label: string; color: string; bgColor: string; borderColor: string; shadowColor: string }
  > = {
    '❤️': {
      label: 'Thích',
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'from-red-500/15 to-pink-500/15 hover:from-red-500/25 hover:to-pink-500/25',
      borderColor: 'border-red-200 dark:border-red-900/30',
      shadowColor: 'shadow-red-500/10',
    },
    '🌊': {
      label: 'Sóng',
      color: 'text-cyan-600 dark:text-cyan-400',
      bgColor: 'from-cyan-500/15 to-blue-500/15 hover:from-cyan-500/25 hover:to-blue-500/25',
      borderColor: 'border-cyan-200 dark:border-cyan-900/30',
      shadowColor: 'shadow-cyan-500/10',
    },
    '😂': {
      label: 'Haha',
      color: 'text-yellow-600 dark:text-yellow-400',
      bgColor:
        'from-yellow-500/15 to-orange-500/15 hover:from-yellow-500/25 hover:to-orange-500/25',
      borderColor: 'border-yellow-200 dark:border-yellow-900/30',
      shadowColor: 'shadow-yellow-500/10',
    },
    '😮': {
      label: 'Wow',
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'from-orange-500/15 to-amber-500/15 hover:from-orange-500/25 hover:to-amber-500/25',
      borderColor: 'border-orange-200 dark:border-orange-900/30',
      shadowColor: 'shadow-orange-500/10',
    },
    '😢': {
      label: 'Buồn',
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'from-blue-500/15 to-indigo-500/15 hover:from-blue-500/25 hover:to-indigo-500/25',
      borderColor: 'border-blue-200 dark:border-blue-900/30',
      shadowColor: 'shadow-blue-500/10',
    },
    '👍': {
      label: 'Tuyệt',
      color: 'text-indigo-600 dark:text-indigo-400',
      bgColor:
        'from-indigo-500/15 to-purple-500/15 hover:from-indigo-500/25 hover:to-purple-500/25',
      borderColor: 'border-indigo-200 dark:border-indigo-900/30',
      shadowColor: 'shadow-indigo-500/10',
    },
  };

  type Timestamp =
    | { toDate: () => Date }
    | { _seconds: number; _nanoseconds?: number }
    | { seconds: number; nanoseconds?: number }
    | string
    | number
    | Date
    | null
    | undefined;

  const formatTime = (timestamp: Timestamp) => {
    try {
      if (!timestamp) return 'vừa xong';

      // Handle different timestamp formats
      let date: Date;
      if (
        typeof timestamp === 'object' &&
        timestamp !== null &&
        'toDate' in timestamp &&
        typeof (timestamp as { toDate: unknown }).toDate === 'function'
      ) {
        // Firestore Timestamp object (client SDK)
        date = (timestamp as { toDate: () => Date }).toDate();
      } else if (typeof timestamp === 'object' && timestamp !== null && '_seconds' in timestamp) {
        // Serialized Firestore Timestamp { _seconds, _nanoseconds }
        date = new Date((timestamp as { _seconds: number })._seconds * 1000);
      } else if (typeof timestamp === 'object' && timestamp !== null && 'seconds' in timestamp) {
        // Serialized Firestore Timestamp { seconds, nanoseconds }
        date = new Date((timestamp as { seconds: number }).seconds * 1000);
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

      // Từ 7 ngày trở lên - hiển thị ngày tháng năm cụ thể
      const day = date.getDate();
      const month = date.getMonth() + 1;
      const year = date.getFullYear();
      const currentYear = now.getFullYear();
      // Nếu cùng năm thì bỏ năm, khác năm thì hiện đủ
      if (year === currentYear) {
        return `${day} tháng ${month}`;
      }
      return `${day} tháng ${month}, ${year}`;
    } catch (error) {
      console.error('Error formatting time:', error, timestamp);
      return 'vừa xong';
    }
  };

  const handleLike = async () => {
    const newLiked = !isLiked;
    setIsLiked(newLiked);
    setSelectedReaction(newLiked ? '❤️' : null);
    setLikeCount((c) => (newLiked ? c + 1 : c - 1));
    try {
      await api.post(`/api/posts/${post.id}/like`, { reaction: '❤️' });
    } catch {
      setIsLiked(!newLiked);
      setSelectedReaction(!newLiked ? '❤️' : null);
      setLikeCount((c) => (newLiked ? c - 1 : c + 1));
    }
  };

  const handleReactionPick = async (emoji: string) => {
    const alreadyPicked = isLiked && selectedReaction === emoji;
    const newLiked = !alreadyPicked;
    const prevLiked = isLiked;
    const prevReaction = selectedReaction;
    const prevCount = likeCount;
    setIsLiked(newLiked);
    setSelectedReaction(alreadyPicked ? null : emoji);
    setLikeCount((c) => (alreadyPicked ? c - 1 : prevLiked ? c : c + 1));
    setShowReactions(false);
    try {
      if (alreadyPicked) {
        // unlike
        await api.post(`/api/posts/${post.id}/like`, { reaction: emoji });
      } else if (!prevLiked) {
        // was not liked, now like with new emoji
        await api.post(`/api/posts/${post.id}/like`, { reaction: emoji });
      } else {
        // switching reaction: unlike old, then like with new emoji
        await api.post(`/api/posts/${post.id}/like`, { reaction: prevReaction });
        await api.post(`/api/posts/${post.id}/like`, { reaction: emoji });
      }
    } catch {
      setIsLiked(prevLiked);
      setSelectedReaction(prevReaction);
      setLikeCount(prevCount);
    }
  };

  const handleSavePost = async () => {
    const newSaved = !isSaved;
    setIsSaved(newSaved);
    try {
      if (newSaved) {
        await api.post(`/api/posts/${post.id}/save`, {});
      } else {
        await api.delete(`/api/posts/${post.id}/save`);
      }
    } catch {
      setIsSaved(!newSaved);
    }
  };

  const handleDeletePost = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDeletePost = async () => {
    setShowDeleteConfirm(false);
    try {
      await api.delete(`/api/posts/${post.id}`);
      setIsDeleted(true);
    } catch {
      alert('Không thể xóa bài viết. Vui lòng thử lại.');
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/post/${post.id}`);
      setShowShareMenu(false);
    } catch {
      // fallback
    }
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
            <path
              fillRule="evenodd"
              d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
              clipRule="evenodd"
            />
          </svg>
        );
      default:
        return (
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z"
              clipRule="evenodd"
            />
          </svg>
        );
    }
  };

  if (isDeleted) return null;

  const hasMedia = post.mediaUrls && post.mediaUrls.length > 0;

  return (
    <>
      {/* Confirm delete → trash modal */}
      <Modal
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Chuyển vào thùng rác?"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Bài viết sẽ được chuyển vào thùng rác. Bạn có thể khôi phục trong vòng{' '}
            <span className="font-semibold">36 ngày</span> trước khi bị xóa vĩnh viễn.
          </p>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
            >
              Hủy
            </button>
            <button
              onClick={() => void confirmDeletePost()}
              className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-red-500 hover:bg-red-600 transition-colors"
            >
              Chuyển vào thùng rác
            </button>
          </div>
        </div>
      </Modal>
      {/* Backdrop */}
      {showComments && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40"
          onClick={handleCloseComments}
          style={{ animation: isClosing ? 'fadeOut 0.4s ease-out' : 'fadeIn 0.4s ease-out' }}
        />
      )}

      <article
        ref={articleRef}
        className={`rounded-2xl ${showComments ? 'overflow-hidden' : 'overflow-visible'} ${
          showComments
            ? 'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[95vw] max-w-2xl max-h-[90vh] bg-white dark:bg-slate-800 shadow-2xl'
            : 'relative mb-4 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-sm'
        }`}
        style={
          showComments
            ? {
                animation: isClosing
                  ? 'scaleOut 0.4s cubic-bezier(0.4, 0, 0.6, 1) forwards'
                  : 'scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
              }
            : undefined
        }
      >
        {/* ── MEDIA HERO LAYOUT — kept as dead code; media now rendered inside card ── */}
        {/* eslint-disable-next-line no-constant-condition */}
        {false ? (
          <div className="relative overflow-hidden rounded-2xl">
            {/* overflow-hidden wrapper only around media images */}
            <div className="relative overflow-hidden rounded-2xl">
              {/* ── 1 image: full width, natural aspect ── */}
              {post.mediaUrls.length === 1 &&
                (isVideoUrl(post.mediaUrls[0]) ? (
                  <FeedVideo
                    src={post.mediaUrls[0]}
                    fill={false}
                    style={{ maxHeight: '520px' }}
                    onExpand={() => openLightbox(0)}
                  />
                ) : (
                  <img
                    src={post.mediaUrls[0]}
                    alt="Post media"
                    className="w-full block object-cover cursor-pointer"
                    style={{ maxHeight: '520px' }}
                    onClick={() => openLightbox(0)}
                  />
                ))}

              {/* ── 2 images: main (2/3) primary + secondary (1/3) ── */}
              {post.mediaUrls.length === 2 && (
                <div
                  className="grid gap-0.5"
                  style={{ gridTemplateColumns: '2fr 1fr', height: '360px' }}
                >
                  <div className="overflow-hidden cursor-pointer" onClick={() => openLightbox(0)}>
                    {isVideoUrl(post.mediaUrls[0]) ? (
                      <FeedVideo src={post.mediaUrls[0]} onExpand={() => openLightbox(0)} />
                    ) : (
                      <img
                        src={post.mediaUrls[0]}
                        alt="Post media 1"
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div className="overflow-hidden cursor-pointer" onClick={() => openLightbox(1)}>
                    {isVideoUrl(post.mediaUrls[1]) ? (
                      <FeedVideo src={post.mediaUrls[1]} onExpand={() => openLightbox(1)} />
                    ) : (
                      <img
                        src={post.mediaUrls[1]}
                        alt="Post media 2"
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                </div>
              )}

              {/* ── 3 images: main left (tall, primary) + 2 stacked right ── */}
              {post.mediaUrls.length === 3 && (
                <div className="grid grid-cols-2 grid-rows-2 gap-0.5" style={{ height: '420px' }}>
                  <div
                    className="overflow-hidden row-span-2 cursor-pointer"
                    onClick={() => openLightbox(0)}
                  >
                    {isVideoUrl(post.mediaUrls[0]) ? (
                      <FeedVideo src={post.mediaUrls[0]} onExpand={() => openLightbox(0)} />
                    ) : (
                      <img
                        src={post.mediaUrls[0]}
                        alt="Post media 1"
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div className="overflow-hidden cursor-pointer" onClick={() => openLightbox(1)}>
                    {isVideoUrl(post.mediaUrls[1]) ? (
                      <FeedVideo src={post.mediaUrls[1]} onExpand={() => openLightbox(1)} />
                    ) : (
                      <img
                        src={post.mediaUrls[1]}
                        alt="Post media 2"
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div className="overflow-hidden cursor-pointer" onClick={() => openLightbox(2)}>
                    {isVideoUrl(post.mediaUrls[2]) ? (
                      <FeedVideo src={post.mediaUrls[2]} onExpand={() => openLightbox(2)} />
                    ) : (
                      <img
                        src={post.mediaUrls[2]}
                        alt="Post media 3"
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                </div>
              )}

              {/* ── 4+ images: main (primary) full-width + ALL secondaries in equal strip ── */}
              {post.mediaUrls.length >= 4 && (
                <div className="flex flex-col gap-0.5">
                  {/* Primary — always full width, taller */}
                  <div
                    className="overflow-hidden cursor-pointer"
                    style={{ height: '260px' }}
                    onClick={() => openLightbox(0)}
                  >
                    {isVideoUrl(post.mediaUrls[0]) ? (
                      <FeedVideo src={post.mediaUrls[0]} onExpand={() => openLightbox(0)} />
                    ) : (
                      <img
                        src={post.mediaUrls[0]}
                        alt="Post media 1"
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  {/* All secondaries — equal-width flex strip, scrolls if too many */}
                  <div className="flex gap-0.5 overflow-x-auto" style={{ height: '90px' }}>
                    {post.mediaUrls.slice(1).map((url, i) => (
                      <div
                        key={i}
                        className="flex-none overflow-hidden cursor-pointer"
                        style={{
                          width: `calc((100% - ${(post.mediaUrls.length - 2) * 2}px) / ${post.mediaUrls.length - 1})`,
                          minWidth: '60px',
                        }}
                        onClick={() => openLightbox(i + 1)}
                      >
                        {isVideoUrl(url) ? (
                          <FeedVideo src={url} onExpand={() => openLightbox(i + 1)} />
                        ) : (
                          <img
                            src={url}
                            alt={`Post media ${i + 2}`}
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Dark gradient overlay from bottom */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent pointer-events-none" />
            </div>
            {/* end overflow-hidden media wrapper */}

            {/* ── VERTICAL ACTION STRIP (outside overflow-hidden, reaction picker won't be clipped) ── */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col items-center gap-5 z-20">
              {/* Like/React */}
              <div className="relative flex flex-col items-center">
                <button
                  onClick={handleLike}
                  onMouseEnter={() => {
                    if (reactionHideTimeout.current) clearTimeout(reactionHideTimeout.current);
                    setShowReactions(true);
                  }}
                  onMouseLeave={() => {
                    reactionHideTimeout.current = setTimeout(() => setShowReactions(false), 300);
                  }}
                  className="flex flex-col items-center gap-1 text-white"
                >
                  <div
                    className={`w-11 h-11 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm transition-all ${isLiked ? 'scale-110' : 'hover:bg-black/60'}`}
                  >
                    {isLiked && selectedReaction ? (
                      <span className="text-xl">{selectedReaction}</span>
                    ) : (
                      <svg
                        className="w-6 h-6"
                        fill={isLiked ? 'currentColor' : 'none'}
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                        />
                      </svg>
                    )}
                  </div>
                </button>
                {/* Reaction picker - opens to the left */}
                {showReactions && (
                  <div
                    onMouseEnter={() => {
                      if (reactionHideTimeout.current) clearTimeout(reactionHideTimeout.current);
                      setShowReactions(true);
                    }}
                    onMouseLeave={() => {
                      reactionHideTimeout.current = setTimeout(() => setShowReactions(false), 300);
                    }}
                    className="absolute right-full top-0 mr-2 z-30"
                  >
                    <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl rounded-2xl shadow-2xl p-2 flex gap-1">
                      {['❤️', '🌊', '😂', '😮', '😢', '👍'].map((emoji, index) => (
                        <button
                          key={emoji}
                          onClick={() => void handleReactionPick(emoji)}
                          className="w-10 h-10 flex items-center justify-center text-2xl transition-all hover:scale-150 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700"
                          style={{ animation: `fadeInScale 0.5s ease-out ${index * 0.05}s both` }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Comment */}
              <button
                onClick={() => {
                  setLightboxOpen(true);
                  setLightboxCommentOpen(true);
                  if (comments.length === 0) void loadComments();
                  setTimeout(() => lightboxCommentRef.current?.focus(), 350);
                }}
                className="flex flex-col items-center gap-1 text-white"
              >
                <div className="w-11 h-11 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm hover:bg-black/60 transition-all">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                </div>
                {commentCount > 0 && (
                  <span className="text-xs font-semibold text-white drop-shadow">
                    {commentCount}
                  </span>
                )}
              </button>

              {/* Share */}
              <div className="relative" ref={shareRef}>
                <button
                  onClick={() => setShowShareMenu(!showShareMenu)}
                  className="flex flex-col items-center gap-1 text-white"
                >
                  <div className="w-11 h-11 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm hover:bg-black/60 transition-all">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                      />
                    </svg>
                  </div>
                </button>
                {showShareMenu && (
                  <div className="absolute right-full bottom-0 mr-2 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 py-2 z-20">
                    <button
                      onClick={() => void handleCopyLink()}
                      className="w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700/50 flex items-center gap-3"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                      Sao chép liên kết
                    </button>
                  </div>
                )}
              </div>

              {/* Options (3 dots) */}
              <div className="relative" ref={optionsRef}>
                <button
                  onClick={() => setShowOptions(!showOptions)}
                  className="flex flex-col items-center gap-1 text-white"
                >
                  <div className="w-11 h-11 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm hover:bg-black/60 transition-all">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                    </svg>
                  </div>
                </button>
                {showOptions && (
                  <div className="absolute right-full bottom-0 mr-2 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 py-2 z-30">
                    {currentUserId === post.authorId && (
                      <button
                        onClick={() => {
                          handleDeletePost();
                          setShowOptions(false);
                        }}
                        className="w-full px-4 py-2.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                        Chuyển vào thùng rác
                      </button>
                    )}
                    <button
                      onClick={() => setShowOptions(false)}
                      className="w-full px-4 py-2.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                      Báo cáo bài viết
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Author overlay - bottom left */}
            <div className="absolute bottom-0 left-0 right-14 p-4 z-10">
              {/* Content first (shows above author row) */}
              {post.content && (
                <div className="mb-2">
                  <p className="text-white/90 text-sm leading-snug">
                    {contentExpanded || post.content.length <= CONTENT_COLLAPSE_LIMIT
                      ? post.content
                      : post.content.slice(0, CONTENT_COLLAPSE_LIMIT) + '…'}
                  </p>
                  {post.content.length > CONTENT_COLLAPSE_LIMIT && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setContentExpanded((v) => !v);
                      }}
                      className="text-white/60 text-xs hover:text-white mt-0.5 transition-colors"
                    >
                      {contentExpanded ? 'Ẩn bớt' : 'Xem thêm'}
                    </button>
                  )}
                </div>
              )}

              {/* Author row */}
              <div className="flex items-center gap-2">
                <div
                  onClick={() => goToProfile(post.authorId)}
                  className="cursor-pointer flex-shrink-0"
                >
                  {post.authorPhotoURL ? (
                    <img
                      src={post.authorPhotoURL ?? undefined}
                      alt={post.authorDisplayName}
                      className="w-9 h-9 rounded-full ring-2 ring-white/50 object-cover"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full ring-2 ring-white/50 bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                      <span className="text-sm font-bold text-white">
                        {(() => {
                          const name = post.authorDisplayName || 'U';
                          const words = name.split(' ');
                          return words.length >= 2
                            ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
                            : name[0].toUpperCase();
                        })()}
                      </span>
                    </div>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-1 flex-wrap">
                    <span
                      onClick={() => goToProfile(post.authorId)}
                      className="font-semibold text-white text-sm cursor-pointer hover:underline"
                    >
                      {post.authorDisplayName}
                    </span>
                    {(post.taggedFriends?.length ?? 0) > 0 && (
                      <span className="text-white/80 text-xs">
                        cùng với{' '}
                        {post.taggedFriends!.map((f, i) => (
                          <span key={f.uid}>
                            <span
                              onClick={() => goToProfile(f.uid)}
                              className="font-medium text-white cursor-pointer hover:underline"
                            >
                              {f.displayName}
                            </span>
                            {i < post.taggedFriends!.length - 1 && ', '}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-white/60 text-xs mt-0.5">
                    <span>{formatTime(post.createdAt)}</span>
                    <span>•</span>
                    {getPrivacyIcon()}
                  </div>
                </div>
              </div>

              {commentCount > 0 && (
                <button
                  onClick={() => setShowComments(true)}
                  className="mt-1 text-white/60 text-xs hover:text-white/90 transition-colors"
                >
                  {commentCount} bình luận
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className={`p-5 sm:p-6 ${showComments ? 'overflow-y-auto max-h-[90vh]' : ''}`}>
            {/* Close button when modal */}
            {showComments && (
              <button
                onClick={handleCloseComments}
                className="absolute top-4 right-4 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-600 dark:text-gray-300 transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}

            {/* Author Header */}
            <div className="flex items-start gap-3 mb-4">
              <div
                onClick={() => goToProfile(post.authorId)}
                className="cursor-pointer flex-shrink-0"
              >
                {post.authorPhotoURL ? (
                  <img
                    src={post.authorPhotoURL}
                    alt={post.authorDisplayName}
                    className="w-12 h-12 rounded-full ring-2 ring-white dark:ring-slate-800 shadow-lg object-cover hover:scale-105 transition-transform"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full ring-2 ring-white dark:ring-slate-800 shadow-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center hover:scale-105 transition-transform">
                    <span className="text-lg font-bold text-white">
                      {(() => {
                        const name = post.authorDisplayName || 'U';
                        const words = name.split(' ');
                        return words.length >= 2
                          ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
                          : name[0].toUpperCase();
                      })()}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="text-sm leading-relaxed mb-1">
                  <h3
                    onClick={() => goToProfile(post.authorId)}
                    className="inline font-bold text-gray-900 dark:text-gray-100 hover:text-cyan-600 dark:hover:text-cyan-400 cursor-pointer transition-colors"
                  >
                    {post.authorDisplayName}
                  </h3>
                  {post.feeling && (
                    <span className="text-gray-600 dark:text-gray-400">
                      {' '}
                      đang cảm thấy <span className="font-medium">{post.feeling}</span>
                    </span>
                  )}
                  {post.taggedFriends && post.taggedFriends.length > 0 && (
                    <span className="text-gray-600 dark:text-gray-400">
                      {' '}
                      cùng với{' '}
                      {post.taggedFriends.map((friend, idx) => (
                        <span key={friend.uid}>
                          <span
                            onClick={() => goToProfile(friend.uid)}
                            className="font-medium text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
                          >
                            {friend.displayName}
                          </span>
                          {idx < post.taggedFriends!.length - 1 && ', '}
                        </span>
                      ))}
                    </span>
                  )}
                  {post.location && (
                    <span className="text-gray-600 dark:text-gray-400">
                      {' '}
                      tại <span className="font-medium">📍 {post.location}</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span>{formatTime(post.createdAt)}</span>
                  <span>•</span>
                  <span className="flex items-center gap-1">{getPrivacyIcon()}</span>
                </div>
              </div>

              {/* Options */}
              <div className="relative" ref={optionsRef}>
                <button
                  onClick={() => setShowOptions(!showOptions)}
                  className="w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700/50 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                  </svg>
                </button>
                {showOptions && (
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 py-2 z-20">
                    <button
                      onClick={() => {
                        void handleSavePost();
                        setShowOptions(false);
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700/50 flex items-center gap-3"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                        />
                      </svg>
                      {isSaved ? 'Bỏ lưu bài viết' : 'Lưu bài viết'}
                    </button>
                    <hr className="my-2 border-gray-200 dark:border-slate-700" />
                    {currentUserId === post.authorId && (
                      <button
                        onClick={() => {
                          handleDeletePost();
                          setShowOptions(false);
                        }}
                        className="w-full px-4 py-2.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                        Xóa bài viết
                      </button>
                    )}
                    <button
                      onClick={() => setShowOptions(false)}
                      className="w-full px-4 py-2.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-3"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                      Báo cáo bài viết
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Content */}
            {post.content && (
              <div className="mb-3">
                <p className="text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap text-[15px]">
                  {contentExpanded || post.content.length <= CONTENT_COLLAPSE_LIMIT
                    ? post.content
                    : post.content.slice(0, CONTENT_COLLAPSE_LIMIT) + '…'}
                </p>
                {post.content.length > CONTENT_COLLAPSE_LIMIT && (
                  <button
                    onClick={() => setContentExpanded((v) => !v)}
                    className="text-gray-500 dark:text-gray-400 text-sm hover:text-gray-700 dark:hover:text-gray-200 mt-0.5 transition-colors"
                  >
                    {contentExpanded ? 'Ẩn bớt' : 'Xem thêm'}
                  </button>
                )}
              </div>
            )}

            {/* Media — edge-to-edge inside card */}
            {hasMedia && (
              <div className="-mx-5 sm:-mx-6 mb-4 overflow-hidden">
                {post.mediaUrls.length === 1 &&
                  (isVideoUrl(post.mediaUrls[0]) ? (
                    <FeedVideo
                      src={post.mediaUrls[0]}
                      fill={false}
                      onExpand={() => openLightbox(0)}
                    />
                  ) : (
                    <img
                      src={post.mediaUrls[0]}
                      alt="Post media"
                      className="w-full block object-cover cursor-pointer"
                      style={{ maxHeight: '520px' }}
                      onClick={() => openLightbox(0)}
                    />
                  ))}
                {post.mediaUrls.length === 2 && (
                  <div
                    className="grid gap-0.5"
                    style={{ gridTemplateColumns: '2fr 1fr', height: '360px' }}
                  >
                    <div className="overflow-hidden cursor-pointer" onClick={() => openLightbox(0)}>
                      {isVideoUrl(post.mediaUrls[0]) ? (
                        <FeedVideo src={post.mediaUrls[0]} onExpand={() => openLightbox(0)} />
                      ) : (
                        <img
                          src={post.mediaUrls[0]}
                          alt="Post media 1"
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="overflow-hidden cursor-pointer" onClick={() => openLightbox(1)}>
                      {isVideoUrl(post.mediaUrls[1]) ? (
                        <FeedVideo src={post.mediaUrls[1]} onExpand={() => openLightbox(1)} />
                      ) : (
                        <img
                          src={post.mediaUrls[1]}
                          alt="Post media 2"
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                  </div>
                )}
                {post.mediaUrls.length === 3 && (
                  <div className="grid grid-cols-2 grid-rows-2 gap-0.5" style={{ height: '420px' }}>
                    <div
                      className="overflow-hidden row-span-2 cursor-pointer"
                      onClick={() => openLightbox(0)}
                    >
                      {isVideoUrl(post.mediaUrls[0]) ? (
                        <FeedVideo src={post.mediaUrls[0]} onExpand={() => openLightbox(0)} />
                      ) : (
                        <img
                          src={post.mediaUrls[0]}
                          alt="Post media 1"
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="overflow-hidden cursor-pointer" onClick={() => openLightbox(1)}>
                      {isVideoUrl(post.mediaUrls[1]) ? (
                        <FeedVideo src={post.mediaUrls[1]} onExpand={() => openLightbox(1)} />
                      ) : (
                        <img
                          src={post.mediaUrls[1]}
                          alt="Post media 2"
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="overflow-hidden cursor-pointer" onClick={() => openLightbox(2)}>
                      {isVideoUrl(post.mediaUrls[2]) ? (
                        <FeedVideo src={post.mediaUrls[2]} onExpand={() => openLightbox(2)} />
                      ) : (
                        <img
                          src={post.mediaUrls[2]}
                          alt="Post media 3"
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                  </div>
                )}
                {post.mediaUrls.length >= 4 && (
                  <div className="flex flex-col gap-0.5">
                    <div
                      className="overflow-hidden cursor-pointer"
                      style={{ height: '260px' }}
                      onClick={() => openLightbox(0)}
                    >
                      {isVideoUrl(post.mediaUrls[0]) ? (
                        <FeedVideo src={post.mediaUrls[0]} onExpand={() => openLightbox(0)} />
                      ) : (
                        <img
                          src={post.mediaUrls[0]}
                          alt="Post media 1"
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="flex gap-0.5 overflow-x-auto" style={{ height: '90px' }}>
                      {post.mediaUrls.slice(1).map((url, i) => (
                        <div
                          key={i}
                          className="flex-none overflow-hidden cursor-pointer"
                          style={{
                            width: `calc((100% - ${(post.mediaUrls.length - 2) * 2}px) / ${post.mediaUrls.length - 1})`,
                            minWidth: '60px',
                          }}
                          onClick={() => openLightbox(i + 1)}
                        >
                          {isVideoUrl(url) ? (
                            <FeedVideo src={url} onExpand={() => openLightbox(i + 1)} />
                          ) : (
                            <img
                              src={url}
                              alt={`Post media ${i + 2}`}
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Stats */}
            {(likeCount > 0 || commentCount > 0) && (
              <div className="flex items-center justify-between py-3 mb-3 border-b border-gray-200 dark:border-slate-700/50">
                {likeCount > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
                    <span>{selectedReaction || '❤️'}</span>
                    <span className="font-medium">{likeCount}</span>
                  </div>
                )}
                {commentCount > 0 && (
                  <button
                    onClick={() => setShowComments(!showComments)}
                    className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
                  >
                    {commentCount} bình luận
                  </button>
                )}
              </div>
            )}

            {/* Action Bar */}
            <div className="flex items-center gap-1">
              {/* Like */}
              <div className="relative flex-1">
                <button
                  onClick={handleLike}
                  onMouseEnter={() => setShowReactions(true)}
                  onMouseLeave={() => setShowReactions(false)}
                  className={`group w-full flex items-center justify-center gap-1.5 py-2 rounded-lg font-medium text-xs transition-all border hover:scale-[1.02] active:scale-95 ${
                    isLiked && selectedReaction
                      ? `bg-gradient-to-r ${reactions[selectedReaction].bgColor} ${reactions[selectedReaction].color} ${reactions[selectedReaction].borderColor}`
                      : 'text-gray-700 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 border-gray-200 dark:border-slate-700'
                  }`}
                >
                  {isLiked && selectedReaction ? (
                    <>
                      <span className="text-base leading-none">{selectedReaction}</span>
                      {likeCount > 0 && <span>{likeCount}</span>}
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                        />
                      </svg>
                      {likeCount > 0 && <span>{likeCount}</span>}
                    </>
                  )}
                </button>
                {showReactions && (
                  <div
                    onMouseEnter={() => setShowReactions(true)}
                    onMouseLeave={() => setShowReactions(false)}
                    className="absolute bottom-full left-1/2 -translate-x-1/2 pb-1 z-20"
                  >
                    <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl rounded-full shadow-2xl border border-gray-200 dark:border-slate-700 p-2 flex gap-1">
                      {['❤️', '🌊', '😂', '😮', '😢', '👍'].map((emoji, index) => (
                        <button
                          key={emoji}
                          onClick={() => void handleReactionPick(emoji)}
                          className="w-10 h-10 flex items-center justify-center text-2xl transition-all hover:scale-150 hover:-translate-y-1 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700"
                          style={{ animation: `fadeInScale 0.2s ease-out ${index * 0.05}s both` }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Comment */}
              <button
                onClick={() => setShowComments(!showComments)}
                className="group flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg font-medium text-xs text-gray-700 dark:text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400 border border-gray-200 dark:border-slate-700 transition-all hover:scale-[1.02] active:scale-95"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
                <span>Bình luận{commentCount > 0 ? ` (${commentCount})` : ''}</span>
              </button>

              {/* Share */}
              <div className="relative flex-1" ref={shareRef}>
                <button
                  onClick={() => setShowShareMenu(!showShareMenu)}
                  className="group w-full flex items-center justify-center gap-1.5 py-2 rounded-lg font-medium text-xs text-gray-700 dark:text-gray-400 hover:bg-green-50 dark:hover:bg-green-900/20 hover:text-green-600 dark:hover:text-green-400 border border-gray-200 dark:border-slate-700 transition-all hover:scale-[1.02] active:scale-95"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                    />
                  </svg>
                  <span>Chia sẻ</span>
                </button>
                {showShareMenu && (
                  <div className="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 py-2 z-20">
                    <button
                      onClick={() => void handleCopyLink()}
                      className="w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700/50 flex items-center gap-3"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                      Sao chép liên kết
                    </button>
                  </div>
                )}
              </div>

              {/* Save */}
              <button
                onClick={() => void handleSavePost()}
                className={`flex items-center justify-center w-9 h-9 rounded-lg border transition-all hover:scale-110 active:scale-95 ${isSaved ? 'text-yellow-600 border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20' : 'text-gray-700 dark:text-gray-400 border-gray-200 dark:border-slate-700 hover:text-yellow-600 hover:border-yellow-300'}`}
              >
                <svg
                  className="w-4 h-4"
                  fill={isSaved ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                  />
                </svg>
              </button>
            </div>

            {/* Comments Section */}
            {showComments && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700/50">
                {loadingComments ? (
                  <div className="text-center py-4">
                    <div className="inline-block w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : comments.length === 0 ? (
                  <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                    Chưa có bình luận nào
                  </div>
                ) : (
                  <div className="space-y-3 mb-4">
                    {comments.map((comment) => (
                      <div key={comment.id} className="flex gap-2">
                        {comment.authorPhotoURL ? (
                          <img
                            src={comment.authorPhotoURL}
                            alt={comment.authorDisplayName}
                            className="w-8 h-8 rounded-full flex-shrink-0 object-cover cursor-pointer"
                            onClick={() => goToProfile(comment.authorId)}
                          />
                        ) : (
                          <div
                            className="w-8 h-8 rounded-full flex-shrink-0 bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center cursor-pointer"
                            onClick={() => goToProfile(comment.authorId)}
                          >
                            <span className="text-xs font-bold text-white">
                              {(() => {
                                const n = comment.authorDisplayName || 'U';
                                const w = n.split(' ');
                                return w.length >= 2
                                  ? (w[0][0] + w[w.length - 1][0]).toUpperCase()
                                  : n[0].toUpperCase();
                              })()}
                            </span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="bg-gray-100 dark:bg-slate-800/60 rounded-2xl px-3 py-2">
                            <div
                              className="font-semibold text-sm text-gray-900 dark:text-gray-100 cursor-pointer hover:underline w-fit"
                              onClick={() => goToProfile(comment.authorId)}
                            >
                              {comment.authorDisplayName}
                            </div>
                            <div className="text-sm text-gray-800 dark:text-gray-200 mt-0.5">
                              {comment.content}
                            </div>
                          </div>
                          <div className="flex items-center gap-4 mt-1 px-3 text-xs font-semibold">
                            <button
                              onClick={() => handleLikeComment(comment.id)}
                              className={`hover:underline ${commentLikes[comment.id] ? 'text-cyan-600 dark:text-cyan-400' : 'text-gray-600 dark:text-gray-400'}`}
                            >
                              Thích
                            </button>
                            <button className="text-gray-600 dark:text-gray-400 hover:underline">
                              Trả lời
                            </button>
                            <span className="text-gray-500 font-normal">
                              {comment.createdAt && formatTime(comment.createdAt)}
                            </span>
                            {comment.likeCount > 0 && (
                              <span className="text-gray-500 font-normal">
                                {comment.likeCount} ❤️
                              </span>
                            )}
                            {currentUserId === comment.authorId && (
                              <button
                                onClick={() => handleDeleteComment(comment.id)}
                                className="text-gray-400 hover:text-red-600 hover:underline ml-auto"
                              >
                                Xóa
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Comment Input */}
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
                          const n = user?.displayName || user?.email || 'U';
                          const w = n.split(' ');
                          return w.length >= 2
                            ? (w[0][0] + w[w.length - 1][0]).toUpperCase()
                            : n[0].toUpperCase();
                        })()}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 relative">
                    <input
                      ref={commentInputRef}
                      type="text"
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSubmitComment()}
                      placeholder="Viết bình luận của bạn..."
                      disabled={submittingComment}
                      className="w-full bg-white dark:bg-slate-900/50 text-gray-900 dark:text-gray-100 placeholder-gray-500 rounded-full px-4 py-2.5 pr-12 border-2 border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-400 transition-all disabled:opacity-50"
                    />
                    <button
                      onClick={handleSubmitComment}
                      disabled={!commentText.trim() || submittingComment}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-cyan-600 hover:text-cyan-700 transition-colors disabled:opacity-50"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </article>

      {/* ── LIGHTBOX ── */}
      {lightboxOpen && (
        <div className="fixed inset-0 z-[9999] flex" style={{ overflow: 'hidden' }}>
          {/* ── ACTION COLUMN (left side) ── */}
          <div
            className="w-16 bg-black flex flex-col items-center justify-center gap-5 flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Like / Reaction */}
            <div className="relative flex flex-col items-center">
              {lightboxShowReactions && (
                <div
                  className="absolute left-full top-0 ml-3 z-30"
                  onMouseEnter={() => {
                    if (lightboxReactionHideTimeout.current)
                      clearTimeout(lightboxReactionHideTimeout.current);
                    setLightboxShowReactions(true);
                  }}
                  onMouseLeave={() => {
                    lightboxReactionHideTimeout.current = setTimeout(
                      () => setLightboxShowReactions(false),
                      300
                    );
                  }}
                >
                  <div className="bg-white/10 backdrop-blur-xl rounded-full shadow-2xl border border-white/20 p-2 flex flex-col gap-1">
                    {['❤️', '🌊', '😂', '😮', '😢', '👍'].map((emoji, index) => (
                      <button
                        key={emoji}
                        onClick={() => void handleReactionPick(emoji)}
                        className="w-10 h-10 flex items-center justify-center text-2xl transition-all hover:scale-150 hover:translate-x-1 rounded-full hover:bg-white/20"
                        style={{ animation: `fadeInScale 0.2s ease-out ${index * 0.05}s both` }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <button
                className="flex flex-col items-center gap-1"
                onClick={() => void handleLike()}
                onMouseEnter={() => {
                  if (lightboxReactionHideTimeout.current)
                    clearTimeout(lightboxReactionHideTimeout.current);
                  setLightboxShowReactions(true);
                }}
                onMouseLeave={() => {
                  lightboxReactionHideTimeout.current = setTimeout(
                    () => setLightboxShowReactions(false),
                    300
                  );
                }}
              >
                <div
                  className={`w-11 h-11 flex items-center justify-center rounded-full bg-white/10 backdrop-blur-sm hover:bg-white/20 transition-all ${isLiked ? 'scale-110' : ''}`}
                >
                  {isLiked && selectedReaction ? (
                    <span className="text-xl">{selectedReaction}</span>
                  ) : (
                    <svg
                      className="w-6 h-6 text-white"
                      fill={isLiked ? 'currentColor' : 'none'}
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                      />
                    </svg>
                  )}
                </div>
              </button>
            </div>

            {/* Comment */}
            <button
              className="flex flex-col items-center gap-1"
              onClick={() => {
                setLightboxCommentOpen((prev) => {
                  const next = !prev;
                  if (next && comments.length === 0) void loadComments();
                  if (next) setTimeout(() => lightboxCommentRef.current?.focus(), 350);
                  return next;
                });
              }}
            >
              <div
                className={`w-11 h-11 flex items-center justify-center rounded-full backdrop-blur-sm hover:bg-white/20 transition-all ${lightboxCommentOpen ? 'bg-white/30' : 'bg-white/10'}`}
              >
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
              </div>
              {commentCount > 0 && (
                <span className="text-white text-xs font-semibold">{commentCount}</span>
              )}
            </button>

            {/* Share */}
            <button
              className="flex flex-col items-center gap-1"
              onClick={() => void handleCopyLink()}
            >
              <div className="w-11 h-11 flex items-center justify-center rounded-full bg-white/10 backdrop-blur-sm hover:bg-white/20 transition-all">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                  />
                </svg>
              </div>
            </button>

            {/* Save */}
            <button
              className="flex flex-col items-center gap-1"
              onClick={() => void handleSavePost()}
            >
              <div
                className={`w-11 h-11 flex items-center justify-center rounded-full bg-white/10 backdrop-blur-sm hover:bg-white/20 transition-all ${isSaved ? 'text-yellow-400' : 'text-white'}`}
              >
                <svg
                  className="w-6 h-6"
                  fill={isSaved ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                  />
                </svg>
              </div>
            </button>
          </div>

          {/* ── IMAGE PANE ── */}
          <div className="relative flex-1 bg-black flex flex-col transition-all duration-300">
            {/* Top bar */}
            <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/70 to-transparent">
              <div className="text-white/70 text-sm font-medium">
                {lightboxIndex + 1} / {post.mediaUrls.length}
              </div>
              <button
                className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-all"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxOpen(false);
                  setLightboxCommentOpen(false);
                }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Image — centered between top bar and bottom */}
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              style={{ top: '52px', bottom: '0' }}
            >
              {isVideoUrl(post.mediaUrls[lightboxIndex]) ? (
                <video
                  src={post.mediaUrls[lightboxIndex]}
                  className="max-w-full max-h-full object-contain select-none"
                  controls
                  autoPlay
                  muted
                  playsInline
                />
              ) : (
                <img
                  src={post.mediaUrls[lightboxIndex]}
                  alt={`Ảnh ${lightboxIndex + 1} / ${post.mediaUrls.length}`}
                  className="max-w-full max-h-full object-contain select-none"
                />
              )}
            </div>

            {/* Nav — left half */}
            <div
              className="absolute left-0 z-10 flex items-center pl-4"
              style={{
                top: '52px',
                bottom: '0',
                width: '50%',
                cursor: lightboxIndex > 0 ? 'w-resize' : 'default',
              }}
              onClick={() => setLightboxIndex((prev) => Math.max(0, prev - 1))}
            >
              {lightboxIndex > 0 && (
                <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white shadow-lg">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </div>
              )}
            </div>

            {/* Nav — right half */}
            <div
              className="absolute right-0 z-10 flex items-center justify-end pr-4"
              style={{
                top: '52px',
                bottom: '0',
                width: '50%',
                cursor: lightboxIndex < post.mediaUrls.length - 1 ? 'e-resize' : 'default',
              }}
              onClick={() =>
                setLightboxIndex((prev) => Math.min(post.mediaUrls.length - 1, prev + 1))
              }
            >
              {lightboxIndex < post.mediaUrls.length - 1 && (
                <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white shadow-lg">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              )}
            </div>

            {/* Dot indicators */}
            {post.mediaUrls.length > 1 && (
              <div
                className="absolute z-20 flex gap-2"
                style={{ bottom: '20px', left: '50%', transform: 'translateX(-50%)' }}
                onClick={(e) => e.stopPropagation()}
              >
                {post.mediaUrls.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setLightboxIndex(i)}
                    className={`w-2 h-2 rounded-full transition-all ${
                      i === lightboxIndex ? 'bg-white scale-125' : 'bg-white/40 hover:bg-white/70'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ── COMMENT SIDEBAR ── */}
          {lightboxCommentOpen && (
            <div
              className="w-80 bg-white dark:bg-slate-900 flex flex-col border-l border-gray-200 dark:border-slate-700"
              style={{ animation: 'slideInRight 0.25s ease-out' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
                <span className="font-semibold text-gray-900 dark:text-gray-100">Bình luận</span>
                <button
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500"
                  onClick={() => setLightboxCommentOpen(false)}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {/* Post caption */}
              <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 flex-shrink-0">
                <div className="flex items-center gap-2 mb-1">
                  {post.authorPhotoURL ? (
                    <img
                      src={post.authorPhotoURL}
                      alt={post.authorDisplayName}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                      <span className="text-xs font-bold text-white">
                        {(post.authorDisplayName || 'U')[0].toUpperCase()}
                      </span>
                    </div>
                  )}
                  <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                    {post.authorDisplayName}
                  </span>
                  <span className="text-xs text-gray-400">{formatTime(post.createdAt)}</span>
                </div>
                {post.content && (
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-snug line-clamp-3">
                    {post.content}
                  </p>
                )}
              </div>

              {/* Comments list */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 custom-scrollbar">
                {loadingComments ? (
                  <div className="flex justify-center py-6">
                    <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : comments.length === 0 ? (
                  <div className="text-center text-sm text-gray-400 py-6">
                    Chưa có bình luận nào
                  </div>
                ) : (
                  comments.map((comment) => (
                    <div key={comment.id} className="flex gap-2">
                      {comment.authorPhotoURL ? (
                        <img
                          src={comment.authorPhotoURL}
                          alt={comment.authorDisplayName}
                          className="w-8 h-8 rounded-full flex-shrink-0 object-cover cursor-pointer"
                          onClick={() => {
                            goToProfile(comment.authorId);
                            setLightboxOpen(false);
                            setLightboxCommentOpen(false);
                          }}
                        />
                      ) : (
                        <div
                          className="w-8 h-8 rounded-full flex-shrink-0 bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center cursor-pointer"
                          onClick={() => {
                            goToProfile(comment.authorId);
                            setLightboxOpen(false);
                            setLightboxCommentOpen(false);
                          }}
                        >
                          <span className="text-xs font-bold text-white">
                            {(comment.authorDisplayName || 'U')[0].toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="bg-gray-100 dark:bg-slate-800 rounded-2xl px-3 py-2">
                          <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                            {comment.authorDisplayName}
                          </div>
                          <div className="text-sm text-gray-800 dark:text-gray-200 mt-0.5">
                            {comment.content}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 mt-1 px-2 text-xs font-semibold">
                          <button
                            onClick={() => void handleLikeComment(comment.id)}
                            className={`hover:underline ${commentLikes[comment.id] ? 'text-cyan-600' : 'text-gray-500'}`}
                          >
                            Thích
                          </button>
                          <span className="text-gray-400 font-normal">
                            {comment.createdAt && formatTime(comment.createdAt)}
                          </span>
                          {comment.likeCount > 0 && (
                            <span className="text-gray-400 font-normal">
                              {comment.likeCount} ❤️
                            </span>
                          )}
                          {currentUserId === comment.authorId && (
                            <button
                              onClick={() => void handleDeleteComment(comment.id)}
                              className="text-gray-400 hover:text-red-500 ml-auto"
                            >
                              Xóa
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Comment input */}
              <div className="px-4 py-3 border-t border-gray-200 dark:border-slate-700 flex-shrink-0">
                <div className="flex gap-2">
                  {user?.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt="You"
                      className="w-8 h-8 rounded-full flex-shrink-0 object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full flex-shrink-0 bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                      <span className="text-xs font-bold text-white">
                        {(user?.displayName || user?.email || 'U')[0].toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 relative">
                    <input
                      ref={lightboxCommentRef}
                      type="text"
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && void handleSubmitComment()}
                      placeholder="Viết bình luận..."
                      disabled={submittingComment}
                      className="w-full bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 rounded-full px-4 py-2 pr-10 text-sm border border-gray-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50"
                    />
                    <button
                      onClick={() => void handleSubmitComment()}
                      disabled={!commentText.trim() || submittingComment}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-cyan-600 hover:text-cyan-700 disabled:opacity-40"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
