import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getPresenceStatusText } from '@/lib/utils/presenceStatusText';
import { usePresenceStore } from '@/stores/presenceStore';
import { useAuthStore } from '@/stores/authStore';

type PresenceBadgeSize = 'sm' | 'md' | 'lg';
type PresenceBadgeVariant = 'dot' | 'label' | 'text';

type PresenceBadgeProps = {
  uid?: string | null;
  size?: PresenceBadgeSize;
  variant?: PresenceBadgeVariant;
  showOfflineLabel?: boolean;
  fallbackLastSeenTs?: number | null;
  style?: any;
};

const DOT_SIZES = {
  sm: 10,
  md: 12,
  lg: 16,
};

export default function PresenceBadge({
  uid,
  size = 'md',
  variant = 'dot',
  showOfflineLabel = false,
  fallbackLastSeenTs,
  style,
}: PresenceBadgeProps) {
  const showLabel = variant === 'label' || variant === 'text' || showOfflineLabel;
  const currentUser = useAuthStore((state) => state.user);
  const isSelf = currentUser?.uid === uid;
  
  const isOnline = usePresenceStore((state) => (uid ? state.onlineUsers.has(uid) : false));
  const canViewStatus = usePresenceStore((state) => (uid ? state.visibleUsers.has(uid) : false));
  const lastSeenTs = usePresenceStore((state) =>
    uid && showLabel ? state.lastSeen.get(uid) : undefined
  );
  
  const [nowMs, setNowMs] = useState(() => Date.now());
  const normalizedFallbackLastSeenTs =
    typeof fallbackLastSeenTs === 'number' && Number.isFinite(fallbackLastSeenTs)
      ? fallbackLastSeenTs
      : undefined;
  const effectiveLastSeenTs =
    typeof lastSeenTs === 'number' && Number.isFinite(lastSeenTs)
      ? lastSeenTs
      : normalizedFallbackLastSeenTs;

  useEffect(() => {
    if (!uid || !showLabel) return;

    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 15_000);

    return () => {
      clearInterval(interval);
    };
  }, [uid, showLabel]);

  const statusText = useMemo(() => {
    if (!showLabel) return null;
    return getPresenceStatusText(isOnline, effectiveLastSeenTs, nowMs);
  }, [effectiveLastSeenTs, isOnline, nowMs, showLabel]);

  if (!uid) return null;
  
  // Only show badge if it's the current user, or if we have permission to view their status (they are a friend)
  if (!isSelf && !canViewStatus) return null;

  if (variant === 'text') {
    return <Text style={style}>{isOnline ? 'Đang hoạt động' : (statusText ?? 'Hoạt động mới đây')}</Text>;
  }

  if (!showLabel) {
    const dotSize = DOT_SIZES[size];
    return (
      <View
        style={[
          styles.dot,
          {
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: isOnline ? '#10b981' : '#94a3b8',
          },
          style,
        ]}
      />
    );
  }

  if (isOnline) {
    return (
      <View style={[styles.labelContainer, styles.labelOnline, style]}>
        <View style={[styles.labelDot, { backgroundColor: '#10b981' }]} />
        <Text style={styles.labelTextOnline}>Đang hoạt động</Text>
      </View>
    );
  }

  return (
    <View style={[styles.labelContainer, styles.labelOffline, style]}>
      <View style={[styles.labelDot, { backgroundColor: '#94a3b8' }]} />
      <Text style={styles.labelTextOffline}>{statusText ?? 'Hoạt động mới đây'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    borderWidth: 2,
    borderColor: '#ffffff', // defaults to white, can be overridden by style array
    position: 'absolute',
    bottom: 0,
    right: 0,
  },
  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  labelOnline: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  labelOffline: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
  },
  labelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  labelTextOnline: {
    fontSize: 11,
    fontWeight: '500',
    color: '#047857',
  },
  labelTextOffline: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748b',
  },
});
