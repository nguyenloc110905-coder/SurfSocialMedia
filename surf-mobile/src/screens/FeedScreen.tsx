import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { signOut } from '@/lib/firebase/auth';
import { api } from '@/lib/api';

type Post = {
  id: string;
  content: string;
  authorName: string;
  createdAt: string;
};

export default function FeedScreen() {
  const { user } = useAuthStore();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPosts = async () => {
    try {
      const data = await api.get<{ posts: Post[] }>('/api/feed');
      setPosts(data.posts ?? []);
    } catch {
      // Feed trống khi chưa có dữ liệu
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchPosts();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>Surf</Text>
        <TouchableOpacity onPress={signOut}>
          <Text style={styles.logout}>Đăng xuất</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color="#6366f1" size="large" />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Chưa có bài đăng nào</Text>
              <Text style={styles.emptySubtext}>Hãy bắt đầu kết nối với bạn bè!</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.authorName}>{item.authorName}</Text>
              <Text style={styles.content}>{item.content}</Text>
              <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString('vi-VN')}</Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  logo: { fontSize: 24, fontWeight: 'bold', color: '#6366f1' },
  logout: { color: '#94a3b8', fontSize: 14 },
  loader: { flex: 1, justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', paddingTop: 80 },
  emptyText: { color: '#f1f5f9', fontSize: 18, fontWeight: '600', marginBottom: 8 },
  emptySubtext: { color: '#94a3b8', fontSize: 14 },
  card: {
    backgroundColor: '#1e293b',
    margin: 12,
    borderRadius: 12,
    padding: 16,
  },
  authorName: { color: '#6366f1', fontWeight: '600', marginBottom: 8 },
  content: { color: '#f1f5f9', fontSize: 15, lineHeight: 22, marginBottom: 8 },
  date: { color: '#64748b', fontSize: 12 },
});
