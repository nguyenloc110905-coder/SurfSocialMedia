import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation';
import { useSidebarStore } from '@/stores/sidebarStore';
import Sidebar from '@/components/Sidebar';

// Lazy-import tab content screens
import HomeScreen from './HomeScreen';
import FeedScreen from './FeedScreen';
import ShortVideoScreen from './ShortVideoScreen';
import MarketplaceScreen from './MarketplaceScreen';

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
  { key: 'create', icon: 'add-circle-outline', iconActive: 'add-circle', label: 'Tạo', isCreate: true },
  { key: 'marketplace', icon: 'storefront-outline', iconActive: 'storefront', label: 'Chợ' },
  { key: 'notifications', icon: 'notifications-outline', iconActive: 'notifications', label: 'Thông báo' },
];

// Placeholder for unbuilt tabs
function PlaceholderTab({ label, icon }: { label: string; icon: keyof typeof Ionicons.glyphMap }) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
        <Ionicons name={icon} size={52} color={C.subtext} />
        <Text style={{ color: C.subtext, fontSize: 16 }}>{label}</Text>
      </View>
    </SafeAreaView>
  );
}

export default function MainTabsScreen({ navigation }: Props) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;
  const insets = useSafeAreaInsets();

  const [active, setActive] = useState<Tab>('home');
  const [visited] = useState<Set<Tab>>(new Set<Tab>(['home']));

  const { isOpen: sidebarOpen, toggleSidebar, closeSidebar } = useSidebarStore();

  const handleTab = useCallback((tab: Tab) => {
    if (tab === 'create') {
      navigation.navigate('CreatePost');
      return;
    }
    visited.add(tab);
    setActive(tab);
  }, [visited, navigation]);

  const bottomPad = Math.max(insets.bottom, Platform.OS === 'android' ? 8 : 0);
  const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      {/* ── Header with menu button ── */}
      <View style={[s.header, { backgroundColor: C.bg, borderBottomColor: C.border }]}>
        <TouchableOpacity hitSlop={HIT} onPress={toggleSidebar}>
          <Ionicons name="menu-outline" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: C.text }]}>Surf</Text>
        <TouchableOpacity hitSlop={HIT}>
          <Ionicons name="search-outline" size={24} color={C.text} />
        </TouchableOpacity>
      </View>

      {/* ── Tab content area ── */}
      <View style={{ flex: 1 }}>
        {/* Home */}
        {visited.has('home') && (
          <View style={{ flex: 1, display: active === 'home' ? 'flex' : 'none' }}>
            <HomeScreen navigation={navigation as any} onFeedPress={() => handleTab('feed')} />
          </View>
        )}
        {/* Feed — hidden tab, no button in bar */}
        {visited.has('feed') && (
          <View style={{ flex: 1, display: active === 'feed' ? 'flex' : 'none' }}>
            <FeedScreen navigation={navigation as any} />
          </View>
        )}
        {/* Short Video */}
        {visited.has('video') && (
          <View style={{ flex: 1, display: active === 'video' ? 'flex' : 'none' }}>
            <ShortVideoScreen />
          </View>
        )}
        {/* Friends */}
        {visited.has('friends') && (
          <View style={{ flex: 1, display: active === 'friends' ? 'flex' : 'none' }}>
            <PlaceholderTab label="Bạn bè" icon="people-outline" />
          </View>
        )}
        {/* Notifications */}
        {visited.has('notifications') && (
          <View style={{ flex: 1, display: active === 'notifications' ? 'flex' : 'none' }}>
            <PlaceholderTab label="Thông báo" icon="notifications-outline" />
          </View>
        )}
        {/* Marketplace */}
        {visited.has('marketplace') && (
          <View style={{ flex: 1, display: active === 'marketplace' ? 'flex' : 'none' }}>
            <MarketplaceScreen navigation={navigation as any} />
          </View>
        )}
      </View>

      {/* ── Sidebar ── */}
      <Sidebar visible={sidebarOpen} onClose={closeSidebar} navigation={navigation} />

      {/* ── Bottom tab bar ── */}
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
              >
                <Ionicons
                  name={isActive ? tab.iconActive : tab.icon}
                  size={26}
                  color={color}
                />
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
});
