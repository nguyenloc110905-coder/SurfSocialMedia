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
import { sendPasswordResetEmail } from '@/lib/firebase/auth';

const ERRORS: Record<string, string> = {
  'auth/invalid-email': 'Email không hợp lệ.',
  'auth/user-not-found': 'Không tìm thấy tài khoản với email này.',
  'auth/too-many-requests': 'Quá nhiều lần thử. Vui lòng thử lại sau.',
  'auth/network-request-failed': 'Lỗi kết nối mạng.',
};

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'ForgotPassword'>;
};

export default function ForgotPasswordScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!email) {
      setError('Vui lòng nhập email');
      return;
    }
    setLoading(true);
    setError('');
    try {
      // Configure ActionCodeSettings to deep link back to the app
      const actionCodeSettings = {
        // The URL to redirect to after password reset
        // Uses the web app's login page as fallback
        url: 'https://surf-7ce71.firebaseapp.com/login',
        handleCodeInApp: true,
        iOS: {
          bundleId: 'com.surf.app',
        },
        android: {
          packageName: 'com.surf.app',
          installApp: true,
          minimumVersion: '12',
        },
      };

      await sendPasswordResetEmail(email.trim(), actionCodeSettings);
      setSent(true);
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      console.log(`❌ ForgotPassword error [${code}]:`, err);
      setError(ERRORS[code] || 'Gửi email thất bại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          {/* ── Logo ── */}
          <View style={s.logoWrap}>
            <Image source={require('../../assets/SurfLogo.png')} style={s.logo} resizeMode="contain" />
          </View>

          {/* ── Card ── */}
          <View style={s.card}>
            <Text style={s.title}>Quên mật khẩu</Text>
            <Text style={s.subtitle}>
              {sent ? 'Kiểm tra email của bạn' : 'Nhập email để nhận link đặt lại mật khẩu'}
            </Text>

            {sent ? (
              <View style={s.sentContainer}>
                <View style={s.iconWrap}>
                  <Text style={s.iconText}>✓</Text>
                </View>
                <Text style={s.sentText}>
                  Chúng tôi đã gửi email chứa link đặt lại mật khẩu đến{' '}
                  <Text style={s.cyanText}>{email}</Text>. Vui lòng kiểm tra hộp thư (và thư mục spam).
                </Text>
                <TouchableOpacity style={s.submitBtn} onPress={() => navigation.navigate('Auth', { initialTab: 'login' })}>
                  <Text style={s.submitText}>← Quay lại đăng nhập</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
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

                <TouchableOpacity style={[s.submitBtn, loading && s.disabled]} onPress={handleSubmit} disabled={loading}>
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={s.submitText}>Gửi link đặt lại mật khẩu</Text>
                  )}
                </TouchableOpacity>

                {!!error && (
                  <View style={s.errorBox}>
                    <Text style={s.errorText}>⚠ {error}</Text>
                  </View>
                )}

                <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
                  <Text style={s.backText}>← Quay lại đăng nhập</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0c1929' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },

  logoWrap: { alignItems: 'center', marginBottom: 20 },
  logo: { width: 120, height: 120, marginBottom: 8 },

  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 24,
  },

  label: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '500', marginBottom: 6, marginLeft: 4 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    color: '#fff',
    fontSize: 15,
    marginBottom: 16,
  },

  submitBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
    backgroundColor: '#06b6d4',
  },
  disabled: { opacity: 0.5 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    marginTop: 6,
  },
  errorText: { color: '#fca5a5', fontSize: 13 },

  backBtn: { alignItems: 'center', marginTop: 10 },
  backText: { color: '#06b6d4', fontSize: 14, fontWeight: '500' },

  sentContainer: { alignItems: 'center' },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  iconText: { color: '#34d399', fontSize: 32, fontWeight: 'bold' },
  sentText: {
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 24,
  },
  cyanText: { color: '#06b6d4', fontWeight: 'bold' },
});
