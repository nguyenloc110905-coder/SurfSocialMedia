import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '@/navigation';
import { api } from '@/lib/api';
import { uploadImage } from '@/lib/cloudinary';
import { useUserStore } from '@/stores/userStore';
import { useFeedStore, type FeedPost } from '@/stores/feedStore';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'ProfilePhotoPicker'>;
  route: RouteProp<RootStackParamList, 'ProfilePhotoPicker'>;
};

type PostedPhoto = { id: string; uri: string };
type Privacy = 'public' | 'friends' | 'only-me' | 'custom';

const PRIVACY_LABELS: Record<Privacy, string> = {
  public: 'Công khai',
  friends: 'Bạn bè',
  'only-me': 'Chỉ mình tôi',
  custom: 'Tùy chỉnh',
};

const PRIVACY_DESCRIPTIONS: Record<Privacy, string> = {
  public: 'Mọi người có thể xem bài viết này.',
  friends: 'Chỉ bạn bè của bạn có thể xem.',
  'only-me': 'Chỉ hiển thị với bạn.',
  custom: 'Dùng tuỳ chọn quyền riêng tư nâng cao.',
};

const PRIVACY_ICONS: Record<Privacy, keyof typeof Ionicons.glyphMap> = {
  public: 'earth-outline',
  friends: 'people-outline',
  'only-me': 'lock-closed-outline',
  custom: 'settings-outline',
};

const DARK = {
  bg: '#0b1120',
  card: '#111827',
  softCard: '#162033',
  border: '#243044',
  text: '#f8fafc',
  subtext: '#94a3b8',
  accent: '#1877f2',
};

const LIGHT = {
  bg: '#ffffff',
  card: '#ffffff',
  softCard: '#f1f5f9',
  border: '#e5e7eb',
  text: '#050505',
  subtext: '#65676b',
  accent: '#1877f2',
};

function isVideoUrl(url: string) {
  return url.includes('/video/upload/') || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url);
}

function firstImage(post: FeedPost) {
  return post.mediaUrls?.find((url) => !isVideoUrl(url)) ?? null;
}

async function ensureCameraPermission() {
  const current = await ImagePicker.getCameraPermissionsAsync();
  if (current.granted) return true;
  const next = await ImagePicker.requestCameraPermissionsAsync();
  return next.granted;
}

async function ensureLibraryPermission() {
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted) return true;
  const next = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return next.granted;
}

export default function ProfilePhotoPickerScreen({ navigation, route }: Props) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const mode = route.params.mode;
  const { profile, fetchProfile, updateProfile } = useUserStore();
  const addPost = useFeedStore((state) => state.addPost);

  const [postedPhotos, setPostedPhotos] = useState<PostedPhoto[]>([]);
  const [loading, setLoading] = useState(mode === 'coverPosted');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [caption, setCaption] = useState('');
  const [privacy, setPrivacy] = useState<Privacy>((profile?.defaultPostPrivacy as Privacy) || 'public');
  const [postToFeed, setPostToFeed] = useState(true);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);

  const isAvatar = mode === 'avatarUpload';
  const isPostedCover = mode === 'coverPosted';
  const tile = Math.floor((width - 4) / 3);
  const headerTitle = selectedAsset ? 'Xem trước' : isAvatar ? 'Chọn ảnh đại diện' : isPostedCover ? 'Chọn ảnh bìa' : 'Tải ảnh bìa';
  const targetLabel = isAvatar ? 'ảnh đại diện' : 'ảnh bìa';
  const previewUri = isAvatar ? profile?.photoURL : profile?.coverImageUrl || profile?.photoURL;

  useEffect(() => {
    if (!profile) {
      fetchProfile();
    } else if (profile.defaultPostPrivacy) {
      setPrivacy(profile.defaultPostPrivacy as Privacy);
    }
  }, [fetchProfile, profile]);

  const loadPostedPhotos = useCallback(async () => {
    if (!isPostedCover || !profile?.id) return;
    setLoading(true);
    try {
      const data = await api.get<{ posts: FeedPost[] }>(`/api/users/${profile.id}/posts`);
      const photos = (data.posts ?? [])
        .map(firstImage)
        .filter((url): url is string => Boolean(url))
        .map((uri, index) => ({ id: `${uri}-${index}`, uri }));
      setPostedPhotos(photos);
    } catch {
      setPostedPhotos([]);
    } finally {
      setLoading(false);
    }
  }, [isPostedCover, profile?.id]);

  useEffect(() => {
    loadPostedPhotos();
  }, [loadPostedPhotos]);

  const beginCompose = (asset: ImagePicker.ImagePickerAsset) => {
    if (savingId) return;
    setSelectedAsset(asset);
  };

  const submitProfilePhoto = async () => {
    if (!selectedAsset || savingId) return;
    setSavingId('submit');
    try {
      const url = await uploadImage(selectedAsset, { folder: isAvatar ? 'surf/avatars' : 'surf/profile-covers' });
      await updateProfile(isAvatar ? { photoURL: url } : { coverImageUrl: url });
      if (postToFeed) {
        const content = caption.trim() || `đã cập nhật ${targetLabel}.`;
        const created = await api.post<FeedPost>('/api/posts', {
          content,
          mediaUrls: [url],
          privacy,
          feeling: null,
          location: null,
        });
        addPost(created);
      }
      navigation.goBack();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ảnh chưa được cập nhật. Vui lòng thử lại.';
      Alert.alert('Cập nhật thất bại', message);
    } finally {
      setSavingId(null);
    }
  };

  const chooseFromLibrary = async () => {
    if (savingId) return;
    const granted = await ensureLibraryPermission();
    if (!granted) {
      Alert.alert('Cần quyền truy cập ảnh', 'Hãy cấp quyền thư viện ảnh để chọn ảnh từ máy.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: isAvatar ? [1, 1] : [16, 9],
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.[0]) return;
    beginCompose(result.assets[0]);
  };

  const captureFromCamera = async () => {
    if (savingId) return;
    const granted = await ensureCameraPermission();
    if (!granted) {
      Alert.alert('Cần quyền camera', 'Hãy cấp quyền camera để chụp ảnh.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: isAvatar ? [1, 1] : [16, 9],
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.[0]) return;
    beginCompose(result.assets[0]);
  };

  const choosePostedCover = async (photo: PostedPhoto) => {
    if (savingId) return;
    setSavingId(photo.id);
    try {
      await updateProfile({ coverImageUrl: photo.uri });
      navigation.goBack();
    } catch {
      Alert.alert('Chưa thể cập nhật', 'Vui lòng thử lại sau.');
    } finally {
      setSavingId(null);
    }
  };

  const renderHeader = () => (
    <View style={[s.header, { backgroundColor: C.card, borderBottomColor: C.border }]}>
      <TouchableOpacity
        onPress={() => selectedAsset ? setSelectedAsset(null) : navigation.goBack()}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="chevron-back" size={30} color={C.text} />
      </TouchableOpacity>
      <Text style={[s.title, { color: C.text }]} numberOfLines={1}>{headerTitle}</Text>
      {selectedAsset ? (
        <TouchableOpacity
          style={[s.saveBtn, { backgroundColor: C.accent }]}
          onPress={submitProfilePhoto}
          disabled={savingId === 'submit'}
          activeOpacity={0.85}
        >
          {savingId === 'submit' ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.saveText}>Lưu</Text>}
        </TouchableOpacity>
      ) : (
        <View style={{ width: 30 }} />
      )}
    </View>
  );

  const renderAction = ({
    icon,
    title,
    subtitle,
    onPress,
    savingKey,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    subtitle: string;
    onPress: () => void;
    savingKey: string;
  }) => (
    <TouchableOpacity
      style={[s.actionRow, { backgroundColor: C.card, borderColor: C.border }]}
      onPress={onPress}
      activeOpacity={0.86}
      disabled={Boolean(savingId)}
    >
      <View style={[s.actionIcon, { backgroundColor: C.softCard }]}>
        {savingId === savingKey ? (
          <ActivityIndicator color={C.accent} />
        ) : (
          <Ionicons name={icon} size={24} color={C.text} />
        )}
      </View>
      <View style={s.actionText}>
        <Text style={[s.actionTitle, { color: C.text }]}>{title}</Text>
        <Text style={[s.actionSub, { color: C.subtext }]}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={22} color={C.subtext} />
    </TouchableOpacity>
  );

  const renderUploadChoices = () => (
    <ScrollView
      contentContainerStyle={[s.choiceContent, { paddingBottom: insets.bottom + 28 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[s.previewWrap, isAvatar ? s.avatarPreviewWrap : s.coverPreviewWrap, { backgroundColor: C.softCard }]}>
        {previewUri ? (
          <Image source={{ uri: previewUri }} style={s.previewImage} />
        ) : (
          <Ionicons name="image-outline" size={42} color={C.subtext} />
        )}
      </View>

      <View style={s.choiceTitleBlock}>
        <Text style={[s.choiceTitle, { color: C.text }]}>Cập nhật {targetLabel}</Text>
        <Text style={[s.choiceSub, { color: C.subtext }]}>Chọn ảnh có sẵn trong máy hoặc chụp ảnh mới.</Text>
      </View>

      <View style={s.actions}>
        {renderAction({
          icon: 'images-outline',
          title: 'Chọn từ thư viện máy',
          subtitle: 'Mở thư viện ảnh của thiết bị',
          onPress: chooseFromLibrary,
          savingKey: 'library',
        })}
        {renderAction({
          icon: 'camera-outline',
          title: 'Chụp ảnh',
          subtitle: 'Mở camera và dùng ảnh vừa chụp',
          onPress: captureFromCamera,
          savingKey: 'camera',
        })}
      </View>
    </ScrollView>
  );

  const renderComposeStep = () => (
    <ScrollView
      contentContainerStyle={[s.composeContent, { paddingBottom: insets.bottom + 28 }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={[s.composePreview, isAvatar ? s.composeAvatarPreview : s.composeCoverPreview, { backgroundColor: C.softCard }]}>
        {selectedAsset ? (
          <Image source={{ uri: selectedAsset.uri }} style={s.previewImage} />
        ) : null}
      </View>

      <TextInput
        style={[s.captionInput, { color: C.text, borderColor: C.border, backgroundColor: C.card }]}
        placeholder={`Viết chú thích cho ${targetLabel}...`}
        placeholderTextColor={C.subtext}
        value={caption}
        onChangeText={setCaption}
        multiline
        maxLength={500}
        textAlignVertical="top"
      />

      <TouchableOpacity
        style={[s.settingRow, { backgroundColor: C.card, borderColor: C.border }]}
        onPress={() => setPrivacyModalOpen(true)}
        activeOpacity={0.85}
      >
        <View style={[s.settingIcon, { backgroundColor: C.softCard }]}>
          <Ionicons name={PRIVACY_ICONS[privacy]} size={21} color={C.text} />
        </View>
        <View style={s.settingText}>
          <Text style={[s.settingTitle, { color: C.text }]}>Quyền riêng tư</Text>
          <Text style={[s.settingSub, { color: C.subtext }]}>{PRIVACY_LABELS[privacy]} · {PRIVACY_DESCRIPTIONS[privacy]}</Text>
        </View>
        <Ionicons name="chevron-forward" size={21} color={C.subtext} />
      </TouchableOpacity>

      <View style={[s.settingRow, { backgroundColor: C.card, borderColor: C.border }]}>
        <View style={[s.settingIcon, { backgroundColor: C.softCard }]}>
          <Ionicons name="newspaper-outline" size={21} color={C.text} />
        </View>
        <View style={s.settingText}>
          <Text style={[s.settingTitle, { color: C.text }]}>Đăng lên bảng tin</Text>
          <Text style={[s.settingSub, { color: C.subtext }]}>
            {postToFeed ? 'Bạn và người khác có thể thấy, tương tác như bài viết.' : 'Chỉ cập nhật trên trang cá nhân, không tạo bài viết mới.'}
          </Text>
        </View>
        <Switch
          value={postToFeed}
          onValueChange={setPostToFeed}
          trackColor={{ false: C.border, true: C.accent }}
          thumbColor="#fff"
        />
      </View>

      <TouchableOpacity
        style={[s.primaryBtn, { backgroundColor: C.accent, opacity: savingId === 'submit' ? 0.72 : 1 }]}
        onPress={submitProfilePhoto}
        activeOpacity={0.86}
        disabled={savingId === 'submit'}
      >
        {savingId === 'submit' ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={s.primaryText}>{postToFeed ? 'Lưu và đăng' : 'Lưu thay đổi'}</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );

  const renderPrivacyModal = () => (
    <Modal visible={privacyModalOpen} transparent animationType="slide" onRequestClose={() => setPrivacyModalOpen(false)}>
      <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setPrivacyModalOpen(false)}>
        <View style={[s.modalContent, { backgroundColor: C.card }]}>
          <View style={s.modalHandle} />
          <Text style={[s.modalTitle, { color: C.text }]}>Ai có thể xem cập nhật này?</Text>
          {(Object.keys(PRIVACY_LABELS) as Privacy[]).map((key) => (
            <TouchableOpacity
              key={key}
              style={[s.privacyRow, { borderTopColor: C.border }]}
              onPress={() => {
                setPrivacy(key);
                setPrivacyModalOpen(false);
              }}
              activeOpacity={0.86}
            >
              <View style={[s.settingIcon, { backgroundColor: C.softCard }]}>
                <Ionicons name={PRIVACY_ICONS[key]} size={21} color={C.text} />
              </View>
              <View style={s.settingText}>
                <Text style={[s.settingTitle, { color: C.text }]}>{PRIVACY_LABELS[key]}</Text>
                <Text style={[s.settingSub, { color: C.subtext }]}>{PRIVACY_DESCRIPTIONS[key]}</Text>
              </View>
              {privacy === key ? <Ionicons name="checkmark" size={24} color={C.accent} /> : null}
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );

  const renderPostedPhoto = ({ item }: { item: PostedPhoto }) => (
    <TouchableOpacity
      style={{ width: tile, height: tile }}
      onPress={() => choosePostedCover(item)}
      activeOpacity={0.82}
      disabled={Boolean(savingId)}
    >
      <Image source={{ uri: item.uri }} style={s.gridImage} />
      {savingId === item.id ? (
        <View style={s.savingOverlay}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : null}
    </TouchableOpacity>
  );

  const renderPostedEmpty = () => {
    if (loading) {
      return <ActivityIndicator color={C.accent} style={{ marginTop: 48 }} />;
    }
    return (
      <View style={s.empty}>
        <Ionicons name="images-outline" size={44} color={C.subtext} />
        <Text style={[s.emptyText, { color: C.subtext }]}>Chưa có ảnh đã đăng để chọn làm ảnh bìa.</Text>
        <TouchableOpacity style={[s.emptyButton, { backgroundColor: C.accent }]} onPress={loadPostedPhotos} activeOpacity={0.85}>
          <Text style={s.emptyButtonText}>Tải lại</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]}>
      {renderHeader()}
      {renderPrivacyModal()}
      {isPostedCover ? (
        <FlatList
          data={postedPhotos}
          keyExtractor={(item) => item.id}
          renderItem={renderPostedPhoto}
          numColumns={3}
          ListHeaderComponent={(
            <View style={s.postedHeader}>
              <Text style={[s.postedTitle, { color: C.text }]}>Ảnh đã đăng tải</Text>
              <Text style={[s.postedSub, { color: C.subtext }]}>Chạm vào ảnh để đặt làm ảnh bìa.</Text>
            </View>
          )}
          ListEmptyComponent={renderPostedEmpty}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          columnWrapperStyle={postedPhotos.length > 0 ? s.gridRow : undefined}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        selectedAsset ? renderComposeStep() : renderUploadChoices()
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  title: { flex: 1, textAlign: 'center', fontSize: 20, fontWeight: '900' },
  saveBtn: {
    minWidth: 58,
    minHeight: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  saveText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  choiceContent: {
    paddingHorizontal: 18,
    paddingTop: 24,
  },
  previewWrap: {
    alignSelf: 'center',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPreviewWrap: {
    width: 138,
    height: 138,
    borderRadius: 69,
  },
  coverPreviewWrap: {
    width: '100%',
    height: 172,
    borderRadius: 16,
  },
  previewImage: { width: '100%', height: '100%' },
  choiceTitleBlock: {
    marginTop: 22,
    marginBottom: 18,
    alignItems: 'center',
    gap: 6,
  },
  choiceTitle: { fontSize: 22, fontWeight: '900', textAlign: 'center' },
  choiceSub: { fontSize: 14, lineHeight: 20, fontWeight: '600', textAlign: 'center' },
  actions: { gap: 12 },
  actionRow: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    gap: 12,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { flex: 1, gap: 3 },
  actionTitle: { fontSize: 16, fontWeight: '900' },
  actionSub: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  composeContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  composePreview: {
    alignSelf: 'center',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  composeAvatarPreview: {
    width: 176,
    height: 176,
    borderRadius: 88,
  },
  composeCoverPreview: {
    width: '100%',
    height: 198,
    borderRadius: 16,
  },
  captionInput: {
    minHeight: 108,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    lineHeight: 22,
  },
  settingRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 13,
    paddingVertical: 11,
    gap: 12,
  },
  settingIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingText: { flex: 1, gap: 3 },
  settingTitle: { fontSize: 15, fontWeight: '900' },
  settingSub: { fontSize: 12.5, lineHeight: 17, fontWeight: '600' },
  primaryBtn: {
    minHeight: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 28,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#9ca3af',
    marginBottom: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: '900', marginBottom: 8 },
  privacyRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  postedHeader: {
    minHeight: 78,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  postedTitle: { fontSize: 22, fontWeight: '900' },
  postedSub: { marginTop: 3, fontSize: 13, fontWeight: '600' },
  gridRow: { gap: 2, marginBottom: 2 },
  gridImage: { width: '100%', height: '100%' },
  savingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.38)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  emptyButton: {
    minHeight: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    marginTop: 2,
  },
  emptyButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});

