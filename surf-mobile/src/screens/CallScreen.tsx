import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getSocket } from '@/lib/socket';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation';
import { useAuthStore } from '@/stores/authStore';

type Props = NativeStackScreenProps<RootStackParamList, 'Call'>;

export default function CallScreen({ route, navigation }: Props) {
  const { conversationId, peerUid, isHost, callId: initialCallId, peerName, peerAvatar } = route.params;
  const user = useAuthStore(state => state.user);
  const socket = getSocket();

  const [callState, setCallState] = useState<'ringing' | 'connected' | 'ended'>(isHost ? 'ringing' : 'ringing');
  const [callId, setCallId] = useState(initialCallId || `call_${Date.now()}`);
  const [duration, setDuration] = useState(0);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isHost) {
      socket.emit('call:invite', {
        callId,
        conversationId,
        fromUserId: user?.uid,
        toUserId: peerUid,
        fromName: user?.email,
        fromAvatarUrl: null,
        mode: 'audio'
      });
    }

    const onAccepted = (payload: any) => {
      if (payload.callId === callId) {
        setCallState('connected');
        startTimer();
      }
    };

    const onDeclined = (payload: any) => {
      if (payload.callId === callId) {
        setCallState('ended');
        setTimeout(() => navigation.goBack(), 1500);
      }
    };

    const onEnded = (payload: any) => {
      if (payload.callId === callId) {
        setCallState('ended');
        setTimeout(() => navigation.goBack(), 1500);
      }
    };

    socket.on('call:accepted', onAccepted);
    socket.on('call:declined', onDeclined);
    socket.on('call:ended', onEnded);

    return () => {
      socket.off('call:accepted', onAccepted);
      socket.off('call:declined', onDeclined);
      socket.off('call:ended', onEnded);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callId, conversationId, isHost, peerUid, socket, user?.uid, navigation]);

  const startTimer = () => {
    timerRef.current = setInterval(() => {
      setDuration(prev => prev + 1);
    }, 1000);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleAccept = () => {
    socket.emit('call:accept', {
      callId,
      conversationId,
      fromUserId: peerUid,
      toUserId: user?.uid,
      mode: 'audio'
    });
    setCallState('connected');
    startTimer();
  };

  const handleDecline = () => {
    socket.emit('call:decline', {
      callId,
      conversationId,
      fromUserId: peerUid,
      toUserId: user?.uid,
      reason: 'declined'
    });
    setCallState('ended');
    setTimeout(() => navigation.goBack(), 1500);
  };

  const handleEnd = () => {
    socket.emit('call:end', {
      callId,
      conversationId,
      fromUserId: user?.uid,
      toUserId: peerUid,
      reason: 'ended'
    });
    setCallState('ended');
    setTimeout(() => navigation.goBack(), 1500);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.statusText}>
          {callState === 'ringing' ? (isHost ? 'Đang gọi...' : 'Cuộc gọi đến') : callState === 'connected' ? formatTime(duration) : 'Đã kết thúc'}
        </Text>
      </View>

      <View style={styles.center}>
        <View style={styles.avatarWrap}>
          {peerAvatar ? (
            <Image source={{ uri: peerAvatar }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarText}>{(peerName || peerUid || '?').charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </View>
        <Text style={styles.name}>{peerName || 'Người dùng'}</Text>
      </View>

      <View style={styles.footer}>
        {callState === 'ringing' && !isHost ? (
          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.btn, styles.btnDecline]} onPress={handleDecline}>
              <Ionicons name="close" size={32} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnAccept]} onPress={handleAccept}>
              <Ionicons name="call" size={32} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : callState !== 'ended' ? (
          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.btn, styles.btnEnd]} onPress={handleEnd}>
              <Ionicons name="call" size={32} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: { alignItems: 'center', marginTop: 40 },
  statusText: { color: '#94a3b8', fontSize: 18, fontWeight: '500' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  avatarWrap: { marginBottom: 20 },
  avatar: { width: 120, height: 120, borderRadius: 60 },
  avatarPlaceholder: { backgroundColor: '#3b82f6', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 48, fontWeight: 'bold' },
  name: { color: '#fff', fontSize: 28, fontWeight: 'bold' },
  footer: { paddingBottom: 60, alignItems: 'center' },
  actionRow: { flexDirection: 'row', gap: 40 },
  btn: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  btnAccept: { backgroundColor: '#22c55e' },
  btnDecline: { backgroundColor: '#ef4444' },
  btnEnd: { backgroundColor: '#ef4444' }
});
