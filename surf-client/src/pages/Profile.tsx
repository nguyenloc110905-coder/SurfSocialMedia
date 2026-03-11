import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useNicknameStore } from '@/stores/nicknameStore';
import { getProfile, updateProfileFields, type UserProfile, type AboutDetail } from '@/lib/firebase/profile';
import { uploadProfileImage } from '@/lib/firebase/storage';
import { updateUserProfile } from '@/lib/firebase/auth';
import { resizeAvatar, resizeCover } from '@/lib/utils/image';
import Modal from '@/components/ui/Modal';
import { api } from '@/lib/api';
import PostCard from '@/components/feed/PostCard';
import ProfileAbout from './ProfileAbout';

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
      if (target === 0) { setter(0); return; }
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
  const resolve = useNicknameStore((s) => s.resolve);
  const rawDisplayName = isOwnProfile
    ? (user?.displayName?.trim() || profile?.displayName || 'Người dùng')
    : (profile?.displayName || 'Người dùng');
  const displayName = isOwnProfile ? rawDisplayName : resolve(uid ?? '', rawDisplayName);
  const initial = displayName.charAt(0).toUpperCase();
  // Lấy username từ đúng email của người sở hữu profile
  const profileEmail = isOwnProfile ? user?.email : profile?.email;
  const username = profileEmail?.split('@')[0]?.trim();
  const photoURL = isOwnProfile ? (user?.photoURL ?? profile?.photoURL) : profile?.photoURL ?? null;
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
    createdAt: any;
    likeCount: number;
    replyCount: number;
    likedBy: string[];
    feeling?: string;
    location?: string;
    taggedFriends?: Array<{ uid: string; displayName: string; photoURL?: string | null }>;
    privacy?: 'public' | 'friends' | 'only-me' | 'custom';
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
    createdAt: any;
  }
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [photosError, setPhotosError] = useState<string | null>(null);

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

  const friendCount: number | null = friends.length > 0 ? friends.length : null;

  // Trạng thái quan hệ bạn bè với user đang xem (chỉ dùng khi !isOwnProfile)
  type FriendStatus = 'loading' | 'self' | 'friends' | 'request_sent' | 'request_received' | 'stranger';
  const [friendStatus, setFriendStatus] = useState<FriendStatus>('loading');
  const [friendRequestId, setFriendRequestId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Follow state
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  // Friend tier state
  type FriendTier = 'priority' | 'normal' | 'restricted';
  const [friendTier, setFriendTier] = useState<FriendTier>('normal');
  const [tierDropdownOpen, setTierDropdownOpen] = useState(false);
  const [tierLoading, setTierLoading] = useState(false);
  const tierRef = useRef<HTMLDivElement>(null);

  // Mutual friends state
  interface MutualFriend { id: string; name: string; avatarUrl?: string }
  const [mutualFriends, setMutualFriends] = useState<MutualFriend[]>([]);
  const [mutualCount, setMutualCount] = useState(0);
  const [mutualLoading, setMutualLoading] = useState(false);

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
      .catch((err) => {
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
    return () => { cancelled = true; };
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
      } catch (err: any) {
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
    return () => { cancelled = true; };
  }, [uid]);

  // Load friends
  useEffect(() => {
    if (!uid || activeTab !== 'friends') return;
    let cancelled = false;
    
    const loadFriends = async () => {
      try {
        setFriendsLoading(true);
        setFriendsError(null);
        
        const response = await api.get<{ friends: Friend[] }>(`/api/users/${uid}/friends`);
        
        if (!cancelled) {
          setFriends(response.friends || []);
        }
      } catch (err: any) {
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
    return () => { cancelled = true; };
  }, [uid, activeTab]);

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
      } catch (err: any) {
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
    return () => { cancelled = true; };
  }, [uid, activeTab]);

  // Kiểm tra trạng thái bạn bè khi xem trang người khác
  useEffect(() => {
    if (!uid || isOwnProfile) {
      setFriendStatus('self');
      return;
    }
    let cancelled = false;
    setFriendStatus('loading');
    setFriendRequestId(null);
    api.get<{ status: string; requestId?: string }>(`/api/friends/status/${uid}`)
      .then((data) => {
        if (!cancelled) {
          setFriendStatus(data.status as FriendStatus);
          setFriendRequestId(data.requestId ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) setFriendStatus('stranger');
      });
    return () => { cancelled = true; };
  }, [uid, isOwnProfile]);

  // Kiểm tra trạng thái theo dõi
  useEffect(() => {
    if (!uid || isOwnProfile) return;
    let cancelled = false;
    api.get<{ isFollowing: boolean }>(`/api/users/${uid}/follow-status`)
      .then((data) => { if (!cancelled) setIsFollowing(data.isFollowing); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [uid, isOwnProfile]);

  // Load mutual friends
  useEffect(() => {
    if (!uid || isOwnProfile) return;
    let cancelled = false;
    setMutualLoading(true);
    api.get<{ mutualFriends: MutualFriend[]; count: number }>(`/api/friends/mutual/${uid}`)
      .then((data) => {
        if (!cancelled) {
          setMutualFriends(data.mutualFriends ?? []);
          setMutualCount(data.count ?? 0);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setMutualLoading(false); });
    return () => { cancelled = true; };
  }, [uid, isOwnProfile]);

  // Load friend tier (chỉ khi đã là bạn)
  useEffect(() => {
    if (!uid || isOwnProfile || friendStatus !== 'friends') return;
    let cancelled = false;
    api.get<{ tier: string }>(`/api/friends/tier/${uid}`)
      .then((data) => { if (!cancelled) setFriendTier((data.tier as FriendTier) ?? 'normal'); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [uid, isOwnProfile, friendStatus]);

  // Close tier dropdown on click outside
  useEffect(() => {
    if (!tierDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (tierRef.current && !tierRef.current.contains(e.target as Node)) setTierDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [tierDropdownOpen]);

  const handleSetTier = async (tier: FriendTier) => {
    if (!uid) return;
    setTierLoading(true);
    try {
      await api.put(`/api/friends/tier/${uid}`, { tier });
      setFriendTier(tier);
    } catch { /* ignore */ }
    finally { setTierLoading(false); setTierDropdownOpen(false); }
  };

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

  // ─── Friendship action handlers ────────────────────────────────────
  const handleSendFriendRequest = async () => {
    if (!uid) return;
    setActionLoading(true);
    try {
      const res = await api.post<{ id: string }>('/api/friends/requests', { toUid: uid });
      setFriendStatus('request_sent');
      setFriendRequestId(res.id);
    } catch {
      // silent
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
    } catch {
      // silent
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
    } catch {
      // silent
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
    } catch {
      // silent
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
    } catch {
      // silent
    } finally {
      setFollowLoading(false);
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
      <div className="rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 shadow-sm">
        {/* Top accent stripe — animated shimmer */}
        <div className="h-1 surf-stripe rounded-t-3xl" />

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
              <svg className="absolute bottom-0 left-0 right-0 w-[120%] -ml-[10%] opacity-25 dark:opacity-12" viewBox="0 0 1200 160" preserveAspectRatio="none" fill="none">
                <path className="surf-wave-1 text-surf-primary" d="M0 80 Q150 20 300 80 T600 80 T900 80 T1200 80 V160 H0Z" fill="currentColor" />
                <path className="surf-wave-2 text-surf-secondary" d="M0 110 Q150 50 300 110 T600 110 T900 110 T1200 110 V160 H0Z" fill="currentColor" opacity="0.7" />
              </svg>
              {/* Surf logo watermark */}
              <svg className="absolute top-4 right-8 w-48 h-48 opacity-[0.06] dark:opacity-[0.04] text-surf-primary surf-orb-1" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
              </svg>
            </div>
          )}
          {coverImageUrl && (
            <img src={coverImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover/cover:scale-[1.02]" />
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
            'relative z-20 flex flex-col items-center px-4 sm:px-8 pb-0',
            heroVisible ? 'surf-hero-in' : 'opacity-0',
          ].join(' ')}
        >
          {/* Avatar overlapping cover */}
          <div className="relative -mt-16 sm:-mt-20 z-10 surf-avatar-in">
            {/* Glow ring behind avatar */}
            <div className="surf-glow-ring absolute inset-0 rounded-3xl bg-gradient-to-br from-surf-primary/35 to-surf-secondary/35 blur-xl -z-10" />
            <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-3xl ring-4 ring-white dark:ring-gray-900 shadow-2xl overflow-hidden bg-gradient-to-br from-surf-primary to-surf-secondary flex items-center justify-center">
              {photoURL ? (
                <img src={photoURL} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-4xl sm:text-5xl font-bold text-white select-none">{initial}</span>
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

          {/* Name + username + bio */}
          <div className="mt-4 text-center max-w-lg w-full">
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">{displayName}</h1>
              {!isOwnProfile && friendStatus === 'friends' && (
                <span className="surf-badge-pop inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/25 text-emerald-600 dark:text-emerald-400 text-xs font-bold border border-emerald-200/60 dark:border-emerald-500/30">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
                  Bạn bè
                </span>
              )}
              {!isOwnProfile && friendStatus === 'request_received' && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/25 text-amber-600 dark:text-amber-400 text-xs font-bold border border-amber-200/60 dark:border-amber-500/30">
                  Đã gửi lời mời
                </span>
              )}
            </div>
            {username && (
              <p className="mt-1.5 text-sm font-bold surf-username tracking-wide">@{username}</p>
            )}
            {bio && (
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-400 leading-relaxed max-w-sm mx-auto">{bio}</p>
            )}
            {isOwnProfile && !bio && (
              <button type="button" onClick={openBio} className="mt-2 text-sm text-surf-primary/70 hover:text-surf-primary transition-colors hover:underline">
                + Thêm tiểu sử
              </button>
            )}
          </div>

          {/* Stats row */}
          <div className="mt-5 flex items-stretch divide-x divide-gray-200 dark:divide-gray-700/60 border border-gray-200/80 dark:border-gray-700/60 rounded-2xl overflow-hidden">
            <div className="surf-stat-pop flex flex-col items-center px-6 sm:px-8 py-3" style={{ animationDelay: '0.25s' }}>
              <span className="text-xl font-extrabold text-gray-900 dark:text-gray-100 tabular-nums">{postsLoading ? '–' : countPosts}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-medium">Bài viết</span>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('friends')}
              className="surf-stat-pop flex flex-col items-center px-6 sm:px-8 py-3 hover:bg-surf-primary/5 dark:hover:bg-surf-primary/10 transition-colors"
              style={{ animationDelay: '0.35s' }}
            >
              <span className="text-xl font-extrabold text-gray-900 dark:text-gray-100 tabular-nums">{countFriends}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-medium">Bạn bè</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('photos')}
              className="surf-stat-pop flex flex-col items-center px-6 sm:px-8 py-3 hover:bg-surf-primary/5 dark:hover:bg-surf-primary/10 transition-colors"
              style={{ animationDelay: '0.45s' }}
            >
              <span className="text-xl font-extrabold text-gray-900 dark:text-gray-100 tabular-nums">{countPhotos}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-medium">Ảnh</span>
            </button>
          </div>

          {/* Action buttons */}
          <div className="mt-5 mb-5 flex items-center justify-center gap-2 flex-wrap relative z-20">
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
                {friendStatus === 'stranger' && (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={handleSendFriendRequest}
                    className="inline-flex items-center gap-2 h-10 px-6 rounded-2xl bg-gradient-to-r from-surf-primary to-surf-secondary text-white text-sm font-bold shadow-lg shadow-surf-primary/25 hover:shadow-surf-primary/40 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-60 disabled:scale-100"
                  >
                    {actionLoading
                      ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                    }
                    Thêm bạn bè
                  </button>
                )}
                {friendStatus === 'request_sent' && (
                  <button
                    type="button"
                    disabled={actionLoading}
                    onClick={handleCancelRequest}
                    title="Nhấn để hủy lời mời"
                    className="group inline-flex items-center gap-2 h-10 px-6 rounded-2xl bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-sm font-bold hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-all disabled:opacity-60"
                  >
                    {actionLoading
                      ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
                    }
                    <span className="group-hover:hidden">Đã gửi lời mời</span>
                    <span className="hidden group-hover:inline">Hủy lời mời</span>
                  </button>
                )}
                {friendStatus === 'request_received' && (
                  <>
                    <button
                      type="button"
                      disabled={actionLoading}
                      onClick={handleAcceptRequest}
                      className="inline-flex items-center gap-1.5 h-10 px-6 rounded-2xl bg-gradient-to-r from-surf-primary to-surf-secondary text-white text-sm font-bold shadow-lg shadow-surf-primary/25 transition-all disabled:opacity-60"
                    >
                      {actionLoading && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
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
                {friendStatus === 'friends' && (
                  <div className="relative" ref={tierRef}>
                    <button
                      type="button"
                      onClick={() => setTierDropdownOpen((o) => !o)}
                      className={[
                        'inline-flex items-center gap-2 h-10 px-6 rounded-2xl text-sm font-bold transition-colors',
                        friendTier === 'priority'
                          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50'
                          : friendTier === 'restricted'
                            ? 'bg-red-100 dark:bg-red-900/20 text-red-500 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/40'
                            : 'bg-surf-primary/10 dark:bg-surf-primary/20 text-surf-primary hover:bg-surf-primary/20 dark:hover:bg-surf-primary/30',
                      ].join(' ')}
                    >
                      {friendTier === 'priority' && <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>}
                      {friendTier === 'normal' && <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>}
                      {friendTier === 'restricted' && <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>}
                      {friendTier === 'priority' ? 'Ưu tiên' : friendTier === 'restricted' ? 'Hạn chế' : 'Bạn bè'}
                      <svg className="w-3.5 h-3.5 opacity-60" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
                    </button>
                    {tierDropdownOpen && (
                      <div className="absolute left-0 top-full mt-2 w-56 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-2xl z-50 py-1 ring-1 ring-black/5 dark:ring-white/5" style={{ isolation: 'isolate' }}>
                        <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Trạng thái bạn bè</p>
                        {([
                          { value: 'priority' as FriendTier, label: 'Ưu tiên', desc: 'Nhận thông báo khi bạn này hoạt động', icon: '⭐', color: 'text-amber-500' },
                          { value: 'normal' as FriendTier, label: 'Bình thường', desc: 'Mặc định, hiện bài viết bình thường', icon: '👤', color: 'text-gray-600 dark:text-gray-400' },
                          { value: 'restricted' as FriendTier, label: 'Hạn chế', desc: 'Ít hiện bài, chỉ thấy bài public', icon: '🔒', color: 'text-red-500' },
                        ]).map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            disabled={tierLoading}
                            onClick={() => handleSetTier(opt.value)}
                            className={[
                              'w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50',
                              friendTier === opt.value ? 'bg-gray-100 dark:bg-gray-700' : '',
                            ].join(' ')}
                          >
                            <span className="text-lg flex-shrink-0 mt-0.5">{opt.icon}</span>
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-semibold ${opt.color}`}>{opt.label}</p>
                              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{opt.desc}</p>
                            </div>
                            {friendTier === opt.value && (
                              <svg className="w-4 h-4 text-surf-primary flex-shrink-0 mt-1" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {friendStatus !== 'loading' && (
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
                    {followLoading
                      ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      : isFollowing
                        ? <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
                    }
                    <span className={isFollowing ? 'group-hover:hidden' : ''}>
                      {isFollowing ? 'Đang theo dõi' : 'Theo dõi'}
                    </span>
                  </button>
                )}
                {friendStatus !== 'loading' && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 h-10 px-5 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
                    Nhắn tin
                  </button>
                )}
                {friendStatus !== 'loading' && (
                  <button
                    type="button"
                    className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    aria-label="Tùy chọn khác"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" /></svg>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Tab navigation — underline style */}
        <nav className="relative z-10 border-t border-gray-100 dark:border-gray-800/80 rounded-b-3xl overflow-hidden" aria-label="Hồ sơ">
          <div className="flex overflow-x-auto scrollbar-hide px-2 sm:px-6">
            {TABS.map((tab) => (
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
                    <img src={photoURL} alt="" className="w-full h-full object-cover" />
                  ) : (
                    initial
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => window.location.href = '/feed'}
                  className="flex-1 text-left px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  Chia sẻ gì đó...
                </button>
                <button 
                  type="button" 
                  onClick={() => window.location.href = '/feed'}
                  className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800" 
                  title="Ảnh"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" /></svg>
                </button>
                <button 
                  type="button"
                  onClick={() => window.location.href = '/feed'}
                  className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800" 
                  title="Video"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M18 11c0-.55-.45-1-1-1h-2V7c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v3H1c-.55 0-1 .45-1 1s.45 1 1 1h2v7c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2v-7h2c.55 0 1-.45 1-1z" /></svg>
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
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" /></svg>
                    </button>
                    <div className="flex rounded-xl overflow-hidden border border-gray-200/80 dark:border-gray-700/80">
                      <button 
                        type="button" 
                        onClick={() => setViewMode('list')} 
                        className={`p-2 ${viewMode === 'list' ? 'bg-surf-primary text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`} 
                        title="Danh sách"
                      >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm4 4h14v-2H7v2zm0-4h14v-2H7v2zM7 7v2h14V7H7z" /></svg>
                      </button>
                      <button 
                        type="button" 
                        onClick={() => setViewMode('grid')} 
                        className={`p-2 ${viewMode === 'grid' ? 'bg-surf-primary text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`} 
                        title="Lưới"
                      >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3v8h8V3H3zm10 0v8h8V3h-8zM3 13v8h8v-8H3zm10 0v8h8v-8h-8z" /></svg>
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
                  <svg className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                  </svg>
                  <p className="text-gray-500 dark:text-gray-400 text-sm mb-1 font-medium">Chưa có bài viết nào</p>
                  {isOwnProfile && (
                    <p className="text-gray-400 dark:text-gray-500 text-sm">
                      Hãy <a href="/feed" className="text-surf-primary hover:underline">đăng bài đầu tiên</a> của bạn
                    </p>
                  )}
                </div>
              )}

              {!postsLoading && !postsError && posts.length > 0 && viewMode === 'list' && (
                <div className="space-y-4">
                  {posts.map((post) => (
                    <PostCard key={post.id} post={post} currentUserId={user?.uid} />
                  ))}
                </div>
              )}

              {!postsLoading && !postsError && posts.length > 0 && viewMode === 'grid' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {posts.map((post) => {
                    const firstImage = post.mediaUrls?.[0];
                    const hasMedia = post.mediaUrls && post.mediaUrls.length > 0;
                    
                    return (
                      <article 
                        key={post.id} 
                        className="surf-card-hover rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 overflow-hidden cursor-pointer group shadow-sm"
                      >
                        <div className="aspect-square bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center overflow-hidden relative">
                          {hasMedia && firstImage ? (
                            <img 
                              src={firstImage} 
                              alt="" 
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="text-center p-4">
                              <svg className="w-8 h-8 mx-auto text-gray-400 dark:text-gray-500 mb-2" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/>
                              </svg>
                              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{post.content}</p>
                            </div>
                          )}
                          {post.mediaUrls && post.mediaUrls.length > 1 && (
                            <div className="absolute top-2 right-2 px-2 py-1 rounded-lg bg-black/60 backdrop-blur-sm text-white text-xs font-medium">
                              +{post.mediaUrls.length - 1}
                            </div>
                          )}
                        </div>
                        <div className="p-2 flex items-center gap-2 border-t border-gray-100 dark:border-gray-800">
                          <div className="flex items-center gap-2 flex-1 min-w-0 text-xs text-gray-500 dark:text-gray-400">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                            </svg>
                            <span>{post.likeCount || 0}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-1 min-w-0 text-xs text-gray-500 dark:text-gray-400">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
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
              {/* Mutual friends section (only when viewing another person's profile) */}
              {!isOwnProfile && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
                      Bạn chung {mutualCount > 0 && `(${mutualCount})`}
                    </h2>
                  </div>
                  {mutualLoading ? (
                    <div className="rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 p-6 text-center shadow-sm">
                      <div className="inline-block w-6 h-6 border-2 border-surf-primary border-t-transparent rounded-full animate-spin mb-2"></div>
                      <p className="text-gray-500 dark:text-gray-400 text-sm">Đang tải bạn chung...</p>
                    </div>
                  ) : mutualFriends.length === 0 ? (
                    <div className="rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 p-6 text-center shadow-sm">
                      <svg className="w-10 h-10 mx-auto mb-2 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <p className="text-gray-400 dark:text-gray-500 text-sm">Không có bạn chung với {displayName}</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {mutualFriends.map((mf, idx) => (
                        <div
                          key={mf.id}
                          className="surf-card-hover surf-hero-in rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 overflow-hidden cursor-pointer group shadow-sm"
                          style={{ animationDelay: `${idx * 0.06}s` }}
                          onClick={() => navigate(`/feed/profile/${mf.id}`)}
                        >
                          <div className="aspect-square bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center overflow-hidden">
                            {mf.avatarUrl ? (
                              <img src={mf.avatarUrl} alt={resolve(mf.id, mf.name)} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                            ) : (
                              <div className="text-4xl font-bold text-surf-primary">{resolve(mf.id, mf.name).charAt(0).toUpperCase()}</div>
                            )}
                          </div>
                          <div className="p-3">
                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{resolve(mf.id, mf.name)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* All friends */}
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
                  {isOwnProfile ? 'Bạn bè' : 'Tất cả bạn bè'} {friends.length > 0 && `(${friends.length})`}
                </h2>
              </div>

              {friendsLoading && (
                <div className="rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 p-8 text-center shadow-sm">
                  <div className="inline-block w-8 h-8 border-2 border-surf-primary border-t-transparent rounded-full animate-spin mb-3"></div>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Đang tải danh sách bạn bè...</p>
                </div>
              )}

              {!friendsLoading && friendsError && (
                <div className="rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 p-8 text-center shadow-sm">
                  <p className="text-red-600 dark:text-red-400 text-sm">{friendsError}</p>
                </div>
              )}

              {!friendsLoading && !friendsError && friends.length === 0 && (
                <div className="rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 p-8 text-center shadow-sm">
                  <svg className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Chưa có bạn bè</p>
                  {isOwnProfile && (
                    <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Hãy <a href="/friends" className="text-surf-primary hover:underline">tìm kiếm và kết nối</a> với bạn bè</p>
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
                        {friend.photoURL ? (
                          <img src={friend.photoURL} alt={resolve(friend.id, friend.displayName)} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        ) : (
                          <div className="text-4xl font-bold text-surf-primary">{resolve(friend.id, friend.displayName).charAt(0).toUpperCase()}</div>
                        )}
                      </div>
                      <div className="p-3">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{resolve(friend.id, friend.displayName)}</p>
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
                  <svg className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Chưa có ảnh nào</p>
                  {isOwnProfile && (
                    <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">Hãy <a href="/feed" className="text-surf-primary hover:underline">đăng bài có ảnh</a> đầu tiên</p>
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
                      <img src={photo.url} alt="" className="w-full h-full object-cover group-hover:scale-110 group-hover:brightness-105 transition-all duration-500" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: Reels - Surf Clips */}
          {activeTab === 'reels' && (
            <div className="rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 p-12 text-center shadow-sm">
              <svg className="w-20 h-20 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <p className="text-gray-500 dark:text-gray-400 text-sm font-medium mb-2">Surf Clips đang được phát triển</p>
              <p className="text-gray-400 dark:text-gray-500 text-sm">Tính năng video ngắn sẽ sớm ra mắt!</p>
            </div>
          )}

          {/* TAB: More - Xem thêm */}
          {activeTab === 'more' && (
            <div className="rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 p-6 shadow-sm">
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-4">
                Xem thêm
              </h2>
              <div className="space-y-2">
                <button type="button" onClick={() => setActiveTab('posts')} className="w-full text-left px-4 py-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-3">
                  <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" /></svg>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Hoạt động</span>
                </button>
                <button type="button" className="w-full text-left px-4 py-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-3">
                  <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" /></svg>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Sự kiện sắp tới</span>
                </button>
                <button type="button" className="w-full text-left px-4 py-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-3">
                  <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 24 24"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14z" /></svg>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Kho lưu trữ</span>
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ─── RIGHT SIDEBAR ─────────────────────────────────────────── */}
        <aside className="lg:col-span-1 space-y-4 order-2">

          {/* ── Bio Card ── */}
          <div className="surf-hero-in rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 overflow-hidden shadow-sm" style={{ animationDelay: '0.1s' }}>
            <div className="px-5 pt-4 pb-1 flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 tracking-wide uppercase opacity-50">Giới thiệu</h2>
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
                  {isOwnProfile ? 'Hãy viết vài dòng giới thiệu về bản thân...' : 'Chưa có tiểu sử.'}
                </p>
              )}
              {aboutDetails.length > 0 && (
                <ul className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                  {aboutDetails.map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700 dark:text-gray-300">
                      <span className="w-5 h-5 rounded-lg bg-surf-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <svg className="w-3 h-3 text-surf-primary" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
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
            <div className="surf-hero-in rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 overflow-hidden shadow-sm" style={{ animationDelay: '0.22s' }}>
              <div className="px-5 pt-4 pb-1 flex items-center justify-between">
                <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 tracking-wide uppercase opacity-50">Ảnh nổi bật</h2>
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
                        <img src={url} alt="" className="w-full h-full rounded-2xl object-cover hover:brightness-95 transition-all" />
                        {isOwnProfile && (
                          <button
                            type="button"
                            onClick={() => handleHighlightRemove(i)}
                            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center text-xs hover:bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity"
                            aria-label="Xóa ảnh"
                          >×</button>
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
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="text-xs font-medium">Thêm ảnh đáng chú ý</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── OWN PROFILE: Quick Links ── */}
          {isOwnProfile && (
            <div className="surf-hero-in rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 overflow-hidden shadow-sm" style={{ animationDelay: '0.34s' }}>
              <div className="px-5 pt-4 pb-1">
                <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 tracking-wide uppercase opacity-50">Truy cập nhanh</h2>
              </div>
              <div className="px-3 pb-3 pt-2 space-y-0.5">
                <button
                  type="button"
                  onClick={() => setActiveTab('about')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-gray-700 dark:text-gray-300 hover:bg-surf-primary/5 dark:hover:bg-surf-primary/10 hover:text-surf-primary transition-colors text-sm text-left group"
                >
                  <span className="w-8 h-8 rounded-xl bg-surf-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-surf-primary/15 transition-colors">
                    <svg className="w-4 h-4 text-surf-primary" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                  </span>
                  <span className="font-medium">Chỉnh sửa thông tin</span>
                </button>
                <a
                  href="/settings"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-2xl text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm group"
                >
                  <span className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 group-hover:bg-gray-200 dark:group-hover:bg-gray-700 transition-colors">
                    <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
                  </span>
                  <span className="font-medium">Cài đặt & Quyền riêng tư</span>
                </a>
                <button
                  type="button"
                  onClick={() => setActiveTab('photos')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm text-left group"
                >
                  <span className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 group-hover:bg-gray-200 dark:group-hover:bg-gray-700 transition-colors">
                    <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" /></svg>
                  </span>
                  <span className="font-medium">Xem tất cả ảnh</span>
                </button>
              </div>
            </div>
          )}

          {/* ── OTHER PROFILE: Options ── */}
          {!isOwnProfile && friendStatus !== 'loading' && (
            <div className="surf-hero-in rounded-3xl bg-white dark:bg-gray-900 border border-gray-200/60 dark:border-gray-700/60 overflow-hidden shadow-sm" style={{ animationDelay: '0.34s' }}>
              <div className="px-5 pt-4 pb-1">
                <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 tracking-wide uppercase opacity-50">Tùy chọn</h2>
              </div>
              <div className="px-3 pb-3 pt-2 space-y-0.5">
                <button
                  type="button"
                  onClick={() => setActiveTab('friends')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm text-left group"
                >
                  <span className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 group-hover:bg-gray-200 dark:group-hover:bg-gray-700 transition-colors">
                    <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
                  </span>
                  <span className="font-medium">Xem danh sách bạn bè</span>
                </button>
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm text-left group"
                >
                  <span className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 group-hover:bg-gray-200 dark:group-hover:bg-gray-700 transition-colors">
                    <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>
                  </span>
                  <span className="font-medium">Chia sẻ trang cá nhân</span>
                </button>
                <div className="mx-3 my-1.5 border-t border-gray-100 dark:border-gray-800" />
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-sm text-left group"
                >
                  <span className="w-8 h-8 rounded-xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-red-500" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.68L5.68 16.9C4.63 15.55 4 13.85 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.68L18.32 7.1C19.37 8.45 20 10.15 20 12c0 4.42-3.58 8-8 8z"/></svg>
                  </span>
                  <span className="font-medium">Chặn người dùng</span>
                </button>
                <button
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-sm text-left group"
                >
                  <span className="w-8 h-8 rounded-xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-red-500" viewBox="0 0 24 24" fill="currentColor"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6h-5.6z"/></svg>
                  </span>
                  <span className="font-medium">Báo cáo trang cá nhân</span>
                </button>
              </div>
            </div>
          )}

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
            <div className="w-full aspect-video overflow-hidden rounded-2xl bg-gray-100 dark:bg-gray-800">
              <img src={coverPreviewUrl} alt="Xem trước" className="w-full h-full object-cover" />
            </div>
          )}
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">Ảnh sẽ được resize và tối ưu trước khi tải lên.</p>
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
