import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '@/navigation';
import { useAuthStore } from '@/stores/authStore';
import { api, apiBaseUrl } from '@/lib/api';
import { uploadImage } from '@/lib/cloudinary';
import PostCard, { type FeedPost } from '@/components/PostCard';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'GroupDetail'>;
  route: RouteProp<RootStackParamList, 'GroupDetail'>;
};

type GroupDetailsInfo = {
  id: string;
  name: string;
  description?: string;
  coverImageUrl?: string;
  category?: string;
  privacy: 'public' | 'private';
  ownerId: string;
  adminIds: string[];
  memberIds?: string[];
  memberCount: number;
  membershipStatus: 'member' | 'pending' | 'none';
};

type GroupMember = {
  id: string;
  displayName?: string;
  photoURL?: string | null;
  role: 'admin' | 'moderator' | 'member';
  isOwner?: boolean;
};

type GroupRequest = {
  id: string;
  userId: string;
  status: string;
  user?: {
    id: string;
    displayName?: string;
    photoURL?: string | null;
  };
};

type Friend = {
  id: string;
  name?: string;
  displayName?: string;
  avatarUrl?: string | null;
  photoURL?: string | null;
};

type TabKey = 'discussion' | 'featured' | 'members' | 'requests';

const DARK = {
  bg: '#0f172a',
  card: '#111827',
  panel: '#1e293b',
  border: '#334155',
  text: '#e2e8f0',
  subtext: '#94a3b8',
  muted: '#64748b',
  accent: '#0ea5e9',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
};

const LIGHT = {
  bg: '#f8fafc',
  card: '#ffffff',
  panel: '#f1f5f9',
  border: '#e2e8f0',
  text: '#1f2937',
  subtext: '#64748b',
  muted: '#94a3b8',
  accent: '#0ea5e9',
  success: '#059669',
  warning: '#d97706',
  danger: '#dc2626',
};

function memberRoleLabel(member: GroupMember) {
  if (member.isOwner) return 'Người tạo';
  if (member.role === 'admin') return 'Quản trị viên';
  if (member.role === 'moderator') return 'Điều hành viên';
  return 'Thành viên';
}

function normalizeFriend(friend: Friend) {
  return {
    id: friend.id,
    name: friend.name ?? friend.displayName ?? 'Người dùng',
    avatarUrl: friend.avatarUrl ?? friend.photoURL ?? null,
  };
}

async function ensureLibraryPermission() {
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted) return true;
  const next = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return next.granted;
}

export default function GroupDetailScreen({ navigation, route }: Props) {
  const { groupId } = route.params;
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;
  const user = useAuthStore((state) => state.user);

  const [group, setGroup] = useState<GroupDetailsInfo | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [requests, setRequests] = useState<GroupRequest[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('discussion');
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [joining, setJoining] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [friends, setFriends] = useState<Array<{ id: string; name: string; avatarUrl: string | null }>>([]);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [inviting, setInviting] = useState(false);

  const isAdmin = useMemo(
    () => Boolean(group?.adminIds?.includes(user?.uid || '')),
    [group?.adminIds, user?.uid]
  );
  const isMember = group?.membershipStatus === 'member';

  const fetchGroup = useCallback(async () => {
    const data = await api.get<{ item: GroupDetailsInfo }>(`/api/groups/${groupId}`);
    setGroup(data.item);
  }, [groupId]);

  const loadPosts = useCallback(async (reset = true, nextPageCursor: number | null = null) => {
    if (!group) return;
    if (group.privacy === 'private' && group.membershipStatus !== 'member') {
      setPosts([]);
      setCursor(null);
      setHasMore(false);
      return;
    }
    if (reset) setTabLoading(true);
    try {
      const url = reset
        ? `/api/groups/${groupId}/posts?limit=20`
        : `/api/groups/${groupId}/posts?limit=20&cursor=${nextPageCursor}`;
      const data = await api.get<{ posts: FeedPost[]; nextCursor: number | null }>(url);
      setPosts((current) => (reset ? data.posts ?? [] : [...current, ...(data.posts ?? [])]));
      setCursor(data.nextCursor ?? null);
      setHasMore(Boolean(data.nextCursor));
    } finally {
      if (reset) setTabLoading(false);
    }
  }, [group, groupId]);

  const loadMembers = useCallback(async () => {
    setTabLoading(true);
    try {
      const data = await api.get<{ items: GroupMember[] }>(`/api/groups/${groupId}/members`);
      setMembers(data.items ?? []);
    } finally {
      setTabLoading(false);
    }
  }, [groupId]);

  const loadRequests = useCallback(async () => {
    if (!isAdmin) return;
    setTabLoading(true);
    try {
      const data = await api.get<{ items: GroupRequest[] }>(`/api/groups/${groupId}/requests`);
      setRequests(data.items ?? []);
    } finally {
      setTabLoading(false);
    }
  }, [groupId, isAdmin]);

  const loadActiveTab = useCallback(async () => {
    if (!group) return;
    if (activeTab === 'discussion') await loadPosts(true);
    if (activeTab === 'members') await loadMembers();
    if (activeTab === 'requests') await loadRequests();
  }, [activeTab, group, loadMembers, loadPosts, loadRequests]);

  const initialLoad = useCallback(async () => {
    setLoading(true);
    try {
      await fetchGroup();
    } catch (e) {
      Alert.alert('Nhóm', (e as Error).message || 'Không thể tải nhóm');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [fetchGroup, navigation]);

  useEffect(() => {
    void initialLoad();
  }, [initialLoad]);

  useEffect(() => {
    void loadActiveTab();
  }, [loadActiveTab]);

  useFocusEffect(
    useCallback(() => {
      void fetchGroup();
    }, [fetchGroup])
  );

  useEffect(() => {
    if (!showInviteModal) return;
    api.get<{ friends?: Friend[] }>('/api/friends')
      .then((data) => setFriends((data.friends ?? []).map(normalizeFriend)))
      .catch((e) => Alert.alert('Không thể tải bạn bè', (e as Error).message));
  }, [showInviteModal]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchGroup();
      await loadActiveTab();
    } finally {
      setRefreshing(false);
    }
  };

  const handleJoin = async () => {
    if (!group || joining) return;
    setJoining(true);
    try {
      const data = await api.post<{ status: 'joined' | 'pending'; item: GroupDetailsInfo }>(
        `/api/groups/${group.id}/join`
      );
      setGroup((current) =>
        current
          ? {
              ...current,
              membershipStatus: data.status === 'joined' ? 'member' : 'pending',
              memberCount: data.status === 'joined' ? current.memberCount + 1 : current.memberCount,
            }
          : current
      );
      Alert.alert('Nhóm', data.status === 'joined' ? 'Bạn đã tham gia nhóm.' : 'Yêu cầu đã được gửi.');
    } catch (e) {
      Alert.alert('Không thể tham gia', (e as Error).message);
    } finally {
      setJoining(false);
    }
  };

  const pickCover = async () => {
    if (!group || !isAdmin || uploadingCover) return;
    const granted = await ensureLibraryPermission();
    if (!granted) {
      Alert.alert('Quyền truy cập', 'Cần quyền truy cập thư viện ảnh để đổi ảnh bìa.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    setUploadingCover(true);
    try {
      const coverImageUrl = await uploadImage(result.assets[0], { folder: 'surf_groups_covers' });
      await api.put(`/api/groups/${group.id}`, { coverImageUrl });
      setGroup((current) => (current ? { ...current, coverImageUrl } : current));
    } catch (e) {
      Alert.alert('Không thể đổi ảnh bìa', (e as Error).message);
    } finally {
      setUploadingCover(false);
    }
  };

  const loadMore = async () => {
    if (!hasMore || !cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      await loadPosts(false, cursor);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleRequest = async (request: GroupRequest, action: 'approve' | 'reject') => {
    if (!group) return;
    try {
      await api.post(`/api/groups/${group.id}/requests/${request.userId}`, { action });
      setRequests((current) => current.filter((item) => item.userId !== request.userId));
      if (action === 'approve') {
        setGroup((current) => current ? { ...current, memberCount: current.memberCount + 1 } : current);
      }
    } catch (e) {
      Alert.alert('Không thể xử lý yêu cầu', (e as Error).message);
    }
  };

  const confirmMemberAction = (
    member: GroupMember,
    action: 'make_admin' | 'remove_admin' | 'make_moderator' | 'remove_moderator' | 'remove'
  ) => {
    if (!group) return;
    Alert.alert('Xác nhận', 'Bạn có chắc muốn thực hiện hành động này?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Đồng ý',
        style: action === 'remove' ? 'destructive' : 'default',
        onPress: async () => {
          try {
            if (action === 'remove') {
              await api.delete(`/api/groups/${group.id}/members/${member.id}`);
              setMembers((current) => current.filter((item) => item.id !== member.id));
              setGroup((current) => current ? { ...current, memberCount: Math.max(0, current.memberCount - 1) } : current);
            } else {
              await api.put(`/api/groups/${group.id}/members/${member.id}`, { action });
              const nextRole =
                action === 'make_admin' ? 'admin' :
                action === 'make_moderator' ? 'moderator' :
                'member';
              setMembers((current) =>
                current.map((item) => item.id === member.id ? { ...item, role: nextRole } : item)
              );
            }
          } catch (e) {
            Alert.alert('Không thể cập nhật thành viên', (e as Error).message);
          }
        },
      },
    ]);
  };

  const sendInvites = async () => {
    if (!group || selectedFriends.length === 0 || inviting) return;
    setInviting(true);
    try {
      await api.post(`/api/groups/${group.id}/invites`, { userIds: selectedFriends });
      setShowInviteModal(false);
      setSelectedFriends([]);
      Alert.alert('Nhóm', 'Đã gửi lời mời thành công.');
    } catch (e) {
      Alert.alert('Không thể mời bạn bè', (e as Error).message);
    } finally {
      setInviting(false);
    }
  };

  const shareGroup = async () => {
    if (!group) return;
    await Share.share({
      message: `${group.name}\n${apiBaseUrl}/feed/groups/${group.id}`,
    });
  };

  const renderPost = ({ item, index }: { item: FeedPost; index: number }) => (
    <PostCard post={item} isVisible={index < 3} navigation={navigation as any} />
  );

  const renderHeader = () => {
    if (!group) return null;
    return (
      <>
        <View style={[s.groupHeader, { backgroundColor: C.card, borderColor: C.border }]}>
          <View>
            {group.coverImageUrl ? (
              <Image source={{ uri: group.coverImageUrl }} style={s.cover} />
            ) : (
              <View style={[s.cover, s.coverFallback]}>
                <Ionicons name="people" size={54} color="#fff" />
              </View>
            )}
            {isAdmin && (
              <TouchableOpacity
                style={s.coverEditBtn}
                onPress={pickCover}
                disabled={uploadingCover}
              >
                {uploadingCover ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="camera-outline" size={16} color="#fff" />
                    <Text style={s.coverEditText}>Đổi ảnh bìa</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
          <View style={s.infoBlock}>
            <View style={[s.groupKicker, { backgroundColor: C.accent + '18' }]}>
              <Ionicons name="people-outline" size={13} color={C.accent} />
              <Text style={[s.groupKickerText, { color: C.accent }]}>Surf Groups</Text>
            </View>
            <Text style={[s.groupName, { color: C.text }]}>{group.name}</Text>
            <View style={s.metaRow}>
              <Ionicons
                name={group.privacy === 'public' ? 'earth-outline' : 'lock-closed-outline'}
                size={14}
                color={C.subtext}
              />
              <Text style={[s.metaText, { color: C.subtext }]}>
                {group.privacy === 'public' ? 'Công khai' : 'Riêng tư'}
              </Text>
              <Text style={[s.metaText, { color: C.subtext }]}>-</Text>
              <Text style={[s.metaText, { color: C.subtext }]}>{group.memberCount} thành viên</Text>
            </View>
            {group.description ? (
              <Text style={[s.description, { color: C.subtext }]}>{group.description}</Text>
            ) : null}
            <View style={s.actionRow}>
              {isMember ? (
                <TouchableOpacity
                  style={[s.secondaryBtn, { backgroundColor: C.accent + '20' }]}
                  onPress={() => setShowInviteModal(true)}
                >
                  <Ionicons name="person-add-outline" size={17} color={C.accent} />
                  <Text style={[s.secondaryBtnText, { color: C.accent }]}>Mời bạn</Text>
                </TouchableOpacity>
              ) : group.membershipStatus === 'pending' ? (
                <View style={[s.secondaryBtn, { backgroundColor: C.warning + '22' }]}>
                  <Ionicons name="time-outline" size={17} color={C.warning} />
                  <Text style={[s.secondaryBtnText, { color: C.warning }]}>Chờ duyệt</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[s.primaryBtn, { backgroundColor: C.accent }]}
                  onPress={handleJoin}
                  disabled={joining}
                >
                  {joining ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Tham gia nhóm</Text>}
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[s.iconBtn, { backgroundColor: C.panel }]} onPress={shareGroup}>
                <Ionicons name="share-social-outline" size={20} color={C.text} />
              </TouchableOpacity>
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[s.tabRow, { borderTopColor: C.border }]}>
            {(['discussion', 'featured', 'members'] as TabKey[]).map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[s.tabBtn, activeTab === tab && { borderBottomColor: C.accent }]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[s.tabText, { color: activeTab === tab ? C.accent : C.subtext }]}>
                  {tab === 'discussion'
                    ? 'Thảo luận'
                    : tab === 'featured'
                      ? 'Đáng chú ý'
                      : `Mọi người (${group.memberCount})`}
                </Text>
              </TouchableOpacity>
            ))}
            {isAdmin && (
              <TouchableOpacity
                style={[s.tabBtn, activeTab === 'requests' && { borderBottomColor: C.accent }]}
                onPress={() => setActiveTab('requests')}
              >
                <Text style={[s.tabText, { color: activeTab === 'requests' ? C.accent : C.subtext }]}>
                  Yêu cầu{requests.length ? ` (${requests.length})` : ''}
                </Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>

        {activeTab === 'discussion' && isMember && (
          <TouchableOpacity
            style={[s.composer, { backgroundColor: C.card, borderColor: C.border }]}
            onPress={() => navigation.navigate('CreatePost', { groupId: group.id, groupName: group.name })}
          >
            <View style={[s.composerAvatar, { backgroundColor: C.accent + '30' }]}>
              <Ionicons name="person" size={17} color={C.accent} />
            </View>
            <Text style={[s.composerText, { color: C.subtext }]}>Viết bài trong nhóm...</Text>
            <Ionicons name="images-outline" size={20} color={C.success} />
          </TouchableOpacity>
        )}

        {tabLoading && (
          <View style={s.tabLoading}>
            <ActivityIndicator color={C.accent} />
          </View>
        )}
      </>
    );
  };

  const renderEmpty = () => {
    if (tabLoading) return null;
    if (!group) return null;
    if (activeTab === 'discussion' && group.privacy === 'private' && group.membershipStatus !== 'member') {
      return (
        <View style={[s.emptyBox, { backgroundColor: C.card, borderColor: C.border }]}>
          <Ionicons name="lock-closed-outline" size={34} color={C.muted} />
          <Text style={[s.emptyTitle, { color: C.text }]}>Đây là nhóm riêng tư</Text>
          <Text style={[s.emptyText, { color: C.subtext }]}>Tham gia nhóm để xem các bài thảo luận.</Text>
        </View>
      );
    }
    if (activeTab === 'featured') {
      return (
        <View style={[s.emptyBox, { backgroundColor: C.card, borderColor: C.border }]}>
          <Ionicons name="star-outline" size={34} color={C.muted} />
          <Text style={[s.emptyTitle, { color: C.text }]}>Chưa có nội dung đáng chú ý</Text>
          <Text style={[s.emptyText, { color: C.subtext }]}>Quản trị viên chưa ghim bài viết nào.</Text>
        </View>
      );
    }
    if (activeTab === 'discussion') {
      return (
        <View style={[s.emptyBox, { backgroundColor: C.card, borderColor: C.border }]}>
          <Ionicons name="chatbubbles-outline" size={34} color={C.muted} />
          <Text style={[s.emptyTitle, { color: C.text }]}>Chưa có bài viết</Text>
          <Text style={[s.emptyText, { color: C.subtext }]}>Hãy bắt đầu một cuộc thảo luận mới.</Text>
        </View>
      );
    }
    return null;
  };

  const renderMember = ({ item }: { item: GroupMember }) => (
    <View style={[s.memberRow, { backgroundColor: C.card, borderColor: C.border }]}>
      {item.photoURL ? (
        <Image source={{ uri: item.photoURL }} style={s.avatar} />
      ) : (
        <View style={[s.avatar, { backgroundColor: C.panel, alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={[s.avatarLetter, { color: C.text }]}>{(item.displayName || 'U')[0].toUpperCase()}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[s.memberName, { color: C.text }]} numberOfLines={1}>{item.displayName || 'Người dùng'}</Text>
        <Text style={[s.memberRole, { color: item.isOwner ? C.warning : item.role === 'member' ? C.subtext : C.accent }]}>
          {memberRoleLabel(item)}
        </Text>
      </View>
      {isAdmin && item.id !== user?.uid && !item.isOwner && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.memberActions}>
          {item.role === 'member' && (
            <>
              <TouchableOpacity style={[s.smallBtn, { backgroundColor: C.panel }]} onPress={() => confirmMemberAction(item, 'make_moderator')}>
                <Text style={[s.smallBtnText, { color: C.text }]}>+ ĐHV</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.smallBtn, { backgroundColor: C.panel }]} onPress={() => confirmMemberAction(item, 'make_admin')}>
                <Text style={[s.smallBtnText, { color: C.text }]}>+ QTV</Text>
              </TouchableOpacity>
            </>
          )}
          {item.role === 'moderator' && (
            <>
              <TouchableOpacity style={[s.smallBtn, { backgroundColor: C.panel }]} onPress={() => confirmMemberAction(item, 'remove_moderator')}>
                <Text style={[s.smallBtnText, { color: C.text }]}>Gỡ ĐHV</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.smallBtn, { backgroundColor: C.panel }]} onPress={() => confirmMemberAction(item, 'make_admin')}>
                <Text style={[s.smallBtnText, { color: C.text }]}>+ QTV</Text>
              </TouchableOpacity>
            </>
          )}
          {item.role === 'admin' && (
            <TouchableOpacity style={[s.smallBtn, { backgroundColor: C.panel }]} onPress={() => confirmMemberAction(item, 'remove_admin')}>
              <Text style={[s.smallBtnText, { color: C.text }]}>Gỡ QTV</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[s.smallBtn, { backgroundColor: C.danger + '18' }]} onPress={() => confirmMemberAction(item, 'remove')}>
            <Text style={[s.smallBtnText, { color: C.danger }]}>Xóa</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );

  const renderRequest = ({ item }: { item: GroupRequest }) => (
    <View style={[s.requestRow, { backgroundColor: C.card, borderColor: C.border }]}>
      {item.user?.photoURL ? (
        <Image source={{ uri: item.user.photoURL }} style={s.avatar} />
      ) : (
        <View style={[s.avatar, { backgroundColor: C.panel, alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons name="person" size={18} color={C.subtext} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={[s.memberName, { color: C.text }]}>{item.user?.displayName || 'Người dùng ẩn'}</Text>
        <Text style={[s.memberRole, { color: C.subtext }]}>Đang chờ phê duyệt</Text>
      </View>
      <View style={s.requestActions}>
        <TouchableOpacity style={[s.approveBtn, { backgroundColor: C.accent }]} onPress={() => void handleRequest(item, 'approve')}>
          <Ionicons name="checkmark" size={18} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={[s.rejectBtn, { backgroundColor: C.panel }]} onPress={() => void handleRequest(item, 'reject')}>
          <Ionicons name="close" size={18} color={C.text} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const listData = activeTab === 'discussion'
    ? posts
    : activeTab === 'members'
      ? members
      : activeTab === 'requests'
        ? requests
        : [];

  if (loading) {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={C.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]}>
      <View style={[s.topBar, { backgroundColor: C.bg, borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={s.hitSlop}>
          <Ionicons name="chevron-back" size={26} color={C.text} />
        </TouchableOpacity>
          <Text style={[s.topTitle, { color: C.text }]} numberOfLines={1}>{group?.name ?? 'Nhóm'}</Text>
        <TouchableOpacity onPress={shareGroup} hitSlop={s.hitSlop}>
          <Ionicons name="share-social-outline" size={23} color={C.text} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={listData as any[]}
        keyExtractor={(item) => item.id}
        renderItem={(info) => {
          if (activeTab === 'discussion') return renderPost(info as { item: FeedPost; index: number });
          if (activeTab === 'members') return renderMember(info as { item: GroupMember });
          if (activeTab === 'requests') return renderRequest(info as { item: GroupRequest });
          return null;
        }}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={s.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.accent} />}
        onEndReached={activeTab === 'discussion' ? loadMore : undefined}
        onEndReachedThreshold={0.35}
        ListFooterComponent={
          activeTab === 'discussion' && loadingMore ? (
            <View style={s.footerLoading}><ActivityIndicator color={C.accent} /></View>
          ) : null
        }
      />

      <Modal visible={showInviteModal} transparent animationType="slide" onRequestClose={() => setShowInviteModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.sheet, { backgroundColor: C.card }]}>
            <View style={[s.sheetHeader, { borderBottomColor: C.border }]}>
              <Text style={[s.sheetTitle, { color: C.text }]}>Mời bạn bè</Text>
              <TouchableOpacity onPress={() => setShowInviteModal(false)} hitSlop={s.hitSlop}>
                <Ionicons name="close" size={24} color={C.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={friends}
              keyExtractor={(item) => item.id}
              contentContainerStyle={friends.length ? s.friendList : s.emptyFriendList}
              ListEmptyComponent={<Text style={[s.emptyText, { color: C.subtext }]}>Bạn chưa có bạn bè nào.</Text>}
              renderItem={({ item }) => {
                const selected = selectedFriends.includes(item.id);
                return (
                  <TouchableOpacity
                    style={[s.friendRow, { borderBottomColor: C.border }]}
                    onPress={() =>
                      setSelectedFriends((current) =>
                        selected ? current.filter((id) => id !== item.id) : [...current, item.id]
                      )
                    }
                  >
                    {item.avatarUrl ? (
                      <Image source={{ uri: item.avatarUrl }} style={s.avatar} />
                    ) : (
                      <View style={[s.avatar, { backgroundColor: C.panel, alignItems: 'center', justifyContent: 'center' }]}>
                        <Text style={[s.avatarLetter, { color: C.text }]}>{item.name[0].toUpperCase()}</Text>
                      </View>
                    )}
                    <Text style={[s.friendName, { color: C.text }]}>{item.name}</Text>
                    <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={22} color={selected ? C.accent : C.subtext} />
                  </TouchableOpacity>
                );
              }}
            />
            <View style={[s.inviteFooter, { borderTopColor: C.border }]}>
              <TouchableOpacity style={[s.copyBtn, { backgroundColor: C.accent + '18' }]} onPress={shareGroup}>
                <Ionicons name="link-outline" size={18} color={C.accent} />
                <Text style={[s.copyText, { color: C.accent }]}>Chia sẻ link</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.sendInviteBtn, { backgroundColor: selectedFriends.length ? C.accent : C.border }]}
                disabled={!selectedFriends.length || inviting}
                onPress={sendInvites}
              >
                {inviting ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Gửi ({selectedFriends.length})</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  hitSlop: { top: 10, bottom: 10, left: 10, right: 10 },
  topBar: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800' },
  listContent: { padding: 10, paddingBottom: 24 },
  groupHeader: { borderWidth: 1, borderRadius: 8, overflow: 'hidden', marginBottom: 10 },
  cover: { width: '100%', height: 118 },
  coverFallback: { backgroundColor: '#0ea5e9', alignItems: 'center', justifyContent: 'center' },
  coverEditBtn: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15,23,42,0.72)',
	    paddingHorizontal: 10,
	    minHeight: 32,
	    borderRadius: 16,
	  },
	  coverEditText: { color: '#fff', fontSize: 12, fontWeight: '800' },
	  infoBlock: { padding: 12 },
	  groupKicker: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 8 },
	  groupKickerText: { fontSize: 10, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
	  groupName: { fontSize: 22, fontWeight: '900', lineHeight: 27 },
	  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' },
	  metaText: { fontSize: 12, fontWeight: '600' },
	  description: { marginTop: 7, fontSize: 13, lineHeight: 18 },
	  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
	  primaryBtn: { flex: 1, minHeight: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
	  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
	  secondaryBtn: { flex: 1, minHeight: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
	  secondaryBtnText: { fontSize: 14, fontWeight: '800' },
	  iconBtn: { width: 38, height: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
	  tabRow: { borderTopWidth: 1, paddingHorizontal: 10, gap: 16 },
	  tabBtn: { paddingVertical: 10, borderBottomWidth: 3, borderBottomColor: 'transparent' },
	  tabText: { fontSize: 13, fontWeight: '800' },
	  composer: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 10 },
  composerAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  composerText: { flex: 1, fontSize: 14, fontWeight: '600' },
  tabLoading: { paddingVertical: 16, alignItems: 'center' },
  emptyBox: { borderWidth: 1, borderRadius: 8, padding: 22, alignItems: 'center', marginTop: 4 },
  emptyTitle: { marginTop: 10, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  emptyText: { marginTop: 6, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 8 },
  requestRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 8 },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  avatarLetter: { fontSize: 15, fontWeight: '800' },
  memberName: { fontSize: 14, fontWeight: '800' },
  memberRole: { marginTop: 2, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  memberActions: { gap: 6, alignItems: 'center' },
  smallBtn: { minHeight: 30, borderRadius: 7, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' },
  smallBtnText: { fontSize: 11, fontWeight: '800' },
  requestActions: { flexDirection: 'row', gap: 8 },
  approveBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  rejectBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  footerLoading: { paddingVertical: 16 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { maxHeight: '86%', borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: 'hidden' },
  sheetHeader: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1 },
  sheetTitle: { fontSize: 18, fontWeight: '900' },
  friendList: { paddingHorizontal: 16 },
  emptyFriendList: { padding: 28, alignItems: 'center' },
  friendRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  friendName: { flex: 1, fontSize: 14, fontWeight: '800' },
  inviteFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderTopWidth: 1 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 42, paddingHorizontal: 12, borderRadius: 8 },
  copyText: { fontSize: 13, fontWeight: '800' },
  sendInviteBtn: { flex: 1, minHeight: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});

