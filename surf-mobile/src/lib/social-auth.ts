import { useEffect, useRef } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as Facebook from 'expo-auth-session/providers/facebook';
import * as WebBrowser from 'expo-web-browser';
import { GoogleAuthProvider, FacebookAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from '@/lib/firebase/auth';

// Bắt buộc gọi để khép flow sau khi redirect trên Android/web
WebBrowser.maybeCompleteAuthSession();

/**
 * Hook đăng nhập bằng Google thông qua expo-auth-session + Firebase credential.
 * Cần điền EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID (và optionally ANDROID/IOS) trong .env
 */
export function useGoogleSignIn(onError?: (msg: string) => void) {
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  // Android và iOS yêu cầu client ID riêng. Khi chưa có, dùng webClientId làm fallback
  // để tránh crash trong Expo Go. Production cần tạo đủ client ID.
  const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || webClientId;
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || webClientId;

  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId,
    androidClientId,
    iosClientId,
  });

  useEffect(() => {
    if (!response) return;

    if (response.type === 'success') {
      const idToken = response.params?.id_token;
      if (!idToken) {
        onErrorRef.current?.('Không nhận được token từ Google.');
        return;
      }
      const credential = GoogleAuthProvider.credential(idToken);
      signInWithCredential(auth, credential).catch((err) => {
        const code = (err as { code?: string }).code ?? '';
        const msg =
          code === 'auth/account-exists-with-different-credential'
            ? 'Email đã liên kết với phương thức đăng nhập khác.'
            : 'Đăng nhập Google thất bại. Vui lòng thử lại.';
        onErrorRef.current?.(msg);
      });
    } else if (response.type === 'error') {
      onErrorRef.current?.(response.error?.message ?? 'Đăng nhập Google thất bại.');
    }
    // type === 'cancel' hoặc 'dismiss' — không báo lỗi
  }, [response]);

  return { promptAsync, disabled: !request };
}

/**
 * Hook đăng nhập bằng Facebook thông qua expo-auth-session + Firebase credential.
 * Cần điền EXPO_PUBLIC_FACEBOOK_APP_ID trong .env
 * Cần cấu hình OAuth redirect URI trong Facebook Developer Console.
 */
export function useFacebookSignIn(onError?: (msg: string) => void) {
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const [request, response, promptAsync] = Facebook.useAuthRequest({
    clientId: process.env.EXPO_PUBLIC_FACEBOOK_APP_ID ?? '',
  });

  useEffect(() => {
    if (!response) return;

    if (response.type === 'success') {
      const accessToken = response.params?.access_token;
      if (!accessToken) {
        onErrorRef.current?.('Không nhận được token từ Facebook.');
        return;
      }
      const credential = FacebookAuthProvider.credential(accessToken);
      signInWithCredential(auth, credential).catch((err) => {
        const code = (err as { code?: string }).code ?? '';
        const msg =
          code === 'auth/account-exists-with-different-credential'
            ? 'Email đã liên kết với phương thức đăng nhập khác.'
            : 'Đăng nhập Facebook thất bại. Vui lòng thử lại.';
        onErrorRef.current?.(msg);
      });
    } else if (response.type === 'error') {
      onErrorRef.current?.(response.error?.message ?? 'Đăng nhập Facebook thất bại.');
    }
  }, [response]);

  return { promptAsync, disabled: !request };
}
