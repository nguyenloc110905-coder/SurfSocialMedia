import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation';
import {
  useFriendStore,
  type FriendPerson,
  type FriendRequestItem,
} from '@/stores/friendStore';
import { useT } from '@/lib/i18n';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'MainTabs'>;
  scrollTopSignal?: number;
  resetSignal?: number;
  safeTop?: boolean;
  showTitleBlock?: boolean;
  onScrollPositionChange?: (atTop: boolean) => void;
};

type MainTab = 'friends' | 'requests' | 'suggestions';
type RequestTab = 'incoming' | 'outgoing';

const DARK = {
  bg: '#0f172a',
  card: '#1e293b',
  card2: '#253347',
  border: '#334155',
  text: '#e2e8f0',
  subtext: '#94a3b8',
  muted: '#64748b',
  accent: '#0ea5e9',
  danger: '#ef4444',
  success: '#22c55e',
  input: '#1e293b',
};

const LIGHT = {
  bg: '#f8fafc',
  card: '#ffffff',
  card2: '#f1f5f9',
  border: '#e2e8f0',
  text: '#1f2937',
  subtext: '#64748b',
  muted: '#94a3b8',
  accent: '#0ea5e9',
  danger: '#dc2626',
  success: '#16a34a',
  input: '#f1f5f9',
};

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function initials(name: string): string {
  return (name.trim() || '?').charAt(0).toUpperCase();
}

function Avatar({ name, url, size = 52 }: { name: string; url?: string | null; size?: number }) {
  if (url) {
    return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }

  return (
    <View style={[s.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[s.avatarText, { fontSize: size * 0.36 }]}>{initials(name)}</Text>
    </View>
  );
}

export default function FriendsScreen({
  navigation,
  scrollTopSignal = 0,
  resetSignal = 0,
  safeTop = true,
  showTitleBlock = true,
  onScrollPositionChange,
}: Props) {
  const scheme = useColorScheme();
  const t = useT();
  const C = scheme === 'dark' ? DARK : LIGHT;
  const listRef = useRef<FlatList<any>>(null);
  const [activeTab, setActiveTab] = useState<MainTab>('requests');
  const [requestTab, setRequestTab] = useState<RequestTab>('incoming');
  const [query, setQuery] = useState('');

  const friends = useFriendStore((state) => state.friends);
  const incomingRequests = useFriendStore((state) => state.incomingRequests);
  const outgoingRequests = useFriendStore((state) => state.outgoingRequests);
  const suggestions = useFriendStore((state) => state.suggestions);
  const loading = useFriendStore((state) => state.loading);
  const requestsLoading = useFriendStore((state) => state.requestsLoading);
  const suggestionsLoading = useFriendStore((state) => state.suggestionsLoading);
  const refreshing = useFriendStore((state) => state.refreshing);
  const actionById = useFriendStore((state) => state.actionById);
  const error = useFriendStore((state) => state.error);
  const fetchAll = useFriendStore((state) => state.fetchAll);
  const refreshAll = useFriendStore((state) => state.refreshAll);
  const acceptRequest = useFriendStore((state) => state.acceptRequest);
  const rejectRequest = useFriendStore((state) => state.rejectRequest);
  const cancelRequest = useFriendStore((state) => state.cancelRequest);
  const sendRequest = useFriendStore((state) => state.sendRequest);
  const removeFriend = useFriendStore((state) => state.removeFriend);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!resetSignal) return;
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    onScrollPositionChange?.(true);
  }, [resetSignal]);

  useEffect(() => {
    if (!scrollTopSignal) return;
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    onScrollPositionChange?.(true);
  }, [onScrollPositionChange, scrollTopSignal]);

  const filteredFriends = useMemo(() => {
    const q = normalizeText(query.trim());
    if (!q) return friends;
    return friends.filter((friend) => normalizeText(friend.name).includes(q));
  }, [friends, query]);

  const requests = requestTab === 'incoming' ? incomingRequests : outgoingRequests;
  const isLoading =
    activeTab === 'friends'
      ? loading
      : activeTab === 'requests'
        ? requestsLoading
        : suggestionsLoading;

  const showActionError = (fallback: string) => (e: unknown) => {
    Alert.alert(t('unable_action'), (e as Error).message || fallback);
  };

  const confirmRemoveFriend = (friend: FriendPerson) => {
    Alert.alert(t('unfriend'), t('unfriend_confirm', { name: friend.name }), [
      { text: t('close_modal'), style: 'cancel' },
      {
        text: t('unfriend'),
        style: 'destructive',
        onPress: () => removeFriend(friend.id).catch(showActionError(t('unfriend'))),
      },
    ]);
  };

  const openProfile = (uid: string) => navigation.navigate('Profile', { userId: uid });

  const renderFriend = ({ item }: { item: FriendPerson }) => {
    const busy = !!actionById[item.id];
    return (
      <TouchableOpacity
        style={[s.row, { borderBottomColor: C.border }]}
        activeOpacity={0.75}
        onPress={() => openProfile(item.id)}
      >
        <Avatar name={item.name} url={item.avatarUrl} />
        <View style={s.rowBody}>
          <Text style={[s.name, { color: C.text }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[s.meta, { color: C.subtext }]}>{item.mutualCount ? t('mutual_friends', { count: item.mutualCount }) : t('view_profile')}</Text>
        </View>
        <TouchableOpacity
          style={[s.iconBtn, { backgroundColor: C.card2 }]}
          onPress={() => openProfile(item.id)}
          disabled={busy}
        >
          <Ionicons name="person-outline" size={18} color={C.text} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.iconBtn, { backgroundColor: `${C.danger}18` }]}
          onPress={() => confirmRemoveFriend(item)}
          disabled={busy}
        >
          {busy ? <ActivityIndicator size={16} color={C.danger} /> : <Ionicons name="person-remove-outline" size={18} color={C.danger} />}
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderRequest = ({ item }: { item: FriendRequestItem }) => {
    const busy = !!actionById[item.id];
    return (
      <TouchableOpacity
        style={[s.requestCard, { backgroundColor: C.card, borderColor: C.border }]}
        activeOpacity={0.78}
        onPress={() => openProfile(item.uid)}
      >
        <Avatar name={item.name} url={item.avatarUrl} size={56} />
        <View style={s.requestBody}>
          <Text style={[s.name, { color: C.text }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[s.meta, { color: C.subtext }]}>
            {requestTab === 'incoming' ? t('friend_request_sent') : t('waiting_response')}
          </Text>
          {requestTab === 'incoming' ? (
            <View style={s.actions}>
              <TouchableOpacity
                style={[s.primaryBtn, { backgroundColor: C.accent }]}
                onPress={() => acceptRequest(item.id).catch(showActionError(t('unable_action')))}
                disabled={busy}
              >
                {busy ? <ActivityIndicator size={14} color="#fff" /> : <Ionicons name="checkmark" size={16} color="#fff" />}
                <Text style={s.primaryText}>{t('accept')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.outlineBtn, { borderColor: C.border }]}
                onPress={() => rejectRequest(item.id).catch(showActionError(t('unable_action')))}
                disabled={busy}
              >
                <Text style={[s.outlineText, { color: C.text }]}>{t('decline')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[s.outlineBtn, s.singleAction, { borderColor: C.border }]}
              onPress={() => cancelRequest(item.id).catch(showActionError(t('unable_action')))}
              disabled={busy}
            >
              {busy ? <ActivityIndicator size={14} color={C.text} /> : <Ionicons name="close-circle-outline" size={16} color={C.text} />}
              <Text style={[s.outlineText, { color: C.text }]}>{t('revoke')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderSuggestion = ({ item }: { item: FriendPerson }) => {
    const busy = !!actionById[item.id];
    return (
      <TouchableOpacity
        style={[s.row, { borderBottomColor: C.border }]}
        activeOpacity={0.75}
        onPress={() => openProfile(item.id)}
      >
        <Avatar name={item.name} url={item.avatarUrl} />
        <View style={s.rowBody}>
          <Text style={[s.name, { color: C.text }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[s.meta, { color: C.subtext }]}>{item.mutualCount ? t('mutual_friends', { count: item.mutualCount }) : t('view_profile')}</Text>
        </View>
        <TouchableOpacity
          style={[s.addBtn, { backgroundColor: C.accent }]}
          onPress={() => sendRequest(item).catch(showActionError(t('unable_action')))}
          disabled={busy}
        >
          {busy ? <ActivityIndicator size={14} color="#fff" /> : <Ionicons name="person-add-outline" size={16} color="#fff" />}
          <Text style={s.primaryText}>{t('add')}</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderHeader = () => (
    <View style={[s.headerControls, { backgroundColor: C.bg, borderBottomColor: C.border }]}>
      {showTitleBlock && <View style={s.titleBlock}>
        <Text style={[s.headerTitle, { color: C.text }]}>{t('friends_title')}</Text>
        <Text style={[s.headerSub, { color: C.subtext }]}>
          {t('friends_subtitle')}
        </Text>
      </View>}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.tabs}
      >
        <TabButton
          C={C}
          active={activeTab === 'requests'}
          icon="person-add-outline"
          label={t('friend_requests')}
          count={incomingRequests.length}
          onPress={() => setActiveTab('requests')}
        />
        <TabButton
          C={C}
          active={activeTab === 'suggestions'}
          icon="sparkles-outline"
          label={t('suggestions')}
          count={suggestions.length}
          onPress={() => setActiveTab('suggestions')}
        />
        <TabButton
          C={C}
          active={activeTab === 'friends'}
          icon="people-outline"
          label={t('your_friends')}
          count={friends.length}
          onPress={() => setActiveTab('friends')}
        />
      </ScrollView>

      {activeTab === 'friends' ? (
        <View style={[s.searchBox, { backgroundColor: C.input, borderColor: C.border }]}>
          <Ionicons name="search" size={17} color={C.subtext} />
          <TextInput
            style={[s.searchInput, { color: C.text }]}
            placeholder={t('search_friends')}
            placeholderTextColor={C.subtext}
            value={query}
            onChangeText={setQuery}
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={C.subtext} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <View style={s.sectionHeader}>
        <Text style={[s.sectionTitle, { color: C.text }]}>
          {activeTab === 'friends'
            ? `${t('your_friends')} ${friends.length ? `(${friends.length})` : ''}`
            : activeTab === 'requests'
              ? `${t('friend_requests')} ${incomingRequests.length ? incomingRequests.length : ''}`
              : `${t('suggestions')} ${suggestions.length ? `(${suggestions.length})` : ''}`}
        </Text>
        {activeTab === 'friends' && query.trim() ? (
          <Text style={[s.sectionMeta, { color: C.subtext }]}>{t('results_count', { count: filteredFriends.length })}</Text>
        ) : null}
      </View>

      {activeTab === 'requests' ? (
        <View style={s.requestTabs}>
          <RequestFilter C={C} active={requestTab === 'incoming'} label={t('incoming_requests', { count: incomingRequests.length })} onPress={() => setRequestTab('incoming')} />
          <RequestFilter C={C} active={requestTab === 'outgoing'} label={t('outgoing_requests', { count: outgoingRequests.length })} onPress={() => setRequestTab('outgoing')} />
        </View>
      ) : null}

      {error ? (
        <TouchableOpacity style={[s.errorBox, { borderColor: C.danger, backgroundColor: `${C.danger}12` }]} onPress={refreshAll}>
          <Ionicons name="warning-outline" size={16} color={C.danger} />
          <Text style={[s.errorText, { color: C.danger }]} numberOfLines={2}>{error}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const listData =
    activeTab === 'friends'
      ? filteredFriends
      : activeTab === 'requests'
        ? requests
        : suggestions;

  const renderListItem = ({ item }: { item: FriendPerson | FriendRequestItem }) => {
    if (activeTab === 'requests') return renderRequest({ item: item as FriendRequestItem });
    if (activeTab === 'suggestions') return renderSuggestion({ item: item as FriendPerson });
    return renderFriend({ item: item as FriendPerson });
  };

  const handleScroll = (event: any) => {
    onScrollPositionChange?.(Math.max(0, event.nativeEvent.contentOffset.y) < 12);
  };

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={safeTop ? ['top'] : []}>
      {isLoading && listData.length === 0 ? (
        <FlatList
          ref={listRef}
          data={[0, 1, 2, 3, 4]}
          keyExtractor={(item) => `skeleton-${item}`}
          ListHeaderComponent={renderHeader}
          renderItem={() => <SkeletonRow C={C} />}
          contentContainerStyle={s.listContent}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} tintColor={C.accent} colors={[C.accent]} />}
        />
      ) : (
        <FlatList
          ref={listRef}
          data={listData}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderHeader}
          renderItem={renderListItem}
          ListEmptyComponent={<EmptyState C={C} activeTab={activeTab} requestTab={requestTab} query={query} />}
          contentContainerStyle={s.listContent}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} tintColor={C.accent} colors={[C.accent]} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

function TabButton({
  C,
  active,
  icon,
  label,
  count,
  onPress,
}: {
  C: typeof DARK;
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  count: number;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        s.tabBtn,
        {
          backgroundColor: active ? `${C.accent}22` : C.card,
          borderColor: active ? C.accent : C.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Ionicons name={icon} size={16} color={active ? C.accent : C.text} />
      <Text style={[s.tabText, { color: active ? C.accent : C.text }]}>{label}</Text>
      {count > 0 ? <Text style={[s.tabCount, { color: active ? C.accent : C.subtext }]}>{count > 99 ? '99+' : count}</Text> : null}
    </TouchableOpacity>
  );
}

function RequestFilter({ C, active, label, onPress }: { C: typeof DARK; active: boolean; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[s.filterBtn, { backgroundColor: active ? `${C.accent}22` : C.card, borderColor: active ? C.accent : C.border }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[s.filterText, { color: active ? C.accent : C.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function SkeletonRow({ C }: { C: typeof DARK }) {
  return (
    <View style={[s.row, { borderBottomColor: C.border }]}>
      <View style={[s.skAvatar, { backgroundColor: C.card2 }]} />
      <View style={s.rowBody}>
        <View style={[s.skLine, { width: '64%', backgroundColor: C.card2 }]} />
        <View style={[s.skLine, { width: '42%', backgroundColor: C.card2 }]} />
      </View>
      <View style={[s.skBtn, { backgroundColor: C.card2 }]} />
    </View>
  );
}

function EmptyState({ C, activeTab, requestTab, query }: { C: typeof DARK; activeTab: MainTab; requestTab: RequestTab; query: string }) {
  const t = useT();
  const icon =
    activeTab === 'friends'
      ? 'people-outline'
      : activeTab === 'requests'
        ? 'person-add-outline'
        : 'sparkles-outline';
  const title =
    activeTab === 'friends'
      ? query.trim() ? t('friends_not_found') : t('friends_empty')
      : activeTab === 'requests'
        ? requestTab === 'incoming' ? t('requests_empty_incoming') : t('requests_empty_outgoing')
        : t('suggestions_empty');
  const body =
    activeTab === 'friends'
      ? t('friends_empty_body')
      : activeTab === 'requests'
        ? t('requests_empty_body')
        : t('suggestions_empty_body');

  return (
    <View style={s.empty}>
      <Ionicons name={icon} size={54} color={C.subtext} />
      <Text style={[s.emptyTitle, { color: C.text }]}>{title}</Text>
      <Text style={[s.emptyText, { color: C.subtext }]}>{body}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  listContent: { paddingBottom: 22 },
  headerControls: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 12,
  },
  titleBlock: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10 },
  headerTitle: { fontSize: 28, fontWeight: '800' },
  headerSub: { fontSize: 13, marginTop: 2 },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 4,
    marginBottom: 8,
  },
  tabBtn: {
    minHeight: 36,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexShrink: 0,
  },
  tabText: { fontSize: 13, fontWeight: '800' },
  tabCount: { fontSize: 12, fontWeight: '900' },
  searchBox: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 4,
    borderWidth: 1,
    borderRadius: 22,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  requestTabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  filterBtn: { flex: 1, borderWidth: 1, borderRadius: 18, paddingVertical: 8, alignItems: 'center' },
  filterText: { fontSize: 13, fontWeight: '800' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  sectionTitle: { fontSize: 19, fontWeight: '900' },
  sectionMeta: { fontSize: 12, fontWeight: '700' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    marginHorizontal: 16,
    marginTop: 10,
    padding: 10,
  },
  errorText: { flex: 1, fontSize: 12, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  rowBody: { flex: 1, minWidth: 0, gap: 3 },
  name: { fontSize: 15, fontWeight: '800' },
  meta: { fontSize: 12, fontWeight: '500' },
  avatarFallback: { backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '900' },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  requestCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 12,
    marginHorizontal: 16,
    marginTop: 10,
  },
  requestBody: { flex: 1, minWidth: 0, gap: 5 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  primaryBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  primaryText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  outlineBtn: {
    flex: 1,
    minHeight: 36,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  singleAction: { marginTop: 8, alignSelf: 'flex-start', paddingHorizontal: 18 },
  outlineText: { fontSize: 13, fontWeight: '800' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 64, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptyText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  skAvatar: { width: 52, height: 52, borderRadius: 26 },
  skLine: { height: 12, borderRadius: 8, marginBottom: 6 },
  skBtn: { width: 72, height: 34, borderRadius: 17 },
});
