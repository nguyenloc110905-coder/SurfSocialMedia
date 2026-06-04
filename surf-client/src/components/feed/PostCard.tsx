import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import Modal from '../ui/Modal';
import PresenceBadge from '../ui/PresenceBadge';
import { isVideoUrl, uploadImage, uploadVideo } from '../../lib/cloudinary';
import { optimizeImageUrl } from '../../lib/image-cdn';
import EditPostModal from './EditPostModal';
import { getSocket } from '../../lib/socket';
import MentionCommentInput from './MentionCommentInput';
import { markupToPlain, extractMentions, renderCommentContent } from '../../lib/mentionUtils';
import { renderPostContent } from '../../lib/hashtagUtils';
import { useT, useTimeFormatter } from '../../lib/i18n';

const REPORT_CATEGORIES = [
  { key: 'spam', label: 'Spam hoặc lừa đảo' },
  { key: 'hate', label: 'Ngôn từ thù ghét hoặc quấy rối' },
  { key: 'violence', label: 'Ảnh khỏa thân hoặc bạo lực' },
  { key: 'fake_news', label: 'Thông tin sai lệch' },
  { key: 'illegal', label: 'Bán hàng trái phép' },
  { key: 'copyright', label: 'Vi phạm bản quyền (IP)' },
  { key: 'other', label: 'Lý do khác' },
];

interface Comment {
  id: string;
  postId: string;
  authorId: string;
  authorDisplayName: string;
  authorPhotoURL: string | null;
  content: string;
  mediaUrl?: string;
  createdAt:
    | import('firebase/firestore').Timestamp
    | { _seconds: number }
    | { seconds: number }
    | string
    | number
    | null;
  likeCount: number;
  likedBy: string[];
  reactions?: Record<string, string>;
  isEdited?: boolean;
  parentId?: string;
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
    shareCount?: number;
    likedBy: string[];
    reactions?: Record<string, string>;
    feeling?: string;
    location?: string;
    taggedFriends?: Array<{ uid: string; displayName: string }>;
    privacy?: 'public' | 'friends' | 'only-me' | 'custom';
    groupId?: string;
    isEdited?: boolean;
    isAnonymous?: boolean;
    poll?: { options: { id: string; text: string; votes: string[] }[] };
    savedBy?: string[];
    pinnedAt?: string | null;
    group?: {
      id: string;
      name: string;
      coverImageUrl?: string | null;
    };
    sharedFrom?: {
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
    };
  };
  currentUserId?: string;
  onPostUpdated?: (updated: PostCardProps['post']) => void;
  onPostCreated?: (post: PostCardProps['post']) => void;
  defaultOpenComments?: boolean;
  showPinOption?: boolean;
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
  const t = useT();
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
        className={
          fill ? 'w-full h-full block object-cover' : 'w-full block object-contain bg-black'
        }
        style={fill ? undefined : { maxHeight: '320px' }}
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
            {/* Rewind 5s */}
            <button
              className="text-white hover:text-white/70 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                const el = videoRef.current;
                if (el) el.currentTime = Math.max(0, el.currentTime - 5);
              }}
              title={t('video_rewind')}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
                <text
                  x="8.5"
                  y="14.5"
                  fontSize="5.5"
                  fontWeight="bold"
                  fill="currentColor"
                  textAnchor="middle"
                >
                  5
                </text>
              </svg>
            </button>
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
            {/* Forward 5s */}
            <button
              className="text-white hover:text-white/70 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                const el = videoRef.current;
                if (el) el.currentTime = Math.min(el.duration || 0, el.currentTime + 5);
              }}
              title={t('video_forward')}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z" />
                <text
                  x="15.5"
                  y="14.5"
                  fontSize="5.5"
                  fontWeight="bold"
                  fill="currentColor"
                  textAnchor="middle"
                >
                  5
                </text>
              </svg>
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
                title={t('video_fullscreen')}
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

function UserPresenceAvatar({
  uid,
  name,
  photoURL,
  imgClassName,
  fallbackClassName,
  fallbackTextClassName,
  presenceSize = 'sm',
  showOfflineLabel = false,
}: {
  uid?: string;
  name: string;
  photoURL?: string | null;
  imgClassName: string;
  fallbackClassName: string;
  fallbackTextClassName: string;
  presenceSize?: 'sm' | 'md' | 'lg';
  showOfflineLabel?: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const initial = (() => {
    const value = (name || 'U').replace(/^[^a-zA-Z\u00C0-\u024F]+/, '').trim() || 'U';
    const words = value.split(' ').filter(Boolean);
    if (words.length >= 2) {
      return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    }
    return value[0]?.toUpperCase() ?? 'U';
  })();

  return (
    <span className="relative inline-flex flex-shrink-0 overflow-visible">
      {photoURL && !imgError ? (
        <img
          src={optimizeImageUrl(photoURL)}
          alt={name}
          className={imgClassName}
          onError={() => setImgError(true)}
        />
      ) : (
        <div className={fallbackClassName}>
          <span className={fallbackTextClassName}>{initial}</span>
        </div>
      )}
      {uid && <PresenceBadge uid={uid} size={presenceSize} showOfflineLabel={showOfflineLabel} />}
    </span>
  );
}

export default function PostCard({
  post,
  currentUserId,
  onPostUpdated,
  onPostCreated,
  defaultOpenComments,
  showPinOption = false,
}: PostCardProps) {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const t = useT();
  const tf = useTimeFormatter();
  const goToProfile = (uid?: string) => {
    if (post.isAnonymous) return;
    if (uid) navigate(`/feed/profile/${uid}`);
  };
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const initialLiked = currentUserId ? (post.likedBy?.includes(currentUserId) ?? false) : false;
  const initialReaction = currentUserId ? (post.reactions?.[currentUserId] ?? null) : null;
  const [isLiked, setIsLiked] = useState(initialLiked);
  const [likeCount, setLikeCount] = useState(post.likeCount || 0);
  const [reactionsMap, setReactionsMap] = useState<Record<string, string>>(post.reactions ?? {});
  const [showComments, setShowComments] = useState(defaultOpenComments ?? false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareCaption, setShareCaption] = useState('');
  const [shareReaction, setShareReaction] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [isPinned, setIsPinned] = useState(!!post.pinnedAt);
  const [isSaved, setIsSaved] = useState(
    currentUserId ? (post.savedBy?.includes(currentUserId) ?? false) : false
  );
  const [showReactions, setShowReactions] = useState(false);
  const [selectedReaction, setSelectedReaction] = useState<string | null>(
    initialReaction ?? (initialLiked ? '❤️' : null)
  );
  const [commentCount, setCommentCount] = useState(post.replyCount || 0);
  const [shareCount, setShareCount] = useState(post.shareCount || 0);
  const [sharingPost, setSharingPost] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentMediaFile, setCommentMediaFile] = useState<File | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [loadingComments, setLoadingComments] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentLikes, setCommentLikes] = useState<Record<string, boolean>>({});
  const [commentReactions, setCommentReactions] = useState<Record<string, string | null>>({});
  const [commentReactionPicker, setCommentReactionPicker] = useState<string | null>(null); // commentId that has picker open
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMoreComments, setLoadingMoreComments] = useState(false);
  const [previewComments, setPreviewComments] = useState<Comment[]>([]);
  const commentReactionHideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [showReactorsModal, setShowReactorsModal] = useState(false);
  const [reactorFilter, setReactorFilter] = useState<string | null>(null); // null = all
  const [reactors, setReactors] = useState<
    { uid: string; displayName: string; photoURL: string | null; reaction: string }[]
  >([]);
  const [loadingReactors, setLoadingReactors] = useState(false);
  const [commentReactorsModal, setCommentReactorsModal] = useState<{
    commentId: string;
    reactions: Record<string, string>;
  } | null>(null);
  const [commentReactors, setCommentReactors] = useState<
    { uid: string; displayName: string; photoURL: string | null; reaction: string }[]
  >([]);
  const [loadingCommentReactors, setLoadingCommentReactors] = useState(false);
  const [commentReactorFilter, setCommentReactorFilter] = useState<string | null>(null);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [submittingReply, setSubmittingReply] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [contentExpanded, setContentExpanded] = useState(false);
  const CONTENT_COLLAPSE_LIMIT = 100; // chars before showing "Xem thêm"
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [reportingCommentId, setReportingCommentId] = useState<string | null>(null);
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportToast, setReportToast] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxCommentOpen, setLightboxCommentOpen] = useState(false);
  const [lightboxShowReactions, setLightboxShowReactions] = useState(false);
  const [pollData, setPollData] = useState(post.poll);
  const [votingOptionId, setVotingOptionId] = useState<string | null>(null);
  const lightboxCommentRef = useRef<HTMLTextAreaElement>(null);
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
      const response = await api.get<{
        comments: Comment[];
        nextCursor: string | null;
        total: number;
      }>(`/api/comments/${post.id}?limit=20`);
      setComments(response.comments || []);
      setNextCursor(response.nextCursor ?? null);
      setCommentCount(response.total ?? response.comments?.length ?? 0);
      const likes: Record<string, boolean> = {};
      const reactionsMap: Record<string, string | null> = {};
      response.comments?.forEach((comment) => {
        if (currentUserId) {
          likes[comment.id] = comment.likedBy?.includes(currentUserId) || false;
          reactionsMap[comment.id] = comment.reactions?.[currentUserId] ?? null;
        }
      });
      setCommentLikes(likes);
      setCommentReactions(reactionsMap);
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

  // Load preview comments (first 3) in feed view
  useEffect(() => {
    if (commentCount > 0) {
      void (async () => {
        try {
          const res = await api.get<{
            comments: Comment[];
            nextCursor: string | null;
            total: number;
          }>(`/api/comments/${post.id}?limit=3`);
          setPreviewComments((res.comments || []).slice(0, 3));
        } catch {
          // silently fail
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  const loadMoreComments = useCallback(async () => {
    if (!nextCursor || loadingMoreComments) return;
    try {
      setLoadingMoreComments(true);
      const response = await api.get<{
        comments: Comment[];
        nextCursor: string | null;
        total: number;
      }>(`/api/comments/${post.id}?limit=20&after=${nextCursor}`);
      const newComments = response.comments || [];
      setComments((prev) => [...prev, ...newComments]);
      setNextCursor(response.nextCursor ?? null);
      const newLikes: Record<string, boolean> = {};
      const newReactionMap: Record<string, string | null> = {};
      newComments.forEach((comment) => {
        if (currentUserId) {
          newLikes[comment.id] = comment.likedBy?.includes(currentUserId) || false;
          newReactionMap[comment.id] = comment.reactions?.[currentUserId] ?? null;
        }
      });
      setCommentLikes((prev) => ({ ...prev, ...newLikes }));
      setCommentReactions((prev) => ({ ...prev, ...newReactionMap }));
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMoreComments(false);
    }
  }, [post.id, nextCursor, loadingMoreComments, currentUserId]);

  // RT-3: join post room on mount, listen for reaction count updates in real-time
  useEffect(() => {
    const socket = getSocket();
    socket.emit('post:join', post.id);

    const handleReacted = (data: {
      postId: string;
      likeCount: number;
      reactions: Record<string, string>;
    }) => {
      if (data.postId !== post.id) return;
      setLikeCount(data.likeCount);
      setReactionsMap(data.reactions ?? {});
    };

    socket.on('post:reacted', handleReacted);
    return () => {
      socket.off('post:reacted', handleReacted);
      socket.emit('post:leave', post.id);
    };
  }, [post.id]);

  // RT-4: join post room and listen for new comments in real-time
  useEffect(() => {
    if (!showComments) return;
    const socket = getSocket();
    socket.emit('post:join', post.id);

    const handleNewComment = (comment: Comment) => {
      if ((comment as Comment & { postId?: string }).postId !== post.id) return;
      setComments((prev) => {
        if (prev.some((c) => c.id === comment.id)) return prev;
        return [...prev, comment];
      });
      setCommentCount((n) => n + 1);
    };

    socket.on('comment:new', handleNewComment);
    return () => {
      socket.off('comment:new', handleNewComment);
      // post:leave is managed by the RT-3 effect on unmount
    };
  }, [showComments, post.id]);

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
    if ((!markupToPlain(commentText).trim() && !commentMediaFile) || submittingComment) return;
    setCommentError(null);

    try {
      setSubmittingComment(true);
      let mediaUrl: string | undefined = undefined;
      if (commentMediaFile) {
        if (commentMediaFile.type.startsWith('video/')) {
          mediaUrl = await uploadVideo(commentMediaFile, { folder: 'surf/posts' });
        } else {
          mediaUrl = await uploadImage(commentMediaFile, { folder: 'surf/posts' });
        }
      }

      const mentions = extractMentions(commentText);
      console.log(`📤 Submitting comment to post ${post.id}:`, commentText.trim());
      const response = await api.post<Comment>(`/api/comments/${post.id}`, {
        content: commentText.trim(),
        mentions,
        mediaUrl,
      });
      console.log(`✅ Comment created:`, response);

      await loadComments();
      setCommentText('');
      setCommentMediaFile(null);
    } catch (error) {
      console.error('❌ Error submitting comment:', error);
      const msg = error instanceof Error ? error.message : '';
      setCommentError(msg || t('post_comment_policy'));
    } finally {
      setSubmittingComment(false);
    }
  };

  const top3Reactions = useMemo(() => {
    const freq: Record<string, number> = {};
    for (const v of Object.values(reactionsMap)) freq[v] = (freq[v] ?? 0) + 1;
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([emoji]) => emoji);
  }, [reactionsMap]);

  const openReactorsModal = async () => {
    setShowReactorsModal(true);
    setReactorFilter(null);
    setLoadingReactors(true);
    try {
      type Reactor = {
        uid: string;
        displayName: string;
        photoURL: string | null;
        reaction: string;
      };
      const data = (await api.get<Reactor[]>(`/api/posts/${post.id}/reactions`)) as Reactor[];
      setReactors(data);
    } catch (e) {
      console.error('Failed to load reactors', e);
    } finally {
      setLoadingReactors(false);
    }
  };

  const openCommentReactorsModal = async (commentId: string, reactions: Record<string, string>) => {
    setCommentReactorsModal({ commentId, reactions });
    setCommentReactorFilter(null);
    setLoadingCommentReactors(true);
    try {
      type Reactor = {
        uid: string;
        displayName: string;
        photoURL: string | null;
        reaction: string;
      };
      const data = await api.get<Reactor[]>(`/api/comments/${post.id}/${commentId}/reactions`);
      setCommentReactors(data);
    } catch (e) {
      console.error('Failed to load comment reactors', e);
    } finally {
      setLoadingCommentReactors(false);
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

  const handleEditComment = async (commentId: string) => {
    const trimmed = editingText.trim();
    if (!trimmed) return;
    try {
      await api.patch(`/api/comments/${post.id}/${commentId}`, { content: trimmed });
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? { ...c, content: trimmed, isEdited: true } : c))
      );
      setEditingCommentId(null);
      setEditingText('');
    } catch (error) {
      console.error('Error editing comment:', error);
    }
  };

  const handleReactComment = async (commentId: string, emoji: string) => {
    const prevLiked = commentLikes[commentId] || false;
    const prevReaction = commentReactions[commentId];
    const isSameReaction = prevLiked && prevReaction === emoji;
    const newLiked = !isSameReaction;

    // Optimistic update
    setCommentLikes((prev) => ({ ...prev, [commentId]: newLiked }));
    setCommentReactions((prev) => ({ ...prev, [commentId]: newLiked ? emoji : null }));
    setCommentReactionPicker(null);
    setComments((prev) =>
      prev.map((c) => {
        if (c.id !== commentId) return c;
        const delta = isSameReaction ? -1 : prevLiked ? 0 : 1;
        return {
          ...c,
          likeCount: Math.max(0, c.likeCount + delta),
          reactions: newLiked
            ? { ...(c.reactions ?? {}), [currentUserId ?? '']: emoji }
            : Object.fromEntries(
                Object.entries(c.reactions ?? {}).filter(([k]) => k !== currentUserId)
              ),
        };
      })
    );

    try {
      await api.post(`/api/comments/${post.id}/${commentId}/react`, { reaction: emoji });
    } catch {
      // Revert
      setCommentLikes((prev) => ({ ...prev, [commentId]: prevLiked }));
      setCommentReactions((prev) => ({ ...prev, [commentId]: prevReaction ?? null }));
      setComments((prev) =>
        prev.map((c) => {
          if (c.id !== commentId) return c;
          const delta = isSameReaction ? 1 : prevLiked ? 0 : -1;
          return { ...c, likeCount: Math.max(0, c.likeCount + delta) };
        })
      );
    }
  };

  const handleLikeComment = (commentId: string) => handleReactComment(commentId, '❤️');

  const handleSubmitReply = async (parentId: string) => {
    const markup = replyTexts[parentId] ?? '';
    const text = markupToPlain(markup).trim();
    if (!text || submittingReply === parentId) return;
    setSubmittingReply(parentId);
    try {
      const mentions = extractMentions(markup);
      await api.post<Comment>(`/api/comments/${post.id}`, {
        content: markup.trim(),
        mentions,
        parentId,
      });
      // Do NOT push to state here — the socket 'comment:new' event will add it (deduped)
      setReplyTexts((prev) => ({ ...prev, [parentId]: '' }));
      setReplyingToId(null);
      setExpandedReplies((prev) => ({ ...prev, [parentId]: true }));
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      setCommentError(msg || t('post_comment_policy'));
    } finally {
      setSubmittingReply(null);
    }
  };

  const handleVote = async (optionId: string) => {
    if (!currentUserId || votingOptionId || !pollData) return;
    setVotingOptionId(optionId);

    // optimistic update
    const newOptions = pollData.options.map((opt) => ({
      ...opt,
      votes: opt.votes
        .filter((v) => v !== currentUserId)
        .concat(opt.id === optionId ? [currentUserId] : []),
    }));
    setPollData({ ...pollData, options: newOptions });

    try {
      await api.post(`/api/posts/${post.id}/poll/${optionId}`);
    } catch {
      // revert on failure
      setPollData(post.poll);
    } finally {
      setVotingOptionId(null);
    }
  };

  const topLevelComments = useMemo(() => comments.filter((c) => !c.parentId), [comments]);

  const repliesMap = useMemo(() => {
    const map: Record<string, Comment[]> = {};
    comments
      .filter((c) => c.parentId)
      .forEach((c) => {
        if (!map[c.parentId!]) map[c.parentId!] = [];
        map[c.parentId!].push(c);
      });
    return map;
  }, [comments]);

  const reactions: Record<
    string,
    { label: string; color: string; bgColor: string; borderColor: string; shadowColor: string }
  > = {
    '❤️': {
      label: t('post_reaction_like'), // Update the label to use the t function
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'from-red-500/15 to-pink-500/15 hover:from-red-500/25 hover:to-pink-500/25',
      borderColor: 'border-red-200 dark:border-red-900/30',
      shadowColor: 'shadow-red-500/10',
    },
    '🌊': {
      label: t('post_reaction_wave'),
      color: 'text-cyan-600 dark:text-cyan-400',
      bgColor: 'from-cyan-500/15 to-blue-500/15 hover:from-cyan-500/25 hover:to-blue-500/25',
      borderColor: 'border-cyan-200 dark:border-cyan-900/30',
      shadowColor: 'shadow-cyan-500/10',
    },
    '😂': {
      label: t('post_reaction_haha'),
      color: 'text-yellow-600 dark:text-yellow-400',
      bgColor:
        'from-yellow-500/15 to-orange-500/15 hover:from-yellow-500/25 hover:to-orange-500/25',
      borderColor: 'border-yellow-200 dark:border-yellow-900/30',
      shadowColor: 'shadow-yellow-500/10',
    },
    '😮': {
      label: t('post_reaction_wow'),
      color: 'text-orange-600 dark:text-orange-400',
      bgColor: 'from-orange-500/15 to-amber-500/15 hover:from-orange-500/25 hover:to-amber-500/25',
      borderColor: 'border-orange-200 dark:border-orange-900/30',
      shadowColor: 'shadow-orange-500/10',
    },
    '😢': {
      label: t('post_reaction_sad'),
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'from-blue-500/15 to-indigo-500/15 hover:from-blue-500/25 hover:to-indigo-500/25',
      borderColor: 'border-blue-200 dark:border-blue-900/30',
      shadowColor: 'shadow-blue-500/10',
    },
    '👍': {
      label: t('post_reaction_cool'),
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
      if (!timestamp) return tf.justNow;

      let date: Date;
      if (
        typeof timestamp === 'object' &&
        timestamp !== null &&
        'toDate' in timestamp &&
        typeof (timestamp as { toDate: unknown }).toDate === 'function'
      ) {
        date = (timestamp as { toDate: () => Date }).toDate();
      } else if (typeof timestamp === 'object' && timestamp !== null && '_seconds' in timestamp) {
        date = new Date((timestamp as { _seconds: number })._seconds * 1000);
      } else if (typeof timestamp === 'object' && timestamp !== null && 'seconds' in timestamp) {
        date = new Date((timestamp as { seconds: number }).seconds * 1000);
      } else if (typeof timestamp === 'string' || typeof timestamp === 'number') {
        date = new Date(timestamp);
      } else if (timestamp instanceof Date) {
        date = timestamp;
      } else {
        return tf.justNow;
      }

      if (isNaN(date.getTime())) return tf.justNow;

      const now = new Date();
      const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

      if (diffInSeconds < 60) return tf.justNow;

      const diffInMinutes = Math.floor(diffInSeconds / 60);
      if (diffInMinutes < 60) return tf.minutesAgo(diffInMinutes);

      const diffInHours = Math.floor(diffInMinutes / 60);
      if (diffInHours < 24) return tf.hoursAgo(diffInHours);

      const diffInDays = Math.floor(diffInHours / 24);
      if (diffInDays < 7) return tf.daysAgo(diffInDays);

      const day = date.getDate();
      const month = date.getMonth() + 1;
      const year = date.getFullYear();
      const currentYear = now.getFullYear();
      if (year === currentYear) return tf.monthDay(day, month);
      return tf.monthDayYear(day, month, year);
    } catch (error) {
      console.error('Error formatting time:', error, timestamp);
      return tf.justNow;
    }
  };

  const handleLike = async () => {
    const newLiked = !isLiked;
    const prevReactionsMap = reactionsMap;
    setIsLiked(newLiked);
    setSelectedReaction(newLiked ? '❤️' : null);
    setLikeCount((c) => (newLiked ? c + 1 : c - 1));
    setReactionsMap((prev) => {
      const next = { ...prev };
      if (newLiked) {
        next[currentUserId ?? ''] = '❤️';
      } else {
        delete next[currentUserId ?? ''];
      }
      return next;
    });
    try {
      await api.post(`/api/posts/${post.id}/like`, { reaction: '❤️' });
    } catch {
      setIsLiked(!newLiked);
      setSelectedReaction(!newLiked ? '❤️' : null);
      setLikeCount((c) => (newLiked ? c - 1 : c + 1));
      setReactionsMap(prevReactionsMap);
    }
  };

  const handleReactionPick = async (emoji: string) => {
    const alreadyPicked = isLiked && selectedReaction === emoji;
    const newLiked = !alreadyPicked;
    const prevLiked = isLiked;
    const prevReaction = selectedReaction;
    const prevCount = likeCount;
    const prevReactionsMap = reactionsMap;
    setIsLiked(newLiked);
    setSelectedReaction(alreadyPicked ? null : emoji);
    setLikeCount((c) => (alreadyPicked ? c - 1 : prevLiked ? c : c + 1));
    setShowReactions(false);
    // Optimistically update reactionsMap so top3Reactions rerenders immediately
    setReactionsMap((prev) => {
      const next = { ...prev };
      if (newLiked) {
        next[currentUserId ?? ''] = emoji;
      } else {
        delete next[currentUserId ?? ''];
      }
      return next;
    });
    try {
      if (alreadyPicked) {
        await api.post(`/api/posts/${post.id}/like`, { reaction: emoji });
      } else if (!prevLiked) {
        await api.post(`/api/posts/${post.id}/like`, { reaction: emoji });
      } else {
        // switching reaction: remove old then add new
        await api.post(`/api/posts/${post.id}/like`, { reaction: prevReaction });
        await api.post(`/api/posts/${post.id}/like`, { reaction: emoji });
      }
    } catch {
      setIsLiked(prevLiked);
      setSelectedReaction(prevReaction);
      setLikeCount(prevCount);
      setReactionsMap(prevReactionsMap);
    }
  };

  const handleSharePost = async () => {
    if (sharingPost) return;
    try {
      setShareError(null);
      setSharingPost(true);
      const response = await api.post(`/api/posts/${post.id}/share`, {
        content: shareCaption.trim(),
        reaction: shareReaction ?? undefined,
      });
      setShareCount((c) => c + 1);
      setShowShareModal(false);
      setShareCaption('');
      setShareReaction(null);
      if (onPostCreated) {
        onPostCreated(response as unknown as PostCardProps['post']);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : t('post_share_error');
      setShareError(msg);
    } finally {
      setSharingPost(false);
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

  const handlePinToggle = async () => {
    try {
      const res = await api.patch<{ pinned: boolean }>(`/api/posts/${post.id}/pin`, {});
      setIsPinned(res.pinned);
      onPostUpdated?.({ ...post, pinnedAt: res.pinned ? new Date().toISOString() : null });
    } catch (err) {
      console.error('Pin toggle failed:', err);
    }
  };

  const handleReport = async () => {
    if (!reportReason || reportSubmitting) return;
    setReportSubmitting(true);
    try {
      const catLabel = REPORT_CATEGORIES.find((c) => c.key === reportReason)?.label || reportReason;
      const reasonText = reportDetails.trim() ? `${catLabel} - ${reportDetails.trim()}` : catLabel;

      if (reportingCommentId) {
        await api.post(`/api/comments/${post.id}/${reportingCommentId}/report`, {
          reason: reasonText,
        });
      } else {
        await api.post(`/api/posts/${post.id}/report`, {
          reason: reportReason,
          details: reportDetails.trim(),
        });
      }

      setShowReportModal(false);
      setReportReason('');
      setReportDetails('');
      setReportingCommentId(null);
      setReportToast(t('post_report_toast_ok'));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      setReportToast(
        msg.includes('đã báo cáo') ? t('post_report_toast_dup') : t('post_report_toast_err')
      );
    } finally {
      setReportSubmitting(false);
      setTimeout(() => setReportToast(null), 3000);
    }
  };

  const confirmDeletePost = async () => {
    setShowDeleteConfirm(false);
    try {
      await api.delete(`/api/posts/${post.id}`);
      setIsDeleted(true);
    } catch {
      alert(t('post_delete_error'));
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
  const renderedMediaUrls = hasMedia
    ? post.mediaUrls.map((url) => (isVideoUrl(url) ? url : optimizeImageUrl(url)))
    : [];
  const sharedRenderedMediaUrls = post.sharedFrom?.mediaUrls?.length
    ? post.sharedFrom.mediaUrls.map((url) => (isVideoUrl(url) ? url : optimizeImageUrl(url)))
    : [];

  // Sắp xếp lại: video lên trước (nếu có), ảnh theo sau — giữ nguyên thứ tự trong từng nhóm
  const displayMedia: { url: string; originalIndex: number }[] = hasMedia
    ? [
        ...renderedMediaUrls
          .map((url, i) => ({ url, originalIndex: i }))
          .filter((m) => isVideoUrl(m.url)),
        ...renderedMediaUrls
          .map((url, i) => ({ url, originalIndex: i }))
          .filter((m) => !isVideoUrl(m.url)),
      ]
    : [];

  return (
    <>
      {/* Edit post modal */}
      {showEditModal && (
        <EditPostModal
          post={{
            id: post.id,
            content: post.content,
            mediaUrls: post.mediaUrls,
            privacy: post.privacy,
            feeling: post.feeling,
            location: post.location,
            taggedFriends: post.taggedFriends,
            isEdited: post.isEdited,
          }}
          onClose={() => setShowEditModal(false)}
          onSaved={(updated) => {
            onPostUpdated?.(updated as PostCardProps['post']);
          }}
        />
      )}

      {/* Share post modal */}
      {showShareModal && (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setShowShareModal(false)}
        >
          <div
            className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700">
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
                {t('post_share_title')}
              </h3>
              <button
                onClick={() => setShowShareModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
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

            {/* Author row */}
            <div className="flex items-center gap-3 px-5 pt-4">
              <UserPresenceAvatar
                uid={user?.uid}
                name={user?.displayName ?? user?.email ?? t('post_you')}
                photoURL={user?.photoURL}
                imgClassName="w-10 h-10 rounded-full object-cover flex-shrink-0"
                fallbackClassName="w-10 h-10 rounded-full flex-shrink-0 bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center"
                fallbackTextClassName="text-sm font-bold text-white"
                presenceSize="sm"
              />
              <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                {user?.displayName ?? t('post_you')}
              </div>
            </div>

            {/* Caption input */}
            {shareError && (
              <div className="px-5 pt-3">
                <div className="rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-2 text-sm font-medium border border-red-100 dark:border-red-900/30">
                  {shareError}
                </div>
              </div>
            )}
            <div className="px-5 pt-3 pb-2">
              <textarea
                autoFocus
                value={shareCaption}
                onChange={(e) => setShareCaption(e.target.value)}
                placeholder={t('post_caption_placeholder')}
                rows={3}
                className="w-full resize-none bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-400 text-sm leading-relaxed outline-none"
              />
            </div>

            {/* Reaction picker */}
            {/* <div className="px-5 pb-3">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Cảm xúc của bạn:</p>
              <div className="flex gap-1.5 flex-wrap">
                {['❤️', '🌊', '😂', '😮', '😢', '👍'].map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => setShareReaction((prev) => prev === emoji ? null : emoji)}
                    className={`w-10 h-10 flex items-center justify-center text-xl rounded-full border-2 transition-all hover:scale-110 ${
                      shareReaction === emoji
                        ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/30 scale-110'
                        : 'border-gray-200 dark:border-slate-600 hover:border-gray-300'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div> */}

            {/* Original post preview */}
            <div className="mx-5 mb-4 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 dark:bg-slate-800/60">
                <div className="flex items-center gap-2 mb-1.5">
                  <UserPresenceAvatar
                    uid={post.authorId}
                    name={post.authorDisplayName}
                    photoURL={post.authorPhotoURL}
                    imgClassName="w-7 h-7 rounded-full object-cover"
                    fallbackClassName="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0"
                    fallbackTextClassName="text-xs font-bold text-white"
                    presenceSize="sm"
                  />
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {post.authorDisplayName}
                  </span>
                </div>
                {post.content && (
                  <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-3">
                    {renderPostContent(post.content, { maxLength: 200 })}
                  </p>
                )}
              </div>
              {post.mediaUrls?.length > 0 && (
                <div className="overflow-hidden" style={{ maxHeight: '160px' }}>
                  {isVideoUrl(renderedMediaUrls[0]) ? (
                    <video
                      src={renderedMediaUrls[0]}
                      className="w-full object-cover"
                      style={{ maxHeight: '160px' }}
                      muted
                      playsInline
                    />
                  ) : (
                    <img
                      src={renderedMediaUrls[0]}
                      alt="Preview"
                      className="w-full object-cover"
                      style={{ maxHeight: '160px' }}
                    />
                  )}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 px-5 pb-5">
              <button
                onClick={() => void handleCopyLink()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                {t('post_copy_link_short')}
              </button>
              <button
                onClick={() => void handleSharePost()}
                disabled={sharingPost}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sharingPost ? t('post_sharing') : t('post_share_now')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete → trash modal */}
      <Modal
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title={t('post_trash_title')}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {t('post_trash_desc')} <span className="font-semibold">{t('post_trash_days')}</span>{' '}
            {t('post_trash_permanent')}
          </p>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
            >
              {t('post_cancel')}
            </button>
            <button
              onClick={() => void confirmDeletePost()}
              className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-red-500 hover:bg-red-600 transition-colors"
            >
              {t('post_trash_btn')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Report post modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 p-4">
              <h2 className="text-xl font-bold text-slate-800 dark:text-white">
                {reportingCommentId
                  ? t('post_report_title') + ' bình luận'
                  : t('post_report_title')}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowReportModal(false);
                  setReportReason('');
                  setReportDetails('');
                  setReportingCommentId(null);
                }}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-white"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="p-4">
              <div className="mb-4 text-sm text-slate-600 dark:text-slate-300">
                {t('post_report_desc')}
              </div>
              <div className="mb-4 max-h-[250px] space-y-2 overflow-y-auto pr-2 custom-scrollbar">
                {REPORT_CATEGORIES.map((category) => (
                  <label
                    key={category.key}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-3 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <input
                      type="radio"
                      name="reportReason"
                      value={category.key}
                      checked={reportReason === category.key}
                      onChange={(e) => setReportReason(e.target.value)}
                      className="h-4 w-4 rounded-full border-slate-300 dark:border-slate-600 bg-transparent text-cyan-500 focus:ring-2 focus:ring-cyan-500 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-slate-900"
                    />
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {category.label}
                    </span>
                  </label>
                ))}
              </div>
              {reportReason && (
                <div className="mb-6">
                  <label className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-400">
                    Chi tiết bổ sung (không bắt buộc)
                  </label>
                  <textarea
                    value={reportDetails}
                    onChange={(e) => setReportDetails(e.target.value)}
                    placeholder="Vui lòng cung cấp thêm thông tin..."
                    className="h-20 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                  />
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowReportModal(false);
                    setReportReason('');
                    setReportDetails('');
                    setReportingCommentId(null);
                  }}
                  className="rounded-lg px-4 py-2 text-sm font-bold text-slate-600 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {t('post_cancel')}
                </button>
                <button
                  onClick={() => void handleReport()}
                  disabled={reportSubmitting || !reportReason}
                  className="rounded-lg bg-cyan-500 px-5 py-2 text-sm font-bold text-white transition hover:bg-cyan-600 disabled:opacity-50"
                >
                  {reportSubmitting ? t('post_submitting') : t('post_report_submit')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Report toast */}
      {reportToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[300] bg-gray-900/90 backdrop-blur-sm text-white text-sm px-5 py-2.5 rounded-full shadow-lg pointer-events-none whitespace-nowrap">
          {reportToast}
        </div>
      )}

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
        {/* Pinned post indicator */}
        {isPinned && !showComments && (
          <div className="flex items-center gap-1.5 px-4 pt-3 text-xs font-semibold text-cyan-600 dark:text-cyan-400">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5v6l1 1 1-1v-6h5v-2l-2-2z" />
            </svg>
            {t('post_pinned')}
          </div>
        )}
        {/* ── MEDIA HERO LAYOUT — kept as dead code; media now rendered inside card ── */}
        {/* eslint-disable-next-line no-constant-condition */}
        {false ? (
          <div className="relative overflow-hidden rounded-2xl">
            {/* overflow-hidden wrapper only around media images */}
            <div className="relative overflow-hidden rounded-2xl">
              {/* ── 1 image: full width, natural aspect ── */}
              {post.mediaUrls.length === 1 &&
                (isVideoUrl(displayMedia[0].url) ? (
                  <FeedVideo
                    src={displayMedia[0].url}
                    fill={false}
                    style={{ maxHeight: '520px' }}
                    onExpand={() => openLightbox(displayMedia[0].originalIndex)}
                  />
                ) : (
                  <img
                    src={displayMedia[0].url}
                    alt="Post media"
                    className="w-full block object-cover cursor-pointer"
                    style={{ maxHeight: '520px' }}
                    onClick={() => openLightbox(displayMedia[0].originalIndex)}
                  />
                ))}

              {/* ── 2 images: main (2/3) primary + secondary (1/3) ── */}
              {post.mediaUrls.length === 2 && (
                <div
                  className="grid gap-0.5"
                  style={{ gridTemplateColumns: '2fr 1fr', height: '360px' }}
                >
                  <div
                    className="overflow-hidden cursor-pointer"
                    onClick={() => openLightbox(displayMedia[0].originalIndex)}
                  >
                    {isVideoUrl(displayMedia[0].url) ? (
                      <FeedVideo
                        src={displayMedia[0].url}
                        onExpand={() => openLightbox(displayMedia[0].originalIndex)}
                      />
                    ) : (
                      <img
                        src={displayMedia[0].url}
                        alt="Post media 1"
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div
                    className="overflow-hidden cursor-pointer"
                    onClick={() => openLightbox(displayMedia[1].originalIndex)}
                  >
                    {isVideoUrl(displayMedia[1].url) ? (
                      <FeedVideo
                        src={displayMedia[1].url}
                        onExpand={() => openLightbox(displayMedia[1].originalIndex)}
                      />
                    ) : (
                      <img
                        src={displayMedia[1].url}
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
                    onClick={() => openLightbox(displayMedia[0].originalIndex)}
                  >
                    {isVideoUrl(displayMedia[0].url) ? (
                      <FeedVideo
                        src={displayMedia[0].url}
                        onExpand={() => openLightbox(displayMedia[0].originalIndex)}
                      />
                    ) : (
                      <img
                        src={displayMedia[0].url}
                        alt="Post media 1"
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div
                    className="overflow-hidden cursor-pointer"
                    onClick={() => openLightbox(displayMedia[1].originalIndex)}
                  >
                    {isVideoUrl(displayMedia[1].url) ? (
                      <FeedVideo
                        src={displayMedia[1].url}
                        onExpand={() => openLightbox(displayMedia[1].originalIndex)}
                      />
                    ) : (
                      <img
                        src={displayMedia[1].url}
                        alt="Post media 2"
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div
                    className="overflow-hidden cursor-pointer"
                    onClick={() => openLightbox(displayMedia[2].originalIndex)}
                  >
                    {isVideoUrl(displayMedia[2].url) ? (
                      <FeedVideo
                        src={displayMedia[2].url}
                        onExpand={() => openLightbox(displayMedia[2].originalIndex)}
                      />
                    ) : (
                      <img
                        src={displayMedia[2].url}
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
                    onClick={() => openLightbox(displayMedia[0].originalIndex)}
                  >
                    {isVideoUrl(displayMedia[0].url) ? (
                      <FeedVideo
                        src={displayMedia[0].url}
                        onExpand={() => openLightbox(displayMedia[0].originalIndex)}
                      />
                    ) : (
                      <img
                        src={displayMedia[0].url}
                        alt="Post media 1"
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  {/* All secondaries — equal-width flex strip, scrolls if too many */}
                  <div className="flex gap-0.5 overflow-x-auto" style={{ height: '90px' }}>
                    {displayMedia.slice(1).map((m, i) => (
                      <div
                        key={i}
                        className="flex-none overflow-hidden cursor-pointer"
                        style={{
                          width: `calc((100% - ${(post.mediaUrls.length - 2) * 2}px) / ${post.mediaUrls.length - 1})`,
                          minWidth: '60px',
                        }}
                        onClick={() => openLightbox(m.originalIndex)}
                      >
                        {isVideoUrl(m.url) ? (
                          <FeedVideo src={m.url} onExpand={() => openLightbox(m.originalIndex)} />
                        ) : (
                          <img
                            src={m.url}
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
                      {t('post_copy_link')}
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
                        {t('post_trash_btn')}
                      </button>
                    )}
                    {currentUserId !== post.authorId && (
                      <button
                        onClick={() => {
                          setShowReportModal(true);
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
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                          />
                        </svg>
                        {t('post_report_title')}
                      </button>
                    )}
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
                      ? renderPostContent(post.content)
                      : renderPostContent(post.content, { maxLength: CONTENT_COLLAPSE_LIMIT })}
                  </p>
                  {post.content.length > CONTENT_COLLAPSE_LIMIT && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setContentExpanded((v) => !v);
                      }}
                      className="text-white/60 text-xs hover:text-white mt-0.5 transition-colors"
                    >
                      {contentExpanded ? t('post_see_less') : t('post_see_more')}
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
                  <UserPresenceAvatar
                    uid={post.authorId}
                    name={post.authorDisplayName}
                    photoURL={post.authorPhotoURL}
                    imgClassName="w-9 h-9 rounded-full ring-2 ring-white/50 object-cover"
                    fallbackClassName="w-9 h-9 rounded-full ring-2 ring-white/50 bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center"
                    fallbackTextClassName="text-sm font-bold text-white"
                    presenceSize="sm"
                  />
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
                        {t('post_with')}{' '}
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
                  {commentCount} {t('post_comments_label')}
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
              {post.group ? (
                // --- Group Post Header (Facebook style) ---
                <div
                  className="relative flex-shrink-0 mt-0.5 mr-1"
                  onClick={() => navigate(`/feed/groups/${post.group!.id}`)}
                >
                  {/* Group Cover */}
                  {post.group.coverImageUrl ? (
                    <img
                      src={post.group.coverImageUrl}
                      alt={post.group.name}
                      className="w-11 h-11 rounded-lg object-cover cursor-pointer hover:opacity-90 ring-1 ring-black/5 dark:ring-white/10"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center cursor-pointer hover:opacity-90 ring-1 ring-black/5 dark:ring-white/10">
                      <span className="text-lg font-bold text-white">
                        {post.group.name[0].toUpperCase()}
                      </span>
                    </div>
                  )}
                  {/* Overlaid Author Avatar */}
                  {post.isAnonymous ? (
                    <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full ring-2 ring-white dark:ring-slate-800 bg-slate-200 dark:bg-slate-700 flex items-center justify-center shadow-md">
                      <span className="text-[10px]">🕵️</span>
                    </div>
                  ) : post.authorPhotoURL ? (
                    <img
                      src={post.authorPhotoURL}
                      className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full ring-2 ring-white dark:ring-slate-800 object-cover cursor-pointer hover:opacity-90 shadow-md"
                      onClick={(e) => {
                        e.stopPropagation();
                        goToProfile(post.authorId);
                      }}
                      alt={post.authorDisplayName}
                    />
                  ) : (
                    <div
                      className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full ring-2 ring-white dark:ring-slate-800 bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center cursor-pointer hover:opacity-90 shadow-md"
                      onClick={(e) => {
                        e.stopPropagation();
                        goToProfile(post.authorId);
                      }}
                    >
                      <span className="text-[10px] font-bold text-white uppercase">
                        {(post.authorDisplayName || 'U')[0]}
                      </span>
                    </div>
                  )}
                </div>
              ) : post.isAnonymous ? (
                // --- Anonymous User Header ---
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-full ring-2 ring-white dark:ring-slate-800 shadow-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                    <span className="text-lg font-bold text-white">🕵️</span>
                  </div>
                </div>
              ) : (
                // --- Normal User Header (with presence badge) ---
                <div
                  onClick={() => goToProfile(post.authorId)}
                  className="cursor-pointer flex-shrink-0"
                >
                  <UserPresenceAvatar
                    uid={post.authorId}
                    name={post.authorDisplayName}
                    photoURL={post.authorPhotoURL}
                    imgClassName="w-12 h-12 rounded-full ring-2 ring-white dark:ring-slate-800 shadow-lg object-cover hover:scale-105 transition-transform"
                    fallbackClassName="w-12 h-12 rounded-full ring-2 ring-white dark:ring-slate-800 shadow-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center hover:scale-105 transition-transform"
                    fallbackTextClassName="text-lg font-bold text-white"
                    presenceSize="sm"
                  />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="text-sm leading-relaxed mb-1">
                  {post.group ? (
                    <>
                      <h3
                        onClick={() => navigate(`/feed/groups/${post.group!.id}`)}
                        className="inline font-bold text-gray-900 dark:text-gray-100 hover:underline cursor-pointer"
                      >
                        {post.group.name}
                      </h3>
                      <div className="block" />
                      <span
                        onClick={() => goToProfile(post.authorId)}
                        className={`font-semibold ${!post.isAnonymous ? 'hover:underline cursor-pointer text-gray-700 dark:text-gray-300' : 'text-gray-500'}`}
                      >
                        {post.isAnonymous
                          ? currentUserId === post.authorId
                            ? t('post_anon_you')
                            : t('post_anon_user')
                          : post.authorDisplayName}
                      </span>
                      {post.sharedFrom && (
                        <span className="text-gray-600 dark:text-gray-400">
                          {' '}
                          {t('post_shared_from')}{' '}
                          <span
                            onClick={() => goToProfile(post.sharedFrom!.authorId)}
                            className="font-semibold text-gray-700 dark:text-gray-300 hover:underline cursor-pointer"
                          >
                            {post.sharedFrom.authorDisplayName}
                          </span>
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <h3
                        onClick={() => goToProfile(post.authorId)}
                        className={`inline font-bold text-gray-900 dark:text-gray-100 ${post.isAnonymous ? '' : 'hover:text-cyan-600 dark:hover:text-cyan-400 cursor-pointer transition-colors'}`}
                      >
                        {post.isAnonymous
                          ? currentUserId === post.authorId
                            ? t('post_anon_you')
                            : t('post_anon_user')
                          : post.authorDisplayName}
                      </h3>
                      {post.sharedFrom && (
                        <span className="text-gray-600 dark:text-gray-400">
                          {' '}
                          {t('post_shared_from')}{' '}
                          <span
                            onClick={() => goToProfile(post.sharedFrom!.authorId)}
                            className="font-bold text-gray-900 dark:text-gray-100 hover:text-cyan-600 dark:hover:text-cyan-400 cursor-pointer transition-colors"
                          >
                            {post.sharedFrom.authorDisplayName}
                          </span>
                        </span>
                      )}
                    </>
                  )}
                  {post.feeling && (
                    <span className="text-gray-600 dark:text-gray-400">
                      {' '}
                      {t('post_feeling')} <span className="font-medium">{post.feeling}</span>
                    </span>
                  )}
                  {post.taggedFriends && post.taggedFriends.length > 0 && (
                    <span className="text-gray-600 dark:text-gray-400">
                      {' '}
                      {t('post_with')}{' '}
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
                      {t('post_at')} <span className="font-medium">📍 {post.location}</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span>{formatTime(post.createdAt)}</span>
                  <span>•</span>
                  <span className="flex items-center gap-1">{getPrivacyIcon()}</span>
                  {post.isEdited && (
                    <>
                      <span>•</span>
                      <span className="italic">{t('post_editing')}</span>
                    </>
                  )}
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
                      {t(isSaved ? 'post_unsave' : 'post_save')}
                    </button>
                    <hr className="my-2 border-gray-200 dark:border-slate-700" />
                    {currentUserId === post.authorId && (
                      <button
                        onClick={() => {
                          setShowEditModal(true);
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
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                        {t('post_edit')}
                      </button>
                    )}
                    {showPinOption && currentUserId === post.authorId && (
                      <button
                        onClick={() => {
                          void handlePinToggle();
                          setShowOptions(false);
                        }}
                        className="w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700/50 flex items-center gap-3"
                      >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5v6l1 1 1-1v-6h5v-2l-2-2z" />
                        </svg>
                        {t(isPinned ? 'post_unpin' : 'post_pin')}
                      </button>
                    )}
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
                        {t('post_delete')}
                      </button>
                    )}
                    {currentUserId !== post.authorId && (
                      <button
                        onClick={() => {
                          setShowReportModal(true);
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
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                          />
                        </svg>
                        {t('post_report_title')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Content */}
            {post.content && (
              <div className="mb-3">
                <p className="text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap text-[15px]">
                  {contentExpanded || post.content.length <= CONTENT_COLLAPSE_LIMIT
                    ? renderPostContent(post.content)
                    : renderPostContent(post.content, { maxLength: CONTENT_COLLAPSE_LIMIT })}
                </p>
                {post.content.length > CONTENT_COLLAPSE_LIMIT && (
                  <button
                    onClick={() => setContentExpanded((v) => !v)}
                    className="text-gray-500 dark:text-gray-400 text-sm hover:text-gray-700 dark:hover:text-gray-200 mt-0.5 transition-colors"
                  >
                    {contentExpanded ? t('post_see_less') : t('post_see_more')}
                  </button>
                )}
              </div>
            )}

            {/* Poll */}
            {pollData && pollData.options && (
              <div className="mb-4">
                {pollData.options.map((opt) => {
                  const totalVotes = pollData.options.reduce(
                    (sum, o) => sum + (o.votes?.length || 0),
                    0
                  );
                  const myVote = opt.votes?.includes(currentUserId || '');
                  const percent =
                    totalVotes > 0 ? ((opt.votes?.length || 0) / totalVotes) * 100 : 0;

                  return (
                    <button
                      key={opt.id}
                      onClick={() => handleVote(opt.id)}
                      disabled={votingOptionId === opt.id}
                      className="relative w-full text-left p-3 border border-gray-200 dark:border-slate-700 rounded-xl mb-2 overflow-hidden flex justify-between items-center group transition"
                    >
                      <div
                        className="absolute top-0 left-0 bottom-0 bg-cyan-100 dark:bg-cyan-900/30 transition-all z-0"
                        style={{ width: `${percent}%` }}
                      />
                      <span className="relative z-10 font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <div
                          className={`w-4 h-4 flex-shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${myVote ? 'border-cyan-500 bg-cyan-500' : 'border-gray-300 dark:border-slate-600'}`}
                        >
                          {myVote && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                        </div>
                        {opt.text}
                      </span>
                      <span className="relative z-10 text-xs text-slate-500 font-bold">
                        {opt.votes?.length || 0} {t('post_votes')}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Shared post embed */}
            {post.sharedFrom && (
              <div className="mb-4 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
                <div className="px-4 pt-3 pb-2 bg-gray-50 dark:bg-slate-800/60">
                  <div className="flex items-center gap-2 mb-2">
                    {post.sharedFrom.authorPhotoURL ? (
                      <img
                        src={optimizeImageUrl(post.sharedFrom.authorPhotoURL)}
                        alt={post.sharedFrom.authorDisplayName}
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-white">
                          {(post.sharedFrom.authorDisplayName?.[0] ?? 'U').toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div
                        onClick={() => goToProfile(post.sharedFrom!.authorId)}
                        className="text-sm font-semibold text-gray-900 dark:text-gray-100 cursor-pointer hover:underline truncate"
                      >
                        {post.sharedFrom.authorDisplayName}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {formatTime(post.sharedFrom.createdAt)}
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`/feed/post/${post.sharedFrom!.id}`)}
                      className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-full bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 hover:bg-cyan-100 dark:hover:bg-cyan-900/50 transition-colors whitespace-nowrap"
                    >
                      {t('post_view_original')}
                    </button>
                  </div>
                  {post.sharedFrom.content && (
                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                      {post.sharedFrom.content}
                    </p>
                  )}
                </div>
                {post.sharedFrom.mediaUrls?.length > 0 && (
                  <div className="overflow-hidden max-h-56">
                    {isVideoUrl(sharedRenderedMediaUrls[0]) ? (
                      <video
                        src={sharedRenderedMediaUrls[0]}
                        className="w-full object-cover"
                        style={{ maxHeight: '224px' }}
                        muted
                        playsInline
                      />
                    ) : (
                      <img
                        src={sharedRenderedMediaUrls[0]}
                        alt="Shared media"
                        className="w-full object-cover"
                        style={{ maxHeight: '224px' }}
                      />
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Media — edge-to-edge inside card */}
            {hasMedia && (
              <div className="-mx-5 sm:-mx-6 mb-4 overflow-hidden">
                {renderedMediaUrls.length === 1 &&
                  (isVideoUrl(renderedMediaUrls[0]) ? (
                    <FeedVideo
                      src={renderedMediaUrls[0]}
                      fill={false}
                      onExpand={() => openLightbox(0)}
                    />
                  ) : (
                    <img
                      src={renderedMediaUrls[0]}
                      alt="Post media"
                      className="w-full block object-cover cursor-pointer"
                      style={{ maxHeight: '520px' }}
                      onClick={() => openLightbox(0)}
                    />
                  ))}
                {renderedMediaUrls.length === 2 && (
                  <div
                    className="grid gap-0.5"
                    style={{ gridTemplateColumns: '2fr 1fr', height: '360px' }}
                  >
                    <div className="overflow-hidden cursor-pointer" onClick={() => openLightbox(0)}>
                      {isVideoUrl(renderedMediaUrls[0]) ? (
                        <FeedVideo src={renderedMediaUrls[0]} onExpand={() => openLightbox(0)} />
                      ) : (
                        <img
                          src={renderedMediaUrls[0]}
                          alt="Post media 1"
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="overflow-hidden cursor-pointer" onClick={() => openLightbox(1)}>
                      {isVideoUrl(renderedMediaUrls[1]) ? (
                        <FeedVideo src={renderedMediaUrls[1]} onExpand={() => openLightbox(1)} />
                      ) : (
                        <img
                          src={renderedMediaUrls[1]}
                          alt="Post media 2"
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                  </div>
                )}
                {renderedMediaUrls.length === 3 && (
                  <div className="grid grid-cols-2 grid-rows-2 gap-0.5" style={{ height: '420px' }}>
                    <div
                      className="overflow-hidden row-span-2 cursor-pointer"
                      onClick={() => openLightbox(0)}
                    >
                      {isVideoUrl(renderedMediaUrls[0]) ? (
                        <FeedVideo src={renderedMediaUrls[0]} onExpand={() => openLightbox(0)} />
                      ) : (
                        <img
                          src={renderedMediaUrls[0]}
                          alt="Post media 1"
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="overflow-hidden cursor-pointer" onClick={() => openLightbox(1)}>
                      {isVideoUrl(renderedMediaUrls[1]) ? (
                        <FeedVideo src={renderedMediaUrls[1]} onExpand={() => openLightbox(1)} />
                      ) : (
                        <img
                          src={renderedMediaUrls[1]}
                          alt="Post media 2"
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="overflow-hidden cursor-pointer" onClick={() => openLightbox(2)}>
                      {isVideoUrl(renderedMediaUrls[2]) ? (
                        <FeedVideo src={renderedMediaUrls[2]} onExpand={() => openLightbox(2)} />
                      ) : (
                        <img
                          src={renderedMediaUrls[2]}
                          alt="Post media 3"
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                  </div>
                )}
                {renderedMediaUrls.length >= 4 && (
                  <div className="flex flex-col gap-0.5">
                    <div
                      className="overflow-hidden cursor-pointer"
                      style={{ height: '260px' }}
                      onClick={() => openLightbox(0)}
                    >
                      {isVideoUrl(renderedMediaUrls[0]) ? (
                        <FeedVideo src={renderedMediaUrls[0]} onExpand={() => openLightbox(0)} />
                      ) : (
                        <img
                          src={renderedMediaUrls[0]}
                          alt="Post media 1"
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="flex gap-0.5 overflow-x-auto" style={{ height: '90px' }}>
                      {renderedMediaUrls.slice(1).map((url, i) => (
                        <div
                          key={i}
                          className="flex-none overflow-hidden cursor-pointer"
                          style={{
                            width: `calc((100% - ${(renderedMediaUrls.length - 2) * 2}px) / ${renderedMediaUrls.length - 1})`,
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
            {(likeCount > 0 || commentCount > 0 || shareCount > 0) && (
              <div className="flex items-center justify-between py-3 mb-3 border-b border-gray-200 dark:border-slate-700/50">
                {likeCount > 0 && (
                  <button
                    onClick={openReactorsModal}
                    className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
                  >
                    {top3Reactions.map((e) => (
                      <span key={e}>{e}</span>
                    ))}
                    <span className="font-medium">{likeCount}</span>
                  </button>
                )}
                <div className="flex items-center gap-3 ml-auto text-sm text-gray-500 dark:text-gray-400">
                  {commentCount > 0 && (
                    <button
                      onClick={() => setShowComments(!showComments)}
                      className="hover:underline"
                    >
                      {commentCount} {t('post_comments_label')}
                    </button>
                  )}
                  {shareCount > 0 && (
                    <span>
                      {shareCount} {t('post_shares_label')}
                    </span>
                  )}
                </div>
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
                <span>
                  {t('post_comment_btn')}
                  {commentCount > 0 ? ` (${commentCount})` : ''}
                </span>
              </button>

              {/* Share */}
              <div className="relative flex-1" ref={shareRef}>
                <button
                  onClick={() => {
                    setShowShareModal(true);
                    setShowShareMenu(false);
                  }}
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
                  <span>
                    {t('post_share_btn')}
                    {shareCount > 0 ? ` (${shareCount})` : ''}
                  </span>
                </button>
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

            {/* In-feed comment preview — first 3 comments, read-only */}
            {!showComments && previewComments.length > 0 && (
              <div className="mt-3 space-y-2">
                {previewComments.map((comment) => (
                  <div key={comment.id} className="flex gap-2 items-start">
                    <UserPresenceAvatar
                      uid={comment.authorId}
                      name={comment.authorDisplayName}
                      photoURL={comment.authorPhotoURL}
                      imgClassName="w-7 h-7 rounded-full flex-shrink-0 object-cover"
                      fallbackClassName="w-7 h-7 rounded-full flex-shrink-0 bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center"
                      fallbackTextClassName="text-xs font-bold text-white"
                      presenceSize="sm"
                    />
                    <div
                      className="bg-gray-100 dark:bg-slate-800/60 rounded-2xl px-3 py-2 flex-1 min-w-0 cursor-pointer hover:bg-gray-200 dark:hover:bg-slate-700/60 transition-colors"
                      onClick={() => setShowComments(true)}
                    >
                      <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                        {comment.authorDisplayName}
                      </span>
                      <p className="text-sm text-gray-800 dark:text-gray-200 mt-0.5 break-words">
                        {renderCommentContent(comment.content)}
                        {comment.mediaUrl && (
                          <span className="block mt-1.5 text-cyan-600 text-xs italic">
                            [Media attachment]
                          </span>
                        )}
                      </p>
                      {comment.likeCount > 0 && (
                        <span className="text-xs text-gray-400 flex items-center gap-0.5 mt-1">
                          {(() => {
                            const vals = Object.values(comment.reactions ?? {});
                            const freq: Record<string, number> = {};
                            for (const v of vals) freq[v] = (freq[v] ?? 0) + 1;
                            const top3 = Object.entries(freq)
                              .sort((a, b) => b[1] - a[1])
                              .slice(0, 3)
                              .map(([e]) => e);
                            if (top3.length === 0) top3.push('❤️');
                            return (
                              <>
                                {top3.map((e) => (
                                  <span key={e}>{e}</span>
                                ))}{' '}
                                {comment.likeCount}
                              </>
                            );
                          })()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {commentCount > previewComments.length && (
                  <button
                    onClick={() => setShowComments(true)}
                    className="text-sm text-gray-500 dark:text-gray-400 hover:text-cyan-600 dark:hover:text-cyan-400 font-medium transition-colors"
                  >
                    {t('post_see_all_comments')} {commentCount} {t('post_comments_label')}
                  </button>
                )}
              </div>
            )}

            {/* Comments Section */}
            {showComments && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700/50">
                {loadingComments ? (
                  <div className="text-center py-4">
                    <div className="inline-block w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                ) : comments.length === 0 ? (
                  <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                    {t('post_no_comments')}
                  </div>
                ) : (
                  <div className="space-y-3 mb-4">
                    {topLevelComments.map((comment) => (
                      <div key={comment.id} className="flex gap-2">
                        <div
                          className="cursor-pointer"
                          onClick={() => goToProfile(comment.authorId)}
                        >
                          <UserPresenceAvatar
                            uid={comment.authorId}
                            name={comment.authorDisplayName}
                            photoURL={comment.authorPhotoURL}
                            imgClassName="w-8 h-8 rounded-full flex-shrink-0 object-cover"
                            fallbackClassName="w-8 h-8 rounded-full flex-shrink-0 bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center"
                            fallbackTextClassName="text-xs font-bold text-white"
                            presenceSize="sm"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          {editingCommentId === comment.id ? (
                            <div className="flex gap-2 items-center">
                              <input
                                autoFocus
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') void handleEditComment(comment.id);
                                  if (e.key === 'Escape') {
                                    setEditingCommentId(null);
                                    setEditingText('');
                                  }
                                }}
                                className="flex-1 bg-gray-100 dark:bg-slate-800/60 rounded-2xl px-3 py-2 text-sm text-gray-800 dark:text-gray-200 outline-none"
                              />
                              <button
                                onClick={() => void handleEditComment(comment.id)}
                                className="text-xs text-cyan-600 dark:text-cyan-400 font-semibold hover:underline"
                              >
                                {t('post_send')}
                              </button>
                              <button
                                onClick={() => {
                                  setEditingCommentId(null);
                                  setEditingText('');
                                }}
                                className="text-xs text-gray-400 hover:underline"
                              >
                                {t('post_cancel')}
                              </button>
                            </div>
                          ) : (
                            <div className="bg-gray-100 dark:bg-slate-800/60 rounded-2xl px-3 py-2">
                              <div
                                className="font-semibold text-sm text-gray-900 dark:text-gray-100 cursor-pointer hover:underline w-fit"
                                onClick={() => goToProfile(comment.authorId)}
                              >
                                {comment.authorDisplayName}
                              </div>
                              <div className="text-sm text-gray-800 dark:text-gray-200 mt-0.5">
                                {renderCommentContent(comment.content)}
                                {comment.mediaUrl && (
                                  <div className="mt-2">
                                    {isVideoUrl(comment.mediaUrl) ? (
                                      <video
                                        src={comment.mediaUrl}
                                        controls
                                        className="max-h-40 rounded-lg"
                                      />
                                    ) : (
                                      <img
                                        src={optimizeImageUrl(comment.mediaUrl)}
                                        alt="media"
                                        className="max-h-40 rounded-lg object-contain bg-black/5"
                                      />
                                    )}
                                  </div>
                                )}
                                {comment.isEdited && (
                                  <span className="ml-1 text-xs text-gray-400 font-normal">
                                    • {t('post_editing')}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                          <div className="flex items-center gap-4 mt-1 px-3 text-xs font-semibold">
                            {/* Reaction button with emoji picker */}
                            <div className="relative">
                              <button
                                onMouseEnter={() => {
                                  if (commentReactionHideTimeout.current)
                                    clearTimeout(commentReactionHideTimeout.current);
                                  setCommentReactionPicker(comment.id);
                                }}
                                onMouseLeave={() => {
                                  commentReactionHideTimeout.current = setTimeout(
                                    () => setCommentReactionPicker(null),
                                    300
                                  );
                                }}
                                onClick={() => handleLikeComment(comment.id)}
                                className={`hover:underline ${commentLikes[comment.id] ? 'text-cyan-600 dark:text-cyan-400' : 'text-gray-600 dark:text-gray-400'}`}
                              >
                                {commentLikes[comment.id] && commentReactions[comment.id]
                                  ? commentReactions[comment.id]
                                  : t('post_like_comment')}
                              </button>
                              {commentReactionPicker === comment.id && (
                                <div
                                  className="absolute bottom-full left-0 mb-1 z-30"
                                  onMouseEnter={() => {
                                    if (commentReactionHideTimeout.current)
                                      clearTimeout(commentReactionHideTimeout.current);
                                    setCommentReactionPicker(comment.id);
                                  }}
                                  onMouseLeave={() => {
                                    commentReactionHideTimeout.current = setTimeout(
                                      () => setCommentReactionPicker(null),
                                      300
                                    );
                                  }}
                                >
                                  <div className="bg-white dark:bg-slate-800 rounded-full shadow-2xl border border-gray-200 dark:border-slate-700 p-1.5 flex gap-0.5">
                                    {['❤️', '🌊', '😂', '😮', '😢', '👍'].map((emoji) => (
                                      <button
                                        key={emoji}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          void handleReactComment(comment.id, emoji);
                                        }}
                                        className="w-8 h-8 flex items-center justify-center text-lg transition-all hover:scale-150 hover:-translate-y-1 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700"
                                      >
                                        {emoji}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                            <button
                              className="text-gray-600 dark:text-gray-400 hover:underline"
                              onClick={() => {
                                setReplyingToId(replyingToId === comment.id ? null : comment.id);
                                if (replyingToId !== comment.id) {
                                  setReplyTexts((p) => ({
                                    ...p,
                                    [comment.id]: `@[${comment.authorDisplayName}](${comment.authorId}) `,
                                  }));
                                }
                              }}
                            >
                              {t('post_reply')}
                            </button>
                            <span className="text-gray-500 font-normal">
                              {comment.createdAt && formatTime(comment.createdAt)}
                            </span>
                            {comment.likeCount > 0 && (
                              <button
                                onClick={() =>
                                  void openCommentReactorsModal(comment.id, comment.reactions ?? {})
                                }
                                className="text-gray-500 font-normal flex items-center gap-0.5 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
                              >
                                {(() => {
                                  const reactionVals = Object.values(comment.reactions ?? {});
                                  const freq: Record<string, number> = {};
                                  for (const v of reactionVals) freq[v] = (freq[v] ?? 0) + 1;
                                  const top3 = Object.entries(freq)
                                    .sort((a, b) => b[1] - a[1])
                                    .slice(0, 3)
                                    .map(([e]) => e);
                                  if (top3.length === 0) top3.push('❤️');
                                  return (
                                    <>
                                      {top3.map((e) => (
                                        <span key={e}>{e}</span>
                                      ))}{' '}
                                      {comment.likeCount}
                                    </>
                                  );
                                })()}
                              </button>
                            )}
                            {currentUserId === comment.authorId && (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingCommentId(comment.id);
                                    setEditingText(comment.content);
                                  }}
                                  className="text-gray-400 hover:text-cyan-600 hover:underline"
                                >
                                  {t('post_edit')}
                                </button>
                                <button
                                  onClick={() => handleDeleteComment(comment.id)}
                                  className="text-gray-400 hover:text-red-600 hover:underline ml-auto"
                                >
                                  {t('post_delete_comment')}
                                </button>
                              </>
                            )}
                            {currentUserId !== comment.authorId && (
                              <button
                                onClick={() => {
                                  setReportingCommentId(comment.id);
                                  setShowReportModal(true);
                                }}
                                className="text-gray-400 hover:text-red-500 hover:underline ml-auto"
                              >
                                Báo cáo
                              </button>
                            )}
                          </div>
                          {/* Replies */}
                          {(repliesMap[comment.id]?.length > 0 || replyingToId === comment.id) && (
                            <div className="mt-2 ml-10 space-y-2">
                              {repliesMap[comment.id]?.length > 0 && (
                                <button
                                  onClick={() =>
                                    setExpandedReplies((p) => ({
                                      ...p,
                                      [comment.id]: !p[comment.id],
                                    }))
                                  }
                                  className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 flex items-center gap-1 hover:underline"
                                >
                                  <svg
                                    className={`w-3.5 h-3.5 transition-transform ${expandedReplies[comment.id] ? 'rotate-90' : ''}`}
                                    fill="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
                                  </svg>
                                  {expandedReplies[comment.id]
                                    ? t('post_hide_replies')
                                    : `${t('post_view_replies')} ${repliesMap[comment.id].length} ${t('post_replies_label')}`}
                                </button>
                              )}
                              {expandedReplies[comment.id] &&
                                repliesMap[comment.id]?.map((reply) => (
                                  <div key={reply.id} className="flex gap-2">
                                    <div
                                      className="cursor-pointer"
                                      onClick={() => goToProfile(reply.authorId)}
                                    >
                                      <UserPresenceAvatar
                                        uid={reply.authorId}
                                        name={reply.authorDisplayName}
                                        photoURL={reply.authorPhotoURL}
                                        imgClassName="w-6 h-6 rounded-full flex-shrink-0 object-cover"
                                        fallbackClassName="w-6 h-6 rounded-full flex-shrink-0 bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center"
                                        fallbackTextClassName="text-[10px] font-bold text-white"
                                        presenceSize="sm"
                                      />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="bg-gray-100 dark:bg-slate-800/60 rounded-2xl px-3 py-1.5">
                                        <div
                                          className="font-semibold text-xs text-gray-900 dark:text-gray-100 cursor-pointer hover:underline w-fit"
                                          onClick={() => goToProfile(reply.authorId)}
                                        >
                                          {reply.authorDisplayName}
                                        </div>
                                        <div className="text-xs text-gray-800 dark:text-gray-200 mt-0.5">
                                          {renderCommentContent(reply.content)}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-3 mt-0.5 px-2 text-[11px] font-semibold text-gray-500">
                                        <span>
                                          {reply.createdAt && formatTime(reply.createdAt)}
                                        </span>
                                        <button
                                          className="text-gray-600 dark:text-gray-400 hover:underline"
                                          onClick={() => {
                                            setReplyingToId(comment.id);
                                            setReplyTexts((p) => ({
                                              ...p,
                                              [comment.id]: `@[${reply.authorDisplayName}](${reply.authorId}) `,
                                            }));
                                          }}
                                        >
                                          {t('post_reply')}
                                        </button>
                                        {currentUserId === reply.authorId && (
                                          <button
                                            onClick={() => handleDeleteComment(reply.id)}
                                            className="hover:text-red-500 hover:underline ml-auto"
                                          >
                                            {t('post_delete_comment')}
                                          </button>
                                        )}
                                        {currentUserId !== reply.authorId && (
                                          <button
                                            onClick={() => {
                                              setReportingCommentId(reply.id);
                                              setShowReportModal(true);
                                            }}
                                            className="text-gray-400 hover:text-red-500 hover:underline ml-auto"
                                          >
                                            Báo cáo
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              {replyingToId === comment.id && (
                                <div className="flex gap-2 items-center">
                                  <UserPresenceAvatar
                                    uid={user?.uid}
                                    name={user?.displayName ?? user?.email ?? 'You'}
                                    photoURL={user?.photoURL}
                                    imgClassName="w-6 h-6 rounded-full flex-shrink-0 object-cover"
                                    fallbackClassName="w-6 h-6 rounded-full flex-shrink-0 bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center"
                                    fallbackTextClassName="text-[10px] font-bold text-white"
                                    presenceSize="sm"
                                  />
                                  <div className="flex-1 relative">
                                    <MentionCommentInput
                                      autoFocus
                                      value={replyTexts[comment.id] ?? ''}
                                      onChange={(v) =>
                                        setReplyTexts((p) => ({ ...p, [comment.id]: v }))
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === 'Escape') setReplyingToId(null);
                                      }}
                                      onSubmit={() => void handleSubmitReply(comment.id)}
                                      placeholder={`${t('post_reply')} ${comment.authorDisplayName}...`}
                                      disabled={submittingReply === comment.id}
                                      size="sm"
                                    />
                                    <button
                                      onClick={() => void handleSubmitReply(comment.id)}
                                      disabled={
                                        !markupToPlain(replyTexts[comment.id] ?? '').trim() ||
                                        submittingReply === comment.id
                                      }
                                      className="absolute right-2 top-1/2 -translate-y-1/2 text-cyan-600 disabled:opacity-40"
                                    >
                                      {submittingReply === comment.id ? (
                                        <span className="w-3.5 h-3.5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin inline-block" />
                                      ) : (
                                        <svg
                                          className="w-4 h-4"
                                          fill="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                                        </svg>
                                      )}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Load more button */}
                {nextCursor && (
                  <button
                    onClick={() => void loadMoreComments()}
                    disabled={loadingMoreComments}
                    className="w-full py-2 text-sm text-cyan-600 dark:text-cyan-400 font-medium hover:underline flex items-center justify-center gap-1.5 disabled:opacity-50 mb-2"
                  >
                    {loadingMoreComments && (
                      <span className="inline-block w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                    )}
                    {loadingMoreComments ? t('post_loading_reactors') : t('post_loading_more')}
                  </button>
                )}
                {/* Comment Input */}
                <div className="flex gap-3 mt-4 pt-4 border-t border-gray-200 dark:border-slate-700/50">
                  <UserPresenceAvatar
                    uid={user?.uid}
                    name={user?.displayName ?? user?.email ?? 'You'}
                    photoURL={user?.photoURL}
                    imgClassName="w-8 h-8 rounded-full flex-shrink-0 object-cover"
                    fallbackClassName="w-8 h-8 rounded-full flex-shrink-0 bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center"
                    fallbackTextClassName="text-xs font-bold text-white"
                    presenceSize="sm"
                  />
                  <div className="flex-1 relative">
                    {commentError && (
                      <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-500/50 rounded-xl text-sm text-red-600 dark:text-red-400">
                        <svg
                          className="w-4 h-4 shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                          />
                        </svg>
                        <span className="flex-1">{commentError}</span>
                        <button
                          type="button"
                          onClick={() => setCommentError(null)}
                          className="shrink-0 hover:text-red-700"
                        >
                          ×
                        </button>
                      </div>
                    )}
                    {commentMediaFile && (
                      <div className="mb-2 relative inline-block">
                        {commentMediaFile.type.startsWith('video/') ? (
                          <video
                            src={URL.createObjectURL(commentMediaFile)}
                            className="h-24 rounded-lg object-cover"
                          />
                        ) : (
                          <img
                            src={URL.createObjectURL(commentMediaFile)}
                            alt="preview"
                            className="h-24 rounded-lg object-cover"
                          />
                        )}
                        <button
                          onClick={() => setCommentMediaFile(null)}
                          className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shadow z-10"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                    <MentionCommentInput
                      value={commentText}
                      onChange={setCommentText}
                      onClearError={() => setCommentError(null)}
                      onSubmit={handleSubmitComment}
                      disabled={submittingComment}
                      placeholder={t('post_write_your_comment')}
                      inputRef={commentInputRef}
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      <label className="cursor-pointer p-1.5 rounded-full text-gray-400 hover:text-cyan-600 transition-colors">
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
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                        <input
                          type="file"
                          accept="image/*,video/*"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files?.[0]) setCommentMediaFile(e.target.files[0]);
                            e.target.value = '';
                          }}
                        />
                      </label>
                      <button
                        onClick={handleSubmitComment}
                        disabled={
                          (!markupToPlain(commentText).trim() && !commentMediaFile) ||
                          submittingComment
                        }
                        className="p-1.5 rounded-full text-cyan-600 hover:text-cyan-700 transition-colors disabled:opacity-50"
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
      </article>

      {/* ── LIGHTBOX ── */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm"
          onClick={() => {
            setLightboxOpen(false);
            setLightboxCommentOpen(false);
          }}
        >
          <div
            className="flex w-full max-w-5xl h-[85vh] rounded-2xl overflow-hidden shadow-2xl mx-3"
            onClick={(e) => e.stopPropagation()}
          >
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
                {isVideoUrl(renderedMediaUrls[lightboxIndex]) ? (
                  <video
                    src={renderedMediaUrls[lightboxIndex]}
                    className="max-w-full max-h-full object-contain pointer-events-auto"
                    controls
                    autoPlay
                    muted
                    playsInline
                  />
                ) : (
                  <img
                    src={renderedMediaUrls[lightboxIndex]}
                    alt={`Ảnh ${lightboxIndex + 1} / ${renderedMediaUrls.length}`}
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
                  cursor: lightboxIndex < renderedMediaUrls.length - 1 ? 'e-resize' : 'default',
                }}
                onClick={() =>
                  setLightboxIndex((prev) => Math.min(renderedMediaUrls.length - 1, prev + 1))
                }
              >
                {lightboxIndex < renderedMediaUrls.length - 1 && (
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
              {renderedMediaUrls.length > 1 && (
                <div
                  className="absolute z-20 flex gap-2"
                  style={{ bottom: '20px', left: '50%', transform: 'translateX(-50%)' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {renderedMediaUrls.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setLightboxIndex(i)}
                      className={`w-2.5 h-2.5 rounded-full transition-all ${
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
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {t('post_comments_header')}
                  </span>
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
                        src={optimizeImageUrl(post.authorPhotoURL)}
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
                      {renderPostContent(post.content, { maxLength: 200 })}
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
                      {t('post_no_comments')}
                    </div>
                  ) : (
                    comments.map((comment) => (
                      <div key={comment.id} className="flex gap-2">
                        {comment.authorPhotoURL ? (
                          <img
                            src={optimizeImageUrl(comment.authorPhotoURL)}
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
                          {editingCommentId === comment.id ? (
                            <div className="flex gap-2 items-center">
                              <input
                                autoFocus
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') void handleEditComment(comment.id);
                                  if (e.key === 'Escape') {
                                    setEditingCommentId(null);
                                    setEditingText('');
                                  }
                                }}
                                className="flex-1 bg-gray-100 dark:bg-slate-800 rounded-2xl px-3 py-2 text-sm text-gray-800 dark:text-gray-200 outline-none"
                              />
                              <button
                                onClick={() => void handleEditComment(comment.id)}
                                className="text-xs text-cyan-600 font-semibold hover:underline"
                              >
                                {t('post_send')}
                              </button>
                              <button
                                onClick={() => {
                                  setEditingCommentId(null);
                                  setEditingText('');
                                }}
                                className="text-xs text-gray-400 hover:underline"
                              >
                                {t('post_cancel')}
                              </button>
                            </div>
                          ) : (
                            <div className="bg-gray-100 dark:bg-slate-800 rounded-2xl px-3 py-2">
                              <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                                {comment.authorDisplayName}
                              </div>
                              <div className="text-sm text-gray-800 dark:text-gray-200 mt-0.5">
                                {renderCommentContent(comment.content)}
                                {comment.mediaUrl && (
                                  <div className="mt-2">
                                    {isVideoUrl(comment.mediaUrl) ? (
                                      <video
                                        src={comment.mediaUrl}
                                        controls
                                        className="max-h-40 rounded-lg"
                                      />
                                    ) : (
                                      <img
                                        src={optimizeImageUrl(comment.mediaUrl)}
                                        alt="media"
                                        className="max-h-40 rounded-lg object-contain bg-black/5"
                                      />
                                    )}
                                  </div>
                                )}
                                {comment.isEdited && (
                                  <span className="ml-1 text-xs text-gray-400 font-normal">
                                    • {t('post_editing')}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                          <div className="flex items-center gap-3 mt-1 px-2 text-xs font-semibold">
                            <button
                              onClick={() => void handleLikeComment(comment.id)}
                              className={`hover:underline ${commentLikes[comment.id] ? 'text-cyan-600' : 'text-gray-500'}`}
                            >
                              {t('post_like_comment')}
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
                              <>
                                <button
                                  onClick={() => {
                                    setEditingCommentId(comment.id);
                                    setEditingText(comment.content);
                                  }}
                                  className="text-gray-400 hover:text-cyan-600"
                                >
                                  {t('post_edit')}
                                </button>
                                <button
                                  onClick={() => void handleDeleteComment(comment.id)}
                                  className="text-gray-400 hover:text-red-500 ml-auto"
                                >
                                  {t('post_delete_comment')}
                                </button>
                              </>
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
                        src={optimizeImageUrl(user.photoURL)}
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
                      {commentMediaFile && (
                        <div className="mb-2 relative inline-block">
                          {commentMediaFile.type.startsWith('video/') ? (
                            <video
                              src={URL.createObjectURL(commentMediaFile)}
                              className="h-20 rounded-lg object-cover"
                            />
                          ) : (
                            <img
                              src={URL.createObjectURL(commentMediaFile)}
                              alt="preview"
                              className="h-20 rounded-lg object-cover"
                            />
                          )}
                          <button
                            onClick={() => setCommentMediaFile(null)}
                            className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shadow z-10"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                      <MentionCommentInput
                        value={commentText}
                        onChange={setCommentText}
                        onSubmit={handleSubmitComment}
                        disabled={submittingComment}
                        placeholder={t('post_write_comment')}
                        inputRef={lightboxCommentRef}
                      />
                      <div className="absolute right-2 bottom-1.5 flex items-center gap-1">
                        <label className="cursor-pointer p-1 rounded-full text-gray-400 hover:text-cyan-600 transition-colors">
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
                              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                          <input
                            type="file"
                            accept="image/*,video/*"
                            className="hidden"
                            onChange={(e) => {
                              if (e.target.files?.[0]) setCommentMediaFile(e.target.files[0]);
                              e.target.value = '';
                            }}
                          />
                        </label>
                        <button
                          onClick={() => void handleSubmitComment()}
                          disabled={
                            (!markupToPlain(commentText).trim() && !commentMediaFile) ||
                            submittingComment
                          }
                          className="p-1 text-cyan-600 hover:text-cyan-700 disabled:opacity-40 transition-colors"
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
        </div>
      )}

      {/* Reactors Modal */}
      {showReactorsModal && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShowReactorsModal(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-200 dark:border-slate-700">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Cảm xúc</h3>
              <button
                onClick={() => setShowReactorsModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500"
              >
                ✕
              </button>
            </div>
            {/* Top 3 emoji filter tabs */}
            {top3Reactions.length > 0 && (
              <div className="flex gap-1 px-4 pt-3 pb-2">
                <button
                  onClick={() => setReactorFilter(null)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    reactorFilter === null
                      ? 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800'
                  }`}
                >
                  Tất cả {likeCount}
                </button>
                {top3Reactions.map((emoji) => {
                  const cnt = Object.values(reactionsMap).filter((r) => r === emoji).length;
                  return (
                    <button
                      key={emoji}
                      onClick={() => setReactorFilter(emoji)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-1 transition-colors ${
                        reactorFilter === emoji
                          ? 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span>{emoji}</span>
                      <span>{cnt}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {/* List */}
            <div className="max-h-72 overflow-y-auto px-4 pb-4">
              {loadingReactors ? (
                <div className="py-8 text-center text-gray-400 text-sm">
                  {t('post_loading_reactors')}
                </div>
              ) : (
                reactors
                  .filter((r) => reactorFilter === null || r.reaction === reactorFilter)
                  .map((r) => (
                    <div key={r.uid} className="flex items-center gap-3 py-2.5">
                      <UserPresenceAvatar
                        uid={r.uid}
                        name={r.displayName}
                        photoURL={r.photoURL}
                        imgClassName="w-10 h-10 rounded-full object-cover"
                        fallbackClassName="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0"
                        fallbackTextClassName="text-sm font-bold text-white"
                        presenceSize="sm"
                      />
                      <span className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                        {r.displayName}
                      </span>
                      <span className="text-lg">{r.reaction}</span>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Comment Reactors Modal */}
      {commentReactorsModal && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setCommentReactorsModal(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-200 dark:border-slate-700">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                {t('post_comment_reactions_title')}
              </h3>
              <button
                onClick={() => setCommentReactorsModal(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500"
              >
                ✕
              </button>
            </div>
            {/* Top emoji filter tabs */}
            {(() => {
              const freq: Record<string, number> = {};
              for (const v of Object.values(commentReactorsModal.reactions))
                freq[v] = (freq[v] ?? 0) + 1;
              const topEmojis = Object.entries(freq)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([e]) => e);
              const total = Object.keys(commentReactorsModal.reactions).length;
              return (
                <div className="flex gap-1 px-4 pt-3 pb-2">
                  <button
                    onClick={() => setCommentReactorFilter(null)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      commentReactorFilter === null
                        ? 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    Tất cả {total}
                  </button>
                  {topEmojis.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => setCommentReactorFilter(emoji)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium flex items-center gap-1 transition-colors ${
                        commentReactorFilter === emoji
                          ? 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span>{emoji}</span>
                      <span>{freq[emoji]}</span>
                    </button>
                  ))}
                </div>
              );
            })()}
            {/* List */}
            <div className="max-h-72 overflow-y-auto px-4 pb-4">
              {loadingCommentReactors ? (
                <div className="py-8 text-center text-gray-400 text-sm">
                  {t('post_loading_reactors')}
                </div>
              ) : (
                commentReactors
                  .filter(
                    (r) => commentReactorFilter === null || r.reaction === commentReactorFilter
                  )
                  .map((r) => (
                    <div key={r.uid} className="flex items-center gap-3 py-2.5">
                      <UserPresenceAvatar
                        uid={r.uid}
                        name={r.displayName}
                        photoURL={r.photoURL}
                        imgClassName="w-10 h-10 rounded-full object-cover"
                        fallbackClassName="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0"
                        fallbackTextClassName="text-sm font-bold text-white"
                        presenceSize="sm"
                      />
                      <span className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                        {r.displayName}
                      </span>
                      <span className="text-lg">{r.reaction}</span>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
