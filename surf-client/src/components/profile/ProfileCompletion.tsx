import { useState, useMemo } from 'react';
import { type UserProfile } from '@/lib/firebase/profile';

interface ProfileCompletionProps {
  profile: UserProfile | null;
  onNavigateToAbout: () => void;
}

export default function ProfileCompletion({ profile, onNavigateToAbout }: ProfileCompletionProps) {
  const [dismissed, setDismissed] = useState(false);

  const { percent, missingFields } = useMemo(() => {
    if (!profile) return { percent: 0, missingFields: [] };

    const checks = [
      { id: 'avatar', label: 'Ảnh đại diện', isCompleted: !!profile.photoURL },
      { id: 'cover', label: 'Ảnh bìa', isCompleted: !!profile.coverImageUrl },
      { id: 'bio', label: 'Tiểu sử', isCompleted: !!profile.bio },
      { id: 'location', label: 'Nơi sống/Quê quán', isCompleted: !!(profile.currentCity || profile.hometown) },
      { id: 'work_edu', label: 'Công việc/Học vấn', isCompleted: (profile.work && profile.work.length > 0) || (profile.education && profile.education.length > 0) },
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
    <div className="bg-white dark:bg-gray-900 rounded-3xl p-5 mb-6 border border-gray-100 dark:border-gray-800 shadow-sm relative overflow-hidden">
      <div className="absolute top-4 right-4">
        <button 
          onClick={() => setDismissed(true)}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          title="Bỏ qua"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Hoàn thiện hồ sơ của bạn</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Giúp mọi người hiểu rõ hơn về bạn.</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex-1 h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-surf-primary transition-all duration-500 rounded-full" 
              style={{ width: `${percent}%` }} 
            />
          </div>
          <span className="text-sm font-bold text-surf-primary">{percent}%</span>
        </div>

        {missingFields.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-1">
            {missingFields.map((field) => (
              <button
                key={field.id}
                onClick={onNavigateToAbout}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-surf-primary/10 text-surf-primary hover:bg-surf-primary hover:text-white transition-colors border border-surf-primary/20"
              >
                + Thêm {field.label.toLowerCase()}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
