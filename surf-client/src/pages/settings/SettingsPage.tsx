import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ITEM_TO_SECTION } from '@/lib/settings-data.tsx';
import SettingsSidebar from './SettingsSidebar';
import PrivacyCheckupPanel from './PrivacyCheckupPanel';
import DefaultAudiencePanel from './DefaultAudiencePanel';
import QuickAccessSection from './QuickAccessSection';
import ReviewModal from './ReviewModal';
import CustomSettingsModal from './CustomSettingsModal';
import SettingsSectionPage from './SettingsSectionPage';

export default function SettingsPage() {
  const [selectedDetail, setSelectedDetail] = useState<string | null>(null);
  const [reviewAudience, setReviewAudience] = useState<'public' | 'friends' | null>(null);
  const [showCustomModal, setShowCustomModal] = useState(false);

  const sectionKey = selectedDetail ? ITEM_TO_SECTION[selectedDetail] : null;

  return (
    <div className="flex-1 w-full min-h-0 flex flex-col bg-surf-light dark:bg-surf-dark border-b border-slate-200/80 dark:border-slate-700/80 overflow-hidden">
      {/* Thanh quay lại — accent Surf */}
      <div className="flex-shrink-0 flex items-center border-b border-slate-200/80 dark:border-slate-700/80 bg-white/80 dark:bg-surf-card/80 backdrop-blur-sm">
        <div className="flex-1 flex items-center h-12 pl-4 border-l-4 border-surf-primary">
          <Link
            to="/feed"
            className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:text-surf-primary dark:hover:text-surf-secondary transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
            </svg>
            <span className="font-medium">Quay lại</span>
          </Link>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 flex-col lg:flex-row overflow-hidden">
        <SettingsSidebar
          selectedDetail={selectedDetail}
          onSelectDetail={setSelectedDetail}
        />

        {/* Nội dung bên phải */}
        <main className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col p-6 lg:p-8 bg-slate-50/50 dark:bg-slate-900/30">
          {selectedDetail === 'privacy-checkup' ? (
            <PrivacyCheckupPanel onBack={() => setSelectedDetail(null)} />
          ) : selectedDetail === 'default-audience' ? (
            <DefaultAudiencePanel
              onShowReview={(a) => setReviewAudience(a)}
              onShowCustom={() => setShowCustomModal(true)}
            />
          ) : sectionKey ? (
            <SettingsSectionPage sectionKey={sectionKey} activeItem={selectedDetail} />
          ) : (
            <QuickAccessSection />
          )}
        </main>
      </div>

      {/* Modal Xem lại lựa chọn */}
      {reviewAudience && (
        <ReviewModal
          audience={reviewAudience}
          onConfirm={() => { setReviewAudience(null); setSelectedDetail(null); }}
          onClose={() => setReviewAudience(null)}
        />
      )}

      {/* Modal Cài đặt tùy chỉnh */}
      {showCustomModal && (
        <CustomSettingsModal
          onDone={() => { setShowCustomModal(false); setSelectedDetail(null); }}
          onClose={() => setShowCustomModal(false)}
        />
      )}
    </div>
  );
}
