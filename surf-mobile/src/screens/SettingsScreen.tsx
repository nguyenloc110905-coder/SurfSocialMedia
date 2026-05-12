import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  ActivityIndicator,
  useColorScheme,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation';
import { useUserStore, type NotificationType } from '@/stores/userStore';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Settings'>;
};

// Theme
const DARK = {
  bg: '#0f172a', card: '#1e293b', border: '#334155', text: '#e2e8f0',
  subtext: '#64748b', accent: '#0ea5e9', active: '#3b82f6',
};
const LIGHT = {
  bg: '#f8fafc', card: '#ffffff', border: '#e2e8f0', text: '#1f2937',
  subtext: '#64748b', accent: '#0ea5e9', active: '#3b82f6',
};

const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  friend_request: 'Lời mời kết bạn',
  friend_accept: 'Chấp nhận kết bạn',
  post_reaction: 'Cảm xúc bài viết',
  comment: 'Bình luận',
  mention: 'Nhắc đến bạn',
  share: 'Lượt chia sẻ',
  missed_call: 'Cuộc gọi nhỡ',
  system: 'Thông báo hệ thống',
};

const NOTIFICATION_ICONS: Record<NotificationType, keyof typeof Ionicons.glyphMap> = {
  friend_request: 'person-add-outline',
  friend_accept: 'person-checkmark-outline',
  post_reaction: 'heart-outline',
  comment: 'chatbubble-outline',
  mention: 'at-outline',
  share: 'arrow-redo-outline',
  missed_call: 'call-outline',
  system: 'information-circle-outline',
};

const POST_PRIVACY_LABELS = {
  'public': 'Công khai',
  'friends': 'Bạn bè',
  'only-me': 'Chỉ mình tôi',
  'custom': 'Tùy chỉnh',
};

const POST_PRIVACY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  'public': 'earth-outline',
  'friends': 'people-outline',
  'only-me': 'lock-closed-outline',
  'custom': 'settings-outline',
};

const FRIEND_REQUEST_LABELS = {
  'everyone': 'Mọi người',
  'friends_of_friends': 'Bạn của bạn bè',
};

export default function SettingsScreen({ navigation }: Props) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;
  
  const { profile, loading, fetchProfile, updateProfile } = useUserStore();
  const [saving, setSaving] = useState(false);

  // Modals for selects
  const [showPostPrivacyModal, setShowPostPrivacyModal] = useState(false);
  const [showFriendRequestModal, setShowFriendRequestModal] = useState(false);

  useEffect(() => {
    if (!profile && !loading) {
      fetchProfile();
    }
  }, [profile, loading, fetchProfile]);

  const handleToggleNotification = async (key: NotificationType, value: boolean) => {
    if (!profile) return;
    try {
      await updateProfile({
        notificationPrefs: {
          ...profile.notificationPrefs,
          [key]: value,
        },
      });
    } catch (e) {
      console.warn('Failed to update notification pref', e);
    }
  };

  const handleUpdateSetting = async (data: any) => {
    try {
      setSaving(true);
      await updateProfile(data);
    } catch (e) {
      console.warn('Failed to update setting', e);
    } finally {
      setSaving(false);
    }
  };

  if (!profile) {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: C.bg }]}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={24} color={C.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: C.text }]}>Cài đặt</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={s.center}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]}>
      <View style={[s.header, { borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: C.text }]}>Cài đặt</Text>
        <View style={{ width: 24 }}>
          {saving && <ActivityIndicator size="small" color={C.accent} />}
        </View>
      </View>

      <ScrollView style={s.scroll}>
        
        {/* Quyền riêng tư bài viết mặc định */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: C.subtext }]}>QUYỀN RIÊNG TƯ MẶC ĐỊNH</Text>
          <View style={[s.card, { backgroundColor: C.card, borderColor: C.border }]}>
            <TouchableOpacity 
              style={s.row} 
              onPress={() => setShowPostPrivacyModal(true)}
            >
              <View style={s.rowIcon}>
                <Ionicons name={POST_PRIVACY_ICONS[profile.defaultPostPrivacy]} size={22} color={C.text} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.rowTitle, { color: C.text }]}>Ai có thể xem bài viết của bạn?</Text>
                <Text style={[s.rowSub, { color: C.subtext }]}>{POST_PRIVACY_LABELS[profile.defaultPostPrivacy]}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={C.subtext} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Lời mời kết bạn */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: C.subtext }]}>KẾT BẠN</Text>
          <View style={[s.card, { backgroundColor: C.card, borderColor: C.border }]}>
            <TouchableOpacity 
              style={s.row} 
              onPress={() => setShowFriendRequestModal(true)}
            >
              <View style={s.rowIcon}>
                <Ionicons name="person-add-outline" size={22} color={C.text} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.rowTitle, { color: C.text }]}>Ai có thể gửi lời mời kết bạn?</Text>
                <Text style={[s.rowSub, { color: C.subtext }]}>{FRIEND_REQUEST_LABELS[profile.friendRequestPrivacy]}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={C.subtext} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Tùy chọn thông báo */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: C.subtext }]}>TÙY CHỌN THÔNG BÁO</Text>
          <View style={[s.card, { backgroundColor: C.card, borderColor: C.border }]}>
            {(Object.keys(NOTIFICATION_LABELS) as NotificationType[]).map((key, index, arr) => (
              <View 
                key={key} 
                style={[
                  s.row, 
                  index < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: C.border }
                ]}
              >
                <View style={s.rowIcon}>
                  <Ionicons name={NOTIFICATION_ICONS[key]} size={22} color={C.text} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.rowTitle, { color: C.text }]}>{NOTIFICATION_LABELS[key]}</Text>
                </View>
                <Switch
                  value={profile.notificationPrefs[key] ?? true}
                  onValueChange={(val) => handleToggleNotification(key, val)}
                  trackColor={{ false: C.border, true: C.active }}
                  thumbColor="#fff"
                />
              </View>
            ))}
          </View>
        </View>
        
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Modal Chọn Quyền riêng tư bài viết */}
      <Modal visible={showPostPrivacyModal} transparent animationType="fade">
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowPostPrivacyModal(false)}>
          <View style={[s.modalContent, { backgroundColor: C.card }]}>
            <Text style={[s.modalTitle, { color: C.text }]}>Quyền riêng tư mặc định</Text>
            {(Object.keys(POST_PRIVACY_LABELS) as Array<keyof typeof POST_PRIVACY_LABELS>).map((key) => (
              <TouchableOpacity
                key={key}
                style={[s.modalRow, { borderTopColor: C.border }]}
                onPress={() => {
                  handleUpdateSetting({ defaultPostPrivacy: key });
                  setShowPostPrivacyModal(false);
                }}
              >
                <Ionicons name={POST_PRIVACY_ICONS[key]} size={22} color={C.text} />
                <Text style={[s.modalRowText, { color: C.text, flex: 1 }]}>{POST_PRIVACY_LABELS[key]}</Text>
                {profile.defaultPostPrivacy === key && (
                  <Ionicons name="checkmark" size={24} color={C.active} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Modal Chọn Quyền gửi lời mời kết bạn */}
      <Modal visible={showFriendRequestModal} transparent animationType="fade">
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowFriendRequestModal(false)}>
          <View style={[s.modalContent, { backgroundColor: C.card }]}>
            <Text style={[s.modalTitle, { color: C.text }]}>Ai có thể gửi lời mời kết bạn?</Text>
            {(Object.keys(FRIEND_REQUEST_LABELS) as Array<keyof typeof FRIEND_REQUEST_LABELS>).map((key) => (
              <TouchableOpacity
                key={key}
                style={[s.modalRow, { borderTopColor: C.border }]}
                onPress={() => {
                  handleUpdateSetting({ friendRequestPrivacy: key });
                  setShowFriendRequestModal(false);
                }}
              >
                <Text style={[s.modalRowText, { color: C.text, flex: 1 }]}>{FRIEND_REQUEST_LABELS[key]}</Text>
                {profile.friendRequestPrivacy === key && (
                  <Ionicons name="checkmark" size={24} color={C.active} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1, padding: 16 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 13, fontWeight: '700', marginBottom: 8, paddingLeft: 4, letterSpacing: 0.5 },
  card: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  rowIcon: { width: 32, alignItems: 'flex-start' },
  rowTitle: { fontSize: 15, fontWeight: '500', marginBottom: 2 },
  rowSub: { fontSize: 13 },
  
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    borderRadius: 16,
    padding: 16,
    paddingBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderTopWidth: 1,
    gap: 12,
  },
  modalRowText: {
    fontSize: 16,
  },
});
