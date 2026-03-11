import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { updateProfileFields, type Birthday } from '@/lib/firebase/profile';
import { PHONE_COUNTRIES } from '@/lib/phone-countries';

const RELATIONSHIP_OPTIONS = [
  'Độc thân',
  'Đang hẹn hò',
  'Đã đính hôn',
  'Đã kết hôn',
  'Trong mối quan hệ phức tạp',
  'Đang tìm hiểu',
  'Góa',
  'Ly thân',
  'Đã ly hôn',
];

const GENDER_OPTIONS = ['Nam', 'Nữ', 'Khác'];

const STEPS = ['Thông tin cơ bản', 'Giới thiệu bản thân', 'Xem lại & Lưu'];

function getDaysInMonth(month: number, year: number): number {
  if (!month) return 31;
  if (!year) return new Date(2000, month, 0).getDate();
  return new Date(year, month, 0).getDate();
}

/* ─── Shared dark-ocean background ──────────────────────────────────────── */
function AuthBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-cyan-950 to-slate-900" />
      <div className="auth-orb auth-orb-1" />
      <div className="auth-orb auth-orb-2" />
      <div className="auth-orb auth-orb-3" />
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />
      {Array.from({ length: 15 }).map((_, i) => (
        <div
          key={i}
          className="auth-particle"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 8}s`,
            animationDuration: `${6 + Math.random() * 8}s`,
            width: `${2 + Math.random() * 3}px`,
            height: `${2 + Math.random() * 3}px`,
          }}
        />
      ))}
    </div>
  );
}

/* ─── Location autocomplete (Nominatim) ────────────────────────────────── */
interface NominatimResult {
  place_id: number;
  display_name: string;
}

function LocationAutocomplete({
  value,
  onChange,
  placeholder,
  inputClass,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  inputClass: string;
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const search = useCallback((q: string) => {
    if (q.trim().length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    const encoded = encodeURIComponent(q.trim());
    fetch(
      `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=5&accept-language=vi&addressdetails=0`,
      { headers: { 'User-Agent': 'SurfSocialMedia/1.0' } }
    )
      .then((r) => r.json())
      .then((data: NominatimResult[]) => { setResults(data); setOpen(data.length > 0); })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, []);

  const handleInput = (text: string) => {
    setQuery(text); onChange('');
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(text), 400);
  };

  const pick = (item: NominatimResult) => {
    const short = item.display_name.split(',').slice(0, 3).join(', ');
    setQuery(short); onChange(short); setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text" placeholder={placeholder} value={query}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        className={inputClass}
      />
      {loading && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {open && results.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 mt-1 bg-slate-800/95 backdrop-blur-lg border border-white/10 rounded-xl shadow-lg max-h-48 overflow-y-auto">
          {results.map((r) => (
            <li key={r.place_id}>
              <button
                type="button" onClick={() => pick(r)}
                className="w-full text-left px-4 py-2.5 text-sm text-white/80 hover:bg-white/10 transition-colors"
              >
                {r.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ONBOARDING COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */
export default function Onboarding() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [phoneError, setPhoneError] = useState('');

  const [birthdayDay, setBirthdayDay] = useState('');
  const [birthdayMonth, setBirthdayMonth] = useState('');
  const [birthdayYear, setBirthdayYear] = useState('');
  const [gender, setGender] = useState('');
  const [customGender, setCustomGender] = useState('');
  const [phoneCode, setPhoneCode] = useState('VN');
  const [phoneNumber, setPhoneNumber] = useState('');

  const [bio, setBio] = useState('');
  const [currentCity, setCurrentCity] = useState('');
  const [hometown, setHometown] = useState('');
  const [relationship, setRelationship] = useState('');

  const INPUT =
    'w-full px-4 py-3 rounded-xl bg-white/[0.07] border border-white/[0.12] text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-cyan-400/60 focus:border-transparent backdrop-blur-sm transition-all duration-200';
  const SELECT =
    'px-3 py-3 rounded-xl bg-white/[0.07] border border-white/[0.12] text-white/80 focus:outline-none focus:ring-2 focus:ring-cyan-400/60 transition-all duration-200';
  const LABEL = 'block text-xs font-medium text-white/50 mb-1.5 ml-1';

  const monthNum = parseInt(birthdayMonth, 10) || 0;
  const yearNum = parseInt(birthdayYear, 10) || 0;
  const maxDays = getDaysInMonth(monthNum, yearNum);

  useEffect(() => {
    if (birthdayDay && parseInt(birthdayDay, 10) > maxDays) setBirthdayDay('');
  }, [maxDays, birthdayDay]);

  const days = Array.from({ length: maxDays }, (_, i) => i + 1);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => currentYear - i);

  const handlePhoneChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    setPhoneNumber(digits);
    setPhoneError(digits.length > 0 && digits.length !== 10 ? 'Số điện thoại phải đủ 10 chữ số.' : '');
  };

  const validateStep = (): boolean => {
    if (step === 0 && phoneNumber && phoneNumber.length !== 10) {
      setPhoneError('Số điện thoại phải đủ 10 chữ số.'); return false;
    }
    return true;
  };

  const next = () => { if (validateStep()) setStep((s) => Math.min(s + 1, STEPS.length - 1)); };
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const buildPhone = () => {
    if (!phoneNumber.trim()) return null;
    const country = PHONE_COUNTRIES.find((c) => c.iso === phoneCode);
    return `${country?.code ?? '+84'} ${phoneNumber.trim()}`;
  };

  const buildBirthday = (): Birthday | null => {
    const d = parseInt(birthdayDay, 10), m = parseInt(birthdayMonth, 10), y = parseInt(birthdayYear, 10);
    if (!d || !m || !y) return null;
    return { day: d, month: m, year: y, showYear: true };
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const fields: Record<string, unknown> = {};
      const bday = buildBirthday();
      if (bday) fields.birthday = bday;
      if (gender) fields.gender = gender;
      if (gender === 'Khác' && customGender.trim()) fields.customGender = customGender.trim();
      const phone = buildPhone();
      if (phone) fields.phone = phone;
      if (bio.trim()) fields.bio = bio.trim();
      if (currentCity.trim()) fields.currentCity = currentCity.trim();
      if (hometown.trim()) fields.hometown = hometown.trim();
      if (relationship) fields.relationship = relationship;

      if (Object.keys(fields).length > 0) await updateProfileFields(user.uid, fields);
      navigate('/feed', { replace: true });
    } catch (err) {
      console.error('Onboarding save error:', err);
    } finally {
      setSaving(false);
    }
  };

  /* ─── Review helpers ───────────────────────────────────────────────────── */
  const reviewRows: { label: string; value: string }[] = [];
  if (buildBirthday()) reviewRows.push({ label: 'Ngày sinh', value: `${birthdayDay}/${birthdayMonth}/${birthdayYear}` });
  if (gender) reviewRows.push({ label: 'Giới tính', value: gender === 'Khác' && customGender ? customGender : gender });
  if (phoneNumber.trim()) reviewRows.push({ label: 'Điện thoại', value: buildPhone()! });
  if (bio.trim()) reviewRows.push({ label: 'Tiểu sử', value: bio });
  if (currentCity.trim()) reviewRows.push({ label: 'Thành phố', value: currentCity });
  if (hometown.trim()) reviewRows.push({ label: 'Quê quán', value: hometown });
  if (relationship) reviewRows.push({ label: 'Quan hệ', value: relationship });

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <AuthBackground />

      <div className="auth-entrance relative z-10 w-full max-w-lg mx-4 py-8">
        <div className="auth-glass rounded-3xl p-7 md:p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <Link to="/" className="inline-block group mb-3">
              <img
                src="/SurfLogo.png"
                alt="Surf"
                className="h-14 w-auto object-contain drop-shadow-[0_0_30px_rgba(6,182,212,0.3)] group-hover:drop-shadow-[0_0_50px_rgba(6,182,212,0.5)] transition-all duration-500 group-hover:scale-105 mx-auto"
              />
            </Link>
            <h1 className="text-xl font-bold text-white">Chào mừng đến Surf! 🏄</h1>
            <p className="text-sm text-white/40 mt-1">Hoàn thiện hồ sơ để bạn bè dễ tìm thấy bạn</p>
          </div>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 mb-6">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${
                    i <= step
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/20'
                      : 'bg-white/[0.07] text-white/30 border border-white/[0.12]'
                  }`}
                >
                  {i < step ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-8 h-0.5 transition-colors duration-300 ${i < step ? 'bg-cyan-500' : 'bg-white/10'}`} />
                )}
              </div>
            ))}
          </div>
          <p className="text-center text-sm font-medium text-cyan-400/80 mb-6">{STEPS[step]}</p>

          {/* ─── Step 1: Basic ──────────────────────────────────────────── */}
          {step === 0 && (
            <div className="space-y-4 auth-entrance">
              <div>
                <label className={LABEL}>Ngày sinh</label>
                <div className="flex gap-2">
                  <select value={birthdayMonth} onChange={(e) => setBirthdayMonth(e.target.value)} className={`${SELECT} flex-1`}>
                    <option value="" className="bg-slate-800 text-white">Tháng</option>
                    {months.map((m) => <option key={m} value={m} className="bg-slate-800 text-white">Tháng {m}</option>)}
                  </select>
                  <select value={birthdayDay} onChange={(e) => setBirthdayDay(e.target.value)} className={`${SELECT} flex-1`}>
                    <option value="" className="bg-slate-800 text-white">Ngày</option>
                    {days.map((d) => <option key={d} value={d} className="bg-slate-800 text-white">{d}</option>)}
                  </select>
                  <select value={birthdayYear} onChange={(e) => setBirthdayYear(e.target.value)} className={`${SELECT} flex-1`}>
                    <option value="" className="bg-slate-800 text-white">Năm</option>
                    {years.map((y) => <option key={y} value={y} className="bg-slate-800 text-white">{y}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className={LABEL}>Giới tính</label>
                <div className="flex gap-2">
                  {GENDER_OPTIONS.map((g) => (
                    <button
                      key={g} type="button" onClick={() => setGender(g)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all duration-300 ${
                        gender === g
                          ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white border-transparent shadow-lg shadow-cyan-500/20'
                          : 'bg-white/[0.05] border-white/[0.12] text-white/60 hover:bg-white/[0.1] hover:text-white/80'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
                {gender === 'Khác' && (
                  <input type="text" placeholder="Nhập giới tính của bạn" value={customGender} onChange={(e) => setCustomGender(e.target.value)} className={`${INPUT} mt-2`} />
                )}
              </div>
            </div>
          )}

          {/* ─── Step 2: About ─────────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-4 auth-entrance">
              <div>
                <label className={LABEL}>Tiểu sử</label>
                <textarea
                  placeholder="Giới thiệu ngắn về bạn..."
                  value={bio} onChange={(e) => setBio(e.target.value)}
                  maxLength={200} rows={3}
                  className={`${INPUT} resize-none`}
                />
                <p className="text-xs text-white/30 text-right mt-1">{bio.length}/200</p>
              </div>
              <div>
                <label className={LABEL}>Thành phố hiện tại</label>
                <LocationAutocomplete value={currentCity} onChange={setCurrentCity} placeholder="Tìm thành phố..." inputClass={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Quê quán</label>
                <LocationAutocomplete value={hometown} onChange={setHometown} placeholder="Tìm quê quán..." inputClass={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Tình trạng mối quan hệ</label>
                <select value={relationship} onChange={(e) => setRelationship(e.target.value)} className={`${SELECT} w-full`}>
                  <option value="" className="bg-slate-800 text-white">-- Chọn --</option>
                  {RELATIONSHIP_OPTIONS.map((r) => <option key={r} value={r} className="bg-slate-800 text-white">{r}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* ─── Step 3: Review ────────────────────────────────────────── */}
          {step === 2 && (
            <div className="auth-entrance">
              <div className="bg-white/[0.04] rounded-2xl p-5 space-y-3">
                {reviewRows.length > 0 ? (
                  reviewRows.map(({ label, value }) => (
                    <div key={label} className="flex justify-between items-start">
                      <span className="text-white/40 text-sm">{label}</span>
                      <span className="text-white/90 text-sm text-right max-w-[60%]">{value}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-white/30 py-4 text-sm">
                    Bạn chưa nhập thông tin nào. Có thể bổ sung sau trong trang cá nhân.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-7">
            {step > 0 ? (
              <button type="button" onClick={back}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-white/50 border border-white/[0.12] hover:bg-white/[0.07] hover:text-white/80 transition-all duration-200"
              >
                Quay lại
              </button>
            ) : (
              <button type="button" onClick={() => navigate('/feed', { replace: true })}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-white/30 hover:text-white/60 transition-all duration-200"
              >
                Bỏ qua
              </button>
            )}

            {step < STEPS.length - 1 ? (
              <button type="button" onClick={next}
                className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-400/30 transition-all duration-300"
              >
                Tiếp tục
              </button>
            ) : (
              <button type="button" onClick={handleSave} disabled={saving}
                className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-400/30 transition-all duration-300 disabled:opacity-50"
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Đang lưu...
                  </span>
                ) : 'Hoàn tất'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
