import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../lib/api';
import { optimizeImageUrl } from '../../lib/image-cdn';
import EditMomentModal from './EditMomentModal';

// ─── Types ────────────────────────────────────────────────────────────────────
export type ReactionEntry = {
  uid: string;
  name: string;
  photoURL: string | null;
  emoji: string;
  ts: number;
};
export interface MomentItem {
  id: string;
  userId: string;
  userDisplayName: string;
  userPhotoURL: string | null;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  caption?: string;
  filter?: string;
  textOverlay?: string;
  textColor?: string;
  textFont?: string; // CSS font-family string
  textSize?: number; // px at 240px canvas width
  textX?: number; // % of container width
  textY?: number; // % of container height
  textStyle?: 'box' | 'plain';
  textRotation?: number; // degrees
  stickers?: Array<{ url: string; x: number; y: number; widthPct: number; rotation?: number }>;
  musicUrl?: string;
  musicTitle?: string;
  musicArtist?: string;
  audioMode?: 'original' | 'music' | 'both';
  privacy?: string;
  privacyAllowList?: string[];
  privacyBlockList?: string[];
  reactions?: Record<string, number>;
  reactionsList?: ReactionEntry[];
  viewedBy: string[];
  viewCount: number;
  createdAt: unknown;
  expiresAt: unknown;
}

export interface MomentGroup {
  userId: string;
  userDisplayName: string;
  userPhotoURL: string | null;
  moments: MomentItem[];
  hasUnviewed: boolean;
}

interface MomentViewerProps {
  groups: MomentGroup[];
  startGroupIndex: number;
  currentUserId: string;
  onClose: () => void;
  onGroupsChange?: (updated: MomentGroup[]) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const IMAGE_DURATION = 5000; // ms
const VIDEO_MAX_DURATION = 15000; // ms cap for very long videos

const REACTIONS = ['❤️', '😍', '😂', '😮', '👏', '🔥'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatAgo(ts: unknown): string {
  let date: Date;
  try {
    if (ts && typeof ts === 'object' && '_seconds' in (ts as object)) {
      date = new Date((ts as { _seconds: number })._seconds * 1000);
    } else if (ts && typeof ts === 'object' && 'seconds' in (ts as object)) {
      date = new Date((ts as { seconds: number }).seconds * 1000);
    } else {
      date = new Date(ts as string | number);
    }
  } catch {
    return '';
  }
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Vừa xong';
  if (mins < 60) return `${mins} phút`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} giờ`;
  return `${Math.floor(hrs / 24)} ngày`;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MomentViewer({
  groups,
  startGroupIndex,
  currentUserId,
  onClose,
  onGroupsChange,
}: MomentViewerProps) {
  const [groupIdx, setGroupIdx] = useState(startGroupIndex);
  const [momentIdx, setMomentIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showReactorsPanel, setShowReactorsPanel] = useState(false);
  const [message, setMessage] = useState('');
  const [fallingEmojis, setFallingEmojis] = useState<
    Array<{ id: number; emoji: string; x: number }>
  >([]);
  const fallingIdRef = useRef(0);
  const replayedRef = useRef<Set<string>>(new Set());
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  // For scaling text size relative to creator's 240px canvas
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentW, setContentW] = useState(360);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const viewedRef = useRef<Set<string>>(new Set());

  const currentGroup = groups[groupIdx];
  const currentMoment = currentGroup?.moments[momentIdx];

  // ── Advance / navigate ──────────────────────────────────────────────────────

  const goNextMoment = useCallback(() => {
    setProgress(0);
    setVideoDuration(null);
    setShowReactions(false);
    if (momentIdx < currentGroup.moments.length - 1) {
      setMomentIdx((p) => p + 1);
    } else if (groupIdx < groups.length - 1) {
      setGroupIdx((p) => p + 1);
      setMomentIdx(0);
    } else {
      onClose();
    }
  }, [momentIdx, groupIdx, currentGroup, groups, onClose]);

  const goPrevMoment = useCallback(() => {
    setProgress(0);
    setVideoDuration(null);
    setShowReactions(false);
    if (momentIdx > 0) {
      setMomentIdx((p) => p - 1);
    } else if (groupIdx > 0) {
      setGroupIdx((p) => p - 1);
      setMomentIdx(groups[groupIdx - 1].moments.length - 1);
    }
  }, [momentIdx, groupIdx, groups]);

  const goNextGroup = () => {
    if (groupIdx < groups.length - 1) {
      setGroupIdx((p) => p + 1);
      setMomentIdx(0);
      setProgress(0);
      setVideoDuration(null);
      setShowReactions(false);
    } else {
      onClose();
    }
  };

  const goPrevGroup = () => {
    if (groupIdx > 0) {
      setGroupIdx((p) => p - 1);
      setMomentIdx(0);
      setProgress(0);
      setVideoDuration(null);
      setShowReactions(false);
    }
  };

  // ── Mark viewed ─────────────────────────────────────────────────────────────

  useEffect(() => {
    if (contentRef.current) setContentW(contentRef.current.offsetWidth);
  }, [currentMoment?.id]);

  useEffect(() => {
    if (!currentMoment) return;
    if (viewedRef.current.has(currentMoment.id)) return;
    viewedRef.current.add(currentMoment.id);
    api.post(`/api/moments/${currentMoment.id}/view`, {}).catch(() => {});
  }, [currentMoment?.id]);

  // ── Progress timer ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!currentMoment || paused) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    const isVideo = currentMoment.mediaType === 'video';
    const duration = isVideo
      ? Math.min((videoDuration ?? 5) * 1000, VIDEO_MAX_DURATION)
      : IMAGE_DURATION;

    // Wait for video to have actual duration before starting timer
    if (isVideo && videoDuration === null) return;

    const step = 100 / (duration / 50);
    timerRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev + step >= 100) {
          clearInterval(timerRef.current!);
          setTimeout(goNextMoment, 150);
          return 100;
        }
        return prev + step;
      });
    }, 50);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentMoment?.id, paused, videoDuration]);

  // ── Sync audio ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!currentMoment) return;
    const audioMode = currentMoment.audioMode ?? 'original';
    const musicUrl = currentMoment.musicUrl;

    // Video audio
    if (videoRef.current) {
      videoRef.current.muted = muted || audioMode === 'music';
    }

    // Music audio
    if (musicRef.current) {
      musicRef.current.pause();
      musicRef.current = null;
    }
    if (musicUrl && audioMode !== 'original' && !muted) {
      const audio = new Audio(musicUrl);
      audio.volume = 0.55;
      audio.loop = false;
      audio.play().catch(() => {});
      musicRef.current = audio;
    }

    return () => {
      musicRef.current?.pause();
    };
  }, [currentMoment?.id, muted]);

  // ── Keyboard nav ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') goNextMoment();
      if (e.key === 'ArrowLeft') goPrevMoment();
      if (e.key === ' ') setPaused((p) => !p);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [goNextMoment, goPrevMoment, onClose]);
  // ── Replay reactions as falling emojis for own moments ─────────────────
  useEffect(() => {
    if (!currentMoment || !currentGroup) return;
    if (currentGroup.userId !== currentUserId) return;
    if (replayedRef.current.has(currentMoment.id)) return;
    const list = currentMoment.reactionsList;
    if (!list?.length) return;
    replayedRef.current.add(currentMoment.id);
    list.slice(-10).forEach((entry, i) => {
      setTimeout(() => {
        const id = ++fallingIdRef.current;
        const x = 10 + Math.random() * 65;
        setFallingEmojis((prev) => [...prev, { id, emoji: entry.emoji, x }]);
        setTimeout(() => setFallingEmojis((prev) => prev.filter((e) => e.id !== id)), 1900);
      }, i * 280);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMoment?.id]);
  // ── React to moment ─────────────────────────────────────────────

  const handleReact = async (emoji: string) => {
    if (!currentMoment) return;
    // keep picker open so user can react multiple times

    // Spawn falling emoji animation
    const id = ++fallingIdRef.current;
    const x = 10 + Math.random() * 65;
    setFallingEmojis((prev) => [...prev, { id, emoji, x }]);
    setTimeout(() => setFallingEmojis((prev) => prev.filter((e) => e.id !== id)), 1900);

    // Optimistic update
    const newReactions = {
      ...(currentMoment.reactions ?? {}),
      [emoji]: ((currentMoment.reactions ?? {})[emoji] ?? 0) + 1,
    };
    onGroupsChange?.(
      groups.map((g, gi) => {
        if (gi !== groupIdx) return g;
        return {
          ...g,
          moments: g.moments.map((m) =>
            m.id === currentMoment.id ? { ...m, reactions: newReactions } : m
          ),
        };
      })
    );

    try {
      const momentId = currentMoment.id;
      const result = await api.post<{
        reactions: Record<string, number>;
        reactionsList: ReactionEntry[];
      }>(`/api/moments/${momentId}/react`, { emoji });
      onGroupsChange?.(
        groups.map((g, gi) => {
          if (gi !== groupIdx) return g;
          return {
            ...g,
            moments: g.moments.map((m) =>
              m.id === momentId
                ? { ...m, reactions: result.reactions, reactionsList: result.reactionsList }
                : m
            ),
          };
        })
      );
    } catch {
      /* leave optimistic update */
    }
  };

  // ── Edit moment ──────────────────────────────────────────────────────────────

  const handleMomentEdited = (updated: MomentItem) => {
    const updatedGroups = groups.map((g, gi) => {
      if (gi !== groupIdx) return g;
      return { ...g, moments: g.moments.map((m) => (m.id === updated.id ? updated : m)) };
    });
    onGroupsChange?.(updatedGroups);
    setShowEditModal(false);
  };

  // ── Delete moment ────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!currentMoment) return;
    if (!confirm('Xoá Moment này?')) return;
    setShowOptions(false);
    try {
      await api.delete(`/api/moments/${currentMoment.id}`);
      // Remove from local state
      const updatedGroups = groups
        .map((g, gi) => {
          if (gi !== groupIdx) return g;
          const updatedMoments = g.moments.filter((m) => m.id !== currentMoment.id);
          return { ...g, moments: updatedMoments };
        })
        .filter((g) => g.moments.length > 0);
      onGroupsChange?.(updatedGroups);
      if (!updatedGroups.length) {
        onClose();
        return;
      }
      // Navigate safely
      const newMomentIdx = Math.min(momentIdx, (updatedGroups[groupIdx]?.moments.length ?? 1) - 1);
      setMomentIdx(newMomentIdx);
    } catch {
      alert('Không thể xoá Moment.');
    }
  };

  if (!currentMoment || !currentGroup) return null;

  const isOwn = currentGroup.userId === currentUserId;
  const filterCss = currentMoment.filter ?? 'none';
  const reactions = currentMoment.reactions ?? {};
  const reactionEntries = Object.entries(reactions)
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1]);
  const totalReactions = reactionEntries.reduce((s, [, c]) => s + c, 0);

  return (
    <>
      {/* Full-screen backdrop */}
      <div
        className="fixed inset-0 bg-black z-50 flex items-center justify-center"
        onClick={onClose}
      >
        {/* ── Prev Group Arrow ── */}
        {groupIdx > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              goPrevGroup();
            }}
            className="hidden sm:flex absolute left-4 w-11 h-11 items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors z-10 backdrop-blur-sm"
            aria-label="Nhóm trước"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
        )}

        {/* ── Content card ── */}
        <div
          className="relative rounded-3xl overflow-hidden shadow-2xl"
          style={{ width: 'min(390px, 95vw)', height: 'min(692px, 95vh)', aspectRatio: '9/16' }}
          onClick={(e) => e.stopPropagation()}
          ref={contentRef}
        >
          {/* Falling emoji reactions */}
          {fallingEmojis.map(({ id, emoji, x }) => (
            <div
              key={id}
              className="absolute pointer-events-none z-[25] text-3xl emoji-fall select-none"
              style={{ left: `${x}%`, top: '-10px' }}
            >
              {emoji}
            </div>
          ))}

          {/* Media */}
          {currentMoment.mediaType === 'image' ? (
            <img
              key={currentMoment.id}
              src={optimizeImageUrl(currentMoment.mediaUrl)}
              alt="moment"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: filterCss }}
            />
          ) : (
            <video
              key={currentMoment.id}
              ref={videoRef}
              src={currentMoment.mediaUrl}
              className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: filterCss }}
              autoPlay
              playsInline
              muted={muted || (currentMoment.audioMode ?? 'original') === 'music'}
              onLoadedMetadata={(e) => {
                const vid = e.currentTarget;
                setVideoDuration(vid.duration);
              }}
              onPause={() => setPaused(true)}
              onPlay={() => setPaused(false)}
            />
          )}

          {/* Gradient overlays */}
          <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/70 to-transparent pointer-events-none" />
          <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />

          {/* ── Top Progress Bars ── */}
          <div className="absolute top-3 left-3 right-3 flex gap-1 z-10">
            {currentGroup.moments.map((m, i) => (
              <div key={m.id} className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-none"
                  style={{
                    width: i < momentIdx ? '100%' : i === momentIdx ? `${progress}%` : '0%',
                  }}
                />
              </div>
            ))}
          </div>

          {/* ── Top User Info ── */}
          <div className="absolute top-7 left-3 right-3 flex items-center gap-2.5 z-10">
            {/* Avatar */}
            <div className="w-10 h-10 rounded-full ring-2 ring-white/70 overflow-hidden flex-shrink-0 bg-gradient-to-br from-cyan-500 to-blue-600">
              {currentGroup.userPhotoURL ? (
                <img
                  src={optimizeImageUrl(currentGroup.userPhotoURL)}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white text-sm font-bold">
                  {getInitials(currentGroup.userDisplayName)}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold leading-tight truncate">
                {currentGroup.userDisplayName}
              </p>
              <p className="text-white/70 text-xs">{formatAgo(currentMoment.createdAt)}</p>
            </div>
            {/* Controls */}
            <div className="flex items-center gap-1.5">
              {/* Mute toggle */}
              <button
                onClick={() => setMuted((m) => !m)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-black/30 text-white hover:bg-black/50 transition-colors backdrop-blur-sm"
              >
                {muted ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M16.5 12A4.5 4.5 0 0014 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06A8.99 8.99 0 0017.73 19L19 20.27 20.27 19 5.27 4 4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                  </svg>
                )}
              </button>
              {/* Pause toggle */}
              <button
                onClick={() => setPaused((p) => !p)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-black/30 text-white hover:bg-black/50 transition-colors backdrop-blur-sm"
              >
                {paused ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  </svg>
                )}
              </button>
              {/* Options */}
              {isOwn && (
                <div className="relative">
                  <button
                    onClick={() => setShowOptions((p) => !p)}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-black/30 text-white hover:bg-black/50 transition-colors backdrop-blur-sm"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                    </svg>
                  </button>
                  {showOptions && (
                    <div className="absolute top-10 right-0 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden z-20 w-44">
                      <button
                        onClick={() => {
                          setShowOptions(false);
                          setShowEditModal(true);
                          setPaused(true);
                        }}
                        className="w-full flex items-center gap-2 px-4 py-3 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                      >
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
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                        Chỉnh sửa
                      </button>
                      <button
                        onClick={handleDelete}
                        className="w-full flex items-center gap-2 px-4 py-3 text-red-600 dark:text-red-400 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
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
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                        Xoá Moment
                      </button>
                    </div>
                  )}
                </div>
              )}
              {/* Close */}
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-black/30 text-white hover:bg-black/50 transition-colors backdrop-blur-sm"
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
          </div>

          {/* ── Tap zones: prev / next moment ── */}
          <div className="absolute inset-0 flex z-[5]">
            <div
              className="w-1/3 h-full cursor-pointer"
              onClick={goPrevMoment}
              onPointerDown={() => setPaused(true)}
              onPointerUp={() => setPaused(false)}
            />
            <div
              className="w-2/3 h-full cursor-pointer"
              onClick={goNextMoment}
              onPointerDown={() => setPaused(true)}
              onPointerUp={() => setPaused(false)}
            />
          </div>

          {/* Sticker image overlays */}
          {currentMoment.stickers?.map((s, i) => (
            <div
              key={i}
              className="absolute pointer-events-none"
              style={{
                left: `${s.x}%`,
                top: `${s.y}%`,
                width: `${s.widthPct}%`,
                transform: `translate(-50%, -50%) rotate(${s.rotation ?? 0}deg)`,
                zIndex: 6,
              }}
            >
              <img src={optimizeImageUrl(s.url)} alt="" className="w-full h-auto block" />
            </div>
          ))}

          {/* Text overlay — positioned */}
          {currentMoment.textOverlay && (
            <div
              className="absolute pointer-events-none"
              style={{
                left: `${currentMoment.textX ?? 50}%`,
                top: `${currentMoment.textY ?? 50}%`,
                transform: `translate(-50%, -50%) rotate(${currentMoment.textRotation ?? 0}deg)`,
                zIndex: 7,
                maxWidth: '85%',
              }}
            >
              <div
                className="px-4 py-2.5 rounded-2xl text-center leading-snug shadow-xl"
                style={{
                  color: currentMoment.textColor ?? '#ffffff',
                  fontFamily: currentMoment.textFont ?? 'Inter, sans-serif',
                  fontSize: `${((currentMoment.textSize ?? 22) * contentW) / 240}px`,
                  textShadow:
                    currentMoment.textStyle === 'plain'
                      ? '0 1px 8px rgba(0,0,0,0.95), 0 0 24px rgba(0,0,0,0.7)'
                      : '0 1px 6px rgba(0,0,0,0.8)',
                  background:
                    (currentMoment.textStyle ?? 'box') === 'box'
                      ? 'rgba(0,0,0,0.22)'
                      : 'transparent',
                  backdropFilter:
                    (currentMoment.textStyle ?? 'box') === 'box' ? 'blur(6px)' : 'none',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {currentMoment.textOverlay}
              </div>
            </div>
          )}

          {/* Music pill */}
          {currentMoment.musicUrl && (
            <div className="absolute bottom-[74px] left-4 right-4 flex items-center gap-2 bg-black/50 backdrop-blur-md rounded-full px-3 py-1.5 z-[7]">
              <div
                className="w-5 h-5 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0 animate-spin"
                style={{ animationDuration: '3s' }}
              >
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                </svg>
              </div>
              <p className="text-white text-xs font-medium truncate">
                {currentMoment.musicTitle} — {currentMoment.musicArtist}
              </p>
            </div>
          )}

          {/* Caption */}
          {currentMoment.caption && (
            <div className="absolute bottom-16 left-4 right-4 z-[7]">
              <p
                className="text-white text-sm text-center font-medium"
                style={{ textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}
              >
                {currentMoment.caption}
              </p>
            </div>
          )}

          {/* ── Bottom bar ── */}
          <>
            {/* Reaction summary pills */}
            {reactionEntries.length > 0 && (
              <div className="absolute bottom-[58px] left-3 flex items-center gap-1 z-10 flex-wrap">
                {reactionEntries.slice(0, 5).map(([emoji, count]) =>
                  isOwn ? (
                    <button
                      key={emoji}
                      onClick={() => setShowReactorsPanel(true)}
                      className="flex items-center gap-0.5 bg-black/60 backdrop-blur-sm text-white text-xs px-2 py-0.5 rounded-full hover:bg-black/80 transition-colors"
                    >
                      <span>{emoji}</span>
                      <span className="font-semibold">{count}</span>
                    </button>
                  ) : (
                    <span
                      key={emoji}
                      className="flex items-center gap-0.5 bg-black/60 backdrop-blur-sm text-white text-xs px-2 py-0.5 rounded-full"
                    >
                      <span>{emoji}</span>
                      <span className="font-semibold">{count}</span>
                    </span>
                  )
                )}
              </div>
            )}

            <div className="absolute bottom-0 left-0 right-0 p-3 z-10 flex items-center gap-2">
              {isOwn ? (
                /* Own: view count + reaction count */
                <div className="flex items-center gap-3 text-white/80 text-xs w-full">
                  <div className="flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                    </svg>
                    <span>{currentMoment.viewCount} lượt xem</span>
                  </div>
                  {totalReactions > 0 && (
                    <button
                      onClick={() => setShowReactorsPanel(true)}
                      className="flex items-center gap-1 hover:text-white transition-colors"
                    >
                      <span>
                        {reactionEntries
                          .slice(0, 3)
                          .map(([e]) => e)
                          .join('')}
                      </span>
                      <span className="font-semibold">{totalReactions} tương tác</span>
                    </button>
                  )}
                </div>
              ) : (
                /* Others: emoji reaction button + message input */
                <>
                  <div className="relative flex-shrink-0">
                    <button
                      onClick={() => setShowReactions((p) => !p)}
                      className="w-9 h-9 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors backdrop-blur-sm text-lg"
                    >
                      😊
                    </button>
                    {totalReactions > 0 && (
                      <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none pointer-events-none">
                        {totalReactions > 99 ? '99+' : totalReactions}
                      </span>
                    )}
                    {showReactions && (
                      <div className="absolute bottom-12 left-0 flex gap-1.5 bg-black/70 backdrop-blur-md rounded-2xl p-2 shadow-xl">
                        {REACTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => handleReact(emoji)}
                            className="text-2xl hover:scale-125 transition-transform"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <input
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={`Trả lời ${currentGroup.userDisplayName}...`}
                    className="flex-1 bg-white/15 backdrop-blur-sm text-white placeholder-white/60 text-sm rounded-full px-4 py-2 focus:outline-none focus:bg-white/25 transition-colors"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && message.trim()) {
                        /* TODO: send message */ setMessage('');
                      }
                    }}
                  />
                </>
              )}
            </div>
          </>

          {/* ── Who reacted panel (own moments) ── */}
          {isOwn &&
            showReactorsPanel &&
            (() => {
              const list = currentMoment.reactionsList ?? [];
              const byUid = new Map<
                string,
                { uid: string; name: string; photoURL: string | null; emojis: string[] }
              >();
              for (const e of list) {
                if (!byUid.has(e.uid))
                  byUid.set(e.uid, { uid: e.uid, name: e.name, photoURL: e.photoURL, emojis: [] });
                byUid.get(e.uid)!.emojis.push(e.emoji);
              }
              const grouped = Array.from(byUid.values());
              return (
                <div
                  className="absolute inset-0 z-[40] flex flex-col rounded-3xl overflow-hidden"
                  style={{ background: 'rgba(0,0,0,0.9)' }}
                >
                  <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/10 flex-shrink-0">
                    <h3 className="text-white font-semibold text-sm">
                      Cảm xúc{totalReactions > 0 ? ` (${totalReactions})` : ''}
                    </h3>
                    <button
                      onClick={() => setShowReactorsPanel(false)}
                      className="w-7 h-7 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white text-sm transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="overflow-y-auto flex-1 px-3 py-2 scrollbar-hide">
                    {grouped.length === 0 ? (
                      <p className="text-white/50 text-sm text-center py-10">Chưa có cảm xúc nào</p>
                    ) : (
                      grouped.map(({ uid, name, photoURL, emojis }) => (
                        <div
                          key={uid}
                          className="flex items-center gap-3 py-2.5 border-b border-white/10 last:border-0"
                        >
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 overflow-hidden flex-shrink-0">
                            {photoURL ? (
                              <img src={optimizeImageUrl(photoURL)} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-white text-sm font-bold">
                                {name.charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <p className="text-white text-sm font-medium flex-1 truncate">{name}</p>
                          <div className="text-xl leading-none tracking-wide">
                            {emojis.slice(-5).join(' ')}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })()}

          {/* Close outside tap zone overlay (top right, gaps around controls) */}
        </div>

        {/* ── Next Group Arrow ── */}
        {groupIdx < groups.length - 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              goNextGroup();
            }}
            className="hidden sm:flex absolute right-4 w-11 h-11 items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors z-10 backdrop-blur-sm"
            aria-label="Nhóm kế tiếp"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* Edit modal */}
      {showEditModal && currentMoment && (
        <EditMomentModal
          moment={currentMoment}
          onClose={() => {
            setShowEditModal(false);
            setPaused(false);
          }}
          onSaved={handleMomentEdited}
        />
      )}
    </>
  );
}
