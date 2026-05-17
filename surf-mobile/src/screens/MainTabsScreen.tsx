import React, { useCallback, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation';
import { useSidebarStore } from '@/stores/sidebarStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { useFriendStore } from '@/stores/friendStore';
import Sidebar from '@/components/Sidebar';

import HomeScreen from './HomeScreen';
import FeedScreen from './FeedScreen';
import ShortVideoScreen from './ShortVideoScreen';
import MarketplaceScreen from './MarketplaceScreen';
import NotificationCenterScreen from './NotificationCenterScreen';
import FriendsScreen from './FriendsScreen';

type Tab = 'home' | 'feed' | 'video' | 'create' | 'friends' | 'notifications' | 'marketplace';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'MainTabs'>;
};

const DARK = {
  bg: '#0f172a',
  bar: '#111827',
  border: '#1e293b',
  text: '#e2e8f0',
  subtext: '#64748b',
  accent: '#0ea5e9',
};

const LIGHT = {
  bg: '#f8fafc',
  bar: '#ffffff',
  border: '#e2e8f0',
  text: '#1f2937',
  subtext: '#94a3b8',
  accent: '#0ea5e9',
};

const TAB_H = 60;

type TabDef = {
  key: Tab;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
  label: string;
  isCreate?: boolean;
};

const TABS: TabDef[] = [
  { key: 'home', icon: 'home-outline', iconActive: 'home', label: 'Trang chủ' },
  { key: 'video', icon: 'videocam-outline', iconActive: 'videocam', label: 'Video' },
<<<<<<< HEAD
=======
  { key: 'friends', icon: 'people-outline', iconActive: 'people', label: 'Bạn bè' },
>>>>>>> 25c43014152352e381eaa9dbb7e62427ad3ab04c
  { key: 'create', icon: 'add-circle-outline', iconActive: 'add-circle', label: 'Tạo', isCreate: true },
  { key: 'marketplace', icon: 'storefront-outline', iconActive: 'storefront', label: 'Chợ' },
  { key: 'notifications', icon: 'notifications-outline', iconActive: 'notifications', label: 'Thông báo' },
];

export default function MainTabsScreen({ navigation }: Props) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;
  const insets = useSafeAreaInsets();

  const [active, setActive] = useState<Tab>('home');
  const [visited] = useState<Set<Tab>>(new Set<Tab>(['home']));
  const unreadNotifications = useNotificationStore((state) =>
    state.items.filter((item) => !(item.read ?? item.isRead)).length
  );
  const incomingFriendRequests = useFriendStore((state) => state.incomingRequests.length);
  const { isOpen: sidebarOpen, toggleSidebar, closeSidebar } = useSidebarStore();

  const handleTab = useCallback((tab: Tab) => {
    if (tab === 'create') {
      navigation.navigate('CreatePost');
      return;
    }
    visited.add(tab);
    setActive(tab);
  }, [navigation, visited]);

  const bottomPad = Math.max(insets.bottom, Platform.OS === 'android' ? 8 : 0);
  const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={[s.header, { backgroundColor: C.bg, borderBottomColor: C.border }]}>
        <TouchableOpacity hitSlop={HIT} onPress={toggleSidebar}>
          <Ionicons name="menu-outline" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: C.text }]}>Surf</Text>
        <TouchableOpacity hitSlop={HIT}>
          <Ionicons name="search-outline" size={24} color={C.text} />
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1 }}>
        {visited.has('home') && (
          <View style={{ flex: 1, display: active === 'home' ? 'flex' : 'none' }}>
            <HomeScreen
              navigation={navigation as any}
              onFeedPress={() => handleTab('feed')}
              onFriendsPress={() => handleTab('friends')}
            />
          </View>
        )}

        {visited.has('feed') && (
          <View style={{ flex: 1, display: active === 'feed' ? 'flex' : 'none' }}>
            <FeedScreen navigation={navigation as any} />
          </View>
        )}

        {visited.has('video') && (
          <View style={{ flex: 1, display: active === 'video' ? 'flex' : 'none' }}>
            <ShortVideoScreen />
          </View>
        )}

        {visited.has('friends') && (
          <View style={{ flex: 1, display: active === 'friends' ? 'flex' : 'none' }}>
            <FriendsScreen navigation={navigation as any} />
          </View>
        )}

        <View style={{ flex: 1, display: active === 'notifications' ? 'flex' : 'none' }}>
          <NotificationCenterScreen navigation={navigation as any} isActive={active === 'notifications'} />
        </View>

        {visited.has('marketplace') && (
          <View style={{ flex: 1, display: active === 'marketplace' ? 'flex' : 'none' }}>
            <MarketplaceScreen navigation={navigation as any} />
          </View>
        )}
      </View>

      <Sidebar visible={sidebarOpen} onClose={closeSidebar} navigation={navigation} />

      {active !== 'home' && (
        <View
          style={[
            s.bar,
            {
              backgroundColor: C.bar,
              borderTopColor: C.border,
              paddingBottom: bottomPad,
              height: TAB_H + bottomPad,
            },
          ]}
        >
          {TABS.map((tab) => {
            const isActive = active === tab.key;
            const color = isActive ? C.accent : C.subtext;

            if (tab.isCreate) {
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={s.tabBtn}
                  onPress={() => handleTab(tab.key)}
                  activeOpacity={0.7}
                  accessibilityLabel={tab.label}
                >
                  <Ionicons name="add-circle" size={42} color={C.accent} />
                </TouchableOpacity>
              );
            }

            return (
              <TouchableOpacity
                key={tab.key}
                style={s.tabBtn}
                onPress={() => handleTab(tab.key)}
                activeOpacity={0.7}
                accessibilityLabel={tab.label}
              >
                <Ionicons
                  name={isActive ? tab.iconActive : tab.icon}
                  size={26}
                  color={color}
                />
                {tab.key === 'notifications' && unreadNotifications > 0 && (
                  <View style={[s.badge, { backgroundColor: C.accent }]}>
                    <Text style={s.badgeText}>{unreadNotifications > 99 ? '99+' : unreadNotifications}</Text>
                  </View>
                )}
                {tab.key === 'friends' && incomingFriendRequests > 0 && (
                  <View style={[s.badge, { backgroundColor: C.accent }]}>
                    <Text style={s.badgeText}>{incomingFriendRequests > 99 ? '99+' : incomingFriendRequests}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', letterSpacing: 1 },
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
  },
  tabBtn: {
    flex: 1,
    height: TAB_H,
    justifyContent: 'center',
    alignItems: 'center',
  },
<<<<<<< HEAD
=======
  badge: {
    position: 'absolute',
    top: 10,
    right: '24%',
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
>>>>>>> 25c43014152352e381eaa9dbb7e62427ad3ab04c
});
