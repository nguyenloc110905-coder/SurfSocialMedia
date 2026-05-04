import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  useColorScheme,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation';
import { useMarketplaceStore, type CreateListingInput } from '@/stores/marketplaceStore';
import { uploadMarketplaceImages } from '@/lib/cloudinary';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'CreateListing'>;
};

// ── Theme ─────────────────────────────────────────────────────────────────────
const DARK = {
  bg: '#0f172a', card: '#1e293b', border: '#334155',
  text: '#e2e8f0', subtext: '#64748b', accent: '#0ea5e9',
  input: '#1e293b', placeholder: '#475569', red: '#ef4444',
  pill: '#1e3a5f', pillActive: '#0ea5e9',
};
const LIGHT = {
  bg: '#f1f5f9', card: '#ffffff', border: '#e2e8f0',
  text: '#1e293b', subtext: '#64748b', accent: '#0ea5e9',
  input: '#ffffff', placeholder: '#94a3b8', red: '#dc2626',
  pill: '#e0f2fe', pillActive: '#0ea5e9',
};

// ── Category / Condition options ──────────────────────────────────────────────
const CATEGORIES = [
  { key: 'electronics', label: 'Điện tử', icon: 'phone-portrait-outline' },
  { key: 'clothing',    label: 'Thời trang', icon: 'shirt-outline' },
  { key: 'vehicles',   label: 'Xe cộ', icon: 'car-outline' },
  { key: 'home',       label: 'Gia dụng', icon: 'home-outline' },
  { key: 'sports',     label: 'Thể thao', icon: 'football-outline' },
  { key: 'other',      label: 'Khác', icon: 'ellipsis-horizontal-outline' },
] as const;

const CONDITIONS = [
  { key: 'new',      label: 'Mới 100%' },
  { key: 'like_new', label: 'Như mới' },
  { key: 'good',     label: 'Tốt' },
  { key: 'fair',     label: 'Khá' },
] as const;

type Category = typeof CATEGORIES[number]['key'];
type Condition = typeof CONDITIONS[number]['key'];

// ── Field wrapper ──────────────────────────────────────────────────────────────
function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: C.text, fontSize: 13, fontWeight: '600', marginBottom: 6 }}>
        {label}{required && <Text style={{ color: C.red }}> *</Text>}
      </Text>
      {children}
    </View>
  );
}

export default function CreateListingScreen({ navigation }: Props) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;
  const { createListing } = useMarketplaceStore();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState<Category>('other');
  const [condition, setCondition] = useState<Condition>('good');
  const [location, setLocation] = useState('');
  const [selectedImages, setSelectedImages] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [loading, setLoading] = useState(false);

  const handlePickImages = async () => {
    if (selectedImages.length >= 10) {
      Alert.alert('Đã đủ ảnh', 'Bạn chỉ có thể thêm tối đa 10 ảnh.');
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Cần quyền truy cập', 'Vui lòng cấp quyền thư viện ảnh để thêm ảnh sản phẩm.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 10 - selectedImages.length,
      quality: 0.85,
    });

    if (result.canceled) return;
    setSelectedImages((prev) => [...prev, ...result.assets].slice(0, 10));
  };

  const handleRemoveImage = (uri: string) => {
    setSelectedImages((prev) => prev.filter((asset) => asset.uri !== uri));
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập tiêu đề sản phẩm.');
      return;
    }

    const priceNum = Number(price.replace(/[^\d]/g, '')) || 0;

    setLoading(true);
    try {
      const mediaUrls = selectedImages.length > 0
        ? await uploadMarketplaceImages(selectedImages.map((asset) => ({
          uri: asset.uri,
          fileName: asset.fileName,
          mimeType: asset.mimeType,
        })))
        : [];

      const input: CreateListingInput = {
        title: title.trim(),
        description: description.trim(),
        price: priceNum,
        category,
        condition,
        mediaUrls,
        location: location.trim(),
      };
      const listing = await createListing(input);
      Alert.alert('Thành công', 'Tin đăng của bạn đã được đăng lên!', [
        {
          text: 'Xem tin',
          onPress: () => {
            navigation.goBack();
            navigation.navigate('MarketplaceDetail', { listingId: listing.id });
          },
        },
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Lỗi', (e as Error).message ?? 'Không thể đăng tin. Thử lại sau.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* ── Header ── */}
        <View style={[s.header, { borderBottomColor: C.border }]}>
          <TouchableOpacity
            style={[s.iconBtn, { borderColor: C.border }]}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="close" size={22} color={C.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: C.text }]}>Đăng tin bán</Text>
          <TouchableOpacity
            style={[s.submitBtn, { backgroundColor: loading ? C.subtext : C.accent }]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={s.submitBtnText}>Đăng</Text>
            }
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Ảnh placeholder ── */}
          {selectedImages.length === 0 ? (
            <TouchableOpacity
              style={[s.imgPicker, { backgroundColor: C.card, borderColor: C.border }]}
              onPress={handlePickImages}
              disabled={loading}
            >
              <Ionicons name="camera-outline" size={36} color={C.subtext} />
              <Text style={[s.imgPickerText, { color: C.subtext }]}>Thêm ảnh sản phẩm</Text>
              <Text style={{ color: C.placeholder, fontSize: 11, marginTop: 2 }}>Tối đa 10 ảnh</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ marginBottom: 20 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.imageList}>
                {selectedImages.map((asset) => (
                  <View key={asset.uri} style={[s.imagePreview, { backgroundColor: C.card, borderColor: C.border }]}>
                    <Image source={{ uri: asset.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    <TouchableOpacity
                      style={[s.removeImageBtn, { backgroundColor: C.red }]}
                      onPress={() => handleRemoveImage(asset.uri)}
                      disabled={loading}
                    >
                      <Ionicons name="close" size={14} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
                {selectedImages.length < 10 && (
                  <TouchableOpacity
                    style={[s.addImageBtn, { backgroundColor: C.card, borderColor: C.border }]}
                    onPress={handlePickImages}
                    disabled={loading}
                  >
                    <Ionicons name="add" size={28} color={C.accent} />
                  </TouchableOpacity>
                )}
              </ScrollView>
              <Text style={{ color: C.subtext, fontSize: 12, marginTop: 8 }}>
                {selectedImages.length}/10 ảnh đã chọn
              </Text>
            </View>
          )}

          {/* ── Tiêu đề ── */}
          <Field label="Tiêu đề" required>
            <TextInput
              style={[s.input, { backgroundColor: C.input, borderColor: C.border, color: C.text }]}
              placeholder="VD: iPhone 15 Pro Max 256GB"
              placeholderTextColor={C.placeholder}
              value={title}
              onChangeText={setTitle}
              maxLength={100}
            />
          </Field>

          {/* ── Giá ── */}
          <Field label="Giá (để 0 = Cho tặng)" required>
            <View style={{ position: 'relative' }}>
              <TextInput
                style={[s.input, { backgroundColor: C.input, borderColor: C.border, color: C.text, paddingRight: 48 }]}
                placeholder="0"
                placeholderTextColor={C.placeholder}
                value={price}
                onChangeText={setPrice}
                keyboardType="numeric"
              />
              <Text style={[s.currencyTag, { color: C.subtext }]}>VND</Text>
            </View>
          </Field>

          {/* ── Danh mục ── */}
          <Field label="Danh mục" required>
            <View style={s.optionGrid}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.key}
                  style={[
                    s.optionBtn,
                    {
                      backgroundColor: category === cat.key ? C.pillActive : C.pill,
                      borderColor: category === cat.key ? C.accent : 'transparent',
                    },
                  ]}
                  onPress={() => setCategory(cat.key)}
                >
                  <Ionicons
                    name={cat.icon as any}
                    size={16}
                    color={category === cat.key ? '#fff' : C.text}
                  />
                  <Text style={[s.optionLabel, { color: category === cat.key ? '#fff' : C.text }]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Field>

          {/* ── Tình trạng ── */}
          <Field label="Tình trạng" required>
            <View style={s.condRow}>
              {CONDITIONS.map((cond) => (
                <TouchableOpacity
                  key={cond.key}
                  style={[
                    s.condBtn,
                    {
                      backgroundColor: condition === cond.key ? C.pillActive : C.pill,
                      borderColor: condition === cond.key ? C.accent : 'transparent',
                      flex: 1,
                    },
                  ]}
                  onPress={() => setCondition(cond.key)}
                >
                  <Text style={[s.condBtnText, { color: condition === cond.key ? '#fff' : C.text }]}>
                    {cond.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Field>

          {/* ── Mô tả ── */}
          <Field label="Mô tả sản phẩm">
            <TextInput
              style={[
                s.input,
                s.textarea,
                { backgroundColor: C.input, borderColor: C.border, color: C.text },
              ]}
              placeholder="Thêm thông tin về sản phẩm, lý do bán, tình trạng thực tế..."
              placeholderTextColor={C.placeholder}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={5}
              maxLength={1000}
              textAlignVertical="top"
            />
          </Field>

          {/* ── Địa điểm ── */}
          <Field label="Địa điểm">
            <View style={[s.inputRow, { backgroundColor: C.input, borderColor: C.border }]}>
              <Ionicons name="location-outline" size={18} color={C.subtext} />
              <TextInput
                style={[s.inputInner, { color: C.text }]}
                placeholder="VD: Hà Nội, TP.HCM..."
                placeholderTextColor={C.placeholder}
                value={location}
                onChangeText={setLocation}
                maxLength={100}
              />
            </View>
          </Field>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, gap: 12,
  },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700' },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  submitBtn: {
    paddingHorizontal: 20, paddingVertical: 9, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', minWidth: 64,
  },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Image picker
  imgPicker: {
    height: 130, borderRadius: 14, borderWidth: 2, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20, gap: 6,
  },
  imgPickerText: { fontSize: 14, fontWeight: '600' },
  imageList: { gap: 10 },
  imagePreview: {
    width: 96, height: 96, borderRadius: 14, borderWidth: 1,
    overflow: 'hidden',
  },
  removeImageBtn: {
    position: 'absolute', top: 6, right: 6,
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  addImageBtn: {
    width: 96, height: 96, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },

  // Input
  input: {
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15,
  },
  textarea: { height: 110, paddingTop: 12 },
  currencyTag: {
    position: 'absolute', right: 14, top: '50%',
    transform: [{ translateY: -8 }],
    fontSize: 13, fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  inputInner: { flex: 1, fontSize: 15, padding: 0 },

  // Options grid (category)
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10, borderWidth: 1.5,
  },
  optionLabel: { fontSize: 13, fontWeight: '600' },

  // Condition row
  condRow: { flexDirection: 'row', gap: 8 },
  condBtn: {
    paddingVertical: 10, borderRadius: 10,
    alignItems: 'center', borderWidth: 1.5,
  },
  condBtnText: { fontSize: 12, fontWeight: '600' },
});
