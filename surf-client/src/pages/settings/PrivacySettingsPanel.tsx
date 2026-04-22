import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type VisibilityOption = 'public' | 'friends' | 'only-me';

type PrivacySettings = {
  posts: VisibilityOption;
  friends: VisibilityOption;
  photos: VisibilityOption;
};

const OPTIONS: Array<{ value: VisibilityOption; title: string; desc: string }> = [
  { value: 'public', title: 'Công khai', desc: 'Mọi người đều có thể xem.' },
  { value: 'friends', title: 'Bạn bè', desc: 'Chỉ bạn bè mới thấy được.' },
  { value: 'only-me', title: 'Chỉ mình tôi', desc: 'Chỉ mình bạn có thể xem.' },
];

const defaultSettings: PrivacySettings = {
  posts: 'public',
  friends: 'public',
  photos: 'public',
};

function buildLabel(key: keyof PrivacySettings) {
  if (key === 'posts') return 'Ai có thể xem bài viết của bạn';
  if (key === 'friends') return 'Ai có thể xem danh sách bạn bè của bạn';
  return 'Ai có thể xem ảnh của bạn';
}

export default function PrivacySettingsPanel() {
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await api.get<{ privacySettings?: Partial<PrivacySettings> }>('/api/users/me');
        if (cancelled) return;
        setPrivacySettings({
          posts: response.privacySettings?.posts ?? 'public',
          friends: response.privacySettings?.friends ?? 'public',
          photos: response.privacySettings?.photos ?? 'public',
        });
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message || 'Không tải được cài đặt quyền riêng tư.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = (key: keyof PrivacySettings, value: VisibilityOption) => {
    setPrivacySettings((prev) => ({ ...prev, [key]: value }));
    setSuccess(null);
    setError(null);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      await api.put('/api/users/me', { privacySettings });
      setSuccess('Đã lưu cài đặt quyền riêng tư.');
    } catch (err) {
      setError((err as Error).message || 'Không thể lưu cài đặt.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">
        Cài đặt quyền riêng tư nội dung
      </h1>
      <p className="text-slate-600 dark:text-slate-300 mb-6">
        Chọn ai có thể xem bài viết, danh sách bạn bè và ảnh của bạn. Những thiết lập này sẽ được lưu trong cài đặt tài khoản và áp dụng cho trang cá nhân, feed và các truy vấn liên quan.
      </p>

      {error && (
        <div className="mb-4 rounded-2xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-600 dark:text-red-300">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-2xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-200">
          {success}
        </div>
      )}

      <div className="space-y-6">
        {(Object.keys(defaultSettings) as Array<keyof PrivacySettings>).map((key) => (
          <div key={key} className="rounded-3xl bg-white dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 p-5">
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{buildLabel(key)}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">{key === 'posts' ? 'Quyền xem bài viết của bạn trên timeline và trang cá nhân.' : key === 'friends' ? 'Quyền xem danh sách bạn bè trên trang cá nhân của bạn.' : 'Quyền xem ảnh của bạn.'}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {OPTIONS.map((option) => {
                const selected = privacySettings[key] === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleChange(key, option.value)}
                    className={`w-full rounded-2xl border p-4 text-left transition-all ${
                      selected
                        ? 'border-surf-primary dark:border-surf-secondary bg-surf-primary/10 dark:bg-surf-secondary/15 shadow-sm shadow-surf-primary/10'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/80 hover:border-surf-primary/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{option.title}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{option.desc}</div>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-full border-2 ${
                          selected
                            ? 'border-surf-primary bg-surf-primary'
                            : 'border-slate-300 bg-white dark:bg-slate-900'
                        }`}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loading}
          className="inline-flex items-center justify-center rounded-xl bg-surf-primary px-6 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {saving ? 'Đang lưu...' : 'Lưu cài đặt'}
        </button>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {loading ? 'Đang tải cài đặt hiện tại...' : 'Cài đặt sẽ được áp dụng ngay khi lưu.'}
        </span>
      </div>
    </div>
  );
}
