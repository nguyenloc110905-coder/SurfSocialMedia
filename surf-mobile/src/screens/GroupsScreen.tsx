import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
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
import { api } from '@/lib/api';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Groups'>;
};

type GroupPrivacy = 'public' | 'private';
type GroupStatus = 'member' | 'pending' | 'none';

type DiscoverGroup = {
  id: string;
  name: string;
  description?: string;
  coverImageUrl?: string;
  category?: string;
  privacy: GroupPrivacy;
  ownerId: string;
  adminIds: string[];
  memberIds?: string[];
  memberCount: number;
  membershipStatus: GroupStatus;
};

const CATEGORY_OPTIONS = [
  { label: 'Tất cả', value: '' },
  { label: 'Học tập', value: 'study' },
  { label: 'Công nghệ', value: 'tech' },
  { label: 'Âm nhạc', value: 'music' },
  { label: 'Gaming', value: 'gaming' },
  { label: 'Thể thao', value: 'sports' },
];

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
};

const initialForm = {
  name: '',
  description: '',
  coverImageUrl: '',
  category: 'study',
  privacy: 'public' as GroupPrivacy,
};

function categoryLabel(value?: string) {
  return CATEGORY_OPTIONS.find((item) => item.value === value)?.label ?? value ?? 'Chung';
}

export default function GroupsScreen({ navigation }: Props) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;

  const [groups, setGroups] = useState<DiscoverGroup[]>([]);
  const [activeTab, setActiveTab] = useState<'discover' | 'joined'>('discover');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadGroups = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      query.set('limit', '30');
      if (activeTab === 'discover' && search.trim()) query.set('q', search.trim());
      if (activeTab === 'discover' && category) query.set('category', category);
      const endpoint = activeTab === 'joined' ? '/api/groups/me' : '/api/groups';
      const data = await api.get<{ items: DiscoverGroup[] }>(`${endpoint}?${query.toString()}`);
      setGroups(data.items ?? []);
    } catch (e) {
      setError((e as Error).message || 'Không thể tải danh sách nhóm');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, category, search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadGroups();
    }, 250);
    return () => clearTimeout(timer);
  }, [loadGroups]);

  const handleJoin = async (group: DiscoverGroup) => {
    if (group.membershipStatus !== 'none') return;
    setJoiningId(group.id);
    try {
      const data = await api.post<{ status: 'joined' | 'pending'; item: DiscoverGroup }>(
        `/api/groups/${group.id}/join`
      );
      setGroups((current) =>
        current.map((item) =>
          item.id === group.id
            ? {
                ...item,
                membershipStatus: data.status === 'joined' ? 'member' : 'pending',
                memberCount: data.status === 'joined' ? item.memberCount + 1 : item.memberCount,
              }
            : item
        )
      );
      Alert.alert(
        'Nhóm',
        data.status === 'joined'
          ? 'Bạn đã tham gia nhóm thành công.'
          : 'Yêu cầu tham gia đã được gửi tới quản trị viên.'
      );
    } catch (e) {
      Alert.alert('Không thể tham gia', (e as Error).message);
    } finally {
      setJoiningId(null);
    }
  };

  const submitCreate = async () => {
    if (!form.name.trim() || submitting) return;
    setSubmitting(true);
    try {
      const data = await api.post<{ item: DiscoverGroup }>('/api/groups', {
        ...form,
        name: form.name.trim(),
        description: form.description.trim(),
        coverImageUrl: form.coverImageUrl.trim(),
      });
      setShowCreate(false);
      setForm(initialForm);
      setActiveTab('joined');
      setGroups((current) => [{ ...data.item, membershipStatus: 'member' }, ...current]);
      navigation.navigate('GroupDetail', { groupId: data.item.id });
    } catch (e) {
      Alert.alert('Không thể tạo nhóm', (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const renderGroup = ({ item }: { item: DiscoverGroup }) => {
    const isPending = item.membershipStatus === 'pending';
    const isMember = item.membershipStatus === 'member';

    return (
      <TouchableOpacity
        style={[s.card, { backgroundColor: C.card, borderColor: C.border }]}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('GroupDetail', { groupId: item.id })}
      >
        {item.coverImageUrl ? (
          <Image source={{ uri: item.coverImageUrl }} style={s.cover} />
        ) : (
          <View style={[s.cover, s.coverFallback]}>
            <Ionicons name="people" size={42} color="#fff" />
          </View>
        )}
        <View style={s.cardBody}>
          <View style={s.badgeRow}>
            <View style={[s.badge, { backgroundColor: C.accent + '22' }]}>
              <Text style={[s.badgeText, { color: C.accent }]}>{categoryLabel(item.category)}</Text>
            </View>
            <View style={[s.badge, { backgroundColor: C.panel }]}>
              <Ionicons
                name={item.privacy === 'public' ? 'earth-outline' : 'lock-closed-outline'}
                size={12}
                color={C.subtext}
              />
              <Text style={[s.badgeText, { color: C.subtext }]}>
                {item.privacy === 'public' ? 'Công khai' : 'Riêng tư'}
              </Text>
            </View>
          </View>
          <Text style={[s.groupName, { color: C.text }]} numberOfLines={2}>{item.name}</Text>
          <Text style={[s.description, { color: C.subtext }]} numberOfLines={2}>
            {item.description || 'Chưa có mô tả cho nhóm này.'}
          </Text>
          <View style={s.cardFooter}>
            <View>
              <Text style={[s.memberLabel, { color: C.muted }]}>Thành viên</Text>
              <Text style={[s.memberCount, { color: C.text }]}>{item.memberCount}</Text>
            </View>
            {isMember ? (
              <View style={[s.statusPill, { backgroundColor: C.success + '22' }]}>
                <Ionicons name="checkmark-circle" size={15} color={C.success} />
                <Text style={[s.statusText, { color: C.success }]}>Đã tham gia</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[
                  s.primaryBtn,
                  { backgroundColor: isPending ? C.warning + '22' : C.accent },
                ]}
                onPress={() => void handleJoin(item)}
                disabled={joiningId === item.id || isPending}
              >
                {joiningId === item.id ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={[s.primaryBtnText, isPending && { color: C.warning }]}>
                    {isPending ? 'Chờ duyệt' : 'Tham gia'}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderListHeader = () => (
    <>
      <View style={[s.hero, { backgroundColor: C.card, borderColor: C.border }]}>
        <View style={s.heroMain}>
          <View style={[s.heroIcon, { backgroundColor: C.accent + '1f' }]}>
            <Ionicons name="people" size={22} color={C.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.heroKicker, { color: C.accent }]}>Surf Groups</Text>
            <Text style={[s.heroTitle, { color: C.text }]}>Khám phá cộng đồng</Text>
          </View>
        </View>
        <Text style={[s.heroText, { color: C.subtext }]} numberOfLines={2}>
          Tìm nhóm theo chủ đề, tạo cộng đồng mới và tham gia ngay khi thấy phù hợp.
        </Text>
        <View style={[s.tabs, { backgroundColor: C.panel }]}>
          {(['discover', 'joined'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[s.tab, activeTab === tab && { backgroundColor: C.accent }]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[s.tabText, { color: activeTab === tab ? '#fff' : C.subtext }]}>
                {tab === 'discover' ? 'Khám phá' : 'Nhóm của bạn'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {activeTab === 'discover' && (
        <View style={s.filters}>
          <View style={[s.searchBox, { backgroundColor: C.card, borderColor: C.border }]}>
            <Ionicons name="search-outline" size={18} color={C.subtext} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Tìm theo tên nhóm..."
              placeholderTextColor={C.muted}
              style={[s.searchInput, { color: C.text }]}
              returnKeyType="search"
            />
            {search ? (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color={C.muted} />
              </TouchableOpacity>
            ) : null}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categoryRow}>
            {CATEGORY_OPTIONS.map((item) => {
              const selected = category === item.value;
              return (
                <TouchableOpacity
                  key={item.value || 'all'}
                  style={[
                    s.categoryChip,
                    { backgroundColor: selected ? C.accent : C.card, borderColor: selected ? C.accent : C.border },
                  ]}
                  onPress={() => setCategory(item.value)}
                >
                  <Text style={[s.categoryText, { color: selected ? '#fff' : C.subtext }]}>{item.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {error ? <Text style={[s.errorText, { color: '#ef4444' }]}>{error}</Text> : null}
    </>
  );

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]}>
      <View style={[s.header, { backgroundColor: C.bg, borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={s.hitSlop}>
          <Ionicons name="chevron-back" size={26} color={C.text} />
        </TouchableOpacity>
        <Text style={[s.title, { color: C.text }]}>Nhóm</Text>
        <TouchableOpacity onPress={() => setShowCreate(true)} hitSlop={s.hitSlop}>
          <Ionicons name="add-circle-outline" size={28} color={C.text} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={loading ? [] : groups}
        keyExtractor={(item) => item.id}
        renderItem={renderGroup}
        ListHeaderComponent={renderListHeader}
        contentContainerStyle={groups.length ? s.listContent : s.emptyContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadGroups(true)} tintColor={C.accent} />}
        ListEmptyComponent={
          loading ? (
            <View style={s.loadingBox}>
              <ActivityIndicator color={C.accent} />
              <Text style={[s.loadingText, { color: C.subtext }]}>Đang tải nhóm...</Text>
            </View>
          ) : (
            <View style={[s.emptyBox, { borderColor: C.border, backgroundColor: C.card }]}>
              <Ionicons name="people-outline" size={42} color={C.muted} />
              <Text style={[s.emptyTitle, { color: C.text }]}>Chưa có nhóm phù hợp</Text>
              <Text style={[s.emptyText, { color: C.subtext }]}>
                Thử đổi từ khóa, danh mục hoặc tạo nhóm đầu tiên của bạn.
              </Text>
            </View>
          )
        }
      />

      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.sheet, { backgroundColor: C.card }]}>
            <View style={[s.sheetHeader, { borderBottomColor: C.border }]}>
              <View>
                <Text style={[s.sheetKicker, { color: C.accent }]}>Tạo nhóm</Text>
                <Text style={[s.sheetTitle, { color: C.text }]}>Tạo cộng đồng mới</Text>
              </View>
              <TouchableOpacity onPress={() => setShowCreate(false)} hitSlop={s.hitSlop}>
                <Ionicons name="close" size={24} color={C.text} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={s.form}>
              <TextInput
                value={form.name}
                onChangeText={(name) => setForm((current) => ({ ...current, name }))}
                placeholder="Tên nhóm"
                placeholderTextColor={C.muted}
                style={[s.input, { backgroundColor: C.panel, borderColor: C.border, color: C.text }]}
              />
              <TextInput
                value={form.description}
                onChangeText={(description) => setForm((current) => ({ ...current, description }))}
                placeholder="Mô tả"
                placeholderTextColor={C.muted}
                multiline
                style={[s.textarea, { backgroundColor: C.panel, borderColor: C.border, color: C.text }]}
              />
              <TextInput
                value={form.coverImageUrl}
                onChangeText={(coverImageUrl) => setForm((current) => ({ ...current, coverImageUrl }))}
                placeholder="URL ảnh bìa"
                placeholderTextColor={C.muted}
                autoCapitalize="none"
                style={[s.input, { backgroundColor: C.panel, borderColor: C.border, color: C.text }]}
              />
              <Text style={[s.fieldLabel, { color: C.text }]}>Danh mục</Text>
              <View style={s.optionGrid}>
                {CATEGORY_OPTIONS.filter((item) => item.value).map((item) => (
                  <TouchableOpacity
                    key={item.value}
                    style={[
                      s.optionChip,
                      {
                        backgroundColor: form.category === item.value ? C.accent + '22' : C.panel,
                        borderColor: form.category === item.value ? C.accent : C.border,
                      },
                    ]}
                    onPress={() => setForm((current) => ({ ...current, category: item.value }))}
                  >
                    <Text style={[s.optionText, { color: form.category === item.value ? C.accent : C.subtext }]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[s.fieldLabel, { color: C.text }]}>Quyền riêng tư</Text>
              <View style={s.privacyGrid}>
                {(['public', 'private'] as const).map((value) => (
                  <TouchableOpacity
                    key={value}
                    style={[
                      s.privacyCard,
                      {
                        backgroundColor: form.privacy === value ? C.accent + '18' : C.panel,
                        borderColor: form.privacy === value ? C.accent : C.border,
                      },
                    ]}
                    onPress={() => setForm((current) => ({ ...current, privacy: value }))}
                  >
                    <Ionicons
                      name={value === 'public' ? 'earth-outline' : 'lock-closed-outline'}
                      size={20}
                      color={form.privacy === value ? C.accent : C.subtext}
                    />
                    <Text style={[s.privacyTitle, { color: C.text }]}>
                      {value === 'public' ? 'Công khai' : 'Riêng tư'}
                    </Text>
                    <Text style={[s.privacyText, { color: C.subtext }]}>
                      {value === 'public' ? 'Ai cũng có thể tham gia.' : 'Thành viên mới cần admin phê duyệt.'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={[s.submitBtn, { backgroundColor: form.name.trim() ? C.accent : C.border }]}
                onPress={submitCreate}
                disabled={!form.name.trim() || submitting}
              >
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.submitText}>Tạo nhóm</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  hitSlop: { top: 10, bottom: 10, left: 10, right: 10 },
  header: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  title: { fontSize: 20, fontWeight: '800' },
  hero: { marginTop: 10, marginBottom: 8, padding: 12, borderRadius: 8, borderWidth: 1 },
  heroMain: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroIcon: { width: 38, height: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  heroKicker: { fontSize: 10, fontWeight: '800', letterSpacing: 1.3, textTransform: 'uppercase' },
  heroTitle: { marginTop: 2, fontSize: 20, fontWeight: '900', lineHeight: 24 },
  heroText: { marginTop: 8, fontSize: 13, lineHeight: 18 },
  tabs: { flexDirection: 'row', marginTop: 10, borderRadius: 8, padding: 3 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: 'center' },
  tabText: { fontSize: 13, fontWeight: '800' },
  filters: { paddingBottom: 10 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, minHeight: 40 },
  searchInput: { flex: 1, fontSize: 14 },
  categoryRow: { gap: 8, paddingTop: 10, paddingBottom: 2 },
  categoryChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  categoryText: { fontSize: 12, fontWeight: '700' },
  listContent: { paddingHorizontal: 12, paddingBottom: 24 },
  card: { borderWidth: 1, borderRadius: 8, overflow: 'hidden', marginBottom: 12 },
  cover: { height: 116, width: '100%' },
  coverFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0ea5e9',
  },
  cardBody: { padding: 12 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 14 },
  badgeText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  groupName: { marginTop: 10, fontSize: 18, fontWeight: '800', lineHeight: 22 },
  description: { marginTop: 5, fontSize: 13, lineHeight: 19, minHeight: 38 },
  cardFooter: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  memberLabel: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  memberCount: { fontSize: 16, fontWeight: '800', marginTop: 2 },
  primaryBtn: { minWidth: 92, minHeight: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  primaryBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 18 },
  statusText: { fontSize: 12, fontWeight: '800' },
  errorText: { marginHorizontal: 14, marginBottom: 8, fontSize: 13 },
  loadingBox: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { fontSize: 13 },
  emptyContent: { flexGrow: 1, paddingHorizontal: 12, paddingBottom: 24 },
  emptyBox: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 8, padding: 24, alignItems: 'center' },
  emptyTitle: { marginTop: 10, fontSize: 17, fontWeight: '800' },
  emptyText: { marginTop: 6, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { maxHeight: '92%', borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: 'hidden' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
  sheetKicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1.3, textTransform: 'uppercase' },
  sheetTitle: { fontSize: 20, fontWeight: '900', marginTop: 2 },
  form: { padding: 16, gap: 12, paddingBottom: 28 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, minHeight: 46, fontSize: 14 },
  textarea: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingTop: 12, minHeight: 92, fontSize: 14, textAlignVertical: 'top' },
  fieldLabel: { fontSize: 14, fontWeight: '800' },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8 },
  optionText: { fontSize: 12, fontWeight: '800' },
  privacyGrid: { flexDirection: 'row', gap: 10 },
  privacyCard: { flex: 1, borderWidth: 1, borderRadius: 8, padding: 12, minHeight: 104 },
  privacyTitle: { marginTop: 6, fontSize: 14, fontWeight: '800' },
  privacyText: { marginTop: 3, fontSize: 12, lineHeight: 17 },
  submitBtn: { minHeight: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
