import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { signOut } from '@/lib/firebase/auth';

export default function ProfileScreen() {
  const { user } = useAuthStore();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Hồ sơ</Text>
      </View>

      <View style={styles.avatarContainer}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(user?.displayName ?? user?.email ?? 'U')[0].toUpperCase()}
          </Text>
        </View>
        <Text style={styles.name}>{user?.displayName ?? 'Người dùng'}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={signOut}>
        <Text style={styles.logoutText}>Đăng xuất</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  title: { fontSize: 20, fontWeight: 'bold', color: '#f1f5f9' },
  avatarContainer: { alignItems: 'center', paddingTop: 48 },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatarText: { fontSize: 40, color: '#fff', fontWeight: 'bold' },
  name: { fontSize: 22, fontWeight: '600', color: '#f1f5f9', marginBottom: 4 },
  email: { fontSize: 14, color: '#94a3b8' },
  logoutButton: {
    margin: 24,
    backgroundColor: '#ef4444',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  logoutText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
