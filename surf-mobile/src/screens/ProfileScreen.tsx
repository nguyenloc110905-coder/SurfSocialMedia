import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  useColorScheme,
  Dimensions,
  RefreshControl,
  Alert,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import type { RootStackParamList } from '@/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useSidebarStore } from '@/stores/sidebarStore';
import { api } from '@/lib/api';
import PostCard from '@/components/PostCard';
import type { FeedPost } from '@/stores/feedStore';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Profile'>;
  route: RouteProp<RootStackParamList, 'Profile'>;
  isActive?: boolean;
  resetSignal?: number;
  safeTop?: boolean;
  showBackButton?: boolean;
};

type UserProfile = {
  id?: string;
  displayName?: string | null;
  photoURL?: string | null;
  email?: string | null;
  bio?: string | null;
  coverImageUrl?: string | null;
  currentCity?: string | null;
  hometown?: string | null;
  birthday?: string | null;
  birthDate?: string | null;
  work?: Array<{ company: string; title?: string; current?: boolean }>;
  education?: Array<{ school: string; degree?: string; year?: string }>;
  relationship?: string | null;
  joinedAt?: unknown;
};

type Friend = { id: string; displayName?: string; photoURL?: string | null };

const DARK = {
  bg: '#0b1120',
  card: '#111827',
  border: '#243044',
  text: '#f8fafc',
  subtext: '#94a3b8',
  muted: '#1f2937',
  accent: '#1877f2',
  accentSoft: '#102d52',
  chip: '#172033',
};

const LIGHT = {
  bg: '#f3f4f6',
  card: '#ffffff',
  border: '#e5e7eb',
  text: '#050505',
  subtext: '#65676b',
  muted: '#e4e6eb',
  accent: '#1877f2',
  accentSoft: '#e7f3ff',
  chip: '#f0f2f5',
};

const { width: SW } = Dimensions.get('window');
const COVER_H = Math.max(165, Math.min(225, SW * 0.46));
const AVATAR_SIZE = 84;
const TABS = ['Tất cả', 'Ảnh', 'Reels'] as const;

function formatJoined(raw: unknown): string {
  if (!raw) return '';
  let ms = 0;
  if (typeof raw === 'number') ms = raw > 10_000_000_000 ? raw : raw * 1000;
  else if (typeof raw === 'string') ms = new Date(raw).getTime();
  else if (typeof raw === 'object' && raw !== null) {
    const r = raw as Record<string, unknown>;
    if (typeof r._seconds === 'number') ms = r._seconds * 1000;
    else if (typeof r.seconds === 'number') ms = r.seconds * 1000;
  }
  if (!ms) return '';
  const d = new Date(ms);
  return `Tham gia tháng ${d.getMonth() + 1}, ${d.getFullYear()}`;
}

function formatDateText(raw?: string | null) {
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return `${date.getDate()} tháng ${date.getMonth() + 1}, ${date.getFullYear()}`;
}

function isVideoUrl(url: string) {
  return url.includes('/video/upload/') || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url);
}

function firstMedia(post: FeedPost, kind: 'image' | 'video') {
  return post.mediaUrls?.find((url) => (kind === 'video' ? isVideoUrl(url) : !isVideoUrl(url))) ?? null;
}

function videoThumbnailUrl(url: string) {
  if (!url.includes('/video/upload/')) return null;
  return url
    .replace('/video/upload/', '/video/upload/so_0,f_jpg/')
    .replace(/\.(mp4|mov|webm|m4v)(\?.*)?$/i, '.jpg');
}

export default function ProfileScreen({
  navigation,
  route,
  isActive = true,
  resetSignal = 0,
  safeTop = true,
  showBackButton = true,
}: Props) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;
  const insets = useSafeAreaInsets();
  const { user: authUser } = useAuthStore();
  const toggleSidebar = useSidebarStore((state) => state.toggleSidebar);
  const scrollRef = useRef<ScrollView>(null);

  const targetUid = route.params?.userId ?? authUser?.uid ?? '';
  const isOwn = !route.params?.userId || route.params.userId === authUser?.uid;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<typeof TABS[number]>('Tất cả');
  const [refreshing, setRefreshing] = useState(false);
  const [friendStatus, setFriendStatus] = useState<'loading' | 'friends' | 'request_sent' | 'stranger'>('loading');
  const [actionLoading, setActionLoading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [mediaSheet, setMediaSheet] = useState<'avatar' | 'cover' | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPost, setPreviewPost] = useState<FeedPost | null>(null);
  const [friendRequestId, setFriendRequestId] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!targetUid) return;
    setProfileLoading(true);
    try {
      const data = await api.get<UserProfile>(`/api/users/${targetUid}`);
      setProfile(data);
    } catch {
      setProfile({});
    } finally {
      setProfileLoading(false);
    }
  }, [targetUid]);

  const loadPosts = useCallback(async () => {
    if (!targetUid) return;
    setPostsLoading(true);
    try {
      const data = await api.get<{ posts: FeedPost[] }>(`/api/users/${targetUid}/posts`);
      setPosts(data.posts ?? []);
    } catch {
      setPosts([]);
    } finally {
      setPostsLoading(false);
    }
  }, [targetUid]);

  const loadFriends = useCallback(async () => {
    if (!targetUid) return;
    setFriendsLoading(true);
    try {
      const data = await api.get<{ friends: Friend[] }>(`/api/users/${targetUid}/friends`);
      setFriends(data.friends ?? []);
    } catch {
      setFriends([]);
    } finally {
      setFriendsLoading(false);
    }
  }, [targetUid]);

  const loadFriendStatus = useCallback(async () => {
    if (isOwn || !targetUid) return;
    try {
      const data = await api.get<{ status: string; requestId?: string }>(`/api/friends/status/${targetUid}`);
      setFriendStatus(data.status as typeof friendStatus);
      setFriendRequestId(data.requestId ?? null);
    } catch {
      setFriendStatus('stranger');
    }
  }, [targetUid, isOwn]);

  useEffect(() => {
    if (!isActive) return;
    loadProfile();
    loadPosts();
    loadFriends();
    if (!isOwn) loadFriendStatus();
    else setFriendStatus('stranger');
  }, [isActive, loadProfile, loadPosts, loadFriends, loadFriendStatus, isOwn]);

  useFocusEffect(
    useCallback(() => {
      if (!isActive) return;
      loadProfile();
      loadPosts();
    }, [isActive, loadProfile, loadPosts])
  );

  useEffect(() => {
    if (!resetSignal) return;
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [resetSignal]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadProfile(), loadPosts(), loadFriends(), !isOwn ? loadFriendStatus() : Promise.resolve()]);
    setRefreshing(false);
  };

  const displayName = isOwn
    ? (profile?.displayName || authUser?.displayName || 'Người dùng')
    : (profile?.displayName || 'Người dùng');
  const photoURL = isOwn
    ? (profile?.photoURL || authUser?.photoURL || null)
    : (profile?.photoURL || null);
  const coverUrl = profile?.coverImageUrl ?? null;
  const bio = profile?.bio?.trim() || '';
  const initial = displayName.charAt(0).toUpperCase();
  const joined = formatJoined(profile?.joinedAt);
  const city = profile?.currentCity || profile?.hometown || '';
  const birthday = formatDateText(profile?.birthday || profile?.birthDate || null);

  const imagePosts = useMemo(() => posts.filter((post) => firstMedia(post, 'image')), [posts]);
  const reelPosts = useMemo(() => posts.filter((post) => firstMedia(post, 'video')), [posts]);
  const mutualPreview = friends.slice(0, 3);

  function friendBtnLabel() {
    if (friendStatus === 'friends') return 'Bạn bè';
    if (friendStatus === 'request_sent') return 'Đã gửi lời mời';
    return 'Thêm bạn';
  }

  function friendBtnIcon(): keyof typeof Ionicons.glyphMap {
    if (friendStatus === 'friends') return 'people';
    if (friendStatus === 'request_sent') return 'time-outline';
    return 'person-add-outline';
  }

  const handleFriendAction = async () => {
    if (actionLoading) return;
    setActionLoading(true);
    try {
      if (friendStatus === 'stranger') {
        const res = await api.post<{ id: string }>('/api/friends/requests', { toUid: targetUid });
        setFriendStatus('request_sent');
        setFriendRequestId(res.id);
      } else if (friendStatus === 'request_sent' && friendRequestId) {
        await api.delete(`/api/friends/requests/${friendRequestId}`);
        setFriendStatus('stranger');
        setFriendRequestId(null);
      } else if (friendStatus === 'friends') {
        await api.delete(`/api/friends/${targetUid}`);
        setFriendStatus('stranger');
      }
    } catch {
      Alert.alert('Chưa thể cập nhật', 'Vui lòng thử lại sau.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartChat = async () => {
    if (chatLoading || !targetUid) return;
    setChatLoading(true);
    try {
      const res = await api.post<{ item: { id: string } }>('/api/conversations', { peerUid: targetUid });
      const convId = res.item?.id;
      if (!convId) return;
      navigation.navigate('Chat', {
        conversationId: convId,
        title: displayName,
        peerUid: targetUid,
        peerAvatar: photoURL ?? null,
      });
    } catch {
      Alert.alert('Chưa thể mở tin nhắn', 'Vui lòng thử lại sau.');
    } finally {
      setChatLoading(false);
    }
  };

  const handlePickProfileImage = (slot: 'avatar' | 'cover') => {
    if (!isOwn) return;
    setMediaSheet(slot);
  };

  const closeMediaSheet = () => setMediaSheet(null);

  const openPreview = (url: string | null) => {
    closeMediaSheet();
    if (!url) {
      Alert.alert('Chưa có ảnh', 'Bạn chưa đặt ảnh cho mục này.');
      return;
    }
    const matchingPost = posts.find((post) => post.mediaUrls?.includes(url));
    if (matchingPost) {
      setPreviewPost(matchingPost);
      return;
    }
    setPreviewUrl(url);
  };

  const closePreview = () => {
    setPreviewUrl(null);
    setPreviewPost(null);
  };

  const openPhotoPicker = (mode: 'avatarUpload' | 'coverUpload' | 'coverPosted') => {
    closeMediaSheet();
    navigation.navigate('ProfilePhotoPicker', { mode });
  };

  const renderHeader = () => (
    <View style={[s.profileHeader, { backgroundColor: C.card }]}>
      <View style={[s.cover, { height: COVER_H, backgroundColor: C.muted }]}>
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, s.coverFallback]}>
            <Ionicons name="water" size={76} color="rgba(255,255,255,0.22)" />
          </View>
        )}
        <View style={s.coverShade} />
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => isOwn ? handlePickProfileImage('cover') : openPreview(coverUrl)}
        />
        <View style={s.coverTools}>
          <TouchableOpacity style={s.coverIconBtn} onPress={() => showBackButton ? navigation.goBack() : toggleSidebar()}>
            {showBackButton ? (
              <Ionicons name="arrow-back-outline" size={24} color="#fff" style={s.coverIconShadow} />
            ) : (
              <Ionicons name="menu-outline" size={25} color="#fff" style={s.coverIconShadow} />
            )}
          </TouchableOpacity>
          <View style={s.coverToolRight}>
            {isOwn && (
              <TouchableOpacity style={s.coverIconBtn} onPress={() => navigation.navigate('EditProfile')}>
                <Ionicons name="pencil-outline" size={23} color="#fff" style={s.coverIconShadow} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.coverIconBtn}>
              <Ionicons name="search-outline" size={24} color="#fff" style={s.coverIconShadow} />
            </TouchableOpacity>
            <TouchableOpacity style={s.coverIconBtn}>
              <Ionicons name="ellipsis-horizontal" size={24} color="#fff" style={s.coverIconShadow} />
            </TouchableOpacity>
          </View>
        </View>
        {isOwn && (
          <TouchableOpacity style={s.coverImageBtn} onPress={() => handlePickProfileImage('cover')}>
            <Ionicons name="camera-outline" size={27} color="#fff" style={s.coverIconShadow} />
          </TouchableOpacity>
        )}
      </View>

      <View style={[s.profileSheet, { backgroundColor: C.card }]}>
        <View style={s.identityPanel}>
          <TouchableOpacity
            style={s.avatarWrap}
            activeOpacity={isOwn ? 0.85 : 1}
            onPress={isOwn ? () => handlePickProfileImage('avatar') : undefined}
          >
            {photoURL ? (
              <Image source={{ uri: photoURL }} style={s.avatarImg} />
            ) : (
              <View style={[s.avatarImg, s.avatarFallback]}>
                <Text style={s.avatarInitial}>{initial}</Text>
              </View>
            )}
            {isOwn && (
              <TouchableOpacity style={[s.avatarCamera, { backgroundColor: C.muted }]} onPress={() => handlePickProfileImage('avatar')}>
                <Ionicons name="camera" size={20} color={C.text} />
              </TouchableOpacity>
            )}
          </TouchableOpacity>

          <View style={s.nameBlock}>
            <Text style={[s.displayName, { color: C.text }]} numberOfLines={1}>{displayName}</Text>
            <Text style={[s.statsInline, { color: C.text }]} numberOfLines={1} adjustsFontSizeToFit>
              <Text style={s.statStrong}>{friends.length}</Text> người bạn · <Text style={s.statStrong}>{posts.length}</Text> bài viết
            </Text>
          </View>

          <TouchableOpacity style={[s.roundAction, { backgroundColor: C.muted }]}>
            <Ionicons name="chevron-down" size={19} color={C.text} />
          </TouchableOpacity>
        </View>

        <View style={s.profileBody}>
          {bio ? <Text style={[s.bio, { color: C.text }]}>{bio}</Text> : null}
          {city ? (
            <View style={s.metaRow}>
              <Ionicons name="location-sharp" size={20} color={C.text} />
              <Text style={[s.metaText, { color: C.text }]}>{city}</Text>
            </View>
          ) : null}
          {mutualPreview.length > 0 ? (
            <View style={s.mutualRow}>
              <View style={s.mutualStack}>
                {mutualPreview.map((friend, index) => (
                  <View key={friend.id} style={[s.mutualAvatarWrap, { left: index * 17, borderColor: C.card }]}>
                    {friend.photoURL ? (
                      <Image source={{ uri: friend.photoURL }} style={s.mutualAvatar} />
                    ) : (
                      <View style={[s.mutualAvatar, s.avatarFallback]}>
                        <Text style={s.mutualInitial}>{(friend.displayName ?? '?').charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                  </View>
                ))}
              </View>
              <Text style={[s.mutualText, { color: C.text }]}>Bạn bè có điểm chung</Text>
            </View>
          ) : null}

          <View style={s.actionRow}>
            {isOwn ? (
              <>
                <TouchableOpacity style={[s.storyButton, { backgroundColor: C.accent }]} onPress={() => navigation.navigate('CreatePost')}>
                  <Ionicons name="add-circle-outline" size={20} color="#fff" />
                  <Text style={s.storyButtonText} numberOfLines={1} adjustsFontSizeToFit>Thêm vào tin</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.editButton, { backgroundColor: C.muted }]} onPress={() => navigation.navigate('EditProfile')}>
                  <Ionicons name="create" size={18} color={C.text} />
                  <Text style={[s.editButtonText, { color: C.text }]} numberOfLines={1} adjustsFontSizeToFit>
                    Chỉnh sửa trang cá nhân
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={[s.storyButton, { backgroundColor: friendStatus === 'friends' ? C.muted : C.accent }]}
                  onPress={handleFriendAction}
                  disabled={actionLoading || friendStatus === 'loading'}
                >
                  {actionLoading
                    ? <ActivityIndicator size="small" color={friendStatus === 'friends' ? C.text : '#fff'} />
                    : <Ionicons name={friendBtnIcon()} size={19} color={friendStatus === 'friends' ? C.text : '#fff'} />}
                  <Text
                    style={[s.storyButtonText, { color: friendStatus === 'friends' ? C.text : '#fff' }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {friendBtnLabel()}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.editButton, { backgroundColor: C.muted }]} onPress={handleStartChat} disabled={chatLoading}>
                  {chatLoading ? <ActivityIndicator size="small" color={C.text} /> : <Ionicons name="chatbubble" size={18} color={C.text} />}
                  <Text style={[s.editButtonText, { color: C.text }]} numberOfLines={1}>Nhắn tin</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {isOwn ? (
            <View style={s.lockNotice}>
              <View style={[s.lockIcon, { backgroundColor: C.muted }]}>
                <Ionicons name="shield-checkmark" size={20} color={C.text} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.lockTitle, { color: C.text }]}>Bạn đã khóa bảo vệ trang cá nhân</Text>
                <Text style={[s.lockLink, { color: C.accent }]}>Tìm hiểu thêm</Text>
              </View>
            </View>
          ) : null}
        </View>

        <View style={[s.tabBar, { backgroundColor: C.card, borderBottomColor: C.border }]}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[s.tabChip, activeTab === tab && { backgroundColor: C.accentSoft }]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[s.tabText, { color: activeTab === tab ? C.accent : C.subtext }]}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );

  const renderMediaSheet = () => {
    const isAvatarSheet = mediaSheet === 'avatar';
    return (
      <Modal visible={mediaSheet !== null} transparent animationType="slide" onRequestClose={closeMediaSheet}>
        <Pressable style={s.sheetOverlay} onPress={closeMediaSheet}>
          <Pressable style={[s.sheet, { backgroundColor: C.card }]}>
            <View style={s.sheetHandle} />
            {isAvatarSheet ? (
              <>
                <TouchableOpacity style={s.sheetRow} onPress={() => openPreview(photoURL)}>
                  <View style={[s.sheetIcon, { backgroundColor: C.muted }]}>
                    <Ionicons name="person-circle-outline" size={27} color={C.text} />
                  </View>
                  <Text style={[s.sheetText, { color: C.text }]}>Xem ảnh đại diện</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.sheetRow} onPress={() => openPhotoPicker('avatarUpload')}>
                  <View style={[s.sheetIcon, { backgroundColor: C.muted }]}>
                    <Ionicons name="image-outline" size={25} color={C.text} />
                  </View>
                  <Text style={[s.sheetText, { color: C.text }]}>Chọn ảnh đại diện</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity style={s.sheetRow} onPress={() => openPreview(coverUrl)}>
                  <View style={[s.sheetIcon, { backgroundColor: C.muted }]}>
                    <Ionicons name="image-outline" size={25} color={C.text} />
                  </View>
                  <Text style={[s.sheetText, { color: C.text }]}>Xem ảnh bìa</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.sheetRow} onPress={() => openPhotoPicker('coverUpload')}>
                  <View style={[s.sheetIcon, { backgroundColor: C.muted }]}>
                    <Ionicons name="push-outline" size={25} color={C.text} />
                  </View>
                  <Text style={[s.sheetText, { color: C.text }]}>Tải ảnh lên</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.sheetRow} onPress={() => openPhotoPicker('coverPosted')}>
                  <View style={[s.sheetIcon, { backgroundColor: C.muted }]}>
                    <Ionicons name="images-outline" size={25} color={C.text} />
                  </View>
                  <Text style={[s.sheetText, { color: C.text }]}>Chọn ảnh bìa</Text>
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    );
  };

  const renderPreviewModal = () => (
    <Modal visible={previewUrl !== null || previewPost !== null} transparent animationType="fade" onRequestClose={closePreview}>
      <View style={s.previewOverlay}>
        <TouchableOpacity style={s.previewClose} onPress={closePreview}>
          <Ionicons name="close" size={28} color="#fff" />
        </TouchableOpacity>
        {previewPost ? (
          <ScrollView style={s.previewPostScroll} contentContainerStyle={s.previewPostContent} showsVerticalScrollIndicator={false}>
            <PostCard post={previewPost} isVisible navigation={navigation} />
          </ScrollView>
        ) : previewUrl ? (
          <Image source={{ uri: previewUrl }} style={s.previewImage} resizeMode="contain" />
        ) : null}
      </View>
    </Modal>
  );

  const renderAboutSection = () => {
    const details = [
      city ? { icon: 'location-outline' as const, text: city } : null,
      birthday ? { icon: 'calendar-outline' as const, text: birthday } : null,
      profile?.relationship ? { icon: 'heart-outline' as const, text: profile.relationship } : null,
      ...(profile?.work ?? []).map((item) => ({
        icon: 'briefcase-outline' as const,
        text: item.title ? `${item.title} tại ${item.company}` : item.company,
      })),
      ...(profile?.education ?? []).map((item) => ({
        icon: 'school-outline' as const,
        text: item.degree ? `${item.school} · ${item.degree}` : item.school,
      })),
      joined ? { icon: 'water-outline' as const, text: joined } : null,
    ].filter(Boolean) as Array<{ icon: keyof typeof Ionicons.glyphMap; text: string }>;

    return (
      <View style={[s.section, { backgroundColor: C.card }]}>
        <View style={s.sectionHeader}>
          <Text style={[s.sectionTitle, { color: C.text }]}>Thông tin cá nhân</Text>
          {isOwn && (
            <TouchableOpacity onPress={() => navigation.navigate('EditProfile')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="create-outline" size={22} color={C.subtext} />
            </TouchableOpacity>
          )}
        </View>
        {details.length === 0 ? (
          <Text style={[s.emptyText, { color: C.subtext }]}>Chưa có thông tin cá nhân.</Text>
        ) : (
          details.map((item, index) => (
            <View key={`${item.icon}-${index}`} style={s.aboutRow}>
              <Ionicons name={item.icon} size={23} color={C.text} />
              <Text style={[s.aboutText, { color: C.text }]}>{item.text}</Text>
            </View>
          ))
        )}
      </View>
    );
  };

  const renderFriendsSection = () => (
    <View style={[s.section, { backgroundColor: C.card }]}>
      <View style={s.sectionHeader}>
        <Text style={[s.sectionTitle, { color: C.text }]}>Bạn bè</Text>
        {friends.length > 6 ? (
          <TouchableOpacity>
            <Text style={[s.seeAllText, { color: C.accent }]}>Xem tất cả</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {friendsLoading ? (
        <ActivityIndicator color={C.accent} style={{ paddingVertical: 24 }} />
      ) : friends.length === 0 ? (
        <Text style={[s.emptyText, { color: C.subtext }]}>Chưa có bạn bè.</Text>
      ) : (
        <View style={s.friendsWrap}>
          {friends.slice(0, 6).map((friend) => (
            <TouchableOpacity
              key={friend.id}
              style={s.friendItem}
              onPress={() => navigation.navigate('Profile', { userId: friend.id })}
            >
              {friend.photoURL ? (
                <Image source={{ uri: friend.photoURL }} style={s.friendAvatar} />
              ) : (
                <View style={[s.friendAvatar, s.avatarFallback]}>
                  <Text style={s.friendInitial}>{(friend.displayName ?? '?').charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <Text style={[s.friendName, { color: C.text }]} numberOfLines={2}>{friend.displayName ?? 'Người dùng'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );

  const renderMediaGrid = (items: FeedPost[], kind: 'image' | 'video') => {
    if (postsLoading) {
      return (
        <View style={s.loadingBlock}>
          <ActivityIndicator color={C.accent} />
        </View>
      );
    }
    if (items.length === 0) {
      return (
        <View style={s.emptyBlock}>
          <Ionicons name={kind === 'image' ? 'images-outline' : 'film-outline'} size={38} color={C.subtext} />
          <Text style={[s.emptyText, { color: C.subtext }]}>
            {kind === 'image' ? 'Chưa có ảnh nào.' : 'Chưa có reels nào.'}
          </Text>
        </View>
      );
    }

    return (
      <View style={[s.section, { backgroundColor: C.card }]}>
        <View style={s.mediaGrid}>
          {items.map((post) => {
            const media = firstMedia(post, kind);
            if (!media) return null;
            const thumbnail = kind === 'video' ? videoThumbnailUrl(media) : media;
            return (
              <TouchableOpacity key={post.id} style={s.mediaTile} onPress={() => navigation.navigate('NotificationPost', { postId: post.id })}>
                {thumbnail ? (
                  <Image source={{ uri: thumbnail }} style={s.mediaImage} resizeMode="cover" />
                ) : (
                  <View style={s.videoPlaceholder}>
                    <Ionicons name="film-outline" size={28} color="#fff" />
                  </View>
                )}
                {kind === 'video' ? (
                  <View style={s.videoBadge}>
                    <Ionicons name="play" size={15} color="#fff" />
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  const renderPosts = () => {
    if (postsLoading) {
      return (
        <View style={s.loadingBlock}>
          <ActivityIndicator color={C.accent} />
        </View>
      );
    }
    if (posts.length === 0) {
      return (
        <View style={s.emptyBlock}>
          <Ionicons name="newspaper-outline" size={38} color={C.subtext} />
          <Text style={[s.emptyText, { color: C.subtext }]}>Chưa có bài viết nào.</Text>
        </View>
      );
    }
    return posts.map((post) => (
      <PostCard key={post.id} post={post} isVisible={false} navigation={navigation} />
    ));
  };

  const renderTabContent = () => {
    if (activeTab === 'Ảnh') return renderMediaGrid(imagePosts, 'image');
    if (activeTab === 'Reels') return renderMediaGrid(reelPosts, 'video');

    return (
      <>
        {renderAboutSection()}
        {renderFriendsSection()}
        <View style={[s.postSectionHeader, { backgroundColor: C.card, borderTopColor: C.border }]}>
          <Text style={[s.sectionTitle, { color: C.text }]}>Bài viết</Text>
          {isOwn && (
            <TouchableOpacity style={[s.createPostPill, { backgroundColor: C.chip }]} onPress={() => navigation.navigate('CreatePost')}>
              <Ionicons name="add" size={16} color={C.text} />
              <Text style={[s.createPostText, { color: C.text }]}>Tạo bài viết</Text>
            </TouchableOpacity>
          )}
        </View>
        {renderPosts()}
      </>
    );
  };

  if (profileLoading) {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={safeTop ? ['top'] : []}>
        <View style={s.center}>
          <ActivityIndicator color={C.accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={safeTop ? ['top'] : []}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.accent} colors={[C.accent]} />}
      >
        {renderHeader()}
        <View style={{ paddingBottom: insets.bottom + 16 }}>
          {renderTabContent()}
        </View>
      </ScrollView>
      {renderMediaSheet()}
      {renderPreviewModal()}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  profileHeader: { marginBottom: 8 },
  cover: { width: SW, overflow: 'hidden' },
  coverFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f766e',
  },
  coverShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.16)',
  },
  coverTools: {
    position: 'absolute',
    top: 8,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  coverToolRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  coverIconBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverIconShadow: {
    textShadowColor: 'rgba(0,0,0,0.72)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  coverImageBtn: {
    position: 'absolute',
    right: 14,
    bottom: 18,
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileSheet: {
    marginTop: -10,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  identityPanel: {
    minHeight: 78,
    paddingLeft: 16,
    paddingRight: 14,
    paddingTop: 10,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarWrap: {
    position: 'absolute',
    left: 16,
    top: -18,
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 3,
    borderColor: '#fff',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: AVATAR_SIZE / 2,
    overflow: 'hidden',
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#64748b',
  },
  avatarInitial: { fontSize: 30, fontWeight: '800', color: '#fff' },
  avatarCamera: {
    position: 'absolute',
    right: -7,
    bottom: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  nameBlock: {
    flex: 1,
    marginLeft: AVATAR_SIZE + 16,
    minWidth: 0,
    justifyContent: 'center',
    transform: [{ translateY: -4 }],
  },
  displayName: { fontSize: 22, lineHeight: 27, fontWeight: '800' },
  statsInline: { marginTop: 1, fontSize: 14, lineHeight: 19 },
  statStrong: { fontWeight: '800' },
  roundAction: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: -4 }],
  },
  profileBody: { paddingHorizontal: 16, paddingBottom: 8, gap: 9 },
  bio: { fontSize: 16, lineHeight: 22 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaText: { fontSize: 14, fontWeight: '700' },
  mutualRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 9 },
  mutualStack: { width: 62, height: 30 },
  mutualAvatarWrap: {
    position: 'absolute',
    top: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    overflow: 'hidden',
  },
  mutualAvatar: { width: '100%', height: '100%', borderRadius: 15 },
  mutualInitial: { fontSize: 12, fontWeight: '800', color: '#fff' },
  mutualText: { flex: 1, fontSize: 14 },
  actionRow: { flexDirection: 'row', gap: 8 },
  storyButton: {
    flex: 0.92,
    minHeight: 42,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  storyButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  editButton: {
    flex: 1.38,
    minHeight: 42,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  editButtonText: { fontSize: 15, fontWeight: '700' },
  lockNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 4,
  },
  lockIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockTitle: { fontSize: 16, lineHeight: 21, fontWeight: '800' },
  lockLink: { marginTop: 0, fontSize: 15, fontWeight: '700' },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 9,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  tabChip: {
    minWidth: 72,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 15,
  },
  tabText: { fontSize: 15, fontWeight: '800' },
  section: {
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 19, fontWeight: '800' },
  seeAllText: { fontSize: 15, fontWeight: '600' },
  aboutRow: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 7 },
  aboutText: { flex: 1, fontSize: 16, lineHeight: 22, fontWeight: '600' },
  emptyText: { fontSize: 14, lineHeight: 20 },
  friendsWrap: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 12 },
  friendItem: { width: (SW - 32 - 20) / 3 },
  friendAvatar: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  friendInitial: { fontSize: 26, fontWeight: '800', color: '#fff' },
  friendName: { marginTop: 5, fontSize: 13, lineHeight: 17, fontWeight: '700' },
  postSectionHeader: {
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  createPostPill: {
    minHeight: 32,
    borderRadius: 16,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  createPostText: { fontSize: 13, fontWeight: '700' },
  loadingBlock: { paddingVertical: 34, alignItems: 'center' },
  emptyBlock: { paddingVertical: 38, alignItems: 'center', gap: 8 },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  mediaTile: {
    width: (SW - 32 - 8) / 3,
    aspectRatio: 1,
    backgroundColor: '#d1d5db',
  },
  mediaImage: { width: '100%', height: '100%' },
  videoBadge: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.38)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 22,
    paddingBottom: 34,
    gap: 10,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 72,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#a3a3a3',
    marginBottom: 8,
  },
  sheetRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  sheetIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetText: { flex: 1, fontSize: 21, lineHeight: 27, fontWeight: '800' },
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewClose: {
    position: 'absolute',
    top: 48,
    right: 18,
    zIndex: 2,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  previewImage: { width: '100%', height: '82%' },
  previewPostScroll: {
    width: '100%',
    alignSelf: 'stretch',
  },
  previewPostContent: {
    paddingTop: 104,
    paddingHorizontal: 12,
    paddingBottom: 28,
  },
});
