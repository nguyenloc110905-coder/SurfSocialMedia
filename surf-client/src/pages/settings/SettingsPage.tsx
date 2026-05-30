import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useT } from '@/lib/i18n';
import { ITEM_TO_SECTION } from '@/lib/settings-constants';
import SettingsSidebar from './SettingsSidebar';
import PrivacyCheckupPanel from './PrivacyCheckupPanel';
import DefaultAudiencePanel from './DefaultAudiencePanel';
import AccountSecurityPanel from './AccountSecurityPanel';
import DeleteAccountPanel from './DeleteAccountPanel';
import QuickAccessSection from './QuickAccessSection';
import ReviewModal from './ReviewModal';
import CustomSettingsModal from './CustomSettingsModal';
import SettingsSectionPage from './SettingsSectionPage';

import BlockListPanel from './BlockListPanel';
import FriendRequestPrivacyPanel from './FriendRequestPrivacyPanel';
import LanguagePanel from './LanguagePanel';
import ReportsPanel from './ReportsPanel';
import PrivacySettingsPanel from './PrivacySettingsPanel';
import AppearancePanel from './AppearancePanel';
import ActiveSessionsPanel from './ActiveSessionsPanel';
import NotificationPreferencesPanel from './NotificationPreferencesPanel';

export default function SettingsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedDetail, setSelectedDetail] = useState<string | null>(
    searchParams.get('detail')
  );
  const [reviewAudience, setReviewAudience] = useState<'public' | 'friends' | null>(null);
  const [showCustomModal, setShowCustomModal] = useState(false);

  const t = useT();

  useEffect(() => {
    const detail = searchParams.get('detail');
    if (detail) {
      if (detail === 'policy') {
        navigate('/policy');
      } else {
        setSelectedDetail(detail);
        setSearchParams({}, { replace: true });
      }
    }
  }, []);

  // Effect to handle navigation when selectedDetail changes from sidebar
  useEffect(() => {
    if (selectedDetail === 'policy') {
      navigate('/policy');
    }
  }, [selectedDetail, navigate]);

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
            <span className="font-medium">{t('settings_back')}</span>
          </Link>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 flex-col lg:flex-row overflow-hidden">
        <SettingsSidebar selectedDetail={selectedDetail} onSelectDetail={setSelectedDetail} />

        {/* Nội dung bên phải */}
        <main className="flex-1 min-w-0 min-h-0 overflow-y-auto flex flex-col p-6 lg:p-8 bg-slate-50/50 dark:bg-slate-900/30">
          {selectedDetail === 'privacy-checkup' ? (
            <PrivacyCheckupPanel onBack={() => setSelectedDetail(null)} />
          ) : selectedDetail === 'default-audience' ? (
            <DefaultAudiencePanel
              onShowReview={(a) => setReviewAudience(a)}
              onShowCustom={() => setShowCustomModal(true)}
            />
          ) : selectedDetail === 'account-security' ? (
            <AccountSecurityPanel />
          ) : selectedDetail === 'delete-account' ? (
            <DeleteAccountPanel />
          ) : selectedDetail === 'block-list' ? (
            <BlockListPanel />
          ) : selectedDetail === 'friend-request-privacy' ? (
            <FriendRequestPrivacyPanel />
          ) : selectedDetail === 'privacy-settings' ? (
            <PrivacySettingsPanel />
          ) : selectedDetail === 'active-sessions' ? (
            <ActiveSessionsPanel />
          ) : selectedDetail === 'appearance' ? (
            <AppearancePanel />
          ) : selectedDetail === 'notifications' ? (
            <NotificationPreferencesPanel />
          ) : selectedDetail === 'language-timezone' ? (
            <LanguagePanel />
          ) : selectedDetail === 'reports' ? (
            <ReportsPanel />
          ) : sectionKey ? (
            <SettingsSectionPage sectionKey={sectionKey} activeItem={selectedDetail} />
          ) : (
            <QuickAccessSection onSelectDetail={setSelectedDetail} />
          )}
        </main>
      </div>

      {/* Modal Xem lại lựa chọn */}
      {reviewAudience && (
        <ReviewModal
          audience={reviewAudience}
          onConfirm={() => {
            setReviewAudience(null);
            setSelectedDetail(null);
          }}
          onClose={() => setReviewAudience(null)}
        />
      )}

      {/* Modal Cài đặt tùy chỉnh */}
      {showCustomModal && (
        <CustomSettingsModal
          onDone={() => {
            setShowCustomModal(false);
            setSelectedDetail(null);
          }}
          onClose={() => setShowCustomModal(false)}
        />
      )}
    </div>
  );
}
