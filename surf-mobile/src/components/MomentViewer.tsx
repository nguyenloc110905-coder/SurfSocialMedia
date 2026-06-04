import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { api } from '@/lib/api';
import type { MomentGroup, MomentItem } from '@/types/moments';

type Props = {
  visible: boolean;
  groups: MomentGroup[];
  startGroupIndex: number;
  currentUserId: string;
  onClose: () => void;
  onGroupsChange: (groups: MomentGroup[]) => void;
};

const IMAGE_DURATION = 5000;
const VIDEO_DURATION = 12000;
const REACTIONS = ['❤️', '😍', '😂', '😮', '👏', '🔥'];
const { width: SW, height: SH } = Dimensions.get('window');

function initials(name?: string | null) {
  return (name || 'U').split(' ').filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

function ago(raw: MomentItem['createdAt']) {
  let ms = 0;
  if (!raw) return '';
  if (typeof raw === 'number') ms = raw;
  else if (typeof raw === 'string') ms = new Date(raw).getTime();
  else if (raw._seconds) ms = raw._seconds * 1000;
  else if (raw.seconds) ms = raw.seconds * 1000;
  const diff = Math.max(0, Date.now() - ms);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'vừa xong';
  if (mins < 60) return `${mins} phút`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} giờ`;
  return `${Math.floor(hrs / 24)} ngày`;
}

function MomentVideo({ uri, active, muted }: { uri: string; active: boolean; muted: boolean }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = muted;
  });

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  useEffect(() => {
    try {
      if (active) player.play();
      else player.pause();
    } catch {
      // Native player may be recycling during modal transitions.
    }
    return () => {
      try {
        player.pause();
      } catch {
        // ignore
      }
    };
  }, [active, player]);

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      nativeControls={false}
      fullscreenOptions={{ enable: false }}
      allowsPictureInPicture={false}
    />
  );
}

export default function MomentViewer({
  visible,
  groups,
  startGroupIndex,
  currentUserId,
  onClose,
  onGroupsChange,
}: Props) {
  const [groupIndex, setGroupIndex] = useState(startGroupIndex);
  const [momentIndex, setMomentIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [reply, setReply] = useState('');
  const [mediaReady, setMediaReady] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const viewedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!visible) return;
    setGroupIndex(startGroupIndex);
    setMomentIndex(0);
    setPaused(false);
    progress.setValue(0);
  }, [progress, startGroupIndex, visible]);

  const group = groups[groupIndex];
  const moment = group?.moments[momentIndex];
  const isOwn = group?.userId === currentUserId;

  const duration = moment?.mediaType === 'video' ? VIDEO_DURATION : IMAGE_DURATION;

  useEffect(() => {
    setMediaReady(moment?.mediaType === 'video');
    progress.setValue(0);
  }, [moment?.id, moment?.mediaType, progress]);

  const goNext = useCallback(() => {
    progress.stopAnimation();
    progress.setValue(0);
    if (!group) return;
    if (momentIndex < group.moments.length - 1) {
      setMomentIndex((idx) => idx + 1);
      return;
    }
    if (groupIndex < groups.length - 1) {
      setGroupIndex((idx) => idx + 1);
      setMomentIndex(0);
      return;
    }
    onClose();
  }, [group, groupIndex, groups.length, momentIndex, onClose, progress]);

  const goPrev = useCallback(() => {
    progress.stopAnimation();
    progress.setValue(0);
    if (momentIndex > 0) {
      setMomentIndex((idx) => idx - 1);
      return;
    }
    if (groupIndex > 0) {
      const prevGroup = groups[groupIndex - 1];
      setGroupIndex((idx) => idx - 1);
      setMomentIndex(Math.max(0, prevGroup.moments.length - 1));
    }
  }, [groupIndex, groups, momentIndex, progress]);

  useEffect(() => {
    if (!visible || !moment || paused || !mediaReady) return;
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) goNext();
    });

    return () => progress.stopAnimation();
  }, [duration, goNext, mediaReady, moment?.id, paused, progress, visible]);

  useEffect(() => {
    if (!visible || !moment || viewedRef.current.has(moment.id)) return;
    viewedRef.current.add(moment.id);
    api.post(`/api/moments/${moment.id}/view`, {}).catch(() => {});
  }, [moment?.id, visible]);

  const progressBars = useMemo(() => group?.moments ?? [], [group?.moments]);

  const react = async (emoji: string) => {
    if (!moment) return;
    const previous = groups;
    const optimistic = groups.map((g, gi) => {
      if (gi !== groupIndex) return g;
      return {
        ...g,
        moments: g.moments.map((m) => {
          if (m.id !== moment.id) return m;
          return {
            ...m,
            reactions: {
              ...(m.reactions ?? {}),
              [emoji]: ((m.reactions ?? {})[emoji] ?? 0) + 1,
            },
          };
        }),
      };
    });
    onGroupsChange(optimistic);
    try {
      const res = await api.post<{ reactions: Record<string, number> }>(`/api/moments/${moment.id}/react`, { emoji });
      onGroupsChange(optimistic.map((g, gi) => gi !== groupIndex ? g : {
        ...g,
        moments: g.moments.map((m) => m.id === moment.id ? { ...m, reactions: res.reactions } : m),
      }));
    } catch {
      onGroupsChange(previous);
    }
  };

  const remove = () => {
    if (!moment) return;
    Alert.alert('Xóa Moment', 'Moment này sẽ biến mất khỏi story của bạn.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/api/moments/${moment.id}`);
            const nextGroups = groups
              .map((g, gi) => gi !== groupIndex ? g : { ...g, moments: g.moments.filter((m) => m.id !== moment.id) })
              .filter((g) => g.moments.length > 0);
            onGroupsChange(nextGroups);
            if (!nextGroups.length) onClose();
            else if (!nextGroups[groupIndex]) setGroupIndex(Math.max(0, nextGroups.length - 1));
            else setMomentIndex((idx) => Math.min(idx, nextGroups[groupIndex].moments.length - 1));
          } catch (err) {
            Alert.alert('Không thể xóa', err instanceof Error ? err.message : 'Vui lòng thử lại.');
          }
        },
      },
    ]);
  };

  if (!group || !moment) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.root}>
        {moment.mediaType === 'image' ? (
          <Image
            source={{ uri: moment.mediaUrl }}
            style={[StyleSheet.absoluteFill, { transform: [{ scale: 1.01 }] }]}
            resizeMode="cover"
            onLoadEnd={() => setMediaReady(true)}
          />
        ) : (
          <MomentVideo uri={moment.mediaUrl} active={visible && !paused} muted={muted || moment.audioMode === 'music'} />
        )}
        <View style={s.topShade} />
        <View style={s.bottomShade} />

        <View style={s.progressRow}>
          {progressBars.map((item, idx) => (
            <View key={item.id} style={s.progressTrack}>
              <Animated.View
                style={[
                  s.progressFill,
                  {
                    width: idx < momentIndex
                      ? '100%'
                      : idx > momentIndex
                        ? '0%'
                        : progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                  },
                ]}
              />
            </View>
          ))}
        </View>

        <View style={s.header}>
          {group.userPhotoURL ? (
            <Image source={{ uri: group.userPhotoURL }} style={s.headerAvatar} />
          ) : (
            <View style={[s.headerAvatar, s.headerAvatarFallback]}>
              <Text style={s.avatarText}>{initials(group.userDisplayName)}</Text>
            </View>
          )}
          <View style={s.headerText}>
            <Text style={s.name} numberOfLines={1}>{group.userDisplayName}</Text>
            <Text style={s.time}>{ago(moment.createdAt)}</Text>
          </View>
          {moment.mediaType === 'video' && (
            <TouchableOpacity style={s.iconBtn} onPress={() => setMuted((value) => !value)}>
              <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={21} color="#fff" />
            </TouchableOpacity>
          )}
          {isOwn && (
            <TouchableOpacity style={s.iconBtn} onPress={remove}>
              <Ionicons name="trash-outline" size={20} color="#fff" />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={s.iconBtn} onPress={onClose}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
        </View>

        {!!moment.textOverlay && (
          <View
            pointerEvents="none"
            style={[
              s.overlayTextWrap,
              {
                left: `${Math.max(5, Math.min(85, moment.textX ?? 50))}%` as any,
                top: `${Math.max(12, Math.min(78, moment.textY ?? 50))}%` as any,
                transform: [
                  { translateX: -SW * 0.35 },
                  { rotate: `${moment.textRotation ?? 0}deg` },
                ],
              },
            ]}
          >
            <Text
              style={[
                s.overlayText,
                {
                  color: moment.textColor || '#ffffff',
                  fontSize: Math.max(18, Math.min(36, moment.textSize ?? 26)),
                  backgroundColor: moment.textStyle === 'plain' ? 'transparent' : 'rgba(0,0,0,0.38)',
                },
              ]}
              numberOfLines={4}
            >
              {moment.textOverlay}
            </Text>
          </View>
        )}

        <Pressable
          style={s.leftTap}
          onPress={goPrev}
          onLongPress={() => setPaused(true)}
          onPressOut={() => setPaused(false)}
        />
        <Pressable
          style={s.rightTap}
          onPress={goNext}
          onLongPress={() => setPaused(true)}
          onPressOut={() => setPaused(false)}
        />

        <View style={s.bottom}>
          {!!moment.caption && <Text style={s.caption} numberOfLines={2}>{moment.caption}</Text>}
          {!isOwn ? (
            <>
              <View style={s.reactions}>
                {REACTIONS.map((emoji) => (
                  <TouchableOpacity key={emoji} style={s.reactionBtn} onPress={() => react(emoji)}>
                    <Text style={s.reactionText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={s.replyRow}>
                <TextInput
                  value={reply}
                  onChangeText={setReply}
                  placeholder="Gửi tin nhắn..."
                  placeholderTextColor="rgba(255,255,255,0.72)"
                  style={s.replyInput}
                />
                <TouchableOpacity style={s.sendBtn} onPress={() => setReply('')}>
                  <Ionicons name="send" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={s.ownerStats}>
              <Ionicons name="eye-outline" size={18} color="#fff" />
              <Text style={s.ownerStatsText}>{moment.viewCount ?? 0} lượt xem</Text>
              {Object.entries(moment.reactions ?? {}).slice(0, 3).map(([emoji, count]) => (
                <Text key={emoji} style={s.ownerStatsText}>{emoji} {count}</Text>
              ))}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
    width: SW,
    height: SH,
  },
  topShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 150,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  bottomShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 250,
    backgroundColor: 'rgba(0,0,0,0.34)',
  },
  progressRow: {
    position: 'absolute',
    top: 48,
    left: 10,
    right: 10,
    flexDirection: 'row',
    gap: 4,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#fff',
  },
  header: {
    position: 'absolute',
    top: 58,
    left: 12,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  headerAvatarFallback: {
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 12,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    marginLeft: 10,
  },
  name: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  time: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    marginTop: 1,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.24)',
    marginLeft: 4,
  },
  overlayTextWrap: {
    position: 'absolute',
    width: SW * 0.7,
    alignItems: 'center',
  },
  overlayText: {
    overflow: 'hidden',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    fontWeight: '900',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  leftTap: {
    position: 'absolute',
    left: 0,
    top: 120,
    bottom: 150,
    width: '38%',
  },
  rightTap: {
    position: 'absolute',
    right: 0,
    top: 120,
    bottom: 150,
    width: '62%',
  },
  bottom: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 24,
  },
  caption: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    marginBottom: 10,
  },
  reactions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  reactionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionText: {
    fontSize: 23,
  },
  replyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  replyInput: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    paddingHorizontal: 16,
    color: '#fff',
    fontSize: 14,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerStats: {
    minHeight: 42,
    borderRadius: 21,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(0,0,0,0.3)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ownerStatsText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});
