import React from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';

const MESSAGE_REACTION_OPTIONS = ['👍', '❤️', '😂', '😮', '😢', '😡'];

type ThemeColors = {
  card: string;
  border: string;
  text: string;
  subtext: string;
  accent: string;
};

type Props = {
  visible: boolean;
  message: any | null;
  onClose: () => void;
  onReply: (msg: any) => void;
  onReaction: (msg: any, emoji: string) => void;
  onPin: (msg: any) => void;
  onDeleteForMe: (msg: any) => void;
  onDeleteForEveryone: (msg: any) => void;
  onCopy: (msg: any) => void;
  onReport: (msg: any) => void;
  themeColors: ThemeColors;
};

export default function MessageActionModal({
  visible,
  message,
  onClose,
  onReply,
  onReaction,
  onPin,
  onDeleteForMe,
  onDeleteForEveryone,
  onCopy,
  onReport,
  themeColors: C,
}: Props) {
  const user = useAuthStore((state) => state.user);

  if (!visible || !message) return null;

  const isOwn = message.senderId === user?.uid;
  const isPinned = message.pinnedBy?.includes(user?.uid ?? '') ?? false;
  const isCallLog = message.type === 'call_log';
  const canCopy = Boolean(message.text?.trim());

  const confirmRecall = () => {
    Alert.alert('Thu hoi tin nhan', 'Tin nhan nay se bi thu hoi voi moi nguoi.', [
      { text: 'Thu hoi', style: 'destructive', onPress: () => { onClose(); onDeleteForEveryone(message); } },
      { text: 'Huy', style: 'cancel' },
    ]);
  };

  const confirmDeleteForMe = () => {
    Alert.alert('Xoa phia toi', 'Tin nhan nay chi bi xoa o phia ban.', [
      { text: 'Xoa', style: 'destructive', onPress: () => { onClose(); onDeleteForMe(message); } },
      { text: 'Huy', style: 'cancel' },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={s.content} pointerEvents="box-none">
          {!isCallLog && (
            <View style={[s.emojiBar, { backgroundColor: C.card, borderColor: C.border }]}>
              {MESSAGE_REACTION_OPTIONS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={s.emojiBtn}
                  activeOpacity={0.75}
                  onPress={() => {
                    onReaction(message, emoji);
                    onClose();
                  }}
                >
                  <Text style={s.emojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={[s.sheet, { backgroundColor: C.card, borderColor: C.border }]}>
            {!isCallLog && (
              <ActionButton
                icon="return-up-back-outline"
                label="Tra loi"
                color={C.accent}
                onPress={() => { onClose(); onReply(message); }}
              />
            )}
            <ActionButton
              icon="copy-outline"
              label="Sao chep"
              color={canCopy ? C.accent : C.subtext}
              disabled={!canCopy}
              onPress={() => { onClose(); onCopy(message); }}
            />
            <ActionButton
              icon={isPinned ? 'pricetag' : 'pricetag-outline'}
              label={isPinned ? 'Bo ghim' : 'Ghim'}
              color={C.accent}
              onPress={() => { onClose(); onPin(message); }}
            />
            {isOwn && !isCallLog && (
              <ActionButton
                icon="return-down-back-outline"
                label="Thu hoi"
                color="#ef4444"
                onPress={confirmRecall}
              />
            )}
            {!isOwn && !isCallLog && (
              <ActionButton
                icon="flag-outline"
                label="Bao cao"
                color="#ef4444"
                onPress={() => { onClose(); onReport(message); }}
              />
            )}
            <ActionButton
              icon="trash-outline"
              label="Xoa phia toi"
              color="#ef4444"
              onPress={confirmDeleteForMe}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ActionButton({
  icon,
  label,
  color,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[s.actionBtn, disabled && s.actionDisabled]}
      activeOpacity={0.72}
      disabled={disabled}
      onPress={onPress}
    >
      <Ionicons name={icon} size={29} color={color} />
      <Text style={[s.actionLabel, { color }]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.24)',
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 14,
  },
  emojiBar: {
    alignSelf: 'center',
    maxWidth: '100%',
    minHeight: 64,
    borderRadius: 32,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  emojiBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: {
    fontSize: 28,
  },
  sheet: {
    minHeight: 116,
    borderRadius: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginHorizontal: -16,
    marginBottom: -20,
    paddingTop: 18,
    paddingBottom: 28,
    paddingHorizontal: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  actionBtn: {
    width: 76,
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionDisabled: {
    opacity: 0.42,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});
