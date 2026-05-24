import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import type { FeedPost } from '@/stores/feedStore';
import PostCard from '@/components/PostCard';

const DARK = { bg: '#0f172a', text: '#e2e8f0', subtext: '#64748b', header: '#1e293b', border: '#334155' };
const LIGHT = { bg: '#f1f5f9', text: '#1f2937', subtext: '#64748b', header: '#ffffff', border: '#e2e8f0' };

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'SavedPosts'> };

export default function SavedPostsScreen({ navigation }: Props) {
  const scheme = useColorScheme();
  const t = useT();
  const C = scheme === 'dark' ? DARK : LIGHT;

  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<{ posts: FeedPost[] }>('/api/posts/saved');
      setPosts(data.posts ?? []);
    } catch (e) {
      setError((e as Error).message || t('saved_load_error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={[st.root, { backgroundColor: C.bg }]} edges={['top']}>
      <View style={[st.header, { backgroundColor: C.header, borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={[st.title, { color: C.text }]}>{t('saved_posts')}</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={st.center}>
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      ) : error ? (
        <View style={st.center}>
          <Ionicons name="cloud-offline-outline" size={48} color={C.subtext} />
          <Text style={[st.msg, { color: C.subtext }]}>{error}</Text>
          <TouchableOpacity style={st.retryBtn} onPress={load}>
            <Text style={st.retryText}>{t('retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : posts.length === 0 ? (
        <View style={st.center}>
          <Ionicons name="bookmark-outline" size={56} color={C.subtext} />
          <Text style={[st.msg, { color: C.subtext }]}>{t('saved_empty')}</Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingVertical: 8 }}
          renderItem={({ item }) => (
            <PostCard post={item} isVisible navigation={navigation as any} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  title: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  msg: { fontSize: 15, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#3b82f6', borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '600' },
});
