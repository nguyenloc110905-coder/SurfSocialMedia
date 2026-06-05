import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api, apiBaseUrl } from '@/lib/api';

type AIMessage = {
  role: 'user' | 'model';
  text: string;
};

const WELCOME_MESSAGE: AIMessage = {
  role: 'model',
  text: 'Chào bạn! Mình là Surf AI. Mình có thể giúp bạn viết caption, gợi ý ý tưởng bài đăng, tóm tắt nội dung hoặc trả lời câu hỏi nhanh.',
};

const QUICK_PROMPTS = [
  'Gợi ý caption cho bài đăng mới',
  'Viết bio ngắn gọn cho profile',
  'Gợi ý ý tưởng quay clip hôm nay',
];

function historyForRequest(messages: AIMessage[]) {
  const history = messages.filter((message) => message.text !== WELCOME_MESSAGE.text);
  while (history[0]?.role === 'model') {
    history.shift();
  }
  return history;
}

export default function AIScreen({ navigation }: any) {
  const isDark = useColorScheme() !== 'light';
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<AIMessage>>(null);
  const inputRef = useRef<TextInput>(null);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const C = useMemo(() => ({
    bg: isDark ? '#07111f' : '#f8fafc',
    panel: isDark ? '#0f172a' : '#ffffff',
    panelSoft: isDark ? '#111c2f' : '#eef6fb',
    border: isDark ? '#223047' : '#dbe7f0',
    text: isDark ? '#e5edf6' : '#102033',
    subtext: isDark ? '#8ea0b8' : '#62748b',
    userBubble: '#0ea5e9',
    aiBubble: isDark ? '#172238' : '#ffffff',
    input: isDark ? '#111c2f' : '#ffffff',
    accent: '#0ea5e9',
    accent2: '#ec4899',
    danger: '#ef4444',
  }), [isDark]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  useEffect(() => {
    let active = true;
    setLoadingHistory(true);
    api.get<{ messages: AIMessage[] }>('/api/ai-chat/history')
      .then((data) => {
        if (!active) return;
        const history = Array.isArray(data.messages)
          ? data.messages.filter((item) => item && typeof item.text === 'string')
          : [];
        setMessages(history.length ? history : [WELCOME_MESSAGE]);
      })
      .catch((err) => {
        if (!active) return;
        setMessages([WELCOME_MESSAGE]);
        setError(err instanceof Error ? err.message : 'Không thể tải lịch sử Surf AI.');
      })
      .finally(() => {
        if (!active) return;
        setLoadingHistory(false);
        setTimeout(() => inputRef.current?.focus(), 120);
      });

    return () => { active = false; };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  const send = useCallback(async (preset?: string) => {
    const text = (preset ?? draft).trim();
    if (!text || sending) return;

    const history = historyForRequest(messages);
    setDraft('');
    setError(null);
    setSending(true);
    setMessages((prev) => [...prev, { role: 'user', text }]);

    try {
      const response = await api.post<{ text: string }>('/api/ai-chat', {
        message: text,
        history,
      });
      setMessages((prev) => [...prev, { role: 'model', text: response.text || 'Mình chưa có câu trả lời phù hợp lúc này.' }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Surf AI đang bận. Vui lòng thử lại sau.';
      setError(message);
      setMessages((prev) => [
        ...prev,
        { role: 'model', text: 'Xin lỗi, mình chưa thể trả lời lúc này. Bạn thử lại sau một chút nhé.' },
      ]);
    } finally {
      setSending(false);
    }
  }, [draft, messages, sending]);

  const clearHistory = useCallback(() => {
    if (sending) return;
    Alert.alert('Xóa lịch sử Surf AI', 'Cuộc trò chuyện hiện tại sẽ được xóa khỏi tài khoản của bạn.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          setError(null);
          setMessages([WELCOME_MESSAGE]);
          try {
            await api.delete('/api/ai-chat/history');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Không thể xóa lịch sử Surf AI.');
          }
        },
      },
    ]);
  }, [sending]);

  const renderMessage = ({ item }: { item: AIMessage }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.messageRow, isUser ? styles.userRow : styles.aiRow]}>
        {!isUser && (
          <View style={[styles.avatar, { backgroundColor: C.panelSoft, borderColor: C.border }]}>
            <Ionicons name="sparkles" size={15} color={C.accent2} />
          </View>
        )}
        <View
          style={[
            styles.bubble,
            {
              backgroundColor: isUser ? C.userBubble : C.aiBubble,
              borderColor: isUser ? 'transparent' : C.border,
            },
            isUser ? styles.userBubble : styles.aiBubble,
          ]}
        >
          <Text style={[styles.bubbleText, { color: isUser ? '#fff' : C.text }]}>{item.text}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: C.bg }]} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={[styles.header, { backgroundColor: C.panel, borderBottomColor: C.border }]}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={C.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <View style={[styles.headerMark, { backgroundColor: C.panelSoft }]}>
              <Ionicons name="flash" size={16} color={C.accent} />
            </View>
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: C.text }]}>Surf AI</Text>
              <Text style={[styles.subtitle, { color: C.subtext }]}>Trợ lý thông minh</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.iconBtn} onPress={clearHistory}>
            <Ionicons name="trash-outline" size={21} color={C.subtext} />
          </TouchableOpacity>
        </View>

        {loadingHistory ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={C.accent} size="large" />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(_, index) => String(index)}
            renderItem={renderMessage}
            contentContainerStyle={styles.messages}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={scrollToBottom}
            showsVerticalScrollIndicator={false}
            ListFooterComponent={sending ? (
              <View style={[styles.messageRow, styles.aiRow]}>
                <View style={[styles.avatar, { backgroundColor: C.panelSoft, borderColor: C.border }]}>
                  <Ionicons name="sparkles" size={15} color={C.accent2} />
                </View>
                <View style={[styles.typingBubble, { backgroundColor: C.aiBubble, borderColor: C.border }]}>
                  <ActivityIndicator color={C.accent} size="small" />
                  <Text style={[styles.typingText, { color: C.subtext }]}>Surf AI đang trả lời...</Text>
                </View>
              </View>
            ) : null}
          />
        )}

        {!loadingHistory && messages.length <= 1 && (
          <View style={styles.quickRow}>
            {QUICK_PROMPTS.map((prompt) => (
              <Pressable
                key={prompt}
                style={[styles.quickChip, { backgroundColor: C.panel, borderColor: C.border }]}
                onPress={() => send(prompt)}
              >
                <Text style={[styles.quickText, { color: C.text }]} numberOfLines={2}>{prompt}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {error ? (
          <View style={[styles.errorBar, { backgroundColor: isDark ? '#30131a' : '#fff1f2', borderColor: isDark ? '#7f1d1d' : '#fecdd3' }]}>
            <Ionicons name="warning-outline" size={16} color={C.danger} />
            <Text style={[styles.errorText, { color: C.danger }]} numberOfLines={3}>
              {error}
              {'\n'}
              API: {apiBaseUrl}
            </Text>
          </View>
        ) : null}

        <View style={[styles.inputBar, { backgroundColor: C.panel, borderTopColor: C.border, paddingBottom: Math.max(insets.bottom, 10) }]}>
          <View style={[styles.inputWrap, { backgroundColor: C.input, borderColor: C.border }]}>
            <TextInput
              ref={inputRef}
              value={draft}
              onChangeText={setDraft}
              placeholder="Hỏi Surf AI..."
              placeholderTextColor={C.subtext}
              style={[styles.input, { color: C.text }]}
              multiline
              maxLength={2000}
              editable={!sending}
            />
            <TouchableOpacity
              style={[styles.sendBtn, { backgroundColor: draft.trim() && !sending ? C.accent : C.panelSoft }]}
              onPress={() => send()}
              disabled={!draft.trim() || sending}
            >
              <Ionicons name="send" size={18} color={draft.trim() && !sending ? '#fff' : C.subtext} />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    minHeight: 62,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  iconBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerMark: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1 },
  title: { fontSize: 18, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  messages: { paddingHorizontal: 14, paddingTop: 16, paddingBottom: 18 },
  messageRow: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end' },
  userRow: { justifyContent: 'flex-end' },
  aiRow: { justifyContent: 'flex-start' },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  bubble: {
    maxWidth: '82%',
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  userBubble: { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomLeftRadius: 18, borderBottomRightRadius: 5 },
  aiBubble: { borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomLeftRadius: 5, borderBottomRightRadius: 18 },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  typingBubble: {
    borderWidth: 1,
    borderRadius: 18,
    borderBottomLeftRadius: 5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typingText: { fontSize: 13, fontWeight: '600' },
  quickRow: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    flexDirection: 'row',
    gap: 8,
  },
  quickChip: {
    flex: 1,
    minHeight: 52,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  quickText: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  errorBar: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorText: { flex: 1, fontSize: 12, fontWeight: '600' },
  inputBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    paddingHorizontal: 12,
  },
  inputWrap: {
    minHeight: 46,
    maxHeight: 118,
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
  },
  input: {
    flex: 1,
    minHeight: 34,
    maxHeight: 94,
    fontSize: 15,
    lineHeight: 20,
    paddingTop: 7,
    paddingBottom: 7,
    paddingRight: 8,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
