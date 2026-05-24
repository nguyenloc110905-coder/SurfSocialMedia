import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  useColorScheme,
  Switch,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import { uploadImage } from '@/lib/cloudinary';
import { updateUserProfile } from '@/lib/firebase/auth';

// ── Types ─────────────────────────────────────────────────────────────────────

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'EditProfile'>;
};

type WorkEntry = { company: string; title?: string; current?: boolean };
type EducationEntry = { school: string; degree?: string; year?: string };
type Birthday = { day: number; month: number; year: number; showYear: boolean };

type FullProfile = {
  displayName?: string | null;
  photoURL?: string | null;
  coverImageUrl?: string | null;
  bio?: string | null;
  currentCity?: string | null;
  hometown?: string | null;
  work?: WorkEntry[];
  education?: EducationEntry[];
  relationship?: string | null;
  birthday?: Birthday | null;
  gender?: string | null;
  customGender?: string | null;
  website?: string | null;
  phone?: string | null;
};

// ── Theme ─────────────────────────────────────────────────────────────────────

const DARK = {
  bg: '#0f172a', card: '#1e293b', border: '#334155',
  text: '#e2e8f0', subtext: '#64748b', accent: '#0ea5e9',
  input: '#0f172a', placeholder: '#64748b', danger: '#ef4444',
};
const LIGHT = {
  bg: '#f8fafc', card: '#ffffff', border: '#e2e8f0',
  text: '#1f2937', subtext: '#64748b', accent: '#0ea5e9',
  input: '#f1f5f9', placeholder: '#94a3b8', danger: '#ef4444',
};

// ── Constants ─────────────────────────────────────────────────────────────────

const RELATIONSHIP_OPTIONS = [
  { value: 'single', label: 'Độc thân' },
  { value: 'in_relationship', label: 'Đang hẹn hò' },
  { value: 'engaged', label: 'Đã đính hôn' },
  { value: 'married', label: 'Đã kết hôn' },
  { value: 'complicated', label: 'Phức tạp' },
  { value: 'separated', label: 'Đã ly thân' },
  { value: 'divorced', label: 'Đã ly hôn' },
  { value: 'widowed', label: 'Góa bụa' },
];

const GENDER_OPTIONS = [
  { value: 'male', label: 'Nam' },
  { value: 'female', label: 'Nữ' },
  { value: 'custom', label: 'Tùy chỉnh' },
];

const MONTHS = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
  'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const YEARS = Array.from({ length: 100 }, (_, i) => new Date().getFullYear() - i);

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, C }: { icon: string; title: string; C: typeof DARK }) {
  return (
    <View style={[sh.sectionHeader, { borderBottomColor: C.border }]}>
      <Ionicons name={icon as any} size={18} color={C.accent} />
      <Text style={[sh.sectionTitle, { color: C.text }]}>{title}</Text>
    </View>
  );
}

function FieldRow({
  label, value, placeholder, onPress, C, multiline,
}: {
  label: string; value?: string | null; placeholder: string;
  onPress: () => void; C: typeof DARK; multiline?: boolean;
}) {
  return (
    <TouchableOpacity style={[sh.fieldRow, { borderBottomColor: C.border }]} onPress={onPress} activeOpacity={0.7}>
      <View style={{ flex: 1 }}>
        <Text style={[sh.fieldLabel, { color: C.subtext }]}>{label}</Text>
        <Text style={[sh.fieldValue, { color: value ? C.text : C.placeholder }]} numberOfLines={multiline ? 3 : 1}>
          {value || placeholder}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={C.subtext} />
    </TouchableOpacity>
  );
}

function EntryCard({
  icon, primary, secondary, onEdit, onDelete, C,
}: {
  icon: string; primary: string; secondary?: string;
  onEdit: () => void; onDelete: () => void; C: typeof DARK;
}) {
  return (
    <View style={[sh.entryCard, { borderColor: C.border, backgroundColor: C.input }]}>
      <Ionicons name={icon as any} size={18} color={C.accent} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={[sh.entryPrimary, { color: C.text }]}>{primary}</Text>
        {secondary ? <Text style={[sh.entrySecondary, { color: C.subtext }]}>{secondary}</Text> : null}
      </View>
      <TouchableOpacity onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="create-outline" size={18} color={C.accent} />
      </TouchableOpacity>
      <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="trash-outline" size={18} color={C.danger} />
      </TouchableOpacity>
    </View>
  );
}

// ── Edit text modal ───────────────────────────────────────────────────────────

function EditTextModal({
  visible, title, value, placeholder, multiline, maxLength,
  onSave, onClose, C,
}: {
  visible: boolean; title: string; value: string; placeholder?: string;
  multiline?: boolean; maxLength?: number;
  onSave: (v: string) => void; onClose: () => void; C: typeof DARK;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (visible) setDraft(value); }, [visible, value]);

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={sh.modalOverlay}>
        <View style={[sh.modalBox, { backgroundColor: C.card }]}>
          <View style={[sh.modalHeader, { borderBottomColor: C.border }]}>
            <Text style={[sh.modalTitle, { color: C.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={C.subtext} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={[sh.modalInput, { color: C.text, backgroundColor: C.input, borderColor: C.border, height: multiline ? 100 : 48 }]}
            value={draft}
            onChangeText={setDraft}
            placeholder={placeholder}
            placeholderTextColor={C.placeholder}
            multiline={multiline}
            maxLength={maxLength}
            autoFocus
            textAlignVertical={multiline ? 'top' : 'center'}
          />
          {maxLength && (
            <Text style={[sh.charCount, { color: C.subtext }]}>{draft.length}/{maxLength}</Text>
          )}
          <View style={sh.modalActions}>
            <TouchableOpacity style={[sh.btnCancel, { borderColor: C.border }]} onPress={onClose}>
              <Text style={[sh.btnCancelText, { color: C.text }]}>Hủy</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[sh.btnSave, { backgroundColor: C.accent }]} onPress={() => onSave(draft.trim())}>
              <Text style={sh.btnSaveText}>Lưu</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Picker modal ──────────────────────────────────────────────────────────────

function PickerModal({
  visible, title, options, selected, onSelect, onClose, C,
}: {
  visible: boolean; title: string;
  options: { value: string; label: string }[];
  selected?: string | null;
  onSelect: (v: string) => void; onClose: () => void; C: typeof DARK;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={sh.modalOverlay}>
        <View style={[sh.modalBox, { backgroundColor: C.card }]}>
          <View style={[sh.modalHeader, { borderBottomColor: C.border }]}>
            <Text style={[sh.modalTitle, { color: C.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={C.subtext} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 320 }}>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[sh.pickerRow, { borderBottomColor: C.border }]}
                onPress={() => { onSelect(opt.value); onClose(); }}
              >
                <Text style={[sh.pickerRowText, { color: C.text }]}>{opt.label}</Text>
                {selected === opt.value && <Ionicons name="checkmark" size={20} color={C.accent} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity style={[sh.btnCancel, { borderColor: C.border, margin: 16 }]} onPress={onClose}>
            <Text style={[sh.btnCancelText, { color: C.text }]}>Hủy</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Work/Education modal ──────────────────────────────────────────────────────

function WorkModal({
  visible, entry, onSave, onClose, C,
}: {
  visible: boolean; entry: WorkEntry;
  onSave: (e: WorkEntry) => void; onClose: () => void; C: typeof DARK;
}) {
  const [draft, setDraft] = useState<WorkEntry>(entry);
  useEffect(() => { if (visible) setDraft(entry); }, [visible, entry]);

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={sh.modalOverlay}>
        <View style={[sh.modalBox, { backgroundColor: C.card }]}>
          <View style={[sh.modalHeader, { borderBottomColor: C.border }]}>
            <Text style={[sh.modalTitle, { color: C.text }]}>Nơi làm việc</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={C.subtext} /></TouchableOpacity>
          </View>
          <View style={{ gap: 12, padding: 16 }}>
            <View>
              <Text style={[sh.inputLabel, { color: C.subtext }]}>Công ty *</Text>
              <TextInput style={[sh.formInput, { color: C.text, backgroundColor: C.input, borderColor: C.border }]}
                value={draft.company} onChangeText={(v) => setDraft(d => ({ ...d, company: v }))}
                placeholder="Tên công ty" placeholderTextColor={C.placeholder} />
            </View>
            <View>
              <Text style={[sh.inputLabel, { color: C.subtext }]}>Chức vụ</Text>
              <TextInput style={[sh.formInput, { color: C.text, backgroundColor: C.input, borderColor: C.border }]}
                value={draft.title ?? ''} onChangeText={(v) => setDraft(d => ({ ...d, title: v }))}
                placeholder="Chức vụ / Vị trí" placeholderTextColor={C.placeholder} />
            </View>
            <View style={sh.switchRow}>
              <Text style={[sh.switchLabel, { color: C.text }]}>Đang làm việc tại đây</Text>
              <Switch value={draft.current ?? false}
                onValueChange={(v) => setDraft(d => ({ ...d, current: v }))}
                trackColor={{ true: C.accent }} />
            </View>
          </View>
          <View style={sh.modalActions}>
            <TouchableOpacity style={[sh.btnCancel, { borderColor: C.border }]} onPress={onClose}>
              <Text style={[sh.btnCancelText, { color: C.text }]}>Hủy</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[sh.btnSave, { backgroundColor: draft.company.trim() ? C.accent : C.border }]}
              onPress={() => { if (draft.company.trim()) onSave(draft); }}
              disabled={!draft.company.trim()}
            >
              <Text style={sh.btnSaveText}>Lưu</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function EduModal({
  visible, entry, onSave, onClose, C,
}: {
  visible: boolean; entry: EducationEntry;
  onSave: (e: EducationEntry) => void; onClose: () => void; C: typeof DARK;
}) {
  const [draft, setDraft] = useState<EducationEntry>(entry);
  useEffect(() => { if (visible) setDraft(entry); }, [visible, entry]);

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={sh.modalOverlay}>
        <View style={[sh.modalBox, { backgroundColor: C.card }]}>
          <View style={[sh.modalHeader, { borderBottomColor: C.border }]}>
            <Text style={[sh.modalTitle, { color: C.text }]}>Trường học</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={C.subtext} /></TouchableOpacity>
          </View>
          <View style={{ gap: 12, padding: 16 }}>
            <View>
              <Text style={[sh.inputLabel, { color: C.subtext }]}>Trường *</Text>
              <TextInput style={[sh.formInput, { color: C.text, backgroundColor: C.input, borderColor: C.border }]}
                value={draft.school} onChangeText={(v) => setDraft(d => ({ ...d, school: v }))}
                placeholder="Tên trường" placeholderTextColor={C.placeholder} />
            </View>
            <View>
              <Text style={[sh.inputLabel, { color: C.subtext }]}>Bằng / Chuyên ngành</Text>
              <TextInput style={[sh.formInput, { color: C.text, backgroundColor: C.input, borderColor: C.border }]}
                value={draft.degree ?? ''} onChangeText={(v) => setDraft(d => ({ ...d, degree: v }))}
                placeholder="VD: Kỹ sư CNTT" placeholderTextColor={C.placeholder} />
            </View>
            <View>
              <Text style={[sh.inputLabel, { color: C.subtext }]}>Năm tốt nghiệp</Text>
              <TextInput style={[sh.formInput, { color: C.text, backgroundColor: C.input, borderColor: C.border }]}
                value={draft.year ?? ''} onChangeText={(v) => setDraft(d => ({ ...d, year: v }))}
                placeholder="VD: 2024" placeholderTextColor={C.placeholder} keyboardType="number-pad" maxLength={4} />
            </View>
          </View>
          <View style={sh.modalActions}>
            <TouchableOpacity style={[sh.btnCancel, { borderColor: C.border }]} onPress={onClose}>
              <Text style={[sh.btnCancelText, { color: C.text }]}>Hủy</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[sh.btnSave, { backgroundColor: draft.school.trim() ? C.accent : C.border }]}
              onPress={() => { if (draft.school.trim()) onSave(draft); }}
              disabled={!draft.school.trim()}
            >
              <Text style={sh.btnSaveText}>Lưu</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Birthday Modal ────────────────────────────────────────────────────────────

function BirthdayModal({
  visible, birthday, onSave, onClose, C,
}: {
  visible: boolean; birthday: Birthday | null;
  onSave: (b: Birthday | null) => void; onClose: () => void; C: typeof DARK;
}) {
  const [draft, setDraft] = useState<Birthday>(birthday ?? { day: 1, month: 1, year: 2000, showYear: true });
  useEffect(() => { if (visible) setDraft(birthday ?? { day: 1, month: 1, year: 2000, showYear: true }); }, [visible, birthday]);

  const [step, setStep] = useState<'day' | 'month' | 'year'>('day');

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={sh.modalOverlay}>
        <View style={[sh.modalBox, { backgroundColor: C.card }]}>
          <View style={[sh.modalHeader, { borderBottomColor: C.border }]}>
            <Text style={[sh.modalTitle, { color: C.text }]}>Ngày sinh</Text>
            <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={C.subtext} /></TouchableOpacity>
          </View>
          <View style={{ padding: 16, gap: 12 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['day', 'month', 'year'] as const).map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[sh.bdTab, { backgroundColor: step === s ? C.accent : C.input, borderColor: C.border }]}
                  onPress={() => setStep(s)}
                >
                  <Text style={{ color: step === s ? '#fff' : C.text, fontSize: 13, fontWeight: '600' }}>
                    {s === 'day' ? `Ngày ${draft.day}` : s === 'month' ? MONTHS[draft.month - 1] : `${draft.year}`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView style={{ maxHeight: 200 }}>
              {step === 'day' && DAYS.map((d) => (
                <TouchableOpacity key={d} style={[sh.pickerRow, { borderBottomColor: C.border }]}
                  onPress={() => { setDraft(x => ({ ...x, day: d })); setStep('month'); }}>
                  <Text style={[sh.pickerRowText, { color: C.text }]}>Ngày {d}</Text>
                  {draft.day === d && <Ionicons name="checkmark" size={18} color={C.accent} />}
                </TouchableOpacity>
              ))}
              {step === 'month' && MONTHS.map((m, i) => (
                <TouchableOpacity key={m} style={[sh.pickerRow, { borderBottomColor: C.border }]}
                  onPress={() => { setDraft(x => ({ ...x, month: i + 1 })); setStep('year'); }}>
                  <Text style={[sh.pickerRowText, { color: C.text }]}>{m}</Text>
                  {draft.month === i + 1 && <Ionicons name="checkmark" size={18} color={C.accent} />}
                </TouchableOpacity>
              ))}
              {step === 'year' && YEARS.map((y) => (
                <TouchableOpacity key={y} style={[sh.pickerRow, { borderBottomColor: C.border }]}
                  onPress={() => setDraft(x => ({ ...x, year: y }))}>
                  <Text style={[sh.pickerRowText, { color: C.text }]}>{y}</Text>
                  {draft.year === y && <Ionicons name="checkmark" size={18} color={C.accent} />}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={sh.switchRow}>
              <Text style={[sh.switchLabel, { color: C.text }]}>Hiện năm sinh</Text>
              <Switch value={draft.showYear}
                onValueChange={(v) => setDraft(d => ({ ...d, showYear: v }))}
                trackColor={{ true: C.accent }} />
            </View>
          </View>

          <View style={sh.modalActions}>
            <TouchableOpacity style={[sh.btnCancel, { borderColor: C.border }]} onPress={() => { onSave(null); onClose(); }}>
              <Text style={[sh.btnCancelText, { color: C.danger }]}>Xóa</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[sh.btnSave, { backgroundColor: C.accent }]} onPress={() => { onSave(draft); onClose(); }}>
              <Text style={sh.btnSaveText}>Lưu</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function EditProfileScreen({ navigation }: Props) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;
  const { user } = useAuthStore();

  const [profile, setProfile] = useState<FullProfile>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── modal visibility ──
  const [bioModal, setBioModal] = useState(false);
  const [cityModal, setCityModal] = useState(false);
  const [hometownModal, setHometownModal] = useState(false);
  const [websiteModal, setWebsiteModal] = useState(false);
  const [phoneModal, setPhoneModal] = useState(false);
  const [relationshipModal, setRelationshipModal] = useState(false);
  const [genderModal, setGenderModal] = useState(false);
  const [customGenderModal, setCustomGenderModal] = useState(false);
  const [birthdayModal, setBirthdayModal] = useState(false);

  const [workModal, setWorkModal] = useState(false);
  const [workIdx, setWorkIdx] = useState<number | null>(null);
  const [workDraft, setWorkDraft] = useState<WorkEntry>({ company: '', current: true });

  const [eduModal, setEduModal] = useState(false);
  const [eduIdx, setEduIdx] = useState<number | null>(null);
  const [eduDraft, setEduDraft] = useState<EducationEntry>({ school: '' });

  const [displayNameModal, setDisplayNameModal] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  // ── Load profile ──
  const load = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const data = await api.get<FullProfile>(`/api/users/${user.uid}`);
      setProfile(data);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => { load(); }, [load]);

  // ── Save helper ──
  const save = async (fields: Partial<FullProfile>) => {
    setSaving(true);
    try {
      await api.put('/api/users/me', fields);
      setProfile(p => ({ ...p, ...fields }));
    } catch {
      Alert.alert('Lỗi', 'Không thể lưu thay đổi. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  // ── Work helpers ──
  const openAddWork = () => {
    setWorkIdx(null);
    setWorkDraft({ company: '', current: true });
    setWorkModal(true);
  };
  const openEditWork = (i: number) => {
    setWorkIdx(i);
    setWorkDraft({ ...(profile.work ?? [])[i] });
    setWorkModal(true);
  };
  const saveWork = (entry: WorkEntry) => {
    const list = [...(profile.work ?? [])];
    if (workIdx === null) list.push(entry);
    else list[workIdx] = entry;
    setWorkModal(false);
    save({ work: list });
  };
  const deleteWork = (i: number) => {
    Alert.alert('Xóa', 'Xóa nơi làm việc này?', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: () => {
        const list = (profile.work ?? []).filter((_, idx) => idx !== i);
        save({ work: list });
      }},
    ]);
  };

  // ── Education helpers ──
  const openAddEdu = () => {
    setEduIdx(null);
    setEduDraft({ school: '' });
    setEduModal(true);
  };
  const openEditEdu = (i: number) => {
    setEduIdx(i);
    setEduDraft({ ...(profile.education ?? [])[i] });
    setEduModal(true);
  };
  const saveEdu = (entry: EducationEntry) => {
    const list = [...(profile.education ?? [])];
    if (eduIdx === null) list.push(entry);
    else list[eduIdx] = entry;
    setEduModal(false);
    save({ education: list });
  };
  const deleteEdu = (i: number) => {
    Alert.alert('Xóa', 'Xóa trường học này?', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: () => {
        const list = (profile.education ?? []).filter((_, idx) => idx !== i);
        save({ education: list });
      }},
    ]);
  };

  // ── Birthday label ──
  const birthdayLabel = (b?: Birthday | null) => {
    if (!b) return null;
    const m = MONTHS[b.month - 1] ?? '';
    return b.showYear ? `${b.day} ${m}, ${b.year}` : `${b.day} ${m}`;
  };

  const genderLabel = (v?: string | null, custom?: string | null) => {
    if (v === 'custom') return custom || 'Tùy chỉnh';
    return GENDER_OPTIONS.find(g => g.value === v)?.label ?? null;
  };

  const relationshipLabel = (v?: string | null) =>
    RELATIONSHIP_OPTIONS.find(r => r.value === v)?.label ?? null;

  // ── Image pick & upload ─────────────────────────────────────────────────────

  const pickAndUploadImage = async (kind: 'avatar' | 'cover', source: 'camera' | 'library') => {
    const isCamera = source === 'camera';
    if (isCamera) {
      const perm = await ImagePicker.getCameraPermissionsAsync();
      if (!perm.granted) {
        const req = await ImagePicker.requestCameraPermissionsAsync();
        if (!req.granted) { Alert.alert('Quyền truy cập', 'Cần quyền truy cập camera để chụp ảnh.'); return; }
      }
    } else {
      const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!req.granted) { Alert.alert('Quyền truy cập', 'Cần quyền truy cập thư viện ảnh.'); return; }
      }
    }
    const aspect: [number, number] = kind === 'avatar' ? [1, 1] : [16, 9];
    const result = isCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85, allowsEditing: true, aspect })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85, allowsEditing: true, aspect });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (kind === 'avatar') setUploadingAvatar(true); else setUploadingCover(true);
    try {
      const url = await uploadImage(asset, { folder: kind === 'avatar' ? 'surf/profiles/avatars' : 'surf/profiles/covers' });
      if (kind === 'avatar') {
        await save({ photoURL: url });
        try { await updateUserProfile({ photoURL: url }); } catch { /* ignore */ }
      } else {
        await save({ coverImageUrl: url });
      }
    } catch {
      Alert.alert('Lỗi', 'Không thể tải ảnh lên. Vui lòng thử lại.');
    } finally {
      if (kind === 'avatar') setUploadingAvatar(false); else setUploadingCover(false);
    }
  };

  const handleAvatarPress = () => Alert.alert('Ảnh đại diện', 'Chọn nguồn ảnh', [
    { text: 'Chụp ảnh', onPress: () => pickAndUploadImage('avatar', 'camera') },
    { text: 'Chọn từ thư viện', onPress: () => pickAndUploadImage('avatar', 'library') },
    { text: 'Hủy', style: 'cancel' },
  ]);

  const handleCoverPress = () => Alert.alert('Ảnh bìa', 'Chọn nguồn ảnh', [
    { text: 'Chụp ảnh', onPress: () => pickAndUploadImage('cover', 'camera') },
    { text: 'Chọn từ thư viện', onPress: () => pickAndUploadImage('cover', 'library') },
    { text: 'Hủy', style: 'cancel' },
  ]);

  if (loading) {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={['top']}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={C.accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: C.border, backgroundColor: C.card }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: C.text }]}>Chỉnh sửa trang cá nhân</Text>
        {saving ? (
          <ActivityIndicator size="small" color={C.accent} />
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* ── Ảnh đại diện & ảnh bìa ── */}
        <View style={[s.photoCard, { borderColor: C.border }]}>
          <TouchableOpacity style={s.coverArea} onPress={handleCoverPress} activeOpacity={0.85}>
            {profile.coverImageUrl ? (
              <Image source={{ uri: profile.coverImageUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <>
                <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0c2d48' }]} />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0ea5e9', opacity: 0.1 }]} />
              </>
            )}
            {uploadingCover ? (
              <View style={s.coverEditChip}><ActivityIndicator size="small" color="#fff" /></View>
            ) : (
              <View style={s.coverEditChip}>
                <Ionicons name="camera-outline" size={14} color="#fff" />
                <Text style={s.coverEditChipText}>Đổi ảnh bìa</Text>
              </View>
            )}
          </TouchableOpacity>

          <View style={[s.avatarNameRow, { backgroundColor: C.card, borderTopColor: C.border }]}>
            <TouchableOpacity onPress={handleAvatarPress} activeOpacity={0.85} style={s.avatarWrapEdit}>
              {profile.photoURL || user?.photoURL ? (
                <Image source={{ uri: (profile.photoURL || user?.photoURL) ?? '' }} style={s.avatarImgEdit} />
              ) : (
                <View style={[s.avatarImgEdit, { backgroundColor: '#6366f1', alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>
                    {(profile.displayName || user?.displayName || 'U').charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={[s.avatarCameraChip, { borderColor: C.card }]}>
                {uploadingAvatar
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Ionicons name="camera" size={13} color="#fff" />
                }
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={{ flex: 1, paddingLeft: 14 }} onPress={() => setDisplayNameModal(true)} activeOpacity={0.7}>
              <Text style={[sh.fieldLabel, { color: C.subtext }]}>Tên hiển thị</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text
                  style={[{ fontSize: 15, fontWeight: '600', flex: 1 }, { color: profile.displayName || user?.displayName ? C.text : C.placeholder }]}
                  numberOfLines={1}
                >
                  {profile.displayName || user?.displayName || 'Nhập tên hiển thị...'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={C.subtext} />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Tiểu sử ── */}
        <View style={[s.section, { backgroundColor: C.card, borderColor: C.border }]}>
          <SectionHeader icon="information-circle-outline" title="Tiểu sử" C={C} />
          <FieldRow
            label="Tiểu sử"
            value={profile.bio}
            placeholder="Thêm tiểu sử..."
            onPress={() => setBioModal(true)}
            C={C}
            multiline
          />
        </View>

        {/* ── Công việc ── */}
        <View style={[s.section, { backgroundColor: C.card, borderColor: C.border }]}>
          <SectionHeader icon="briefcase-outline" title="Công việc" C={C} />
          {(profile.work ?? []).map((w, i) => (
            <EntryCard
              key={i}
              icon="briefcase-outline"
              primary={w.title ? `${w.title} tại ${w.company}` : w.company}
              secondary={w.current ? 'Đang làm việc' : undefined}
              onEdit={() => openEditWork(i)}
              onDelete={() => deleteWork(i)}
              C={C}
            />
          ))}
          <TouchableOpacity style={[sh.addBtn, { borderColor: C.accent }]} onPress={openAddWork}>
            <Ionicons name="add" size={18} color={C.accent} />
            <Text style={[sh.addBtnText, { color: C.accent }]}>Thêm nơi làm việc</Text>
          </TouchableOpacity>
        </View>

        {/* ── Học vấn ── */}
        <View style={[s.section, { backgroundColor: C.card, borderColor: C.border }]}>
          <SectionHeader icon="school-outline" title="Học vấn" C={C} />
          {(profile.education ?? []).map((e, i) => (
            <EntryCard
              key={i}
              icon="school-outline"
              primary={e.school}
              secondary={[e.degree, e.year].filter(Boolean).join(' · ') || undefined}
              onEdit={() => openEditEdu(i)}
              onDelete={() => deleteEdu(i)}
              C={C}
            />
          ))}
          <TouchableOpacity style={[sh.addBtn, { borderColor: C.accent }]} onPress={openAddEdu}>
            <Ionicons name="add" size={18} color={C.accent} />
            <Text style={[sh.addBtnText, { color: C.accent }]}>Thêm trường học</Text>
          </TouchableOpacity>
        </View>

        {/* ── Địa điểm ── */}
        <View style={[s.section, { backgroundColor: C.card, borderColor: C.border }]}>
          <SectionHeader icon="location-outline" title="Địa điểm" C={C} />
          <FieldRow label="Thành phố hiện tại" value={profile.currentCity} placeholder="Thêm thành phố..." onPress={() => setCityModal(true)} C={C} />
          <FieldRow label="Quê quán" value={profile.hometown} placeholder="Thêm quê quán..." onPress={() => setHometownModal(true)} C={C} />
        </View>

        {/* ── Thông tin cơ bản ── */}
        <View style={[s.section, { backgroundColor: C.card, borderColor: C.border }]}>
          <SectionHeader icon="person-outline" title="Thông tin cơ bản" C={C} />
          <FieldRow
            label="Tình trạng hôn nhân"
            value={relationshipLabel(profile.relationship)}
            placeholder="Thêm tình trạng..."
            onPress={() => setRelationshipModal(true)}
            C={C}
          />
          <FieldRow
            label="Ngày sinh"
            value={birthdayLabel(profile.birthday)}
            placeholder="Thêm ngày sinh..."
            onPress={() => setBirthdayModal(true)}
            C={C}
          />
          <FieldRow
            label="Giới tính"
            value={genderLabel(profile.gender, profile.customGender)}
            placeholder="Thêm giới tính..."
            onPress={() => setGenderModal(true)}
            C={C}
          />
        </View>

        {/* ── Liên hệ ── */}
        <View style={[s.section, { backgroundColor: C.card, borderColor: C.border }]}>
          <SectionHeader icon="call-outline" title="Liên hệ" C={C} />
          <FieldRow label="Website" value={profile.website} placeholder="Thêm website..." onPress={() => setWebsiteModal(true)} C={C} />
          <FieldRow label="Số điện thoại" value={profile.phone} placeholder="Thêm số điện thoại..." onPress={() => setPhoneModal(true)} C={C} />
        </View>

      </ScrollView>

      {/* ── Modals ── */}
      <EditTextModal visible={bioModal} title="Tiểu sử" value={profile.bio ?? ''} placeholder='VD: "Student | Love coding 💻"' multiline maxLength={101}
        onSave={(v) => { save({ bio: v || null }); setBioModal(false); }} onClose={() => setBioModal(false)} C={C} />

      <EditTextModal visible={displayNameModal} title="Tên hiển thị" value={profile.displayName ?? user?.displayName ?? ''} placeholder="Tên của bạn" maxLength={50}
        onSave={(v) => {
          if (v.trim()) {
            save({ displayName: v });
            void updateUserProfile({ displayName: v }).catch(() => {});
          }
          setDisplayNameModal(false);
        }}
        onClose={() => setDisplayNameModal(false)} C={C} />

      <EditTextModal visible={cityModal} title="Thành phố hiện tại" value={profile.currentCity ?? ''} placeholder="VD: Hồ Chí Minh"
        onSave={(v) => { save({ currentCity: v || null }); setCityModal(false); }} onClose={() => setCityModal(false)} C={C} />

      <EditTextModal visible={hometownModal} title="Quê quán" value={profile.hometown ?? ''} placeholder="VD: Hà Nội"
        onSave={(v) => { save({ hometown: v || null }); setHometownModal(false); }} onClose={() => setHometownModal(false)} C={C} />

      <EditTextModal visible={websiteModal} title="Website" value={profile.website ?? ''} placeholder="https://..."
        onSave={(v) => { save({ website: v || null }); setWebsiteModal(false); }} onClose={() => setWebsiteModal(false)} C={C} />

      <EditTextModal visible={phoneModal} title="Số điện thoại" value={profile.phone ?? ''} placeholder="0912 345 678"
        onSave={(v) => { save({ phone: v || null }); setPhoneModal(false); }} onClose={() => setPhoneModal(false)} C={C} />

      <EditTextModal visible={customGenderModal} title="Giới tính tùy chỉnh" value={profile.customGender ?? ''} placeholder="Nhập giới tính..."
        onSave={(v) => { save({ customGender: v || null }); setCustomGenderModal(false); }} onClose={() => setCustomGenderModal(false)} C={C} />

      <PickerModal visible={relationshipModal} title="Tình trạng hôn nhân" options={RELATIONSHIP_OPTIONS} selected={profile.relationship}
        onSelect={(v) => save({ relationship: v })} onClose={() => setRelationshipModal(false)} C={C} />

      <PickerModal visible={genderModal} title="Giới tính" options={GENDER_OPTIONS} selected={profile.gender}
        onSelect={(v) => { save({ gender: v }); if (v === 'custom') setTimeout(() => setCustomGenderModal(true), 300); }}
        onClose={() => setGenderModal(false)} C={C} />

      <WorkModal visible={workModal} entry={workDraft} onSave={saveWork} onClose={() => setWorkModal(false)} C={C} />
      <EduModal visible={eduModal} entry={eduDraft} onSave={saveEdu} onClose={() => setEduModal(false)} C={C} />
      <BirthdayModal visible={birthdayModal} birthday={profile.birthday ?? null}
        onSave={(b) => save({ birthday: b })} onClose={() => setBirthdayModal(false)} C={C} />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, height: 52, borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  section: {
    marginHorizontal: 12, marginTop: 12, borderRadius: 14, borderWidth: 1, overflow: 'hidden',
  },
  photoCard: {
    marginHorizontal: 12, marginTop: 12, borderRadius: 14, borderWidth: 1, overflow: 'hidden',
  },
  coverArea: { height: 100, width: '100%' },
  coverEditChip: {
    position: 'absolute', bottom: 10, right: 12,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  coverEditChipText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  avatarNameRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth,
  },
  avatarWrapEdit: { position: 'relative', width: 64, height: 64 },
  avatarImgEdit: { width: 64, height: 64, borderRadius: 32 },
  avatarCameraChip: {
    position: 'absolute', bottom: 0, right: 0,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#0ea5e9',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2,
  },
});

const sh = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700' },

  fieldRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10,
  },
  fieldLabel: { fontSize: 11, fontWeight: '600', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldValue: { fontSize: 14 },

  entryCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    margin: 12, marginBottom: 0, padding: 12, borderRadius: 10, borderWidth: 1,
  },
  entryPrimary: { fontSize: 14, fontWeight: '600' },
  entrySecondary: { fontSize: 12, marginTop: 2 },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    margin: 12, paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', alignSelf: 'flex-start',
  },
  addBtnText: { fontSize: 14, fontWeight: '600' },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
  },
  modalBox: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 24, maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 16, fontWeight: '700' },
  modalInput: {
    marginHorizontal: 16, marginTop: 16, borderRadius: 10,
    borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
  },
  charCount: { textAlign: 'right', marginRight: 16, marginTop: 4, fontSize: 12 },
  modalActions: {
    flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 16,
  },
  btnCancel: {
    flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center',
  },
  btnCancelText: { fontSize: 14, fontWeight: '600' },
  btnSave: {
    flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center',
  },
  btnSaveText: { fontSize: 14, fontWeight: '600', color: '#fff' },

  pickerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerRowText: { fontSize: 15 },

  inputLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  formInput: {
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12,
    paddingVertical: 10, fontSize: 14,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  switchLabel: { fontSize: 14 },

  bdTab: {
    flex: 1, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 8,
    borderWidth: 1, alignItems: 'center',
  },
});
