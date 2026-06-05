import React, { useState, useEffect } from 'react';
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
import * as AppleAuthentication from 'expo-apple-authentication';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation';
import { signIn, signUp, setAuthPersistence, getCurrentUser, getAuthPersistMode } from '@/lib/firebase/auth';
import { useAppleSignIn, useGoogleSignIn, useFacebookSignIn } from '@/lib/social-auth';
import { isDevModeEnabled, shouldClearAuthOnStartup } from '@/lib/debug-config';
import { useAuthStore } from '@/stores/authStore';
import { useT, type I18nKey } from '@/lib/i18n';

const LOGIN_ERRORS: Record<string, I18nKey> = {
  'auth/invalid-email': 'auth_invalid_email',
  'auth/user-disabled': 'auth_user_disabled',
  'auth/user-not-found': 'auth_user_not_found',
  'auth/wrong-password': 'auth_wrong_password',
  'auth/invalid-credential': 'auth_invalid_credentials',
  'auth/invalid-login-credentials': 'auth_invalid_credentials',
  'auth/too-many-requests': 'auth_too_many_requests',
  'auth/network-request-failed': 'auth_network_error',
  'auth/popup-closed-by-user': 'auth_popup_closed',
  'auth/account-exists-with-different-credential': 'auth_account_exists',
};

const REGISTER_ERRORS: Record<string, I18nKey> = {
  'auth/email-already-in-use': 'auth_email_in_use',
  'auth/weak-password': 'auth_weak_password',
  'auth/invalid-email': 'auth_invalid_email',
  'auth/network-request-failed': 'auth_network_error',
  'auth/operation-not-allowed': 'auth_operation_not_allowed',
};

function validatePassword(pw: string): I18nKey | null {
  if (pw.length < 6) return 'auth_password_min';
  if (!/[A-Z]/.test(pw)) return 'auth_password_upper';
  if (!/[0-9]/.test(pw)) return 'auth_password_number';
  if (!/[^A-Za-z0-9]/.test(pw)) return 'auth_password_special';
  return null;
}

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Auth'>;
  route: { params?: { initialTab?: 'login' | 'register'; initialEmail?: string } };
};

export default function AuthScreen({ navigation, route }: Props) {
  const t = useT();
  const initialTab = route.params?.initialTab || 'login';
  const [activeTab, setActiveTab] = useState<'login' | 'register'>(initialTab);
  
  // Common states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // Login specific states
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  
  // Register specific states
  const [name, setName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const { promptAsync: googlePrompt, disabled: googleDisabled, loading: googleLoading } = useGoogleSignIn(setError);
  const { promptAsync: fbPrompt, disabled: fbDisabled, loading: fbLoading } = useFacebookSignIn(setError);
  const {
    promptAsync: applePrompt,
    available: appleAvailable,
    disabled: appleDisabled,
    loading: appleLoading,
  } = useAppleSignIn(setError);
  const socialLoading = googleLoading || fbLoading || appleLoading;
  
  const user = useAuthStore((s) => s.user);

  // If user is logged in, navigate to MainTabs
  useEffect(() => {
    if (user) {
      console.log(`🚀 AuthScreen: User logged in (${user.email}), navigating to MainTabs`);
      navigation.replace('MainTabs');
    }
  }, [user, navigation]);

  // Load last email on mount
  useEffect(() => {
    const loadLastEmail = async () => {
      try {
        const [lastEmail, nextTab, persistMode] = await Promise.all([
          AsyncStorage.getItem('surf_last_email'),
          AsyncStorage.getItem('surf_next_auth_tab'),
          getAuthPersistMode(),
        ]);
        const initialEmail = route.params?.initialEmail ?? lastEmail;
        if (initialEmail) {
          setLoginEmail(initialEmail);
          setRegisterEmail(initialEmail);
        }
        if (nextTab === 'login' || nextTab === 'register') {
          setActiveTab(nextTab);
          await AsyncStorage.removeItem('surf_next_auth_tab');
        }
        setRememberMe(persistMode !== 'session');
      } catch (e) {
        console.log('Error loading last email:', e);
      }
    };
    loadLastEmail();
  }, []);

  const switchTab = (tab: 'login' | 'register') => {
    setActiveTab(tab);
    setError('');
    // Optionally clear passwords when switching
    if (tab === 'login') {
      setRegisterPassword('');
      setConfirmPassword('');
    } else {
      setLoginPassword('');
    }
  };

  const handleLogin = async () => {
    if (!loginEmail || !loginPassword) { setError(t('auth_required_login')); return; }
    setLoading(true); setError('');
    try {
      // Bypass auth logic...
      const devModeOn = isDevModeEnabled();
      const clearAuthOn = shouldClearAuthOnStartup();
      const isTestingAuth = devModeOn && (require('@/lib/debug-config').getDebugScreen() === 'Auth');
      const bypassAuth = (devModeOn || clearAuthOn) && !isTestingAuth;
      
      if (bypassAuth) {
        console.log('✅ Bypass auth mode: Setting mock user and navigating to MainTabs');
        useAuthStore.getState().setUser({
          uid: 'dev-mock-uid',
          email: 'dev@mock.com',
          displayName: 'Dev Mode User',
          photoURL: '',
          emailVerified: true,
        } as any);
        navigation.replace('MainTabs');
        return;
      }

      console.log('🔐 Normal mode: Attempting real Firebase auth...');
      await setAuthPersistence(rememberMe);
      await signIn(loginEmail.trim(), loginPassword);
      await AsyncStorage.setItem('surf_last_email', loginEmail.trim());
      
      const currentUser = getCurrentUser();
      if (currentUser) {
        useAuthStore.getState().setUser(currentUser);
      }
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      setError(LOGIN_ERRORS[code] ? t(LOGIN_ERRORS[code]) : t('auth_login_failed'));
    } finally { setLoading(false); }
  };

  const handleRegister = async () => {
    setError('');
    if (!name || !registerEmail || !registerPassword || !confirmPassword) {
      setError(t('auth_required_register')); return;
    }
    const pwError = validatePassword(registerPassword);
    if (pwError) { setError(t(pwError)); return; }
    if (registerPassword !== confirmPassword) { setError(t('auth_password_mismatch')); return; }
    
    setLoading(true);
    try {
      await setAuthPersistence(true);
      await signUp(registerEmail.trim(), registerPassword, name.trim());
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      setError(REGISTER_ERRORS[code] ? t(REGISTER_ERRORS[code]) : t('auth_register_failed'));
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          {/* ── Logo ── */}
          <View style={s.logoWrap}>
            <Image source={require('../../assets/SurfLogo.png')} style={s.logo} resizeMode="contain" />
            <Text style={s.tagline}>{t('app_tagline')} <Text style={s.tagCyan}>Surf</Text></Text>
          </View>

          {/* ── Card ── */}
          <View style={s.card}>
            {/* Tab bar */}
            <View style={s.tabBar}>
              <TouchableOpacity 
                style={activeTab === 'login' ? s.tabActive : s.tabInactive} 
                onPress={() => switchTab('login')}
              >
                <Text style={activeTab === 'login' ? s.tabActiveText : s.tabInactiveText}>{t('auth_login')}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={activeTab === 'register' ? s.tabActive : s.tabInactive} 
                onPress={() => switchTab('register')}
              >
                <Text style={activeTab === 'register' ? s.tabActiveText : s.tabInactiveText}>{t('auth_register')}</Text>
              </TouchableOpacity>
            </View>

            {activeTab === 'login' ? (
              // ================= LOGIN FORM =================
              <View>
                <Text style={s.label}>{t('auth_email')}</Text>
                <TextInput
                  style={s.input}
                  placeholder="you@example.com"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={loginEmail}
                  onChangeText={setLoginEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />

                <Text style={s.label}>{t('auth_password')}</Text>
                <View style={s.pwWrap}>
                  <TextInput
                    style={[s.input, { flex: 1, marginBottom: 0 }]}
                    placeholder="••••••••"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    value={loginPassword}
                    onChangeText={setLoginPassword}
                    secureTextEntry={!showPassword}
                    autoComplete="password"
                  />
                  <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPassword(v => !v)}>
                    <Text style={s.eyeText}>{showPassword ? '🙈' : '👁'}</Text>
                  </TouchableOpacity>
                </View>

                <View style={s.formRow}>
                  <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword' as never)}>
                    <Text style={s.forgotText}>{t('auth_forgot_password')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={s.rememberMeBtn}
                    onPress={() => setRememberMe(!rememberMe)}
                  >
                    <View style={[s.checkbox, rememberMe && s.checkboxChecked]}>
                      {rememberMe && <Text style={s.checkmark}>✓</Text>}
                    </View>
                    <Text style={s.rememberMeText}>{t('auth_remember_me')}</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={[s.submitBtn, (loading || socialLoading) && s.disabled]} onPress={handleLogin} disabled={loading || socialLoading}>
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.submitText}>{t('auth_login')}</Text>}
                </TouchableOpacity>
              </View>
            ) : (
              // ================= REGISTER FORM =================
              <View>
                <Text style={s.label}>{t('auth_display_name')}</Text>
                <TextInput
                  style={s.input}
                  placeholder={t('auth_name_placeholder')}
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={name}
                  onChangeText={setName}
                />

                <Text style={s.label}>{t('auth_email')}</Text>
                <TextInput
                  style={s.input}
                  placeholder="you@example.com"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={registerEmail}
                  onChangeText={setRegisterEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />

                <Text style={s.label}>{t('auth_password')}</Text>
                <View style={s.pwWrap}>
                  <TextInput
                    style={[s.input, { flex: 1, marginBottom: 0 }]}
                    placeholder={t('auth_password_min')}
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    value={registerPassword}
                    onChangeText={setRegisterPassword}
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPassword(v => !v)}>
                    <Text style={s.eyeText}>{showPassword ? '🙈' : '👁'}</Text>
                  </TouchableOpacity>
                </View>

                <Text style={s.label}>{t('auth_confirm_password')}</Text>
                <View style={s.pwWrap}>
                  <TextInput
                    style={[s.input, { flex: 1, marginBottom: 0 }]}
                    placeholder={t('auth_confirm_placeholder')}
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPassword(v => !v)}>
                    <Text style={s.eyeText}>{showPassword ? '🙈' : '👁'}</Text>
                  </TouchableOpacity>
                </View>

                <View style={s.hints}>
                  {[t('auth_password_min'), t('auth_password_upper'), t('auth_password_number'), t('auth_password_special')].map(h => (
                    <Text key={h} style={s.hintText}>• {h}</Text>
                  ))}
                </View>

                <TouchableOpacity style={[s.submitBtn, (loading || socialLoading) && s.disabled]} onPress={handleRegister} disabled={loading || socialLoading}>
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.submitText}>{t('auth_create_account')}</Text>}
                </TouchableOpacity>
              </View>
            )}

            {/* Error */}
            {!!error && (
              <View style={s.errorBox}><Text style={s.errorText}>⚠ {error}</Text></View>
            )}

            {/* Divider */}
            <View style={s.divider}>
              <View style={s.dividerLine} />
              <Text style={s.dividerText}>{t('auth_or')}</Text>
              <View style={s.dividerLine} />
            </View>

            {/* Google */}
            <TouchableOpacity style={[s.googleBtn, (loading || socialLoading || googleDisabled) && s.disabled]} onPress={() => { setError(''); googlePrompt(); }} disabled={loading || socialLoading || googleDisabled}>
              <View style={s.gCircle}><Text style={s.gLetter}>G</Text></View>
              <Text style={s.socialText}>{t('auth_continue_with', { action: activeTab === 'login' ? t('auth_login') : t('auth_register'), provider: 'Google' })}</Text>
            </TouchableOpacity>

            {/* Facebook */}
            <TouchableOpacity style={[s.fbBtn, (loading || socialLoading || fbDisabled) && s.disabled]} onPress={() => { setError(''); fbPrompt(); }} disabled={loading || socialLoading || fbDisabled}>
              <Text style={s.fbLetter}>f</Text>
              <Text style={s.fbText}>{t('auth_continue_with', { action: activeTab === 'login' ? t('auth_login') : t('auth_register'), provider: 'Facebook' })}</Text>
            </TouchableOpacity>

            {appleAvailable && (
              <View style={[s.appleBtnWrap, (loading || socialLoading || appleDisabled) && s.disabled]} pointerEvents={loading || socialLoading || appleDisabled ? 'none' : 'auto'}>
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={
                    activeTab === 'login'
                      ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                      : AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
                  }
                  buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                  cornerRadius={12}
                  style={s.appleBtn}
                  onPress={() => {
                    setError('');
                    applePrompt();
                  }}
                />
              </View>
            )}
          </View>

          {/* Switch */}
          <View style={s.switchRow}>
            <Text style={s.switchLabel}>
              {activeTab === 'login' ? t('auth_no_account') : t('auth_has_account')}
            </Text>
            <TouchableOpacity onPress={() => switchTab(activeTab === 'login' ? 'register' : 'login')}>
              <Text style={s.switchLink}>
                {activeTab === 'login' ? t('auth_register_now') : t('auth_login')}
              </Text>
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

  /* Forgot & Remember */
  formRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    marginBottom: 16 
  },
  forgotText: { color: '#06b6d4', fontSize: 13 },
  rememberMeBtn: { 
    flexDirection: 'row', 
    alignItems: 'center',
  },
  checkbox: {
    width: 18, height: 18, borderRadius: 4, borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginRight: 6,
  },
  checkboxChecked: { backgroundColor: '#06b6d4', borderColor: '#06b6d4' },
  checkmark: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  rememberMeText: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '500' },

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
  appleBtnWrap: {
    height: 48,
    marginTop: 10,
  },
  appleBtn: {
    width: '100%',
    height: 48,
  },

  /* Switch */
  switchRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 4 },
  switchLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 14 },
  switchLink: { color: '#06b6d4', fontWeight: '600', fontSize: 14 },
});
