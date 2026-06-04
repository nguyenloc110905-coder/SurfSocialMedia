import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation';
import { api } from '@/lib/api';
import type { FeedPost } from '@/stores/feedStore';
import PostCard from '@/components/PostCard';

const DARK = { bg: '#0f172a', text: '#e2e8f0', subtext: '#94a3b8', header: '#1e293b', border: '#334155', card: '#1e293b', accent: '#0ea5e9' };
const LIGHT = { bg: '#f1f5f9', text: '#1f2937', subtext: '#64748b', header: '#ffffff', border: '#e2e8f0', card: '#ffffff', accent: '#0ea5e9' };

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'ArchivedPosts'> };

export default function ArchivedPostsScreen({ navigation }: Props) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<{ posts: FeedPost[] }>('/api/posts/archive');
      setPosts(data.posts ?? []);
    } catch (err) {
      setError((err as Error).message || 'Khong the tai kho luu tru');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const removePost = useCallback((postId: string) => {
    setPosts((current) => current.filter((post) => post.id !== postId));
  }, []);

  const restorePost = useCallback(async (postId: string) => {
    if (restoringId) return;
    setRestoringId(postId);
    try {
      await api.post(`/api/posts/${postId}/unarchive`, {});
      removePost(postId);
    } catch {
      Alert.alert('Không thể khôi phục', 'Vui lòng thử lại sau.');
    } finally {
      setRestoringId(null);
    }
  }, [removePost, restoringId]);

  return (
    <SafeAreaView style={[st.root, { backgroundColor: C.bg }]} edges={['top']}>
      <View style={[st.header, { backgroundColor: C.header, borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={[st.title, { color: C.text }]}>Kho lưu trữ</Text>
        <TouchableOpacity onPress={load} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="refresh" size={22} color={C.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={st.center}>
          <ActivityIndicator size="large" color={C.accent} />
        </View>
      ) : error ? (
        <View style={st.center}>
          <Ionicons name="cloud-offline-outline" size={48} color={C.subtext} />
          <Text style={[st.msg, { color: C.subtext }]}>{error}</Text>
          <TouchableOpacity style={[st.primaryBtn, { backgroundColor: C.accent }]} onPress={load}>
            <Text style={st.primaryText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : posts.length === 0 ? (
        <View style={st.center}>
          <Ionicons name="archive-outline" size={56} color={C.subtext} />
          <Text style={[st.msg, { color: C.subtext }]}>Chưa có bài viết lưu trữ</Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(post) => post.id}
          contentContainerStyle={st.list}
          renderItem={({ item }) => (
            <View>
              <View style={[st.restoreBar, { backgroundColor: C.card, borderColor: C.border }]}>
                <View style={st.restoreCopy}>
                  <Ionicons name="archive-outline" size={18} color={C.subtext} />
                  <Text style={[st.restoreText, { color: C.subtext }]}>Chỉ bạn xem được bài viết này</Text>
                </View>
                <TouchableOpacity
                  style={[st.restoreBtn, { backgroundColor: C.accent, opacity: restoringId === item.id ? 0.65 : 1 }]}
                  disabled={restoringId === item.id}
                  onPress={() => restorePost(item.id)}
                >
                  {restoringId === item.id
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={st.restoreBtnText}>Khôi phục</Text>}
                </TouchableOpacity>
              </View>
              <PostCard
                post={item}
                isVisible
                navigation={navigation as any}
                onPostRemoved={removePost}
                hideOptions
              />
            </View>
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
  title: { flex: 1, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  msg: { fontSize: 15, textAlign: 'center' },
  primaryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  primaryText: { color: '#fff', fontWeight: '700' },
  list: { paddingVertical: 8 },
  restoreBar: {
    marginHorizontal: 10,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  restoreCopy: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  restoreText: { flex: 1, fontSize: 13, fontWeight: '600' },
  restoreBtn: { minWidth: 92, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  restoreBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
});
