import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TouchableWithoutFeedback, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';

const MESSAGE_REACTION_OPTIONS = ['👍', '❤️', '😂', '😮', '😢', '😡'];

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
  themeColors: any;
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
  themeColors: C,
}: Props) {
  const user = useAuthStore((state) => state.user);

  if (!visible || !message) return null;

  const isOwn = message.senderId === user?.uid;
  const isPinned = message.pinnedBy?.includes(user?.uid ?? '');

  const handleDelete = () => {
    if (isOwn) {
      Alert.alert('Xóa tin nhắn', 'Bạn muốn thu hồi tin nhắn này với mọi người hay chỉ xóa ở phía bạn?', [
        { text: 'Thu hồi với mọi người', style: 'destructive', onPress: () => { onClose(); onDeleteForEveryone(message); } },
        { text: 'Xóa ở phía bạn', onPress: () => { onClose(); onDeleteForMe(message); } },
        { text: 'Hủy', style: 'cancel' }
      ]);
    } else {
      Alert.alert('Xóa tin nhắn', 'Tin nhắn này sẽ chỉ bị xóa ở phía bạn.', [
        { text: 'Xóa ở phía bạn', style: 'destructive', onPress: () => { onClose(); onDeleteForMe(message); } },
        { text: 'Hủy', style: 'cancel' }
      ]);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={s.overlay}>
          <TouchableWithoutFeedback>
            <View style={s.contentContainer}>
              
              {/* Emoji Bar */}
              <View style={[s.emojiBar, { backgroundColor: C.card }]}>
                {MESSAGE_REACTION_OPTIONS.map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={s.emojiBtn}
                    onPress={() => {
                      onReaction(message, emoji);
                      onClose();
                    }}
                  >
                    <Text style={s.emojiText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Bottom Sheet Menu */}
              <View style={[s.menu, { backgroundColor: C.card }]}>
                <TouchableOpacity style={[s.menuItem, { borderBottomColor: C.border }]} onPress={() => { onClose(); onReply(message); }}>
                  <Text style={[s.menuText, { color: C.text }]}>Trả lời</Text>
                  <Ionicons name="arrow-undo" size={20} color={C.text} />
                </TouchableOpacity>

                <TouchableOpacity style={[s.menuItem, { borderBottomColor: C.border }]} onPress={() => { onClose(); onCopy(message); }}>
                  <Text style={[s.menuText, { color: C.text }]}>Sao chép</Text>
                  <Ionicons name="copy" size={20} color={C.text} />
                </TouchableOpacity>

                <TouchableOpacity style={[s.menuItem, { borderBottomColor: C.border }]} onPress={() => { onClose(); onPin(message); }}>
                  <Text style={[s.menuText, { color: C.text }]}>{isPinned ? 'Bỏ ghim' : 'Ghim'}</Text>
                  <Ionicons name="pricetag" size={20} color={C.text} />
                </TouchableOpacity>

                <TouchableOpacity style={s.menuItem} onPress={handleDelete}>
                  <Text style={[s.menuText, { color: '#ef4444' }]}>Xóa</Text>
                  <Ionicons name="trash" size={20} color="#ef4444" />
                </TouchableOpacity>
              </View>

            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
  },
  emojiBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 30,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  emojiBtn: {
    padding: 4,
  },
  emojiText: {
    fontSize: 28,
  },
  menu: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuText: {
    fontSize: 16,
    fontWeight: '500',
  },
});
