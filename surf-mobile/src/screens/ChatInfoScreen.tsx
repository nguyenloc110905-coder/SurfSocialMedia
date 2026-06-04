import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch, Image } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useColorScheme } from 'react-native';
import { RootStackParamList } from '@/navigation';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { useLanguage, useT } from '@/lib/i18n';
import PresenceBadge from '@/components/ui/PresenceBadge';
import { api } from '@/lib/api';

type Message = {
  id: string;
  type: string;
  mediaUrl?: string;
};

type Props = NativeStackScreenProps<RootStackParamList, 'ChatInfo'>;

const LIGHT = { background: '#f8fafc', card: '#ffffff', text: '#0f172a', subtext: '#64748b', border: '#e2e8f0', accent: '#6366f1', otherBubble: '#f1f5f9', msgText: '#334155' };
const DARK = { background: '#0b1622', card: '#0f1e2e', text: '#f1f5f9', subtext: '#94a3b8', border: '#1e293b', accent: '#6366f1', otherBubble: '#1e293b', msgText: '#cbd5e1' };

export default function ChatInfoScreen({ route, navigation }: Props) {
  const { conversationId, title, peerUid, peerAvatar, conversationType, marketplaceTitle } = route.params;
  const user = useAuthStore((state) => state.user);
  const t = useT();
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [mediaItems, setMediaItems] = useState<Message[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);

  React.useEffect(() => {
    fetchMedia();
  }, [conversationId]);

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
          <TouchableOpacity style={styles.actionBtn}>
            <View style={[styles.actionIconPill, { backgroundColor: C.card }]}>
              <Ionicons name="person" size={22} color={C.text} />
            </View>
            <Text style={[styles.actionText, { color: C.subtext }]}>Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn}>
            <View style={[styles.actionIconPill, { backgroundColor: C.card }]}>
              <Ionicons name="search" size={22} color={C.text} />
            </View>
            <Text style={[styles.actionText, { color: C.subtext }]}>Search</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn}>
            <View style={[styles.actionIconPill, { backgroundColor: C.card }]}>
              <Ionicons name="notifications" size={22} color={C.text} />
            </View>
            <Text style={[styles.actionText, { color: C.subtext }]}>Mute</Text>
          </TouchableOpacity>
        </View>

        {/* Media & Files */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: C.subtext }]}>Shared Media</Text>
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaContainer}>
            {loadingMedia && <Text style={{ color: C.subtext, marginLeft: 12 }}>Loading...</Text>}
            {!loadingMedia && mediaItems.length === 0 && (
              <Text style={{ color: C.subtext, marginLeft: 12 }}>No media found.</Text>
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
});
