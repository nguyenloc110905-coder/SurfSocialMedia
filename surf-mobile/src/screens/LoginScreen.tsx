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
import { signIn, signInWithGoogle } from '@/lib/firebase/auth';

const ERRORS: Record<string, string> = {
  'auth/invalid-email': 'Email không hợp lệ.',
  'auth/user-disabled': 'Tài khoản đã bị vô hiệu hóa.',
  'auth/user-not-found': 'Tài khoản không tồn tại.',
  'auth/wrong-password': 'Mật khẩu không đúng.',
  'auth/invalid-credential': 'Email hoặc mật khẩu không đúng.',
  'auth/invalid-login-credentials': 'Email hoặc mật khẩu không đúng.',
  'auth/too-many-requests': 'Quá nhiều lần thử. Vui lòng thử lại sau.',
  'auth/network-request-failed': 'Lỗi kết nối mạng.',
  'auth/popup-closed-by-user': 'Bạn đã đóng cửa sổ đăng nhập.',
  'auth/account-exists-with-different-credential': 'Email đã liên kết với phương thức khác.',
};

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Login'>;
};

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!email || !password) { setError('Vui lòng nhập email và mật khẩu'); return; }
    setLoading(true); setError('');
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      setError(ERRORS[code] || 'Đăng nhập thất bại.');
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
    setError('Đăng nhập Facebook trên mobile sẽ được hỗ trợ sớm.');
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
              <View style={s.tabActive}><Text style={s.tabActiveText}>Đăng nhập</Text></View>
              <TouchableOpacity style={s.tabInactive} onPress={() => navigation.replace('Register')}>
                <Text style={s.tabInactiveText}>Đăng ký</Text>
              </TouchableOpacity>
            </View>

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
                placeholder="••••••••"
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete="password"
              />
              <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPassword(v => !v)}>
                <Text style={s.eyeText}>{showPassword ? '🙈' : '👁'}</Text>
              </TouchableOpacity>
            </View>

            {/* Forgot password */}
            <View style={s.forgotRow}>
              <TouchableOpacity>
                <Text style={s.forgotText}>Quên mật khẩu?</Text>
              </TouchableOpacity>
            </View>

            {/* Submit */}
            <TouchableOpacity style={[s.submitBtn, loading && s.disabled]} onPress={handleLogin} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.submitText}>Đăng nhập</Text>}
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
              <Text style={s.socialText}>Đăng nhập với Google</Text>
            </TouchableOpacity>

            {/* Facebook */}
            <TouchableOpacity style={s.fbBtn} onPress={handleFacebook} disabled={loading}>
              <Text style={s.fbLetter}>f</Text>
              <Text style={s.fbText}>Đăng nhập với Facebook</Text>
            </TouchableOpacity>
          </View>

          {/* Switch */}
          <View style={s.switchRow}>
            <Text style={s.switchLabel}>Chưa có tài khoản? </Text>
            <TouchableOpacity onPress={() => navigation.replace('Register')}>
              <Text style={s.switchLink}>Đăng ký ngay</Text>
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
  pwWrap: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  eyeBtn: { position: 'absolute', right: 14, padding: 4 },
  eyeText: { fontSize: 16 },

  /* Forgot */
  forgotRow: { alignItems: 'flex-end', marginBottom: 16 },
  forgotText: { color: '#06b6d4', fontSize: 13 },

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
