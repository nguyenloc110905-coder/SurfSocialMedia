import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  RefreshControl,
  useColorScheme,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation';
import { api } from '@/lib/api';
import { useLanguage, useT, type I18nKey } from '@/lib/i18n';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Messages'>;
};

type ConversationItem = {
  id: string;
  type: 'dm' | 'group';
  title?: string;
  peer: { uid: string; name: string; avatarUrl: string | null } | null;
  members?: Array<{ uid: string; name: string; avatarUrl: string | null }>;
  memberCount?: number;
  unreadCount: number;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
};

const DARK = { bg: '#0f172a', card: '#1e293b', border: '#334155', text: '#e2e8f0', subtext: '#64748b', accent: '#0ea5e9', input: '#1e293b' };
const LIGHT = { bg: '#f8fafc', card: '#ffffff', border: '#e2e8f0', text: '#1f2937', subtext: '#94a3b8', accent: '#0ea5e9', input: '#f1f5f9' };

function timeAgo(iso: string | null, locale: string, t: (key: I18nKey, params?: Record<string, string | number>) => string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return t('post_just_now');
  if (m < 60) return t('minutes_short', { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('hours_short', { count: h });
  const d = Math.floor(h / 24);
  if (d < 7) return t('days_short', { count: d });
  return new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
}

function ConvAvatar({ src, name, size = 48 }: { src: string | null; name: string; size?: number }) {
  const initial = (name || '?').charAt(0).toUpperCase();
  if (src) {
    return <Image source={{ uri: src }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.38 }}>{initial}</Text>
    </View>
  );
}

export default function MessagesScreen({ navigation }: Props) {
  const scheme = useColorScheme();
  const t = useT();
  const language = useLanguage();
  const locale = language === 'en' ? 'en-US' : 'vi-VN';
  const C = scheme === 'dark' ? DARK : LIGHT;
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ items: ConversationItem[] }>('/api/conversations?limit=30');
      setConversations((data.items ?? []).filter((c): c is ConversationItem => c != null && typeof c.id === 'string'));
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const getConvTitle = (conv: ConversationItem) =>
    conv.type === 'group' ? (conv.title || t('group_chat')) : (conv.peer?.name || t('user_fallback'));

  const getConvAvatar = (conv: ConversationItem) =>
    conv.type === 'group' ? null : (conv.peer?.avatarUrl ?? null);

  const getConvPeerUid = (conv: ConversationItem) =>
    conv.type === 'dm' ? (conv.peer?.uid ?? null) : null;

  const filtered = search.trim()
    ? conversations.filter(c => getConvTitle(c).toLowerCase().includes(search.toLowerCase()))
    : conversations;

  const openConv = (conv: ConversationItem) => {
    navigation.navigate('Chat', {
      conversationId: conv.id,
      title: getConvTitle(conv),
      peerUid: getConvPeerUid(conv),
      peerAvatar: getConvAvatar(conv),
    });
  };

  const renderItem = ({ item }: { item: ConversationItem }) => {
    if (!item?.id) return null;
    const title = getConvTitle(item);
    const avatar = getConvAvatar(item);
    const isUnread = (item.unreadCount ?? 0) > 0;

    return (
      <TouchableOpacity
        style={[s.convItem, { borderBottomColor: C.border }]}
        onPress={() => openConv(item)}
        activeOpacity={0.7}
      >
        <View style={s.convAvatarWrap}>
          <ConvAvatar src={avatar} name={title} />
          {item.type === 'group' && (
            <View style={[s.groupBadge, { backgroundColor: C.accent }]}>
              <Ionicons name="people" size={10} color="#fff" />
            </View>
          )}
        </View>
        <View style={s.convContent}>
          <View style={s.convTop}>
            <Text style={[s.convName, { color: C.text, fontWeight: isUnread ? '700' : '500' }]} numberOfLines={1}>
              {title}
            </Text>
            <Text style={[s.convTime, { color: isUnread ? C.accent : C.subtext }]}>
              {timeAgo(item.lastMessageAt, locale, t)}
            </Text>
          </View>
          <View style={s.convBottom}>
            <Text
              style={[s.convPreview, { color: isUnread ? C.text : C.subtext, fontWeight: isUnread ? '600' : '400' }]}
              numberOfLines={1}
            >
              {item.lastMessagePreview || t('messages_start')}
            </Text>
            {item.unreadCount > 0 && (
              <View style={[s.unreadBadge, { backgroundColor: C.accent }]}>
                <Text style={s.unreadCount}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: C.text }]}>{t('messages_title')}</Text>
        <TouchableOpacity hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="create-outline" size={24} color={C.text} />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={[s.searchWrap, { backgroundColor: C.bg }]}>
        <View style={[s.searchBox, { backgroundColor: C.input }]}>
          <Ionicons name="search" size={16} color={C.subtext} />
          <TextInput
            style={[s.searchInput, { color: C.text }]}
            placeholder={t('messages_search')}
            placeholderTextColor={C.subtext}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={C.accent} size="large" />
        </View>
      ) : filtered.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="chatbubbles-outline" size={56} color={C.subtext} />
          <Text style={[s.emptyTitle, { color: C.text }]}>{t('messages_empty_title')}</Text>
          <Text style={[s.emptyText, { color: C.subtext }]}>{t('messages_empty_subtitle')}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} colors={[C.accent]} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  searchWrap: { paddingHorizontal: 12, paddingVertical: 8 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 22, paddingHorizontal: 14, paddingVertical: 9,
  },
  searchInput: { flex: 1, fontSize: 14 },
  convItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12,
  },
  convAvatarWrap: { position: 'relative' },
  groupBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
  },
  convContent: { flex: 1, gap: 3 },
  convTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  convName: { flex: 1, fontSize: 15, marginRight: 8 },
  convTime: { fontSize: 12 },
  convBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  convPreview: { flex: 1, fontSize: 13, marginRight: 8 },
  unreadBadge: {
    minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5,
    alignItems: 'center', justifyContent: 'center',
  },
  unreadCount: { color: '#fff', fontSize: 11, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginTop: 8 },
  emptyText: { fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
});
