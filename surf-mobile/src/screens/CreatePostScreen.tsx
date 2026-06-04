import React, { useEffect, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { isVideoAsset, uploadImage, uploadVideo } from '@/lib/cloudinary';

import {
  View,
  Text,
  Modal,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import type { TextStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '@/navigation';
import { useUserStore } from '@/stores/userStore';
import { useAuthStore } from '@/stores/authStore';
import { useFeedStore, type FeedPost } from '@/stores/feedStore';
import { api } from '@/lib/api';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'CreatePost'>;
  route: RouteProp<RootStackParamList, 'CreatePost'>;
};

type Privacy = 'public' | 'friends' | 'only-me' | 'custom';
type PickedAsset = ImagePicker.ImagePickerAsset;
type TextFontKey = 'system' | 'serif' | 'rounded' | 'bold' | 'mono';

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
  'public': 'C\u00f4ng khai',
  'friends': 'B\u1ea1n b\u00e8',
  'only-me': 'Ch\u1ec9 m\u00ecnh t\u00f4i',
  'custom': 'T\u00f9y ch\u1ec9nh',
};
const PRIVACY_ICONS: Record<Privacy, keyof typeof Ionicons.glyphMap> = {
  'public': 'earth-outline',
  'friends': 'people-outline',
  'only-me': 'lock-closed-outline',
  'custom': 'settings-outline',
};

const FEELINGS = [
  { emoji: '\u{1F60A}', label: 'Vui v\u1ebb' },
  { emoji: '\u{1F60D}', label: 'Y\u00eau th\u00edch' },
  { emoji: '\u{1F60E}', label: 'Ng\u1ea7u' },
  { emoji: '\u{1F622}', label: 'Bu\u1ed3n' },
  { emoji: '\u{1F621}', label: 'Gi\u1eadn d\u1eef' },
  { emoji: '\u{1F973}', label: 'H\u00e0o h\u1ee9ng' },
  { emoji: '\u{1F634}', label: 'M\u1ec7t m\u1ecfi' },
  { emoji: '\u{1F914}', label: 'Suy ngh\u0129' },
  { emoji: '\u{1F970}', label: 'Bi\u1ebft \u01a1n' },
  { emoji: '\u{1F624}', label: 'T\u1ef1 h\u00e0o' },
];

const TEXT_FONT_OPTIONS: Array<{ key: TextFontKey; label: string; style: TextStyle }> = [
  { key: 'system', label: 'C\u01a1 b\u1ea3n', style: {} },
  {
    key: 'serif',
    label: 'Serif',
    style: { fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }) },
  },
  {
    key: 'rounded',
    label: 'M\u1ec1m',
    style: {
      fontFamily: Platform.select({ ios: 'Avenir Next', android: 'sans-serif-medium', default: undefined }),
      fontWeight: '700',
    },
  },
  { key: 'bold', label: '\u0110\u1eadm', style: { fontWeight: '900' } },
  {
    key: 'mono',
    label: 'Mono',
    style: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) },
  },
];

const TEXT_COLORS = [
  '#0f172a',
  '#f8fafc',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
];

function getPostTextStyle(font: TextFontKey, color: string): TextStyle {
  const fontStyle = TEXT_FONT_OPTIONS.find((item) => item.key === font)?.style ?? {};
  return { ...fontStyle, color };
}

export default function CreatePostScreen({ navigation, route }: Props) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;
  const groupId = route.params?.groupId;
  const groupName = route.params?.groupName;

  const { profile, fetchProfile } = useUserStore();
  const { user } = useAuthStore();
  const refreshFeed = useFeedStore((s) => s.fetch);
  const addFeedPost = useFeedStore((s) => s.addPost);

  const [content, setContent] = useState('');
  const [isTextEditorOpen, setIsTextEditorOpen] = useState(false);
  const [textFont, setTextFont] = useState<TextFontKey>('system');
  const [textColor, setTextColor] = useState(() => (scheme === 'dark' ? '#f8fafc' : '#0f172a'));
  const [textFontChanged, setTextFontChanged] = useState(false);
  const [textColorChanged, setTextColorChanged] = useState(false);
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
  const [showTextTools, setShowTextTools] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const textInputRef = useRef<TextInput>(null);
  const editorAnim = useRef(new Animated.Value(0)).current;

  const selectedTextStyle = getPostTextStyle(textFont, textColor);
  const displayName = profile?.displayName || user?.displayName || user?.email || 'U';
  const avatarUrl = profile?.photoURL || user?.photoURL || '';

  useEffect(() => {
    if (!profile) {
      fetchProfile();
    } else {
      setPrivacy((profile.defaultPostPrivacy as Privacy) || 'public');
    }
  }, [profile, fetchProfile]);

  useEffect(() => {
    if (!isTextEditorOpen) return;
    editorAnim.setValue(0);
    Animated.timing(editorAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    const timer = setTimeout(() => textInputRef.current?.focus(), 80);
    return () => clearTimeout(timer);
  }, [editorAnim, isTextEditorOpen]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const canSubmit = content.trim().length > 0 || assets.length > 0;

  const pickFromGallery = async () => {
    const granted = await ensureLibraryPermission();
    if (!granted) {
      Alert.alert('Quy\u1ec1n truy c\u1eadp', 'C\u1ea7n quy\u1ec1n truy c\u1eadp th\u01b0 vi\u1ec7n \u1ea3nh \u0111\u1ec3 ch\u1ecdn media.');
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
      Alert.alert('Quy\u1ec1n truy c\u1eadp', 'C\u1ea7n quy\u1ec1n truy c\u1eadp camera \u0111\u1ec3 ch\u1ee5p \u1ea3nh.');
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
      const textStylePayload = {
        ...(textFontChanged ? { font: textFont } : {}),
        ...(textColorChanged ? { color: textColor } : {}),
      };
      const created = await api.post<FeedPost>(endpoint, {
        content: content.trim(),
        mediaUrls,
        feeling: feeling || null,
        location: location.trim() || null,
        privacy: groupId ? 'group' : privacy,
        textStyle: content.trim() && Object.keys(textStylePayload).length > 0 ? textStylePayload : null,
      });
      if (!groupId && created?.id) {
        addFeedPost(created);
        void refreshFeed(true);
      }
      navigation.goBack();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Kh\u00f4ng th\u1ec3 \u0111\u0103ng b\u00e0i. Vui l\u00f2ng th\u1eed l\u1ea1i!';
      setError(msg);
    } finally {
      setSubmitting(false);
      setUploadProgress(0);
    }
  };

  const openTextEditor = () => {
    setShowFeelingPicker(false);
    setShowLocationInput(false);
    setShowTextTools(false);
    setIsTextEditorOpen(true);
  };

  const closeTextEditor = () => {
    Keyboard.dismiss();
    setShowTextTools(false);
    setIsTextEditorOpen(false);
  };

  const toggleTextTools = () => {
    setShowTextTools((value) => !value);
    requestAnimationFrame(() => textInputRef.current?.focus());
  };

  if (isTextEditorOpen) {
    const editorTranslateY = editorAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [28, 0],
    });
    const floatingBottom = Math.max(keyboardHeight, 0) + 22;

    return (
      <SafeAreaView style={[s.root, { backgroundColor: C.bg }]}>
        <View style={[s.editorHeader, { borderBottomColor: C.border, backgroundColor: C.card }]}>
          <View style={s.editorHeaderSide} />
          <Text style={[s.editorTitle, { color: C.text }]}>{'Nh\u1eadp v\u0103n b\u1ea3n'}</Text>
          <TouchableOpacity onPress={closeTextEditor} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={[s.doneText, { color: C.accent }]}>Xong</Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Animated.View
            style={[
              s.editorCanvas,
              {
                backgroundColor: C.bg,
                opacity: editorAnim,
                transform: [{ translateY: editorTranslateY }],
              },
            ]}
          >
            <TextInput
              ref={textInputRef}
              style={[s.editorInput, selectedTextStyle]}
              placeholder={'B\u1ea1n \u0111ang ngh\u0129 g\u00ec?'}
              placeholderTextColor={content.trim() ? C.muted : textColor}
              multiline
              value={content}
              onChangeText={setContent}
              textAlignVertical="top"
              selectionColor={textColorChanged ? textColor : C.accent}
            />
          </Animated.View>
        </KeyboardAvoidingView>

        {showTextTools && (
          <View
            style={[
              s.textToolsFloating,
              {
                bottom: floatingBottom + 68,
                borderColor: C.border,
                backgroundColor: C.card,
              },
            ]}
          >
            <Text style={[s.toolLabel, { color: C.subtext }]}>{'Font ch\u1eef'}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.fontRow}
              keyboardShouldPersistTaps="always"
            >
              {TEXT_FONT_OPTIONS.map((font) => {
                const active = textFont === font.key;
                return (
                  <TouchableOpacity
                    key={font.key}
                    style={[
                      s.fontChip,
                      {
                        borderColor: active ? C.accent : C.border,
                        backgroundColor: active ? `${C.accent}22` : C.panel,
                      },
                    ]}
                    onPressIn={() => {
                      setTextFont(font.key);
                      setTextFontChanged(font.key !== 'system');
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.fontChipText, font.style, { color: active ? C.accent : C.text }]}>
                      {font.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Text style={[s.toolLabel, { color: C.subtext, marginTop: 12 }]}>{'M\u00e0u ch\u1eef'}</Text>
            <View style={s.colorRow}>
              {TEXT_COLORS.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[
                    s.colorSwatch,
                    {
                      backgroundColor: color,
                      borderColor: textColor === color ? C.accent : C.border,
                      transform: [{ scale: textColor === color ? 1.12 : 1 }],
                    },
                  ]}
                  onPressIn={() => {
                    setTextColor(color);
                    setTextColorChanged(true);
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.8}
                >
                  {textColor === color ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[
            s.textStyleButton,
            {
              bottom: floatingBottom,
              backgroundColor: C.card,
              borderColor: C.border,
            },
          ]}
          onPress={toggleTextTools}
          activeOpacity={0.85}
        >
          <Text style={[s.textStyleButtonText, selectedTextStyle]}>A</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: C.border, backgroundColor: C.card }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={26} color={C.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: C.text }]} numberOfLines={1}>
          {groupName ? `\u0110\u0103ng v\u00e0o ${groupName}` : 'T\u1ea1o b\u00e0i vi\u1ebft'}
        </Text>
        <TouchableOpacity
          style={[
            s.postIconBtn,
            {
              backgroundColor: canSubmit && !submitting ? C.accent : C.border,
              opacity: canSubmit && !submitting ? 1 : 0.45,
            },
          ]}
          disabled={!canSubmit || submitting}
          onPress={handlePost}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="water-outline" size={22} color="#fff" />
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
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
          {/* User row */}
          <View style={s.userRow}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={s.avatar} />
            ) : (
              <View style={[s.avatar, { backgroundColor: C.accent }]}>
                <Text style={s.avatarText}>{displayName[0].toUpperCase()}</Text>
              </View>
            )}
            <View style={{ marginLeft: 10 }}>
              <Text style={[s.name, { color: C.text }]}>
                {profile?.displayName || user?.displayName || 'Ng\u01b0\u1eddi d\u00f9ng'}
                {feeling ? <Text style={{ color: C.subtext, fontWeight: '400' }}> {'\u0111ang c\u1ea3m th\u1ea5y'} {feeling}</Text> : null}
                {location ? <Text style={{ color: C.subtext, fontWeight: '400' }}> {'t\u1ea1i \u{1F4CD}'}{location}</Text> : null}
              </Text>
              <TouchableOpacity
                style={[s.privacyBtn, { borderColor: C.border }]}
                onPress={() => !groupId && setShowPrivacyModal(true)}
                disabled={Boolean(groupId)}
              >
                <Ionicons name={groupId ? 'people-outline' : PRIVACY_ICONS[privacy]} size={13} color={C.accent} />
                <Text style={[s.privacyText, { color: C.accent }]} numberOfLines={1}>
                  {groupName ? `Nh\u00f3m: ${groupName}` : PRIVACY_LABELS[privacy]}
                </Text>
                {!groupId && <Ionicons name="caret-down" size={11} color={C.accent} />}
              </TouchableOpacity>
            </View>
          </View>

          <View style={s.quickActionRow}>
            <TouchableOpacity
              style={[
                s.quickActionChip,
                {
                  borderColor: showLocationInput || location ? C.accent : C.border,
                  backgroundColor: showLocationInput || location ? `${C.accent}18` : C.panel,
                },
              ]}
              onPress={() => { setShowLocationInput((v) => !v); setShowFeelingPicker(false); }}
              activeOpacity={0.85}
            >
              <Ionicons name="location-outline" size={18} color={showLocationInput || location ? C.accent : C.subtext} />
              <Text style={[s.quickActionText, { color: showLocationInput || location ? C.accent : C.text }]} numberOfLines={1}>
                {location || 'V\u1ecb tr\u00ed'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                s.quickActionChip,
                {
                  borderColor: showFeelingPicker || feeling ? C.accent : C.border,
                  backgroundColor: showFeelingPicker || feeling ? `${C.accent}18` : C.panel,
                },
              ]}
              onPress={() => { setShowFeelingPicker((v) => !v); setShowLocationInput(false); }}
              activeOpacity={0.85}
            >
              <Ionicons name="happy-outline" size={18} color={showFeelingPicker || feeling ? C.accent : C.subtext} />
              <Text style={[s.quickActionText, { color: showFeelingPicker || feeling ? C.accent : C.text }]} numberOfLines={1}>
                {feeling || 'C\u1ea3m x\u00fac'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Text input */}
          <TouchableOpacity
            style={[
              s.composerPreview,
              assets.length === 0 && s.composerPreviewExpanded,
              { borderColor: content.trim() ? C.border : 'transparent' },
            ]}
            onPress={openTextEditor}
            activeOpacity={0.85}
          >
            {content.trim() ? (
              <Text style={[s.previewText, selectedTextStyle]}>{content}</Text>
            ) : (
              <Text style={[s.previewPlaceholder, { color: C.muted }]}>{'B\u1ea1n \u0111ang ngh\u0129 g\u00ec?'}</Text>
            )}
          </TouchableOpacity>

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
                placeholder={'Nh\u1eadp v\u1ecb tr\u00ed...'}
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

        {/* Media actions */}
        <View style={[s.mediaActionBar, { borderTopColor: C.border, backgroundColor: C.card }]}>
          <TouchableOpacity style={[s.mediaActionBtn, { backgroundColor: C.panel }]} onPress={pickFromGallery} activeOpacity={0.85}>
            <Ionicons name="images-outline" size={22} color="#22c55e" />
            <Text style={[s.mediaActionLabel, { color: C.text }]}>{'\u1ea2nh/Video'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.mediaActionBtn, { backgroundColor: C.panel }]} onPress={captureWithCamera} activeOpacity={0.85}>
            <Ionicons name="camera-outline" size={22} color="#f59e0b" />
            <Text style={[s.mediaActionLabel, { color: C.text }]}>Camera</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Privacy Modal */}
      <Modal visible={!groupId && showPrivacyModal} transparent animationType="slide">
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowPrivacyModal(false)}>
          <View style={[s.modalContent, { backgroundColor: C.card }]}>
            <Text style={[s.modalTitle, { color: C.text }]}>{'\u0110\u1ed1i t\u01b0\u1ee3ng c\u1ee7a b\u00e0i vi\u1ebft'}</Text>
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
  postIconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  quickActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  quickActionChip: {
    minHeight: 36,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    maxWidth: '48%',
  },
  quickActionText: { flexShrink: 1, fontSize: 12, fontWeight: '700' },
  composerPreview: {
    minHeight: 120,
    marginHorizontal: 16,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: 'flex-start',
  },
  composerPreviewExpanded: { flex: 1, minHeight: 280 },
  previewText: { fontSize: 18, lineHeight: 26 },
  previewPlaceholder: { fontSize: 18, lineHeight: 26 },
  editorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  editorHeaderSide: { width: 56 },
  editorTitle: { flex: 1, marginHorizontal: 12, textAlign: 'center', fontSize: 22, fontWeight: '800' },
  doneText: { fontSize: 16, fontWeight: '800' },
  editorCanvas: { flex: 1, paddingHorizontal: 24, paddingTop: 52 },
  editorInput: {
    flex: 1,
    fontSize: 30,
    lineHeight: 38,
    textAlignVertical: 'top',
    padding: 0,
  },
  textToolsFloating: {
    position: 'absolute',
    left: 18,
    right: 18,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  toolLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  fontRow: { gap: 10, paddingTop: 10, paddingBottom: 4 },
  fontChip: {
    minWidth: 86,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fontChipText: { fontSize: 15, fontWeight: '700' },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 12 },
  colorSwatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textStyleButton: {
    position: 'absolute',
    alignSelf: 'center',
    width: 96,
    height: 58,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  textStyleButtonText: {
    fontSize: 31,
    lineHeight: 36,
    fontWeight: '900',
    color: '#8b5cf6',
  },
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
  mediaActionBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  mediaActionBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  mediaActionLabel: { fontSize: 13, fontWeight: '800' },
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

