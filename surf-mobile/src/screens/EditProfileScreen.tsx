import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation';
import { useUserStore } from '@/stores/userStore';
import { useT } from '@/lib/i18n';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'EditProfile'>;
};

const DARK = {
  bg: '#0b1120',
  card: '#111827',
  border: '#243044',
  text: '#f8fafc',
  subtext: '#94a3b8',
  input: '#172033',
  accent: '#1877f2',
};

const LIGHT = {
  bg: '#f3f4f6',
  card: '#ffffff',
  border: '#e5e7eb',
  text: '#050505',
  subtext: '#65676b',
  input: '#f0f2f5',
  accent: '#1877f2',
};

type FormState = {
  displayName: string;
  bio: string;
  currentCity: string;
  hometown: string;
  birthday: string;
  relationship: string;
};

const emptyForm: FormState = {
  displayName: '',
  bio: '',
  currentCity: '',
  hometown: '',
  birthday: '',
  relationship: '',
};

function nullableText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export default function EditProfileScreen({ navigation }: Props) {
  const scheme = useColorScheme();
  const t = useT();
  const C = scheme === 'dark' ? DARK : LIGHT;
  const insets = useSafeAreaInsets();
  const { profile, loading, fetchProfile, updateProfile } = useUserStore();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile && !loading) {
      fetchProfile();
    }
  }, [fetchProfile, loading, profile]);

  useEffect(() => {
    if (!profile) return;
    setForm({
      displayName: profile.displayName ?? '',
      bio: profile.bio ?? '',
      currentCity: profile.currentCity ?? '',
      hometown: profile.hometown ?? '',
      birthday: profile.birthday ?? '',
      relationship: profile.relationship ?? '',
    });
  }, [profile]);

  const canSave = useMemo(() => form.displayName.trim().length >= 2 && !saving, [form.displayName, saving]);

  const setField = (key: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await updateProfile({
        displayName: form.displayName.trim(),
        bio: nullableText(form.bio),
        currentCity: nullableText(form.currentCity),
        hometown: nullableText(form.hometown),
        birthday: nullableText(form.birthday),
        relationship: nullableText(form.relationship),
      });
      navigation.goBack();
    } catch {
      Alert.alert(t('cannot_save'), t('check_connection_retry'));
    } finally {
      setSaving(false);
    }
  };

  const renderInput = (
    key: keyof FormState,
    label: string,
    icon: keyof typeof Ionicons.glyphMap,
    options: { multiline?: boolean; placeholder?: string } = {}
  ) => (
    <View style={s.field}>
      <View style={s.labelRow}>
        <Ionicons name={icon} size={18} color={C.subtext} />
        <Text style={[s.label, { color: C.text }]}>{label}</Text>
      </View>
      <TextInput
        value={form[key]}
        onChangeText={(value) => setField(key, value)}
        placeholder={options.placeholder ?? label}
        placeholderTextColor={C.subtext}
        multiline={options.multiline}
        textAlignVertical={options.multiline ? 'top' : 'center'}
        style={[
          s.input,
          options.multiline && s.textArea,
          { backgroundColor: C.input, color: C.text, borderColor: C.border },
        ]}
      />
    </View>
  );

  if (loading && !profile) {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: C.bg }]}>
        <View style={s.center}>
          <ActivityIndicator color={C.accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]}>
      <KeyboardAvoidingView
        style={s.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 12}
      >
        <View style={[s.header, { backgroundColor: C.card, borderBottomColor: C.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="arrow-back" size={24} color={C.text} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color: C.text }]}>{t('edit_profile_title')}</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          style={s.scroll}
          contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 96 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={[s.card, { backgroundColor: C.card, borderColor: C.border }]}>
            {renderInput('displayName', t('display_name'), 'person-outline', { placeholder: t('display_name_placeholder') })}
            {renderInput('bio', t('bio'), 'reader-outline', { multiline: true, placeholder: t('bio_placeholder') })}
            {renderInput('currentCity', t('current_city'), 'location-outline', { placeholder: t('current_city_placeholder') })}
            {renderInput('hometown', t('hometown'), 'home-outline', { placeholder: t('hometown') })}
            {renderInput('birthday', t('birthday'), 'calendar-outline', { placeholder: t('birthday_placeholder') })}
            {renderInput('relationship', t('relationship'), 'heart-outline', { placeholder: t('relationship_placeholder') })}
          </View>
        </ScrollView>

        <View style={[s.footer, { backgroundColor: C.card, borderTopColor: C.border, paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            style={[s.saveButton, { backgroundColor: canSave ? C.accent : C.border, opacity: canSave ? 1 : 0.7 }]}
            onPress={handleSave}
            disabled={!canSave}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveText}>{t('save_changes')}</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  keyboard: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800' },
  scroll: { flex: 1 },
  content: { padding: 16 },
  card: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 14 },
  field: { gap: 7 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 14, fontWeight: '700' },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 13,
    fontSize: 15,
  },
  textArea: {
    minHeight: 96,
    paddingTop: 12,
    lineHeight: 20,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  saveButton: {
    minHeight: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
