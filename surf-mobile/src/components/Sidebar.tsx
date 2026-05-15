import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation';
import { useAuthStore } from '@/stores/authStore';

type Props = {
  visible: boolean;
  onClose: () => void;
  navigation: NativeStackNavigationProp<RootStackParamList, any>;
};

// ── Theme ──────────────────────────────────────────────────────────────────
const DARK = {
  card: '#1e293b',
  border: '#334155',
  text: '#e2e8f0',
  subtext: '#64748b',
};

const LIGHT = {
  card: '#ffffff',
  border: '#e2e8f0',
  text: '#1f2937',
  subtext: '#64748b',
};

const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

export default function Sidebar({ visible, onClose, navigation }: Props) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;
  
  const user = useAuthStore((s) => s.user);
  const [loggingOut, setLoggingOut] = React.useState(false);

  const handleLogout = () => {
    Alert.alert(
      'Đăng xuất',
      'Bạn có chắc muốn đăng xuất?',
      [
        { text: 'Hủy', onPress: () => {}, style: 'cancel' },
        {
          text: 'Đăng xuất',
          onPress: async () => {
            setLoggingOut(true);
            try {
              const { resetAuth } = useAuthStore.getState();
              await resetAuth();
              onClose();
              console.log('✅ Đã đăng xuất - User state sẽ change to null');
            } catch (err) {
              console.error('❌ Lỗi đăng xuất:', err);
              Alert.alert('Lỗi', 'Không thể đăng xuất. Vui lòng thử lại.');
              setLoggingOut(false);
            }
          },
          style: 'destructive',
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      onRequestClose={onClose}
    >
      {/* Background overlay */}
      <TouchableOpacity
        style={[s.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}
        activeOpacity={1}
        onPress={onClose}
      >
        {/* Sidebar */}
        <View style={[s.sidebar, { backgroundColor: C.card }]}>
          {/* Header */}
          <View style={[s.header, { borderBottomColor: C.border }]}>
            <Text style={[s.title, { color: C.text }]}>Menu</Text>
            <TouchableOpacity
              hitSlop={HIT}
              onPress={onClose}
            >
              <Ionicons name="close" size={24} color={C.text} />
            </TouchableOpacity>
          </View>

          {/* User info */}
          {user && (
            <View style={[s.userSection, { borderBottomColor: C.border }]}>
              <View style={[s.avatar, { backgroundColor: C.border }]}>
                <Ionicons name="person" size={24} color={C.subtext} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.userName, { color: C.text }]}>
                  {user.displayName || 'Người dùng'}
                </Text>
                <Text style={[s.userEmail, { color: C.subtext }]}>
                  {user.email}
                </Text>
              </View>
            </View>
          )}

          {/* Menu items */}
          <ScrollView style={s.content}>
            <TouchableOpacity
              style={[s.menuItem, { borderBottomColor: C.border }]}
              onPress={() => {
                onClose();
                navigation.navigate('Profile', {});
              }}
            >
              <Ionicons name="person-outline" size={20} color={C.text} />
              <Text style={[s.menuText, { color: C.text }]}>Hồ sơ của tôi</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.menuItem, { borderBottomColor: C.border }]}
              onPress={() => {
                onClose();
                // TODO: Navigate to settings
              }}
            >
              <Ionicons name="settings-outline" size={20} color={C.text} />
              <Text style={[s.menuText, { color: C.text }]}>Cài đặt</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Logout button */}
          <TouchableOpacity
            style={[s.logoutBtn, { backgroundColor: '#dc2626' + '1a', borderColor: '#dc2626' }]}
            onPress={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? (
              <ActivityIndicator color="#dc2626" size={20} />
            ) : (
              <>
                <Ionicons name="log-out-outline" size={20} color="#dc2626" />
                <Text style={[s.logoutText, { color: '#dc2626' }]}>Đăng xuất</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: '75%',
    height: '100%',
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userName: {
    fontSize: 14,
    fontWeight: '700',
  },
  userEmail: {
    fontSize: 12,
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  menuText: {
    fontSize: 14,
    fontWeight: '500',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginVertical: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
