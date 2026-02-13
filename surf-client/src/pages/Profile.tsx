import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { getProfile, updateProfileFields, type UserProfile, type AboutDetail } from '@/lib/firebase/profile';
import { uploadProfileImage } from '@/lib/firebase/storage';
import { updateUserProfile } from '@/lib/firebase/auth';
import { resizeAvatar, resizeCover } from '@/lib/utils/image';
import Modal from '@/components/ui/Modal';
import { api } from '@/lib/api';

const TABS: { id: string; label: string; hasArrow?: boolean }[] = [
  { id: 'posts', label: 'Bài viết' },
  { id: 'about', label: 'Giới thiệu' },
  { id: 'friends', label: 'Bạn bè' },
  { id: 'photos', label: 'Ảnh' },
  { id: 'reels', label: 'Surf Clips' },
  { id: 'more', label: 'Xem thêm', hasArrow: true },
];

const ACCEPT_IMAGE = 'image/jpeg,image/png,image/webp,image/gif';

export default function Profile() {
  const { uid } = useParams<{ uid: string }>();
  const user = useAuthStore((s) => s.user);
  const [activeTab, setActiveTab] = useState<string>('posts');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [bioOpen, setBioOpen] = useState(false);
  const [bioDraft, setBioDraft] = useState('');
  const [aboutOpen, setAboutOpen] = useState(false);
  const [aboutDraft, setAboutDraft] = useState<AboutDetail[]>([]);

  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [coverPreviewOpen, setCoverPreviewOpen] = useState(false);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [pendingCoverFile, setPendingCoverFile] = useState<File | null>(null);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const highlightInputRef = useRef<HTMLInputElement>(null);

  const isOwnProfile = user?.uid === uid;
  const displayName = isOwnProfile
    ? (user?.displayName?.trim() || profile?.displayName || 'Người dùng')
    : (profile?.displayName || 'Người dùng');
  const initial = displayName.charAt(0).toUpperCase();
  const username = user?.email?.split('@')[0]?.trim();
  const photoURL = isOwnProfile ? (user?.photoURL ?? profile?.photoURL) : profile?.photoURL ?? null;
  const coverImageUrl = profile?.coverImageUrl ?? null;
  const bio = profile?.bio ?? null;
  const aboutDetails = profile?.aboutDetails ?? [];
  const highlightPhotos = profile?.highlightPhotos ?? [];
  const [posts] = useState<{ id: string; time: string; text: string; hasImage?: boolean }[]>([]);
  const friendCount: number | null = null;
  const [addFriendLoading, setAddFriendLoading] = useState(false);
  const [addFriendSent, setAddFriendSent] = useState(false);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    setProfileLoading(true);
    setError('');
    getProfile(uid)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch((err) => {
        if (!cancelled) {
          setProfile({
            bio: null,
            coverImageUrl: null,
            aboutDetails: [],
            highlightPhotos: [],
          });
          setError('Không tải được hồ sơ.');
        }
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });
    return () => { cancelled = true; };
  }, [uid]);

  const refreshProfile = () => uid && getProfile(uid).then(setProfile);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.uid) return;
    e.target.value = '';
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    setPendingAvatarFile(file);
    setAvatarPreviewUrl(URL.createObjectURL(file));
    setAvatarPreviewOpen(true);
  };

  const handleAvatarConfirm = async () => {
    if (!pendingAvatarFile || !user?.uid) return;
    setAvatarPreviewOpen(false);
    setUploading(true);
    setError('');
    let urlToRevoke = avatarPreviewUrl;
    setAvatarPreviewUrl(null);
    setPendingAvatarFile(null);
    if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
    try {
      const blob = await resizeAvatar(pendingAvatarFile);
      const url = await uploadProfileImage(user.uid, blob, 'avatar');
      await updateUserProfile({ photoURL: url });
      await updateProfileFields(user.uid, { photoURL: url });
      setProfile((prev) => (prev ? { ...prev, photoURL: url } : null));
    } catch (err) {
      console.error('Avatar upload failed:', err);
      setError(err instanceof Error ? err.message : 'Tải ảnh đại diện thất bại.');
    } finally {
      setUploading(false);
    }
  };

  const handleAvatarPreviewClose = () => {
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    setAvatarPreviewOpen(false);
    setAvatarPreviewUrl(null);
    setPendingAvatarFile(null);
  };

  const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.uid || !isOwnProfile) return;
    e.target.value = '';
    if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
    setPendingCoverFile(file);
    setCoverPreviewUrl(URL.createObjectURL(file));
    setCoverPreviewOpen(true);
  };

  const handleCoverConfirm = async () => {
    if (!pendingCoverFile || !user?.uid) return;
    setCoverPreviewOpen(false);
    setUploading(true);
    setError('');
    let urlToRevoke = coverPreviewUrl;
    setCoverPreviewUrl(null);
    setPendingCoverFile(null);
    if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
    try {
      const blob = await resizeCover(pendingCoverFile);
      const url = await uploadProfileImage(user.uid, blob, 'cover');
      await updateProfileFields(user.uid, { coverImageUrl: url });
      setProfile((prev) => (prev ? { ...prev, coverImageUrl: url } : null));
    } catch (err) {
      console.error('Cover upload failed:', err);
      setError(err instanceof Error ? err.message : 'Tải ảnh bìa thất bại.');
    } finally {
      setUploading(false);
    }
  };

  const handleCoverPreviewClose = () => {
    if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
    setCoverPreviewOpen(false);
    setCoverPreviewUrl(null);
    setPendingCoverFile(null);
  };

  const handleEditProfileSubmit = async () => {
    const name = editDisplayName.trim();
    if (!name || !user?.uid) return;
    setError('');
    try {
      await updateUserProfile({ displayName: name });
      await updateProfileFields(user.uid, { displayName: name });
      setProfile((prev) => (prev ? { ...prev, displayName: name } : null));
      setEditProfileOpen(false);
    } catch (err) {
      setError('Cập nhật tên thất bại.');
    }
  };

  const handleBioSubmit = async () => {
    if (!uid) return;
    setError('');
    try {
      await updateProfileFields(uid, { bio: bioDraft.trim() || null });
      setProfile((prev) => (prev ? { ...prev, bio: bioDraft.trim() || null } : null));
      setBioOpen(false);
    } catch (err) {
      setError('Lưu tiểu sử thất bại.');
    }
  };

  const handleAboutSubmit = async () => {
    if (!uid) return;
    setError('');
    try {
      const list = aboutDraft.filter((d) => d.text.trim());
      await updateProfileFields(uid, { aboutDetails: list });
      setProfile((prev) => (prev ? { ...prev, aboutDetails: list } : null));
      setAboutOpen(false);
    } catch (err) {
      setError('Lưu chi tiết thất bại.');
    }
  };

  const handleHighlightAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uid) return;
    e.target.value = '';
    setUploading(true);
    setError('');
    try {
      const url = await uploadProfileImage(uid, file, 'highlight', Date.now());
      const next = [...(profile?.highlightPhotos ?? []), url];
      await updateProfileFields(uid, { highlightPhotos: next });
      setProfile((prev) => (prev ? { ...prev, highlightPhotos: next } : null));
    } catch (err) {
      console.error('Highlight upload failed:', err);
      setError(err instanceof Error ? err.message : 'Thêm ảnh thất bại.');
    } finally {
      setUploading(false);
    }
  };

  const handleHighlightRemove = async (index: number) => {
    if (!uid || !profile) return;
    const next = profile.highlightPhotos.filter((_, i) => i !== index);
    setError('');
    try {
      await updateProfileFields(uid, { highlightPhotos: next });
      setProfile((prev) => (prev ? { ...prev, highlightPhotos: next } : null));
    } catch (err) {
      setError('Xóa ảnh thất bại.');
    }
  };

  const openEditProfile = () => {
    setEditDisplayName(displayName);
    setEditProfileOpen(true);
  };
  const openBio = () => {
    setBioDraft(bio ?? '');
    setBioOpen(true);
  };
  const openAbout = () => {
    setAboutDraft(aboutDetails.length ? [...aboutDetails] : [{ icon: 'info', text: '' }]);
    setAboutOpen(true);
  };

  if (profileLoading && !profile) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-500 dark:text-gray-400">Đang tải...</p>
      </div>
    );
  }

  return (
    <div className="profile-page -mx-4 sm:-mx-6 md:mx-0 md:max-w-4xl md:mx-auto space-y-4">
      <input
        ref={avatarInputRef}
        type="file"
        accept={ACCEPT_IMAGE}
        className="hidden"
        onChange={handleAvatarChange}
      />
      <input
        ref={coverInputRef}
        type="file"
        accept={ACCEPT_IMAGE}
        className="hidden"
        onChange={handleCoverChange}
      />
      <input
        ref={highlightInputRef}
        type="file"
        accept={ACCEPT_IMAGE}
        className="hidden"
        onChange={handleHighlightAdd}
      />

      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-4 py-2 text-sm">
          {error}
        </div>
      )}
      {uploading && (
        <div className="rounded-xl bg-surf-primary/10 text-surf-primary px-4 py-2 text-sm">Đang tải lên...</div>
      )}

      <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-700/80 overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-surf-primary to-surf-secondary" aria-hidden />
        <div className="relative h-28 sm:h-36 bg-gradient-to-br from-surf-primary/20 via-surf-primary/10 to-surf-secondary/20 dark:from-surf-primary/15 dark:to-surf-secondary/15">
          {coverImageUrl && (
            <img src={coverImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          )}
          {isOwnProfile && (
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-2 right-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black/50 dark:bg-black/60 text-white text-xs font-medium hover:bg-black/60 dark:hover:bg-black/70 transition-colors disabled:opacity-70"
              title="Chỉnh sửa ảnh bìa"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.65.07-1 0-.35-.03-.68-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.4-1.06-.73-1.62-1l-.37-2.54A.488.488 0 0 0 14 2h-4c-.25 0-.46.18-.49.42l-.37 2.54c-.56.27-1.1.6-1.62 1l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.32-.07.65-.07 1 0 .35.03.68.07 1l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.06.73 1.62 1l.37 2.54c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.37-2.54c.56-.27 1.1-.6 1.62-1l2.49 1c.22.08.49 0 .61-.22l2-3.46c.12-.22.06-.49-.12-.64l-2.11-1.66Z" />
              </svg>
              Ảnh bìa
            </button>
          )}
        </div>
        <div className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 -mt-12 sm:-mt-14 relative">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className="relative flex-shrink-0 z-10">
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-white dark:bg-gray-900 border-2 border-white dark:border-gray-900 shadow-md flex items-center justify-center text-3xl sm:text-4xl font-bold text-surf-primary dark:text-surf-primary/90 overflow-hidden">
                {photoURL ? (
                  <img src={photoURL} alt="" className="w-full h-full object-cover" />
                ) : (
                  initial
                )}
              </div>
              {isOwnProfile && (
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={uploading}
                  className="absolute -bottom-1 -right-1 w-8 h-8 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
                  aria-label="Đổi ảnh đại diện"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.65.07-1 0-.35-.03-.68-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.4-1.06-.73-1.62-1l-.37-2.54A.488.488 0 0 0 14 2h-4c-.25 0-.46.18-.49.42l-.37 2.54c-.56.27-1.1.6-1.62 1l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.32-.07.65-.07 1 0 .35.03.68.07 1l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.06.73 1.62 1l.37 2.54c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.37-2.54c.56-.27 1.1-.6 1.62-1l2.49 1c.22.08.49 0 .61-.22l2-3.46c.12-.22.06-.49-.12-.64l-2.11-1.66Z" />
                  </svg>
                </button>
              )}
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">{displayName}</h1>
              {username && (
                <p className="text-sm text-surf-primary dark:text-surf-primary/90 font-medium truncate">@{username}</p>
              )}
              {friendCount != null && (
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">{friendCount} kết nối</p>
              )}
              {isOwnProfile && friendCount == null && (
                <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Chưa có bạn bè · Thêm bạn để kết nối</p>
              )}
            </div>
          </div>
          {isOwnProfile && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={openEditProfile}
                className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-xl bg-surf-primary text-white text-sm font-semibold hover:bg-surf-primary/90 dark:hover:bg-surf-primary/80 transition-colors"
                title="Chỉnh sửa hồ sơ"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                </svg>
                Chỉnh sửa hồ sơ
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                aria-label="Tin mới"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                </svg>
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                aria-label="Khác"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                </svg>
              </button>
            </div>
          )}
          {!isOwnProfile && uid && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                disabled={addFriendLoading || addFriendSent}
                onClick={async () => {
                  setAddFriendLoading(true);
                  try {
                    await api.post('/api/friends/requests', { toUid: uid });
                    setAddFriendSent(true);
                  } catch {
                    setAddFriendSent(false);
                  } finally {
                    setAddFriendLoading(false);
                  }
                }}
                className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-xl bg-surf-primary text-white text-sm font-semibold hover:bg-surf-primary/90 dark:hover:bg-surf-primary/80 transition-colors disabled:opacity-60"
              >
                {addFriendLoading ? (
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : addFriendSent ? (
                  'Đã gửi lời mời'
                ) : (
                  'Thêm bạn bè'
                )}
              </button>
            </div>
          )}
        </div>
        <nav className="px-4 sm:px-6 pb-4" aria-label="Hồ sơ">
          <div className="flex overflow-x-auto scrollbar-hide gap-1 p-1 rounded-xl bg-gray-100 dark:bg-gray-800/80 w-fit min-w-0">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={[
                  'flex items-center gap-1 flex-shrink-0 py-2 px-3 sm:px-4 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
                  activeTab === tab.id
                    ? 'bg-white dark:bg-gray-700 text-surf-primary dark:text-surf-primary shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200',
                ].join(' ')}
              >
                {tab.label}
                {tab.hasArrow && (
                  <svg className="w-3.5 h-3.5 opacity-70" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7 10l5 5 5-5z" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </nav>
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <section className="lg:col-span-2 space-y-4 order-1">
          {isOwnProfile && (
            <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-700/80 p-3">
              <div className="flex gap-3 items-center">
                <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-sm font-semibold text-surf-primary flex-shrink-0 overflow-hidden">
                  {photoURL ? (
                    <img src={photoURL} alt="" className="w-full h-full object-cover" />
                  ) : (
                    initial
                  )}
                </div>
                <button
                  type="button"
                  className="flex-1 text-left px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  Chia sẻ gì đó...
                </button>
                <button type="button" className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800" title="Ảnh">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" /></svg>
                </button>
                <button type="button" className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800" title="Video">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M18 11c0-.55-.45-1-1-1h-2V7c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v3H1c-.55 0-1 .45-1 1s.45 1 1 1h2v7c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2v-7h2c.55 0 1-.45 1-1z" /></svg>
                </button>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-surf-primary" />
              Bài viết
            </h2>
            {posts.length > 0 && (
              <div className="flex items-center gap-1">
                {isOwnProfile && (
                  <button type="button" className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800" title="Bộ lọc">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" /></svg>
                  </button>
                )}
                <div className="flex rounded-xl overflow-hidden border border-gray-200/80 dark:border-gray-700/80">
                  <button type="button" onClick={() => setViewMode('list')} className={`p-2 ${viewMode === 'list' ? 'bg-surf-primary text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`} title="Danh sách">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm4 4h14v-2H7v2zm0-4h14v-2H7v2zM7 7v2h14V7H7z" /></svg>
                  </button>
                  <button type="button" onClick={() => setViewMode('grid')} className={`p-2 ${viewMode === 'grid' ? 'bg-surf-primary text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`} title="Lưới">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3v8h8V3H3zm10 0v8h8V3h-8zM3 13v8h8v-8H3zm10 0v8h8v-8h-8z" /></svg>
                  </button>
                </div>
              </div>
            )}
          </div>
          {posts.length === 0 ? (
            <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-700/80 p-8 sm:p-12 text-center">
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">Chưa có bài viết nào</p>
              {isOwnProfile && <p className="text-gray-400 dark:text-gray-500 text-sm">Hãy đăng bài đầu tiên từ ô phía trên</p>}
            </div>
          ) : (
            <div className={viewMode === 'grid' ? 'grid grid-cols-2 sm:grid-cols-3 gap-3' : 'flex flex-col gap-3'}>
              {posts.map((post) => (
                <article key={post.id} className={`rounded-2xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-700/80 overflow-hidden ${viewMode === 'list' ? 'flex gap-3 p-3' : ''}`}>
                  {viewMode === 'grid' ? (
                    <>
                      <div className="aspect-square bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 dark:text-gray-500 text-xs">{post.hasImage ? 'Ảnh' : '📝'}</div>
                      <div className="p-2 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-gray-700 dark:text-gray-300 truncate">{post.text}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{post.time}</p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-20 h-20 rounded-xl bg-gray-100 dark:bg-gray-800 flex-shrink-0 flex items-center justify-center text-gray-400 text-xs">{post.hasImage ? 'Ảnh' : '📝'}</div>
                      <div className="min-w-0 flex-1 py-1">
                        <p className="text-sm text-gray-700 dark:text-gray-300">{post.text}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{post.time}</p>
                      </div>
                    </>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
        <aside className="lg:col-span-1 space-y-4 order-2">
          <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-700/80 overflow-hidden">
            <h2 className="px-4 py-3 text-base font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-surf-primary" />
              Giới thiệu
            </h2>
            <div className="p-4">
              {bio ? (
                <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">{bio}</p>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 text-sm">Chưa thêm tiểu sử</p>
              )}
              {isOwnProfile && (
                <button type="button" onClick={openBio} className="mt-3 w-full py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                  {bio ? 'Chỉnh sửa tiểu sử' : 'Thêm tiểu sử'}
                </button>
              )}
              {aboutDetails.length > 0 ? (
                <ul className="mt-4 space-y-2 text-sm text-gray-700 dark:text-gray-300">
                  {aboutDetails.map((item) => (
                    <li key={item.text}>{item.text}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-gray-500 dark:text-gray-400 text-sm">Chưa thêm thông tin chi tiết</p>
              )}
              {isOwnProfile && (
                <button type="button" onClick={openAbout} className="mt-3 w-full py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                  {aboutDetails.length > 0 ? 'Chỉnh sửa chi tiết' : 'Thêm chi tiết'}
                </button>
              )}
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Nổi bật</p>
                {highlightPhotos.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto pb-1 flex-wrap">
                    {highlightPhotos.map((url, i) => (
                      <div key={i} className="relative group">
                        <img src={url} alt="" className="w-20 h-20 flex-shrink-0 rounded-xl object-cover" />
                        {isOwnProfile && (
                          <button
                            type="button"
                            onClick={() => handleHighlightRemove(i)}
                            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center text-xs hover:bg-black/80"
                            aria-label="Xóa ảnh"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Chưa thêm ảnh</p>
                )}
                {isOwnProfile && (
                  <button
                    type="button"
                    onClick={() => highlightInputRef.current?.click()}
                    disabled={uploading}
                    className="mt-2 text-sm text-surf-primary dark:text-surf-primary/90 font-medium hover:underline disabled:opacity-70"
                  >
                    Thêm ảnh đáng chú ý
                  </button>
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>

      <Modal open={editProfileOpen} onClose={() => setEditProfileOpen(false)} title="Chỉnh sửa hồ sơ">
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tên hiển thị</label>
          <input
            type="text"
            value={editDisplayName}
            onChange={(e) => setEditDisplayName(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100"
            placeholder="Tên hiển thị"
          />
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={() => setEditProfileOpen(false)} className="px-4 py-2 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm font-medium">
              Hủy
            </button>
            <button type="button" onClick={handleEditProfileSubmit} className="px-4 py-2 rounded-xl bg-surf-primary text-white text-sm font-medium hover:bg-surf-primary/90">
              Lưu
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={bioOpen} onClose={() => setBioOpen(false)} title={bio ? 'Chỉnh sửa tiểu sử' : 'Thêm tiểu sử'}>
        <div className="space-y-3">
          <textarea
            value={bioDraft}
            onChange={(e) => setBioDraft(e.target.value)}
            rows={4}
            className="w-full px-4 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 resize-none"
            placeholder="Viết vài dòng về bản thân..."
          />
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={() => setBioOpen(false)} className="px-4 py-2 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm font-medium">
              Hủy
            </button>
            <button type="button" onClick={handleBioSubmit} className="px-4 py-2 rounded-xl bg-surf-primary text-white text-sm font-medium hover:bg-surf-primary/90">
              Lưu
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={aboutOpen} onClose={() => setAboutOpen(false)} title={aboutDetails.length > 0 ? 'Chỉnh sửa chi tiết' : 'Thêm chi tiết'}>
        <div className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">Thêm các mục như nơi học, nơi sống, v.v.</p>
          {aboutDraft.map((item, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                value={item.icon}
                onChange={(e) => {
                  const next = [...aboutDraft];
                  next[i] = { ...next[i], icon: e.target.value };
                  setAboutDraft(next);
                }}
                className="w-24 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 text-sm"
                placeholder="Icon"
              />
              <input
                type="text"
                value={item.text}
                onChange={(e) => {
                  const next = [...aboutDraft];
                  next[i] = { ...next[i], text: e.target.value };
                  setAboutDraft(next);
                }}
                className="flex-1 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 text-sm"
                placeholder="Nội dung"
              />
              <button
                type="button"
                onClick={() => setAboutDraft(aboutDraft.filter((_, j) => j !== i))}
                className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                aria-label="Xóa"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" /></svg>
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setAboutDraft([...aboutDraft, { icon: 'info', text: '' }])}
            className="w-full py-2 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 text-sm font-medium hover:border-surf-primary hover:text-surf-primary"
          >
            + Thêm mục
          </button>
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={() => setAboutOpen(false)} className="px-4 py-2 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm font-medium">
              Hủy
            </button>
            <button type="button" onClick={handleAboutSubmit} className="px-4 py-2 rounded-xl bg-surf-primary text-white text-sm font-medium hover:bg-surf-primary/90">
              Lưu
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={avatarPreviewOpen} onClose={handleAvatarPreviewClose} title="Xem trước ảnh đại diện">
        <div className="space-y-4">
          {avatarPreviewUrl && (
            <div className="flex justify-center">
              <img src={avatarPreviewUrl} alt="Xem trước" className="w-40 h-40 rounded-2xl object-cover border-2 border-gray-200 dark:border-gray-600" />
            </div>
          )}
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">Ảnh sẽ được thu nhỏ để tải nhanh hơn.</p>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={handleAvatarPreviewClose} className="px-4 py-2 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm font-medium">
              Hủy
            </button>
            <button type="button" onClick={handleAvatarConfirm} className="px-4 py-2 rounded-xl bg-surf-primary text-white text-sm font-medium hover:bg-surf-primary/90">
              Đặt làm ảnh đại diện
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={coverPreviewOpen} onClose={handleCoverPreviewClose} title="Xem trước ảnh bìa">
        <div className="space-y-4">
          {coverPreviewUrl && (
            <div className="flex justify-center max-h-48 overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800">
              <img src={coverPreviewUrl} alt="Xem trước" className="w-full h-auto object-cover object-top" />
            </div>
          )}
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">Ảnh sẽ được thu nhỏ để tải nhanh hơn.</p>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={handleCoverPreviewClose} className="px-4 py-2 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm font-medium">
              Hủy
            </button>
            <button type="button" onClick={handleCoverConfirm} className="px-4 py-2 rounded-xl bg-surf-primary text-white text-sm font-medium hover:bg-surf-primary/90">
              Đặt làm ảnh bìa
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
