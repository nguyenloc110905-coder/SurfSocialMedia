import React, { useState } from 'react';
import { ActivityIndicator, Alert, Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useColorScheme } from 'react-native';
import { RootStackParamList } from '@/navigation';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import PresenceBadge from '@/components/ui/PresenceBadge';
import { api } from '@/lib/api';

type Message = {
  id: string;
  type: string;
  text?: string;
  mediaUrl?: string;
  fileName?: string;
  senderId?: string;
  conversationId?: string;
  createdAt?: string;
  pinnedBy?: string[];
  recalledForEveryone?: boolean;
};

type MuteSettings = {
  muted: boolean;
  muteMessages: boolean;
  muteCalls: boolean;
  muteExpiresAt: string | null;
};

type MuteKind = 'messages' | 'calls' | 'both';
type MuteDuration = '15m' | '1h' | '8h' | '24h' | 'forever';

type Props = NativeStackScreenProps<RootStackParamList, 'ChatInfo'>;

const LIGHT = { background: '#f8fafc', card: '#ffffff', text: '#0f172a', subtext: '#64748b', border: '#e2e8f0', accent: '#6366f1', otherBubble: '#f1f5f9', msgText: '#334155' };
const DARK = { background: '#0b1622', card: '#0f1e2e', text: '#f1f5f9', subtext: '#94a3b8', border: '#1e293b', accent: '#6366f1', otherBubble: '#1e293b', msgText: '#cbd5e1' };

const MUTE_KIND_OPTIONS: Array<{ value: MuteKind; label: string }> = [
  { value: 'messages', label: 'Tắt thông báo về tin nhắn' },
  { value: 'calls', label: 'Tắt thông báo về cuộc gọi' },
  { value: 'both', label: 'Tắt thông báo về tin nhắn và cuộc gọi' },
];

const MUTE_DURATION_OPTIONS: Array<{ value: MuteDuration; label: string; minutes: number | null }> = [
  { value: '15m', label: 'Trong 15 phút', minutes: 15 },
  { value: '1h', label: 'Trong 1 giờ', minutes: 60 },
  { value: '8h', label: 'Trong 8 giờ', minutes: 8 * 60 },
  { value: '24h', label: 'Trong 24 giờ', minutes: 24 * 60 },
  { value: 'forever', label: 'Đến khi tôi thay đổi', minutes: null },
];

function isMuteActive(settings: MuteSettings) {
  if (!settings.muted) return false;
  if (!settings.muteExpiresAt) return true;
  return new Date(settings.muteExpiresAt).getTime() > Date.now();
}

function messageSnippet(message: Message) {
  if (message.type === 'image') return 'Hình ảnh';
  if (message.type === 'audio') return 'Tin nhắn thoại';
  if (message.type === 'file') return message.fileName ? `Tệp: ${message.fileName}` : 'Tệp đính kèm';
  const text = (message.text ?? '').replace(/\s+/g, ' ').trim();
  return text || 'Tin nhắn';
}

export default function ChatInfoScreen({ route, navigation }: Props) {
  const { conversationId, title, peerUid, peerAvatar, conversationType, marketplaceTitle } = route.params;
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;

  const [muteSettings, setMuteSettings] = useState<MuteSettings>({
    muted: false,
    muteMessages: false,
    muteCalls: false,
    muteExpiresAt: null,
  });
  const [mediaItems, setMediaItems] = useState<Message[]>([]);
  const [pinnedItems, setPinnedItems] = useState<Message[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [muteModalStep, setMuteModalStep] = useState<'kind' | 'duration' | null>(null);
  const [selectedMuteKind, setSelectedMuteKind] = useState<MuteKind | null>(null);
  const [selectedMuteDuration, setSelectedMuteDuration] = useState<MuteDuration | null>(null);

  React.useEffect(() => {
    fetchMedia();
    fetchPinned();
    fetchConversationSettings();
  }, [conversationId]);

  const fetchConversationSettings = async () => {
    try {
      const res = await api.get<{ items: Array<MuteSettings & { id: string }> }>('/api/conversations?limit=50');
      const item = (res.items ?? []).find((conv) => conv.id === conversationId);
      if (item) {
        setMuteSettings({
          muted: item.muted,
          muteMessages: item.muteMessages,
          muteCalls: item.muteCalls,
          muteExpiresAt: item.muteExpiresAt,
        });
      }
    } catch {
      // keep defaults
    }
  };

  const fetchMedia = async () => {
    setLoadingMedia(true);
    try {
      const res = await api.get<{ items: Message[]; nextCursor: string | null }>(
        `/api/conversations/${conversationId}/media?limit=10`
      );
      setMediaItems(res.items || []);
    } catch (e) {
      console.log('fetchMedia err', e);
    } finally {
      setLoadingMedia(false);
    }
  };

  const fetchPinned = async () => {
    try {
      const res = await api.get<{ items: Message[]; nextCursor: string | null }>(
        `/api/conversations/${conversationId}/messages?limit=50`
      );
      setPinnedItems(
        (res.items ?? []).filter((item) => (item.pinnedBy?.length ?? 0) > 0 && !item.recalledForEveryone)
      );
    } catch (e) {
      console.log('fetchPinned err', e);
    }
  };

  const openChat = (extra?: { initialSearch?: boolean; targetMessageId?: string }) => {
    navigation.navigate('Chat', {
      conversationId,
      title,
      peerUid,
      peerAvatar,
      conversationType,
      marketplaceTitle,
      ...extra,
    });
  };

  const openProfile = () => {
    if (!peerUid) return;
    navigation.navigate('Profile', { userId: peerUid });
  };

  const saveMuteSettings = async (
    muteMessages: boolean,
    muteCalls: boolean,
    expiresAt: string | null
  ) => {
    const muted = muteMessages || muteCalls;
    const optimistic = { muted, muteMessages, muteCalls, muteExpiresAt: expiresAt };
    setMuteSettings(optimistic);
    try {
      const data = await api.patch<MuteSettings>(`/api/conversations/${conversationId}/mute`, {
        muted,
        muteMessages,
        muteCalls,
        expiresAt,
      });
      setMuteSettings(data);
    } catch {
      Alert.alert('Không thể cập nhật', 'Vui lòng thử lại sau.');
      fetchConversationSettings();
    }
  };

  const openMuteFlow = () => {
    if (isMuteActive(muteSettings)) {
      Alert.alert('Thông báo đang tắt', 'Bạn muốn bật lại thông báo cho cuộc trò chuyện này?', [
        { text: 'Bật lại', onPress: () => saveMuteSettings(false, false, null) },
        { text: 'Hủy', style: 'cancel' },
      ]);
      return;
    }

    setSelectedMuteKind(null);
    setSelectedMuteDuration(null);
    setMuteModalStep('kind');
  };

  const closeMuteModal = () => {
    setMuteModalStep(null);
    setSelectedMuteKind(null);
    setSelectedMuteDuration(null);
  };

  const confirmMuteKind = () => {
    if (!selectedMuteKind) return;
    setMuteModalStep('duration');
  };

  const confirmMuteDuration = () => {
    if (!selectedMuteKind || !selectedMuteDuration) return;
    const duration = MUTE_DURATION_OPTIONS.find((item) => item.value === selectedMuteDuration);
    const expiresAt =
      duration?.minutes == null
        ? null
        : new Date(Date.now() + duration.minutes * 60 * 1000).toISOString();
    saveMuteSettings(
      selectedMuteKind === 'messages' || selectedMuteKind === 'both',
      selectedMuteKind === 'calls' || selectedMuteKind === 'both',
      expiresAt
    );
    closeMuteModal();
  };

  const handleLeaveGroup = async () => {
    try {
      await api.delete(`/api/conversations/${conversationId}`);
      navigation.navigate('MainTabs' as any, { screen: 'Chats' } as any);
    } catch (error) {
      alert('Không thể rời nhóm');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: C.border }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: C.text }]}>Thông tin cuộc trò chuyện</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {/* Avatar & Title */}
        <View style={styles.profileSection}>
          <View style={styles.avatarWrap}>
            {peerAvatar ? (
              <Image source={{ uri: peerAvatar }} style={styles.avatarLarge} />
            ) : (
              <View style={[styles.avatarLarge, { backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ color: '#fff', fontSize: 32, fontWeight: '700' }}>{(title || '?').charAt(0)}</Text>
              </View>
            )}
            {!!peerUid && <PresenceBadge uid={peerUid} size="lg" style={{ borderColor: C.background }} />}
          </View>
          <Text style={[styles.profileTitle, { color: C.text }]}>{title}</Text>
          {conversationType === 'marketplace' && (
            <Text style={[styles.profileSub, { color: C.subtext }]}>{marketplaceTitle || 'Marketplace'}</Text>
          )}
        </View>

        {/* Quick Actions */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.actionBtn, !peerUid && styles.actionDisabled]} onPress={openProfile} disabled={!peerUid}>
            <View style={[styles.actionIconPill, { backgroundColor: C.card }]}>
              <Ionicons name="person" size={22} color={C.text} />
            </View>
            <Text style={[styles.actionText, { color: C.subtext }]}>Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => openChat({ initialSearch: true })}>
            <View style={[styles.actionIconPill, { backgroundColor: C.card }]}>
              <Ionicons name="search" size={22} color={C.text} />
            </View>
            <Text style={[styles.actionText, { color: C.subtext }]}>Search</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={openMuteFlow}>
            <View style={[styles.actionIconPill, { backgroundColor: C.card }]}>
              <Ionicons name={isMuteActive(muteSettings) ? 'notifications-off' : 'notifications'} size={22} color={C.text} />
            </View>
            <Text style={[styles.actionText, { color: C.subtext }]}>{isMuteActive(muteSettings) ? 'Muted' : 'Mute'}</Text>
          </TouchableOpacity>
        </View>

        {/* Media & Files */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: C.subtext }]}>Shared Media</Text>
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaContainer}>
            {loadingMedia && <ActivityIndicator color={C.accent} style={{ marginLeft: 12 }} />}
            {!loadingMedia && mediaItems.length === 0 && (
              <Text style={{ color: C.subtext, marginLeft: 12 }}>Chưa có media.</Text>
            )}
            {mediaItems.map(item => (
              <View key={item.id} style={styles.mediaItem}>
                {item.type === 'image' && item.mediaUrl ? (
                  <Image source={{ uri: item.mediaUrl }} style={styles.mediaImage} />
                ) : (
                  <View style={[styles.mediaFile, { backgroundColor: C.border }]}>
                    <Ionicons name="document-text" size={24} color={C.text} />
                  </View>
                )}
              </View>
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: C.subtext }]}>Tin nhắn đã ghim</Text>
          {pinnedItems.length === 0 ? (
            <Text style={{ color: C.subtext, marginLeft: 12 }}>Chưa có tin nhắn đã ghim.</Text>
          ) : (
            <View style={[styles.pinnedList, { backgroundColor: C.card, borderColor: C.border }]}>
              {pinnedItems.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.pinnedRow, { borderBottomColor: C.border }]}
                  onPress={() => openChat({ targetMessageId: item.id })}
                >
                  <Ionicons name="pricetag" size={17} color={C.accent} />
                  <Text style={[styles.pinnedText, { color: C.text }]} numberOfLines={2}>
                    {messageSnippet(item)}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={C.subtext} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {conversationType === 'group' && (
          <View style={styles.section}>
            <TouchableOpacity style={styles.row} onPress={handleLeaveGroup}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(239,68,68,0.15)' }]}>
                <Ionicons name="exit" size={20} color="#ef4444" />
              </View>
              <Text style={[styles.rowText, { color: '#ef4444' }]}>Leave Group</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <Modal visible={muteModalStep !== null} transparent animationType="fade" onRequestClose={closeMuteModal}>
        <View style={styles.modalRoot}>
          <TouchableOpacity style={styles.modalScrim} activeOpacity={1} onPress={closeMuteModal} />
          <View style={styles.muteDialog}>
            <Text style={styles.muteTitle}>Tắt thông báo về đoạn chat này?</Text>
            <View style={styles.radioList}>
              {(muteModalStep === 'kind' ? MUTE_KIND_OPTIONS : MUTE_DURATION_OPTIONS).map((option) => {
                const selected =
                  muteModalStep === 'kind'
                    ? selectedMuteKind === option.value
                    : selectedMuteDuration === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={styles.radioRow}
                    activeOpacity={0.78}
                    onPress={() => {
                      if (muteModalStep === 'kind') setSelectedMuteKind(option.value as MuteKind);
                      else setSelectedMuteDuration(option.value as MuteDuration);
                    }}
                  >
                    <View style={[styles.radioOuter, selected && { borderColor: '#60a5fa' }]}>
                      {selected && <View style={styles.radioInner} />}
                    </View>
                    <Text style={styles.radioLabel}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.muteActions}>
              <TouchableOpacity onPress={closeMuteModal} style={styles.muteActionBtn}>
                <Text style={styles.muteCancel}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={muteModalStep === 'kind' ? confirmMuteKind : confirmMuteDuration}
                style={styles.muteActionBtn}
                disabled={muteModalStep === 'kind' ? !selectedMuteKind : !selectedMuteDuration}
              >
                <Text
                  style={[
                    styles.muteOk,
                    !(muteModalStep === 'kind' ? selectedMuteKind : selectedMuteDuration) && styles.muteOkDisabled,
                  ]}
                >
                  OK
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0c1929' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  body: { flex: 1 },
  bodyContent: { paddingBottom: 40 },
  
  profileSection: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: 12,
  },
  avatarLarge: {
    width: 90,
    height: 90,
    borderRadius: 45,
    overflow: 'hidden',
  },
  profileTitle: {
    fontSize: 22,
    fontWeight: '800',
  },
  profileSub: {
    fontSize: 14,
    marginTop: 4,
  },
  
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 30,
  },
  actionBtn: {
    alignItems: 'center',
    gap: 8,
  },
  actionDisabled: {
    opacity: 0.45,
  },
  actionIconPill: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  
  section: {
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 12,
    marginLeft: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 12,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    fontSize: 16,
    fontWeight: '500',
  },
  mediaContainer: {
    paddingHorizontal: 8,
    gap: 8,
    marginTop: 8,
  },
  mediaItem: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: 'hidden',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  mediaFile: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinnedList: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  pinnedRow: {
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pinnedText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  modalRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.58)',
  },
  muteDialog: {
    width: '82%',
    maxWidth: 360,
    borderRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 16,
    backgroundColor: '#2b2b2d',
  },
  muteTitle: {
    color: '#f3f4f6',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600',
    marginBottom: 18,
  },
  radioList: {
    gap: 13,
  },
  radioRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#c5c7ce',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#60a5fa',
  },
  radioLabel: {
    flex: 1,
    color: '#f3f4f6',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
  },
  muteActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 18,
    marginTop: 20,
  },
  muteActionBtn: {
    minWidth: 52,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  muteCancel: {
    color: '#60a5fa',
    fontSize: 16,
    fontWeight: '800',
  },
  muteOk: {
    color: '#60a5fa',
    fontSize: 16,
    fontWeight: '800',
  },
  muteOkDisabled: {
    color: '#8b8d94',
  },
});
