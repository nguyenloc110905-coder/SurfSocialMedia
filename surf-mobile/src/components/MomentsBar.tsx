import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useUserStore } from '@/stores/userStore';
import type { MomentGroup, MomentItem } from '@/types/moments';
import MomentViewer from './MomentViewer';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Feed'>;
};

const { width: SW } = Dimensions.get('window');
const CARD_W = Math.min(116, Math.max(98, (SW - 48) / 3.35));
const CARD_H = Math.round(CARD_W * 1.55);
const MOMENTS_CACHE_TTL = 90_000;

let cachedGroups: MomentGroup[] = [];
let cachedGroupsLoadedAt = 0;

const DARK = {
  card: '#15191c',
  border: '#22313a',
  text: '#e2e8f0',
  subtext: '#94a3b8',
  muted: '#64748b',
  accent: '#06b6d4',
  accentMid: '#3b82f6',
  accent2: '#8b5cf6',
  ring: '#38bdf8',
  wash: 'rgba(6,182,212,0.16)',
  wash2: 'rgba(139,92,246,0.08)',
};
const LIGHT = {
  card: '#ffffff',
  border: '#e2e8f0',
  text: '#1f2937',
  subtext: '#64748b',
  muted: '#94a3b8',
  accent: '#06b6d4',
  accentMid: '#3b82f6',
  accent2: '#7c3aed',
  ring: '#0284c7',
  wash: 'rgba(14,165,233,0.10)',
  wash2: 'rgba(124,58,237,0.06)',
};

function initials(name?: string | null) {
  return (name || 'U')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function isVideoUrl(url?: string | null) {
  return !!url && (/\/video\/upload\//i.test(url) || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url));
}

function videoPoster(url: string) {
  if (!url.includes('res.cloudinary.com')) return null;
  return url
    .replace('/video/upload/', '/image/upload/w_360,q_auto,f_jpg,so_0/')
    .replace(/\.(mp4|mov|webm|m4v)(\?.*)?$/i, '.jpg');
}

function momentPoster(moment?: MomentItem | null) {
  if (!moment) return null;
  return moment.thumbnailUrl || moment.posterUrl || videoPoster(moment.mediaUrl);
}

function prefetchMomentMedia(groups: MomentGroup[]) {
  groups
    .flatMap((group) => group.moments)
    .slice(0, 12)
    .forEach((moment) => {
      if (moment.mediaType === 'image') {
        Image.prefetch(moment.mediaUrl).catch(() => {});
        return;
      }
      const poster = momentPoster(moment);
      if (poster) Image.prefetch(poster).catch(() => {});
    });
}

export default function MomentsBar({ navigation }: Props) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;
  const user = useAuthStore((state) => state.user);
  const profile = useUserStore((state) => state.profile);
  const avatarUrl = profile?.photoURL || user?.photoURL || '';
  const [groups, setGroupsState] = useState<MomentGroup[]>(() => cachedGroups);
  const [loading, setLoading] = useState(() => cachedGroups.length === 0);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const inFlightRef = React.useRef(false);

  const setGroups = useCallback((next: MomentGroup[]) => {
    cachedGroups = next;
    cachedGroupsLoadedAt = Date.now();
    setGroupsState(next);
    prefetchMomentMedia(next);
  }, []);

  const load = useCallback(async (force = false) => {
    if (inFlightRef.current) return;
    if (!force && cachedGroupsLoadedAt && Date.now() - cachedGroupsLoadedAt < MOMENTS_CACHE_TTL) {
      if (groups.length === 0 && cachedGroups.length > 0) setGroupsState(cachedGroups);
      setLoading(false);
      return;
    }
    inFlightRef.current = true;
    try {
      const data = await api.get<{ groups: MomentGroup[] }>('/api/moments/feed');
      setGroups(data.groups ?? []);
    } catch {
      if (cachedGroups.length > 0) setGroupsState(cachedGroups);
      else setGroups([]);
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [groups.length, setGroups]);

  useEffect(() => {
    void load(true);
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const data = useMemo(() => [{ type: 'create' as const }, ...groups.map((group) => ({ type: 'group' as const, group }))], [groups]);

  return (
    <View style={[s.wrap, { backgroundColor: C.card, borderColor: C.border }]}>
      <LinearGradient
        colors={['#06b6d4', '#3b82f6', '#8b5cf6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={s.accentRailGradient}
      />
      <View style={[s.washBand, { backgroundColor: C.wash }]} />
      <View style={[s.washBandSoft, { backgroundColor: C.wash2 }]} />
      <FlatList
        horizontal
        data={data}
        keyExtractor={(item) => item.type === 'create' ? 'create' : item.group.userId}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.list}
        renderItem={({ item, index }) => {
          if (item.type === 'create') {
            return (
              <TouchableOpacity
                style={s.storyItem}
                activeOpacity={0.84}
                onPress={() => navigation.navigate('CreateMoment')}
              >
                <LinearGradient
                  colors={['#06b6d4', '#3b82f6', '#8b5cf6']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={s.storyGradientBorder}
                />
                <View style={[s.storyCard, { backgroundColor: scheme === 'dark' ? '#172033' : '#f8fafc', borderWidth: 0 }]}>
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={s.cardImage} />
                  ) : (
                    <View style={[s.cardImage, { backgroundColor: scheme === 'dark' ? '#253347' : '#e2e8f0' }]} />
                  )}
                  <View style={s.cardScrim} />
                  <View style={[s.plusWrap, { backgroundColor: '#0ea5e9', borderColor: '#fff' }]}>
                    <Ionicons name="add" size={22} color="#fff" />
                  </View>
                  <Text style={s.cardLabel} numberOfLines={2}>Tạo Moment</Text>
                </View>
              </TouchableOpacity>
            );
          }

          const latest = item.group.moments[0];
          const mediaUrl = latest?.mediaUrl;
          const poster = latest?.mediaType === 'video' ? momentPoster(latest) : mediaUrl;
          const own = item.group.userId === user?.uid;

          return (
            <TouchableOpacity
              style={s.storyItem}
              activeOpacity={0.86}
              onPress={() => setViewerIndex(index - 1)}
            >
              <LinearGradient
                colors={['#06b6d4', '#3b82f6', '#8b5cf6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.storyGradientBorder}
              />
              <View style={[
                s.storyCard,
                {
                  borderColor: item.group.hasUnviewed ? 'transparent' : C.border,
                  borderWidth: item.group.hasUnviewed ? 0 : 1,
                },
              ]}>
                {poster ? (
                  <Image source={{ uri: poster }} style={s.cardImage} resizeMode="cover" />
                ) : (
                  <View style={[s.cardImage, { backgroundColor: scheme === 'dark' ? '#253347' : '#e2e8f0' }]} />
                )}
                <View style={s.cardScrim} />
                {isVideoUrl(mediaUrl) && (
                  <View style={s.playPill}>
                    <Ionicons name="play" size={12} color="#fff" />
                  </View>
                )}
                
                {item.group.hasUnviewed && (
                  <View style={s.newBadge}>
                    <View style={s.newBadgeDot} />
                    <Text style={s.newBadgeText}>MỚI</Text>
                  </View>
                )}
                
                <View style={s.cardBottomBar}>
                  <View style={[s.avatarRingBottom, { borderColor: item.group.hasUnviewed ? '#38bdf8' : 'rgba(255,255,255,0.4)' }]}>
                    {item.group.userPhotoURL ? (
                      <Image source={{ uri: item.group.userPhotoURL }} style={s.avatar} />
                    ) : (
                      <View style={[s.avatar, { backgroundColor: C.accent }]}>
                        <Text style={s.avatarText}>{initials(item.group.userDisplayName)}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={s.cardLabelBottom} numberOfLines={1}>
                    {own ? 'Của bạn' : item.group.userDisplayName}
                  </Text>
                  <Text style={s.momentCountText}>
                    {item.group.moments.length} moment
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        ListFooterComponent={
          loading ? (
            <View style={s.loading}>
              <ActivityIndicator color={C.accent} />
            </View>
          ) : null
        }
      />
      {!loading && groups.length === 0 && (
        <Text style={[s.emptyText, { color: C.subtext }]}>Chia sẻ khoảnh khắc đầu tiên trong ngày.</Text>
      )}
      <MomentViewer
        visible={viewerIndex !== null}
        groups={groups}
        startGroupIndex={viewerIndex ?? 0}
        currentUserId={user?.uid ?? ''}
        onClose={() => setViewerIndex(null)}
        onGroupsChange={setGroups}
      />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    borderBottomWidth: 1,
    marginHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderRadius: 20,
    overflow: 'hidden',
    paddingTop: 22,
    paddingBottom: 16,
  },
  accentRailGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  washBand: {
    position: 'absolute',
    left: -26,
    right: -26,
    bottom: -22,
    height: 72,
    borderTopLeftRadius: 130,
    borderTopRightRadius: 86,
  },
  washBandSoft: {
    position: 'absolute',
    left: -34,
    right: -34,
    top: 20,
    height: 62,
    borderBottomLeftRadius: 125,
    borderBottomRightRadius: 150,
    transform: [{ rotate: '-2deg' }],
  },
  list: {
    paddingHorizontal: 14,
    gap: 8,
  },
  storyItem: {
    width: CARD_W,
    position: 'relative',
  },
  createCard: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 18,
    borderWidth: 3,
    overflow: 'hidden',
  },
  storyCard: {
    width: CARD_W - 6,
    height: CARD_H - 6,
    margin: 3,
    borderRadius: 15,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
  },
  storyGradientBorder: {
    position: 'absolute',
    width: CARD_W,
    height: CARD_H,
    borderRadius: 18,
    overflow: 'hidden',
  },
  cardImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  cardScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.24)',
  },
  plusWrap: {
    position: 'absolute',
    bottom: 34,
    alignSelf: 'center',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#0ea5e9',
    borderWidth: 3,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarRing: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    padding: 2,
    backgroundColor: 'rgba(15,23,42,0.55)',
  },
  newBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#0ea5e9',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 4,
    zIndex: 10,
  },
  newBadgeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#fff',
  },
  newBadgeText: {
    color: '#fff',
    fontSize: 8.5,
    fontWeight: '800',
  },
  cardBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingTop: 18,
    paddingBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomLeftRadius: 15,
    borderBottomRightRadius: 15,
  },
  avatarRingBottom: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 1.5,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    marginTop: -30,
    marginBottom: 4,
  },
  cardLabelBottom: {
    color: '#fff',
    fontSize: 10.5,
    fontWeight: '800',
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  momentCountText: {
    color: '#94a3b8',
    fontSize: 8.5,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 1,
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  playPill: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    color: '#fff',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  loading: {
    width: 44,
    height: CARD_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    paddingHorizontal: 14,
    paddingTop: 8,
    fontSize: 12,
  },
});
