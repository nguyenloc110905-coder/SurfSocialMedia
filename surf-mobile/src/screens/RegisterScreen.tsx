import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation';
import { signUp, signInWithGoogle } from '@/lib/firebase/auth';

const ERRORS: Record<string, string> = {
  'auth/email-already-in-use': 'Email này đã được sử dụng.',
  'auth/weak-password': 'Mật khẩu quá yếu.',
  'auth/invalid-email': 'Email không hợp lệ.',
  'auth/network-request-failed': 'Lỗi kết nối mạng.',
  'auth/operation-not-allowed': 'Phương thức đăng nhập chưa được bật.',
};

function validatePassword(pw: string): string | null {
  if (pw.length < 6) return 'Mật khẩu cần ít nhất 6 ký tự.';
  if (!/[A-Z]/.test(pw)) return 'Cần ít nhất 1 chữ viết hoa.';
  if (!/[0-9]/.test(pw)) return 'Cần ít nhất 1 chữ số.';
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Cần ít nhất 1 ký tự đặc biệt.';
  return null;
}

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Register'>;
};

export default function RegisterScreen({ navigation }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async () => {
    setError('');
    if (!name || !email || !password || !confirmPassword) {
      setError('Vui lòng điền đầy đủ thông tin'); return;
    }
    const pwError = validatePassword(password);
    if (pwError) { setError(pwError); return; }
    if (password !== confirmPassword) { setError('Mật khẩu xác nhận không khớp.'); return; }
    setLoading(true);
    try {
      await signUp(email.trim(), password, name.trim());
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      setError(ERRORS[code] || 'Đăng ký thất bại.');
    } finally { setLoading(false); }
  };

  const handleGoogle = async () => {
    setLoading(true); setError('');
    try { await signInWithGoogle(); }
    catch (err) {
      const code = (err as { code?: string }).code ?? '';
      setError(ERRORS[code] || 'Đăng nhập Google thất bại.');
    } finally { setLoading(false); }
  };

  const handleFacebook = async () => {
    setError('Đăng ký Facebook trên mobile sẽ được hỗ trợ sớm.');
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          {/* ── Logo ── */}
          <View style={s.logoWrap}>
            <Image source={require('../../assets/SurfLogo.png')} style={s.logo} resizeMode="contain" />
            <Text style={s.tagline}>Kết nối, chia sẻ và khám phá thế giới cùng <Text style={s.tagCyan}>Surf</Text></Text>
          </View>

          {/* ── Card ── */}
          <View style={s.card}>
            {/* Tab bar */}
            <View style={s.tabBar}>
              <TouchableOpacity style={s.tabInactive} onPress={() => navigation.replace('Login')}>
                <Text style={s.tabInactiveText}>Đăng nhập</Text>
              </TouchableOpacity>
              <View style={s.tabActive}><Text style={s.tabActiveText}>Đăng ký</Text></View>
            </View>

            {/* Name */}
            <Text style={s.label}>Tên hiển thị</Text>
            <TextInput
              style={s.input}
              placeholder="Nguyễn Văn A"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={name}
              onChangeText={setName}
            />

            {/* Email */}
            <Text style={s.label}>Email</Text>
            <TextInput
              style={s.input}
              placeholder="you@example.com"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />

            {/* Password */}
            <Text style={s.label}>Mật khẩu</Text>
            <View style={s.pwWrap}>
              <TextInput
                style={[s.input, { flex: 1, marginBottom: 0 }]}
                placeholder="Ít nhất 6 ký tự"
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPassword(v => !v)}>
                <Text style={s.eyeText}>{showPassword ? '🙈' : '👁'}</Text>
              </TouchableOpacity>
            </View>

            {/* Confirm password */}
            <Text style={s.label}>Nhập lại mật khẩu</Text>
            <TextInput
              style={s.input}
              placeholder="Xác nhận mật khẩu"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showPassword}
            />

            {/* Password hints */}
            <View style={s.hints}>
              {['Ít nhất 6 ký tự', '1 chữ hoa', '1 chữ số', '1 ký tự đặc biệt'].map(h => (
                <Text key={h} style={s.hintText}>• {h}</Text>
              ))}
            </View>

            {/* Submit */}
            <TouchableOpacity style={[s.submitBtn, loading && s.disabled]} onPress={handleRegister} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.submitText}>Tạo tài khoản</Text>}
            </TouchableOpacity>

            {/* Error */}
            {!!error && (
              <View style={s.errorBox}><Text style={s.errorText}>⚠ {error}</Text></View>
            )}

            {/* Divider */}
            <View style={s.divider}>
              <View style={s.dividerLine} />
              <Text style={s.dividerText}>HOẶC</Text>
              <View style={s.dividerLine} />
            </View>

            {/* Google */}
            <TouchableOpacity style={s.googleBtn} onPress={handleGoogle} disabled={loading}>
              <View style={s.gCircle}><Text style={s.gLetter}>G</Text></View>
              <Text style={s.socialText}>Đăng ký với Google</Text>
            </TouchableOpacity>

            {/* Facebook */}
            <TouchableOpacity style={s.fbBtn} onPress={handleFacebook} disabled={loading}>
              <Text style={s.fbLetter}>f</Text>
              <Text style={s.fbText}>Đăng ký với Facebook</Text>
            </TouchableOpacity>
          </View>

          {/* Switch */}
          <View style={s.switchRow}>
            <Text style={s.switchLabel}>Đã có tài khoản? </Text>
            <TouchableOpacity onPress={() => navigation.replace('Login')}>
              <Text style={s.switchLink}>Đăng nhập</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0c1929' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20, paddingBottom: 40 },

  /* Logo */
  logoWrap: { alignItems: 'center', marginBottom: 20 },
  logo: { width: 120, height: 120, marginBottom: 8 },
  tagline: { fontSize: 13, color: 'rgba(255,255,255,0.45)', textAlign: 'center', maxWidth: 280 },
  tagCyan: { color: '#06b6d4', fontWeight: '600' },

  /* Card */
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    padding: 24, marginBottom: 16,
  },

  /* Tabs */
  tabBar: {
    flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16, padding: 4, marginBottom: 20,
  },
  tabActive: {
    flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
    backgroundColor: '#06b6d4',
  },
  tabActiveText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  tabInactive: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  tabInactiveText: { color: 'rgba(255,255,255,0.4)', fontWeight: '600', fontSize: 14 },

  /* Inputs */
  label: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '500', marginBottom: 6, marginLeft: 4 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13,
    color: '#fff', fontSize: 15, marginBottom: 14,
  },
  pwWrap: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  eyeBtn: { position: 'absolute', right: 14, padding: 4 },
  eyeText: { fontSize: 16 },

  /* Password hints */
  hints: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
  hintText: { color: 'rgba(255,255,255,0.35)', fontSize: 11, marginRight: 10, marginBottom: 4 },

  /* Submit */
  submitBtn: {
    borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 10,
    backgroundColor: '#06b6d4',
  },
  disabled: { opacity: 0.5 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  /* Error */
  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
    borderRadius: 12, padding: 10, marginBottom: 10,
  },
  errorText: { color: '#fca5a5', fontSize: 13 },

  /* Divider */
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 14 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  dividerText: { color: 'rgba(255,255,255,0.3)', fontSize: 11, marginHorizontal: 10, letterSpacing: 2 },

  /* Social */
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 13, borderRadius: 12, marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  gCircle: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  gLetter: { fontSize: 13, fontWeight: 'bold', color: '#4285F4' },
  socialText: { color: 'rgba(255,255,255,0.8)', fontWeight: '600', fontSize: 15 },

  fbBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 13, borderRadius: 12,
    backgroundColor: '#1877F2',
  },
  fbLetter: { color: '#fff', fontSize: 17, fontWeight: 'bold', marginRight: 10 },
  fbText: { color: '#fff', fontWeight: '600', fontSize: 15 },

  /* Switch */
  switchRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 4 },
  switchLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 14 },
  switchLink: { color: '#06b6d4', fontWeight: '600', fontSize: 14 },
});
