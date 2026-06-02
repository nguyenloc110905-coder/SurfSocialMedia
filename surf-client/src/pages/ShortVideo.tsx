import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { uploadVideo } from '../lib/cloudinary';
import PresenceBadge from '../components/ui/PresenceBadge';
import { optimizeImageUrl } from '../lib/image-cdn';
import { useAuthStore } from '../stores/authStore';
import { useClipFeedStore, type ClipVideo } from '../stores/clipFeedStore';
import { getSocket } from '../lib/socket';
import { extractHashtags } from '../lib/hashtagUtils';

const REPORT_CATEGORIES = [
  { key: 'spam', label: 'Spam hoặc lừa đảo' },
  { key: 'hate', label: 'Ngôn từ thù ghét hoặc quấy rối' },
  { key: 'violence', label: 'Ảnh khỏa thân hoặc bạo lực' },
  { key: 'fake_news', label: 'Thông tin sai lệch' },
  { key: 'illegal', label: 'Bán hàng trái phép' },
  { key: 'copyright', label: 'Vi phạm bản quyền (IP)' },
  { key: 'other', label: 'Lý do khác' },
];

// Chuyển đổi URL Cloudinary video sang quality khác nhau
function applyCloudinaryQuality(url: string, quality: string): string {
  if (!url.includes('/video/upload/')) return url;
  const tag = quality === 'auto'
    ? 'f_auto,q_auto'
    : quality === '360' ? 'f_auto,q_auto:low,h_360'
    : quality === '480' ? 'f_auto,q_auto:eco,h_480'
    : quality === '720' ? 'f_auto,q_auto:good,h_720'
    : 'f_auto,q_auto:best,h_1080';
  // Chèn transformation vào sau /video/upload/
  return url.replace('/video/upload/', `/video/upload/${tag}/`);
}

// ── Video Caption Text — parse #hashtag and @mention ─────────────────────────
function VideoCaptionText({
  text,
  onMention,
}: {
  text: string;
  onMention: (name: string) => void;
}) {
  const TOKEN_RE = /(#[\w\u00C0-\u024F\u1E00-\u1EFF]+|@[\w.\u00C0-\u024F\u1E00-\u1EFF]+)/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('#')) {
      parts.push(
        <Link
          key={match.index}
          to={`/feed/hashtag/${token.substring(1)}`}
          className="text-cyan-400 font-semibold hover:text-cyan-300 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          {token}
        </Link>
      );
    } else {
      const name = token.slice(1);
      parts.push(
        <span
          key={match.index}
          className="text-cyan-400 font-semibold cursor-pointer hover:text-cyan-300 transition-colors"
          onClick={(e) => { e.stopPropagation(); onMention(name); }}
        >
          {token}
        </span>
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

// ── Individual Clip Card ───────────────────────────────────────────────────────
function ClipCard({
  video,
  currentUserId,
  onDelete,
  onHide,
}: {
  video: ClipVideo;
  currentUserId?: string;
  onDelete: (id: string) => void;
  onHide: (id: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const viewSent = useRef(false);
  const navigate = useNavigate();

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [liked, setLiked] = useState(video.likedBy?.includes(currentUserId ?? '') ?? false);
  const [likeCount, setLikeCount] = useState(video.likeCount ?? 0);
  const [showOptions, setShowOptions] = useState(false);
  const [interested, setInterested] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showQuality, setShowQuality] = useState(false);
  const [quality, setQuality] = useState<'auto'|'360'|'480'|'720'|'1080'>('auto');
  const [toast, setToast] = useState<string | null>(null);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const isCloudinary = video.videoUrl.includes('/video/upload/');

  // Comments
  type CommentItem = { id: string; authorId: string; authorDisplayName: string; authorPhotoURL?: string | null; content: string; createdAt?: { seconds?: number; _seconds?: number } | string };
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentCount, setCommentCount] = useState(video.commentCount ?? 0);
  const [commentInput, setCommentInput] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const commentInputRef = useRef<HTMLInputElement>(null);

  // Report State
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportCategory, setReportCategory] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);

  // Real-time: listen for new comments on this video
  useEffect(() => {
    const socket = getSocket();
    const onCommentNew = (comment: CommentItem) => {
      if ((comment as any).postId !== video.id) return;
      setComments((prev) => {
        if (prev.some((c) => c.id === comment.id)) return prev;
        return [...prev, comment];
      });
      setCommentCount((c) => c + 1);
    };
    socket.on('comment:new', onCommentNew);
    return () => { socket.off('comment:new', onCommentNew); };
  }, [video.id]);

  const openComments = async () => {
    setShowComments(true);
    if (comments.length === 0) {
      setCommentLoading(true);
      try {
        const res = await api.get<{ comments: CommentItem[] }>(`/api/videos/${video.id}/comments`);
        setComments(res.comments ?? []);
      } catch { /* ignore */ }
      finally { setCommentLoading(false); }
    }
    setTimeout(() => commentInputRef.current?.focus(), 300);
  };

  const submitComment = async () => {
    if (!commentInput.trim() || commentSubmitting) return;
    setCommentSubmitting(true);
    try {
      const res = await api.post<CommentItem>(`/api/videos/${video.id}/comments`, { content: commentInput.trim() });
      setComments((prev) => [...prev, res]);
      setCommentCount((c) => c + 1);
      setCommentInput('');
    } catch (e) {
      showToast('\u274C ' + ((e as Error).message || 'Không thể gửi bình luận'));
    } finally {
      setCommentSubmitting(false);
    }
  };

  // Share
  type FriendItem = { id: string; name: string; avatarUrl: string | null };
  const [showShare, setShowShare] = useState(false);
  const [showFriendPicker, setShowFriendPicker] = useState(false);
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [shareSearch, setShareSearch] = useState('');
  const [sharingSending, setShareSending] = useState<string | null>(null);

  const openFriendPicker = async () => {
    setShowShare(false);
    setShowFriendPicker(true);
    if (friends.length === 0) {
      setFriendsLoading(true);
      try {
        const res = await api.get<{ friends: FriendItem[] }>('/api/friends');
        setFriends(res.friends ?? []);
      } catch { /* ignore */ }
      finally { setFriendsLoading(false); }
    }
  };

  const shareToFriend = async (friend: FriendItem) => {
    if (sharingSending) return;
    setShareSending(friend.id);
    try {
      let convId: string;
      try {
        const created = await api.post<{ item: { id: string } }>('/api/conversations', { peerUid: friend.id });
        convId = created.item.id;
      } catch {
        const list = await api.get<{ items: { id: string; participants?: string[] }[] }>('/api/conversations?limit=50');
        const found = list.items.find((c) => c.participants?.includes(friend.id));
        if (!found) { showToast('\u274C Không thể mở cuộc trò chuyện'); return; }
        convId = found.id;
      }
      const shareUrl = `${window.location.origin}/feed/short-video?v=${video.id}`;
      const text = `\ud83c\udfa5 ${video.title || 'Surf Clip'}: ${shareUrl}`;
      await api.post(`/api/conversations/${convId}/messages`, { text });
      if (video._source !== 'post') {
        api.post(`/api/videos/${video.id}/share`).catch(() => {});
      }
      showToast(`\u2705 Đã chia sẻ với ${friend.name}`);
      setShowFriendPicker(false);
    } catch {
      showToast('\u274C Gửi thất bại');
    } finally {
      setShareSending(null);
    }
  };

  const videoSrc = applyCloudinaryQuality(video.videoUrl, quality);
  const [hovered, setHovered] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const filteredFriends = friends.filter((f) =>
    f.name.toLowerCase().includes(shareSearch.toLowerCase())
  );

  // Autoplay + view tracking via IntersectionObserver
  useEffect(() => {
    const el = videoRef.current;
    const card = cardRef.current;
    if (!el || !card) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          el.play().then(() => setPlaying(true)).catch(() => {});
          if (!viewSent.current) {
            viewSent.current = true;
            // Only track views for clips (posts don't have a view endpoint)
            if (video._source !== 'post') {
              api.post(`/api/videos/${video.id}/view`).catch(() => {});
            }
          }
        } else {
          el.pause();
          setPlaying(false);
        }
      },
      { threshold: 0.6 }
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, [video.id]);

  const togglePlay = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) { el.play(); setPlaying(true); }
    else { el.pause(); setPlaying(false); }
  };

  const isPost = video._source === 'post';
  const likeUrl = isPost ? `/api/posts/${video.id}/like` : `/api/videos/${video.id}/like`;
  const deleteUrl = isPost ? `/api/posts/${video.id}` : `/api/videos/${video.id}`;

  const handleLike = async () => {
    const newLiked = !liked;
    setLiked(newLiked);
    setLikeCount((c) => (newLiked ? c + 1 : c - 1));
    try {
      await api.post(likeUrl);
    } catch {
      setLiked(!newLiked);
      setLikeCount((c) => (newLiked ? c - 1 : c + 1));
    }
  };

  const handleDelete = async () => {
    if (!confirm('Xóa video này?')) return;
    try {
      await api.delete(deleteUrl);
      onDelete(video.id);
    } catch {
      alert('Không thể xóa video. Vui lòng thử lại.');
    }
  };

  const submitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reportSubmitting || !reportCategory) return;
    setReportSubmitting(true);
    try {
      const catLabel = REPORT_CATEGORIES.find((c) => c.key === reportCategory)?.label || reportCategory;
      const reasonText = reportDetails.trim() ? `${catLabel} - ${reportDetails.trim()}` : catLabel;
      
      if (isPost) {
        await api.post(`/api/posts/${video.id}/report`, {
          reason: reportCategory,
          details: reportDetails.trim(),
        });
      } else {
        await api.post(`/api/videos/${video.id}/report`, { reason: reasonText });
      }
      
      showToast('🚩 Đã gửi báo cáo video');
      setShowReportModal(false);
      setReportCategory('');
      setReportDetails('');
    } catch {
      showToast('❌ Không thể gửi báo cáo');
    } finally {
      setReportSubmitting(false);
    }
  };

  return (
    <div
      ref={cardRef}
      className="relative flex flex-row items-center bg-black snap-start flex-shrink-0 overflow-hidden h-full"
    >
      {/* Video wrapper – flex-1 so it fills remaining space after comment panel */}
      <div className="flex-1 flex items-center justify-center h-full min-w-0">
      <div
        className="relative h-full flex-shrink-0"
        style={{ aspectRatio: '9/16' }}
      >
      {/* Video element */}
      <video
        ref={videoRef}
        src={videoSrc}
        poster={optimizeImageUrl(video.thumbnailUrl) || undefined}
        loop
        muted={muted}
        playsInline
        className="w-full h-full object-cover cursor-pointer"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={togglePlay}
      />

      {/* Hover controls — rewind / play-pause / forward */}
      <div
        className={`absolute inset-0 flex items-center justify-center gap-6 transition-opacity duration-200 pointer-events-none ${hovered ? 'opacity-100' : 'opacity-0'}`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ pointerEvents: hovered ? 'auto' : 'none' }}
      >
        {/* Rewind 5s */}
        <button
          onClick={(e) => { e.stopPropagation(); const el = videoRef.current; if (el) el.currentTime = Math.max(0, el.currentTime - 5); }}
          className="w-14 h-14 rounded-full bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center text-white hover:bg-black/70 active:scale-90 transition-all"
        >
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
          </svg>
          <span className="text-[10px] font-bold leading-none mt-0.5">5s</span>
        </button>
        {/* Play / Pause */}
        <button
          onClick={(e) => { e.stopPropagation(); togglePlay(); }}
          className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 active:scale-90 transition-all"
        >
          {playing ? (
            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg className="w-8 h-8 ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        {/* Forward 5s */}
        <button
          onClick={(e) => { e.stopPropagation(); const el = videoRef.current; if (el) el.currentTime = Math.min(el.duration || 0, el.currentTime + 5); }}
          className="w-14 h-14 rounded-full bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center text-white hover:bg-black/70 active:scale-90 transition-all"
        >
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/>
          </svg>
          <span className="text-[10px] font-bold leading-none mt-0.5">5s</span>
        </button>
      </div>

      {/* Toast notification */}
      {toast && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 bg-black/80 backdrop-blur-sm text-white text-sm px-4 py-2 rounded-full whitespace-nowrap pointer-events-none">
          {toast}
        </div>
      )}

      {/* Play/pause center indicator */}
      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-16 h-16 rounded-full bg-black/40 flex items-center justify-center">
            <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}

      {/* Bottom gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent pointer-events-none" />

      {/* Right action bar — floats outside the video frame to the right */}
      <div className="absolute -right-16 bottom-20 flex flex-col items-center gap-4 z-10">
        {/* Author avatar */}
        <button
          onClick={() => navigate(`/feed/profile/${video.authorId}`)}
          className="relative group"
        >
          {video.authorPhotoURL ? (
            <img
              src={optimizeImageUrl(video.authorPhotoURL)}
              alt={video.authorDisplayName}
              className="w-12 h-12 rounded-full border-2 border-white object-cover"
            />
          ) : (
            <div className="w-12 h-12 rounded-full border-2 border-white bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <span className="text-sm font-bold text-white">
                {(video.authorDisplayName || 'U')[0].toUpperCase()}
              </span>
            </div>
          )}
        </button>

        {/* Like button */}
        <button onClick={() => void handleLike()} className="flex flex-col items-center gap-1">
          <div
            className={`w-12 h-12 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center transition-transform active:scale-90 ${liked ? 'text-red-500' : 'text-white'}`}
          >
            <svg
              className="w-7 h-7"
              fill={liked ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
              />
            </svg>
          </div>
          <span className="text-white text-xs font-semibold drop-shadow">{likeCount.toLocaleString()}</span>
        </button>

        {/* Comment button */}
        <button onClick={() => void openComments()} className="flex flex-col items-center gap-1">
          <div className="w-12 h-12 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white active:scale-90 transition-transform">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
            </svg>
          </div>
          <span className="text-white text-xs font-semibold drop-shadow">{commentCount.toLocaleString()}</span>
        </button>

        {/* Mute / unmute */}
        <button onClick={() => setMuted((m) => !m)} className="flex flex-col items-center gap-1">
          <div className="w-12 h-12 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white">
            {muted ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.531l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.531l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
              </svg>
            )}
          </div>
        </button>

        {/* Share button with dropdown */}
        <div className="relative flex flex-col items-center">
          <button
            onClick={() => { setShowShare((s) => !s); setShowOptions(false); }}
            className="flex flex-col items-center gap-1"
          >
            <div className="w-12 h-12 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white active:scale-90 transition-transform">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
              </svg>
            </div>
            <span className="text-white text-xs drop-shadow">Chia sẻ</span>
          </button>
          {showShare && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowShare(false)} />
              <div className="absolute right-14 bottom-0 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl z-20 min-w-[200px] border border-slate-200 dark:border-slate-700 overflow-hidden">
                <button
                  onClick={() => { setShowShare(false); void openFriendPicker(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <span className="text-lg">🌊</span>
                  Chia sẻ qua Waves
                </button>
                <div className="border-t border-slate-200 dark:border-slate-700" />
                <button
                  onClick={() => {
                    const url = `${window.location.origin}/feed/short-video?v=${video.id}`;
                    navigator.clipboard.writeText(url).then(() => showToast('🔗 Đã sao chép link')).catch(() => {});
                    setShowShare(false);
                    if (video._source !== 'post') {
                      api.post(`/api/videos/${video.id}/share`).catch(() => {});
                    }
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <span className="text-lg">🔗</span>
                  Sao chép liên kết
                </button>
              </div>
            </>
          )}
        </div>

        {/* Options menu (3 chấm) — hiện cho tất cả user */}
        <div className="relative">
          <button
            onClick={() => { setShowOptions((s) => !s); setShowQuality(false); }}
            className="w-12 h-12 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm0 7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm0 7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z" />
            </svg>
          </button>

          {showOptions && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => { setShowOptions(false); setShowQuality(false); }} />
              <div className="absolute right-14 bottom-0 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden z-20 min-w-[210px] border border-gray-100 dark:border-slate-700">

                {/* Quan tâm */}
                <button
                  onClick={() => {
                    setInterested(true);
                    setShowOptions(false);
                    showToast('✅ Sẽ hiện nhiều video tương tự hơn');
                  }}
                  className={`flex items-center gap-3 px-4 py-3 text-sm w-full hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors ${
                    interested ? 'text-cyan-600 dark:text-cyan-400' : 'text-gray-700 dark:text-gray-200'
                  }`}
                >
                  <span className="text-lg">👍</span>
                  <span className="font-medium">Quan tâm</span>
                  {interested && <span className="ml-auto text-xs text-cyan-500">✓</span>}
                </button>

                {/* Không quan tâm */}
                <button
                  onClick={() => {
                    setShowOptions(false);
                    showToast('🚫 Sẽ ít hiện video tương tự hơn');
                    setTimeout(() => onHide(video.id), 1000);
                  }}
                  className="flex items-center gap-3 px-4 py-3 text-sm w-full hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors text-gray-700 dark:text-gray-200"
                >
                  <span className="text-lg">👎</span>
                  <span className="font-medium">Không quan tâm</span>
                </button>

                {/* Báo cáo video */}
                <button
                  onClick={() => {
                    setShowOptions(false);
                    setShowReportModal(true);
                  }}
                  className="flex items-center gap-3 px-4 py-3 text-sm w-full hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-600 dark:text-red-400"
                >
                  <span className="text-lg">🚩</span>
                  <span className="font-medium">Báo cáo video</span>
                </button>

                <div className="h-px bg-gray-100 dark:bg-slate-700 mx-3" />

                {/* Lưu thước phim */}
                <a
                  href={video.videoUrl}
                  download
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    setShowOptions(false);
                    setSaved(true);
                    showToast('💾 Đã lưu thước phim');
                  }}
                  className={`flex items-center gap-3 px-4 py-3 text-sm w-full hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors ${
                    saved ? 'text-cyan-600 dark:text-cyan-400' : 'text-gray-700 dark:text-gray-200'
                  }`}
                >
                  <span className="text-lg">🔖</span>
                  <span className="font-medium">Lưu thước phim</span>
                  {saved && <span className="ml-auto text-xs text-cyan-500">✓</span>}
                </a>

                {/* Chất lượng video */}
                <button
                  onClick={() => setShowQuality((q) => !q)}
                  className="flex items-center gap-3 px-4 py-3 text-sm w-full hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors text-gray-700 dark:text-gray-200"
                >
                  <span className="text-lg">🎞️</span>
                  <span className="font-medium">Chất lượng video</span>
                  <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
                    {quality === 'auto' ? 'Tự động' : `${quality}p`}
                    <svg className={`w-3 h-3 inline ml-1 transition-transform ${showQuality ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" /></svg>
                  </span>
                </button>

                {/* Quality sub-panel */}
                {showQuality && (
                  <div className="bg-gray-50 dark:bg-slate-800 border-t border-gray-100 dark:border-slate-700">
                    {isCloudinary
                      ? (['auto', '360', '480', '720', '1080'] as const).map((q) => (
                          <button
                            key={q}
                            onClick={() => {
                              setQuality(q);
                              if (videoRef.current) {
                                const t = videoRef.current.currentTime;
                                videoRef.current.src = applyCloudinaryQuality(video.videoUrl, q);
                                videoRef.current.currentTime = t;
                                videoRef.current.play().catch(() => {});
                              }
                              setShowQuality(false);
                              setShowOptions(false);
                              showToast(`🎞️ Chất lượng: ${q === 'auto' ? 'Tự động' : q + 'p'}`);
                            }}
                            className={`flex items-center justify-between px-6 py-2.5 text-sm w-full hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors ${
                              quality === q ? 'text-cyan-600 dark:text-cyan-400 font-semibold' : 'text-gray-700 dark:text-gray-300'
                            }`}
                          >
                            <span>{q === 'auto' ? 'Tự động' : `${q}p`}</span>
                            {quality === q && <span>✓</span>}
                          </button>
                        ))
                      : <p className="px-6 py-3 text-xs text-gray-400">Không khả dụng với video này</p>
                    }
                  </div>
                )}

                {/* Xóa video — chỉ chủ sở hữu */}
                {currentUserId === video.authorId && (
                  <>
                    <div className="h-px bg-gray-100 dark:bg-slate-700 mx-3" />
                    <button
                      onClick={() => { setShowOptions(false); void handleDelete(); }}
                      className="flex items-center gap-3 px-4 py-3 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 w-full transition-colors"
                    >
                      <span className="text-lg">🗑️</span>
                      <span className="font-medium">Xóa video</span>
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bottom info overlay */}
      <div className="absolute bottom-4 left-4 right-16 z-10">
        <button
          onClick={() => navigate(`/feed/profile/${video.authorId}`)}
          className="font-bold text-sm text-white hover:underline drop-shadow block"
        >
          @{video.authorDisplayName}
        </button>
        {video.title && (
          <p className="text-sm font-medium text-white mt-0.5 drop-shadow line-clamp-1">
            <VideoCaptionText text={video.title} onMention={(name) => navigate(`/feed/profile/${name}`)} />
          </p>
        )}
        {video.description && (
          <div className="mt-0.5">
            <p
              className={`text-xs text-white/85 drop-shadow leading-relaxed ${
                captionExpanded ? '' : 'line-clamp-2'
              }`}
            >
              <VideoCaptionText
                text={video.description}
                onMention={(name) => navigate(`/feed/profile/${name}`)}
              />
            </p>
            {video.description.length > 80 && (
              <button
                className="text-[11px] text-white/60 hover:text-white/90 mt-0.5 transition-colors"
                onClick={(e) => { e.stopPropagation(); setCaptionExpanded((p) => !p); }}
              >
                {captionExpanded ? 'Rút gọn' : 'Xem thêm'}
              </button>
            )}
          </div>
        )}
        {(video.viewCount ?? 0) > 0 && (
          <p className="text-xs text-white/50 mt-1 drop-shadow">
            {video.viewCount.toLocaleString()} lượt xem
          </p>
        )}
      </div>
      </div>
      </div>
      {/* ── END of 9/16 video box + wrapper ──────────────── */}

      {/* ── Comment Panel — in-flow flex sibling, width animates 0→320px ── */}
      <div
        className="h-full bg-white dark:bg-slate-900 flex flex-col shadow-2xl transition-all duration-300 ease-in-out flex-shrink-0 overflow-hidden"
        style={{ width: showComments ? 'clamp(260px, 25vw, 320px)' : '0px' }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-3 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <button onClick={() => setShowComments(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <span className="font-semibold text-slate-800 dark:text-slate-100 text-sm">
            Bình luận ({commentCount.toLocaleString()})
          </span>
        </div>

        {/* Comment list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {commentLoading && (
            <div className="flex justify-center py-6">
              <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!commentLoading && comments.length === 0 && (
            <p className="text-center text-slate-400 dark:text-slate-500 text-sm py-6">Chưa có bình luận nào</p>
          )}
          {comments.map((c) => (
            <div key={c.id} className="flex gap-3">
              {c.authorPhotoURL ? (
                <img src={optimizeImageUrl(c.authorPhotoURL)} alt={c.authorDisplayName} className="w-8 h-8 rounded-full flex-shrink-0 object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-full flex-shrink-0 bg-cyan-500 flex items-center justify-center text-white text-xs font-bold">
                  {c.authorDisplayName?.[0]?.toUpperCase() ?? '?'}
                </div>
              )}
              <div>
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{c.authorDisplayName}</span>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">{c.content}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Input row */}
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex gap-2 items-center flex-shrink-0">
          <input
            ref={commentInputRef}
            type="text"
            value={commentInput}
            onChange={(e) => setCommentInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submitComment(); }}
            placeholder="Viết bình luận..."
            className="flex-1 rounded-full border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-sm px-4 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500 text-slate-800 dark:text-slate-200 placeholder-slate-400"
          />
          <button
            onClick={() => void submitComment()}
            disabled={commentSubmitting || !commentInput.trim()}
            className="w-9 h-9 rounded-full bg-cyan-500 hover:bg-cyan-600 disabled:opacity-40 flex items-center justify-center text-white flex-shrink-0 transition-colors"
          >
            {commentSubmitting ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3.478 2.405a.75.75 0 0 0-.926.94l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.405Z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* ── Friend Picker Modal ─────────────────────────────── */}
      {showFriendPicker && (
        <>
          <div className="absolute inset-0 z-40 bg-black/50" onClick={() => setShowFriendPicker(false)} />
          <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-2xl flex flex-col max-h-[70%]">
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-slate-800 dark:text-slate-100 text-sm">Chia sẻ qua Waves</span>
              <button onClick={() => setShowFriendPicker(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Search */}
            <input
              type="text"
              value={shareSearch}
              onChange={(e) => setShareSearch(e.target.value)}
              placeholder="Tìm bạn bè..."
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-sm px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-cyan-500 text-slate-800 dark:text-slate-200 placeholder-slate-400"
            />

            {/* Friend list */}
            <div className="flex-1 overflow-y-auto space-y-2">
              {friendsLoading && (
                <div className="flex justify-center py-4">
                  <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {!friendsLoading && filteredFriends.length === 0 && (
                <p className="text-center text-slate-400 text-sm py-4">Không tìm thấy bạn bè</p>
              )}
              {filteredFriends.map((f) => (
                <div key={f.id} className="flex items-center gap-3 py-1">
                  <span className="relative inline-flex flex-shrink-0 overflow-visible">
                    {f.avatarUrl ? (
                      <img
                        src={optimizeImageUrl(f.avatarUrl)}
                        alt={f.name}
                        className="w-9 h-9 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-cyan-500 flex items-center justify-center text-white text-sm font-bold">
                        {f.name[0]?.toUpperCase() ?? '?'}
                      </div>
                    )}
                    <PresenceBadge uid={f.id} size="sm" />
                  </span>
                  <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">{f.name}</span>
                  <button
                    onClick={() => void shareToFriend(f)}
                    disabled={sharingSending === f.id}
                    className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-40 text-white text-xs font-semibold rounded-full transition-colors"
                  >
                    {sharingSending === f.id ? 'Đang gửi...' : 'Gửi'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Report Modal ─────────────────────────────── */}
      {showReportModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 p-4">
              <h2 className="text-xl font-bold text-slate-800 dark:text-white">Báo cáo video</h2>
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-white"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={submitReport} className="p-4">
              <div className="mb-4 text-sm text-slate-600 dark:text-slate-300">
                Vui lòng chọn lý do báo cáo để chúng tôi có thể xem xét và xử lý theo Tiêu chuẩn Cộng đồng của Surf.
              </div>
              <div className="mb-4 max-h-[250px] space-y-2 overflow-y-auto pr-2 custom-scrollbar">
                {REPORT_CATEGORIES.map((category) => (
                  <label key={category.key} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-3 hover:bg-slate-100 dark:hover:bg-slate-800">
                    <input
                      type="radio"
                      name="reportCategory"
                      value={category.key}
                      checked={reportCategory === category.key}
                      onChange={(e) => setReportCategory(e.target.value)}
                      className="h-4 w-4 rounded-full border-slate-300 dark:border-slate-600 bg-transparent text-cyan-500 focus:ring-2 focus:ring-cyan-500 focus:ring-offset-1 focus:ring-offset-white dark:focus:ring-offset-slate-900"
                    />
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{category.label}</span>
                  </label>
                ))}
              </div>
              {reportCategory && (
                <div className="mb-6">
                  <label className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-400">Chi tiết bổ sung (không bắt buộc)</label>
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
                  onClick={() => setShowReportModal(false)}
                  className="rounded-lg px-4 py-2 text-sm font-bold text-slate-600 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={reportSubmitting || !reportCategory}
                  className="rounded-lg bg-cyan-500 px-5 py-2 text-sm font-bold text-white transition hover:bg-cyan-600 disabled:opacity-50"
                >
                  {reportSubmitting ? 'Đang gửi...' : 'Gửi báo cáo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Upload Modal ───────────────────────────────────────────────────────────────
function UploadModal({
  onClose,
  onUploaded,
}: {
  onClose: () => void;
  onUploaded: (video: ClipVideo) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'friends' | 'only-me'>('public');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('video/')) {
      setError('Chỉ chấp nhận file video (MP4, MOV, WebM...)');
      return;
    }
    if (f.size > 200 * 1024 * 1024) {
      setError('File video tối đa 200MB');
      return;
    }
    setFile(f);
    setError(null);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) {
      const fakeEvent = { target: { files: [f] } } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFile(fakeEvent);
    }
  };

  const handleSubmit = async () => {
    if (!file) { setError('Vui lòng chọn video'); return; }
    setUploading(true);
    setProgress(10);
    setError(null);
    try {
      // Step 1: upload video to Cloudinary
      setProgress(20);
      const videoUrl = await uploadVideo(file, { folder: 'surf/clips' });
      setProgress(85);

      // Step 2: save metadata to server
      const result = (await api.post('/api/videos', {
        title: title.trim(),
        description: description.trim(),
        videoUrl,
        privacy,
        tags: extractHashtags(description),
      })) as ClipVideo;

      setProgress(100);
      onUploaded(result);
    } catch (e) {
      setError((e as Error).message || 'Upload thất bại, vui lòng thử lại.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 dark:border-slate-800/60 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md">
          <h2 className="text-xl font-black bg-gradient-to-r from-cyan-500 to-blue-600 bg-clip-text text-transparent">Đăng Surf Clip</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto custom-scrollbar">
          {/* Drop zone / preview */}
          {!previewUrl ? (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-3xl p-10 flex flex-col items-center gap-4 cursor-pointer transition-all duration-300 select-none group ${
                isDragging 
                  ? 'border-cyan-500 bg-cyan-50/50 dark:bg-cyan-900/20 scale-[1.02] shadow-xl shadow-cyan-500/10' 
                  : 'border-gray-300 dark:border-slate-600 hover:border-cyan-400 hover:bg-gray-50 dark:hover:bg-slate-800/50'
              }`}
            >
              <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-transform duration-300 ${
                isDragging ? 'bg-cyan-100 dark:bg-cyan-900/50 scale-110' : 'bg-gray-100 dark:bg-slate-800 group-hover:bg-cyan-50 dark:group-hover:bg-cyan-900/30 group-hover:scale-105'
              }`}>
                <svg className={`w-10 h-10 transition-colors duration-300 ${isDragging ? 'text-cyan-600 dark:text-cyan-400' : 'text-gray-400 group-hover:text-cyan-500 dark:group-hover:text-cyan-400'}`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                </svg>
              </div>
              <div className="text-center">
                <p className={`text-base font-bold transition-colors ${isDragging ? 'text-cyan-600 dark:text-cyan-400' : 'text-gray-700 dark:text-gray-200'}`}>
                  {isDragging ? 'Thả video vào đây...' : 'Kéo thả hoặc nhấn để chọn video'}
                </p>
                <p className="text-xs text-gray-500 mt-1.5 font-medium">MP4, MOV, WebM — tối đa 200MB</p>
              </div>
            </div>
          ) : (
            <div className="relative rounded-3xl overflow-hidden bg-black aspect-[9/16] max-h-72 mx-auto w-fit shadow-2xl shadow-black/50 border border-gray-800">
              <video
                src={previewUrl}
                className="h-full w-auto mx-auto object-contain"
                controls
                muted
              />
              <button
                onClick={() => { setFile(null); setPreviewUrl(null); }}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/70 hover:scale-110 active:scale-95 transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          )}

          <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFile} />

          {/* Title */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Tiêu đề
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              placeholder="Thêm tiêu đề hấp dẫn..."
              className="w-full bg-white dark:bg-slate-900/50 border-2 border-gray-100 dark:border-slate-800 rounded-xl px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-cyan-500 dark:focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 transition-all shadow-sm"
            />
          </div>

          {/* Description / Caption */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Caption
              </label>
              <span className={`text-[10px] font-bold ${description.length >= 500 ? 'text-red-500' : 'text-gray-400'}`}>{description.length}/500</span>
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Mô tả clip... Dùng #hashtag và @mention để tiếp cận nhiều người hơn!"
              className="w-full bg-white dark:bg-slate-900/50 border-2 border-gray-100 dark:border-slate-800 rounded-xl px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-cyan-500 dark:focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 transition-all shadow-sm resize-none"
            />
            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1.5">
              Dùng <span className="text-cyan-500 font-bold">#hashtag</span> và <span className="text-cyan-500 font-bold">@tên_người_dùng</span> trong caption
            </p>
          </div>

          {/* Privacy selector */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Quyền riêng tư
            </label>
            <div className="flex gap-3">
              {([
                { value: 'public', label: 'Công khai', icon: '🌍' },
                { value: 'friends', label: 'Bạn bè', icon: '👥' },
                { value: 'only-me', label: 'Chỉ mình tôi', icon: '🔒' },
              ] as const).map(({ value, label, icon }) => (
                <button
                  key={value}
                  onClick={() => setPrivacy(value)}
                  className={`flex-1 py-2.5 px-2 rounded-xl text-sm font-semibold border-2 transition-all flex flex-col items-center gap-1 ${
                    privacy === value
                      ? 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400 border-cyan-500 shadow-md shadow-cyan-500/10'
                      : 'border-gray-100 dark:border-slate-800 text-gray-500 dark:text-gray-400 hover:border-gray-200 dark:hover:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <span className="text-lg">{icon}</span>
                  <span className="text-[11px] leading-none">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/50 text-red-600 dark:text-red-400 text-sm font-medium rounded-xl px-4 py-3 flex items-start gap-2">
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              {error}
            </div>
          )}

          {/* Progress bar */}
          {uploading && (
            <div className="bg-gray-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-gray-100 dark:border-slate-700">
              <div className="flex justify-between text-sm font-bold text-gray-700 dark:text-gray-300 mb-2.5">
                <span className="flex items-center gap-2">
                  {progress < 100 && (
                    <svg className="w-4 h-4 animate-spin text-cyan-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  )}
                  {progress < 80 ? 'Đang tải lên...' : progress < 100 ? 'Đang xử lý...' : '✅ Hoàn tất!'}
                </span>
                <span className="text-cyan-600 dark:text-cyan-400">{progress}%</span>
              </div>
              <div className="h-2.5 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden relative">
                <div
                  className="absolute top-0 left-0 h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full transition-all duration-300 ease-out shadow-[0_0_10px_rgba(6,182,212,0.5)]"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={() => void handleSubmit()}
            disabled={uploading || !file}
            className="relative w-full py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-base rounded-xl hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/30 active:scale-[0.98] transition-all overflow-hidden group mt-2"
          >
            <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full duration-1000 skew-x-12 ease-in-out transition-transform" />
            <span className="relative z-10">{uploading ? 'Đang đăng tải...' : 'Đăng clip ngay'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ShortVideo() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sharedVideoId = searchParams.get('v');
  const { videos, hasMore, nextCursor, loaded, setFeed, appendFeed, removeVideo, prependVideo } =
    useClipFeedStore();
  const [loading, setLoading] = useState(!loaded);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadFeed = useCallback(async (cursor?: number) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setLoading(false);
      setLoadingMore(false);
      return;
    }
    if (cursor) setLoadingMore(true);
    else setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '5' });
      if (cursor) params.set('page', String(cursor));
      else params.set('page', '1');
      
      const data = (await api.get(`/api/videos/foryou?${params.toString()}`)) as {
        videos: ClipVideo[];
        hasMore: boolean;
        nextPage: number | null;
      };
      
      if (cursor) {
        appendFeed(data.videos, data.hasMore, data.nextPage);
      } else {
        setFeed(data.videos, data.hasMore, data.nextPage);
      }
    } catch (e) {
      console.error('Failed to load video feed:', e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [setFeed, appendFeed]);

  // Chỉ fetch lần đầu nếu store chưa có data, hoặc khi có kết nối mạng trở lại
  useEffect(() => {
    if (!loaded) void loadFeed();

    const handleOnline = () => {
      void loadFeed();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [loaded, loadFeed]);

  // Xử lý shared video
  useEffect(() => {
    if (!sharedVideoId) return;
    let isMounted = true;
    
    const currentVideos = useClipFeedStore.getState().videos;
    const existing = currentVideos.find(v => v.id === sharedVideoId);
    if (existing) {
      if (currentVideos[0]?.id !== sharedVideoId) {
        removeVideo(sharedVideoId);
        prependVideo(existing);
      }
      return;
    }
    
    // Nếu chưa có trong store, fetch nó (chỉ support clip, không post)
    api.get(`/api/videos/${sharedVideoId}`).then((v: any) => {
      if (isMounted) prependVideo({ ...v, _source: 'clip' });
    }).catch(() => {});
    
    return () => { isMounted = false; };
  }, [sharedVideoId, prependVideo, removeVideo]);

  // Load more when scrolled near the end
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || loadingMore || !hasMore || !nextCursor) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight - scrollTop - clientHeight < clientHeight * 1.5) {
      void loadFeed(nextCursor);
    }
  }, [loadFeed, loadingMore, hasMore, nextCursor]);

  const handleDelete = useCallback((id: string) => {
    removeVideo(id);
  }, [removeVideo]);

  const handleUploaded = useCallback((video: ClipVideo) => {
    prependVideo(video);
    setShowUpload(false);
  }, [prependVideo]);

  return (
    <div className="relative bg-black h-full">
      {/* Vertical snap scroll container */}
      <div
        ref={scrollRef}
        className="h-full overflow-y-scroll snap-y snap-mandatory scrollbar-hide"
        onScroll={handleScroll}
      >
        {loading ? (
          // Loading skeleton
          <div className="snap-start w-full flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin" />
              <span className="text-white/60 text-sm">Đang tải clips...</span>
            </div>
          </div>
        ) : videos.length === 0 ? (
          // Empty state
          <div className="snap-start w-full flex flex-col items-center justify-center h-full">
            <div className="text-7xl mb-4 opacity-60">🎬</div>
            <p className="text-white/80 font-semibold text-lg">Chưa có clip nào</p>
            <p className="text-white/50 text-sm mt-1">Hãy là người đầu tiên đăng!</p>
            <button
              onClick={() => setShowUpload(true)}
              className="mt-6 px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold rounded-xl hover:opacity-90 active:scale-95 transition-all"
            >
              Đăng clip ngay
            </button>
          </div>
        ) : (
          <>
            {videos.map((v) => (
              <ClipCard
                key={v.id}
                video={v}
                currentUserId={user?.uid}
                onDelete={handleDelete}
                onHide={handleDelete}
              />
            ))}

            {/* Loading more spinner */}
            {loadingMore && (
              <div className="snap-start w-full flex items-center justify-center h-full">
                <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            )}

            {/* End of feed */}
            {!hasMore && !loadingMore && (
              <div className="snap-start w-full flex items-center justify-center py-6">
                <p className="text-white/40 text-sm">Đã xem hết 🏄‍♂️</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Back button + "Surf Clips" title + Upload + Search */}
      <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/50 active:scale-90 transition-all flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <span className="text-white font-bold text-lg drop-shadow-lg hidden sm:block whitespace-nowrap">Surf Clips</span>
          <button
            onClick={() => setShowUpload(true)}
            title="Đăng clip mới"
            className="w-8 h-8 bg-white/20 backdrop-blur-md border border-white/30 rounded-full flex items-center justify-center text-white hover:bg-white/35 active:scale-90 transition-all flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
          
          {/* Search Bar */}
          <form 
            className="ml-2 w-48 sm:w-64"
            onSubmit={(e) => {
              e.preventDefault();
              const q = searchQuery.trim();
              if (!q) return;
              if (q.startsWith('#')) {
                navigate(`/feed/hashtag/${q.substring(1)}`);
              } else {
                navigate(`/feed/search?q=${encodeURIComponent(q)}&tab=videos&source=clip`);
              }
            }}
          >
            <div className="relative flex items-center">
              <svg className="absolute left-3 w-4 h-4 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm #hashtag hoặc clip..."
                className="w-full bg-black/30 backdrop-blur-md border border-white/20 text-white placeholder-white/60 text-sm rounded-full pl-9 pr-4 py-1.5 focus:outline-none focus:border-cyan-400 focus:bg-black/50 transition-all"
              />
            </div>
          </form>
        </div>
        
        {/* Empty div for flex-between spacing if needed */}
        <div></div>
      </div>

      {/* Upload modal */}
      {showUpload && (
        <UploadModal onClose={() => setShowUpload(false)} onUploaded={handleUploaded} />
      )}
    </div>
  );
}
