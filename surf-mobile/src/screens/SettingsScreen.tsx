import React, { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  LayoutChangeEvent,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation';
import { api } from '@/lib/api';
import { auth, reauthenticate } from '@/lib/firebase/auth';
import { useAuthStore } from '@/stores/authStore';
import {
  type LanguageCode,
  type MobileSettingsPrefs,
  type ThemeMode,
  useSettingsStore,
} from '@/stores/settingsStore';
import { useUserStore, type NotificationType, type UserProfile } from '@/stores/userStore';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Settings'>;
};

type DetailKey =
  | 'privacy-checkup'
  | 'account-security'
  | 'active-sessions'
  | 'block-list'
  | 'reports'
  | 'policy'
  | 'delete-account';

type Palette = typeof DARK;

type BlockedUser = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  email?: string | null;
};

type UserReport = {
  id: string;
  reason?: string;
  status?: string;
  createdAt?: string;
  resolvedAt?: string;
  postId?: string;
  commentId?: string;
  type?: string;
  aiReason?: string;
};

const DARK = {
  bg: '#0c1929',
  surface: '#102033',
  card: '#13263a',
  cardSoft: '#162d43',
  border: '#28415b',
  text: '#f1f5f9',
  subtext: '#9fb0c3',
  muted: '#6f8194',
  accent: '#0ea5e9',
  accentSoft: '#0ea5e929',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  chip: '#20364d',
};

const LIGHT = {
  bg: '#f5f8fb',
  surface: '#ffffff',
  card: '#ffffff',
  cardSoft: '#eff6ff',
  border: '#dbe5ee',
  text: '#132338',
  subtext: '#5f7288',
  muted: '#94a3b8',
  accent: '#0284c7',
  accentSoft: '#0284c71f',
  success: '#16a34a',
  warning: '#d97706',
  danger: '#dc2626',
  chip: '#eaf2fb',
};

const HIT = { top: 10, bottom: 10, left: 10, right: 10 };

const POST_PRIVACY_LABELS: Record<UserProfile['defaultPostPrivacy'], string> = {
  public: 'Công khai',
  friends: 'Bạn bè',
  'only-me': 'Chỉ mình tôi',
  custom: 'Tùy chỉnh',
};

const POST_PRIVACY_DESCRIPTIONS: Record<UserProfile['defaultPostPrivacy'], string> = {
  public: 'Mọi người có thể xem bài viết mới của bạn.',
  friends: 'Chỉ bạn bè nhìn thấy bài viết mới.',
  'only-me': 'Chỉ bạn xem được bài viết mới.',
  custom: 'Tự chọn theo từng nhóm người xem.',
};

const POST_PRIVACY_ICONS: Record<UserProfile['defaultPostPrivacy'], keyof typeof Ionicons.glyphMap> = {
  public: 'earth-outline',
  friends: 'people-outline',
  'only-me': 'lock-closed-outline',
  custom: 'options-outline',
};

const FRIEND_REQUEST_LABELS: Record<UserProfile['friendRequestPrivacy'], string> = {
  everyone: 'Mọi người',
  friends_of_friends: 'Bạn của bạn bè',
};

const NOTIFICATION_ITEMS: Array<{
  key: NotificationType;
  title: string;
  desc: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  {
    key: 'friend_request',
    title: 'Lời mời kết bạn',
    desc: 'Có người gửi lời mời mới.',
    icon: 'person-add-outline',
  },
  {
    key: 'friend_accept',
    title: 'Chấp nhận kết bạn',
    desc: 'Lời mời của bạn được chấp nhận.',
    icon: 'checkmark-circle-outline',
  },
  {
    key: 'post_reaction',
    title: 'Cảm xúc',
    desc: 'Bài viết hoặc bình luận được thả cảm xúc.',
    icon: 'heart-outline',
  },
  {
    key: 'comment',
    title: 'Bình luận',
    desc: 'Có bình luận hoặc trả lời mới.',
    icon: 'chatbubble-ellipses-outline',
  },
  {
    key: 'mention',
    title: 'Nhắc tên',
    desc: 'Bạn được nhắc trong nội dung trên Surf.',
    icon: 'at-outline',
  },
  {
    key: 'share',
    title: 'Chia sẻ',
    desc: 'Nội dung của bạn được chia sẻ.',
    icon: 'arrow-redo-outline',
  },
  {
    key: 'missed_call',
    title: 'Cuộc gọi nhỡ',
    desc: 'Bạn bỏ lỡ cuộc gọi hoặc phòng trò chuyện.',
    icon: 'call-outline',
  },
  {
    key: 'system',
    title: 'Hệ thống',
    desc: 'Cập nhật quan trọng từ Surf.',
    icon: 'information-circle-outline',
  },
];

const THEME_LABELS: Record<ThemeMode, string> = {
  system: 'Theo hệ thống',
  light: 'Sáng',
  dark: 'Tối',
};

const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  vi: 'Tiếng Việt',
  en: 'English',
};

function maskEmail(email: string) {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  return `${local.charAt(0)}**@${domain}`;
}

export default function SettingsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const { profile, loading, fetchProfile, updateProfile } = useUserStore();
  const resetAuth = useAuthStore((state) => state.resetAuth);
  const prefs = useSettingsStore((state) => state.prefs);
  const prefsReady = useSettingsStore((state) => state.hydrated);
  const updatePreference = useSettingsStore((state) => state.updatePreference);

  const scrollRef = useRef<ScrollView>(null);
  const [notificationsY, setNotificationsY] = useState(0);
  const [saving, setSaving] = useState(false);
  const [selectedPrivacy, setSelectedPrivacy] = useState(false);
  const [selectedFriendRequests, setSelectedFriendRequests] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(false);
  const [detail, setDetail] = useState<DetailKey | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [blockedQuery, setBlockedQuery] = useState('');
  const [reports, setReports] = useState<UserReport[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const effectiveScheme =
    prefs.themeMode === 'system' ? scheme : prefs.themeMode;
  const C = effectiveScheme === 'dark' ? DARK : LIGHT;

  useEffect(() => {
    if (!profile && !loading) {
      void fetchProfile();
    }
  }, [fetchProfile, loading, profile]);

  const loadBlockedUsers = async () => {
    try {
      setDetailLoading(true);
      setDetailError(null);
      const data = await api.get<{ blocked: BlockedUser[] }>('/api/users/me/blocked');
      setBlockedUsers(data.blocked ?? []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Không tải được danh sách chặn.';
      setDetailError(message);
    } finally {
      setDetailLoading(false);
    }
  };

  const loadReports = async () => {
    try {
      setDetailLoading(true);
      setDetailError(null);
      const data = await api.get<{ reports: UserReport[] }>('/api/users/me/reports');
      setReports(data.reports ?? []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Không tải được báo cáo.';
      setDetailError(message);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    if (detail === 'block-list') {
      void loadBlockedUsers();
    }
    if (detail === 'reports') {
      void loadReports();
    }
  }, [detail]);

  const updateLocalPref = <K extends keyof MobileSettingsPrefs>(key: K, value: MobileSettingsPrefs[K]) => {
    void updatePreference(key, value);
  };

  const updateRemoteProfile = async (data: Partial<UserProfile>) => {
    try {
      setSaving(true);
      await updateProfile(data);
    } catch (err) {
      console.warn('Failed to update settings:', err);
      Alert.alert('Không thể lưu', 'Vui lòng kiểm tra kết nối và thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleNotification = (key: NotificationType, enabled: boolean) => {
    if (!profile) return;

    void updateRemoteProfile({
      notificationPrefs: {
        ...profile.notificationPrefs,
        [key]: enabled,
      },
    });
  };

  const handleLogout = () => {
    Alert.alert('Đăng xuất', 'Bạn có chắc muốn đăng xuất khỏi Surf?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Đăng xuất',
        style: 'destructive',
        onPress: () => void resetAuth(),
      },
    ]);
  };

  const handleUnblock = async (targetUid: string) => {
    try {
      setProcessingId(targetUid);
      await api.delete(`/api/users/${targetUid}/block`);
      setBlockedUsers((items) => items.filter((item) => item.id !== targetUid));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Không thể bỏ chặn người dùng này.';
      Alert.alert('Bỏ chặn thất bại', message);
    } finally {
      setProcessingId(null);
    }
  };

  const scrollToNotifications = () => {
    scrollRef.current?.scrollTo({ y: Math.max(notificationsY - 12, 0), animated: true });
  };

  const handleNotificationsLayout = (event: LayoutChangeEvent) => {
    setNotificationsY(event.nativeEvent.layout.y);
  };

  const initials = useMemo(() => {
    const name = profile?.displayName?.trim() || profile?.email?.split('@')[0] || 'Surf';
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('');
  }, [profile]);

  if (!prefsReady || (!profile && loading)) {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: C.bg }]}>
        <Header C={C} navigation={navigation} saving={false} />
        <View style={s.center}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={[s.loadingText, { color: C.subtext }]}>Đang tải cài đặt...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]} edges={['top']}>
      <Header C={C} navigation={navigation} saving={saving} />

      <ScrollView
        ref={scrollRef}
        style={s.scroll}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        <ProfileCard
          C={C}
          initials={initials}
          profile={profile}
          onEdit={() => navigation.navigate('EditProfile')}
        />

        <View style={s.quickWrap}>
          <QuickCard
            C={C}
            icon="lock-closed-outline"
            title="Rà soát riêng tư"
            desc="Kiểm tra nhanh"
            onPress={() => setDetail('privacy-checkup')}
          />
          <QuickCard
            C={C}
            icon="shield-checkmark-outline"
            title="Bảo mật"
            desc="Tài khoản"
            onPress={() => setDetail('account-security')}
          />
          <QuickCard
            C={C}
            icon="notifications-outline"
            title="Thông báo"
            desc="Tùy chỉnh"
            onPress={scrollToNotifications}
          />
        </View>

        <Section title="Tài khoản" C={C}>
          <SettingsRow
            C={C}
            icon="person-circle-outline"
            title="Hồ sơ cá nhân"
            desc="Ảnh đại diện, tiểu sử và thông tin hiển thị"
            onPress={() => navigation.navigate('EditProfile')}
          />
          <SettingsRow
            C={C}
            icon="shield-checkmark-outline"
            title="Bảo mật tài khoản"
            desc="Mật khẩu, email và xác thực đăng nhập"
            onPress={() => setDetail('account-security')}
          />
          <SettingsRow
            C={C}
            icon="phone-portrait-outline"
            title="Phiên đăng nhập"
            desc="Thiết bị này đang hoạt động"
            onPress={() => setDetail('active-sessions')}
          />
        </Section>

        <Section title="Quyền riêng tư & bảo vệ" C={C}>
          <SettingsRow
            C={C}
            icon="eye-outline"
            title="Đối tượng xem mặc định"
            desc={profile ? POST_PRIVACY_LABELS[profile.defaultPostPrivacy] : 'Chưa tải'}
            onPress={() => setSelectedPrivacy(true)}
          />
          <SettingsRow
            C={C}
            icon="person-add-outline"
            title="Lời mời kết bạn"
            desc={profile ? FRIEND_REQUEST_LABELS[profile.friendRequestPrivacy] : 'Chưa tải'}
            onPress={() => setSelectedFriendRequests(true)}
          />
          <SettingsRow
            C={C}
            icon="ban-outline"
            title="Danh sách chặn"
            desc="Quản lý người bạn không muốn tương tác"
            onPress={() => setDetail('block-list')}
          />
        </Section>

        <Section title="Giao diện & trải nghiệm mobile" C={C}>
          <SettingsRow
            C={C}
            icon="language-outline"
            title={prefs.language === 'en' ? 'Language' : 'Ngôn ngữ'}
            desc={LANGUAGE_LABELS[prefs.language]}
            onPress={() => setSelectedLanguage(true)}
          />
          <SettingsRow
            C={C}
            icon={prefs.themeMode === 'dark' ? 'moon-outline' : 'color-palette-outline'}
            title="Giao diện"
            desc={THEME_LABELS[prefs.themeMode]}
            onPress={() => setSelectedTheme(true)}
          />
          <SettingsSwitchRow
            C={C}
            icon="moon-outline"
            title="Dark Mode"
            desc="Bật nhanh giao diện tối trên toàn app"
            value={prefs.themeMode === 'dark'}
            onValueChange={(value) => updateLocalPref('themeMode', value ? 'dark' : 'light')}
          />
          <SettingsSwitchRow
            C={C}
            icon="cloud-offline-outline"
            title={prefs.language === 'en' ? 'Feed cache' : 'Cache feed'}
            desc={prefs.language === 'en' ? 'Show recent feed when the network is unavailable' : 'Hiển thị feed gần đây khi mất kết nối'}
            value={prefs.feedCache}
            onValueChange={(value) => updateLocalPref('feedCache', value)}
          />
          <SettingsSwitchRow
            C={C}
            icon="play-circle-outline"
            title={prefs.language === 'en' ? 'Autoplay Surf Clips' : 'Tự phát Surf Clips'}
            desc={prefs.language === 'en' ? 'Play the visible clip automatically' : 'Tự phát clip đang hiển thị'}
            value={prefs.autoplayClips}
            onValueChange={(value) => updateLocalPref('autoplayClips', value)}
          />
          <SettingsSwitchRow
            C={C}
            icon="cellular-outline"
            title={prefs.language === 'en' ? 'Data saver' : 'Tiết kiệm dữ liệu'}
            desc={prefs.language === 'en' ? 'Use lighter images and videos where possible' : 'Ưu tiên ảnh và video nhẹ hơn khi có thể'}
            value={prefs.reduceDataUsage}
            onValueChange={(value) => updateLocalPref('reduceDataUsage', value)}
          />
        </Section>

        <Section title="Thông báo & nhắc nhở" C={C} onLayout={handleNotificationsLayout}>
          {NOTIFICATION_ITEMS.map((item) => (
            <SettingsSwitchRow
              key={item.key}
              C={C}
              icon={item.icon}
              title={item.title}
              desc={item.desc}
              value={profile?.notificationPrefs?.[item.key] ?? true}
              disabled={!profile || saving}
              onValueChange={(value) => handleToggleNotification(item.key, value)}
            />
          ))}
        </Section>

        <Section title="Hỗ trợ & chính sách" C={C}>
          <SettingsRow
            C={C}
            icon="flag-outline"
            title="Báo cáo vi phạm"
            desc="Gửi phản hồi an toàn cho đội ngũ Surf"
            onPress={() => setDetail('reports')}
          />
          <SettingsRow
            C={C}
            icon="document-text-outline"
            title="Chính sách cộng đồng"
            desc="Điều khoản, quyền riêng tư và tiêu chuẩn nội dung"
            onPress={() => setDetail('policy')}
          />
          <SettingsRow
            C={C}
            icon="trash-outline"
            title="Xóa tài khoản"
            desc="Vùng nguy hiểm, cần xác nhận thêm"
            danger
            onPress={() => setDetail('delete-account')}
          />
        </Section>

        <TouchableOpacity
          style={[s.logoutBtn, { borderColor: C.danger, backgroundColor: `${C.danger}14` }]}
          activeOpacity={0.82}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={20} color={C.danger} />
          <Text style={[s.logoutText, { color: C.danger }]}>Đăng xuất</Text>
        </TouchableOpacity>
      </ScrollView>

      <ChoiceModal<UserProfile['defaultPostPrivacy']>
        C={C}
        visible={selectedPrivacy}
        title="Đối tượng xem mặc định"
        subtitle="Áp dụng cho bài viết mới của bạn."
        value={profile?.defaultPostPrivacy ?? 'friends'}
        options={(Object.keys(POST_PRIVACY_LABELS) as UserProfile['defaultPostPrivacy'][]).map((value) => ({
          value,
          label: POST_PRIVACY_LABELS[value],
          desc: POST_PRIVACY_DESCRIPTIONS[value],
          icon: POST_PRIVACY_ICONS[value],
        }))}
        onClose={() => setSelectedPrivacy(false)}
        onSelect={(value) => {
          setSelectedPrivacy(false);
          void updateRemoteProfile({ defaultPostPrivacy: value });
        }}
      />

      <ChoiceModal<UserProfile['friendRequestPrivacy']>
        C={C}
        visible={selectedFriendRequests}
        title="Ai có thể gửi lời mời?"
        subtitle="Giảm lời mời lạ nếu bạn muốn trải nghiệm riêng tư hơn."
        value={profile?.friendRequestPrivacy ?? 'everyone'}
        options={[
          {
            value: 'everyone',
            label: 'Mọi người',
            desc: 'Bất kỳ người dùng Surf nào cũng có thể gửi lời mời.',
            icon: 'people-outline',
          },
          {
            value: 'friends_of_friends',
            label: 'Bạn của bạn bè',
            desc: 'Chỉ người có bạn chung mới có thể gửi lời mời.',
            icon: 'git-network-outline',
          },
        ]}
        onClose={() => setSelectedFriendRequests(false)}
        onSelect={(value) => {
          setSelectedFriendRequests(false);
          void updateRemoteProfile({ friendRequestPrivacy: value });
        }}
      />

      <ChoiceModal<ThemeMode>
        C={C}
        visible={selectedTheme}
        title="Giao diện"
        subtitle="Thiết lập này được lưu trên thiết bị hiện tại."
        value={prefs.themeMode}
        options={[
          {
            value: 'system',
            label: 'Theo hệ thống',
            desc: 'Surf tự đổi sáng/tối theo điện thoại.',
            icon: 'phone-portrait-outline',
          },
          {
            value: 'light',
            label: 'Sáng',
            desc: 'Nền sáng, dễ đọc ngoài trời.',
            icon: 'sunny-outline',
          },
          {
            value: 'dark',
            label: 'Tối',
            desc: 'Dịu mắt khi dùng vào ban đêm.',
            icon: 'moon-outline',
          },
        ]}
        onClose={() => setSelectedTheme(false)}
        onSelect={(value) => {
          setSelectedTheme(false);
          updateLocalPref('themeMode', value);
        }}
      />

      <ChoiceModal<LanguageCode>
        C={C}
        visible={selectedLanguage}
        title={prefs.language === 'en' ? 'Language' : 'Ngôn ngữ'}
        subtitle={prefs.language === 'en' ? 'Applies to the mobile settings experience.' : 'Áp dụng cho trải nghiệm cài đặt trên mobile.'}
        value={prefs.language}
        options={[
          {
            value: 'vi',
            label: 'Tiếng Việt',
            desc: 'Hiển thị cài đặt bằng tiếng Việt.',
            icon: 'language-outline',
          },
          {
            value: 'en',
            label: 'English',
            desc: 'Show settings in English.',
            icon: 'language-outline',
          },
        ]}
        onClose={() => setSelectedLanguage(false)}
        onSelect={(value) => {
          setSelectedLanguage(false);
          updateLocalPref('language', value);
        }}
      />

      <DetailSheet
        C={C}
        detail={detail}
        profile={profile}
        loading={detailLoading}
        error={detailError}
        blockedUsers={blockedUsers}
        blockedQuery={blockedQuery}
        reports={reports}
        processingId={processingId}
        onClose={() => setDetail(null)}
        onRefreshBlocked={loadBlockedUsers}
        onRefreshReports={loadReports}
        onUnblock={handleUnblock}
        onBlockedQueryChange={setBlockedQuery}
        onLogout={handleLogout}
        onOpenDefaultAudience={() => {
          setDetail(null);
          setSelectedPrivacy(true);
        }}
        onOpenFriendRequests={() => {
          setDetail(null);
          setSelectedFriendRequests(true);
        }}
        onOpenBlockList={() => setDetail('block-list')}
        onOpenNotifications={() => {
          setDetail(null);
          requestAnimationFrame(scrollToNotifications);
        }}
      />
    </SafeAreaView>
  );
}

function Header({
  C,
  navigation,
  saving,
}: {
  C: Palette;
  navigation: NativeStackNavigationProp<RootStackParamList, 'Settings'>;
  saving: boolean;
}) {
  return (
    <View style={[s.header, { backgroundColor: C.bg, borderBottomColor: C.border }]}>
      <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={HIT} accessibilityRole="button">
        <Ionicons name="arrow-back" size={24} color={C.text} />
      </TouchableOpacity>
      <View style={s.headerCopy}>
        <Text style={[s.headerTitle, { color: C.text }]}>Cài đặt</Text>
        <Text style={[s.headerSub, { color: C.subtext }]}>Mobile settings</Text>
      </View>
      <View style={s.headerStatus}>
        {saving ? (
          <ActivityIndicator size="small" color={C.accent} />
        ) : (
          <Ionicons name="checkmark-circle-outline" size={22} color={C.success} />
        )}
      </View>
    </View>
  );
}

function ProfileCard({
  C,
  initials,
  profile,
  onEdit,
}: {
  C: Palette;
  initials: string;
  profile: UserProfile | null;
  onEdit: () => void;
}) {
  return (
    <View style={[s.profileCard, { backgroundColor: C.surface, borderColor: C.border }]}>
      {profile?.photoURL ? (
        <Image source={{ uri: profile.photoURL }} style={s.avatar} />
      ) : (
        <View style={[s.avatar, { backgroundColor: C.accentSoft }]}>
          <Text style={[s.avatarText, { color: C.accent }]}>{initials || 'S'}</Text>
        </View>
      )}
      <View style={s.profileCopy}>
        <Text style={[s.profileName, { color: C.text }]} numberOfLines={1}>
          {profile?.displayName || 'Người dùng Surf'}
        </Text>
        <Text style={[s.profileEmail, { color: C.subtext }]} numberOfLines={1}>
          {profile?.email || 'Đang đồng bộ hồ sơ'}
        </Text>
      </View>
      <TouchableOpacity
        style={[s.editBtn, { backgroundColor: C.accentSoft }]}
        activeOpacity={0.82}
        onPress={onEdit}
      >
        <Ionicons name="create-outline" size={18} color={C.accent} />
      </TouchableOpacity>
    </View>
  );
}

function QuickCard({
  C,
  icon,
  title,
  desc,
  onPress,
}: {
  C: Palette;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  desc: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[s.quickCard, { backgroundColor: C.surface, borderColor: C.border }]}
      activeOpacity={0.82}
      onPress={onPress}
    >
      <View style={[s.quickIcon, { backgroundColor: C.accentSoft }]}>
        <Ionicons name={icon} size={20} color={C.accent} />
      </View>
      <Text style={[s.quickTitle, { color: C.text }]} numberOfLines={1}>
        {title}
      </Text>
      <Text style={[s.quickDesc, { color: C.subtext }]} numberOfLines={1}>
        {desc}
      </Text>
    </TouchableOpacity>
  );
}

function Section({
  title,
  C,
  children,
  onLayout,
}: {
  title: string;
  C: Palette;
  children: ReactNode;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  return (
    <View style={s.section} onLayout={onLayout}>
      <Text style={[s.sectionTitle, { color: C.subtext }]}>{title}</Text>
      <View style={[s.card, { backgroundColor: C.surface, borderColor: C.border }]}>{children}</View>
    </View>
  );
}

function SettingsRow({
  C,
  icon,
  title,
  desc,
  danger,
  onPress,
}: {
  C: Palette;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  desc?: string;
  danger?: boolean;
  onPress: () => void;
}) {
  const color = danger ? C.danger : C.text;

  return (
    <TouchableOpacity style={s.row} activeOpacity={0.78} onPress={onPress}>
      <IconBubble C={C} icon={icon} danger={danger} />
      <View style={s.rowCopy}>
        <Text style={[s.rowTitle, { color }]}>{title}</Text>
        {desc ? (
          <Text style={[s.rowDesc, { color: C.subtext }]} numberOfLines={2}>
            {desc}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={C.muted} />
    </TouchableOpacity>
  );
}

function SettingsSwitchRow({
  C,
  icon,
  title,
  desc,
  value,
  disabled,
  onValueChange,
}: {
  C: Palette;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  desc?: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={[s.row, disabled && s.disabledRow]}>
      <IconBubble C={C} icon={icon} />
      <View style={s.rowCopy}>
        <Text style={[s.rowTitle, { color: C.text }]}>{title}</Text>
        {desc ? (
          <Text style={[s.rowDesc, { color: C.subtext }]} numberOfLines={2}>
            {desc}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ false: C.border, true: C.accent }}
        thumbColor="#ffffff"
        ios_backgroundColor={C.border}
      />
    </View>
  );
}

function IconBubble({
  C,
  icon,
  danger,
}: {
  C: Palette;
  icon: keyof typeof Ionicons.glyphMap;
  danger?: boolean;
}) {
  return (
    <View style={[s.iconBubble, { backgroundColor: danger ? `${C.danger}14` : C.chip }]}>
      <Ionicons name={icon} size={20} color={danger ? C.danger : C.accent} />
    </View>
  );
}

function ChoiceModal<T extends string>({
  C,
  visible,
  title,
  subtitle,
  value,
  options,
  onClose,
  onSelect,
}: {
  C: Palette;
  visible: boolean;
  title: string;
  subtitle?: string;
  value: T;
  options: Array<{
    value: T;
    label: string;
    desc?: string;
    icon: keyof typeof Ionicons.glyphMap;
  }>;
  onClose: () => void;
  onSelect: (value: T) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.modalOverlay} onPress={onClose}>
        <Pressable style={[s.sheet, { backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={s.sheetHeader}>
            <View style={s.sheetCopy}>
              <Text style={[s.sheetTitle, { color: C.text }]}>{title}</Text>
              {subtitle ? <Text style={[s.sheetSub, { color: C.subtext }]}>{subtitle}</Text> : null}
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={HIT}>
              <Ionicons name="close" size={22} color={C.text} />
            </TouchableOpacity>
          </View>

          {options.map((option) => {
            const active = option.value === value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  s.choiceRow,
                  {
                    borderColor: active ? C.accent : C.border,
                    backgroundColor: active ? C.accentSoft : C.card,
                  },
                ]}
                activeOpacity={0.82}
                onPress={() => onSelect(option.value)}
              >
                <IconBubble C={C} icon={option.icon} />
                <View style={s.rowCopy}>
                  <Text style={[s.rowTitle, { color: C.text }]}>{option.label}</Text>
                  {option.desc ? (
                    <Text style={[s.rowDesc, { color: C.subtext }]} numberOfLines={2}>
                      {option.desc}
                    </Text>
                  ) : null}
                </View>
                {active ? <Ionicons name="checkmark-circle" size={22} color={C.accent} /> : null}
              </TouchableOpacity>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DetailSheet({
  C,
  detail,
  profile,
  loading,
  error,
  blockedUsers,
  blockedQuery,
  reports,
  processingId,
  onClose,
  onRefreshBlocked,
  onRefreshReports,
  onUnblock,
  onBlockedQueryChange,
  onLogout,
  onOpenDefaultAudience,
  onOpenFriendRequests,
  onOpenBlockList,
  onOpenNotifications,
}: {
  C: Palette;
  detail: DetailKey | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  blockedUsers: BlockedUser[];
  blockedQuery: string;
  reports: UserReport[];
  processingId: string | null;
  onClose: () => void;
  onRefreshBlocked: () => void;
  onRefreshReports: () => void;
  onUnblock: (targetUid: string) => void;
  onBlockedQueryChange: (value: string) => void;
  onLogout: () => void;
  onOpenDefaultAudience: () => void;
  onOpenFriendRequests: () => void;
  onOpenBlockList: () => void;
  onOpenNotifications: () => void;
}) {
  if (!detail) return null;

  const map: Record<DetailKey, { title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap }> = {
    'privacy-checkup': {
      title: 'Rà soát quyền riêng tư',
      subtitle: 'Kiểm tra nhanh các quyền riêng tư quan trọng.',
      icon: 'lock-closed-outline',
    },
    'account-security': {
      title: 'Bảo mật tài khoản',
      subtitle: 'Các hành động nhạy cảm sẽ cần xác thực lại trước khi thay đổi.',
      icon: 'shield-checkmark-outline',
    },
    'active-sessions': {
      title: 'Phiên đăng nhập',
      subtitle: 'Quản lý thiết bị đang đăng nhập Surf.',
      icon: 'phone-portrait-outline',
    },
    'block-list': {
      title: 'Danh sách chặn',
      subtitle: 'Chặn người dùng sẽ ẩn tương tác hai chiều trên Surf.',
      icon: 'ban-outline',
    },
    reports: {
      title: 'Báo cáo vi phạm',
      subtitle: 'Gửi báo cáo nhanh, ưu tiên các tình huống an toàn cộng đồng.',
      icon: 'flag-outline',
    },
    policy: {
      title: 'Chính sách cộng đồng',
      subtitle: 'Các tiêu chuẩn quan trọng khi sử dụng Surf.',
      icon: 'document-text-outline',
    },
    'delete-account': {
      title: 'Xóa tài khoản',
      subtitle: 'Cần nhập mật khẩu để xác nhận trước khi xóa.',
      icon: 'trash-outline',
    },
  };

  const info = map[detail];
  const normalizedBlockedQuery = blockedQuery.trim().toLowerCase();
  const visibleBlockedUsers = normalizedBlockedQuery
    ? blockedUsers.filter((user) =>
        user.name.toLowerCase().includes(normalizedBlockedQuery) ||
        (user.email ?? '').toLowerCase().includes(normalizedBlockedQuery)
      )
    : blockedUsers;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.modalOverlay} onPress={onClose}>
        <Pressable style={[s.detailSheet, { backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={s.sheetGrip} />
          <View style={s.detailHeader}>
            <IconBubble C={C} icon={info.icon} danger={detail === 'delete-account'} />
            <View style={s.rowCopy}>
              <Text style={[s.sheetTitle, { color: C.text }]}>{info.title}</Text>
              <Text style={[s.sheetSub, { color: C.subtext }]}>{info.subtitle}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={HIT}>
              <Ionicons name="close" size={22} color={C.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={s.detailContent}
            contentContainerStyle={s.detailContentInner}
            showsVerticalScrollIndicator={false}
          >
          {error ? <InfoPill C={C} tone="danger" text={error} /> : null}

          {detail === 'account-security' ? (
            <AccountSecurityContent C={C} profile={profile} />
          ) : detail === 'active-sessions' ? (
            <>
              <InfoPill C={C} text="Thiết bị hiện tại đang đăng nhập bằng Firebase Auth và socket realtime của Surf." />
              <ActionButton
                C={C}
                icon="log-out-outline"
                title="Đăng xuất khỏi thiết bị này"
                danger
                onPress={onLogout}
              />
            </>
          ) : detail === 'block-list' ? (
            <>
              <TextField
                C={C}
                label="Tìm trong danh sách chặn"
                value={blockedQuery}
                onChangeText={onBlockedQueryChange}
                autoCapitalize="none"
              />
              <ActionButton
                C={C}
                icon="refresh-outline"
                title={loading ? 'Đang tải...' : 'Tải lại danh sách chặn'}
                disabled={loading}
                onPress={onRefreshBlocked}
              />
              {loading ? (
                <InlineLoading C={C} />
              ) : visibleBlockedUsers.length === 0 ? (
                <InfoPill C={C} text={blockedUsers.length === 0 ? 'Bạn chưa chặn người dùng nào.' : 'Không tìm thấy người dùng phù hợp.'} />
              ) : (
                visibleBlockedUsers.map((user) => (
                  <BlockedUserRow
                    key={user.id}
                    C={C}
                    user={user}
                    processing={processingId === user.id}
                    onUnblock={() => onUnblock(user.id)}
                  />
                ))
              )}
            </>
          ) : detail === 'reports' ? (
            <>
              <ActionButton
                C={C}
                icon="refresh-outline"
                title={loading ? 'Đang tải...' : 'Tải lại báo cáo'}
                disabled={loading}
                onPress={onRefreshReports}
              />
              {loading ? (
                <InlineLoading C={C} />
              ) : reports.length === 0 ? (
                <InfoPill C={C} text="Bạn chưa gửi báo cáo vi phạm nào." />
              ) : (
                reports.slice(0, 20).map((report) => (
                  <ReportRow key={report.id} C={C} report={report} />
                ))
              )}
            </>
          ) : detail === 'policy' ? (
            <>
              <InfoPill C={C} text="Tôn trọng người khác, không spam, không quấy rối, không chia sẻ nội dung nguy hiểm hoặc vi phạm bản quyền." />
              <InfoPill C={C} text="Các vi phạm có thể bị hạn chế hiển thị, gỡ nội dung hoặc khóa tài khoản tùy mức độ." />
            </>
          ) : detail === 'privacy-checkup' ? (
            <>
              <InfoPill C={C} text="Kiểm tra nhanh các thiết lập riêng tư đang có trên Surf mobile." />
              <ActionButton C={C} icon="eye-outline" title="Đổi đối tượng xem mặc định" onPress={onOpenDefaultAudience} />
              <ActionButton C={C} icon="person-add-outline" title="Cài đặt lời mời kết bạn" onPress={onOpenFriendRequests} />
              <ActionButton C={C} icon="ban-outline" title="Xem danh sách chặn" onPress={onOpenBlockList} />
              <ActionButton C={C} icon="notifications-outline" title="Cài đặt thông báo" onPress={onOpenNotifications} />
            </>
          ) : detail === 'delete-account' ? (
            <DeleteAccountContent C={C} profile={profile} />
          ) : (
            null
          )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ActionButton({
  C,
  icon,
  title,
  danger,
  disabled,
  onPress,
}: {
  C: Palette;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  danger?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const color = danger ? C.danger : C.accent;
  return (
    <TouchableOpacity
      style={[
        s.actionButton,
        {
          borderColor: danger ? C.danger : C.accent,
          backgroundColor: danger ? `${C.danger}14` : C.accentSoft,
          opacity: disabled ? 0.55 : 1,
        },
      ]}
      activeOpacity={0.82}
      disabled={disabled}
      onPress={onPress}
    >
      <Ionicons name={icon} size={19} color={color} />
      <Text style={[s.actionButtonText, { color }]}>{title}</Text>
    </TouchableOpacity>
  );
}

function AccountSecurityContent({ C, profile }: { C: Palette; profile: UserProfile | null }) {
  const [mode, setMode] = useState<'menu' | 'password' | 'email'>('menu');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [otpPurpose, setOtpPurpose] = useState<'change-password' | 'change-email' | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const maskedEmail = profile?.email ? maskEmail(profile.email) : null;

  const resetFlow = () => {
    setMode('menu');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setNewEmail('');
    setPendingEmail('');
    setOtp('');
    setOtpPurpose(null);
    setError(null);
  };

  const startPasswordOtp = async () => {
    setError(null);
    setMessage(null);

    if (newPassword.length < 6) {
      setError('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }

    try {
      setLoading(true);
      await reauthenticate(currentPassword);
      await api.post('/api/auth/send-otp', {
        purpose: 'change-password',
        newPassword,
      });
      setOtp('');
      setOtpPurpose('change-password');
      setMessage('Mã xác nhận đã được gửi về email hiện tại.');
    } catch (err: any) {
      const code = err?.code as string | undefined;
      setError(
        code === 'auth/wrong-password' || code === 'auth/invalid-credential'
          ? 'Mật khẩu hiện tại không đúng.'
          : err instanceof Error
            ? err.message
            : 'Không gửi được mã xác nhận.'
      );
    } finally {
      setLoading(false);
    }
  };

  const startEmailOtp = async () => {
    setError(null);
    setMessage(null);
    const email = newEmail.trim().toLowerCase();

    if (!email.includes('@')) {
      setError('Email mới không hợp lệ.');
      return;
    }
    if (email === profile?.email?.toLowerCase()) {
      setError('Email mới phải khác email hiện tại.');
      return;
    }

    try {
      setLoading(true);
      await api.post('/api/auth/send-otp', {
        purpose: 'change-email',
        newEmail: email,
      });
      setPendingEmail(email);
      setOtp('');
      setOtpPurpose('change-email');
      setMessage('Mã xác nhận đã được gửi về email hiện tại.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không gửi được mã xác nhận.');
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!otpPurpose) return;
    if (otp.trim().length < 6) {
      setError('Vui lòng nhập đủ 6 chữ số.');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await api.post('/api/auth/verify-otp', {
        purpose: otpPurpose,
        code: otp.trim(),
      });
      if (otpPurpose === 'change-email') {
        await auth.currentUser?.reload();
        setMessage(`Email đã được cập nhật thành ${maskEmail(pendingEmail)}.`);
      } else {
        setMessage('Đổi mật khẩu thành công.');
      }
      resetFlow();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mã không đúng hoặc đã hết hạn.');
    } finally {
      setLoading(false);
    }
  };

  const resendOtp = async () => {
    if (!otpPurpose) return;
    try {
      setLoading(true);
      setError(null);
      if (otpPurpose === 'change-password') {
        await api.post('/api/auth/send-otp', {
          purpose: 'change-password',
          newPassword,
        });
      } else {
        await api.post('/api/auth/send-otp', {
          purpose: 'change-email',
          newEmail: pendingEmail,
        });
      }
      setOtp('');
      setMessage('Đã gửi lại mã xác nhận.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gửi lại mã thất bại.');
    } finally {
      setLoading(false);
    }
  };

  if (mode === 'password') {
    return (
      <>
        <TextField C={C} label="Mật khẩu hiện tại" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry />
        <TextField C={C} label="Mật khẩu mới" value={newPassword} onChangeText={setNewPassword} secureTextEntry />
        <TextField C={C} label="Xác nhận mật khẩu mới" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
        {otpPurpose === 'change-password' ? (
          <TextField C={C} label="Mã xác nhận 6 số" value={otp} onChangeText={setOtp} keyboardType="number-pad" maxLength={6} />
        ) : null}
        {error ? <InfoPill C={C} tone="danger" text={error} /> : null}
        {message ? <InfoPill C={C} text={message} /> : null}
        <ActionButton
          C={C}
          icon={otpPurpose === 'change-password' ? 'checkmark-circle-outline' : 'mail-outline'}
          title={loading ? 'Đang xử lý...' : otpPurpose === 'change-password' ? 'Xác nhận mã' : 'Gửi mã xác nhận'}
          disabled={loading}
          onPress={otpPurpose === 'change-password' ? verifyOtp : startPasswordOtp}
        />
        {otpPurpose === 'change-password' ? (
          <ActionButton C={C} icon="refresh-outline" title="Gửi lại mã" disabled={loading} onPress={resendOtp} />
        ) : null}
        <ActionButton C={C} icon="arrow-back-outline" title="Quay lại" disabled={loading} onPress={resetFlow} />
      </>
    );
  }

  if (mode === 'email') {
    return (
      <>
        <InfoPill C={C} text={`Email hiện tại: ${maskedEmail || 'Chưa có email'}`} />
        <TextField C={C} label="Email mới" value={newEmail} onChangeText={setNewEmail} keyboardType="email-address" autoCapitalize="none" />
        {otpPurpose === 'change-email' ? (
          <TextField C={C} label="Mã xác nhận 6 số" value={otp} onChangeText={setOtp} keyboardType="number-pad" maxLength={6} />
        ) : null}
        {error ? <InfoPill C={C} tone="danger" text={error} /> : null}
        {message ? <InfoPill C={C} text={message} /> : null}
        <ActionButton
          C={C}
          icon={otpPurpose === 'change-email' ? 'checkmark-circle-outline' : 'mail-outline'}
          title={loading ? 'Đang xử lý...' : otpPurpose === 'change-email' ? 'Xác nhận mã' : 'Gửi mã xác nhận'}
          disabled={loading || !profile?.email}
          onPress={otpPurpose === 'change-email' ? verifyOtp : startEmailOtp}
        />
        {otpPurpose === 'change-email' ? (
          <ActionButton C={C} icon="refresh-outline" title="Gửi lại mã" disabled={loading} onPress={resendOtp} />
        ) : null}
        <ActionButton C={C} icon="arrow-back-outline" title="Quay lại" disabled={loading} onPress={resetFlow} />
      </>
    );
  }

  return (
    <>
      <InfoPill C={C} text={`Tài khoản đang đăng nhập: ${maskedEmail || 'Chưa có email'}`} />
      {message ? <InfoPill C={C} text={message} /> : null}
      <ActionButton C={C} icon="lock-closed-outline" title="Đổi mật khẩu" onPress={() => setMode('password')} />
      <ActionButton C={C} icon="mail-outline" title="Đổi email" disabled={!profile?.email} onPress={() => setMode('email')} />
    </>
  );
}

function DeleteAccountContent({ C, profile }: { C: Palette; profile: UserProfile | null }) {
  const resetAuth = useAuthStore((state) => state.resetAuth);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = () => {
    Alert.alert('Xóa tài khoản', 'Hành động này không thể hoàn tác.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa tài khoản',
        style: 'destructive',
        onPress: async () => {
          try {
            setLoading(true);
            setError(null);
            await reauthenticate(password);
            await api.delete('/api/auth/account');
            await resetAuth();
          } catch (err: any) {
            const code = err?.code as string | undefined;
            setError(
              code === 'auth/wrong-password' || code === 'auth/invalid-credential'
                ? 'Mật khẩu không đúng.'
                : 'Xóa tài khoản thất bại. Vui lòng thử lại.'
            );
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  return (
    <>
      <InfoPill
        C={C}
        tone="danger"
        text={`Tài khoản ${profile?.email ? maskEmail(profile.email) : ''} sẽ bị xóa vĩnh viễn khỏi Surf.`}
      />
      <TextField C={C} label="Nhập mật khẩu để xác nhận" value={password} onChangeText={setPassword} secureTextEntry />
      {error ? <InfoPill C={C} tone="danger" text={error} /> : null}
      <ActionButton
        C={C}
        icon="trash-outline"
        title={loading ? 'Đang xóa...' : 'Xóa tài khoản vĩnh viễn'}
        danger
        disabled={loading || password.length === 0}
        onPress={handleDelete}
      />
    </>
  );
}

function TextField({
  C,
  label,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  maxLength,
}: {
  C: Palette;
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'number-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  maxLength?: number;
}) {
  return (
    <View style={s.fieldWrap}>
      <Text style={[s.fieldLabel, { color: C.subtext }]}>{label}</Text>
      <TextInput
        style={[s.textInput, { color: C.text, borderColor: C.border, backgroundColor: C.card }]}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        maxLength={maxLength}
        placeholderTextColor={C.muted}
      />
    </View>
  );
}

function InlineLoading({ C }: { C: Palette }) {
  return (
    <View style={[s.inlineLoading, { borderColor: C.border, backgroundColor: C.card }]}>
      <ActivityIndicator size="small" color={C.accent} />
      <Text style={[s.infoText, { color: C.subtext }]}>Đang tải dữ liệu...</Text>
    </View>
  );
}

function BlockedUserRow({
  C,
  user,
  processing,
  onUnblock,
}: {
  C: Palette;
  user: BlockedUser;
  processing: boolean;
  onUnblock: () => void;
}) {
  return (
    <View style={[s.listRow, { borderColor: C.border, backgroundColor: C.card }]}>
      {user.avatarUrl ? (
        <Image source={{ uri: user.avatarUrl }} style={s.smallAvatar} />
      ) : (
        <View style={[s.smallAvatar, { backgroundColor: C.chip }]}>
          <Ionicons name="person" size={18} color={C.subtext} />
        </View>
      )}
      <View style={s.rowCopy}>
        <Text style={[s.rowTitle, { color: C.text }]} numberOfLines={1}>
          {user.name || 'Người dùng Surf'}
        </Text>
        {user.email ? (
          <Text style={[s.rowDesc, { color: C.subtext }]} numberOfLines={1}>
            {user.email}
          </Text>
        ) : null}
      </View>
      <TouchableOpacity
        style={[s.smallAction, { borderColor: C.accent }]}
        activeOpacity={0.82}
        disabled={processing}
        onPress={onUnblock}
      >
        {processing ? (
          <ActivityIndicator size="small" color={C.accent} />
        ) : (
          <Text style={[s.smallActionText, { color: C.accent }]}>Bỏ chặn</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

function ReportRow({ C, report }: { C: Palette; report: UserReport }) {
  const created = report.createdAt ? new Date(report.createdAt) : null;
  const dateText = created && !Number.isNaN(created.getTime())
    ? created.toLocaleDateString('vi-VN')
    : 'Không rõ ngày';

  return (
    <View style={[s.reportRow, { borderColor: C.border, backgroundColor: C.card }]}>
      <View style={s.reportTop}>
        <Text style={[s.rowTitle, { color: C.text }]} numberOfLines={1}>
          {report.reason || report.type || 'Báo cáo vi phạm'}
        </Text>
        <Text style={[s.reportStatus, { color: report.resolvedAt ? C.success : C.warning }]}>
          {report.resolvedAt ? 'Đã xử lý' : report.status || 'Đang xem xét'}
        </Text>
      </View>
      <Text style={[s.rowDesc, { color: C.subtext }]} numberOfLines={2}>
        {report.commentId ? `Bình luận: ${report.commentId}` : report.postId ? `Bài viết: ${report.postId}` : `Mã báo cáo: ${report.id}`}
      </Text>
      {report.aiReason ? (
        <Text style={[s.rowDesc, { color: C.subtext }]} numberOfLines={3}>
          Phản hồi: {report.aiReason}
        </Text>
      ) : null}
      <Text style={[s.rowDesc, { color: C.muted }]}>{dateText}</Text>
    </View>
  );
}

function InfoPill({
  C,
  text,
  tone,
}: {
  C: Palette;
  text: string;
  tone?: 'default' | 'danger';
}) {
  const isDanger = tone === 'danger';
  return (
    <View style={[s.infoPill, { backgroundColor: C.card, borderColor: isDanger ? C.danger : C.border }]}>
      <Ionicons
        name={isDanger ? 'warning-outline' : 'information-circle-outline'}
        size={18}
        color={isDanger ? C.danger : C.accent}
      />
      <Text style={[s.infoText, { color: isDanger ? C.danger : C.subtext }]}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 12,
  },
  headerCopy: { flex: 1 },
  headerTitle: { fontSize: 20, fontWeight: '800', letterSpacing: 0 },
  headerSub: { marginTop: 1, fontSize: 12, fontWeight: '600' },
  headerStatus: { width: 28, alignItems: 'flex-end' },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, fontWeight: '600' },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    gap: 12,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarText: { fontSize: 18, fontWeight: '900' },
  profileCopy: { flex: 1, minWidth: 0 },
  profileName: { fontSize: 17, fontWeight: '800', letterSpacing: 0 },
  profileEmail: { marginTop: 3, fontSize: 13, fontWeight: '500' },
  editBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickWrap: { flexDirection: 'row', gap: 10 },
  quickCard: {
    flex: 1,
    minHeight: 106,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  quickIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  quickTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 0 },
  quickDesc: { marginTop: 3, fontSize: 12, fontWeight: '600' },
  section: { gap: 8 },
  sectionTitle: {
    paddingHorizontal: 2,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  card: { borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  row: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  disabledRow: { opacity: 0.65 },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: '800', letterSpacing: 0 },
  rowDesc: { marginTop: 3, fontSize: 12, lineHeight: 17, fontWeight: '500' },
  iconBubble: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutBtn: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  logoutText: { fontSize: 15, fontWeight: '800' },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    margin: 12,
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    gap: 10,
  },
  detailSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    maxHeight: '88%',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    gap: 12,
  },
  detailContent: { flexGrow: 0 },
  detailContentInner: { gap: 12, paddingBottom: 4 },
  sheetGrip: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(148,163,184,0.45)',
    marginBottom: 6,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 4,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 4,
  },
  sheetCopy: { flex: 1 },
  sheetTitle: { fontSize: 18, fontWeight: '900', letterSpacing: 0 },
  sheetSub: { marginTop: 4, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  infoPill: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  actionButton: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  actionButtonText: { fontSize: 14, fontWeight: '900' },
  fieldWrap: { gap: 7 },
  fieldLabel: { fontSize: 12, fontWeight: '800' },
  textInput: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: '600',
  },
  inlineLoading: {
    minHeight: 54,
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
  },
  listRow: {
    minHeight: 66,
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
  },
  smallAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  smallAction: {
    minWidth: 76,
    minHeight: 34,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  smallActionText: { fontSize: 12, fontWeight: '900' },
  reportRow: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    gap: 4,
  },
  reportTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  reportStatus: { fontSize: 11, fontWeight: '900' },
  dangerAction: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dangerActionText: { fontSize: 14, fontWeight: '900' },
});
