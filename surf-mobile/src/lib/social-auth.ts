import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Google from 'expo-auth-session/providers/google';
import * as Facebook from 'expo-auth-session/providers/facebook';
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import type { AuthCredential } from 'firebase/auth';
import {
  FacebookAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  updateProfile,
} from 'firebase/auth';
import { auth, setAuthPersistence } from '@/lib/firebase/auth';

const MISSING_GOOGLE_CLIENT_ID = 'missing-google-client-id';
const MISSING_FACEBOOK_CLIENT_ID = 'missing-facebook-client-id';
const NONCE_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._';

WebBrowser.maybeCompleteAuthSession();

function getProviderErrorMessage(code: string, provider: 'Google' | 'Facebook' | 'Apple') {
  if (code === 'auth/account-exists-with-different-credential') {
    return 'Email đã liên kết với phương thức đăng nhập khác.';
  }
  if (code === 'auth/operation-not-allowed') {
    return `Đăng nhập ${provider} chưa được bật trong Firebase.`;
  }
  if (code === 'auth/network-request-failed') {
    return 'Lỗi kết nối mạng.';
  }
  return `Đăng nhập ${provider} thất bại. Vui lòng thử lại.`;
}

function createNonce(length = 32) {
  const bytes = Crypto.getRandomBytes(length);
  return Array.from(bytes, (byte) => NONCE_CHARSET[byte % NONCE_CHARSET.length]).join('');
}

async function signInToFirebase(credential: AuthCredential) {
  await setAuthPersistence(true);
  return signInWithCredential(auth, credential);
}

export function useGoogleSignIn(onError?: (msg: string) => void) {
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const [loading, setLoading] = useState(false);

  const configuredWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  const configuredAndroidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  const configuredIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const platformClientId =
    Platform.OS === 'android'
      ? configuredAndroidClientId
      : Platform.OS === 'ios'
        ? configuredIosClientId
        : configuredWebClientId;
  const isExpoGo =
    Platform.OS !== 'web' &&
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: configuredWebClientId || MISSING_GOOGLE_CLIENT_ID,
    androidClientId: configuredAndroidClientId || MISSING_GOOGLE_CLIENT_ID,
    iosClientId: configuredIosClientId || MISSING_GOOGLE_CLIENT_ID,
  });

  useEffect(() => {
    if (__DEV__ && request) {
      console.log('Google OAuth redirect URI:', request.redirectUri);
    }
  }, [request]);

  useEffect(() => {
    if (!response) return;

    if (response.type === 'success') {
      const idToken = response.params?.id_token;
      if (!idToken) {
        setLoading(false);
        onErrorRef.current?.('Không nhận được token từ Google.');
        return;
      }

      const credential = GoogleAuthProvider.credential(idToken);
      signInToFirebase(credential)
        .catch((err) => {
          const code = (err as { code?: string }).code ?? '';
          onErrorRef.current?.(getProviderErrorMessage(code, 'Google'));
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
      if (response.type === 'error') {
        onErrorRef.current?.(response.error?.message ?? 'Đăng nhập Google thất bại.');
      }
    }
  }, [response]);

  const start = useCallback(async () => {
    if (isExpoGo) {
      onErrorRef.current?.(
        'Google Auth không chạy ổn trong Expo Go. Hãy dùng development build hoặc bản EAS build để redirect URI khớp app.'
      );
      return;
    }

    if (!configuredWebClientId || !platformClientId || !request) {
      onErrorRef.current?.('Thiếu Google client ID cho nền tảng hiện tại.');
      return;
    }

    setLoading(true);
    const result = await promptAsync();
    if (result.type !== 'success') {
      setLoading(false);
    }
  }, [configuredWebClientId, isExpoGo, platformClientId, promptAsync, request]);

  return {
    promptAsync: start,
    disabled: !request || loading,
    loading,
  };
}

export function useFacebookSignIn(onError?: (msg: string) => void) {
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const [loading, setLoading] = useState(false);

  const configuredClientId = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID;
  const clientId = configuredClientId || MISSING_FACEBOOK_CLIENT_ID;

  const [request, response, promptAsync] = Facebook.useAuthRequest({
    clientId,
  });

  useEffect(() => {
    if (!response) return;

    if (response.type === 'success') {
      const accessToken = response.params?.access_token;
      if (!accessToken) {
        setLoading(false);
        onErrorRef.current?.('Không nhận được token từ Facebook.');
        return;
      }

      const credential = FacebookAuthProvider.credential(accessToken);
      signInToFirebase(credential)
        .catch((err) => {
          const code = (err as { code?: string }).code ?? '';
          onErrorRef.current?.(getProviderErrorMessage(code, 'Facebook'));
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
      if (response.type === 'error') {
        onErrorRef.current?.(response.error?.message ?? 'Đăng nhập Facebook thất bại.');
      }
    }
  }, [response]);

  const start = useCallback(async () => {
    if (!configuredClientId || !request) {
      onErrorRef.current?.('Thiếu Facebook app ID.');
      return;
    }

    setLoading(true);
    const result = await promptAsync();
    if (result.type !== 'success') {
      setLoading(false);
    }
  }, [configuredClientId, promptAsync, request]);

  return { promptAsync: start, disabled: !request || loading, loading };
}

export function useAppleSignIn(onError?: (msg: string) => void) {
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const [available, setAvailable] = useState(false);
  const [checking, setChecking] = useState(Platform.OS === 'ios');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    if (Platform.OS !== 'ios') {
      setChecking(false);
      setAvailable(false);
      return;
    }

    AppleAuthentication.isAvailableAsync()
      .then((isAvailable) => {
        if (mounted) setAvailable(isAvailable);
      })
      .catch(() => {
        if (mounted) setAvailable(false);
      })
      .finally(() => {
        if (mounted) setChecking(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const start = useCallback(async () => {
    if (!available) {
      onErrorRef.current?.('Đăng nhập Apple chỉ khả dụng trên thiết bị iOS hỗ trợ.');
      return;
    }

    setLoading(true);
    try {
      const rawNonce = createNonce();
      const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
      const appleCredential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (!appleCredential.identityToken) {
        onErrorRef.current?.('Không nhận được token từ Apple.');
        return;
      }

      const provider = new OAuthProvider('apple.com');
      const credential = provider.credential({
        idToken: appleCredential.identityToken,
        rawNonce,
      });
      const result = await signInToFirebase(credential);

      const displayName = appleCredential.fullName
        ? AppleAuthentication.formatFullName(appleCredential.fullName)
        : '';
      if (displayName && !result.user.displayName) {
        await updateProfile(result.user, { displayName });
      }
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      if (code === 'ERR_REQUEST_CANCELED') return;
      onErrorRef.current?.(getProviderErrorMessage(code, 'Apple'));
    } finally {
      setLoading(false);
    }
  }, [available]);

  return {
    promptAsync: start,
    available,
    disabled: checking || !available || loading,
    loading,
  };
}
