import React, { useEffect, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { isVideoAsset, uploadImage, uploadVideo } from '@/lib/cloudinary';
import { useFeedStore, type FeedPost } from '@/stores/feedStore';

import {
  View,
  Text,
  Modal,
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  useColorScheme,
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

type Privacy = 'public' | 'friends' | 'only-me';
type PickedAsset = ImagePicker.ImagePickerAsset;
const PRIVACY_OPTIONS: Array<{ value: Privacy; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { value: 'public', label: 'Công khai', icon: 'globe-outline' },
  { value: 'friends', label: 'Bạn bè', icon: 'people-outline' },
  { value: 'only-me', label: 'Chỉ mình tôi', icon: 'lock-closed-outline' },
];

async function ensureLibraryPermission() {
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted) return true;
  const next = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return next.granted;
}

async function ensureCameraPermission() {
  const current = await ImagePicker.getCameraPermissionsAsync();
  if (current.granted) return true;
  const next = await ImagePicker.requestCameraPermissionsAsync();
  return next.granted;
}
const DARK = {
  bg: '#0f172a',
  card: '#111827',
  panel: '#1e293b',
  border: '#334155',
  text: '#e2e8f0',
  subtext: '#94a3b8',
  muted: '#64748b',
  accent: '#0ea5e9',
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
  danger: '#dc2626',
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
<<<<<<< HEAD
  <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={[s.header, { borderBottomColor: C.border, backgroundColor: C.card }]}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={s.iconBtn}>
        <Ionicons name="chevron-back" size={24} color={C.text} />
      </TouchableOpacity>
      <Text style={[s.title, { color: C.text }]}>Tạo bài viết</Text>
      <TouchableOpacity
        onPress={submit}
        disabled={!canSubmit || submitting}
        style={[s.postBtn, { backgroundColor: canSubmit ? C.accent : C.border, opacity: submitting ? 0.7 : 1 }]}
      >
        {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.postText}>Đăng</Text>}
      </TouchableOpacity>
    </View>

    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={[s.composer, { backgroundColor: C.card, borderColor: C.border }]}>
        <TextInput
          value={content}
          onChangeText={setContent}
          placeholder="Bạn đang nghĩ gì?"
          placeholderTextColor={C.muted}
          multiline
          textAlignVertical="top"
          style={[s.input, { color: C.text }]}
          maxLength={3000}
        />

        <View style={s.privacyRow}>
          {PRIVACY_OPTIONS.map((option) => {
            const active = privacy === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                onPress={() => setPrivacy(option.value)}
                style={[
                  s.privacyChip,
                  {
                    borderColor: active ? C.accent : C.border,
                    backgroundColor: active ? `${C.accent}22` : C.panel,
                  },
                ]}
              >
                <Ionicons name={option.icon} size={15} color={active ? C.accent : C.subtext} />
                <Text style={[s.privacyText, { color: active ? C.accent : C.subtext }]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={s.actions}>
        <TouchableOpacity style={[s.actionBtn, { backgroundColor: C.card, borderColor: C.border }]} onPress={pickFromGallery}>
          <Ionicons name="images-outline" size={22} color={C.accent} />
          <Text style={[s.actionText, { color: C.text }]}>Thư viện</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.actionBtn, { backgroundColor: C.card, borderColor: C.border }]} onPress={captureWithCamera}>
          <Ionicons name="camera-outline" size={22} color={C.accent} />
          <Text style={[s.actionText, { color: C.text }]}>Camera</Text>
        </TouchableOpacity>
      </View>

      {assets.length > 0 && (
        <View style={s.mediaGrid}>
          {assets.map((asset) => {
            const video = isVideoAsset(asset);
            return (
              <View key={asset.uri} style={[s.mediaTile, { backgroundColor: C.panel }]}>
                {video ? (
                  <View style={s.videoPreview}>
                    <Ionicons name="play-circle" size={40} color="#fff" />
                    <Text style={s.videoLabel} numberOfLines={1}>
                      {asset.fileName || 'Video'}
                    </Text>
                  </View>
                ) : (
                  <Image source={{ uri: asset.uri }} style={s.mediaImage} />
                )}
                <TouchableOpacity style={s.removeBtn} onPress={() => removeAsset(asset.uri)}>
                  <Ionicons name="close" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}

      {!!error && (
        <View style={[s.errorBox, { borderColor: C.danger }]}>
          <Text style={[s.errorText, { color: C.danger }]}>{error}</Text>
        </View>
      )}
    </ScrollView>
  </KeyboardAvoidingView>
=======
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

>>>>>>> ba81ee4a477f1741d045b27920d12c90b1b9b213
    </SafeAreaView >
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
<<<<<<< HEAD
    height: 56,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  iconBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700' },
  postBtn: {
    minWidth: 72,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  postText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  content: { padding: 14, paddingBottom: 32 },
  composer: { borderWidth: 1, borderRadius: 12, padding: 12 },
  input: { minHeight: 150, fontSize: 18, lineHeight: 25 },
  privacyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  privacyChip: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  privacyText: { fontSize: 12, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  actionBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  actionText: { fontSize: 14, fontWeight: '700' },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  mediaTile: {
    width: '48.8%',
    aspectRatio: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  mediaImage: { width: '100%', height: '100%' },
  videoPreview: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  videoLabel: { color: '#fff', fontSize: 12, marginTop: 6, maxWidth: '90%' },
  removeBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBox: { borderWidth: 1, borderRadius: 10, padding: 10, marginTop: 12 },
  errorText: { fontSize: 13 },
=======
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
>>>>>>> ba81ee4a477f1741d045b27920d12c90b1b9b213
});
