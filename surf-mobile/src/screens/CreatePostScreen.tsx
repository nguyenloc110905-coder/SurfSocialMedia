import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
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
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation';
import { api } from '@/lib/api';
import { isVideoAsset, uploadImage, uploadVideo } from '@/lib/cloudinary';
import { useFeedStore, type FeedPost } from '@/stores/feedStore';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'CreatePost'>;
};

type Privacy = 'public' | 'friends' | 'only-me';
type PickedAsset = ImagePicker.ImagePickerAsset;

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

export default function CreatePostScreen({ navigation }: Props) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;
  const addPost = useFeedStore((s) => s.addPost);
  const fetchFeed = useFeedStore((s) => s.fetch);

  const [content, setContent] = useState('');
  const [privacy, setPrivacy] = useState<Privacy>('public');
  const [assets, setAssets] = useState<PickedAsset[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = useMemo(
    () => !!content.trim() || assets.length > 0,
    [assets.length, content]
  );

  const addAssets = (incoming: PickedAsset[]) => {
    setAssets((current) => {
      const known = new Set(current.map((asset) => asset.assetId || asset.uri));
      const next = incoming.filter((asset) => !known.has(asset.assetId || asset.uri));
      return [...current, ...next].slice(0, 10);
    });
  };

  const pickFromGallery = async () => {
    setError('');
    const allowed = await ensureLibraryPermission();
    if (!allowed) {
      Alert.alert('Cần quyền thư viện', 'Hãy cho phép truy cập ảnh/video để chọn media đăng bài.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      quality: 0.85,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    });

    if (!result.canceled) addAssets(result.assets);
  };

  const captureWithCamera = async () => {
    setError('');
    const allowed = await ensureCameraPermission();
    if (!allowed) {
      Alert.alert('Cần quyền camera', 'Hãy cho phép camera để chụp ảnh hoặc quay video.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.85,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    });

    if (!result.canceled) addAssets(result.assets);
  };

  const removeAsset = (uri: string) => {
    setAssets((current) => current.filter((asset) => asset.uri !== uri));
  };

  const submit = async () => {
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    setError('');
    try {
      const videoUrls = await Promise.all(
        assets.filter(isVideoAsset).map((asset) => uploadVideo(asset, { folder: 'surf/posts/videos' }))
      );
      const imageUrls = await Promise.all(
        assets.filter((asset) => !isVideoAsset(asset)).map((asset) => uploadImage(asset, { folder: 'surf/posts' }))
      );
      const created = await api.post<FeedPost>('/api/posts', {
        content: content.trim(),
        mediaUrls: [...videoUrls, ...imageUrls],
        privacy,
        feeling: null,
        location: null,
        taggedFriends: [],
      });

      addPost(created);
      await fetchFeed(true);
      navigation.goBack();
    } catch (err) {
      setError((err as Error).message || 'Không thể tạo bài viết.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]}>
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
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
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
});
