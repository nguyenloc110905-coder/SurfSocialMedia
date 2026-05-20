import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { type UserProfile } from '@/stores/userStore';

interface ProfileCompletionProps {
  profile: UserProfile | null;
}

export default function ProfileCompletion({ profile }: ProfileCompletionProps) {
  const [dismissed, setDismissed] = useState(false);

  const { percent, missingFields } = useMemo(() => {
    if (!profile) return { percent: 0, missingFields: [] };

    const checks = [
      { id: 'avatar', label: 'Ảnh đại diện', isCompleted: !!profile.photoURL },
      { id: 'cover', label: 'Ảnh bìa', isCompleted: !!profile.coverImageUrl },
      { id: 'bio', label: 'Tiểu sử', isCompleted: !!profile.bio },
      { id: 'location', label: 'Nơi sống/Quê', isCompleted: !!(profile.currentCity || profile.hometown) },
      { id: 'work_edu', label: 'Công việc/Học vấn', isCompleted: !!((profile.work && profile.work.length > 0) || (profile.education && profile.education.length > 0)) },
    ];

    const completed = checks.filter(c => c.isCompleted).length;
    const percent = Math.round((completed / checks.length) * 100);
    const missingFields = checks.filter(c => !c.isCompleted);

    return { percent, missingFields };
  }, [profile]);

  if (!profile || percent === 100 || dismissed) {
    return null;
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={styles.closeBtn} 
        onPress={() => setDismissed(true)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="close" size={20} color="#94a3b8" />
      </TouchableOpacity>
      
      <Text style={styles.title}>Hoàn thiện hồ sơ</Text>
      <Text style={styles.subtitle}>Giúp mọi người hiểu rõ hơn về bạn.</Text>

      <View style={styles.progressContainer}>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${percent}%` }]} />
        </View>
        <Text style={styles.percentText}>{percent}%</Text>
      </View>

      {missingFields.length > 0 && (
        <View style={styles.tagsContainer}>
          {missingFields.map(field => (
            <View key={field.id} style={styles.tag}>
              <Text style={styles.tagText}>+ Thêm {field.label.toLowerCase()}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 24,
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#334155',
    position: 'relative',
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#f1f5f9',
  },
  subtitle: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 2,
    marginBottom: 12,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: '#0f172a',
    borderRadius: 4,
    overflow: 'hidden',
    marginRight: 12,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 4,
  },
  percentText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#3b82f6',
    width: 40,
    textAlign: 'right',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  tagText: {
    fontSize: 12,
    color: '#3b82f6',
    fontWeight: '600',
  },
});
