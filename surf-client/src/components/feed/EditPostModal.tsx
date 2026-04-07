import { useState, useRef, useEffect } from 'react';
import { api } from '../../lib/api';
import { uploadImage, uploadVideo, isVideoUrl } from '../../lib/cloudinary';
import { resizePostImage } from '../../lib/utils/image';
import TagFriendsModal from './TagFriendsModal';

interface TaggedFriend {
  uid: string;
  displayName: string;
  photoURL?: string | null;
}

interface Post {
  id: string;
  content: string;
  mediaUrls: string[];
  privacy?: 'public' | 'friends' | 'only-me' | 'custom';
  feeling?: string;
  location?: string;
  taggedFriends?: TaggedFriend[];
  isEdited?: boolean;
}

interface EditPostModalProps {
  post: Post;
  onClose: () => void;
  onSaved: (updatedPost: Record<string, unknown>) => void;
}

interface NewMediaItem {
  id: string;
  url: string;
  file: File;
  type: 'image' | 'video';
}

const PRIVACY_OPTIONS = [
  { value: 'public', icon: '🌐', label: 'Công khai', desc: 'Ai cũng có thể xem' },
  { value: 'friends', icon: '👥', label: 'Bạn bè', desc: 'Chỉ bạn bè của bạn' },
  { value: 'only-me', icon: '🔒', label: 'Chỉ mình tôi', desc: 'Chỉ bạn có thể xem' },
  { value: 'custom', icon: '⚙️', label: 'Tùy chỉnh', desc: 'Chọn đối tượng cụ thể' },
] as const;

const FEELINGS = [
  { emoji: '😊', label: 'Vui vẻ' },
  { emoji: '😍', label: 'Yêu thích' },
  { emoji: '😎', label: 'Ngầu' },
  { emoji: '😢', label: 'Buồn' },
  { emoji: '😡', label: 'Giận dữ' },
  { emoji: '🥳', label: 'Hào hứng' },
  { emoji: '😴', label: 'Mệt mỏi' },
  { emoji: '🤔', label: 'Suy nghĩ' },
];

export default function EditPostModal({ post, onClose, onSaved }: EditPostModalProps) {
  const [content, setContent] = useState(post.content);
  const [privacy, setPrivacy] = useState<'public' | 'friends' | 'only-me' | 'custom'>(
    post.privacy ?? 'public'
  );
  const [feeling, setFeeling] = useState(post.feeling ?? '');
  const [location, setLocation] = useState(post.location ?? '');
  const [keepMediaUrls, setKeepMediaUrls] = useState<string[]>(post.mediaUrls ?? []);
  const [newMedia, setNewMedia] = useState<NewMediaItem[]>([]);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>(
    (post.taggedFriends ?? []).map((f) => f.uid)
  );
  const [taggedFriends, setTaggedFriends] = useState<TaggedFriend[]>(post.taggedFriends ?? []);
  const [showPrivacyDropdown, setShowPrivacyDropdown] = useState(false);
  const [showFeelingPicker, setShowFeelingPicker] = useState(false);
  const [showLocationInput, setShowLocationInput] = useState(!!post.location);
  const [showTagModal, setShowTagModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmExit, setShowConfirmExit] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [content]);

  const hasChanges =
    content !== post.content ||
    privacy !== (post.privacy ?? 'public') ||
    feeling !== (post.feeling ?? '') ||
    location !== (post.location ?? '') ||
    keepMediaUrls.length !== (post.mediaUrls ?? []).length ||
    newMedia.length > 0 ||
    selectedFriendIds.length !== (post.taggedFriends ?? []).length;

  const handleClose = () => {
    if (hasChanges) {
      setShowConfirmExit(true);
    } else {
      onClose();
    }
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasChanges]);

  // Keep taggedFriends display names in sync with selectedFriendIds
  useEffect(() => {
    if (selectedFriendIds.length === 0) {
      setTaggedFriends([]);
      return;
    }
    const load = async () => {
      try {
        const res = await api.get<{
          friends: { id: string; name: string; avatarUrl?: string | null }[];
        }>('/api/friends');
        const all: TaggedFriend[] = (res.friends ?? []).map((f) => ({
          uid: f.id,
          displayName: f.name,
          photoURL: f.avatarUrl ?? null,
        }));
        setTaggedFriends(all.filter((f) => selectedFriendIds.includes(f.uid)));
      } catch {
        // Keep existing display names if fetch fails
        setTaggedFriends((prev) => prev.filter((f) => selectedFriendIds.includes(f.uid)));
      }
    };
    void load();
  }, [selectedFriendIds]);

  const removeKeepMedia = (url: string) => {
    setKeepMediaUrls((prev) => prev.filter((u) => u !== url));
  };

  const handleNewMediaSelect = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'image' | 'video'
  ) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    const items: NewMediaItem[] = await Promise.all(
      files.map(async (file) => {
        if (type === 'image') {
          const blob = await resizePostImage(file);
          const resized = new File([blob], file.name, { type: 'image/jpeg' });
          return {
            id: Math.random().toString(36),
            url: URL.createObjectURL(blob),
            file: resized,
            type,
          };
        }
        return {
          id: Math.random().toString(36),
          url: URL.createObjectURL(file),
          file,
          type,
        };
      })
    );
    setNewMedia((prev) => [...prev, ...items]);
  };

  const removeNewMedia = (id: string) => {
    setNewMedia((prev) => {
      const removed = prev.find((m) => m.id === id);
      if (removed) URL.revokeObjectURL(removed.url);
      return prev.filter((m) => m.id !== id);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() && keepMediaUrls.length === 0 && newMedia.length === 0) return;
    setIsSubmitting(true);
    try {
      // Upload new media
      const uploadedUrls = await Promise.all(
        newMedia.map((m) =>
          m.type === 'image'
            ? uploadImage(m.file, { folder: 'surf/posts' })
            : uploadVideo(m.file, { folder: 'surf/posts/videos' })
        )
      );

      const mediaUrls = [
        ...[...keepMediaUrls, ...uploadedUrls].filter((u) => isVideoUrl(u)),
        ...[...keepMediaUrls, ...uploadedUrls].filter((u) => !isVideoUrl(u)),
      ];
      const taggedFriendsData = taggedFriends
        .filter((f) => selectedFriendIds.includes(f.uid))
        .map((f) => ({ uid: f.uid, displayName: f.displayName, photoURL: f.photoURL ?? null }));

      const updated = await api.patch<Record<string, unknown>>(`/api/posts/${post.id}`, {
        content: content.trim(),
        mediaUrls,
        privacy,
        feeling: feeling || null,
        location: location.trim() || null,
        taggedFriends: taggedFriendsData,
      });

      onSaved(updated);
      onClose();
    } catch (err) {
      console.error('Failed to edit post:', err);
      alert('Không thể cập nhật bài viết. Vui lòng thử lại!');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedPrivacy = PRIVACY_OPTIONS.find((o) => o.value === privacy)!;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onClick={handleClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-lg bg-white dark:bg-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700 flex-shrink-0">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              Chỉnh sửa bài viết
            </h2>
            <button
              onClick={handleClose}
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

          {/* Scrollable body */}
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* Content textarea */}
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Bạn đang nghĩ gì?"
                className="w-full resize-none bg-transparent text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 text-base leading-relaxed focus:outline-none min-h-[80px]"
                autoFocus
              />

              {/* Feeling / Location / Tag row */}
              {(feeling || post.location) && (
                <div className="flex flex-wrap gap-2 text-sm text-gray-500 dark:text-gray-400">
                  {feeling && (
                    <span className="flex items-center gap-1 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 px-2 py-1 rounded-lg">
                      {feeling}
                      <button
                        type="button"
                        onClick={() => setFeeling('')}
                        className="hover:text-red-500"
                      >
                        ×
                      </button>
                    </span>
                  )}
                  {location && (
                    <span className="flex items-center gap-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-2 py-1 rounded-lg">
                      📍 {location}
                      <button
                        type="button"
                        onClick={() => setLocation('')}
                        className="hover:text-red-500"
                      >
                        ×
                      </button>
                    </span>
                  )}
                  {taggedFriends.map((f) => (
                    <span
                      key={f.uid}
                      className="flex items-center gap-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 px-2 py-1 rounded-lg"
                    >
                      👤 {f.displayName}
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedFriendIds((prev) => prev.filter((id) => id !== f.uid))
                        }
                        className="hover:text-red-500"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Feeling picker */}
              {showFeelingPicker && (
                <div className="grid grid-cols-4 gap-2">
                  {FEELINGS.map((f) => (
                    <button
                      key={f.emoji}
                      type="button"
                      onClick={() => {
                        setFeeling(
                          feeling === `${f.emoji} ${f.label}` ? '' : `${f.emoji} ${f.label}`
                        );
                        setShowFeelingPicker(false);
                      }}
                      className={`flex flex-col items-center gap-1 p-2 rounded-xl text-xs transition-colors ${
                        feeling.startsWith(f.emoji)
                          ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700'
                          : 'hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      <span className="text-2xl">{f.emoji}</span>
                      {f.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Location input */}
              {showLocationInput && (
                <div className="flex items-center gap-2 bg-gray-50 dark:bg-slate-700/50 rounded-xl px-3 py-2">
                  <span className="text-green-500">📍</span>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Nhập địa điểm..."
                    className="flex-1 bg-transparent text-sm text-gray-700 dark:text-gray-200 placeholder-gray-400 focus:outline-none"
                  />
                  {location && (
                    <button
                      type="button"
                      onClick={() => setLocation('')}
                      className="text-gray-400 hover:text-gray-600 text-xs"
                    >
                      ×
                    </button>
                  )}
                </div>
              )}

              {/* Existing media */}
              {keepMediaUrls.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                    Media hiện tại
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {keepMediaUrls.map((url) => (
                      <div
                        key={url}
                        className="relative rounded-xl overflow-hidden aspect-square bg-black"
                      >
                        {isVideoUrl(url) ? (
                          <video src={url} className="w-full h-full object-cover" />
                        ) : (
                          <img src={url} alt="" className="w-full h-full object-cover" />
                        )}
                        <button
                          type="button"
                          onClick={() => removeKeepMedia(url)}
                          className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center text-white text-xs hover:bg-red-600 transition-colors"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* New media preview */}
              {newMedia.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                    Media mới
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {newMedia.map((m) => (
                      <div
                        key={m.id}
                        className="relative rounded-xl overflow-hidden aspect-square bg-black"
                      >
                        {m.type === 'video' ? (
                          <video src={m.url} className="w-full h-full object-cover" />
                        ) : (
                          <img src={m.url} alt="" className="w-full h-full object-cover" />
                        )}
                        <button
                          type="button"
                          onClick={() => removeNewMedia(m.id)}
                          className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center text-white text-xs hover:bg-red-600 transition-colors"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Hidden file inputs */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleNewMediaSelect(e, 'image')}
              />
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                multiple
                className="hidden"
                onChange={(e) => handleNewMediaSelect(e, 'video')}
              />
            </div>

            {/* Toolbar */}
            <div className="flex-shrink-0 px-5 py-3 border-t border-gray-200 dark:border-slate-700 space-y-3">
              {/* Add to post row */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  Thêm vào bài viết
                </span>
                <div className="flex items-center gap-1">
                  {/* Image */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 text-green-500 transition-colors"
                    title="Thêm ảnh"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </button>
                  {/* Video */}
                  <button
                    type="button"
                    onClick={() => videoInputRef.current?.click()}
                    className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 text-blue-500 transition-colors"
                    title="Thêm video"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                  </button>
                  {/* Feeling */}
                  <button
                    type="button"
                    onClick={() => setShowFeelingPicker((v) => !v)}
                    className={`w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors ${showFeelingPicker ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-500' : 'text-yellow-500'}`}
                    title="Cảm xúc"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </button>
                  {/* Location */}
                  <button
                    type="button"
                    onClick={() => setShowLocationInput((v) => !v)}
                    className={`w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors ${showLocationInput ? 'bg-green-100 dark:bg-green-900/30 text-green-600' : 'text-green-500'}`}
                    title="Vị trí"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                  </button>
                  {/* Tag friends */}
                  <button
                    type="button"
                    onClick={() => setShowTagModal(true)}
                    className={`w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors ${selectedFriendIds.length > 0 ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' : 'text-blue-500'}`}
                    title="Gắn thẻ bạn bè"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Privacy + Submit */}
              <div className="flex items-center gap-3">
                {/* Privacy picker */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowPrivacyDropdown((v) => !v)}
                    className="flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <span>{selectedPrivacy.icon}</span>
                    <span>{selectedPrivacy.label}</span>
                    <svg className="w-3.5 h-3.5 opacity-60" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                  {showPrivacyDropdown && (
                    <div className="absolute bottom-full left-0 mb-2 w-52 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 py-2 z-10">
                      {PRIVACY_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setPrivacy(opt.value);
                            setShowPrivacyDropdown(false);
                          }}
                          className={`w-full px-4 py-2.5 text-left flex items-center gap-3 transition-colors ${
                            privacy === opt.value
                              ? 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400'
                              : 'hover:bg-gray-50 dark:hover:bg-slate-700/50 text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          <span className="text-lg">{opt.icon}</span>
                          <div>
                            <div className="text-sm font-medium">{opt.label}</div>
                            <div className="text-xs opacity-60">{opt.desc}</div>
                          </div>
                          {privacy === opt.value && (
                            <svg
                              className="w-4 h-4 ml-auto text-cyan-600"
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
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || !hasChanges}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 shadow-md shadow-cyan-500/20"
                >
                  {isSubmitting ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Confirm exit dialog */}
      {showConfirmExit && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-5 h-5 text-yellow-500"
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
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">Bỏ thay đổi?</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  Những thay đổi của bạn chưa được lưu. Bạn có xác nhận thoát không?
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowConfirmExit(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
              >
                Tiếp tục chỉnh sửa
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-red-500 hover:bg-red-600 transition-colors"
              >
                Thoát
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tag Friends Modal */}
      <TagFriendsModal
        isOpen={showTagModal}
        onClose={() => setShowTagModal(false)}
        selectedFriends={selectedFriendIds}
        onToggleFriend={(uid) =>
          setSelectedFriendIds((prev) =>
            prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
          )
        }
      />
    </>
  );
}
