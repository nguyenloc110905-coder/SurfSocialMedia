import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { uploadVideo } from '../lib/cloudinary';
import { useAuthStore } from '../stores/authStore';
import { useClipFeedStore, type ClipVideo } from '../stores/clipFeedStore';

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
  const isCloudinary = video.videoUrl.includes('/video/upload/');

  const videoSrc = applyCloudinaryQuality(video.videoUrl, quality);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

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

  return (
    <div
      ref={cardRef}
      className="flex items-center justify-center bg-black snap-start flex-shrink-0"
      style={{ height: 'calc(100vh - 88px)' }}
    >
      <div className="relative h-full flex-shrink-0" style={{ aspectRatio: '9/16' }}>
      {/* Video element */}
      <video
        ref={videoRef}
        src={videoSrc}
        poster={video.thumbnailUrl ?? undefined}
        loop
        muted={muted}
        playsInline
        className="w-full h-full object-cover cursor-pointer"
        onClick={togglePlay}
      />

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
              src={video.authorPhotoURL}
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

        {/* Share button */}
        <button
          onClick={() => {
            const url = window.location.href;
            if (navigator.share) {
              void navigator.share({ title: video.title || 'Surf Clip', url });
            } else {
              navigator.clipboard.writeText(url).then(() => showToast('🔗 Đã sao chép link')).catch(() => {});
            }
          }}
          className="flex flex-col items-center gap-1"
        >
          <div className="w-12 h-12 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
            </svg>
          </div>
          <span className="text-white text-xs drop-shadow">Chia sẻ</span>
        </button>

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
      <div className="absolute bottom-4 left-4 right-4 z-10">
        <button
          onClick={() => navigate(`/feed/profile/${video.authorId}`)}
          className="font-bold text-sm text-white hover:underline drop-shadow block"
        >
          @{video.authorDisplayName}
        </button>
        {video.title && (
          <p className="text-sm font-medium text-white mt-0.5 drop-shadow line-clamp-2">{video.title}</p>
        )}
        {video.description && (
          <p className="text-xs text-white/80 mt-0.5 drop-shadow line-clamp-2">{video.description}</p>
        )}
        {(video.viewCount ?? 0) > 0 && (
          <p className="text-xs text-white/50 mt-1 drop-shadow">
            {video.viewCount.toLocaleString()} lượt xem
          </p>
        )}
      </div>
      </div>
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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
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
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-200 dark:border-slate-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Đăng Surf Clip</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-500"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Drop zone / preview */}
          {!previewUrl ? (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-2xl p-10 flex flex-col items-center gap-3 cursor-pointer hover:border-cyan-500 dark:hover:border-cyan-400 transition-colors select-none"
            >
              <div className="w-16 h-16 rounded-full bg-cyan-50 dark:bg-cyan-900/30 flex items-center justify-center">
                <svg className="w-8 h-8 text-cyan-600 dark:text-cyan-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5 4.72 4.72a.75.75 0 0 0-1.28.531v15.88a.75.75 0 0 0 1.28.53l11.03-5.78M15.75 10.5l4.72-4.72a.75.75 0 0 1 1.28.531v7.438a.75.75 0 0 1-1.28.53l-4.72-4.96" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Kéo thả hoặc nhấn để chọn video
                </p>
                <p className="text-xs text-gray-500 mt-1">MP4, MOV, WebM — tối đa 200MB</p>
              </div>
            </div>
          ) : (
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-[9/16] max-h-60 mx-auto w-fit">
              <video
                src={previewUrl}
                className="h-full w-auto mx-auto object-contain"
                controls
                muted
              />
              <button
                onClick={() => { setFile(null); setPreviewUrl(null); }}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white text-xs flex items-center justify-center hover:bg-black/80"
              >
                ✕
              </button>
            </div>
          )}

          <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFile} />

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1.5">
              Tiêu đề
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              placeholder="Thêm tiêu đề hấp dẫn..."
              className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1.5">
              Mô tả
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={300}
              rows={2}
              placeholder="Mô tả clip của bạn..."
              className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
            />
          </div>

          {/* Privacy selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-1.5">
              Quyền riêng tư
            </label>
            <div className="flex gap-2">
              {([
                { value: 'public', label: '🌍 Công khai' },
                { value: 'friends', label: '👥 Bạn bè' },
                { value: 'only-me', label: '🔒 Chỉ mình tôi' },
              ] as const).map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setPrivacy(value)}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-all ${
                    privacy === value
                      ? 'bg-cyan-500 text-white border-cyan-500'
                      : 'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-400 hover:border-cyan-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          {/* Progress bar */}
          {uploading && (
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                <span>
                  {progress < 80 ? 'Đang tải lên Cloudinary...' : progress < 100 ? 'Đang lưu metadata...' : '✅ Hoàn thành!'}
                </span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            onClick={() => void handleSubmit()}
            disabled={uploading || !file}
            className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold rounded-xl hover:opacity-90 disabled:opacity-50 active:scale-[0.98] transition-all"
          >
            {uploading ? 'Đang đăng...' : 'Đăng clip'}
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
  const { videos, hasMore, nextCursor, loaded, setFeed, appendFeed, removeVideo, prependVideo } =
    useClipFeedStore();
  const [loading, setLoading] = useState(!loaded);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadFeed = useCallback(async (cursor?: number) => {
    if (cursor) setLoadingMore(true);
    else setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '5' });
      if (cursor) params.set('before', String(cursor));
      const data = (await api.get(`/api/videos/feed?${params.toString()}`)) as {
        videos: ClipVideo[];
        hasMore: boolean;
        nextCursor: number | null;
      };
      if (cursor) {
        appendFeed(data.videos, data.hasMore, data.nextCursor);
      } else {
        setFeed(data.videos, data.hasMore, data.nextCursor);
      }
    } catch (e) {
      console.error('Failed to load video feed:', e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [setFeed, appendFeed]);

  // Chỉ fetch lần đầu nếu store chưa có data
  useEffect(() => {
    if (!loaded) void loadFeed();
  }, [loaded, loadFeed]);

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
    <div className="relative bg-black" style={{ height: 'calc(100vh - 88px)' }}>
      {/* Vertical snap scroll container */}
      <div
        ref={scrollRef}
        className="h-full overflow-y-scroll snap-y snap-mandatory scrollbar-hide"
        onScroll={handleScroll}
      >
        {loading ? (
          // Loading skeleton
          <div
            className="snap-start w-full flex items-center justify-center"
            style={{ height: 'calc(100vh - 88px)' }}
          >
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin" />
              <span className="text-white/60 text-sm">Đang tải clips...</span>
            </div>
          </div>
        ) : videos.length === 0 ? (
          // Empty state
          <div
            className="snap-start w-full flex flex-col items-center justify-center"
            style={{ height: 'calc(100vh - 88px)' }}
          >
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
              <div
                className="snap-start w-full flex items-center justify-center"
                style={{ height: 'calc(100vh - 88px)' }}
              >
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

      {/* Back button + "Surf Clips" title + Upload */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
        <button
          onClick={() => navigate(-1)}
          className="w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/50 active:scale-90 transition-all"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
        <span className="text-white font-bold text-lg drop-shadow-lg pointer-events-none">Surf Clips</span>
        <button
          onClick={() => setShowUpload(true)}
          title="Đăng clip mới"
          className="w-8 h-8 bg-white/20 backdrop-blur-md border border-white/30 rounded-full flex items-center justify-center text-white hover:bg-white/35 active:scale-90 transition-all"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>

      {/* Upload modal */}
      {showUpload && (
        <UploadModal onClose={() => setShowUpload(false)} onUploaded={handleUploaded} />
      )}
    </div>
  );
}
