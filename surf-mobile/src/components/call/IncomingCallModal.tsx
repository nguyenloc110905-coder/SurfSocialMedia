import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform, Vibration } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCallStore } from '@/stores/callStore';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/authStore';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function IncomingCallModal() {
  const { callId, conversationId, mode, callState, isHost, peer, resetCall, setCallState } = useCallStore();
  const user = useAuthStore(state => state.user);
  const navigation = useNavigation<NavigationProp>();

  // Only show when it's an incoming call (not host) and ringing
  const isVisible = callState === 'ringing' && !isHost && callId !== null;

  useEffect(() => {
    if (isVisible) {
      // Vibrate on Android
      if (Platform.OS === 'android') {
        Vibration.vibrate([1000, 2000, 1000, 2000], true); // pattern, repeat
      }
    } else {
      Vibration.cancel();
    }
    return () => Vibration.cancel();
  }, [isVisible]);

  if (!isVisible || !peer) return null;

  const handleAccept = () => {
    Vibration.cancel();
    if (!callId || !conversationId) return;
    setCallState('connected');

    // CallScreen sends call:accept after its WebRTC peer and signal listener are ready.
    navigation.navigate('Call', {
      callId,
      conversationId,
      peerUid: peer.uid,
      peerName: peer.name,
      peerAvatar: peer.avatarUrl ?? undefined,
      isHost: false,
      mode: mode ?? 'audio',
      acceptOnReady: true,
    });
  };

  const handleDecline = () => {
    Vibration.cancel();
    if (!callId || !conversationId) return;
    const socket = getSocket();
    socket.emit('call:decline', {
      callId,
      conversationId,
      fromUserId: user?.uid,
      toUserId: peer.uid,
      reason: 'declined'
    });
    resetCall();
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>{mode === 'video' ? 'Cuộc gọi Video đến' : 'Cuộc gọi Thoại đến'}</Text>
        </View>
        <View style={styles.body}>
          {peer.avatarUrl ? (
            <Image source={{ uri: peer.avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.placeholder]}>
              <Text style={styles.placeholderText}>{peer.name.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.name}>{peer.name}</Text>
        </View>
        <View style={styles.footer}>
          <TouchableOpacity style={[styles.btn, styles.declineBtn]} onPress={handleDecline}>
            <Ionicons name="close" size={32} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.acceptBtn]} onPress={handleAccept}>
            <Ionicons name={mode === 'video' ? 'videocam' : 'call'} size={32} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-start',
    paddingTop: 60,
    paddingHorizontal: 16,
    zIndex: 9999,
    elevation: 9999,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 1,
    borderColor: '#334155'
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: '600'
  },
  body: {
    alignItems: 'center',
    marginBottom: 30,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 16,
  },
  placeholder: {
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: '#fff',
    fontSize: 40,
    fontWeight: 'bold',
  },
  name: {
    color: '#f8fafc',
    fontSize: 24,
    fontWeight: 'bold',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 40,
  },
  btn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineBtn: {
    backgroundColor: '#ef4444',
  },
  acceptBtn: {
    backgroundColor: '#22c55e',
  }
});
