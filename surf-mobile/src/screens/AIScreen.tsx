import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useT } from '@/lib/i18n';

export default function AIScreen({ navigation }: any) {
  const t = useT();
  const isDark = useColorScheme() !== 'light';
  const bg = isDark ? '#0a0a0a' : '#fff';
  const text = isDark ? '#f0f0f0' : '#111';
  const subtext = isDark ? '#666' : '#999';
  const accent = '#0ea5e9'; // surf.primary
  const borderColor = isDark ? '#2a2a2a' : '#e0e0e0';

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: bg }]}>
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: accent }]}>Surf AI</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.center}>
        <Ionicons name="sparkles-outline" size={64} color={accent} />
        <Text style={[styles.heading, { color: text }]}>{t('ai_coming_soon')}</Text>
        <Text style={[styles.sub, { color: subtext }]}>
          {t('ai_subtitle')}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title: { fontSize: 18, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 22, fontWeight: '700', marginTop: 16 },
  sub: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 20,
  },
});
