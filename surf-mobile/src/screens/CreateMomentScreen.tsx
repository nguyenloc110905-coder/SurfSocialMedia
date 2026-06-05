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
import { useVideoPlayer, VideoView } from 'expo-video';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation';
import { api } from '@/lib/api';
import { isVideoAsset, uploadImage, uploadVideo } from '@/lib/cloudinary';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'CreateMoment'>;
};

type PickedAsset = ImagePicker.ImagePickerAsset;
type Privacy = 'public' | 'friends' | 'only_me';

const FILTERS = [
  { id: 'none', name: 'Gốc', css: 'none' },
  { id: 'vivid', name: 'Rực', css: 'saturate(1.6) contrast(1.08)' },
  { id: 'warm', name: 'Ấm', css: 'sepia(0.25) saturate(1.25)' },
  { id: 'mono', name: 'Đen trắng', css: 'grayscale(1) contrast(1.1)' },
  { id: 'night', name: 'Đêm', css: 'brightness(0.72) saturate(0.9)' },
];

const TEXT_COLORS = ['#ffffff', '#111827', '#f97316', '#22c55e', '#38bdf8', '#ec4899'];
const PRIVACY_OPTIONS: Array<{ value: Privacy; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { value: 'public', label: 'Công khai', icon: 'earth-outline' },
  { value: 'friends', label: 'Bạn bè', icon: 'people-outline' },
  { value: 'only_me', label: 'Chỉ mình tôi', icon: 'lock-closed-outline' },
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
};

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

function PreviewVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      nativeControls={false}
      fullscreenOptions={{ enable: false }}
      allowsPictureInPicture={false}
    />
  );
}

export default function CreateMomentScreen({ navigation }: Props) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;
  const [asset, setAsset] = useState<PickedAsset | null>(null);
  const [caption, setCaption] = useState('');
  const [textOverlay, setTextOverlay] = useState('');
  const [textColor, setTextColor] = useState('#ffffff');
  const [selectedFilter, setSelectedFilter] = useState(FILTERS[0]);
  const [privacy, setPrivacy] = useState<Privacy>('public');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isVideo = !!asset && isVideoAsset(asset);
  const canSubmit = !!asset && !submitting;
  const selectedPrivacy = useMemo(() => PRIVACY_OPTIONS.find((option) => option.value === privacy) ?? PRIVACY_OPTIONS[0], [privacy]);

  const pickFromGallery = async () => {
    const granted = await ensureLibraryPermission();
    if (!granted) {
      Alert.alert('Quyền truy cập', 'Cần quyền truy cập thư viện để chọn ảnh hoặc video.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: false,
      quality: 0.9,
      videoMaxDuration: 15,
    });
    if (!result.canceled) setAsset(result.assets[0]);
  };

  const capture = async () => {
    const granted = await ensureCameraPermission();
    if (!granted) {
      Alert.alert('Quyền truy cập', 'Cần quyền camera để tạo Moment.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.9,
      videoMaxDuration: 15,
    });
    if (!result.canceled) setAsset(result.assets[0]);
  };

  const submit = async () => {
    if (!asset || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const mediaUrl = isVideoAsset(asset)
        ? await uploadVideo(asset, { folder: 'surf/moments/videos' })
        : await uploadImage(asset, { folder: 'surf/moments' });
      await api.post('/api/moments', {
        mediaUrl,
        mediaType: isVideoAsset(asset) ? 'video' : 'image',
        caption: caption.trim() || null,
        filter: selectedFilter.css === 'none' ? null : selectedFilter.css,
        textOverlay: textOverlay.trim() || null,
        textColor,
        textSize: 28,
        textX: 50,
        textY: 50,
        textStyle: 'box',
        privacy,
      });
      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tạo Moment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]}>
      <View style={[s.header, { backgroundColor: C.card, borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.headerIcon}>
          <Ionicons name="close" size={26} color={C.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: C.text }]}>Tạo Moment</Text>
        <TouchableOpacity
          style={[s.postBtn, { backgroundColor: canSubmit ? C.accent : C.border }]}
          disabled={!canSubmit}
          onPress={submit}
        >
          {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.postText}>Đăng</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <View style={[s.preview, { backgroundColor: C.panel, borderColor: C.border }]}>
            {asset ? (
              <>
                {isVideo ? <PreviewVideo uri={asset.uri} /> : <Image source={{ uri: asset.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
                <View style={s.previewShade} />
                {!!textOverlay.trim() && (
                  <View style={s.overlayTextWrap}>
                    <Text style={[s.overlayText, { color: textColor }]} numberOfLines={4}>{textOverlay.trim()}</Text>
                  </View>
                )}
                {!!caption.trim() && (
                  <Text style={s.previewCaption} numberOfLines={2}>{caption.trim()}</Text>
                )}
              </>
            ) : (
              <View style={s.emptyPreview}>
                <Ionicons name="images-outline" size={54} color={C.muted} />
                <Text style={[s.emptyTitle, { color: C.text }]}>Chọn ảnh hoặc video ngắn</Text>
                <Text style={[s.emptySub, { color: C.subtext }]}>Moment sẽ hiển thị trong 24 giờ.</Text>
              </View>
            )}
          </View>

          <View style={s.pickRow}>
            <TouchableOpacity style={[s.pickBtn, { backgroundColor: C.card, borderColor: C.border }]} onPress={pickFromGallery}>
              <Ionicons name="image-outline" size={22} color="#22c55e" />
              <Text style={[s.pickText, { color: C.text }]}>Thư viện</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.pickBtn, { backgroundColor: C.card, borderColor: C.border }]} onPress={capture}>
              <Ionicons name="camera-outline" size={22} color="#f59e0b" />
              <Text style={[s.pickText, { color: C.text }]}>Camera</Text>
            </TouchableOpacity>
          </View>

          <View style={[s.panel, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={[s.sectionTitle, { color: C.text }]}>Nội dung</Text>
            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder="Viết chú thích..."
              placeholderTextColor={C.muted}
              style={[s.input, { color: C.text, borderColor: C.border, backgroundColor: C.panel }]}
              maxLength={180}
            />
            <TextInput
              value={textOverlay}
              onChangeText={setTextOverlay}
              placeholder="Thêm chữ trên Moment"
              placeholderTextColor={C.muted}
              style={[s.input, { color: C.text, borderColor: C.border, backgroundColor: C.panel }]}
              maxLength={80}
            />
            <View style={s.swatches}>
              {TEXT_COLORS.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[s.swatch, { backgroundColor: color, borderColor: textColor === color ? C.accent : C.border }]}
                  onPress={() => setTextColor(color)}
                />
              ))}
            </View>
          </View>

          <View style={[s.panel, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={[s.sectionTitle, { color: C.text }]}>Bộ lọc</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
              {FILTERS.map((filter) => (
                <TouchableOpacity
                  key={filter.id}
                  style={[
                    s.filterChip,
                    {
                      backgroundColor: selectedFilter.id === filter.id ? `${C.accent}22` : C.panel,
                      borderColor: selectedFilter.id === filter.id ? C.accent : C.border,
                    },
                  ]}
                  onPress={() => setSelectedFilter(filter)}
                >
                  <Text style={[s.filterText, { color: selectedFilter.id === filter.id ? C.accent : C.text }]}>{filter.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={[s.panel, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={[s.sectionTitle, { color: C.text }]}>Đối tượng</Text>
            {PRIVACY_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[s.privacyRow, { borderTopColor: C.border }]}
                onPress={() => setPrivacy(option.value)}
              >
                <Ionicons name={option.icon} size={20} color={privacy === option.value ? C.accent : C.subtext} />
                <Text style={[s.privacyText, { color: C.text }]}>{option.label}</Text>
                {selectedPrivacy.value === option.value && <Ionicons name="checkmark-circle" size={20} color={C.accent} />}
              </TouchableOpacity>
            ))}
          </View>

          {!!error && <Text style={s.error}>{error}</Text>}
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
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
  },
  postBtn: {
    minWidth: 72,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  postText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  content: {
    padding: 12,
    paddingBottom: 28,
    gap: 12,
  },
  preview: {
    alignSelf: 'center',
    width: '72%',
    aspectRatio: 9 / 16,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  previewShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  emptyPreview: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptySub: {
    marginTop: 6,
    fontSize: 13,
    textAlign: 'center',
  },
  overlayTextWrap: {
    position: 'absolute',
    top: '43%',
    left: 14,
    right: 14,
    alignItems: 'center',
  },
  overlayText: {
    backgroundColor: 'rgba(0,0,0,0.38)',
    borderRadius: 8,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 7,
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'center',
  },
  previewCaption: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 14,
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  pickRow: {
    flexDirection: 'row',
    gap: 10,
  },
  pickBtn: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pickText: {
    fontSize: 14,
    fontWeight: '800',
  },
  panel: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 10,
  },
  input: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    marginBottom: 10,
  },
  swatches: {
    flexDirection: 'row',
    gap: 10,
  },
  swatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 3,
  },
  filterRow: {
    gap: 8,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '800',
  },
  privacyRow: {
    minHeight: 46,
    borderTopWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  privacyText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  error: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '700',
  },
});

