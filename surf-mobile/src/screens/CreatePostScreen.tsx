import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  useColorScheme,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation';
import { useUserStore } from '@/stores/userStore';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'CreatePost'>;
};

const DARK = {
  bg: '#0f172a', card: '#1e293b', border: '#334155', text: '#e2e8f0',
  subtext: '#64748b', accent: '#0ea5e9',
};
const LIGHT = {
  bg: '#f8fafc', card: '#ffffff', border: '#e2e8f0', text: '#1f2937',
  subtext: '#64748b', accent: '#0ea5e9',
};

const PRIVACY_LABELS = {
  'public': 'Công khai',
  'friends': 'Bạn bè',
  'only-me': 'Chỉ mình tôi',
  'custom': 'Tùy chỉnh',
};
const PRIVACY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  'public': 'earth-outline',
  'friends': 'people-outline',
  'only-me': 'lock-closed-outline',
  'custom': 'settings-outline',
};

export default function CreatePostScreen({ navigation }: Props) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;
  
  const { profile, fetchProfile } = useUserStore();
  const { user } = useAuthStore();
  
  const [content, setContent] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'friends' | 'only-me' | 'custom'>('public');
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!profile) {
      fetchProfile();
    } else {
      // PRE-SELECT default privacy from user profile (AC for SET-4)
      setPrivacy(profile.defaultPostPrivacy || 'public');
    }
  }, [profile, fetchProfile]);

  const handlePost = async () => {
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      await api.post('/api/posts', {
        content: content.trim(),
        privacy,
      });
      navigation.goBack();
    } catch (e) {
      console.warn('Failed to post', e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={26} color={C.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: C.text }]}>Tạo bài viết</Text>
        <TouchableOpacity 
          style={[s.postBtn, { backgroundColor: content.trim() ? C.accent : C.border }]} 
          disabled={!content.trim() || submitting}
          onPress={handlePost}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={s.postBtnText}>Đăng</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.userRow}>
          <View style={[s.avatar, { backgroundColor: C.border }]}>
            <Text style={{ color: C.text, fontWeight: 'bold' }}>
              {(user?.displayName || user?.email || 'U')[0].toUpperCase()}
            </Text>
          </View>
          <View style={{ marginLeft: 10 }}>
            <Text style={[s.name, { color: C.text }]}>{user?.displayName || 'Người dùng'}</Text>
            <TouchableOpacity 
              style={[s.privacyBtn, { borderColor: C.border }]}
              onPress={() => setShowPrivacyModal(true)}
            >
              <Ionicons name={PRIVACY_ICONS[privacy]} size={14} color={C.accent} />
              <Text style={[s.privacyText, { color: C.accent }]}>{PRIVACY_LABELS[privacy]}</Text>
              <Ionicons name="caret-down" size={12} color={C.accent} />
            </TouchableOpacity>
          </View>
        </View>

        <TextInput
          style={[s.input, { color: C.text }]}
          placeholder="Bạn đang nghĩ gì?"
          placeholderTextColor={C.subtext}
          multiline
          autoFocus
          value={content}
          onChangeText={setContent}
        />
      </KeyboardAvoidingView>

      {/* Modal Chọn Quyền riêng tư bài viết */}
      <Modal visible={showPrivacyModal} transparent animationType="fade">
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowPrivacyModal(false)}>
          <View style={[s.modalContent, { backgroundColor: C.card }]}>
            <Text style={[s.modalTitle, { color: C.text }]}>Đối tượng của bài viết</Text>
            {(Object.keys(PRIVACY_LABELS) as Array<keyof typeof PRIVACY_LABELS>).map((key) => (
              <TouchableOpacity
                key={key}
                style={[s.modalRow, { borderTopColor: C.border }]}
                onPress={() => {
                  setPrivacy(key);
                  setShowPrivacyModal(false);
                }}
              >
                <Ionicons name={PRIVACY_ICONS[key]} size={22} color={C.text} />
                <Text style={[s.modalRowText, { color: C.text, flex: 1 }]}>{PRIVACY_LABELS[key]}</Text>
                {privacy === key && (
                  <Ionicons name="checkmark" size={24} color={C.accent} />
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
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  postBtn: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  postBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  userRow: { flexDirection: 'row', padding: 16, alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  privacyBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    borderWidth: 1, 
    borderRadius: 6, 
    paddingHorizontal: 8, 
    paddingVertical: 4,
    alignSelf: 'flex-start',
    gap: 4
  },
  privacyText: { fontSize: 12, fontWeight: '500' },
  input: { flex: 1, padding: 16, fontSize: 18, textAlignVertical: 'top' },
  
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    width: '100%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 32,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
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
