import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation';
import { useSidebarStore } from '@/stores/sidebarStore';
import { gestureState } from '@/lib/gestureState';
import { useNotificationStore } from '@/stores/notificationStore';
import { useFriendStore } from '@/stores/friendStore';
import Sidebar from '@/components/Sidebar';

import HomeScreen from './HomeScreen';
import FeedScreen from './FeedScreen';
import ShortVideoScreen from './ShortVideoScreen';
import MarketplaceScreen from './MarketplaceScreen';
import NotificationCenterScreen from './NotificationCenterScreen';
import FriendsScreen from './FriendsScreen';
import ProfileScreen from './ProfileScreen';

type Tab = 'home' | 'feed' | 'video' | 'friends' | 'marketplace' | 'notifications' | 'profile';

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

type TabDef = {
  key: Tab;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
  label: string;
};

const TABS: TabDef[] = [
  { key: 'feed', icon: 'home-outline', iconActive: 'home', label: 'Feed' },
  { key: 'video', icon: 'videocam-outline', iconActive: 'videocam', label: 'Surf Clips' },
  { key: 'friends', icon: 'people-outline', iconActive: 'people', label: 'Bạn bè' },
  { key: 'marketplace', icon: 'storefront-outline', iconActive: 'storefront', label: 'Chợ' },
  { key: 'notifications', icon: 'notifications-outline', iconActive: 'notifications', label: 'Thông báo' },
  { key: 'profile', icon: 'person-circle-outline', iconActive: 'person-circle', label: 'Trang cá nhân' },
];

const TAB_ORDER: Tab[] = ['home', 'feed', 'video', 'friends', 'marketplace', 'notifications', 'profile'];
const TOP_TAB_COUNT = TABS.length;
const TAB_PRESS_TRANSITION_MS = 240;

const TAB_TITLES: Record<Exclude<Tab, 'home' | 'feed'>, string> = {
  video: 'Surf Clips',
  friends: 'Bạn bè',
  marketplace: 'Chợ',
  notifications: 'Thông báo',
  profile: 'Trang cá nhân',
};

export default function MainTabsScreen({ navigation }: Props) {
  const scheme = useColorScheme();
  const C = scheme === 'dark' ? DARK : LIGHT;
  const isFocused = useIsFocused();
  const { width } = useWindowDimensions();

  const [active, setActive] = useState<Tab>('home');
  const [clipsFullscreen, setClipsFullscreen] = useState(false);
  const [tabBarWidth, setTabBarWidth] = useState(0);
  const [tabTransition, setTabTransition] = useState<{
    from: Tab;
    to: Tab;
    direction: 1 | -1;
    mode: 'tap' | 'drag' | 'back';
    trackHistory: boolean;
  } | null>(null);
  const [reloadingTab, setReloadingTab] = useState<Tab | null>(null);
  const [visited] = useState<Set<Tab>>(new Set<Tab>(['home']));
  const [resetSignals, setResetSignals] = useState<Record<Tab, number>>({
    home: 0,
    feed: 0,
    video: 0,
    friends: 0,
    marketplace: 0,
    notifications: 0,
    profile: 0,
  });
  const unreadNotifications = useNotificationStore((state) =>
    state.items.filter((item) => !(item.read ?? item.isRead)).length
  );
  const incomingFriendRequests = useFriendStore((state) => state.incomingRequests.length);
  const { isOpen: sidebarOpen, toggleSidebar, closeSidebar } = useSidebarStore();

  const activeRef = useRef<Tab>('home');
  const tabHistoryRef = useRef<Tab[]>(['home']);
  const tabSlideX = useRef(new Animated.Value(0)).current;
  const indicatorProgress = useRef(new Animated.Value(0)).current;
  const reloadDrop = useRef(new Animated.Value(0)).current;
  const tabTransitionRef = useRef<typeof tabTransition>(null);

  const HIT = { top: 10, bottom: 10, left: 10, right: 10 };
  const visualActive = tabTransition && tabTransition.mode !== 'drag' ? tabTransition.to : active;
  const isFeedSurface = visualActive === 'home' || visualActive === 'feed';
  const isClipsSurface = visualActive === 'video';
  const hideClipsChrome = isClipsSurface && clipsFullscreen;
  const compactTitle = visualActive !== 'home' && visualActive !== 'feed' ? TAB_TITLES[visualActive] : '';
  const activeTopTabIndex = TABS.findIndex((tab) => tab.key === visualActive);
  const indicatorWidth = tabBarWidth > 0 ? tabBarWidth / TOP_TAB_COUNT : 0;

  const setTransition = useCallback((next: typeof tabTransition) => {
    tabTransitionRef.current = next;
    setTabTransition(next);
  }, []);

  const pushTabHistory = useCallback((tab: Tab) => {
    const history = tabHistoryRef.current;
    if (history[history.length - 1] !== tab) {
      tabHistoryRef.current = [...history, tab];
    }
  }, []);

  const reloadCurrentTab = useCallback((tab: Tab) => {
    setResetSignals((signals) => ({ ...signals, [tab]: signals[tab] + 1 }));
    reloadDrop.stopAnimation();
    reloadDrop.setValue(0);
    setReloadingTab(tab);
    Animated.sequence([
      Animated.timing(reloadDrop, {
        toValue: 1,
        duration: 170,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(reloadDrop, {
        toValue: 2,
        duration: 260,
        delay: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setReloadingTab((current) => (current === tab ? null : current));
      reloadDrop.setValue(0);
    });
  }, [reloadDrop]);

  const finishTabTransition = useCallback((tab: Tab, trackHistory: boolean) => {
    activeRef.current = tab;
    setActive(tab);
    setTransition(null);
    requestAnimationFrame(() => tabSlideX.setValue(0));
    if (trackHistory) {
      pushTabHistory(tab);
    }
  }, [pushTabHistory, setTransition, tabSlideX]);

  const activateTab = useCallback((
    tab: Tab,
    source: 'tap' | 'back' = 'tap',
    trackHistory = true
  ) => {
    const current = activeRef.current;

    visited.add(tab);
    if (tab === current) {
      reloadCurrentTab(tab);
      return;
    }

    const currentIndex = TAB_ORDER.indexOf(current);
    const nextIndex = TAB_ORDER.indexOf(tab);
    const direction: 1 | -1 = nextIndex > currentIndex ? 1 : -1;

    tabSlideX.stopAnimation();
    indicatorProgress.stopAnimation();
    tabSlideX.setValue(0);
    setTransition({ from: current, to: tab, direction, mode: source, trackHistory });
  }, [indicatorProgress, reloadCurrentTab, setTransition, tabSlideX, visited]);

  const handleTab = useCallback((tab: Tab) => {
    activateTab(tab, 'tap');
  }, [activateTab]);

  const handleHome = useCallback(() => {
    activateTab('home', 'tap');
  }, [activateTab]);

  const getAdjacentTab = useCallback((direction: 1 | -1) => {
    const currentIndex = TAB_ORDER.indexOf(activeRef.current);
    return TAB_ORDER[currentIndex + direction];
  }, []);

  const settleDragTransition = useCallback((complete: boolean, gestureDx = 0, gestureVx = 0) => {
    const transition = tabTransitionRef.current;
    if (!transition || transition.mode !== 'drag') return;

    const destination = complete ? -transition.direction * width : 0;
    const remaining = Math.abs(destination - gestureDx);
    const velocity = Math.abs(gestureVx);
    const duration = Math.max(120, Math.min(240, remaining / Math.max(velocity * 1200, 1.8)));

    Animated.timing(tabSlideX, {
      toValue: destination,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      if (complete) {
        finishTabTransition(transition.to, true);
      } else {
        setTransition(null);
        tabSlideX.setValue(0);
        const currentTopIndex = TABS.findIndex((tab) => tab.key === activeRef.current);
        if (currentTopIndex >= 0) {
          Animated.timing(indicatorProgress, {
            toValue: currentTopIndex,
            duration: 140,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start();
        }
      }
    });
  }, [finishTabTransition, indicatorProgress, setTransition, tabSlideX, width]);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => {
      if (sidebarOpen || hideClipsChrome || gestureState.reactionPickerActive) return false;
      return Math.abs(gesture.dx) > 18 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.35;
    },
    onPanResponderGrant: () => {
      tabSlideX.stopAnimation();
    },
    onPanResponderMove: (_, gesture) => {
      const direction: 1 | -1 = gesture.dx < 0 ? 1 : -1;
      const target = getAdjacentTab(direction);
      if (!target) return;

      const current = activeRef.current;
      const currentIndex = TAB_ORDER.indexOf(current);
      const targetIndex = TAB_ORDER.indexOf(target);
      const currentTransition = tabTransitionRef.current;
      if (!currentTransition || currentTransition.mode !== 'drag' || currentTransition.to !== target) {
        visited.add(target);
        setTransition({ from: current, to: target, direction, mode: 'drag', trackHistory: true });
      }

      const clampedDx = direction === 1
        ? Math.max(-width, Math.min(0, gesture.dx))
        : Math.min(width, Math.max(0, gesture.dx));
      const progress = Math.min(1, Math.abs(clampedDx) / Math.max(width, 1));
      tabSlideX.setValue(clampedDx);

      const currentTopIndex = currentIndex - 1;
      const targetTopIndex = targetIndex - 1;
      if (currentTopIndex >= 0 && targetTopIndex >= 0) {
        indicatorProgress.setValue(currentTopIndex + (targetTopIndex - currentTopIndex) * progress);
      }
    },
    onPanResponderRelease: (_, gesture) => {
      const shouldSwipe = Math.abs(gesture.dx) > Math.min(width * 0.18, 72) || Math.abs(gesture.vx) > 0.55;
      settleDragTransition(shouldSwipe, gesture.dx, gesture.vx);
    },
    onPanResponderTerminate: (_, gesture) => {
      settleDragTransition(false, gesture.dx, gesture.vx);
    },
  }), [getAdjacentTab, hideClipsChrome, indicatorProgress, settleDragTransition, setTransition, sidebarOpen, tabSlideX, visited, width]);

  useEffect(() => {
    if (visualActive !== 'video') setClipsFullscreen(false);
  }, [visualActive]);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    if (!tabTransition || tabTransition.mode === 'drag') return;

    const targetTopIndex = TABS.findIndex((tab) => tab.key === tabTransition.to);
    const animations = [
      Animated.timing(tabSlideX, {
        toValue: -tabTransition.direction * width,
        duration: TAB_PRESS_TRANSITION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ];

    if (targetTopIndex >= 0) {
      animations.push(
        Animated.timing(indicatorProgress, {
          toValue: targetTopIndex,
          duration: TAB_PRESS_TRANSITION_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        })
      );
    }

    const frame = requestAnimationFrame(() => {
      Animated.parallel(animations).start(({ finished }) => {
        if (finished) {
          finishTabTransition(tabTransition.to, tabTransition.trackHistory);
        }
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [finishTabTransition, indicatorProgress, tabSlideX, tabTransition, width]);

  useEffect(() => {
    if (tabTransition) return;
    if (activeTopTabIndex < 0) return;
    Animated.timing(indicatorProgress, {
      toValue: activeTopTabIndex,
      duration: TAB_PRESS_TRANSITION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [activeTopTabIndex, indicatorProgress]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sidebarOpen) {
        closeSidebar();
        return true;
      }

      const history = tabHistoryRef.current;
      if (history.length > 1) {
        const nextHistory = history.slice(0, -1);
        tabHistoryRef.current = nextHistory;
        activateTab(nextHistory[nextHistory.length - 1] ?? 'home', 'back', false);
        return true;
      }

      if (activeRef.current !== 'home') {
        tabHistoryRef.current = ['home'];
        activateTab('home', 'back', false);
        return true;
      }

      return false;
    });

    return () => subscription.remove();
  }, [activateTab, closeSidebar, sidebarOpen]);

  const handleClipsFullscreenChange = useCallback((enabled: boolean) => {
    setClipsFullscreen(enabled);
  }, []);

  const shouldRenderTab = useCallback((tab: Tab) => {
    return visited.has(tab) || tab === tabTransition?.from || tab === tabTransition?.to;
  }, [active, tabTransition, visited]);

  const sceneStyleFor = useCallback((tab: Tab) => {
    if (!tabTransition) {
      return tab === active ? [s.sceneLayer, s.sceneVisible] : [s.sceneLayer, s.sceneHidden];
    }

    if (tab === tabTransition.from) {
      return [
        s.sceneLayer,
        s.sceneVisible,
        {
          zIndex: 1,
          transform: [{ translateX: tabSlideX }],
        },
      ];
    }

    if (tab === tabTransition.to) {
      return [
        s.sceneLayer,
        s.sceneVisible,
        {
          zIndex: 2,
          transform: [{
            translateX: tabSlideX.interpolate({
              inputRange: [-width, 0, width],
              outputRange: [
                tabTransition.direction * width - width,
                tabTransition.direction * width,
                tabTransition.direction * width + width,
              ],
              extrapolate: 'extend',
            }),
          }],
        },
      ];
    }

    return [s.sceneLayer, s.sceneHidden];
  }, [active, tabSlideX, tabTransition, width]);

  const renderTopTabs = (floating = false) => (
    <View
      onLayout={(event) => setTabBarWidth(event.nativeEvent.layout.width)}
      style={[
        s.topTabs,
        floating
          ? [s.floatingTopTabs, { backgroundColor: C.bg, borderBottomColor: C.border }]
          : { backgroundColor: C.bg, borderBottomColor: C.border },
        ]}
    >
      {indicatorWidth > 0 && activeTopTabIndex >= 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            s.topIndicatorSlider,
            {
              width: indicatorWidth,
              backgroundColor: floating ? '#fff' : C.accent,
              transform: [{
                translateX: indicatorProgress.interpolate({
                  inputRange: [0, TOP_TAB_COUNT - 1],
                  outputRange: [0, indicatorWidth * (TOP_TAB_COUNT - 1)],
                  extrapolate: 'clamp',
                }),
              }],
            },
          ]}
        />
      )}
      {TABS.map((tab) => {
        const isActive = visualActive === tab.key;
        const color = floating ? '#fff' : isActive ? C.accent : C.subtext;
        const showReload = reloadingTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={s.topTabBtn}
            onPress={() => handleTab(tab.key)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            >
              <Ionicons
                name={isActive ? tab.iconActive : tab.icon}
                size={28}
                color={color}
                style={floating ? s.floatingIconShadow : undefined}
              />
            {showReload && (
              <Animated.View
                pointerEvents="none"
                style={[
                  s.reloadDrop,
                  {
                    opacity: reloadDrop.interpolate({
                      inputRange: [0, 0.18, 1.45, 2],
                      outputRange: [0, 1, 1, 0],
                      extrapolate: 'clamp',
                    }),
                    transform: [
                      {
                        translateY: reloadDrop.interpolate({
                          inputRange: [0, 1, 2],
                          outputRange: [-18, 2, 18],
                          extrapolate: 'clamp',
                        }),
                      },
                      {
                        rotate: reloadDrop.interpolate({
                          inputRange: [0, 2],
                          outputRange: ['0deg', '280deg'],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <Ionicons
                  name="reload"
                  size={18}
                  color={floating ? '#fff' : C.accent}
                  style={floating ? s.floatingIconShadow : undefined}
                />
              </Animated.View>
            )}
            {tab.key === 'notifications' && unreadNotifications > 0 && (
              <View style={[s.topBadge, { backgroundColor: C.accent }]}>
                <Text style={s.badgeText}>{unreadNotifications > 99 ? '99+' : unreadNotifications}</Text>
              </View>
            )}
            {tab.key === 'friends' && incomingFriendRequests > 0 && (
              <View style={[s.topBadge, { backgroundColor: C.accent }]}>
                <Text style={s.badgeText}>{incomingFriendRequests > 99 ? '99+' : incomingFriendRequests}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const clipsOverlay = (
    <View style={s.clipsOverlay} pointerEvents="box-none">
      <View style={s.floatingClipsHeader} pointerEvents="box-none">
        <TouchableOpacity hitSlop={HIT} onPress={toggleSidebar} accessibilityRole="button" accessibilityLabel="Mở menu">
          <Ionicons name="menu-outline" size={26} color="#fff" style={s.floatingIconShadow} />
        </TouchableOpacity>
        <Text style={[s.floatingClipsTitle, s.floatingTextShadow]} numberOfLines={1}>Surf Clips</Text>
        <TouchableOpacity
          hitSlop={HIT}
          onPress={() => navigation.navigate('CreateClip')}
          accessibilityRole="button"
          accessibilityLabel="Đăng Surf Clip mới"
        >
          <Ionicons name="camera-outline" size={26} color="#fff" style={s.floatingIconShadow} />
        </TouchableOpacity>
        <TouchableOpacity
          hitSlop={HIT}
          accessibilityRole="button"
          accessibilityLabel="Tìm kiếm trong Surf Clips"
          onPress={() => navigation.navigate('Search')}
        >
          <Ionicons name="search-outline" size={26} color="#fff" style={s.floatingIconShadow} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderCompactHeader = (tab: Exclude<Tab, 'home' | 'feed' | 'video'>) => {
    const title = TAB_TITLES[tab];

    return (
      <View style={[s.compactHeader, { backgroundColor: C.bg, borderBottomColor: C.border }]}>
        <TouchableOpacity hitSlop={HIT} onPress={toggleSidebar} accessibilityRole="button" accessibilityLabel="Má»Ÿ menu">
          <Ionicons name="menu-outline" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={[s.compactTitle, { color: C.text }]} numberOfLines={1}>{title}</Text>
        <TouchableOpacity
          hitSlop={HIT}
          accessibilityRole="button"
          accessibilityLabel={`Tìm kiếm trong ${title}`}
          onPress={() => navigation.navigate('Search')}
        >
          <Ionicons name="search-outline" size={24} color={C.text} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: hideClipsChrome ? '#000' : C.bg }} edges={hideClipsChrome ? [] : ['top']}>
      {!hideClipsChrome && (isFeedSurface ? (
        <>
          <View style={[s.header, { backgroundColor: C.bg, borderBottomColor: C.border }]}>
            <TouchableOpacity hitSlop={HIT} onPress={toggleSidebar}>
              <Ionicons name="menu-outline" size={24} color={C.text} />
            </TouchableOpacity>
            <TouchableOpacity
              hitSlop={HIT}
              onPress={handleHome}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Về trang chủ"
              style={[s.headerBrand, visualActive === 'home' && { borderBottomColor: C.accent }]}
            >
              <Text style={[s.headerTitle, { color: visualActive === 'home' ? C.accent : C.text }]}>Surf</Text>
            </TouchableOpacity>
            <View style={s.headerActions}>
              <TouchableOpacity
                hitSlop={HIT}
                onPress={() => navigation.navigate('CreatePost')}
                accessibilityRole="button"
                accessibilityLabel="Tạo bài viết"
              >
                <Ionicons name="add-circle-outline" size={28} color={C.text} />
              </TouchableOpacity>
              <TouchableOpacity hitSlop={HIT} accessibilityRole="button" accessibilityLabel="Tìm kiếm" onPress={() => navigation.navigate('Search')}>
                <Ionicons name="search-outline" size={26} color={C.text} />
              </TouchableOpacity>
            </View>
          </View>
          {visualActive === 'feed' && renderTopTabs()}
        </>
      ) : (
        <>
          {isClipsSurface ? renderTopTabs(true) : renderTopTabs()}
          {false && !isClipsSurface && (
            <View style={[s.compactHeader, { backgroundColor: C.bg, borderBottomColor: C.border }]}>
              <TouchableOpacity hitSlop={HIT} onPress={toggleSidebar} accessibilityRole="button" accessibilityLabel="Mở menu">
                <Ionicons name="menu-outline" size={24} color={C.text} />
              </TouchableOpacity>
              <Text style={[s.compactTitle, { color: C.text }]} numberOfLines={1}>{compactTitle}</Text>
              <TouchableOpacity
                hitSlop={HIT}
                accessibilityRole="button"
                accessibilityLabel={`Tìm kiếm trong ${compactTitle}`}
              >
                <Ionicons name="search-outline" size={24} color={C.text} />
              </TouchableOpacity>
            </View>
          )}
        </>
      ))}

      <Animated.View style={s.contentStage} {...panResponder.panHandlers}>
        {shouldRenderTab('home') && (
          <Animated.View style={sceneStyleFor('home')} pointerEvents={active === 'home' ? 'auto' : 'none'}>
            <HomeScreen
              navigation={navigation as any}
              onFeedPress={() => handleTab('feed')}
              onFriendsPress={() => handleTab('friends')}
            />
          </Animated.View>
        )}

        {shouldRenderTab('feed') && (
          <Animated.View style={sceneStyleFor('feed')} pointerEvents={active === 'feed' ? 'auto' : 'none'}>
            <FeedScreen
              navigation={navigation as any}
              isActive={visualActive === 'feed'}
              resetSignal={resetSignals.feed}
              safeTop={false}
              onCreatePost={() => navigation.navigate('CreatePost')}
            />
          </Animated.View>
        )}

        {shouldRenderTab('video') && (
          <Animated.View style={[sceneStyleFor('video'), s.sceneWithOverlay]} pointerEvents={active === 'video' ? 'auto' : 'none'}>
            <ShortVideoScreen
              isActive={visualActive === 'video' && isFocused}
              resetSignal={resetSignals.video}
              safeTop={false}
              showTitle={false}
              onFullscreenChange={handleClipsFullscreenChange}
            />
            {visualActive === 'video' && !clipsFullscreen && clipsOverlay}
          </Animated.View>
        )}

        {shouldRenderTab('friends') && (
          <Animated.View style={sceneStyleFor('friends')} pointerEvents={active === 'friends' ? 'auto' : 'none'}>
            {renderCompactHeader('friends')}
            <FriendsScreen
              navigation={navigation as any}
              resetSignal={resetSignals.friends}
              safeTop={false}
              showTitleBlock={false}
            />
          </Animated.View>
        )}

        {shouldRenderTab('notifications') && (
          <Animated.View style={sceneStyleFor('notifications')} pointerEvents={active === 'notifications' ? 'auto' : 'none'}>
            {renderCompactHeader('notifications')}
            <NotificationCenterScreen
              navigation={navigation as any}
              isActive={visualActive === 'notifications'}
              resetSignal={resetSignals.notifications}
              safeTop={false}
              showHeader={false}
            />
          </Animated.View>
        )}

        {shouldRenderTab('marketplace') && (
          <Animated.View style={sceneStyleFor('marketplace')} pointerEvents={active === 'marketplace' ? 'auto' : 'none'}>
            {renderCompactHeader('marketplace')}
            <MarketplaceScreen
              navigation={navigation as any}
              resetSignal={resetSignals.marketplace}
              safeTop={false}
              showHeader={false}
            />
          </Animated.View>
        )}

        {shouldRenderTab('profile') && (
          <Animated.View style={sceneStyleFor('profile')} pointerEvents={active === 'profile' ? 'auto' : 'none'}>
            {renderCompactHeader('profile')}
            <ProfileScreen
              navigation={navigation as any}
              route={{ key: 'MainTabsProfile', name: 'Profile', params: undefined } as any}
              isActive={visualActive === 'profile'}
              resetSignal={resetSignals.profile}
              safeTop={false}
              showBackButton={false}
            />
          </Animated.View>
        )}
      </Animated.View>

      <Sidebar visible={sidebarOpen} onClose={closeSidebar} navigation={navigation} />
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
  headerBrand: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', letterSpacing: 1 },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  compactHeader: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  compactTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0,
  },
  topTabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    minHeight: 54,
    position: 'relative',
  },
  floatingTopTabs: {
    borderBottomWidth: 1,
    minHeight: 56,
  },
  topTabBtn: {
    flex: 1,
    minHeight: 54,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    zIndex: 1,
  },
  topIndicatorSlider: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: 3,
    borderRadius: 2,
  },
  topIndicator: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    borderRadius: 2,
  },
  reloadDrop: {
    position: 'absolute',
    top: 4,
    alignSelf: 'center',
    zIndex: 3,
  },
  topBadge: {
    position: 'absolute',
    top: 7,
    right: '23%',
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentStage: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  sceneLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  sceneVisible: {
    zIndex: 1,
    opacity: 1,
  },
  sceneHidden: {
    zIndex: 0,
    opacity: 0,
  },
  sceneWithOverlay: {
    position: 'absolute',
  },
  clipsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  floatingClipsHeader: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 8,
  },
  floatingClipsTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: 0,
  },
  floatingIconShadow: {
    textShadowColor: 'rgba(0,0,0,0.62)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  floatingTextShadow: {
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
