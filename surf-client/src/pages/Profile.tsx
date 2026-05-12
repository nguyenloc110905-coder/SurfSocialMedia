import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore, refreshAuthUser, patchAuthPhoto } from '@/stores/authStore';
import {
  getProfile,
  updateProfileFields,
  type UserProfile,
  type AboutDetail,
} from '@/lib/firebase/profile';
import { uploadProfileImage } from '@/lib/firebase/storage';
import { updateUserProfile } from '@/lib/firebase/auth';
import { resizeAvatar, resizeCover } from '@/lib/utils/image';
import { optimizeImageUrl } from '@/lib/image-cdn';
import PresenceBadge from '@/components/ui/PresenceBadge';
import Modal from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import PostCard from '@/components/feed/PostCard';
import ProfileAbout from './ProfileAbout';
import { isVideoUrl } from '@/lib/cloudinary';

const TABS: { id: string; label: string; hasArrow?: boolean }[] = [
  { id: 'posts', label: 'Bài viết' },
  { id: 'about', label: 'Giới thiệu' },
  { id: 'friends', label: 'Bạn bè' },
  { id: 'photos', label: 'Ảnh' },
  { id: 'reels', label: 'Surf Clips' },
  { id: 'saved', label: 'Đã lưu' },
  { id: 'more', label: 'Xem thêm', hasArrow: true },
];

const ACCEPT_IMAGE = 'image/jpeg,image/png,image/webp,image/gif';

export default function Profile() {
  const { uid } = useParams<{ uid: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [activeTab, setActiveTab] = useState<string>('posts');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('grid');

  // ─── Animation state ────────────────────────────────────────────
  const [heroVisible, setHeroVisible] = useState(false);
  const [countPosts, setCountPosts] = useState(0);
  const [countFriends, setCountFriends] = useState(0);
  const [countPhotos, setCountPhotos] = useState(0);

  // Kick off entrance animation on mount
  useEffect(() => {
    const t = setTimeout(() => setHeroVisible(true), 80);
    return () => clearTimeout(t);
  }, []);

  // Count-up helper
  const animateCount = useCallback(
    (target: number, setter: (n: number) => void, duration = 700) => {
      if (target === 0) {
        setter(0);
        return;
      }
      const start = performance.now();
      const tick = (now: number) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setter(Math.round(eased * target));
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    []
  );

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

  const [avatarImgError, setAvatarImgError] = useState(false);
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
    ? user?.displayName?.trim() || profile?.displayName || 'Người dùng'
    : profile?.displayName || 'Người dùng';
  const initial = displayName.charAt(0).toUpperCase();
  const profileEmail = isOwnProfile ? user?.email : profile?.email;
  const photoURL = isOwnProfile
    ? (user?.photoURL || profile?.photoURL || null)
    : (profile?.photoURL || null);
  const coverImageUrl = profile?.coverImageUrl ?? null;
  const bio = profile?.bio ?? null;
  const aboutDetails = profile?.aboutDetails ?? [];
  const highlightPhotos = profile?.highlightPhotos ?? [];

  // Posts state
  interface Post {
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
    taggedFriends?: Array<{ uid: string; displayName: string; photoURL?: string | null }>;
    privacy?: 'public' | 'friends' | 'only-me' | 'custom';
    isEdited?: boolean;
    savedBy?: string[];
    pinnedAt?: string | null;
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
  }
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [postsError, setPostsError] = useState<string | null>(null);

  // Friends state
  interface Friend {
    id: string;
    displayName: string;
    photoURL?: string | null;
  }
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendsError, setFriendsError] = useState<string | null>(null);

  // Photos state
  interface Photo {
    url: string;
    postId: string;
    createdAt:
      | import('firebase/firestore').Timestamp
      | { _seconds: number }
      | { seconds: number }
      | string
      | number
      | null;
  }
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [photosError, setPhotosError] = useState<string | null>(null);

  // Selected post for detail overlay (grid view click)
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);

  // Saved posts state (only loaded for own profile)
  const [savedPosts, setSavedPosts] = useState<Post[]>([]);
  const [savedPostsLoading, setSavedPostsLoading] = useState(false);
  const [savedPostsError, setSavedPostsError] = useState<string | null>(null);

  // Trigger count-up when data loads
  useEffect(() => {
    if (!postsLoading) animateCount(posts.length, setCountPosts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postsLoading, posts.length]);
  useEffect(() => {
    animateCount(friends.length, setCountFriends);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friends.length]);
  useEffect(() => {
    animateCount(photos.length, setCountPhotos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.length]);

  // Trạng thái quan hệ bạn bè với user đang xem (chỉ dùng khi !isOwnProfile)
  type FriendStatus =
    | 'loading'
    | 'self'
    | 'friends'
    | 'request_sent'
    | 'request_received'
    | 'stranger'
    | 'blocked';
  const [friendStatus, setFriendStatus] = useState<FriendStatus>('loading');
  const [friendRequestId, setFriendRequestId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showUnfriendConfirm, setShowUnfriendConfirm] = useState(false);

  // Clips state
  interface Clip {
    url: string;
    postId: string;
    content: string;
    createdAt: unknown;
  }
  const [clips, setClips] = useState<Clip[]>([]);
  const [clipsLoading, setClipsLoading] = useState(false);
  const [clipsError, setClipsError] = useState<string | null>(null);
  const [selectedClip, setSelectedClip] = useState<Clip | null>(null);

  // Follow state
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [isBlocking, setIsBlocking] = useState(false);
  const [isBlockedBy, setIsBlockedBy] = useState(false);
  const [blockActionLoading, setBlockActionLoading] = useState(false);

  // Real-time: friend request accepted by the other side → update status immediately
  useEffect(() => {
    if (!uid || !user) return;
    const socket = getSocket();
    const handler = (data: { byUid: string }) => {
      if (data.byUid === uid) {
        setFriendStatus('friends');
        setFriendRequestId(null);
      }
    };
    socket.on('friendAccepted', handler);
    return () => { socket.off('friendAccepted', handler); };
  }, [uid, user]);

  // Load profile
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    setProfileLoading(true);
    setError('');
    getProfile(uid)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {
        if (!cancelled) {
          setProfile({
            bio: null,
            coverImageUrl: null,
            aboutDetails: [],
            highlightPhotos: [],
            work: [],
            education: [],
            languages: [],
          });
          setError('Không tải được hồ sơ.');
        }
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // Load posts
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;

    const loadPosts = async () => {
      try {
        setPostsLoading(true);
        setPostsError(null);
        console.log(`📥 Loading posts for user ${uid}...`);

        const response = await api.get<{ posts: Post[] }>(`/api/users/${uid}/posts`);

        if (!cancelled) {
          setPosts(response.posts || []);
          console.log(`✅ Loaded ${response.posts?.length || 0} posts for user ${uid}`);
        }
      } catch (err: unknown) {
        console.error('❌ Failed to load user posts:', err);
        if (!cancelled) {
          setPostsError('Không thể tải bài viết.');
          setPosts([]);
        }
      } finally {
        if (!cancelled) {
          setPostsLoading(false);
        }
      }
    };

    loadPosts();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // Load friends
  useEffect(() => {
    if (!uid || (!isOwnProfile && activeTab !== 'friends')) return;
    let cancelled = false;

    const loadFriends = async () => {
      try {
        setFriendsLoading(true);
        setFriendsError(null);

        const response = await api.get<{ friends: Friend[] }>(`/api/users/${uid}/friends`);

        if (!cancelled) {
          setFriends(response.friends || []);
        }
      } catch (err: unknown) {
        console.error('❌ Failed to load friends:', err);
        if (!cancelled) {
          setFriendsError('Không thể tải danh sách bạn bè.');
          setFriends([]);
        }
      } finally {
        if (!cancelled) {
          setFriendsLoading(false);
        }
      }
    };

    loadFriends();
    return () => {
      cancelled = true;
    };
  }, [uid, activeTab, isOwnProfile]);

  // Load photos
  useEffect(() => {
    if (!uid || activeTab !== 'photos') return;
    let cancelled = false;

    const loadPhotos = async () => {
      try {
        setPhotosLoading(true);
        setPhotosError(null);

        const response = await api.get<{ photos: Photo[] }>(`/api/users/${uid}/photos`);

        if (!cancelled) {
          setPhotos(response.photos || []);
        }
      } catch (err: unknown) {
        console.error('❌ Failed to load photos:', err);
        if (!cancelled) {
          setPhotosError('Không thể tải ảnh.');
          setPhotos([]);
        }
      } finally {
        if (!cancelled) {
          setPhotosLoading(false);
        }
      }
    };

    loadPhotos();
    return () => {
      cancelled = true;
    };
  }, [uid, activeTab]);

  // Load clips
  useEffect(() => {
    if (!uid || activeTab !== 'reels') return;
    let cancelled = false;
    const loadClips = async () => {
      try {
        setClipsLoading(true);
        setClipsError(null);
        const response = await api.get<{ clips: Clip[] }>(`/api/users/${uid}/clips`);
        if (!cancelled) setClips(response.clips || []);
      } catch {
        if (!cancelled) { setClipsError('Không thể tải video.'); setClips([]); }
      } finally {
        if (!cancelled) setClipsLoading(false);
      }
    };
    loadClips();
    return () => { cancelled = true; };
  }, [uid, activeTab]);

  // Load saved posts (own profile only)
  useEffect(() => {
    if (!isOwnProfile || activeTab !== 'saved') return;
    let cancelled = false;
    setSavedPostsLoading(true);
    setSavedPostsError(null);
    api
      .get<{ posts: Post[] }>('/api/posts/saved')
      .then((r) => { if (!cancelled) setSavedPosts(r.posts ?? []); })
      .catch(() => { if (!cancelled) setSavedPostsError('Không thể tải bài đã lưu.'); })
      .finally(() => { if (!cancelled) setSavedPostsLoading(false); });
    return () => { cancelled = true; };
  }, [isOwnProfile, activeTab]);

  // Kểm tra trạng thái bạn bè khi xem trang người khác
  useEffect(() => {
    if (!uid || isOwnProfile) {
      setFriendStatus('self');
      return;
    }
    let cancelled = false;
    setFriendStatus('loading');
    setFriendRequestId(null);
    api
      .get<{ status: string; requestId?: string }>(`/api/friends/status/${uid}`)
      .then((data) => {
        if (!cancelled) {
          setFriendStatus(data.status as FriendStatus);
          setFriendRequestId(data.requestId ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) setFriendStatus('stranger');
      });
    return () => {
      cancelled = true;
    };
  }, [uid, isOwnProfile]);

  // Kiểm tra trạng thái theo dõi
  useEffect(() => {
    if (!uid || isOwnProfile) return;
    let cancelled = false;
    api
      .get<{ isFollowing: boolean }>(`/api/users/${uid}/follow-status`)
      .then((data) => {
        if (!cancelled) setIsFollowing(data.isFollowing);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [uid, isOwnProfile]);

  // Kiểm tra block status với user đang xem
  useEffect(() => {
    if (!uid || isOwnProfile) {
      setIsBlocking(false);
      setIsBlockedBy(false);
      return;
    }
    let cancelled = false;
    api
      .get<{ isBlocking: boolean; isBlockedBy: boolean; isBlocked: boolean }>(
        `/api/users/${uid}/block-status`
      )
      .then((data) => {
        if (cancelled) return;
        setIsBlocking(data.isBlocking);
        setIsBlockedBy(data.isBlockedBy);
        if (data.isBlocked) {
          setFriendStatus('blocked');
          setFriendRequestId(null);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [uid, isOwnProfile]);

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
    const urlToRevoke = avatarPreviewUrl;
    setAvatarPreviewUrl(null);
    setPendingAvatarFile(null);
    if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
    try {
      const blob = await resizeAvatar(pendingAvatarFile);
      const url = await uploadProfileImage(user.uid, blob, 'avatar');
      patchAuthPhoto(url);
      await updateUserProfile({ photoURL: url });
      await updateProfileFields(user.uid, { photoURL: url });
      setProfile((prev) => (prev ? { ...prev, photoURL: url } : null));
      setAvatarImgError(false);
      refreshAuthUser();
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
    const urlToRevoke = coverPreviewUrl;
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
      refreshAuthUser();
      setEditProfileOpen(false);
    } catch {
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
    } catch {
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
    } catch {
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
    } catch {
      setError('Xóa ảnh thất bại.');
    }
  };

  // ─── Friendship action handlers ────────────────────────────────────
  const handleSendFriendRequest = async () => {
    if (!uid) return;
    setActionLoading(true);
    try {
      const res = await api.post<{ id: string }>('/api/friends/requests', { toUid: uid });
      setFriendStatus('request_sent');
      setFriendRequestId(res.id);
    } catch (e) {
      setError((e as Error).message || 'Không thể gửi lời mời kết bạn.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!friendRequestId) return;
    setActionLoading(true);
    try {
      await api.delete(`/api/friends/requests/${friendRequestId}`);
      setFriendStatus('stranger');
      setFriendRequestId(null);
    } catch (e) {
      setError((e as Error).message || 'Không thể hủy lời mời.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAcceptRequest = async () => {
    if (!friendRequestId) return;
    setActionLoading(true);
    try {
      await api.patch(`/api/friends/requests/${friendRequestId}`, { action: 'accept' });
      setFriendStatus('friends');
      setFriendRequestId(null);
    } catch (e) {
      setError((e as Error).message || 'Không thể chấp nhận lời mời.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectRequest = async () => {
    if (!friendRequestId) return;
    setActionLoading(true);
    try {
      await api.delete(`/api/friends/requests/${friendRequestId}`);
      setFriendStatus('stranger');
      setFriendRequestId(null);
    } catch (e) {
      setError((e as Error).message || 'Không thể từ chối lời mời.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnfriend = async () => {
    if (!uid) return;
    setActionLoading(true);
    try {
      await api.delete(`/api/friends/${uid}`);
      setFriendStatus('stranger');
      setFriendRequestId(null);
    } catch (e) {
      setError((e as Error).message || 'Không thể hủy kết bạn.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleFollow = async () => {
    if (!uid || followLoading) return;
    setFollowLoading(true);
    try {
      const endpoint = isFollowing ? `/api/users/${uid}/unfollow` : `/api/users/${uid}/follow`;
      await api.post(endpoint, {});
      setIsFollowing((prev) => !prev);
    } catch (e) {
      setError((e as Error).message || 'Không thể cập nhật theo dõi.');
    } finally {
      setFollowLoading(false);
    }
  };

  const handleBlockToggle = async () => {
    if (!uid || blockActionLoading) return;
    setBlockActionLoading(true);
    setError('');
    try {
      if (isBlocking) {
        await api.delete(`/api/users/${uid}/block`);
        setIsBlocking(false);
        // Sau khi bỏ chặn, reload lại trạng thái bạn bè
        const status = await api.get<{ status: FriendStatus; requestId?: string }>(
          `/api/friends/status/${uid}`
        );
        setFriendStatus(status.status);
        setFriendRequestId(status.requestId ?? null);
      } else {
        await api.post(`/api/users/${uid}/block`, {});
        setIsBlocking(true);
        setFriendStatus('blocked');
        setFriendRequestId(null);
        setIsFollowing(false);
      }
    } catch (e) {
      setError((e as Error).message || 'Không thể cập nhật trạng thái chặn.');
    } finally {
      setBlockActionLoading(false);
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
      {/* ── Keyframe definitions ── */}
      <style>{`
        @keyframes surf-wave {
          0%   { transform: translateX(0); }
          50%  { transform: translateX(-60px); }
          100% { transform: translateX(0); }
        }
        @keyframes surf-wave-slow {
          0%   { transform: translateX(0); }
          50%  { transform: translateX(80px); }
          100% { transform: translateX(0); }
        }
        @keyframes surf-orb-float {
          0%, 100% { transform: translateY(0) scale(1); opacity: 0.45; }
          50%       { transform: translateY(-22px) scale(1.08); opacity: 0.65; }
        }
        @keyframes surf-orb-float2 {
          0%, 100% { transform: translateY(0) scale(1); opacity: 0.3; }
          50%       { transform: translateY(18px) scale(0.92); opacity: 0.5; }
        }
        @keyframes surf-stripe-shimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes surf-hero-in {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes surf-avatar-in {
          0%   { opacity: 0; transform: scale(0.82) translateY(16px); }
          70%  { transform: scale(1.04) translateY(-2px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes surf-avatar-ring {
          0%, 100% { box-shadow: 0 0 0 0px rgba(var(--surf-primary-rgb, 99,102,241), 0.35); }
          50%       { box-shadow: 0 0 0 8px rgba(var(--surf-primary-rgb, 99,102,241), 0); }
        }
        @keyframes surf-glow-ring {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50%       { opacity: 0.7; transform: scale(1.06); }
        }
        @keyframes surf-badge-pop {
          from { opacity: 0; transform: scale(0.7); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes surf-stat-pop {
          0%   { transform: scale(0.88); opacity: 0; }
          60%  { transform: scale(1.08); }
          100% { transform: scale(1); opacity: 1; }
        }
        .surf-wave-1  { animation: surf-wave      9s ease-in-out infinite; }
        .surf-wave-2  { animation: surf-wave-slow 12s ease-in-out infinite; }
        .surf-orb-1   { animation: surf-orb-float  7s ease-in-out infinite; }
        .surf-orb-2   { animation: surf-orb-float2 9s ease-in-out infinite 1s; }
        .surf-orb-3   { animation: surf-orb-float  11s ease-in-out infinite 2s; }
        .surf-stripe  {
          background: linear-gradient(90deg,
            var(--surf-primary, #6366f1) 0%,
            #22d3ee 30%, #a78bfa 50%,
            var(--surf-secondary, #8b5cf6) 70%,
            var(--surf-primary, #6366f1) 100%);
          background-size: 200% auto;
          animation: surf-stripe-shimmer 4s linear infinite;
        }
        .surf-hero-in  { animation: surf-hero-in  0.55s cubic-bezier(0.22,1,0.36,1) both; }
        .surf-avatar-in { animation: surf-avatar-in 0.6s cubic-bezier(0.22,1,0.36,1) 0.15s both; }
        .surf-stat-pop { animation: surf-stat-pop 0.45s cubic-bezier(0.22,1,0.36,1) both; }
        .surf-badge-pop { animation: surf-badge-pop 0.3s cubic-bezier(0.34,1.56,0.64,1) 0.5s both; }
        .surf-glow-ring { animation: surf-glow-ring 3s ease-in-out infinite; }
        @keyframes surf-username-shimmer {
          0%   { background-position: 0% center; }
          50%  { background-position: 100% center; }
          100% { background-position: 0% center; }
        }
        .surf-username {
          background: linear-gradient(90deg, var(--surf-primary, #6366f1), #22d3ee, var(--surf-secondary, #8b5cf6), var(--surf-primary, #6366f1));
          background-size: 200% auto;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: surf-username-shimmer 5s ease-in-out infinite;
        }
        @keyframes surf-upload-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        .surf-upload-pulse { animation: surf-upload-pulse 1.2s ease-in-out infinite; }
        .surf-card-hover {
          transition: transform 0.22s ease, box-shadow 0.22s ease;
        }
        .surf-card-hover:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 28px -8px rgba(0,0,0,0.14);
        }
      `}</style>

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
        <div className="rounded-2xl bg-surf-primary/10 text-surf-primary px-4 py-2 text-sm flex items-center gap-2 surf-upload-pulse">
          <span className="w-4 h-4 border-2 border-surf-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
          Đang tải lên...
        </div>
      )}

      {/* ═══ HERO PROFILE CARD ═══ */}
      <div className="rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 overflow-hidden shadow-sm">
        {/* Top accent stripe — animated shimmer */}
        <div className="h-1 surf-stripe" />

        {/* ── Cover Photo ── */}
        <div className="relative h-52 sm:h-72 overflow-hidden group/cover">
          {/* Default background when no cover */}
          {!coverImageUrl && (
            <div className="absolute inset-0 bg-gradient-to-br from-surf-primary/25 via-sky-300/15 to-surf-secondary/25 dark:from-surf-primary/20 dark:via-sky-900/20 dark:to-surf-secondary/20 overflow-hidden">
              {/* Floating orbs */}
              <div className="surf-orb-1 absolute top-6 left-[12%] w-28 h-28 rounded-full bg-surf-primary/20 dark:bg-surf-primary/15 blur-2xl" />
              <div className="surf-orb-2 absolute bottom-4 left-[38%] w-36 h-36 rounded-full bg-cyan-400/20 dark:bg-cyan-400/10 blur-3xl" />
              <div className="surf-orb-3 absolute top-3 right-[10%] w-24 h-24 rounded-full bg-surf-secondary/25 dark:bg-surf-secondary/15 blur-2xl" />
              {/* Animated wave paths */}
              <svg
                className="absolute bottom-0 left-0 right-0 w-[120%] -ml-[10%] opacity-25 dark:opacity-12"
                viewBox="0 0 1200 160"
                preserveAspectRatio="none"
                fill="none"
              >
                <path
                  className="surf-wave-1 text-surf-primary"
                  d="M0 80 Q150 20 300 80 T600 80 T900 80 T1200 80 V160 H0Z"
                  fill="currentColor"
                />
                <path
                  className="surf-wave-2 text-surf-secondary"
                  d="M0 110 Q150 50 300 110 T600 110 T900 110 T1200 110 V160 H0Z"
                  fill="currentColor"
                  opacity="0.7"
                />
              </svg>
              {/* Surf logo watermark */}
              <svg
                className="absolute top-4 right-8 w-48 h-48 opacity-[0.06] dark:opacity-[0.04] text-surf-primary surf-orb-1"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
              </svg>
            </div>
          )}
          {coverImageUrl && (
            <img
              src={optimizeImageUrl(coverImageUrl)}
              alt=""
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover/cover:scale-[1.02]"
            />
          )}
          {/* Gradient overlay — always present for readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent pointer-events-none" />

          {/* Cover edit button — glassmorphism */}
          {isOwnProfile && (
            <button
              type="button"
              onClick={() => coverInputRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-4 right-4 flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/15 backdrop-blur-md text-white text-sm font-semibold border border-white/30 hover:bg-white/28 active:scale-95 transition-all shadow-xl disabled:opacity-60"
              title="Đổi ảnh bìa"
            >
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 4h3l2-2h6l2 2h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0-2a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" />
              </svg>
              {uploading ? 'Đang tải...' : 'Đổi ảnh bìa'}
            </button>
          )}
        </div>

        {/* ── Profile Info — centered layout ── */}
        <div
          className={[
            'flex flex-col items-center px-4 sm:px-8 pb-0',
            heroVisible ? 'surf-hero-in' : 'opacity-0',
          ].join(' ')}
        >
          {/* Avatar overlapping cover */}
          <div className="relative -mt-16 sm:-mt-20 z-10 surf-avatar-in">
            {/* Glow ring behind avatar */}
            <div className="surf-glow-ring absolute inset-0 rounded-full bg-gradient-to-br from-surf-primary/35 to-surf-secondary/35 blur-xl -z-10" />
            <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-full ring-4 ring-white dark:ring-gray-900 shadow-2xl overflow-hidden bg-gradient-to-br from-surf-primary to-surf-secondary flex items-center justify-center">
              {photoURL && !avatarImgError ? (
                <img
                  src={optimizeImageUrl(photoURL)}
                  alt={displayName}
                  className="w-full h-full object-cover"
                  onError={() => setAvatarImgError(true)}
                />
              ) : (
                <span className="text-4xl sm:text-5xl font-bold text-white select-none">
                  {initial}
                </span>
              )}
            </div>
            {isOwnProfile && (
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-2 -right-2 w-9 h-9 rounded-2xl bg-surf-primary text-white flex items-center justify-center shadow-lg hover:bg-surf-primary/90 active:scale-95 transition-all border-2 border-white dark:border-gray-900 disabled:opacity-60"
                aria-label="Đổi ảnh đại diện"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M4 4h3l2-2h6l2 2h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0-2a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" />
                </svg>
              </button>
            )}
          </div>

          {/* Name + bio */}
          <div className="mt-4 text-center max-w-lg w-full">
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
                {displayName}
              </h1>
              {!isOwnProfile && friendStatus === 'friends' && (
                <span className="surf-badge-pop inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/25 text-emerald-600 dark:text-emerald-400 text-xs font-bold border border-emerald-200/60 dark:border-emerald-500/30">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                  </svg>
                  Bạn bè
                </span>
              )}
              {!isOwnProfile && friendStatus === 'request_received' && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/25 text-amber-600 dark:text-amber-400 text-xs font-bold border border-amber-200/60 dark:border-amber-500/30">
                  Đã gửi lời mời
                </span>
              )}
            </div>
            {bio && (
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-400 leading-relaxed max-w-sm mx-auto">
                {bio}
              </p>
            )}
            {isOwnProfile && !bio && (
              <button
                type="button"
                onClick={openBio}
                className="mt-2 text-sm text-surf-primary/70 hover:text-surf-primary transition-colors hover:underline"
              >
                + Thêm tiểu sử
              </button>
            )}
          </div>

          {/* Stats row */}
          <div className="mt-5 flex items-stretch divide-x divide-gray-200 dark:divide-gray-700/60 border border-gray-200/80 dark:border-gray-700/60 rounded-2xl overflow-hidden">
            <div
              className="surf-stat-pop flex flex-col items-center px-6 sm:px-8 py-3"
              style={{ animationDelay: '0.25s' }}
            >
              <span className="text-xl font-extrabold text-gray-900 dark:text-gray-100 tabular-nums">
                {postsLoading ? '–' : countPosts}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-medium">
                Bài viết
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('friends')}
              className="surf-stat-pop flex flex-col items-center px-6 sm:px-8 py-3 hover:bg-surf-primary/5 dark:hover:bg-surf-primary/10 transition-colors"
              style={{ animationDelay: '0.35s' }}
            >
              <span className="text-xl font-extrabold text-gray-900 dark:text-gray-100 tabular-nums">
                {countFriends}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-medium">
                Bạn bè
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('photos')}
              className="surf-stat-pop flex flex-col items-center px-6 sm:px-8 py-3 hover:bg-surf-primary/5 dark:hover:bg-surf-primary/10 transition-colors"
              style={{ animationDelay: '0.45s' }}
            >
              <span className="text-xl font-extrabold text-gray-900 dark:text-gray-100 tabular-nums">
                {countPhotos}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-medium">
                Ảnh
              </span>
            </button>
          </div>

          {/* Action buttons */}
          <div className="mt-5 mb-5 flex items-center justify-center gap-2 flex-wrap">
            {/* ── OWN PROFILE ── */}
            {isOwnProfile && (
              <>
                <button
                  type="button"
                  onClick={openEditProfile}
                  className="inline-flex items-center gap-2 h-10 px-6 rounded-2xl bg-gradient-to-r from-surf-primary to-surf-secondary text-white text-sm font-bold shadow-lg shadow-surf-primary/25 hover:shadow-surf-primary/40 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                  </svg>
                  Chỉnh sửa hồ sơ
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  aria-label="Tùy chọn khác"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                  </svg>
                </button>
              </>
            )}

            {/* ── OTHER PROFILE ── */}
            {!isOwnProfile && uid && (
              <>
                {friendStatus === 'loading' && (
                  <div className="h-10 w-36 rounded-2xl bg-gray-200 dark:bg-gray-700 animate-pulse" />
                )}
                {friendStatus === 'blocked' && (
                  <div className="inline-flex items-center h-10 px-4 rounded-2xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 text-sm font-semibold">
                    {isBlocking ? 'Bạn đã chặn người này' : 'Bạn đã bị người này chặn'}
                  </div>
                )}
                {friendStatus === 'stranger' && !isBlocking && !isBlockedBy && (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={handleSendFriendRequest}
                    className="inline-flex items-center gap-2 h-10 px-6 rounded-2xl bg-gradient-to-r from-surf-primary to-surf-secondary text-white text-sm font-bold shadow-lg shadow-surf-primary/25 hover:shadow-surf-primary/40 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-60 disabled:scale-100"
                  >
                    {actionLoading ? (
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                      </svg>
                    )}
                    Thêm bạn bè
                  </button>
                )}
                {friendStatus === 'request_sent' && !isBlocking && !isBlockedBy && (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={handleCancelRequest}
                    title="Nhấn để hủy lời mời"
                    className="group inline-flex items-center gap-2 h-10 px-6 rounded-2xl bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-bold hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-all disabled:opacity-60"
                  >
                    {actionLoading ? (
                      <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                      </svg>
                    )}
                    <span className="group-hover:hidden">Đã gửi lời mời</span>
                    <span className="hidden group-hover:inline">Hủy lời mời</span>
                  </button>
                )}
                {friendStatus === 'request_received' && !isBlocking && !isBlockedBy && (
                  <>
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={handleAcceptRequest}
                      className="inline-flex items-center gap-1.5 h-10 px-6 rounded-2xl bg-gradient-to-r from-surf-primary to-surf-secondary text-white text-sm font-bold shadow-lg shadow-surf-primary/25 transition-all disabled:opacity-60"
                    >
                      {actionLoading && (
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      )}
                      Xác nhận
                    </button>
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={handleRejectRequest}
                      className="inline-flex items-center h-10 px-6 rounded-2xl bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-bold hover:bg-gray-300 dark:hover:bg-gray-600 transition-all disabled:opacity-60"
                    >
                      Từ chối
                    </button>
                  </>
                )}
                {friendStatus === 'friends' && !isBlocking && !isBlockedBy && (
                  <div className="relative group/unfriend-btn">
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={() => setShowUnfriendConfirm(true)}
                      className="inline-flex items-center gap-2 h-10 px-6 rounded-2xl bg-surf-primary/10 dark:bg-surf-primary/20 text-surf-primary text-sm font-bold transition-all duration-150 disabled:opacity-60 group-hover/unfriend-btn:bg-red-500 group-hover/unfriend-btn:text-white"
                    >
                      {actionLoading ? (
                        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <svg className="w-4 h-4 group-hover/unfriend-btn:hidden" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" /></svg>
                          <svg className="w-4 h-4 hidden group-hover/unfriend-btn:block" viewBox="0 0 24 24" fill="currentColor"><path d="M14 8c0-2.21-1.79-4-4-4S6 5.79 6 8s1.79 4 4 4 4-1.79 4-4zm3 2v2h6v-2h-6zm-7 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                        </>
                      )}
                      <span className="group-hover/unfriend-btn:hidden">Bạn bè</span>
                      <span className="hidden group-hover/unfriend-btn:inline">Hủy kết bạn</span>
                    </button>
                  </div>
                )}
                {/* Unfriend confirmation modal */}
                {showUnfriendConfirm && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowUnfriendConfirm(false)}>
                    <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl p-6 w-[340px] mx-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-col items-center text-center gap-4">
                        <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                          <svg className="w-7 h-7 text-red-500" viewBox="0 0 24 24" fill="currentColor"><path d="M14 8c0-2.21-1.79-4-4-4S6 5.79 6 8s1.79 4 4 4 4-1.79 4-4zm3 2v2h6v-2h-6zm-7 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 dark:text-white text-base">Hủy kết bạn?</p>
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Bạn có chắc muốn hủy kết bạn với <span className="font-semibold text-gray-700 dark:text-gray-300">{profile?.displayName ?? 'người này'}</span> không?
                          </p>
                        </div>
                        <div className="flex gap-3 w-full">
                          <button
                            type="button"
                            onClick={() => setShowUnfriendConfirm(false)}
                            className="flex-1 h-10 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                          >
                            Không
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => { setShowUnfriendConfirm(false); handleUnfriend(); }}
                            className="flex-1 h-10 rounded-2xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition-colors disabled:opacity-60"
                          >
                            {actionLoading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> : 'Hủy kết bạn'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {friendStatus !== 'loading' && friendStatus !== 'blocked' && (
                  <button
                    type="button"
                    onClick={handleToggleFollow}
                    disabled={followLoading}
                    className={[
                      'inline-flex items-center gap-2 h-10 px-5 rounded-2xl text-sm font-bold transition-all disabled:opacity-60',
                      isFollowing
                        ? 'bg-surf-primary/10 dark:bg-surf-primary/20 text-surf-primary hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 dark:hover:text-red-400'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-surf-primary/10 dark:hover:bg-surf-primary/20 hover:text-surf-primary',
                    ].join(' ')}
                  >
                    {followLoading ? (
                      <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : isFollowing ? (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                      </svg>
                    )}
                    <span className={isFollowing ? 'group-hover:hidden' : ''}>
                      {isFollowing ? 'Đang theo dõi' : 'Theo dõi'}
                    </span>
                  </button>
                )}
                {friendStatus !== 'loading' && friendStatus !== 'blocked' && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 h-10 px-5 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" />
                    </svg>
                    Nhắn tin
                  </button>
                )}
                {friendStatus !== 'loading' && (
                  <button
                    type="button"
                    onClick={handleBlockToggle}
                    disabled={blockActionLoading}
                    className={[
                      'inline-flex items-center gap-2 h-10 px-5 rounded-2xl text-sm font-bold transition-colors disabled:opacity-60',
                      isBlocking
                        ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-300',
                    ].join(' ')}
                  >
                    {blockActionLoading ? (
                      <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.68L5.68 16.9C4.63 15.55 4 13.85 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.68L18.32 7.1C19.37 8.45 20 10.15 20 12c0 4.42-3.58 8-8 8z" />
                      </svg>
                    )}
                    {isBlocking ? 'Bỏ chặn' : 'Chặn'}
                  </button>
                )}
                {friendStatus !== 'loading' && (
                  <button
                    type="button"
                    className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    aria-label="Tùy chọn khác"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                    </svg>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Tab navigation — underline style */}
        <nav className="border-t border-gray-100 dark:border-gray-800/80" aria-label="Hồ sơ">
          <div className="flex overflow-x-auto scrollbar-hide px-2 sm:px-6">
            {TABS.filter((tab) => tab.id !== 'saved' || isOwnProfile).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={[
                  'relative flex items-center gap-1 flex-shrink-0 py-4 px-4 sm:px-5 text-sm font-semibold whitespace-nowrap transition-colors',
                  activeTab === tab.id
                    ? 'text-surf-primary'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200',
                ].join(' ')}
              >
                {tab.label}
                {tab.hasArrow && (
                  <svg className="w-3.5 h-3.5 opacity-70" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7 10l5 5 5-5z" />
                  </svg>
                )}
                {activeTab === tab.id && (
                  <span className="absolute bottom-0 left-1 right-1 h-0.5 rounded-full bg-gradient-to-r from-surf-primary to-surf-secondary" />
                )}
              </button>
            ))}
          </div>
        </nav>
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <section className="lg:col-span-2 space-y-4 order-1">
          {/* Create Post - Only show on own profile and on posts tab */}
          {isOwnProfile && activeTab === 'posts' && (
            <div className="rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 p-3 shadow-sm">
              <div className="flex gap-3 items-center">
                <div className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-sm font-semibold text-surf-primary flex-shrink-0 overflow-hidden">
                  {photoURL ? (
                    <img src={optimizeImageUrl(photoURL)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    initial
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => (window.location.href = '/feed')}
                  className="flex-1 text-left px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  Chia sẻ gì đó...
                </button>
                <button
                  type="button"
                  onClick={() => (window.location.href = '/feed')}
                  className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                  title="Ảnh"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => (window.location.href = '/feed')}
                  className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                  title="Video"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18 11c0-.55-.45-1-1-1h-2V7c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v3H1c-.55 0-1 .45-1 1s.45 1 1 1h2v7c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2v-7h2c.55 0 1-.45 1-1z" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* TAB: Posts */}
          {activeTab === 'posts' && (
            <>
              {/* Posts Section Header */}
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
                  Bài viết {!postsLoading && posts.length > 0 && `(${posts.length})`}
                </h2>
                {!postsLoading && posts.length > 0 && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                      title="Bộ lọc"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
                      </svg>
                    </button>
                    <div className="flex rounded-xl overflow-hidden border border-gray-200/80 dark:border-gray-700/80">
                      <button
                        type="button"
                        onClick={() => setViewMode('list')}
                        className={`p-2 ${viewMode === 'list' ? 'bg-surf-primary text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                        title="Danh sách"
                      >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm4 4h14v-2H7v2zm0-4h14v-2H7v2zM7 7v2h14V7H7z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('grid')}
                        className={`p-2 ${viewMode === 'grid' ? 'bg-surf-primary text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                        title="Lưới"
                      >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M3 3v8h8V3H3zm10 0v8h8V3h-8zM3 13v8h8v-8H3zm10 0v8h8v-8h-8z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Posts Loading State */}
              {postsLoading && (
                <div className="rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 p-8 text-center shadow-sm">
                  <div className="inline-block w-8 h-8 border-2 border-surf-primary border-t-transparent rounded-full animate-spin mb-3"></div>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Đang tải bài viết...</p>
                </div>
              )}

              {/* Posts Error State */}
              {!postsLoading && postsError && (
                <div className="rounded-3xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/50 p-6 text-center">
                  <p className="text-red-600 dark:text-red-400 text-sm">{postsError}</p>
                </div>
              )}

              {/* Posts Content - Use PostCard component for list view */}
              {!postsLoading && !postsError && posts.length === 0 && (
                <div className="rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 p-8 sm:p-12 text-center shadow-sm">
                  <svg
                    className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
                    />
                  </svg>
                  <p className="text-gray-500 dark:text-gray-400 text-sm mb-1 font-medium">
                    Chưa có bài viết nào
                  </p>
                  {isOwnProfile && (
                    <p className="text-gray-400 dark:text-gray-500 text-sm">
                      Hãy{' '}
                      <a href="/feed" className="text-surf-primary hover:underline">
                        đăng bài đầu tiên
                      </a>{' '}
                      của bạn
                    </p>
                  )}
                </div>
              )}

              {!postsLoading && !postsError && posts.length > 0 && viewMode === 'list' && (
                <div className="space-y-4">
                  {posts.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      currentUserId={user?.uid}
                      showPinOption={isOwnProfile}
                      onPostUpdated={(updated) => {
                        setPosts((prev) => {
                          const next = prev.map((p) =>
                            p.id === updated.id ? { ...p, pinnedAt: updated.pinnedAt ?? null } : p
                          );
                          return next.sort((a, b) => {
                            if (!!a.pinnedAt !== !!b.pinnedAt) return a.pinnedAt ? -1 : 1;
                            const getTs = (p: Post): number => {
                              const c = p.createdAt;
                              if (!c) return 0;
                              if (typeof c === 'object' && '_seconds' in c) return (c as { _seconds: number })._seconds;
                              if (typeof c === 'object' && 'seconds' in c) return (c as { seconds: number }).seconds;
                              return 0;
                            };
                            return getTs(b) - getTs(a);
                          });
                        });
                      }}
                    />
                  ))}
                </div>
              )}

              {!postsLoading && !postsError && posts.length > 0 && viewMode === 'grid' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {posts.map((post) => {
                    // For shared posts, also check sharedFrom media as fallback
                    const allMediaUrls = post.mediaUrls?.length
                      ? post.mediaUrls
                      : (post.sharedFrom?.mediaUrls ?? []);
                    const firstImage = allMediaUrls.find((u) => !isVideoUrl(u));
                    const firstVideo = allMediaUrls.find((u) => isVideoUrl(u));
                    const hasMedia = allMediaUrls.length > 0;
                    const isShared = !!post.sharedFrom;

                    return (
                      <article
                        key={post.id}
                        onClick={() => setSelectedPost(post)}
                        className="surf-card-hover rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 overflow-hidden cursor-pointer group shadow-sm"
                      >
                        <div className="aspect-square bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center overflow-hidden relative">
                          {hasMedia && firstImage ? (
                            <img
                              src={optimizeImageUrl(firstImage)}
                              alt=""
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : hasMedia && firstVideo ? (
                            <>
                              <video
                                src={firstVideo}
                                className="w-full h-full object-cover"
                                muted
                                playsInline
                                preload="metadata"
                              />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
                                  <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="text-center p-4">
                              <svg
                                className="w-8 h-8 mx-auto text-gray-400 dark:text-gray-500 mb-2"
                                fill="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z" />
                              </svg>
                              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                                {post.content || post.sharedFrom?.content || ''}
                              </p>
                            </div>
                          )}
                          {/* Multiple media badge */}
                          {post.mediaUrls && post.mediaUrls.length > 1 && (
                            <div className="absolute top-2 right-2 px-2 py-1 rounded-lg bg-black/60 backdrop-blur-sm text-white text-xs font-medium">
                              +{post.mediaUrls.length - 1}
                            </div>
                          )}
                          {/* Shared post badge */}
                          {isShared && (
                            <div className="absolute top-2 left-2 px-2 py-1 rounded-lg bg-green-600/80 backdrop-blur-sm text-white text-xs font-medium flex items-center gap-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                              </svg>
                              Đã chia sẻ
                            </div>
                          )}
                        </div>
                        <div className="p-2 flex items-center gap-2 border-t border-gray-100 dark:border-gray-800">
                          <div className="flex items-center gap-2 flex-1 min-w-0 text-xs text-gray-500 dark:text-gray-400">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                            </svg>
                            <span>{post.likeCount || 0}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-1 min-w-0 text-xs text-gray-500 dark:text-gray-400">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" />
                            </svg>
                            <span>{post.replyCount || 0}</span>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* TAB: About - Giới thiệu */}
          {activeTab === 'about' && profile && (
            <ProfileAbout
              uid={uid!}
              profile={profile}
              loginEmail={profileEmail}
              isOwn={isOwnProfile}
              postsCount={posts.length}
              friendsCount={friends.length}
              onProfileUpdate={(fields) =>
                setProfile((prev) => (prev ? { ...prev, ...fields } : null))
              }
            />
          )}

          {/* TAB: Friends - Bạn bè */}
          {activeTab === 'friends' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
                  Bạn bè {friends.length > 0 && `(${friends.length})`}
                </h2>
              </div>

              {friendsLoading && (
                <div className="rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 p-8 text-center shadow-sm">
                  <div className="inline-block w-8 h-8 border-2 border-surf-primary border-t-transparent rounded-full animate-spin mb-3"></div>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">
                    Đang tải danh sách bạn bè...
                  </p>
                </div>
              )}

              {!friendsLoading && friendsError && (
                <div className="rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 p-8 text-center shadow-sm">
                  <p className="text-red-600 dark:text-red-400 text-sm">{friendsError}</p>
                </div>
              )}

              {!friendsLoading && !friendsError && friends.length === 0 && (
                <div className="rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 p-8 text-center shadow-sm">
                  <svg
                    className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                  <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">
                    Chưa có bạn bè
                  </p>
                  {isOwnProfile && (
                    <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
                      Hãy{' '}
                      <a href="/friends" className="text-surf-primary hover:underline">
                        tìm kiếm và kết nối
                      </a>{' '}
                      với bạn bè
                    </p>
                  )}
                </div>
              )}

              {!friendsLoading && !friendsError && friends.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {friends.map((friend, idx) => (
                    <div
                      key={friend.id}
                      className="surf-card-hover surf-hero-in rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 overflow-hidden cursor-pointer group shadow-sm"
                      style={{ animationDelay: `${idx * 0.06}s` }}
                      onClick={() => navigate(`/feed/profile/${friend.id}`)}
                    >
                      <div className="aspect-square bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center overflow-hidden">
                        <div className="relative h-full w-full">
                          {friend.photoURL ? (
                            <img
                              src={optimizeImageUrl(friend.photoURL)}
                              alt={friend.displayName}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-4xl font-bold text-surf-primary">
                              {friend.displayName.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <PresenceBadge uid={friend.id} size="md" />
                        </div>
                      </div>
                      <div className="p-3">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                          {friend.displayName}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: Photos - Ảnh */}
          {activeTab === 'photos' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
                  Ảnh {photos.length > 0 && `(${photos.length})`}
                </h2>
              </div>

              {photosLoading && (
                <div className="rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 p-8 text-center shadow-sm">
                  <div className="inline-block w-8 h-8 border-2 border-surf-primary border-t-transparent rounded-full animate-spin mb-3"></div>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Đang tải ảnh...</p>
                </div>
              )}

              {!photosLoading && photosError && (
                <div className="rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 p-8 text-center shadow-sm">
                  <p className="text-red-600 dark:text-red-400 text-sm">{photosError}</p>
                </div>
              )}

              {!photosLoading && !photosError && photos.length === 0 && (
                <div className="rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 p-8 text-center shadow-sm">
                  <svg
                    className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">
                    Chưa có ảnh nào
                  </p>
                  {isOwnProfile && (
                    <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
                      Hãy{' '}
                      <a href="/feed" className="text-surf-primary hover:underline">
                        đăng bài có ảnh
                      </a>{' '}
                      đầu tiên
                    </p>
                  )}
                </div>
              )}

              {!photosLoading && !photosError && photos.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {photos.map((photo, index) => (
                    <div
                      key={`${photo.postId}-${index}`}
                      className="surf-card-hover surf-hero-in aspect-square rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-800 cursor-pointer group shadow-sm"
                      style={{ animationDelay: `${index * 0.04}s` }}
                    >
                      <img
                        src={optimizeImageUrl(photo.url)}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-110 group-hover:brightness-105 transition-all duration-500"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: Reels - Surf Clips */}
          {activeTab === 'reels' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
                  Surf Clips{clips.length > 0 && ` (${clips.length})`}
                </h2>
              </div>
              {clipsLoading && (
                <div className="rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 p-12 text-center shadow-sm">
                  <div className="inline-block w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Đang tải video...</p>
                </div>
              )}
              {!clipsLoading && clipsError && (
                <div className="rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 p-12 text-center shadow-sm">
                  <p className="text-red-500 text-sm">{clipsError}</p>
                </div>
              )}
              {!clipsLoading && !clipsError && clips.length === 0 && (
                <div className="rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 p-12 text-center shadow-sm">
                  <svg
                    className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">
                    Chưa có video nào
                  </p>
                </div>
              )}
              {!clipsLoading && !clipsError && clips.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {clips.map((clip, index) => (
                    <div
                      key={`${clip.postId}-${index}`}
                      onClick={() => setSelectedClip(clip)}
                      className="relative aspect-video rounded-2xl overflow-hidden bg-gray-900 cursor-pointer group"
                    >
                      <video
                        src={clip.url}
                        className="w-full h-full object-cover"
                        muted
                        playsInline
                        preload="metadata"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                        <svg
                          className="w-12 h-12 text-white drop-shadow-lg"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {selectedClip && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
                  onClick={() => setSelectedClip(null)}
                >
                  <div
                    className="relative max-w-2xl w-full mx-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedClip(null)}
                      className="absolute -top-10 right-0 text-white hover:text-gray-300 transition-colors"
                    >
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                    <video
                      src={selectedClip.url}
                      className="w-full rounded-2xl"
                      controls
                      autoPlay
                    />
                    {selectedClip.content && (
                      <p className="mt-3 text-white text-sm text-center">{selectedClip.content}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: Saved — only visible to own profile */}
          {activeTab === 'saved' && isOwnProfile && (
            <div className="space-y-4">
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
                Bài viết đã lưu {!savedPostsLoading && savedPosts.length > 0 && `(${savedPosts.length})`}
              </h2>
              {savedPostsLoading && (
                <div className="rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 p-8 text-center shadow-sm">
                  <div className="inline-block w-8 h-8 border-2 border-surf-primary border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Đang tải...</p>
                </div>
              )}
              {!savedPostsLoading && savedPostsError && (
                <div className="rounded-3xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/50 p-6 text-center">
                  <p className="text-red-600 dark:text-red-400 text-sm">{savedPostsError}</p>
                </div>
              )}
              {!savedPostsLoading && !savedPostsError && savedPosts.length === 0 && (
                <div className="rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 p-12 text-center shadow-sm">
                  <svg className="w-14 h-14 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                  <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Chưa lưu bài viết nào</p>
                  <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Nhấn biểu tượng lưu trên bài viết để lưu lại.</p>
                </div>
              )}
              {!savedPostsLoading && !savedPostsError && savedPosts.length > 0 && (
                <div className="space-y-4">
                  {savedPosts.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      currentUserId={user?.uid}
                      onPostUpdated={(updated) =>
                        setSavedPosts((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)))
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: More - Xem thêm */}
          {activeTab === 'more' && (
            <div className="rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 p-6 shadow-sm">
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-4">
                Xem thêm
              </h2>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('posts')}
                  className="w-full text-left px-4 py-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-3"
                >
                  <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
                  </svg>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Hoạt động
                  </span>
                </button>
                <button
                  type="button"
                  className="w-full text-left px-4 py-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-3"
                >
                  <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                  </svg>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Sự kiện sắp tới
                  </span>
                </button>
                <button
                  type="button"
                  className="w-full text-left px-4 py-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-3"
                >
                  <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z" />
                  </svg>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Kho lưu trữ
                  </span>
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ─── RIGHT SIDEBAR ─────────────────────────────────────────── */}
        <aside className="lg:col-span-1 space-y-4 order-2">
          {/* ── Bio Card ── */}
          <div
            className="surf-hero-in rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 overflow-hidden shadow-sm"
            style={{ animationDelay: '0.1s' }}
          >
            <div className="px-5 pt-4 pb-1 flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 tracking-wide uppercase opacity-50">
                Giới thiệu
              </h2>
              {isOwnProfile && (
                <button
                  type="button"
                  onClick={openBio}
                  className="text-xs text-surf-primary font-semibold hover:underline transition-opacity hover:opacity-80"
                >
                  {bio ? 'Chỉnh sửa' : '+ Thêm'}
                </button>
              )}
            </div>
            <div className="px-5 pb-5 pt-3 space-y-3">
              {bio ? (
                <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">{bio}</p>
              ) : (
                <p className="text-gray-400 dark:text-gray-500 text-sm italic">
                  {isOwnProfile
                    ? 'Hãy viết vài dòng giới thiệu về bản thân...'
                    : 'Chưa có tiểu sử.'}
                </p>
              )}
              {aboutDetails.length > 0 && (
                <ul className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                  {aboutDetails.map((item, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2.5 text-sm text-gray-700 dark:text-gray-300"
                    >
                      <span className="w-5 h-5 rounded-lg bg-surf-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <svg
                          className="w-3 h-3 text-surf-primary"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                        </svg>
                      </span>
                      {item.text}
                    </li>
                  ))}
                </ul>
              )}
              {isOwnProfile && (
                <button
                  type="button"
                  onClick={openAbout}
                  className="w-full py-2 rounded-2xl bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border border-gray-200/60 dark:border-gray-700/60"
                >
                  {aboutDetails.length > 0 ? 'Chỉnh sửa chi tiết' : '+ Thêm chi tiết cuộc sống'}
                </button>
              )}
            </div>
          </div>

          {/* ── Ảnh nổi bật ── */}
          {(highlightPhotos.length > 0 || isOwnProfile) && (
            <div
              className="surf-hero-in rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 overflow-hidden shadow-sm"
              style={{ animationDelay: '0.22s' }}
            >
              <div className="px-5 pt-4 pb-1 flex items-center justify-between">
                <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 tracking-wide uppercase opacity-50">
                  Ảnh nổi bật
                </h2>
                {isOwnProfile && (
                  <button
                    type="button"
                    onClick={() => highlightInputRef.current?.click()}
                    disabled={uploading}
                    className="text-xs text-surf-primary font-semibold hover:underline disabled:opacity-50"
                  >
                    + Thêm
                  </button>
                )}
              </div>
              <div className="px-5 pb-5 pt-3">
                {highlightPhotos.length > 0 ? (
                  <div className="grid grid-cols-3 gap-1.5">
                    {highlightPhotos.map((url, i) => (
                      <div key={i} className="relative group aspect-square">
                        <img
                          src={optimizeImageUrl(url)}
                          alt=""
                          className="w-full h-full rounded-2xl object-cover hover:brightness-95 transition-all"
                        />
                        {isOwnProfile && (
                          <button
                            type="button"
                            onClick={() => handleHighlightRemove(i)}
                            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center text-xs hover:bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity"
                            aria-label="Xóa ảnh"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => highlightInputRef.current?.click()}
                    disabled={uploading}
                    className="w-full aspect-video rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center gap-2 text-gray-400 dark:text-gray-500 hover:border-surf-primary hover:text-surf-primary transition-colors disabled:opacity-50"
                  >
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    <span className="text-xs font-medium">Thêm ảnh đáng chú ý</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── OWN PROFILE: Quick Links ── */}
          {isOwnProfile && (
            <div
              className="surf-hero-in rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 overflow-hidden shadow-sm"
              style={{ animationDelay: '0.34s' }}
            >
              <div className="px-5 pt-4 pb-1">
                <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 tracking-wide uppercase opacity-50">
                  Truy cập nhanh
                </h2>
              </div>
              <div className="px-3 pb-3 pt-2 space-y-0.5">
                <button
                  type="button"
                  onClick={() => setActiveTab('about')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-gray-700 dark:text-gray-300 hover:bg-surf-primary/5 dark:hover:bg-surf-primary/10 hover:text-surf-primary transition-colors text-sm text-left group"
                >
                  <span className="w-8 h-8 rounded-xl bg-surf-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-surf-primary/15 transition-colors">
                    <svg
                      className="w-4 h-4 text-surf-primary"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                    </svg>
                  </span>
                  <span className="font-medium">Chỉnh sửa thông tin</span>
                </button>
                <a
                  href="/settings"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-2xl text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm group"
                >
                  <span className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 group-hover:bg-gray-200 dark:group-hover:bg-gray-700 transition-colors">
                    <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
                    </svg>
                  </span>
                  <span className="font-medium">Cài đặt & Quyền riêng tư</span>
                </a>
                <button
                  type="button"
                  onClick={() => setActiveTab('photos')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm text-left group"
                >
                  <span className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 group-hover:bg-gray-200 dark:group-hover:bg-gray-700 transition-colors">
                    <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                    </svg>
                  </span>
                  <span className="font-medium">Xem tất cả ảnh</span>
                </button>
              </div>
            </div>
          )}

          {/* ── OTHER PROFILE: Options ── */}
          {!isOwnProfile && friendStatus !== 'loading' && (
            <div
              className="surf-hero-in rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 overflow-hidden shadow-sm"
              style={{ animationDelay: '0.34s' }}
            >
              <div className="px-5 pt-4 pb-1">
                <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 tracking-wide uppercase opacity-50">
                  Tùy chọn
                </h2>
              </div>
              <div className="px-3 pb-3 pt-2 space-y-0.5">
                <button
                  type="button"
                  onClick={() => setActiveTab('friends')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm text-left group"
                >
                  <span className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 group-hover:bg-gray-200 dark:group-hover:bg-gray-700 transition-colors">
                    <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                    </svg>
                  </span>
                  <span className="font-medium">Xem danh sách bạn bè</span>
                </button>
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm text-left group"
                >
                  <span className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 group-hover:bg-gray-200 dark:group-hover:bg-gray-700 transition-colors">
                    <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z" />
                    </svg>
                  </span>
                  <span className="font-medium">Chia sẻ trang cá nhân</span>
                </button>
                <div className="mx-3 my-1.5 border-t border-gray-100 dark:border-gray-800" />
                <button
                  type="button"
                  onClick={handleBlockToggle}
                  disabled={blockActionLoading}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-sm text-left group disabled:opacity-60"
                >
                  <span className="w-8 h-8 rounded-xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.68L5.68 16.9C4.63 15.55 4 13.85 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.68L18.32 7.1C19.37 8.45 20 10.15 20 12c0 4.42-3.58 8-8 8z" />
                    </svg>
                  </span>
                  <span className="font-medium">
                    {isBlocking ? 'Bỏ chặn người dùng' : 'Chặn người dùng'}
                  </span>
                </button>
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-sm text-left group"
                >
                  <span className="w-8 h-8 rounded-xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6h-5.6z" />
                    </svg>
                  </span>
                  <span className="font-medium">Báo cáo trang cá nhân</span>
                </button>
              </div>
            </div>
          )}
        </aside>
      </div>

      <Modal
        open={editProfileOpen}
        onClose={() => setEditProfileOpen(false)}
        title="Chỉnh sửa hồ sơ"
      >
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Tên hiển thị
          </label>
          <input
            type="text"
            value={editDisplayName}
            onChange={(e) => setEditDisplayName(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100"
            placeholder="Tên hiển thị"
          />
          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={() => setEditProfileOpen(false)}
              className="px-4 py-2 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm font-medium"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleEditProfileSubmit}
              className="px-4 py-2 rounded-xl bg-surf-primary text-white text-sm font-medium hover:bg-surf-primary/90"
            >
              Lưu
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={bioOpen}
        onClose={() => setBioOpen(false)}
        title={bio ? 'Chỉnh sửa tiểu sử' : 'Thêm tiểu sử'}
      >
        <div className="space-y-3">
          <textarea
            value={bioDraft}
            onChange={(e) => setBioDraft(e.target.value)}
            rows={4}
            className="w-full px-4 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 resize-none"
            placeholder="Viết vài dòng về bản thân..."
          />
          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={() => setBioOpen(false)}
              className="px-4 py-2 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm font-medium"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleBioSubmit}
              className="px-4 py-2 rounded-xl bg-surf-primary text-white text-sm font-medium hover:bg-surf-primary/90"
            >
              Lưu
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        title={aboutDetails.length > 0 ? 'Chỉnh sửa chi tiết' : 'Thêm chi tiết'}
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Thêm các mục như nơi học, nơi sống, v.v.
          </p>
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
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                </svg>
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
            <button
              type="button"
              onClick={() => setAboutOpen(false)}
              className="px-4 py-2 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm font-medium"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleAboutSubmit}
              className="px-4 py-2 rounded-xl bg-surf-primary text-white text-sm font-medium hover:bg-surf-primary/90"
            >
              Lưu
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={avatarPreviewOpen}
        onClose={handleAvatarPreviewClose}
        title="Xem trước ảnh đại diện"
      >
        <div className="space-y-4">
          {avatarPreviewUrl && (
            <div className="flex justify-center">
              <img
                src={optimizeImageUrl(avatarPreviewUrl)}
                alt="Xem trước"
                className="w-40 h-40 rounded-full object-cover border-2 border-gray-200 dark:border-gray-600"
              />
            </div>
          )}
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
            Ảnh sẽ được thu nhỏ để tải nhanh hơn.
          </p>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={handleAvatarPreviewClose}
              className="px-4 py-2 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm font-medium"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleAvatarConfirm}
              className="px-4 py-2 rounded-xl bg-surf-primary text-white text-sm font-medium hover:bg-surf-primary/90"
            >
              Đặt làm ảnh đại diện
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={coverPreviewOpen} onClose={handleCoverPreviewClose} title="Xem trước ảnh bìa">
        <div className="space-y-4">
          {coverPreviewUrl && (
            <div className="w-full aspect-video overflow-hidden rounded-2xl bg-gray-100 dark:bg-gray-800">
              <img src={optimizeImageUrl(coverPreviewUrl)} alt="Xem trước" className="w-full h-full object-cover" />
            </div>
          )}
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
            Ảnh sẽ được resize và tối ưu trước khi tải lên.
          </p>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={handleCoverPreviewClose}
              className="px-4 py-2 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm font-medium"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleCoverConfirm}
              className="px-4 py-2 rounded-xl bg-surf-primary text-white text-sm font-medium hover:bg-surf-primary/90"
            >
              Đặt làm ảnh bìa
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Post detail overlay (grid view click) ── */}
      {selectedPost && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedPost(null)}
        >
          <div
            className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setSelectedPost(null)}
              className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors"
              aria-label="Đóng"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <PostCard post={selectedPost} currentUserId={user?.uid} />
          </div>
        </div>
      )}
    </div>
  );
}
