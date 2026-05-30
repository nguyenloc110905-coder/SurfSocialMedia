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
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import type { MomentGroup } from '@/types/moments';
import MomentViewer from './MomentViewer';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Feed'>;
};

const { width: SW } = Dimensions.get('window');
const CARD_W = Math.min(116, Math.max(98, (SW - 48) / 3.35));
const CARD_H = Math.round(CARD_W * 1.55);

const DARK = {
  card: '#111827',
  border: '#243244',
  text: '#e2e8f0',
  subtext: '#94a3b8',
  muted: '#64748b',
  accent: '#0ea5e9',
  ring: '#38bdf8',
};
const LIGHT = {
  card: '#ffffff',
  border: '#e2e8f0',
  text: '#1f2937',
  subtext: '#64748b',
  muted: '#94a3b8',
  accent: '#0ea5e9',
  ring: '#0284c7',
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

export default function MomentsBar({ navigation }: Props) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;
  const user = useAuthStore((state) => state.user);
  const [groups, setGroups] = useState<MomentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ groups: MomentGroup[] }>('/api/moments/feed');
      setGroups(data.groups ?? []);
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const data = useMemo(() => [{ type: 'create' as const }, ...groups.map((group) => ({ type: 'group' as const, group }))], [groups]);

  return (
    <View style={[s.wrap, { backgroundColor: C.card, borderColor: C.border }]}>
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
                <View style={[s.createCard, { backgroundColor: scheme === 'dark' ? '#172033' : '#f8fafc', borderColor: C.border }]}>
                  {user?.photoURL ? (
                    <Image source={{ uri: user.photoURL }} style={s.cardImage} />
                  ) : (
                    <View style={[s.cardImage, { backgroundColor: C.accent }]} />
                  )}
                  <View style={s.cardScrim} />
                  <View style={s.plusWrap}>
                    <Ionicons name="add" size={22} color="#fff" />
                  </View>
                  <Text style={s.cardLabel} numberOfLines={2}>Tạo Moment</Text>
                </View>
              </TouchableOpacity>
            );
          }

          const latest = item.group.moments[0];
          const mediaUrl = latest?.mediaUrl;
          const poster = mediaUrl && isVideoUrl(mediaUrl) ? videoPoster(mediaUrl) : mediaUrl;
          const own = item.group.userId === user?.uid;

          return (
            <TouchableOpacity
              style={s.storyItem}
              activeOpacity={0.86}
              onPress={() => setViewerIndex(index - 1)}
            >
              <View style={[
                s.storyCard,
                {
                  borderColor: item.group.hasUnviewed ? C.ring : C.border,
                  borderWidth: item.group.hasUnviewed ? 3 : 1,
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
                <View style={[s.avatarRing, { borderColor: item.group.hasUnviewed ? C.ring : '#fff' }]}>
                  {item.group.userPhotoURL ? (
                    <Image source={{ uri: item.group.userPhotoURL }} style={s.avatar} />
                  ) : (
                    <View style={[s.avatar, { backgroundColor: C.accent }]}>
                      <Text style={s.avatarText}>{initials(item.group.userDisplayName)}</Text>
                    </View>
                  )}
                </View>
                <Text style={s.cardLabel} numberOfLines={2}>{own ? 'Của bạn' : item.group.userDisplayName}</Text>
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
    marginBottom: 8,
    paddingVertical: 10,
  },
  list: {
    paddingHorizontal: 12,
    gap: 8,
  },
  storyItem: {
    width: CARD_W,
  },
  createCard: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  storyCard: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
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
