import React, { useEffect, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
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
import { uploadVideo } from '@/lib/cloudinary';
import { api } from '@/lib/api';
import { useClipStore } from '@/stores/clipStore';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'CreateClip'>;
};

type Step = 1 | 2 | 3;
type Privacy = 'public' | 'friends' | 'only-me';
type ContentFit = 'contain' | 'cover';
type TextPlacement = 'top' | 'center' | 'bottom';
type PickedAsset = ImagePicker.ImagePickerAsset;

type TextOverlayDraft = {
  id: string;
  text: string;
  color: string;
  fontSize: number;
  placement: TextPlacement;
};

const MAX_VIDEO_BYTES = 100 * 1000 * 1000;
const TEXT_COLORS = ['#ffffff', '#facc15', '#38bdf8', '#fb7185', '#111827'];

const DARK = {
  bg: '#050505',
  card: '#101114',
  panel: '#181a20',
  panelSoft: '#22242b',
  border: '#2b2e36',
  text: '#f8fafc',
  subtext: '#a1a1aa',
  muted: '#71717a',
  accent: '#0ea5e9',
  danger: '#ef4444',
};

const LIGHT = {
  bg: '#f7f7f8',
  card: '#ffffff',
  panel: '#f1f3f5',
  panelSoft: '#e9edf2',
  border: '#dfe3ea',
  text: '#111827',
  subtext: '#667085',
  muted: '#98a2b3',
  accent: '#0b84ff',
  danger: '#dc2626',
};

const PRIVACY_OPTIONS: Array<{
  value: Privacy;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { value: 'public', title: 'Công khai', subtitle: 'Mọi người có thể xem', icon: 'earth-outline' },
  { value: 'friends', title: 'Bạn bè', subtitle: 'Chỉ bạn bè trên Surf', icon: 'people-outline' },
  { value: 'only-me', title: 'Chỉ mình tôi', subtitle: 'Riêng tư trên hồ sơ của bạn', icon: 'lock-closed-outline' },
];

const TOOL_ACTIONS: Array<{
  key: 'sound' | 'edit' | 'effects' | 'text' | 'stickers';
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  enabled: boolean;
}> = [
  { key: 'sound', label: 'Âm thanh', icon: 'musical-notes-outline', enabled: false },
  { key: 'edit', label: 'Chỉnh sửa', icon: 'options-outline', enabled: true },
  { key: 'effects', label: 'Hiệu ứng', icon: 'sparkles-outline', enabled: false },
  { key: 'text', label: 'Văn bản', icon: 'text-outline', enabled: true },
  { key: 'stickers', label: 'Nhãn dán', icon: 'happy-outline', enabled: false },
];

function formatFileSize(bytes?: number) {
  if (!bytes) return '';
  const mb = bytes / (1000 * 1000);
  return `${mb.toFixed(mb >= 10 ? 0 : 1)}MB`;
}

function tagsFromText(input: string) {
  return input
    .split(/[,\s]+/)
    .map((tag) => tag.trim().replace(/^#/, ''))
    .filter(Boolean)
    .slice(0, 8);
}

function overlayPosition(placement: TextPlacement) {
  if (placement === 'top') return { top: '22%' as const };
  if (placement === 'bottom') return { bottom: '24%' as const };
  return { top: '46%' as const };
}

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

function ClipPreview({
  uri,
  contentFit,
  muted,
  overlays,
  showControls = false,
}: {
  uri: string;
  contentFit: ContentFit;
  muted: boolean;
  overlays: TextOverlayDraft[];
  showControls?: boolean;
}) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = muted;
  });

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  useEffect(() => {
    try {
      player.play();
    } catch {
      // Preview can be unavailable while the native player attaches.
    }
    return () => {
      try {
        player.pause();
      } catch {
        // ignore
      }
    };
  }, [player]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit={contentFit}
        nativeControls={showControls}
        fullscreenOptions={{ enable: showControls }}
        allowsPictureInPicture={false}
      />
      {overlays.map((overlay) => (
        <View
          key={overlay.id}
          pointerEvents="none"
          style={[s.overlayLayer, overlayPosition(overlay.placement)]}
        >
          <Text
            style={[
              s.overlayText,
              {
                color: overlay.color,
                fontSize: overlay.fontSize,
                textShadowColor: overlay.color === '#111827' ? 'rgba(255,255,255,0.72)' : 'rgba(0,0,0,0.72)',
              },
            ]}
            numberOfLines={3}
          >
            {overlay.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

export default function CreateClipScreen({ navigation }: Props) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;
  const requestClipRefresh = useClipStore((state) => state.requestRefresh);

  const [step, setStep] = useState<Step>(1);
  const [asset, setAsset] = useState<PickedAsset | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState<Privacy>('public');
  const [location, setLocation] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [allowComments, setAllowComments] = useState(true);
  const [aiGenerated, setAiGenerated] = useState(false);
  const [contentFit, setContentFit] = useState<ContentFit>('cover');
  const [mutedOriginal, setMutedOriginal] = useState(false);
  const [activePanel, setActivePanel] = useState<'text' | 'edit' | null>(null);
  const [textDraft, setTextDraft] = useState('');
  const [textColor, setTextColor] = useState(TEXT_COLORS[0]);
  const [textSize, setTextSize] = useState(28);
  const [textPlacement, setTextPlacement] = useState<TextPlacement>('center');
  const [overlays, setOverlays] = useState<TextOverlayDraft[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);

  const tags = useMemo(() => tagsFromText(tagsInput), [tagsInput]);
  const selectedPrivacy = PRIVACY_OPTIONS.find((item) => item.value === privacy) ?? PRIVACY_OPTIONS[0];

  const validateAsset = (nextAsset: PickedAsset) => {
    const fileSize = (nextAsset as PickedAsset & { fileSize?: number }).fileSize;
    if (fileSize && fileSize > MAX_VIDEO_BYTES) {
      setError(`Video ${formatFileSize(fileSize)} vượt giới hạn upload trực tiếp 100MB. Vui lòng chọn video ngắn hơn hoặc nén video trước khi đăng.`);
      return false;
    }
    return true;
  };

  const acceptAsset = (nextAsset: PickedAsset) => {
    if (!validateAsset(nextAsset)) return;
    setAsset(nextAsset);
    setError(null);
    setStep(2);
  };

  const pickFromGallery = async () => {
    const granted = await ensureLibraryPermission();
    if (!granted) {
      Alert.alert('Quyền truy cập', 'Cần quyền truy cập thư viện để chọn video.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: false,
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) acceptAsset(result.assets[0]);
  };

  const recordWithCamera = async () => {
    const granted = await ensureCameraPermission();
    if (!granted) {
      Alert.alert('Quyền truy cập', 'Cần quyền camera để quay clip.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: false,
      quality: 0.9,
      videoMaxDuration: 180,
    });
    if (!result.canceled && result.assets[0]) acceptAsset(result.assets[0]);
  };

  const unavailable = (label: string) => {
    Alert.alert(label, 'Tính năng này sẽ được cập nhật trong phiên bản tới.');
  };

  const addTextOverlay = () => {
    const text = textDraft.trim();
    if (!text) return;
    const nextOverlay = {
      id: `${Date.now()}`,
      text,
      color: textColor,
      fontSize: textSize,
      placement: textPlacement,
    };
    setOverlays((current) => [...current.slice(-2), nextOverlay]);
    setTextDraft('');
    setActivePanel(null);
  };

  const handleBack = () => {
    if (uploading) return;
    if (activePanel) {
      setActivePanel(null);
      return;
    }
    if (step === 3) {
      setStep(2);
      return;
    }
    if (step === 2) {
      setStep(1);
      return;
    }
    navigation.goBack();
  };

  const handleSubmit = async () => {
    if (!asset || uploading) return;
    setUploading(true);
    setProgress(10);
    setError(null);
    try {
      setProgress(20);
      const videoUrl = await uploadVideo(asset, { folder: 'surf/clips' });
      setProgress(85);
      await api.post('/api/videos', {
        title: title.trim(),
        description: description.trim(),
        videoUrl,
        duration: asset.duration ?? null,
        privacy,
        location: location.trim() || null,
        tags,
        allowComments,
        aiGenerated,
        editOptions: {
          contentFit,
          mutedOriginal,
        },
        textOverlays: overlays,
      });
      setProgress(100);
      requestClipRefresh();
      navigation.goBack();
    } catch (e) {
      const message = (e as Error).message || '';
      setError(
        message.includes('413')
          ? 'Video vượt giới hạn upload trực tiếp 100MB của Cloudinary. Vui lòng nén video hoặc chọn video nhỏ hơn.'
          : message || 'Không thể đăng clip. Vui lòng thử lại.'
      );
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const renderStepOne = () => (
    <View style={s.selectWrap}>
      <View style={[s.selectHero, { backgroundColor: C.card, borderColor: C.border }]}>
        <View style={[s.selectIcon, { backgroundColor: `${C.accent}18` }]}>
          <Ionicons name="videocam-outline" size={44} color={C.accent} />
        </View>
        <Text style={[s.selectTitle, { color: C.text }]}>Tạo Surf Video</Text>
        <Text style={[s.selectSub, { color: C.subtext }]}>
          Chọn video từ thư viện hoặc quay clip mới bằng camera. Tối đa 100MB.
        </Text>
      </View>

      <TouchableOpacity style={[s.sourceBtn, { backgroundColor: C.text }]} onPress={recordWithCamera}>
        <Ionicons name="camera-outline" size={23} color={C.bg} />
        <Text style={[s.sourceText, { color: C.bg }]}>Quay bằng camera</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[s.sourceBtn, { backgroundColor: C.card, borderColor: C.border, borderWidth: 1 }]} onPress={pickFromGallery}>
        <Ionicons name="images-outline" size={23} color={C.accent} />
        <Text style={[s.sourceText, { color: C.text }]}>Chọn từ thư viện</Text>
      </TouchableOpacity>
    </View>
  );

  const renderEditPanel = () => (
    <View style={[s.editorPanel, { backgroundColor: C.card, borderColor: C.border }]}>
      <View style={s.panelHeader}>
        <Text style={[s.panelTitle, { color: C.text }]}>Chỉnh sửa video</Text>
        <TouchableOpacity onPress={() => setActivePanel(null)} style={s.iconOnlyBtn}>
          <Ionicons name="close" size={22} color={C.text} />
        </TouchableOpacity>
      </View>

      <View style={s.segmentRow}>
        {(['cover', 'contain'] as ContentFit[]).map((fit) => {
          const active = contentFit === fit;
          return (
            <TouchableOpacity
              key={fit}
              style={[s.segmentBtn, { backgroundColor: active ? C.text : C.panel, borderColor: active ? C.text : C.border }]}
              onPress={() => setContentFit(fit)}
            >
              <Ionicons name={fit === 'cover' ? 'scan-outline' : 'resize-outline'} size={17} color={active ? C.bg : C.text} />
              <Text style={[s.segmentText, { color: active ? C.bg : C.text }]}>{fit === 'cover' ? 'Lấp đầy' : 'Vừa khung'}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={[s.switchRow, { borderColor: C.border }]}>
        <View style={s.switchCopy}>
          <Text style={[s.rowTitle, { color: C.text }]}>Tắt tiếng video gốc</Text>
          <Text style={[s.rowSub, { color: C.subtext }]}>Phù hợp khi sau này thêm nhạc nền.</Text>
        </View>
        <Switch value={mutedOriginal} onValueChange={setMutedOriginal} />
      </View>
    </View>
  );

  const renderTextPanel = () => (
    <View style={[s.editorPanel, { backgroundColor: C.card, borderColor: C.border }]}>
      <View style={s.panelHeader}>
        <Text style={[s.panelTitle, { color: C.text }]}>Thêm chữ</Text>
        <TouchableOpacity onPress={() => setActivePanel(null)} style={s.iconOnlyBtn}>
          <Ionicons name="close" size={22} color={C.text} />
        </TouchableOpacity>
      </View>

      <TextInput
        value={textDraft}
        onChangeText={setTextDraft}
        maxLength={90}
        placeholder="Nhập chữ hiển thị trên video..."
        placeholderTextColor={C.muted}
        style={[s.textDraftInput, { backgroundColor: C.panel, color: C.text, borderColor: C.border }]}
      />
      <View style={s.swatchRow}>
        {TEXT_COLORS.map((color) => (
          <TouchableOpacity
            key={color}
            style={[s.swatch, { backgroundColor: color, borderColor: textColor === color ? C.accent : C.border }]}
            onPress={() => setTextColor(color)}
          />
        ))}
      </View>
      <View style={s.segmentRow}>
        {(['top', 'center', 'bottom'] as TextPlacement[]).map((placement) => {
          const active = textPlacement === placement;
          return (
            <TouchableOpacity
              key={placement}
              style={[s.segmentBtn, { backgroundColor: active ? C.text : C.panel, borderColor: active ? C.text : C.border }]}
              onPress={() => setTextPlacement(placement)}
            >
              <Text style={[s.segmentText, { color: active ? C.bg : C.text }]}>
                {placement === 'top' ? 'Trên' : placement === 'center' ? 'Giữa' : 'Dưới'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={s.segmentRow}>
        {[24, 28, 34].map((size) => {
          const active = textSize === size;
          return (
            <TouchableOpacity
              key={size}
              style={[s.segmentBtn, { backgroundColor: active ? C.text : C.panel, borderColor: active ? C.text : C.border }]}
              onPress={() => setTextSize(size)}
            >
              <Text style={[s.segmentText, { color: active ? C.bg : C.text }]}>{size === 24 ? 'Nhỏ' : size === 28 ? 'Vừa' : 'Lớn'}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <TouchableOpacity
        style={[s.panelPrimaryBtn, { backgroundColor: textDraft.trim() ? C.accent : C.border }]}
        disabled={!textDraft.trim()}
        onPress={addTextOverlay}
      >
        <Text style={s.panelPrimaryText}>Thêm vào video</Text>
      </TouchableOpacity>
    </View>
  );

  const renderStepTwo = () => {
    if (!asset) return null;
    return (
      <View style={s.previewScreen}>
        <View style={s.previewStage}>
          <ClipPreview uri={asset.uri} contentFit={contentFit} muted={mutedOriginal} overlays={overlays} />

          <View style={s.previewTop}>
            <TouchableOpacity style={s.roundDarkBtn} onPress={handleBack}>
              <Ionicons name="chevron-back" size={28} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={s.soundPill} onPress={() => unavailable('Âm thanh')}>
              <View style={s.soundIcon}>
                <Ionicons name="musical-notes-outline" size={24} color="#fff" />
              </View>
              <View>
                <Text style={s.soundTitle}>Thêm âm thanh</Text>
                <Text style={s.soundSub}>Khám phá các gợi ý</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={s.roundDarkBtn} onPress={() => unavailable('Tùy chọn khác')}>
              <Ionicons name="ellipsis-horizontal" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          {overlays.length > 0 && (
            <TouchableOpacity style={s.clearTextBtn} onPress={() => setOverlays([])}>
              <Ionicons name="trash-outline" size={16} color="#fff" />
              <Text style={s.clearText}>Xóa chữ</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={s.toolsDock}>
          {TOOL_ACTIONS.map((tool) => (
            <TouchableOpacity
              key={tool.key}
              style={s.toolBtn}
              onPress={() => {
                if (!tool.enabled) return unavailable(tool.label);
                if (tool.key === 'edit' || tool.key === 'text') setActivePanel(tool.key);
              }}
            >
              <View style={[s.toolIcon, !tool.enabled && s.toolIconDisabled]}>
                <Ionicons name={tool.icon} size={29} color={tool.enabled ? '#fff' : '#8b8b92'} />
              </View>
              <Text style={[s.toolText, !tool.enabled && s.toolTextDisabled]} numberOfLines={1}>{tool.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={s.nextCircle}
            onPress={() => {
              setActivePanel(null);
              setStep(3);
            }}
          >
            <Ionicons name="arrow-forward" size={32} color="#050505" />
          </TouchableOpacity>
        </View>

        {activePanel === 'edit' ? renderEditPanel() : null}
        {activePanel === 'text' ? renderTextPanel() : null}
      </View>
    );
  };

  const renderDetailsRow = ({
    icon,
    title,
    subtitle,
    onPress,
    disabled,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    subtitle?: string;
    onPress?: () => void;
    disabled?: boolean;
  }) => (
    <TouchableOpacity
      style={[s.detailsRow, { borderColor: C.border }]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.82}
    >
      <View style={[s.rowIcon, { backgroundColor: C.panel }]}>
        <Ionicons name={icon} size={24} color={disabled ? C.muted : C.text} />
      </View>
      <View style={s.rowCopy}>
        <Text style={[s.rowTitle, { color: disabled ? C.muted : C.text }]}>{title}</Text>
        {subtitle ? <Text style={[s.rowSub, { color: C.subtext }]} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={24} color={C.muted} /> : null}
    </TouchableOpacity>
  );

  const renderStepThree = () => {
    if (!asset) return null;
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.detailsContent} keyboardShouldPersistTaps="handled">
          <View style={s.composeTop}>
            <View style={s.thumb}>
              <ClipPreview uri={asset.uri} contentFit={contentFit} muted overlays={overlays} />
            </View>
            <TextInput
              value={description}
              onChangeText={setDescription}
              maxLength={500}
              multiline
              placeholder="Mô tả thước phim của bạn. Bạn cũng có thể thêm hashtag tại đây..."
              placeholderTextColor={C.muted}
              style={[s.descriptionInput, { color: C.text }]}
              textAlignVertical="top"
            />
          </View>

          <TextInput
            value={title}
            onChangeText={setTitle}
            maxLength={100}
            placeholder="Thêm tiêu đề"
            placeholderTextColor={C.muted}
            style={[s.titleInput, { color: C.text, backgroundColor: C.card, borderColor: C.border }]}
          />

          {renderDetailsRow({
            icon: selectedPrivacy.icon,
            title: 'Ai có thể xem nội dung này?',
            subtitle: selectedPrivacy.title,
            onPress: () => setPrivacyModalOpen(true),
          })}

          <View style={[s.inputRow, { borderColor: C.border }]}>
            <View style={[s.rowIcon, { backgroundColor: C.panel }]}>
              <Ionicons name="location-outline" size={24} color={C.text} />
            </View>
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="Vị trí"
              placeholderTextColor={C.muted}
              style={[s.rowInput, { color: C.text }]}
            />
            {location ? (
              <TouchableOpacity onPress={() => setLocation('')}>
                <Ionicons name="close-circle" size={20} color={C.muted} />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={[s.inputRow, { borderColor: C.border }]}>
            <View style={[s.rowIcon, { backgroundColor: C.panel }]}>
              <Ionicons name="pricetag-outline" size={24} color={C.text} />
            </View>
            <TextInput
              value={tagsInput}
              onChangeText={setTagsInput}
              placeholder="Thêm chủ đề hoặc hashtag"
              placeholderTextColor={C.muted}
              style={[s.rowInput, { color: C.text }]}
            />
          </View>

          {tags.length > 0 ? (
            <View style={s.tagWrap}>
              {tags.map((tag) => (
                <View key={tag} style={[s.tagPill, { backgroundColor: C.panel }]}>
                  <Text style={[s.tagText, { color: C.text }]}>#{tag}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {renderDetailsRow({
            icon: 'person-add-outline',
            title: 'Gắn thẻ người khác',
            subtitle: 'Sẽ cập nhật sau',
            onPress: () => unavailable('Gắn thẻ người khác'),
            disabled: true,
          })}

          <View style={[s.switchRow, { borderColor: C.border }]}>
            <View style={[s.rowIcon, { backgroundColor: C.panel }]}>
              <Ionicons name="chatbubble-outline" size={23} color={C.text} />
            </View>
            <View style={s.switchCopy}>
              <Text style={[s.rowTitle, { color: C.text }]}>Cho phép bình luận</Text>
              <Text style={[s.rowSub, { color: C.subtext }]}>Người xem có thể phản hồi clip của bạn.</Text>
            </View>
            <Switch value={allowComments} onValueChange={setAllowComments} />
          </View>

          <View style={[s.switchRow, { borderColor: C.border }]}>
            <View style={[s.rowIcon, { backgroundColor: C.panel }]}>
              <Ionicons name="sparkles-outline" size={23} color={C.text} />
            </View>
            <View style={s.switchCopy}>
              <Text style={[s.rowTitle, { color: C.text }]}>Thêm nhãn AI</Text>
              <Text style={[s.rowSub, { color: C.subtext }]}>Bật nếu clip có nội dung tạo bằng AI.</Text>
            </View>
            <Switch value={aiGenerated} onValueChange={setAiGenerated} />
          </View>

          {error ? (
            <View style={[s.errorBox, { borderColor: C.danger, backgroundColor: `${C.danger}12` }]}>
              <Ionicons name="warning-outline" size={18} color={C.danger} />
              <Text style={[s.errorText, { color: C.danger }]}>{error}</Text>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  };

  return (
    <SafeAreaView style={[s.root, { backgroundColor: step === 2 ? '#050505' : C.bg }]}>
      {step !== 2 && (
        <View style={[s.header, { backgroundColor: C.card, borderBottomColor: C.border }]}>
          <TouchableOpacity onPress={handleBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name={step === 1 ? 'close' : 'chevron-back'} size={28} color={C.text} />
          </TouchableOpacity>
          <View style={s.headerCenter}>
            <Text style={[s.headerTitle, { color: C.text }]}>{step === 1 ? 'Surf Video' : 'Thước phim mới'}</Text>
            <View style={s.stepDots}>
              {[1, 2, 3].map((dot) => (
                <View key={dot} style={[s.stepDot, { backgroundColor: dot <= step ? C.accent : C.border }]} />
              ))}
            </View>
          </View>
          {step === 3 ? (
            <TouchableOpacity
              style={[s.shareBtn, { backgroundColor: asset && !uploading ? C.accent : C.border }]}
              onPress={handleSubmit}
              disabled={!asset || uploading}
            >
              {uploading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.shareText}>Chia sẻ</Text>}
            </TouchableOpacity>
          ) : (
            <View style={s.headerSpacer} />
          )}
        </View>
      )}

      {uploading && (
        <View style={[s.progressBar, { backgroundColor: C.border }]}>
          <View style={[s.progressFillUpload, { backgroundColor: C.accent, width: `${progress}%` as `${number}%` }]} />
        </View>
      )}

      {step === 1 ? renderStepOne() : null}
      {step === 2 ? renderStepTwo() : null}
      {step === 3 ? renderStepThree() : null}

      {step === 3 && (
        <View style={[s.bottomBar, { backgroundColor: C.card, borderTopColor: C.border }]}>
          <TouchableOpacity style={[s.draftBtn, { backgroundColor: C.panel }]} onPress={() => unavailable('Lưu bản nháp')}>
            <Ionicons name="download-outline" size={22} color={C.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.bottomShareBtn, { backgroundColor: asset && !uploading ? C.accent : C.border }]}
            onPress={handleSubmit}
            disabled={!asset || uploading}
          >
            {uploading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.bottomShareText}>Chia sẻ ngay</Text>}
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={privacyModalOpen} transparent animationType="slide" onRequestClose={() => setPrivacyModalOpen(false)}>
        <View style={s.modalBackdrop}>
          <TouchableOpacity style={s.modalScrim} activeOpacity={1} onPress={() => setPrivacyModalOpen(false)} />
          <View style={[s.privacySheet, { backgroundColor: C.card }]}>
            <View style={[s.sheetHandle, { backgroundColor: C.border }]} />
            <Text style={[s.sheetTitle, { color: C.text }]}>Ai có thể xem?</Text>
            {PRIVACY_OPTIONS.map((item) => {
              const active = privacy === item.value;
              return (
                <TouchableOpacity
                  key={item.value}
                  style={[s.privacyOption, { borderColor: C.border }]}
                  onPress={() => {
                    setPrivacy(item.value);
                    setPrivacyModalOpen(false);
                  }}
                >
                  <View style={[s.rowIcon, { backgroundColor: C.panel }]}>
                    <Ionicons name={item.icon} size={24} color={C.text} />
                  </View>
                  <View style={s.rowCopy}>
                    <Text style={[s.rowTitle, { color: C.text }]}>{item.title}</Text>
                    <Text style={[s.rowSub, { color: C.subtext }]}>{item.subtitle}</Text>
                  </View>
                  {active ? <Ionicons name="checkmark-circle" size={24} color={C.accent} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  headerCenter: { alignItems: 'center', gap: 7 },
  headerTitle: { fontSize: 21, fontWeight: '900' },
  headerSpacer: { width: 72 },
  stepDots: { flexDirection: 'row', gap: 5 },
  stepDot: { width: 20, height: 3, borderRadius: 2 },
  shareBtn: { minWidth: 74, minHeight: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  shareText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  progressBar: { height: 3, width: '100%' },
  progressFillUpload: { height: 3 },

  selectWrap: { flex: 1, padding: 20, justifyContent: 'center', gap: 14 },
  selectHero: { borderWidth: 1, borderRadius: 8, padding: 24, alignItems: 'center', gap: 12, marginBottom: 10 },
  selectIcon: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  selectTitle: { fontSize: 24, fontWeight: '900', textAlign: 'center' },
  selectSub: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  sourceBtn: { minHeight: 54, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  sourceText: { fontSize: 16, fontWeight: '900' },

  previewScreen: { flex: 1, backgroundColor: '#050505' },
  previewStage: { flex: 1, backgroundColor: '#050505' },
  previewTop: {
    position: 'absolute',
    top: 12,
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  roundDarkBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.38)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  soundPill: {
    flex: 1,
    height: 66,
    borderRadius: 33,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: 'rgba(36,36,40,0.74)',
  },
  soundIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  soundTitle: { color: '#fff', fontSize: 18, fontWeight: '900' },
  soundSub: { color: '#fff', fontSize: 14, opacity: 0.84, marginTop: 1 },
  clearTextBtn: {
    position: 'absolute',
    right: 14,
    bottom: 18,
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.46)',
  },
  clearText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  toolsDock: {
    minHeight: 118,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#050505',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.18)',
  },
  toolBtn: { flex: 1, minWidth: 0, alignItems: 'center', gap: 7 },
  toolIcon: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: '#242428' },
  toolIconDisabled: { opacity: 0.75 },
  toolText: { color: '#fff', fontSize: 12, fontWeight: '800', textAlign: 'center' },
  toolTextDisabled: { color: '#8b8b92' },
  nextCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginLeft: 4 },

  editorPanel: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 126,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    gap: 12,
  },
  panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  panelTitle: { fontSize: 17, fontWeight: '900' },
  iconOnlyBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  textDraftInput: { minHeight: 48, borderWidth: 1, borderRadius: 8, paddingHorizontal: 13, fontSize: 15 },
  swatchRow: { flexDirection: 'row', gap: 10 },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 3 },
  segmentRow: { flexDirection: 'row', gap: 8 },
  segmentBtn: { flex: 1, minHeight: 40, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  segmentText: { fontSize: 13, fontWeight: '900' },
  panelPrimaryBtn: { minHeight: 46, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  panelPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '900' },

  overlayLayer: { position: 'absolute', left: 24, right: 24, alignItems: 'center' },
  overlayText: {
    fontWeight: '900',
    textAlign: 'center',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },

  detailsContent: { paddingBottom: 112 },
  composeTop: { flexDirection: 'row', gap: 16, padding: 20, alignItems: 'flex-start' },
  thumb: { width: 96, height: 150, borderRadius: 8, overflow: 'hidden', backgroundColor: '#050505' },
  descriptionInput: { flex: 1, minHeight: 146, fontSize: 24, lineHeight: 31, paddingTop: 4 },
  titleInput: { marginHorizontal: 20, minHeight: 48, borderRadius: 8, borderWidth: 1, paddingHorizontal: 14, fontSize: 16, fontWeight: '800' },
  detailsRow: { minHeight: 76, borderTopWidth: 1, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 14 },
  inputRow: { minHeight: 76, borderTopWidth: 1, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 14 },
  rowIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 17, fontWeight: '900' },
  rowSub: { fontSize: 14, lineHeight: 19 },
  rowInput: { flex: 1, fontSize: 17, fontWeight: '800', minHeight: 52 },
  switchRow: { minHeight: 82, borderTopWidth: 1, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 14 },
  switchCopy: { flex: 1, gap: 3 },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, paddingBottom: 12 },
  tagPill: { minHeight: 32, borderRadius: 16, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  tagText: { fontSize: 13, fontWeight: '800' },
  errorBox: { margin: 20, borderWidth: 1, borderRadius: 8, padding: 12, flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  errorText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '700' },

  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 78,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
    flexDirection: 'row',
    gap: 12,
  },
  draftBtn: { width: 58, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  bottomShareBtn: { flex: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  bottomShareText: { color: '#fff', fontSize: 18, fontWeight: '900' },

  modalBackdrop: { flex: 1, justifyContent: 'flex-end' },
  modalScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.46)' },
  privacySheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 24 },
  sheetHandle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, marginBottom: 14 },
  sheetTitle: { fontSize: 20, fontWeight: '900', marginBottom: 8 },
  privacyOption: { minHeight: 72, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
});
