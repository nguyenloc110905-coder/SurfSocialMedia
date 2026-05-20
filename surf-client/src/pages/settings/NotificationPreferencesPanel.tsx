import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { requestNotificationPermission } from '@/lib/firebase/messaging';

type NotificationPrefKey =
  | 'friend_request'
  | 'friend_accept'
  | 'post_reaction'
  | 'comment'
  | 'mention'
  | 'share'
  | 'missed_call'
  | 'system';

type NotificationPrefs = Record<NotificationPrefKey, boolean>;

type MeResponse = {
  notificationPrefs?: Partial<NotificationPrefs>;
};

const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  friend_request: true,
  friend_accept: true,
  post_reaction: true,
  comment: true,
  mention: true,
  share: true,
  missed_call: true,
  system: true,
};

const PREFERENCE_ITEMS: Array<{ key: NotificationPrefKey; title: string; desc: string }> = [
  {
    key: 'friend_request',
    title: 'Lời mời kết bạn',
    desc: 'Thông báo khi có người gửi lời mời kết bạn.',
  },
  {
    key: 'friend_accept',
    title: 'Chấp nhận kết bạn',
    desc: 'Thông báo khi lời mời kết bạn của bạn được chấp nhận.',
  },
  {
    key: 'post_reaction',
    title: 'Cảm xúc',
    desc: 'Thông báo khi bài viết hoặc bình luận của bạn được thả cảm xúc.',
  },
  {
    key: 'comment',
    title: 'Bình luận và trả lời',
    desc: 'Thông báo khi có người bình luận hoặc trả lời vào nội dung của bạn.',
  },
  {
    key: 'mention',
    title: 'Nhắc tên',
    desc: 'Thông báo khi bạn được nhắc tên trong bài viết.',
  },
  {
    key: 'share',
    title: 'Chia sẻ',
    desc: 'Thông báo khi nội dung của bạn được chia sẻ.',
  },
  {
    key: 'missed_call',
    title: 'Cuộc gọi nhỡ',
    desc: 'Thông báo khi bạn bỏ lỡ cuộc gọi.',
  },
  {
    key: 'system',
    title: 'Hệ thống',
    desc: 'Thông báo hệ thống quan trọng từ Surf.',
  },
];

const normalizeNotificationPrefs = (
  input?: Partial<NotificationPrefs> | null
): NotificationPrefs => {
  const normalized: NotificationPrefs = { ...DEFAULT_NOTIFICATION_PREFS };
  if (!input) return normalized;

  for (const item of PREFERENCE_ITEMS) {
    const value = input[item.key];
    if (typeof value === 'boolean') {
      normalized[item.key] = value;
    }
  }

  return normalized;
};

function PrefToggle({
  checked,
  disabled,
  onToggle,
}: {
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onToggle}
      className={`inline-flex h-7 w-12 items-center rounded-full border transition ${
        checked
          ? 'border-surf-primary bg-surf-primary/90 dark:border-surf-secondary dark:bg-surf-secondary/90'
          : 'border-slate-300 bg-slate-200 dark:border-slate-600 dark:bg-slate-700'
      } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export default function NotificationPreferencesPanel() {
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [savedPrefs, setSavedPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState(Notification.permission === 'granted');

  const handleEnablePush = async () => {
    try {
      const token = await requestNotificationPermission();
      if (token) {
        setPushEnabled(true);
        setSuccess('Đã bật thông báo đẩy thành công!');
      } else {
        setError('Không thể bật thông báo đẩy. Vui lòng kiểm tra quyền trên trình duyệt.');
      }
    } catch (err) {
      setError('Đã xảy ra lỗi khi yêu cầu quyền thông báo.');
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadPrefs = async () => {
      try {
        setLoading(true);
        setError(null);
        const me = await api.get<MeResponse>('/api/users/me');
        if (cancelled) return;

        const normalized = normalizeNotificationPrefs(me.notificationPrefs);
        setPrefs(normalized);
        setSavedPrefs(normalized);
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message || 'Không tải được cài đặt thông báo.');
          const normalized = normalizeNotificationPrefs();
          setPrefs(normalized);
          setSavedPrefs(normalized);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadPrefs();

    return () => {
      cancelled = true;
    };
  }, []);

  const isDirty = useMemo(
    () => PREFERENCE_ITEMS.some((item) => prefs[item.key] !== savedPrefs[item.key]),
    [prefs, savedPrefs]
  );

  const handleToggle = (key: NotificationPrefKey) => {
    setSuccess(null);
    setPrefs((current) => ({ ...current, [key]: !current[key] }));
  };

  const handleReset = () => {
    setSuccess(null);
    setPrefs({ ...DEFAULT_NOTIFICATION_PREFS });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const updated = await api.put<MeResponse>('/api/users/me', {
        notificationPrefs: prefs,
      });

      const normalized = normalizeNotificationPrefs(updated.notificationPrefs ?? prefs);
      setPrefs(normalized);
      setSavedPrefs(normalized);
      setSuccess('Đã lưu tùy chọn thông báo.');
    } catch (e) {
      setError((e as Error).message || 'Không thể lưu cài đặt thông báo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <h1 className="mb-2 text-2xl font-bold text-slate-800 dark:text-slate-100">
        Thông báo và nhắc
      </h1>
      <p className="mb-6 text-slate-600 dark:text-slate-300">
        Chọn loại thông báo bạn muốn nhận trong Surf.
      </p>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Nút bật thông báo đẩy (Web Push) */}
      {!pushEnabled && (
        <div className="mb-6 flex items-center justify-between rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 dark:border-blue-900/40 dark:bg-blue-900/20">
          <div>
            <h3 className="font-semibold text-blue-900 dark:text-blue-100">Thông báo đẩy (Trình duyệt)</h3>
            <p className="text-sm text-blue-700 dark:text-blue-300">Nhận thông báo ngay cả khi bạn không mở ứng dụng.</p>
          </div>
          <button
            type="button"
            onClick={handleEnablePush}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Bật thông báo
          </button>
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300">
          {success}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-3 inline-block h-8 w-8 animate-spin rounded-full border-2 border-surf-primary border-t-transparent" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Đang tải cài đặt thông báo...</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {PREFERENCE_ITEMS.map((item) => (
              <div
                key={item.key}
                className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{item.title}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.desc}</p>
                </div>
                <PrefToggle
                  checked={prefs[item.key]}
                  disabled={saving}
                  onToggle={() => handleToggle(item.key)}
                />
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !isDirty}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-surf-primary px-5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-surf-secondary"
            >
              {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={saving}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700/40"
            >
              Đặt lại mặc định
            </button>
            {!isDirty && !saving && (
              <span className="text-xs text-slate-500 dark:text-slate-400">Không có thay đổi mới.</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
