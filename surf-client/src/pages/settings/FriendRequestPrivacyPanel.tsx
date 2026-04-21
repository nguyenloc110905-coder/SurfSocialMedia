import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';

type FriendRequestPrivacy = 'everyone' | 'friends_of_friends';

type MeResponse = {
  friendRequestPrivacy?: unknown;
};

const DEFAULT_FRIEND_REQUEST_PRIVACY: FriendRequestPrivacy = 'everyone';

const OPTIONS: Array<{
  value: FriendRequestPrivacy;
  title: string;
  description: string;
}> = [
  {
    value: 'everyone',
    title: 'Moi nguoi',
    description: 'Bat ky nguoi dung nao cung co the gui loi moi ket ban cho ban.',
  },
  {
    value: 'friends_of_friends',
    title: 'Ban cua ban be',
    description: 'Chi nguoi co ban chung voi ban moi co the gui loi moi ket ban.',
  },
];

const normalizeFriendRequestPrivacy = (value: unknown): FriendRequestPrivacy =>
  value === 'friends_of_friends' ? 'friends_of_friends' : DEFAULT_FRIEND_REQUEST_PRIVACY;

export default function FriendRequestPrivacyPanel() {
  const [privacy, setPrivacy] = useState<FriendRequestPrivacy>(DEFAULT_FRIEND_REQUEST_PRIVACY);
  const [savedPrivacy, setSavedPrivacy] = useState<FriendRequestPrivacy>(
    DEFAULT_FRIEND_REQUEST_PRIVACY
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadPrivacy = async () => {
      try {
        setLoading(true);
        setError(null);

        const me = await api.get<MeResponse>('/api/users/me');
        if (cancelled) return;

        const normalized = normalizeFriendRequestPrivacy(me.friendRequestPrivacy);
        setPrivacy(normalized);
        setSavedPrivacy(normalized);
      } catch (e) {
        if (cancelled) return;
        setError((e as Error).message || 'Khong tai duoc cai dat loi moi ket ban.');
        setPrivacy(DEFAULT_FRIEND_REQUEST_PRIVACY);
        setSavedPrivacy(DEFAULT_FRIEND_REQUEST_PRIVACY);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadPrivacy();

    return () => {
      cancelled = true;
    };
  }, []);

  const isDirty = useMemo(() => privacy !== savedPrivacy, [privacy, savedPrivacy]);

  const handleSave = async () => {
    if (saving || loading || !isDirty) return;

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const updated = await api.put<MeResponse>('/api/users/me', {
        friendRequestPrivacy: privacy,
      });

      const normalized = normalizeFriendRequestPrivacy(updated.friendRequestPrivacy ?? privacy);
      setPrivacy(normalized);
      setSavedPrivacy(normalized);
      setSuccess('Da luu cai dat loi moi ket ban.');
    } catch (e) {
      setError((e as Error).message || 'Khong luu duoc cai dat. Vui long thu lai.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <h1 className="mb-2 text-2xl font-bold text-slate-800 dark:text-slate-100">
        Ai co the gui loi moi ket ban
      </h1>
      <p className="mb-6 text-slate-600 dark:text-slate-300">
        Ban co the cho phep tat ca moi nguoi, hoac chi nhan loi moi tu nhung nguoi co ban chung.
      </p>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
          {error}
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
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Dang tai cai dat loi moi ket ban...
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {OPTIONS.map((option) => {
              const selected = option.value === privacy;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setSuccess(null);
                    setPrivacy(option.value);
                  }}
                  className={`w-full rounded-2xl border-2 px-4 py-4 text-left transition ${
                    selected
                      ? 'border-surf-primary bg-surf-primary/10 dark:border-surf-secondary dark:bg-surf-secondary/15'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/90 dark:hover:border-slate-600'
                  } ${saving ? 'cursor-not-allowed opacity-70' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-1 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border ${
                        selected
                          ? 'border-surf-primary bg-surf-primary text-white dark:border-surf-secondary dark:bg-surf-secondary'
                          : 'border-slate-300 bg-white dark:border-slate-500 dark:bg-slate-700'
                      }`}
                    >
                      {selected && (
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M9 16.17 4.83 12 3.41 13.41 9 19l12-12-1.41-1.41z" />
                        </svg>
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {option.title}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {option.description}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading || !isDirty}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-surf-primary px-5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-surf-secondary"
            >
              {saving ? 'Dang luu...' : 'Luu thay doi'}
            </button>

            <button
              type="button"
              onClick={() => {
                setSuccess(null);
                setPrivacy(DEFAULT_FRIEND_REQUEST_PRIVACY);
              }}
              disabled={saving}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-300 px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700/40"
            >
              Dat lai mac dinh
            </button>

            {!isDirty && !saving && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Khong co thay doi moi.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}