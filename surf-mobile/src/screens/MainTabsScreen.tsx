import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation';
import { api } from '@/lib/api';
import { connectSocket, getSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/authStore';
import { usePresence } from '@/hooks/usePresence';
import { useSidebarStore } from '@/stores/sidebarStore';
import { gestureState } from '@/lib/gestureState';
import { useNotificationStore, type NotificationItem, type RealtimeMessagePayload } from '@/stores/notificationStore';
import { useFriendStore } from '@/stores/friendStore';
import { useMessageStore } from '@/stores/messageStore';
import Sidebar from '@/components/Sidebar';
import { useT, type I18nKey } from '@/lib/i18n';

import HomeScreen from './HomeScreen';
import FeedScreen from './FeedScreen';
import ShortVideoScreen from './ShortVideoScreen';
import MessagesScreen from './MessagesScreen';
import NotificationCenterScreen from './NotificationCenterScreen';
import FriendsScreen from './FriendsScreen';
import ProfileScreen from './ProfileScreen';

type Tab = 'home' | 'feed' | 'video' | 'friends' | 'messages' | 'notifications' | 'profile';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'MainTabs'>;
};

type CountResponse = {
  count?: number;
};

const DARK = {
  bg: '#0f172a',
  bar: '#111827',
  border: '#1e293b',
  text: '#e2e8f0',
  subtext: '#64748b',
  accent: '#0ea5e9',
  danger: '#ef4444',
};

const LIGHT = {
  bg: '#f8fafc',
  bar: '#ffffff',
  border: '#e2e8f0',
  text: '#1f2937',
  subtext: '#94a3b8',
  accent: '#0ea5e9',
  danger: '#ef4444',
};

type TabDef = {
  key: Tab;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
  labelKey: I18nKey;
};

const TABS: TabDef[] = [
  { key: 'feed', icon: 'home-outline', iconActive: 'home', labelKey: 'nav_feed' },
  { key: 'video', icon: 'videocam-outline', iconActive: 'videocam', labelKey: 'nav_surf_clips' },
  { key: 'friends', icon: 'people-outline', iconActive: 'people', labelKey: 'nav_friends' },
  { key: 'messages', icon: 'chatbubble-ellipses-outline', iconActive: 'chatbubble-ellipses', labelKey: 'nav_messages' },
  { key: 'notifications', icon: 'notifications-outline', iconActive: 'notifications', labelKey: 'nav_notifications' },
  { key: 'profile', icon: 'person-circle-outline', iconActive: 'person-circle', labelKey: 'nav_profile' },
];

const TAB_ORDER: Tab[] = ['home', 'feed', 'video', 'friends', 'messages', 'notifications', 'profile'];
const TOP_TAB_COUNT = TABS.length;
const TAB_PRESS_TRANSITION_MS = 240;
const FEED_BRAND_HEADER_H = 44;
const FEED_TAB_HEADER_H = 46;

const TAB_TITLE_KEYS: Record<Exclude<Tab, 'home' | 'feed'>, I18nKey> = {
  video: 'nav_surf_clips',
  friends: 'nav_friends',
  messages: 'nav_messages',
  notifications: 'nav_notifications',
  profile: 'nav_profile',
};

export default function MainTabsScreen({ navigation }: Props) {
  const scheme = useColorScheme();
  const t = useT();
  const C = scheme === 'dark' ? DARK : LIGHT;
  const isFocused = useIsFocused();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  usePresence();

  const [active, setActive] = useState<Tab>('home');
  const [clipsFullscreen, setClipsFullscreen] = useState(false);
  const [tabBarWidth, setTabBarWidth] = useState(0);
  const [tabTransition, setTabTransition] = useState<{
    from: Tab;
    to: Tab;
    direction: 1 | -1;
    mode: 'tap' | 'drag' | 'back' | 'fade';
    trackHistory: boolean;
  } | null>(null);
  const [reloadingTab, setReloadingTab] = useState<Tab | null>(null);
  const [feedFloatingHeaderVisible, setFeedFloatingHeaderVisible] = useState(false);
  const [tabAtTop, setTabAtTop] = useState<Record<Tab, boolean>>({
    home: true,
    feed: true,
    video: true,
    friends: true,
    messages: true,
    notifications: true,
    profile: true,
  });
  const [visited] = useState<Set<Tab>>(new Set<Tab>(['home']));
  const [scrollTopSignals, setScrollTopSignals] = useState<Record<Tab, number>>({
    home: 0,
    feed: 0,
    video: 0,
    friends: 0,
    messages: 0,
    notifications: 0,
    profile: 0,
  });
  const [resetSignals, setResetSignals] = useState<Record<Tab, number>>({
    home: 0,
    feed: 0,
    video: 0,
    friends: 0,
    messages: 0,
    notifications: 0,
    profile: 0,
  });
  const unreadNotifications = useNotificationStore((state) => state.unreadCount);
  const setNotificationUnreadCount = useNotificationStore((state) => state.setUnreadCount);
  const upsertNotification = useNotificationStore((state) => state.upsertNotification);
  const markNotificationRead = useNotificationStore((state) => state.markItemRead);
  const markAllNotificationsRead = useNotificationStore((state) => state.markAllRead);
  const unreadMessages = useMessageStore((state) => state.unreadConversations);
  const setUnreadMessages = useMessageStore((state) => state.setUnreadConversations);
  const incomingFriendRequests = useFriendStore((state) => state.incomingRequests.length);
  const { isOpen: sidebarOpen, toggleSidebar, closeSidebar } = useSidebarStore();

  const activeRef = useRef<Tab>('home');
  const tabHistoryRef = useRef<Tab[]>(['home']);
  const tabSlideX = useRef(new Animated.Value(0)).current;
  const indicatorProgress = useRef(new Animated.Value(0)).current;
  const reloadDrop = useRef(new Animated.Value(0)).current;
  const feedHeaderCollapse = useRef(new Animated.Value(0)).current;
  const feedChromeCollapse = useRef(new Animated.Value(0)).current;
  const feedFloatingHeader = useRef(new Animated.Value(1)).current;
  const tabTransitionRef = useRef<typeof tabTransition>(null);
  const lastUnreadRefreshAtRef = useRef(0);
  const unreadRefreshInFlightRef = useRef(false);

  const HIT = { top: 10, bottom: 10, left: 10, right: 10 };
  const visualActive = tabTransition && tabTransition.mode !== 'drag' ? tabTransition.to : active;
  const isFeedSurface = visualActive === 'home' || visualActive === 'feed';
  const isClipsSurface = visualActive === 'video';
  const hideClipsChrome = isClipsSurface && clipsFullscreen;
  const compactTitle = visualActive !== 'home' && visualActive !== 'feed' ? t(TAB_TITLE_KEYS[visualActive]) : '';
  const activeTopTabIndex = TABS.findIndex((tab) => tab.key === visualActive);
  const indicatorWidth = tabBarWidth > 0 ? tabBarWidth / TOP_TAB_COUNT : 0;
  const isFeedChromeSurface = !!tabTransition && tabTransition.from === 'feed' && tabTransition.to !== 'feed';

  const setFeedBrandHeaderVisible = useCallback((visible: boolean) => {
    Animated.timing(feedHeaderCollapse, {
      toValue: visible ? 0 : 1,
      duration: visible ? 230 : 260,
      easing: visible ? Easing.out(Easing.back(1.15)) : Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [feedHeaderCollapse]);

  const setFeedFloatingHeaderShown = useCallback((visible: boolean, immediate = false) => {
    if (immediate) {
      feedFloatingHeader.stopAnimation();
      feedFloatingHeader.setValue(visible ? 0 : 1);
      setFeedFloatingHeaderVisible(visible);
      return;
    }

    if (visible) setFeedFloatingHeaderVisible(true);
    Animated.timing(feedFloatingHeader, {
      toValue: visible ? 0 : 1,
      duration: visible ? 190 : 150,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) setFeedFloatingHeaderVisible(false);
    });
  }, [feedFloatingHeader]);

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

  const updateTabAtTop = useCallback((tab: Tab, atTop: boolean) => {
    setTabAtTop((current) => (current[tab] === atTop ? current : { ...current, [tab]: atTop }));
  }, []);

  const scrollCurrentTabToTop = useCallback((tab: Tab) => {
    setTabAtTop((current) => ({ ...current, [tab]: true }));
    setScrollTopSignals((signals) => ({ ...signals, [tab]: signals[tab] + 1 }));
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
    source: 'tap' | 'back' | 'fade' = 'tap',
    trackHistory = true
  ) => {
    const current = activeRef.current;

    visited.add(tab);
    if (tab === current) {
      if (tabAtTop[tab]) reloadCurrentTab(tab);
      else scrollCurrentTabToTop(tab);
      return;
    }

    const currentIndex = TAB_ORDER.indexOf(current);
    const nextIndex = TAB_ORDER.indexOf(tab);
    const direction: 1 | -1 = nextIndex > currentIndex ? 1 : -1;
    const isHomeFeedTransition =
      (current === 'home' && tab === 'feed') || (current === 'feed' && tab === 'home');
    const mode = isHomeFeedTransition ? 'fade' : source;

    tabSlideX.stopAnimation();
    indicatorProgress.stopAnimation();
    tabSlideX.setValue(0);
    setTransition({ from: current, to: tab, direction, mode, trackHistory });
  }, [indicatorProgress, reloadCurrentTab, scrollCurrentTabToTop, setTransition, tabAtTop, tabSlideX, visited]);

  const handleTab = useCallback((tab: Tab) => {
    activateTab(tab, 'tap');
  }, [activateTab]);

  const handleSurfPress = useCallback(() => {
    activateTab(activeRef.current === 'home' ? 'feed' : 'home', 'fade');
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
      const direction: 1 | -1 = gesture.dx < 0 ? 1 : -1;
      const target = getAdjacentTab(direction);
      const current = activeRef.current;
      if ((current === 'home' && target === 'feed') || (current === 'feed' && target === 'home')) {
        return false;
      }
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
      if ((current === 'home' && target === 'feed') || (current === 'feed' && target === 'home')) {
        return;
      }

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
    if (tabTransition?.from === 'feed' && tabTransition.to !== 'feed') {
      setFeedFloatingHeaderShown(false, true);
      feedChromeCollapse.stopAnimation();
      feedChromeCollapse.setValue(0);
      feedHeaderCollapse.stopAnimation();
      feedHeaderCollapse.setValue(0);
      setFeedBrandHeaderVisible(false);
      return;
    }

    if (tabTransition?.to === 'feed') {
      setFeedFloatingHeaderShown(false, true);
      feedHeaderCollapse.stopAnimation();
      feedHeaderCollapse.setValue(0);
      feedChromeCollapse.stopAnimation();
      feedChromeCollapse.setValue(0);
    }
  }, [feedChromeCollapse, feedHeaderCollapse, setFeedBrandHeaderVisible, setFeedFloatingHeaderShown, tabTransition]);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    if (!tabTransition || tabTransition.mode === 'drag') return;

    const targetTopIndex = TABS.findIndex((tab) => tab.key === tabTransition.to);
    const isFadeTransition = tabTransition.mode === 'fade';
    const animations = [
      Animated.timing(tabSlideX, {
        toValue: isFadeTransition ? 1 : -tabTransition.direction * width,
        duration: isFadeTransition ? 180 : TAB_PRESS_TRANSITION_MS,
        easing: isFadeTransition ? Easing.out(Easing.quad) : Easing.out(Easing.cubic),
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

  const refreshUnreadCounts = useCallback(async (force = false) => {
    if (!user?.uid) return;
    if (unreadRefreshInFlightRef.current) return;
    if (!force && lastUnreadRefreshAtRef.current && Date.now() - lastUnreadRefreshAtRef.current < 20_000) return;

    try {
      unreadRefreshInFlightRef.current = true;
      const [notificationData, messageData] = await Promise.all([
        api.get<CountResponse>('/api/notifications/unread-count'),
        api.get<CountResponse>('/api/conversations/unread-count'),
      ]);

      if (typeof notificationData.count === 'number') {
        setNotificationUnreadCount(notificationData.count);
      }
      if (typeof messageData.count === 'number') {
        setUnreadMessages(messageData.count);
      }
    } catch {
      // The center screens still reconcile their lists; badge refresh is best effort.
    } finally {
      unreadRefreshInFlightRef.current = false;
      lastUnreadRefreshAtRef.current = Date.now();
    }
  }, [setNotificationUnreadCount, setUnreadMessages, user?.uid]);

  useEffect(() => {
    if (!user?.uid || !isFocused) return;
    void refreshUnreadCounts();
  }, [isFocused, refreshUnreadCounts, user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;

    connectSocket(user.uid);
    const socket = getSocket();

    const onNotificationNew = (payload: NotificationItem) => {
      if (payload?.id) upsertNotification(payload);
    };
    const onNotificationUnreadCount = (payload: CountResponse) => {
      if (typeof payload?.count === 'number') setNotificationUnreadCount(payload.count);
    };
    const onNotificationRead = ({ id }: { id?: string }) => {
      if (id) markNotificationRead(id);
    };
    const onNotificationReadAll = () => {
      markAllNotificationsRead();
      setNotificationUnreadCount(0);
    };
    const onMessageNew = (payload: RealtimeMessagePayload & { muted?: boolean }) => {
      if (payload?.message?.senderId !== user.uid && !payload?.muted) {
        void refreshUnreadCounts();
      }
    };
    const onMessageUnreadCount = (payload: CountResponse) => {
      if (typeof payload?.count === 'number') setUnreadMessages(payload.count);
    };

    socket.on('notification:new', onNotificationNew);
    socket.on('notification:unread-count', onNotificationUnreadCount);
    socket.on('notification:read', onNotificationRead);
    socket.on('notification:read-all', onNotificationReadAll);
    socket.on('message:new', onMessageNew);
    socket.on('message:unread-count', onMessageUnreadCount);

    void refreshUnreadCounts(true);

    return () => {
      socket.off('notification:new', onNotificationNew);
      socket.off('notification:unread-count', onNotificationUnreadCount);
      socket.off('notification:read', onNotificationRead);
      socket.off('notification:read-all', onNotificationReadAll);
      socket.off('message:new', onMessageNew);
      socket.off('message:unread-count', onMessageUnreadCount);
    };
  }, [
    markAllNotificationsRead,
    markNotificationRead,
    refreshUnreadCounts,
    setNotificationUnreadCount,
    setUnreadMessages,
    upsertNotification,
    user?.uid,
  ]);

  const handleClipsFullscreenChange = useCallback((enabled: boolean) => {
    setClipsFullscreen(enabled);
  }, []);

  const shouldRenderTab = useCallback((tab: Tab) => {
    if (tab === 'video') {
      return tab === active || tab === tabTransition?.from || tab === tabTransition?.to;
    }
    return visited.has(tab) || tab === tabTransition?.from || tab === tabTransition?.to;
  }, [active, tabTransition, visited]);

  const sceneStyleFor = useCallback((tab: Tab) => {
    const sceneSurface = { backgroundColor: tab === 'video' ? '#000' : C.bg };

    if (!tabTransition) {
      return tab === active
        ? [s.sceneLayer, sceneSurface, s.sceneVisible]
        : [s.sceneLayer, sceneSurface, s.sceneHidden];
    }

    if (tabTransition.mode === 'fade') {
      if (tab === tabTransition.from) {
        return [
          s.sceneLayer,
          sceneSurface,
          s.sceneVisible,
          {
            zIndex: 1,
            opacity: tabSlideX.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0],
              extrapolate: 'clamp',
            }),
          },
        ];
      }

      if (tab === tabTransition.to) {
        return [
          s.sceneLayer,
          sceneSurface,
          s.sceneVisible,
          {
            zIndex: 2,
            opacity: tabSlideX.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 1],
              extrapolate: 'clamp',
            }),
          },
        ];
      }
    }

    if (tab === tabTransition.from) {
      return [
        s.sceneLayer,
        sceneSurface,
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
        sceneSurface,
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

    return [s.sceneLayer, sceneSurface, s.sceneHidden];
  }, [C.bg, active, tabSlideX, tabTransition, width]);

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
      {reloadingTab && (
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
                    outputRange: [-12, 10, 20],
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
          <View style={[s.reloadBubble, { backgroundColor: floating ? 'rgba(15,23,42,0.72)' : C.bg }]}>
            <ActivityIndicator size="small" color={floating ? '#fff' : C.accent} />
          </View>
        </Animated.View>
      )}
      {TABS.map((tab) => {
        const isActive = visualActive === tab.key;
        const color = floating ? '#fff' : isActive ? C.accent : C.subtext;
        return (
          <TouchableOpacity
            key={tab.key}
            style={s.topTabBtn}
            onPress={() => handleTab(tab.key)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityLabel={t(tab.labelKey)}
            >
              <Ionicons
                name={isActive ? tab.iconActive : tab.icon}
                size={28}
                color={color}
                style={floating ? s.floatingIconShadow : undefined}
              />
            {tab.key === 'messages' && unreadMessages > 0 && (
              <View style={[s.topBadge, { backgroundColor: C.danger }]}>
                <Text style={s.badgeText}>{unreadMessages > 99 ? '99+' : unreadMessages}</Text>
              </View>
            )}
            {tab.key === 'notifications' && unreadNotifications > 0 && (
              <View style={[s.topBadge, { backgroundColor: C.danger }]}>
                <Text style={s.badgeText}>{unreadNotifications > 99 ? '99+' : unreadNotifications}</Text>
              </View>
            )}
            {tab.key === 'friends' && incomingFriendRequests > 0 && (
              <View style={[s.topBadge, { backgroundColor: C.danger }]}>
                <Text style={s.badgeText}>{incomingFriendRequests > 99 ? '99+' : incomingFriendRequests}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const clipsOverlay = (
    <View style={[s.clipsOverlay, { top: hideClipsChrome ? 0 : insets.top }]} pointerEvents="box-none">
      <View style={s.floatingClipsHeader} pointerEvents="box-none">
        <TouchableOpacity hitSlop={HIT} onPress={toggleSidebar} accessibilityRole="button" accessibilityLabel={t('open_menu')}>
          <Ionicons name="menu-outline" size={26} color="#fff" style={s.floatingIconShadow} />
        </TouchableOpacity>
        <Text style={[s.floatingClipsTitle, s.floatingTextShadow]} numberOfLines={1}>Surf Clips</Text>
        <TouchableOpacity
          hitSlop={HIT}
          onPress={() => navigation.navigate('CreateClip')}
          accessibilityRole="button"
          accessibilityLabel={t('create_clip')}
        >
          <Ionicons name="camera-outline" size={26} color="#fff" style={s.floatingIconShadow} />
        </TouchableOpacity>
        <TouchableOpacity
          hitSlop={HIT}
          accessibilityRole="button"
          accessibilityLabel={t('search_clips')}
          onPress={() => navigation.navigate('Search')}
        >
          <Ionicons name="search-outline" size={26} color="#fff" style={s.floatingIconShadow} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderCompactHeader = (
    tab: Exclude<Tab, 'home' | 'feed' | 'video'>,
    options: { mergeWithSubHeader?: boolean } = {}
  ) => {
    const title = t(TAB_TITLE_KEYS[tab]);

    return (
      <View
        style={[
          s.compactHeader,
          {
            backgroundColor: C.bg,
            borderBottomColor: C.border,
            borderBottomWidth: options.mergeWithSubHeader ? 0 : 1,
          },
        ]}
      >
        <TouchableOpacity hitSlop={HIT} onPress={toggleSidebar} accessibilityRole="button" accessibilityLabel={t('open_menu')}>
          <Ionicons name="menu-outline" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={[s.compactTitle, { color: C.text }]} numberOfLines={1}>{title}</Text>
        <TouchableOpacity
          hitSlop={HIT}
          accessibilityRole="button"
          accessibilityLabel={t('search_in', { value: title })}
          onPress={() => navigation.navigate('Search')}
        >
          <Ionicons name="search-outline" size={24} color={C.text} />
        </TouchableOpacity>
      </View>
    );
  };

  const feedBrandHeader = (
    <Animated.View
      style={[
        s.feedBrandHeaderClip,
        {
          height: feedHeaderCollapse.interpolate({
            inputRange: [0, 1],
            outputRange: [FEED_BRAND_HEADER_H, 0],
            extrapolate: 'clamp',
          }),
          opacity: feedHeaderCollapse.interpolate({
            inputRange: [0, 0.45, 1],
            outputRange: [1, 0.72, 0],
            extrapolate: 'clamp',
          }),
        },
      ]}
    >
      <Animated.View
        style={[
          s.header,
          {
            backgroundColor: C.bg,
            transform: [
              {
                translateY: feedHeaderCollapse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -(FEED_BRAND_HEADER_H + 10)],
                  extrapolate: 'clamp',
                }),
              },
            ],
          },
        ]}
      >
        <View style={s.headerBrand}>
          <TouchableOpacity
            hitSlop={HIT}
            onPress={toggleSidebar}
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityLabel={t('open_menu')}
            style={s.menuBrandBtn}
          >
            <Ionicons name="menu-outline" size={25} color={C.text} />
          </TouchableOpacity>
          <TouchableOpacity
            hitSlop={HIT}
            onPress={handleSurfPress}
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityLabel={t('back_home')}
            style={s.brandTextBtn}
          >
            <Text style={s.headerTitle}>Surf</Text>
          </TouchableOpacity>
        </View>
        <View style={s.headerActions}>
          <TouchableOpacity
            hitSlop={HIT}
            onPress={() => navigation.navigate('CreatePost')}
            accessibilityRole="button"
            accessibilityLabel={t('create_post')}
          >
            <Ionicons name="add-circle-outline" size={26} color={C.text} />
          </TouchableOpacity>
          <TouchableOpacity hitSlop={HIT} accessibilityRole="button" accessibilityLabel={t('search')} onPress={() => navigation.navigate('Search')}>
            <Ionicons name="search-outline" size={24} color={C.text} />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Animated.View>
  );

  const feedListHeader = (
    <>
      <View style={[s.header, { backgroundColor: C.bg }]}>
        <View style={s.headerBrand}>
          <TouchableOpacity
            hitSlop={HIT}
            onPress={toggleSidebar}
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityLabel={t('open_menu')}
            style={s.menuBrandBtn}
          >
            <Ionicons name="menu-outline" size={25} color={C.text} />
          </TouchableOpacity>
          <TouchableOpacity
            hitSlop={HIT}
            onPress={handleSurfPress}
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityLabel={t('back_home')}
            style={s.brandTextBtn}
          >
            <Text style={s.headerTitle}>Surf</Text>
          </TouchableOpacity>
        </View>
        <View style={s.headerActions}>
          <TouchableOpacity
            hitSlop={HIT}
            onPress={() => navigation.navigate('CreatePost')}
            accessibilityRole="button"
            accessibilityLabel={t('create_post')}
          >
            <Ionicons name="add-circle-outline" size={26} color={C.text} />
          </TouchableOpacity>
          <TouchableOpacity hitSlop={HIT} accessibilityRole="button" accessibilityLabel={t('search')} onPress={() => navigation.navigate('Search')}>
            <Ionicons name="search-outline" size={24} color={C.text} />
          </TouchableOpacity>
        </View>
      </View>
      {renderTopTabs()}
    </>
  );

  const surfBrandButton = (
    <TouchableOpacity
      hitSlop={HIT}
      onPress={handleSurfPress}
      activeOpacity={0.78}
      accessibilityRole="button"
      accessibilityLabel={visualActive === 'home' ? t('nav_feed') : t('back_home')}
    style={s.brandTextBtn}
  >
    <Text style={s.headerTitle}>Surf</Text>
  </TouchableOpacity>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: hideClipsChrome ? '#000' : C.bg }} edges={hideClipsChrome ? [] : ['top']}>
      {!hideClipsChrome && (isFeedSurface ? (
        <>
          {visualActive === 'home' ? (
            <View style={[s.homeHeader, { backgroundColor: C.bg, borderBottomColor: C.border }]}>
              {surfBrandButton}
            </View>
          ) : isFeedChromeSurface ? (
            <Animated.View
              style={{
                height: feedChromeCollapse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [FEED_BRAND_HEADER_H + FEED_TAB_HEADER_H, 0],
                  extrapolate: 'clamp',
                }),
                opacity: feedChromeCollapse.interpolate({
                  inputRange: [0, 0.75, 1],
                  outputRange: [1, 0.4, 0],
                  extrapolate: 'clamp',
                }),
                overflow: 'hidden',
              }}
            >
              {feedBrandHeader}
              {renderTopTabs()}
            </Animated.View>
          ) : (
            null
          )}
        </>
      ) : (
        <>
          {isClipsSurface ? renderTopTabs(true) : renderTopTabs()}
          {false && !isClipsSurface && (
            <View style={[s.compactHeader, { backgroundColor: C.bg, borderBottomColor: C.border }]}>
              <TouchableOpacity hitSlop={HIT} onPress={toggleSidebar} accessibilityRole="button" accessibilityLabel={t('open_menu')}>
                <Ionicons name="menu-outline" size={24} color={C.text} />
              </TouchableOpacity>
              <Text style={[s.compactTitle, { color: C.text }]} numberOfLines={1}>{compactTitle}</Text>
              <TouchableOpacity
                hitSlop={HIT}
                accessibilityRole="button"
                accessibilityLabel={t('search_in', { value: compactTitle })}
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
              onVideoPress={() => handleTab('video')}
              onNotificationsPress={() => handleTab('notifications')}
              onMessagesPress={() => handleTab('messages')}
            />
          </Animated.View>
        )}

        {shouldRenderTab('feed') && (
          <Animated.View style={sceneStyleFor('feed')} pointerEvents={active === 'feed' ? 'auto' : 'none'}>
            <FeedScreen
              navigation={navigation as any}
              isActive={visualActive === 'feed'}
              scrollTopSignal={scrollTopSignals.feed}
              resetSignal={resetSignals.feed}
              safeTop={false}
              onCreatePost={() => navigation.navigate('CreatePost')}
              headerComponent={isFeedChromeSurface ? null : feedListHeader}
              onFloatingHeaderChange={setFeedFloatingHeaderShown}
              onScrollPositionChange={(atTop) => updateTabAtTop('feed', atTop)}
            />
          </Animated.View>
        )}

        {shouldRenderTab('video') && (
          <Animated.View style={[sceneStyleFor('video'), s.sceneWithOverlay]} pointerEvents={active === 'video' ? 'auto' : 'none'}>
            <ShortVideoScreen
              isActive={visualActive === 'video' && isFocused}
              scrollTopSignal={scrollTopSignals.video}
              resetSignal={resetSignals.video}
              safeTop={false}
              showTitle={false}
              onFullscreenChange={handleClipsFullscreenChange}
              onScrollPositionChange={(atTop) => updateTabAtTop('video', atTop)}
            />
            {visualActive === 'video' && !clipsFullscreen && clipsOverlay}
          </Animated.View>
        )}

        {shouldRenderTab('friends') && (
          <Animated.View style={sceneStyleFor('friends')} pointerEvents={active === 'friends' ? 'auto' : 'none'}>
            {renderCompactHeader('friends', { mergeWithSubHeader: true })}
            <FriendsScreen
              navigation={navigation as any}
              scrollTopSignal={scrollTopSignals.friends}
              resetSignal={resetSignals.friends}
              safeTop={false}
              showTitleBlock={false}
              onScrollPositionChange={(atTop) => updateTabAtTop('friends', atTop)}
            />
          </Animated.View>
        )}

        {shouldRenderTab('notifications') && (
          <Animated.View style={sceneStyleFor('notifications')} pointerEvents={active === 'notifications' ? 'auto' : 'none'}>
            {renderCompactHeader('notifications')}
            <NotificationCenterScreen
              navigation={navigation as any}
              isActive={visualActive === 'notifications'}
              scrollTopSignal={scrollTopSignals.notifications}
              resetSignal={resetSignals.notifications}
              safeTop={false}
              showHeader={false}
              onScrollPositionChange={(atTop) => updateTabAtTop('notifications', atTop)}
            />
          </Animated.View>
        )}

        {shouldRenderTab('messages') && (
          <Animated.View style={sceneStyleFor('messages')} pointerEvents={active === 'messages' ? 'auto' : 'none'}>
            {renderCompactHeader('messages')}
            <MessagesScreen
              navigation={navigation as any}
              scrollTopSignal={scrollTopSignals.messages}
              resetSignal={resetSignals.messages}
              safeTop={false}
              showHeader={false}
              onScrollPositionChange={(atTop) => updateTabAtTop('messages', atTop)}
            />
          </Animated.View>
        )}

        {shouldRenderTab('profile') && (
          <Animated.View style={sceneStyleFor('profile')} pointerEvents={active === 'profile' ? 'auto' : 'none'}>
            <ProfileScreen
              navigation={navigation as any}
              route={{ key: 'MainTabsProfile', name: 'Profile', params: undefined } as any}
              isActive={visualActive === 'profile'}
              scrollTopSignal={scrollTopSignals.profile}
              resetSignal={resetSignals.profile}
              safeTop={false}
              showBackButton={false}
              onScrollPositionChange={(atTop) => updateTabAtTop('profile', atTop)}
            />
          </Animated.View>
        )}
      </Animated.View>

      {feedFloatingHeaderVisible && active === 'feed' && !tabTransition && (
        <Animated.View
          style={[
            s.feedFloatingHeader,
            {
              top: insets.top,
              backgroundColor: C.bg,
              opacity: feedFloatingHeader.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 0],
                extrapolate: 'clamp',
              }),
              transform: [
                {
                  translateY: feedFloatingHeader.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -(FEED_BRAND_HEADER_H + FEED_TAB_HEADER_H)],
                    extrapolate: 'clamp',
                  }),
                },
              ],
            },
          ]}
        >
          {feedListHeader}
        </Animated.View>
      )}

      <Sidebar visible={sidebarOpen} onClose={closeSidebar} navigation={navigation} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 4,
    borderBottomWidth: 0,
  },
  feedBrandHeaderClip: {
    overflow: 'hidden',
  },
  feedFloatingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 25,
    elevation: 8,
  },
  homeHeader: {
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  headerBrand: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  menuBrandBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTextBtn: {
    minHeight: 34,
    justifyContent: 'center',
    paddingRight: 10,
  },
  headerTitle: {
    color: '#14b8d4',
    fontSize: 23,
    fontWeight: '900',
    letterSpacing: 0,
    textShadowColor: 'rgba(20, 184, 212, 0.28)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
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
    borderBottomWidth: 0,
    minHeight: 46,
    position: 'relative',
  },
  floatingTopTabs: {
    borderBottomWidth: 0,
    minHeight: 50,
  },
  topTabBtn: {
    flex: 1,
    minHeight: 46,
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
    left: '50%',
    bottom: -2,
    marginLeft: -15,
    zIndex: 3,
  },
  reloadBubble: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
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
    display: 'none',
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
