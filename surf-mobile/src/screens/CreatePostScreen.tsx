import React, { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { isVideoAsset, uploadImage, uploadVideo } from '@/lib/cloudinary';

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
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '@/navigation';
import { useUserStore } from '@/stores/userStore';
import { useAuthStore } from '@/stores/authStore';
import { useFeedStore } from '@/stores/feedStore';
import { api } from '@/lib/api';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'CreatePost'>;
  route: RouteProp<RootStackParamList, 'CreatePost'>;
};

type Privacy = 'public' | 'friends' | 'only-me' | 'custom';
type PickedAsset = ImagePicker.ImagePickerAsset;

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

const PRIVACY_LABELS: Record<Privacy, string> = {
  'public': 'Công khai',
  'friends': 'Bạn bè',
  'only-me': 'Chỉ mình tôi',
  'custom': 'Tùy chỉnh',
};
const PRIVACY_ICONS: Record<Privacy, keyof typeof Ionicons.glyphMap> = {
  'public': 'earth-outline',
  'friends': 'people-outline',
  'only-me': 'lock-closed-outline',
  'custom': 'settings-outline',
};

const FEELINGS = [
  { emoji: '😊', label: 'Vui vẻ' },
  { emoji: '😍', label: 'Yêu thích' },
  { emoji: '😎', label: 'Ngầu' },
  { emoji: '😢', label: 'Buồn' },
  { emoji: '😡', label: 'Giận dữ' },
  { emoji: '🥳', label: 'Hào hứng' },
  { emoji: '😴', label: 'Mệt mỏi' },
  { emoji: '🤔', label: 'Suy nghĩ' },
  { emoji: '🥰', label: 'Biết ơn' },
  { emoji: '😤', label: 'Tự hào' },
];

export default function CreatePostScreen({ navigation, route }: Props) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;
  const groupId = route.params?.groupId;
  const groupName = route.params?.groupName;

  const { profile, fetchProfile } = useUserStore();
  const { user } = useAuthStore();
  const refreshFeed = useFeedStore((s) => s.fetch);

  const [content, setContent] = useState('');
  const [privacy, setPrivacy] = useState<Privacy>('public');
  const [assets, setAssets] = useState<PickedAsset[]>([]);
  const [feeling, setFeeling] = useState('');
  const [location, setLocation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showFeelingPicker, setShowFeelingPicker] = useState(false);
  const [showLocationInput, setShowLocationInput] = useState(false);

  useEffect(() => {
    if (!profile) {
      fetchProfile();
    } else {
      setPrivacy((profile.defaultPostPrivacy as Privacy) || 'public');
    }
  }, [profile, fetchProfile]);

  const canSubmit = content.trim().length > 0 || assets.length > 0;

  const pickFromGallery = async () => {
    const granted = await ensureLibraryPermission();
    if (!granted) {
      Alert.alert('Quyền truy cập', 'Cần quyền truy cập thư viện ảnh để chọn media.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.85,
    });
    if (!result.canceled) {
      setAssets((prev) => [...prev, ...result.assets].slice(0, 10));
    }
  };

  const captureWithCamera = async () => {
    const granted = await ensureCameraPermission();
    if (!granted) {
      Alert.alert('Quyền truy cập', 'Cần quyền truy cập camera để chụp ảnh.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.85,
    });
    if (!result.canceled) {
      setAssets((prev) => [...prev, ...result.assets].slice(0, 10));
    }
  };

  const removeAsset = (uri: string) => setAssets((prev) => prev.filter((a) => a.uri !== uri));

  const handlePost = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    setUploadProgress(0);
    try {
      const mediaUrls: string[] = [];
      const total = assets.length;
      for (let i = 0; i < assets.length; i++) {
        const asset = assets[i];
        const url = isVideoAsset(asset)
          ? await uploadVideo(asset, { folder: 'surf/posts/videos' })
          : await uploadImage(asset, { folder: 'surf/posts' });
        mediaUrls.push(url);
        setUploadProgress(Math.round(((i + 1) / total) * 100));
      }
      const endpoint = groupId ? `/api/groups/${groupId}/posts` : '/api/posts';
      await api.post(endpoint, {
        content: content.trim(),
        mediaUrls,
        feeling: feeling || null,
        location: location.trim() || null,
        privacy: groupId ? 'group' : privacy,
      });
      if (!groupId) await refreshFeed(true);
      navigation.goBack();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Không thể đăng bài. Vui lòng thử lại!';
      setError(msg);
    } finally {
      setSubmitting(false);
      setUploadProgress(0);
    }
  };

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: C.border, backgroundColor: C.card }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={26} color={C.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: C.text }]} numberOfLines={1}>
          {groupName ? `Đăng vào ${groupName}` : 'Tạo bài viết'}
        </Text>
        <TouchableOpacity
          style={[s.postBtn, { backgroundColor: canSubmit && !submitting ? C.accent : C.border }]}
          disabled={!canSubmit || submitting}
          onPress={handlePost}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={s.postBtnText}>Đăng</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Upload progress bar */}
      {submitting && assets.length > 0 && (
        <View style={[s.progressBar, { backgroundColor: C.border }]}>
          <View style={[s.progressFill, { width: `${uploadProgress}%` as any, backgroundColor: C.accent }]} />
        </View>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
          {/* User row */}
          <View style={s.userRow}>
            <View style={[s.avatar, { backgroundColor: C.accent }]}>
              <Text style={s.avatarText}>
                {(user?.displayName || user?.email || 'U')[0].toUpperCase()}
              </Text>
            </View>
            <View style={{ marginLeft: 10 }}>
              <Text style={[s.name, { color: C.text }]}>
                {user?.displayName || 'Người dùng'}
                {feeling ? <Text style={{ color: C.subtext, fontWeight: '400' }}> đang cảm thấy {feeling}</Text> : null}
                {location ? <Text style={{ color: C.subtext, fontWeight: '400' }}> tại 📍{location}</Text> : null}
              </Text>
              <TouchableOpacity
                style={[s.privacyBtn, { borderColor: C.border }]}
                onPress={() => !groupId && setShowPrivacyModal(true)}
                disabled={Boolean(groupId)}
              >
                <Ionicons name={groupId ? 'people-outline' : PRIVACY_ICONS[privacy]} size={13} color={C.accent} />
                <Text style={[s.privacyText, { color: C.accent }]} numberOfLines={1}>
                  {groupName ? `Nhóm: ${groupName}` : PRIVACY_LABELS[privacy]}
                </Text>
                {!groupId && <Ionicons name="caret-down" size={11} color={C.accent} />}
              </TouchableOpacity>
            </View>
          </View>

          {/* Text input */}
          <TextInput
            style={[s.input, { color: C.text }]}
            placeholder="Bạn đang nghĩ gì?"
            placeholderTextColor={C.muted}
            multiline
            autoFocus
            value={content}
            onChangeText={setContent}
          />

          {/* Media preview grid */}
          {assets.length > 0 && (
            <View style={s.mediaGrid}>
              {assets.map((asset) => {
                const isVid = isVideoAsset(asset);
                return (
                  <View key={asset.uri} style={[s.mediaTile, { backgroundColor: C.panel }]}>
                    {isVid ? (
                      <View style={s.videoPreview}>
                        <Ionicons name="play-circle" size={36} color="#fff" />
                        <Text style={s.videoLabel} numberOfLines={1}>{asset.fileName || 'Video'}</Text>
                      </View>
                    ) : (
                      <Image source={{ uri: asset.uri }} style={s.mediaImage} />
                    )}
                    <TouchableOpacity style={s.removeBtn} onPress={() => removeAsset(asset.uri)}>
                      <Ionicons name="close" size={14} color="#fff" />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {/* Location input */}
          {showLocationInput && (
            <View style={[s.locationRow, { borderColor: C.border, backgroundColor: C.panel }]}>
              <Ionicons name="location-outline" size={18} color={C.accent} />
              <TextInput
                style={[s.locationInput, { color: C.text }]}
                placeholder="Nhập vị trí..."
                placeholderTextColor={C.muted}
                value={location}
                onChangeText={setLocation}
                returnKeyType="done"
              />
              {location ? (
                <TouchableOpacity onPress={() => setLocation('')}>
                  <Ionicons name="close-circle" size={18} color={C.subtext} />
                </TouchableOpacity>
              ) : null}
            </View>
          )}

          {/* Feeling picker */}
          {showFeelingPicker && (
            <View style={[s.feelingGrid, { borderTopColor: C.border }]}>
              {FEELINGS.map((f) => (
                <TouchableOpacity
                  key={f.label}
                  style={[
                    s.feelingChip,
                    { backgroundColor: feeling === `${f.emoji} ${f.label}` ? `${C.accent}33` : C.panel,
                      borderColor: feeling === `${f.emoji} ${f.label}` ? C.accent : C.border },
                  ]}
                  onPress={() => {
                    setFeeling((prev) => (prev === `${f.emoji} ${f.label}` ? '' : `${f.emoji} ${f.label}`));
                    setShowFeelingPicker(false);
                  }}
                >
                  <Text style={s.feelingEmoji}>{f.emoji}</Text>
                  <Text style={[s.feelingLabel, { color: C.text }]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Error */}
          {error && (
            <View style={[s.errorBox, { borderColor: C.danger, marginHorizontal: 16 }]}>
              <Text style={[s.errorText, { color: C.danger }]}>{error}</Text>
            </View>
          )}
        </ScrollView>

        {/* Action bar */}
        <View style={[s.actionBar, { borderTopColor: C.border, backgroundColor: C.card }]}>
          <TouchableOpacity style={s.actionBtn} onPress={pickFromGallery}>
            <Ionicons name="images-outline" size={24} color="#22c55e" />
            <Text style={[s.actionLabel, { color: C.subtext }]}>Ảnh/Video</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.actionBtn} onPress={captureWithCamera}>
            <Ionicons name="camera-outline" size={24} color="#f59e0b" />
            <Text style={[s.actionLabel, { color: C.subtext }]}>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.actionBtn}
            onPress={() => { setShowFeelingPicker((v) => !v); setShowLocationInput(false); }}
          >
            <Ionicons name="happy-outline" size={24} color="#a855f7" />
            <Text style={[s.actionLabel, { color: C.subtext }]}>Cảm xúc</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.actionBtn}
            onPress={() => { setShowLocationInput((v) => !v); setShowFeelingPicker(false); }}
          >
            <Ionicons name="location-outline" size={24} color="#ef4444" />
            <Text style={[s.actionLabel, { color: C.subtext }]}>Vị trí</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Privacy Modal */}
      <Modal visible={!groupId && showPrivacyModal} transparent animationType="slide">
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowPrivacyModal(false)}>
          <View style={[s.modalContent, { backgroundColor: C.card }]}>
            <Text style={[s.modalTitle, { color: C.text }]}>Đối tượng của bài viết</Text>
            {(Object.keys(PRIVACY_LABELS) as Privacy[]).map((key) => (
              <TouchableOpacity
                key={key}
                style={[s.modalRow, { borderTopColor: C.border }]}
                onPress={() => {
                  setPrivacy(key as any);
                  setShowPrivacyModal(false);
                }}
              >
                <Ionicons name={PRIVACY_ICONS[key]} size={22} color={C.text} />
                <Text style={[s.modalRowText, { color: C.text, flex: 1 }]}>{PRIVACY_LABELS[key as keyof typeof PRIVACY_LABELS]}</Text>
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
  headerTitle: { flex: 1, marginHorizontal: 12, textAlign: 'center', fontSize: 18, fontWeight: '700' },
  postBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20 },
  postBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  progressBar: { height: 3, width: '100%' },
  progressFill: { height: 3 },
  userRow: { flexDirection: 'row', padding: 16, alignItems: 'center' },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  name: { fontSize: 15, fontWeight: '700', marginBottom: 5 },
  privacyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    gap: 4,
  },
  privacyText: { fontSize: 12, fontWeight: '600' },
  input: { minHeight: 120, paddingHorizontal: 16, fontSize: 18, lineHeight: 26, textAlignVertical: 'top' },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, marginTop: 8 },
  mediaTile: { width: '48.5%', aspectRatio: 1, borderRadius: 10, overflow: 'hidden' },
  mediaImage: { width: '100%', height: '100%' },
  videoPreview: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  videoLabel: { color: '#fff', fontSize: 11, maxWidth: '90%', textAlign: 'center' },
  removeBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(15,23,42,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  locationInput: { flex: 1, fontSize: 15 },
  feelingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 16,
    borderTopWidth: 1,
  },
  feelingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 5,
  },
  feelingEmoji: { fontSize: 16 },
  feelingLabel: { fontSize: 13, fontWeight: '500' },
  errorBox: { borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 12 },
  errorText: { fontSize: 13 },
  actionBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  actionBtn: { flex: 1, alignItems: 'center', gap: 3 },
  actionLabel: { fontSize: 11 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    width: '100%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 36,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    gap: 12,
  },

  modalRowText: {
    fontSize: 16,
  },
});

