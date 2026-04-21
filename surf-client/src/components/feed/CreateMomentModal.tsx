import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';
import { uploadImage, uploadVideo } from '../../lib/cloudinary';
import { optimizeImageUrl } from '../../lib/image-cdn';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  preview: string; // 30-second CDN mp3
  cover: string;
}

interface CreateMomentModalProps {
  onClose: () => void;
  onCreated: () => void;
}

type MomentPrivacy = 'public' | 'friends' | 'only_me' | 'custom_allow' | 'custom_block';

interface FriendUser {
  id: string;
  name: string;
  avatarUrl?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const IMAGE_FILTERS = [
  { id: 'none', name: 'Gốc', css: 'none' },
  { id: 'vivid', name: 'Sống động', css: 'saturate(1.8) contrast(1.1)' },
  { id: 'warm', name: 'Ấm áp', css: 'sepia(0.35) saturate(1.5) brightness(1.05)' },
  { id: 'cool', name: 'Mát lạnh', css: 'hue-rotate(25deg) saturate(1.2) brightness(0.95)' },
  { id: 'mono', name: 'Trắng đen', css: 'grayscale(1) contrast(1.1)' },
  { id: 'vintage', name: 'Cổ điển', css: 'sepia(0.6) contrast(0.9) brightness(1.1) saturate(0.9)' },
  { id: 'fade', name: 'Mờ nhạt', css: 'contrast(0.75) brightness(1.2) saturate(0.7)' },
  { id: 'sharp', name: 'Sắc nét', css: 'contrast(1.4) saturate(1.3) brightness(0.95)' },
  { id: 'night', name: 'Đêm tối', css: 'brightness(0.6) saturate(0.8) hue-rotate(200deg)' },
  { id: 'glow', name: 'Rực rỡ', css: 'brightness(1.15) saturate(1.6) hue-rotate(-10deg)' },
];

const TEXT_COLORS = [
  '#ffffff',
  '#000000',
  '#ff3366',
  '#33ccff',
  '#ffcc00',
  '#66ff66',
  '#ff6600',
  '#cc33ff',
];

const FONTS = [
  { id: 'default', name: 'Mặc định', family: 'Inter, sans-serif', preview: 'Abc', gf: null },
  {
    id: 'montserrat',
    name: 'Montserrat',
    family: "'Montserrat', sans-serif",
    preview: 'Abc',
    gf: 'Montserrat:wght@700',
  },
  { id: 'bebas', name: 'Bebas', family: "'Bebas Neue', display", preview: 'ABC', gf: 'Bebas+Neue' },
  {
    id: 'pacifico',
    name: 'Pacifico',
    family: "'Pacifico', cursive",
    preview: 'Abc',
    gf: 'Pacifico',
  },
  {
    id: 'dancing',
    name: 'Dancing',
    family: "'Dancing Script', cursive",
    preview: 'Abc',
    gf: 'Dancing+Script:wght@700',
  },
  { id: 'satisfy', name: 'Satisfy', family: "'Satisfy', cursive", preview: 'Abc', gf: 'Satisfy' },
  {
    id: 'righteous',
    name: 'Righteous',
    family: "'Righteous', display",
    preview: 'Abc',
    gf: 'Righteous',
  },
  {
    id: 'spacemono',
    name: 'Mono',
    family: "'Space Mono', monospace",
    preview: 'Abc',
    gf: 'Space+Mono:wght@400',
  },
];

interface LocalSticker {
  id: string;
  url: string; // object URL
  file: File;
  x: number; // % of preview width
  y: number; // % of preview height
  widthPct: number; // % of preview width
  rotation: number; // degrees
}

type DragTarget =
  | { type: 'text' }
  | { type: 'sticker'; id: string }
  | { type: 'stickerResize'; id: string }
  | { type: 'stickerRotate'; id: string }
  | null;

type EditTab = 'filter' | 'music' | 'text' | 'audio' | 'sticker';

const PRIVACY_OPTIONS: Array<{ value: MomentPrivacy; label: string; desc: string; icon: string }> =
  [
    {
      value: 'public',
      label: 'Công khai',
      desc: 'Bạn bè và người theo dõi bạn có thể xem',
      icon: '🌍',
    },
    { value: 'friends', label: 'Bạn bè', desc: 'Chỉ những bạn bè đã kết nối với bạn', icon: '👥' },
    {
      value: 'only_me',
      label: 'Chỉ mình bạn',
      desc: 'Không ai khác có thể xem Moment này',
      icon: '🔒',
    },
    {
      value: 'custom_allow',
      label: 'Tùy chỉnh: Cho phép',
      desc: 'Chọn những bạn bè được xem',
      icon: '✅',
    },
    {
      value: 'custom_block',
      label: 'Tùy chỉnh: Ẩn với',
      desc: 'Chọn những bạn bè không được xem',
      icon: '🚫',
    },
  ];

// ─── MusicTrackRow sub-component ─────────────────────────────────────────────

function MusicTrackRow({
  track,
  selected,
  previewing,
  saved,
  onSelect,
  onPreview,
  onSave,
}: {
  track: MusicTrack;
  selected: boolean;
  previewing: boolean;
  saved: boolean;
  onSelect: () => void;
  onPreview: (e: React.MouseEvent) => void;
  onSave: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 cursor-pointer transition-colors ${
        selected ? 'bg-cyan-50 dark:bg-cyan-900/20' : 'hover:bg-gray-50 dark:hover:bg-slate-800'
      }`}
      onClick={onSelect}
    >
      <img src={optimizeImageUrl(track.cover)} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
          {track.title}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{track.artist}</p>
      </div>
      {/* Save bookmark */}
      <button
        onClick={onSave}
        title={saved ? 'Bỏ lưu' : 'Lưu bài hát'}
        className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${
          saved
            ? 'text-yellow-500 hover:text-yellow-600'
            : 'text-gray-300 dark:text-slate-600 hover:text-yellow-500'
        }`}
      >
        <svg
          className="w-4 h-4"
          fill={saved ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"
          />
        </svg>
      </button>
      {/* Preview play */}
      <button
        onClick={onPreview}
        className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors flex-shrink-0 ${
          previewing
            ? 'bg-cyan-500 text-white'
            : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-cyan-100 dark:hover:bg-cyan-900/30'
        }`}
      >
        {previewing ? (
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CreateMomentModal({ onClose, onCreated }: CreateMomentModalProps) {
  // Step
  const [step, setStep] = useState<'upload' | 'edit'>('upload');

  // Media
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [isDragging, setIsDragging] = useState(false);

  // Edit options
  const [activeTab, setActiveTab] = useState<EditTab>('filter');
  const [selectedFilter, setSelectedFilter] = useState('none');
  const [textOverlay, setTextOverlay] = useState('');
  const [textColor, setTextColor] = useState('#ffffff');
  const [caption, setCaption] = useState('');
  const [audioMode, setAudioMode] = useState<'original' | 'music' | 'both'>('original');

  // Music
  const [musicQuery, setMusicQuery] = useState('');
  const [musicResults, setMusicResults] = useState<MusicTrack[]>([]);
  const [musicSearching, setMusicSearching] = useState(false);
  const [selectedMusic, setSelectedMusic] = useState<MusicTrack | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Saved tracks (localStorage)
  const [savedTracks, setSavedTracks] = useState<MusicTrack[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('surf_saved_music') ?? '[]');
    } catch {
      return [];
    }
  });
  const isTrackSaved = (id: string) => savedTracks.some((t) => t.id === id);
  const toggleSaveTrack = (track: MusicTrack) => {
    setSavedTracks((prev) => {
      const next = prev.some((t) => t.id === track.id)
        ? prev.filter((t) => t.id !== track.id)
        : [track, ...prev];
      localStorage.setItem('surf_saved_music', JSON.stringify(next));
      return next;
    });
  };

  // Privacy
  const [privacy, setPrivacy] = useState<MomentPrivacy>('public');
  const [privacyAllowList, setPrivacyAllowList] = useState<string[]>([]);
  const [privacyBlockList, setPrivacyBlockList] = useState<string[]>([]);
  const [showPrivacyPanel, setShowPrivacyPanel] = useState(false);
  const [friendsList, setFriendsList] = useState<FriendUser[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);

  const loadFriends = async () => {
    if (friendsList.length > 0) return;
    setFriendsLoading(true);
    try {
      const res = await api.get<{ friends: FriendUser[] }>('/api/friends');
      setFriendsList(res.friends ?? []);
    } catch {
      // ignore
    } finally {
      setFriendsLoading(false);
    }
  };

  // Text positioning & style
  const [textPos, setTextPos] = useState({ x: 50, y: 50 });
  const [selectedFont, setSelectedFont] = useState('default');
  const [textSize, setTextSize] = useState(22);
  const [textStyle, setTextStyle] = useState<'box' | 'plain'>('box');
  const [textRotation, setTextRotation] = useState(0);

  // Sticker image overlays
  const [stickers, setStickers] = useState<LocalSticker[]>([]);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);

  // Drag state (for text and stickers)
  const [dragTarget, setDragTarget] = useState<DragTarget>(null);
  const dragStartRef = useRef({
    pointerX: 0,
    pointerY: 0,
    itemX: 0,
    itemY: 0,
    itemW: 0,
    startAngle: 0,
    itemRotation: 0,
  });
  const previewRef = useRef<HTMLDivElement>(null);

  // Submit
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const stickerInputRef = useRef<HTMLInputElement>(null);
  const musicDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks all object URLs created so we can revoke on unmount
  const objectUrlsRef = useRef<string[]>([]);
  // Refs for live audio preview in edit step
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const editMusicRef = useRef<HTMLAudioElement | null>(null);

  // ── Sync live audio in edit step whenever audioMode / selectedMusic changes
  useEffect(() => {
    if (!previewUrl) return;
    // Video: mute if audioMode === 'music'
    if (videoRef.current) {
      videoRef.current.muted = audioMode === 'music';
    }
    // Music track
    editMusicRef.current?.pause();
    editMusicRef.current = null;
    if (selectedMusic && audioMode !== 'original') {
      const audio = new Audio(selectedMusic.preview);
      audio.volume = 0.55;
      audio.loop = true;
      audio.play().catch(() => {});
      editMusicRef.current = audio;
    }
    return () => {
      editMusicRef.current?.pause();
    };
  }, [audioMode, selectedMusic?.id, previewUrl]);

  // ── Cleanup all object URLs on unmount
  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      previewAudioRef.current?.pause();
      editMusicRef.current?.pause();
    };
  }, []);

  // ── Load Google Fonts dynamically when modal opens
  useEffect(() => {
    const families = FONTS.filter((f) => f.gf)
      .map((f) => f.gf)
      .join('&family=');
    const id = 'surf-moment-fonts';
    if (!document.getElementById(id)) {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${families}&display=swap`;
      document.head.appendChild(link);
    }
  }, []);

  // ── Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // ── Music search debounce
  useEffect(() => {
    if (musicDebounceRef.current) clearTimeout(musicDebounceRef.current);
    if (!musicQuery.trim()) {
      setMusicResults([]);
      return;
    }
    musicDebounceRef.current = setTimeout(async () => {
      setMusicSearching(true);
      try {
        const res = await api.get<{ tracks: MusicTrack[] }>(
          `/api/moments/music/search?q=${encodeURIComponent(musicQuery)}`
        );
        setMusicResults(res.tracks ?? []);
      } catch {
        setMusicResults([]);
      } finally {
        setMusicSearching(false);
      }
    }, 500);
  }, [musicQuery]);

  // ── Handle file selection
  const handleFile = useCallback((f: File) => {
    const isVideo = f.type.startsWith('video/');
    if (!f.type.startsWith('image/') && !isVideo) return;
    const url = URL.createObjectURL(f);
    objectUrlsRef.current.push(url);
    setFile(f);
    setPreviewUrl(url);
    setMediaType(isVideo ? 'video' : 'image');
    setSelectedFilter('none');
    setTextOverlay('');
    setTextPos({ x: 50, y: 50 });
    setTextStyle('box');
    setTextRotation(0);
    setStickers([]);
    setSelectedStickerId(null);
    setDragTarget(null);
    if (isVideo) setActiveTab('audio');
    else setActiveTab('filter');
    setStep('edit');
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  // ── Sticker file handler
  const handleStickerFile = (f: File) => {
    if (!f.type.startsWith('image/')) return;
    const url = URL.createObjectURL(f);
    objectUrlsRef.current.push(url);
    const newSticker: LocalSticker = {
      id: Math.random().toString(36).slice(2),
      url,
      file: f,
      x: 50,
      y: 35,
      widthPct: 35,
      rotation: 0,
    };
    setStickers((prev) => [...prev, newSticker]);
    setSelectedStickerId(newSticker.id);
  };

  // ── Drag handlers
  const startTextDrag = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      itemX: textPos.x,
      itemY: textPos.y,
      itemW: 0,
      startAngle: 0,
      itemRotation: textRotation,
    };
    setDragTarget({ type: 'text' });
  };

  const startStickerDrag = (e: React.PointerEvent, s: LocalSticker) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      itemX: s.x,
      itemY: s.y,
      itemW: s.widthPct,
      startAngle: 0,
      itemRotation: s.rotation,
    };
    setDragTarget({ type: 'sticker', id: s.id });
    setSelectedStickerId(s.id);
  };

  const startStickerResize = (e: React.PointerEvent, s: LocalSticker) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      itemX: s.x,
      itemY: s.y,
      itemW: s.widthPct,
      startAngle: 0,
      itemRotation: s.rotation,
    };
    setDragTarget({ type: 'stickerResize', id: s.id });
  };

  const startStickerRotate = (e: React.PointerEvent, s: LocalSticker) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (!previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const cx = rect.left + (s.x / 100) * rect.width;
    const cy = rect.top + (s.y / 100) * rect.height;
    const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      itemX: s.x,
      itemY: s.y,
      itemW: s.widthPct,
      startAngle,
      itemRotation: s.rotation,
    };
    setDragTarget({ type: 'stickerRotate', id: s.id });
  };

  const handleDragMove = (e: React.PointerEvent) => {
    if (!dragTarget || !previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const dx = ((e.clientX - dragStartRef.current.pointerX) / rect.width) * 100;
    const dy = ((e.clientY - dragStartRef.current.pointerY) / rect.height) * 100;
    if (dragTarget.type === 'text') {
      setTextPos({
        x: Math.max(5, Math.min(95, dragStartRef.current.itemX + dx)),
        y: Math.max(5, Math.min(95, dragStartRef.current.itemY + dy)),
      });
    } else if (dragTarget.type === 'sticker') {
      const { id } = dragTarget;
      setStickers((p) =>
        p.map((s) =>
          s.id === id
            ? {
                ...s,
                x: Math.max(0, Math.min(100, dragStartRef.current.itemX + dx)),
                y: Math.max(0, Math.min(100, dragStartRef.current.itemY + dy)),
              }
            : s
        )
      );
    } else if (dragTarget.type === 'stickerResize') {
      const { id } = dragTarget;
      const delta = (dx + dy) / 2;
      const newW = Math.max(10, Math.min(85, dragStartRef.current.itemW + delta));
      setStickers((p) => p.map((s) => (s.id === id ? { ...s, widthPct: newW } : s)));
    } else if (dragTarget.type === 'stickerRotate') {
      const { id } = dragTarget;
      const cx = rect.left + (dragStartRef.current.itemX / 100) * rect.width;
      const cy = rect.top + (dragStartRef.current.itemY / 100) * rect.height;
      const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
      const delta = angle - dragStartRef.current.startAngle;
      setStickers((p) =>
        p.map((s) =>
          s.id === id ? { ...s, rotation: dragStartRef.current.itemRotation + delta } : s
        )
      );
    }
  };

  // ── Toggle music search preview (30s sample)
  const toggleMusicPreview = (track: MusicTrack) => {
    if (previewingId === track.id) {
      previewAudioRef.current?.pause();
      setPreviewingId(null);
      // resume edit-mode music if active
      if (editMusicRef.current?.paused) editMusicRef.current.play().catch(() => {});
    } else {
      previewAudioRef.current?.pause();
      // pause edit-mode music while sampling
      editMusicRef.current?.pause();
      const audio = new Audio(track.preview);
      audio.volume = 0.6;
      audio.play().catch(() => {});
      audio.onended = () => {
        setPreviewingId(null);
        if (editMusicRef.current?.paused) editMusicRef.current.play().catch(() => {});
      };
      previewAudioRef.current = audio;
      setPreviewingId(track.id);
    }
  };

  // ── Submit
  const handleSubmit = async () => {
    if (!file || !previewUrl) return;
    setIsSubmitting(true);
    try {
      let mediaUrl: string;
      if (mediaType === 'image') {
        mediaUrl = await uploadImage(file, { folder: 'surf/moments' });
      } else {
        mediaUrl = await uploadVideo(file, { folder: 'surf/moments/videos' });
      }

      // Upload sticker images
      const uploadedStickers =
        stickers.length > 0
          ? await Promise.all(
              stickers.map(async (s) => {
                const url = await uploadImage(s.file, { folder: 'surf/moments/stickers' });
                return { url, x: s.x, y: s.y, widthPct: s.widthPct, rotation: s.rotation };
              })
            )
          : null;

      const hasText = textOverlay.trim().length > 0;
      const fontFamily =
        selectedFont !== 'default'
          ? (FONTS.find((f) => f.id === selectedFont)?.family ?? null)
          : null;

      await api.post('/api/moments', {
        mediaUrl,
        mediaType,
        caption: caption.trim() || null,
        filter: selectedFilter !== 'none' ? selectedFilter : null,
        textOverlay: hasText ? textOverlay.trim() : null,
        textColor: hasText ? textColor : null,
        textFont: hasText ? fontFamily : null,
        textSize: hasText ? textSize : null,
        textX: hasText ? textPos.x : null,
        textY: hasText ? textPos.y : null,
        textStyle: hasText ? textStyle : null,
        textRotation: hasText ? textRotation : null,
        stickers: uploadedStickers,
        musicUrl: selectedMusic?.preview ?? null,
        musicTitle: selectedMusic?.title ?? null,
        musicArtist: selectedMusic?.artist ?? null,
        audioMode:
          mediaType === 'video'
            ? selectedMusic && audioMode === 'original'
              ? 'both'
              : audioMode
            : selectedMusic
              ? 'music'
              : 'original',
        privacy,
        privacyAllowList: privacy === 'custom_allow' ? privacyAllowList : null,
        privacyBlockList: privacy === 'custom_block' ? privacyBlockList : null,
      });

      onCreated();
      onClose();
    } catch (err) {
      console.error('Failed to create moment:', err);
      alert('Không thể đăng Moment. Thử lại nhé!');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filterCss = IMAGE_FILTERS.find((f) => f.id === selectedFilter)?.css ?? 'none';
  const currentFontFamily = FONTS.find((f) => f.id === selectedFont)?.family ?? 'Inter, sans-serif';

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" onClick={onClose} />

      {/* Modal */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="pointer-events-auto w-full bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
          style={{ maxWidth: step === 'edit' ? 900 : 480, maxHeight: '92vh' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex-shrink-0 bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-slate-800 dark:to-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                <span className="text-white text-sm font-bold">M</span>
              </div>
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white">
                  {step === 'upload' ? 'Tạo Moment' : 'Chỉnh sửa Moment'}
                </h2>
                {step === 'edit' && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Moment tồn tại trong 24 giờ
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-600 dark:text-gray-300 transition-colors"
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

          {/* ── Step 1: Upload ── */}
          {step === 'upload' && (
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`w-full max-w-sm flex flex-col items-center gap-5 rounded-3xl border-2 border-dashed p-10 cursor-pointer transition-all duration-200 ${
                  isDragging
                    ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20'
                    : 'border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 hover:border-cyan-400 hover:bg-cyan-50/50 dark:hover:bg-slate-700'
                }`}
              >
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-xl shadow-cyan-500/30">
                  <svg
                    className="w-10 h-10 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-base font-semibold text-gray-800 dark:text-gray-200">
                    Kéo thả hoặc nhấn để chọn
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Ảnh hoặc Video</p>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-gray-500">
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                    JPG, PNG, WEBP
                  </span>
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    MP4, MOV, WEBM
                  </span>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </div>
          )}

          {/* ── Step 2: Edit ── */}
          {step === 'edit' && previewUrl && (
            <div className="flex flex-1 overflow-hidden">
              {/* ── Left: 9:16 preview ── */}
              <div
                className="flex-shrink-0 flex items-center justify-center bg-black p-4"
                style={{ width: 280 }}
              >
                <div
                  ref={previewRef}
                  className="relative rounded-2xl overflow-hidden bg-black shadow-2xl select-none"
                  style={{ width: 240, height: 427 }}
                  onClick={() => setSelectedStickerId(null)}
                >
                  {/* Media */}
                  {mediaType === 'image' ? (
                    <img
                      src={previewUrl}
                      alt="preview"
                      className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                      style={{ filter: filterCss }}
                    />
                  ) : (
                    <video
                      ref={videoRef}
                      src={previewUrl}
                      className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                      style={{ filter: filterCss }}
                      autoPlay
                      loop
                      playsInline
                    />
                  )}

                  {/* Sticker image overlays */}
                  {stickers.map((s) => (
                    <div
                      key={s.id}
                      className="absolute cursor-move"
                      style={{
                        left: `${s.x}%`,
                        top: `${s.y}%`,
                        width: `${s.widthPct}%`,
                        transform: `translate(-50%, -50%) rotate(${s.rotation}deg)`,
                        zIndex: 15,
                        touchAction: 'none',
                        outline: selectedStickerId === s.id ? '2px solid #22d3ee' : 'none',
                        outlineOffset: 2,
                        borderRadius: 4,
                      }}
                      onPointerDown={(e) => startStickerDrag(e, s)}
                      onPointerMove={handleDragMove}
                      onPointerUp={() => setDragTarget(null)}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <img src={optimizeImageUrl(s.url)} alt="" className="w-full h-auto block" draggable={false} />
                      {/* Resize, rotate, delete controls when selected */}
                      {selectedStickerId === s.id && (
                        <>
                          {/* Resize — cyan dot, bottom-right */}
                          <div
                            className="absolute bottom-0 right-0 w-5 h-5 bg-cyan-500 rounded-full border-2 border-white cursor-se-resize shadow"
                            style={{
                              transform: 'translate(50%,50%)',
                              zIndex: 20,
                              touchAction: 'none',
                            }}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              startStickerResize(e, s);
                            }}
                            onPointerMove={handleDragMove}
                            onPointerUp={() => setDragTarget(null)}
                          />
                          {/* Rotate — green dot, bottom-left */}
                          <div
                            className="absolute bottom-0 left-0 w-5 h-5 bg-green-500 rounded-full border-2 border-white cursor-grab shadow flex items-center justify-center"
                            style={{
                              transform: 'translate(-50%,50%)',
                              zIndex: 20,
                              touchAction: 'none',
                            }}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              startStickerRotate(e, s);
                            }}
                            onPointerMove={handleDragMove}
                            onPointerUp={() => setDragTarget(null)}
                            title="Xoay"
                          >
                            <svg
                              className="w-3 h-3 text-white"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2.5}
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                              />
                            </svg>
                          </div>
                          {/* Delete — red dot, top-right */}
                          <button
                            className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full border-2 border-white text-white flex items-center justify-center shadow"
                            style={{ zIndex: 20 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setStickers((p) => p.filter((st) => st.id !== s.id));
                              setSelectedStickerId(null);
                            }}
                          >
                            <svg
                              className="w-2.5 h-2.5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={3}
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  ))}

                  {/* Text overlay — draggable */}
                  {textOverlay && (
                    <div
                      className="absolute cursor-move"
                      style={{
                        left: `${textPos.x}%`,
                        top: `${textPos.y}%`,
                        transform: `translate(-50%, -50%) rotate(${textRotation}deg)`,
                        zIndex: 20,
                        maxWidth: '85%',
                        touchAction: 'none',
                      }}
                      onPointerDown={startTextDrag}
                      onPointerMove={handleDragMove}
                      onPointerUp={() => setDragTarget(null)}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div
                        className="px-3 py-2 rounded-xl text-center leading-tight shadow-lg"
                        style={{
                          color: textColor,
                          fontFamily: currentFontFamily,
                          fontSize: `${textSize}px`,
                          textShadow:
                            textStyle === 'plain'
                              ? '0 1px 8px rgba(0,0,0,0.95), 0 0 24px rgba(0,0,0,0.7)'
                              : '0 1px 4px rgba(0,0,0,0.7)',
                          background: textStyle === 'box' ? 'rgba(0,0,0,0.25)' : 'transparent',
                          backdropFilter: textStyle === 'box' ? 'blur(4px)' : 'none',
                          userSelect: 'none',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {textOverlay}
                      </div>
                    </div>
                  )}

                  {/* Music pill */}
                  {selectedMusic && (
                    <div
                      className="absolute bottom-3 left-3 right-3 flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1.5 pointer-events-none"
                      style={{ zIndex: 10 }}
                    >
                      <div
                        className="w-5 h-5 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0 animate-spin"
                        style={{ animationDuration: '3s' }}
                      >
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                        </svg>
                      </div>
                      <span className="text-white text-xs truncate">
                        {selectedMusic.title} — {selectedMusic.artist}
                      </span>
                    </div>
                  )}

                  {/* Drag hint */}
                  {(textOverlay || stickers.length > 0) && (
                    <div
                      className="absolute bottom-1 inset-x-0 text-center pointer-events-none"
                      style={{ zIndex: 25 }}
                    >
                      <span className="text-white/40 text-[9px]">kéo để di chuyển</span>
                    </div>
                  )}

                  {/* Change media button */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute top-2 right-2 w-7 h-7 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                    style={{ zIndex: 30 }}
                    title="Đổi ảnh/video"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(f);
                      e.target.value = '';
                    }}
                  />
                  <input
                    ref={stickerInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleStickerFile(f);
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>

              {/* ── Right: Edit panel ── */}
              <div className="flex-1 flex flex-col overflow-hidden border-l border-gray-200 dark:border-slate-700 relative">
                {/* Tabs */}
                <div className="flex border-b border-gray-200 dark:border-slate-700 flex-shrink-0 bg-gray-50 dark:bg-slate-800">
                  {[
                    { id: 'filter' as EditTab, label: 'Bộ lọc', icon: '🎨', show: true },
                    { id: 'text' as EditTab, label: 'Chữ', icon: '✍️', show: true },
                    { id: 'sticker' as EditTab, label: 'Dán ảnh', icon: '🖼️', show: true },
                    { id: 'music' as EditTab, label: 'Nhạc', icon: '🎵', show: true },
                    {
                      id: 'audio' as EditTab,
                      label: 'Âm thanh',
                      icon: '🔊',
                      show: mediaType === 'video',
                    },
                  ]
                    .filter((t) => t.show)
                    .map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 py-3 text-xs font-medium flex flex-col items-center gap-0.5 transition-colors ${
                          activeTab === tab.id
                            ? 'text-cyan-600 dark:text-cyan-400 border-b-2 border-cyan-500'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                        }`}
                      >
                        <span>{tab.icon}</span>
                        {tab.label}
                      </button>
                    ))}
                </div>

                {/* Tab content */}
                <div className="flex-1 overflow-y-auto p-4">
                  {/* Bộ lọc */}
                  {activeTab === 'filter' && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wide">
                        Chọn bộ lọc
                      </p>
                      <div className="grid grid-cols-3 gap-3">
                        {IMAGE_FILTERS.map((f) => (
                          <button
                            key={f.id}
                            onClick={() => setSelectedFilter(f.id)}
                            className={`flex flex-col items-center gap-1.5 p-1.5 rounded-xl transition-all ${
                              selectedFilter === f.id
                                ? 'ring-2 ring-cyan-500 bg-cyan-50 dark:bg-cyan-900/20'
                                : 'hover:bg-gray-100 dark:hover:bg-slate-700'
                            }`}
                          >
                            <div
                              className="w-full rounded-lg overflow-hidden"
                              style={{ aspectRatio: '9/12' }}
                            >
                              {mediaType === 'image' ? (
                                <img
                                  src={previewUrl!}
                                  alt={f.name}
                                  className="w-full h-full object-cover"
                                  style={{ filter: f.css }}
                                />
                              ) : (
                                <div
                                  className="w-full h-full bg-gradient-to-br from-cyan-400 to-blue-600"
                                  style={{ filter: f.css }}
                                />
                              )}
                            </div>
                            <span
                              className={`text-[10px] font-medium ${selectedFilter === f.id ? 'text-cyan-600 dark:text-cyan-400' : 'text-gray-600 dark:text-gray-400'}`}
                            >
                              {f.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Chữ */}
                  {activeTab === 'text' && (
                    <div className="space-y-4">
                      {/* Text input */}
                      <div>
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                          Nội dung chữ
                        </p>
                        <textarea
                          value={textOverlay}
                          onChange={(e) => setTextOverlay(e.target.value)}
                          placeholder="Nhập chữ hiển thị trên ảnh..."
                          maxLength={60}
                          className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 resize-none"
                          rows={2}
                        />
                        <p className="text-right text-xs text-gray-400 mt-0.5">
                          {textOverlay.length}/60
                        </p>
                      </div>

                      {/* Font selector */}
                      <div>
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                          Font chữ
                        </p>
                        <div className="grid grid-cols-4 gap-1.5">
                          {FONTS.map((f) => (
                            <button
                              key={f.id}
                              onClick={() => setSelectedFont(f.id)}
                              className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all ${
                                selectedFont === f.id
                                  ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20'
                                  : 'border-gray-200 dark:border-slate-700 hover:border-cyan-300'
                              }`}
                            >
                              <span
                                className="text-base font-semibold text-gray-800 dark:text-gray-200 leading-none"
                                style={{ fontFamily: f.family }}
                              >
                                {f.preview}
                              </span>
                              <span
                                className={`text-[9px] w-full text-center truncate ${
                                  selectedFont === f.id
                                    ? 'text-cyan-600 dark:text-cyan-400'
                                    : 'text-gray-500 dark:text-gray-400'
                                }`}
                              >
                                {f.name}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Size slider */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                            Cỡ chữ
                          </p>
                          <span className="text-xs font-medium text-cyan-600 dark:text-cyan-400">
                            {textSize}px
                          </span>
                        </div>
                        <input
                          type="range"
                          min={12}
                          max={52}
                          step={2}
                          value={textSize}
                          onChange={(e) => setTextSize(Number(e.target.value))}
                          className="w-full accent-cyan-500"
                        />
                      </div>

                      {/* Color */}
                      <div>
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                          Màu chữ
                        </p>
                        <div className="flex gap-2 flex-wrap">
                          {TEXT_COLORS.map((c) => (
                            <button
                              key={c}
                              onClick={() => setTextColor(c)}
                              className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${textColor === c ? 'border-cyan-500 scale-110' : 'border-transparent'}`}
                              style={{
                                background: c,
                                boxShadow: c === '#ffffff' ? '0 0 0 1px #ccc inset' : 'none',
                              }}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Text style toggle */}
                      <div>
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                          Kiểu chữ
                        </p>
                        <div className="flex gap-2">
                          {(['box', 'plain'] as const).map((style) => (
                            <button
                              key={style}
                              onClick={() => setTextStyle(style)}
                              className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${
                                textStyle === style
                                  ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400'
                                  : 'border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-400 hover:border-cyan-300'
                              }`}
                            >
                              {style === 'box' ? 'Có khung' : 'Không khung'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Text rotation */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                            Góc xoay
                          </p>
                          <span className="text-xs font-medium text-cyan-600 dark:text-cyan-400">
                            {textRotation}°
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-180}
                          max={180}
                          step={1}
                          value={textRotation}
                          onChange={(e) => setTextRotation(Number(e.target.value))}
                          className="w-full accent-cyan-500"
                        />
                      </div>

                      {textOverlay && (
                        <p className="text-xs text-gray-400 dark:text-slate-500 bg-gray-50 dark:bg-slate-800/60 rounded-xl px-3 py-2">
                          💡 Kéo chữ trên preview để di chuyển · Kéo thanh xoay để xoay
                        </p>
                      )}
                    </div>
                  )}

                  {/* Dán ảnh */}
                  {activeTab === 'sticker' && (
                    <div className="space-y-3">
                      <button
                        onClick={() => stickerInputRef.current?.click()}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl font-medium text-sm hover:from-cyan-600 hover:to-blue-700 transition-all shadow-md shadow-cyan-500/20"
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
                            d="M12 4v16m8-8H4"
                          />
                        </svg>
                        Thêm ảnh chồng lên
                      </button>

                      {stickers.length > 0 ? (
                        <>
                          <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-slate-800/60 rounded-xl px-3 py-2">
                            💡 Nhấn ảnh trên preview để chọn → kéo để di chuyển. Kéo{' '}
                            <strong>chấm xanh</strong> (góc dưới phải) để thay đổi kích thước.
                          </p>
                          <div className="space-y-2">
                            {stickers.map((s, i) => (
                              <div
                                key={s.id}
                                className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                                  selectedStickerId === s.id
                                    ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20'
                                    : 'border-gray-200 dark:border-slate-700 hover:border-cyan-300'
                                }`}
                                onClick={() => setSelectedStickerId(s.id)}
                              >
                                <img
                                  src={optimizeImageUrl(s.url)}
                                  alt=""
                                  className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Ảnh {i + 1}
                                  </p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Rộng: {Math.round(s.widthPct)}%
                                  </p>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setStickers((prev) => prev.filter((st) => st.id !== s.id));
                                    if (selectedStickerId === s.id) setSelectedStickerId(null);
                                  }}
                                  className="w-7 h-7 flex items-center justify-center rounded-full bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100 transition-colors flex-shrink-0"
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
                                </button>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div className="text-center py-8 text-gray-400 dark:text-slate-500">
                          <p className="text-4xl mb-2">🖼️</p>
                          <p className="text-sm font-medium">Thêm ảnh chồng lên Moment</p>
                          <p className="text-xs mt-1">
                            Kéo di chuyển và kéo góc để thay đổi kích thước
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Nhạc */}
                  {activeTab === 'music' && (
                    <div className="space-y-3">
                      {/* Search */}
                      <div className="relative">
                        <svg
                          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                          />
                        </svg>
                        <input
                          value={musicQuery}
                          onChange={(e) => setMusicQuery(e.target.value)}
                          placeholder="Tìm tên bài hát, ca sĩ..."
                          className="w-full pl-9 pr-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                        />
                        {musicSearching && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                          </div>
                        )}
                      </div>

                      {/* Selected music */}
                      {selectedMusic && (
                        <div className="flex items-center gap-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-xl p-3 border border-cyan-200 dark:border-cyan-800">
                          <img
                            src={optimizeImageUrl(selectedMusic.cover)}
                            alt=""
                            className="w-10 h-10 rounded-lg object-cover"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                              {selectedMusic.title}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              {selectedMusic.artist}
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              setSelectedMusic(null);
                              if (previewingId === selectedMusic?.id) {
                                previewAudioRef.current?.pause();
                                setPreviewingId(null);
                              }
                            }}
                            className="text-gray-400 hover:text-red-500 transition-colors ml-1"
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
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        </div>
                      )}

                      {/* Đã lưu */}
                      {savedTracks.length > 0 && !musicQuery && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                            <svg
                              className="w-3.5 h-3.5 text-yellow-500"
                              fill="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" />
                            </svg>
                            Đã lưu
                          </p>
                          <div className="space-y-1">
                            {savedTracks.map((track) => (
                              <MusicTrackRow
                                key={track.id}
                                track={track}
                                selected={selectedMusic?.id === track.id}
                                previewing={previewingId === track.id}
                                saved
                                onSelect={() => setSelectedMusic(track)}
                                onPreview={(e) => {
                                  e.stopPropagation();
                                  toggleMusicPreview(track);
                                }}
                                onSave={(e) => {
                                  e.stopPropagation();
                                  toggleSaveTrack(track);
                                }}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Results */}
                      {(musicQuery || savedTracks.length === 0) && (
                        <div className="space-y-1">
                          {musicQuery && musicResults.length > 0 && (
                            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                              Kết quả
                            </p>
                          )}
                          {musicResults.map((track) => (
                            <MusicTrackRow
                              key={track.id}
                              track={track}
                              selected={selectedMusic?.id === track.id}
                              previewing={previewingId === track.id}
                              saved={isTrackSaved(track.id)}
                              onSelect={() => setSelectedMusic(track)}
                              onPreview={(e) => {
                                e.stopPropagation();
                                toggleMusicPreview(track);
                              }}
                              onSave={(e) => {
                                e.stopPropagation();
                                toggleSaveTrack(track);
                              }}
                            />
                          ))}
                          {!musicSearching && musicQuery && musicResults.length === 0 && (
                            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                              Không tìm thấy bài hát nào
                            </p>
                          )}
                          {!musicQuery && savedTracks.length === 0 && (
                            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                              Nhập tên bài hát hoặc ca sĩ để tìm kiếm 🎵
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Âm thanh (video only) */}
                  {activeTab === 'audio' && mediaType === 'video' && (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        Nguồn âm thanh
                      </p>
                      {[
                        {
                          value: 'original' as const,
                          label: 'Giữ âm gốc',
                          desc: 'Chỉ dùng âm thanh từ video của bạn',
                          icon: '🎬',
                        },
                        {
                          value: 'music' as const,
                          label: 'Chỉ nhạc nền',
                          desc: 'Tắt âm video, chỉ phát nhạc đã chọn',
                          icon: '🎵',
                        },
                        {
                          value: 'both' as const,
                          label: 'Cả hai',
                          desc: 'Kết hợp âm video + nhạc nền',
                          icon: '🎶',
                        },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setAudioMode(opt.value)}
                          className={`w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all text-left ${
                            audioMode === opt.value
                              ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20'
                              : 'border-gray-200 dark:border-slate-700 hover:border-cyan-300 hover:bg-gray-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          <span className="text-2xl">{opt.icon}</span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-sm font-semibold ${audioMode === opt.value ? 'text-cyan-700 dark:text-cyan-400' : 'text-gray-800 dark:text-gray-200'}`}
                              >
                                {opt.label}
                              </span>
                              {audioMode === opt.value && (
                                <svg
                                  className="w-4 h-4 text-cyan-500"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              {opt.desc}
                            </p>
                          </div>
                        </button>
                      ))}
                      {(audioMode === 'music' || audioMode === 'both') && !selectedMusic && (
                        <div className="flex items-center gap-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-3 text-sm text-yellow-700 dark:text-yellow-400">
                          <span>⚠️</span>
                          <span>
                            Chuyển sang tab <strong>Nhạc</strong> để chọn bài hát
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Caption + Submit */}
                <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-slate-700 space-y-3">
                  <input
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Thêm chú thích... (không bắt buộc)"
                    maxLength={100}
                    className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                  {/* Privacy selector button */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowPrivacyPanel(true);
                      loadFriends();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl hover:border-cyan-400 dark:hover:border-cyan-600 transition-colors"
                  >
                    <span className="text-base">
                      {PRIVACY_OPTIONS.find((o) => o.value === privacy)?.icon}
                    </span>
                    <div className="flex-1 text-left">
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                        {PRIVACY_OPTIONS.find((o) => o.value === privacy)?.label}
                      </span>
                      {(privacy === 'custom_allow' || privacy === 'custom_block') && (
                        <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                          {privacy === 'custom_allow'
                            ? `${privacyAllowList.length} người`
                            : `Ẩn với ${privacyBlockList.length} người`}
                        </span>
                      )}
                    </div>
                    <svg
                      className="w-4 h-4 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="w-full py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/25 transition-all"
                  >
                    {isSubmitting ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Đang đăng...
                      </span>
                    ) : (
                      '🌊 Đăng Moment'
                    )}
                  </button>
                </div>

                {/* ── Privacy overlay panel ── */}
                {showPrivacyPanel && (
                  <div className="absolute inset-0 z-30 flex flex-col bg-white dark:bg-slate-900">
                    {/* Header */}
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
                      <button
                        onClick={() => setShowPrivacyPanel(false)}
                        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-600 dark:text-gray-300 transition-colors"
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
                            d="M15 19l-7-7 7-7"
                          />
                        </svg>
                      </button>
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                        Quyền riêng tư
                      </h3>
                    </div>

                    {/* Options */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                      {PRIVACY_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setPrivacy(opt.value)}
                          className={`w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all text-left ${
                            privacy === opt.value
                              ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20'
                              : 'border-gray-200 dark:border-slate-700 hover:border-cyan-300 hover:bg-gray-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          <span className="text-2xl">{opt.icon}</span>
                          <div className="flex-1">
                            <p
                              className={`text-sm font-semibold ${
                                privacy === opt.value
                                  ? 'text-cyan-700 dark:text-cyan-400'
                                  : 'text-gray-800 dark:text-gray-200'
                              }`}
                            >
                              {opt.label}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              {opt.desc}
                            </p>
                          </div>
                          {privacy === opt.value && (
                            <svg
                              className="w-5 h-5 text-cyan-500 flex-shrink-0"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                        </button>
                      ))}

                      {/* Friend picker for custom modes */}
                      {(privacy === 'custom_allow' || privacy === 'custom_block') && (
                        <div className="mt-4">
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                            {privacy === 'custom_allow'
                              ? 'Chọn bạn bè được xem'
                              : 'Chọn bạn bè không được xem'}
                          </p>

                          {friendsLoading ? (
                            <div className="flex justify-center py-6">
                              <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                            </div>
                          ) : friendsList.length === 0 ? (
                            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                              Không có bạn bè nào
                            </p>
                          ) : (
                            <div className="space-y-1">
                              {friendsList.map((friend) => {
                                const list =
                                  privacy === 'custom_allow' ? privacyAllowList : privacyBlockList;
                                const setList =
                                  privacy === 'custom_allow'
                                    ? setPrivacyAllowList
                                    : setPrivacyBlockList;
                                const checked = list.includes(friend.id);
                                return (
                                  <button
                                    key={friend.id}
                                    onClick={() =>
                                      setList((prev) =>
                                        checked
                                          ? prev.filter((id) => id !== friend.id)
                                          : [...prev, friend.id]
                                      )
                                    }
                                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${
                                      checked
                                        ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20'
                                        : 'border-transparent hover:bg-gray-50 dark:hover:bg-slate-800'
                                    }`}
                                  >
                                    <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
                                      {friend.avatarUrl ? (
                                        <img
                                          src={optimizeImageUrl(friend.avatarUrl)}
                                          alt=""
                                          className="w-full h-full object-cover"
                                        />
                                      ) : (
                                        <span className="text-white text-sm font-bold">
                                          {friend.name.charAt(0).toUpperCase()}
                                        </span>
                                      )}
                                    </div>
                                    <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200 text-left truncate">
                                      {friend.name}
                                    </span>
                                    <div
                                      className={`w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0 ${
                                        checked
                                          ? 'bg-cyan-500 border-cyan-500'
                                          : 'border-gray-300 dark:border-slate-600'
                                      }`}
                                    >
                                      {checked && (
                                        <svg
                                          className="w-3 h-3 text-white"
                                          fill="currentColor"
                                          viewBox="0 0 20 20"
                                        >
                                          <path
                                            fillRule="evenodd"
                                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                            clipRule="evenodd"
                                          />
                                        </svg>
                                      )}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Done button */}
                    <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-slate-700">
                      <button
                        onClick={() => setShowPrivacyPanel(false)}
                        className="w-full py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 transition-all"
                      >
                        Xong
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
