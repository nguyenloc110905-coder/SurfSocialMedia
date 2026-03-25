import { useState, useEffect, useRef } from 'react';
import { api } from '../../lib/api';
import type { MomentItem } from './MomentViewer';

// ─── Types ────────────────────────────────────────────────────────────────────

type MomentPrivacy = 'public' | 'friends' | 'only_me' | 'custom_allow' | 'custom_block';

interface FriendUser {
  id: string;
  name: string;
  avatarUrl?: string;
}

type EditTab = 'caption' | 'filter' | 'text' | 'privacy';

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fontIdFromFamily(family: string | undefined): string {
  if (!family) return 'default';
  const found = FONTS.find((f) => f.family === family);
  return found?.id ?? 'default';
}

// ─── Component ────────────────────────────────────────────────────────────────

interface EditMomentModalProps {
  moment: MomentItem;
  onClose: () => void;
  onSaved: (updated: MomentItem) => void;
}

export default function EditMomentModal({ moment, onClose, onSaved }: EditMomentModalProps) {
  const [activeTab, setActiveTab] = useState<EditTab>('caption');

  // Caption
  const [caption, setCaption] = useState(moment.caption ?? '');

  // Filter
  const [selectedFilter, setSelectedFilter] = useState(
    moment.filter && moment.filter !== 'none' ? moment.filter : 'none'
  );

  // Text
  const [textOverlay, setTextOverlay] = useState(moment.textOverlay ?? '');
  const [textColor, setTextColor] = useState(moment.textColor ?? '#ffffff');
  const [selectedFont, setSelectedFont] = useState(fontIdFromFamily(moment.textFont));
  const [textSize, setTextSize] = useState(moment.textSize ?? 22);
  const [textStyle, setTextStyle] = useState<'box' | 'plain'>(moment.textStyle ?? 'box');
  const [textRotation, setTextRotation] = useState(moment.textRotation ?? 0);
  const [textPos, setTextPos] = useState({ x: moment.textX ?? 50, y: moment.textY ?? 50 });

  // Drag state for text
  const previewRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const editMusicRef = useRef<HTMLAudioElement | null>(null);
  const dragActiveRef = useRef(false);
  const dragStartRef = useRef({ pointerX: 0, pointerY: 0, itemX: 0, itemY: 0 });

  const [muted, setMuted] = useState(false);

  const startTextDrag = (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragActiveRef.current = true;
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      itemX: textPos.x,
      itemY: textPos.y,
    };
  };

  const handleDragMove = (e: React.PointerEvent) => {
    if (!dragActiveRef.current || !previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const dx = ((e.clientX - dragStartRef.current.pointerX) / rect.width) * 100;
    const dy = ((e.clientY - dragStartRef.current.pointerY) / rect.height) * 100;
    setTextPos({
      x: Math.max(5, Math.min(95, dragStartRef.current.itemX + dx)),
      y: Math.max(5, Math.min(95, dragStartRef.current.itemY + dy)),
    });
  };

  // Privacy
  const [privacy, setPrivacy] = useState<MomentPrivacy>(
    (moment.privacy as MomentPrivacy | undefined) ?? 'public'
  );
  const [privacyAllowList, setPrivacyAllowList] = useState<string[]>(
    (moment.privacyAllowList as string[] | undefined) ?? []
  );
  const [privacyBlockList, setPrivacyBlockList] = useState<string[]>(
    (moment.privacyBlockList as string[] | undefined) ?? []
  );
  const [friendsList, setFriendsList] = useState<FriendUser[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);

  const loadFriends = async () => {
    if (friendsList.length > 0) return;
    setFriendsLoading(true);
    try {
      const res = await api.get<{ friends: FriendUser[] }>('/api/friends');
      setFriendsList(res.friends ?? []);
    } catch {
      /* ignore */
    } finally {
      setFriendsLoading(false);
    }
  };

  // Submit
  const [isSaving, setIsSaving] = useState(false);

  const currentFontFamily = FONTS.find((f) => f.id === selectedFont)?.family ?? 'Inter, sans-serif';
  const filterCss = IMAGE_FILTERS.find((f) => f.id === selectedFilter)?.css ?? 'none';

  // Load Google Fonts
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

  // Sync audio: video mute + background music
  useEffect(() => {
    const audioMode = moment.audioMode ?? 'original';
    if (videoRef.current) {
      videoRef.current.muted = muted || audioMode === 'music';
    }
    editMusicRef.current?.pause();
    editMusicRef.current = null;
    if (moment.musicUrl && audioMode !== 'original' && !muted) {
      const audio = new Audio(moment.musicUrl);
      audio.volume = 0.55;
      audio.loop = true;
      audio.play().catch(() => {});
      editMusicRef.current = audio;
    }
    return () => {
      editMusicRef.current?.pause();
    };
  }, [muted, moment.musicUrl, moment.audioMode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      editMusicRef.current?.pause();
    };
  }, []);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const hasText = textOverlay.trim().length > 0;
      const fontId =
        selectedFont !== 'default'
          ? (FONTS.find((f) => f.id === selectedFont)?.family ?? null)
          : null;

      const payload: Record<string, unknown> = {
        caption: caption.trim() || null,
        filter: selectedFilter !== 'none' ? selectedFilter : null,
        textOverlay: hasText ? textOverlay.trim() : null,
        textColor: hasText ? textColor : null,
        textFont: hasText ? fontId : null,
        textSize: hasText ? textSize : null,
        textX: hasText ? textPos.x : null,
        textY: hasText ? textPos.y : null,
        textStyle: hasText ? textStyle : null,
        textRotation: hasText ? textRotation : null,
        privacy,
        privacyAllowList: privacy === 'custom_allow' ? privacyAllowList : null,
        privacyBlockList: privacy === 'custom_block' ? privacyBlockList : null,
      };

      const updated = await api.patch<MomentItem>(`/api/moments/${moment.id}`, payload);
      onSaved({ ...moment, ...updated });
      onClose();
    } catch {
      alert('Không thể lưu thay đổi. Thử lại nhé!');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60]" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
          style={{ maxWidth: 820, maxHeight: '92vh' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex-shrink-0 bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-slate-800 dark:to-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                <svg
                  className="w-4 h-4 text-white"
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
              </div>
              <h2 className="text-base font-bold text-gray-900 dark:text-white">
                Chỉnh sửa Moment
              </h2>
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

          {/* Body */}
          <div className="flex flex-1 overflow-hidden">
            {/* Left: Preview */}
            <div
              className="flex-shrink-0 flex items-center justify-center bg-black p-4"
              style={{ width: 260 }}
            >
              <div
                ref={previewRef}
                className="relative rounded-2xl overflow-hidden bg-black shadow-2xl select-none"
                style={{ width: 220, height: 391 }}
              >
                {/* Media */}
                {moment.mediaType === 'image' ? (
                  <img
                    src={moment.mediaUrl}
                    alt="preview"
                    className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                    style={{ filter: filterCss }}
                  />
                ) : (
                  <video
                    ref={videoRef}
                    src={moment.mediaUrl}
                    className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                    style={{ filter: filterCss }}
                    autoPlay
                    loop
                    playsInline
                  />
                )}

                {/* Mute toggle */}
                <button
                  onClick={() => setMuted((m) => !m)}
                  className="absolute top-2 left-2 w-7 h-7 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm text-white hover:bg-black/70 transition-colors"
                  style={{ zIndex: 30 }}
                  title={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}
                >
                  {muted ? (
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M16.5 12A4.5 4.5 0 0014 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06A8.99 8.99 0 0017.73 19L19 20.27 20.27 19 5.27 4 4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                    </svg>
                  )}
                </button>

                {/* Existing stickers (non-interactive in edit) */}
                {moment.stickers?.map((s, i) => (
                  <div
                    key={i}
                    className="absolute pointer-events-none"
                    style={{
                      left: `${s.x}%`,
                      top: `${s.y}%`,
                      width: `${s.widthPct}%`,
                      transform: `translate(-50%,-50%) rotate(${s.rotation ?? 0}deg)`,
                      zIndex: 6,
                    }}
                  >
                    <img src={s.url} alt="" className="w-full h-auto block" />
                  </div>
                ))}

                {/* Text overlay — draggable */}
                {textOverlay && (
                  <div
                    className="absolute cursor-move"
                    style={{
                      left: `${textPos.x}%`,
                      top: `${textPos.y}%`,
                      transform: `translate(-50%,-50%) rotate(${textRotation}deg)`,
                      zIndex: 20,
                      maxWidth: '85%',
                      touchAction: 'none',
                    }}
                    onPointerDown={startTextDrag}
                    onPointerMove={handleDragMove}
                    onPointerUp={() => {
                      dragActiveRef.current = false;
                    }}
                  >
                    <div
                      className="px-3 py-2 rounded-xl text-center leading-tight shadow-lg"
                      style={{
                        color: textColor,
                        fontFamily: currentFontFamily,
                        fontSize: `${(textSize * 220) / 240}px`,
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
                {moment.musicTitle && (
                  <div
                    className="absolute bottom-3 left-2 right-2 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm rounded-full px-2.5 py-1 pointer-events-none"
                    style={{ zIndex: 10 }}
                  >
                    <div
                      className="w-4 h-4 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0 animate-spin"
                      style={{ animationDuration: '3s' }}
                    >
                      <svg
                        className="w-2.5 h-2.5 text-white"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                      </svg>
                    </div>
                    <span className="text-white text-[10px] truncate">{moment.musicTitle}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Edit panel */}
            <div className="flex-1 flex flex-col overflow-hidden border-l border-gray-200 dark:border-slate-700">
              {/* Tabs */}
              <div className="flex border-b border-gray-200 dark:border-slate-700 flex-shrink-0 bg-gray-50 dark:bg-slate-800">
                {(
                  [
                    { id: 'caption' as EditTab, label: 'Chú thích', icon: '💬' },
                    { id: 'filter' as EditTab, label: 'Bộ lọc', icon: '🎨' },
                    { id: 'text' as EditTab, label: 'Chữ', icon: '✍️' },
                    { id: 'privacy' as EditTab, label: 'Riêng tư', icon: '🔒' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      if (tab.id === 'privacy') loadFriends();
                    }}
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
                {/* Chú thích */}
                {activeTab === 'caption' && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Chú thích
                    </p>
                    <textarea
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                      placeholder="Thêm chú thích..."
                      maxLength={100}
                      className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 resize-none"
                      rows={3}
                    />
                    <p className="text-right text-xs text-gray-400">{caption.length}/100</p>
                  </div>
                )}

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
                            {moment.mediaType === 'image' ? (
                              <img
                                src={moment.mediaUrl}
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

                    {/* Font */}
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
                              className={`text-[9px] w-full text-center truncate ${selectedFont === f.id ? 'text-cyan-600 dark:text-cyan-400' : 'text-gray-500 dark:text-gray-400'}`}
                            >
                              {f.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Size */}
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

                    {/* Style */}
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

                    {/* Rotation */}
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
                        💡 Kéo chữ trên preview để di chuyển
                      </p>
                    )}
                  </div>
                )}

                {/* Quyền riêng tư */}
                {activeTab === 'privacy' && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                      Ai có thể xem Moment này?
                    </p>

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
                            className={`text-sm font-semibold ${privacy === opt.value ? 'text-cyan-700 dark:text-cyan-400' : 'text-gray-800 dark:text-gray-200'}`}
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

                    {/* Friend picker */}
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
                                        src={friend.avatarUrl}
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
                )}
              </div>

              {/* Footer */}
              <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-slate-700 flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Huỷ
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/25 transition-all"
                >
                  {isSaving ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Đang lưu...
                    </span>
                  ) : (
                    'Lưu thay đổi'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
