import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
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

/** Trả về số ngày tối đa trong tháng (tính năm nhuận) */
function getDaysInMonth(month: number, year: number): number {
  if (!month) return 31;
  if (!year) {
    // Chưa chọn năm → dùng mặc định (năm nhuận để tháng 2 có 29)
    return new Date(2000, month, 0).getDate();
  }
  return new Date(year, month, 0).getDate();
}

interface NominatimResult {
  place_id: number;
  display_name: string;
}

/** Autocomplete địa điểm dùng OpenStreetMap Nominatim (miễn phí, không cần API key) */
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

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const search = useCallback((q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    const encoded = encodeURIComponent(q.trim());
    fetch(
      `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=5&accept-language=vi&addressdetails=0`,
      { headers: { 'User-Agent': 'SurfSocialMedia/1.0' } }
    )
      .then((r) => r.json())
      .then((data: NominatimResult[]) => {
        setResults(data);
        setOpen(data.length > 0);
      })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, []);

  const handleInput = (text: string) => {
    setQuery(text);
    onChange(''); // reset selected value khi user gõ lại
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(text), 400);
  };

  const pick = (item: NominatimResult) => {
    const short = item.display_name.split(',').slice(0, 3).join(', ');
    setQuery(short);
    onChange(short);
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        placeholder={placeholder}
        value={query}
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
        <ul className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg max-h-48 overflow-y-auto">
          {results.map((r) => (
            <li key={r.place_id}>
              <button
                type="button"
                onClick={() => pick(r)}
                className="w-full text-left px-4 py-2.5 text-sm text-gray-800 dark:text-gray-200 hover:bg-cyan-50 dark:hover:bg-white/10 transition-colors"
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

export default function Onboarding() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [phoneError, setPhoneError] = useState('');

  // Step 1 — Basic
  const [birthdayDay, setBirthdayDay] = useState('');
  const [birthdayMonth, setBirthdayMonth] = useState('');
  const [birthdayYear, setBirthdayYear] = useState('');
  const [gender, setGender] = useState('');
  const [customGender, setCustomGender] = useState('');
  const [phoneCode, setPhoneCode] = useState('VN');
  const [phoneNumber, setPhoneNumber] = useState('');

  // Step 2 — About
  const [bio, setBio] = useState('');
  const [currentCity, setCurrentCity] = useState('');
  const [hometown, setHometown] = useState('');
  const [relationship, setRelationship] = useState('');

  const inputClass =
    'w-full px-4 py-2.5 rounded-xl bg-white/70 dark:bg-white/10 border border-gray-200 dark:border-white/20 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-all';
  const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

  // --- Date validation ---
  const monthNum = parseInt(birthdayMonth, 10) || 0;
  const yearNum = parseInt(birthdayYear, 10) || 0;
  const maxDays = getDaysInMonth(monthNum, yearNum);

  // Reset ngày nếu vượt quá max (vd: đang chọn 31, đổi sang tháng 2)
  useEffect(() => {
    if (birthdayDay && parseInt(birthdayDay, 10) > maxDays) {
      setBirthdayDay('');
    }
  }, [maxDays, birthdayDay]);

  const days = Array.from({ length: maxDays }, (_, i) => i + 1);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => currentYear - i);

  // --- Phone validation ---
  const handlePhoneChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    setPhoneNumber(digits);
    if (digits.length > 0 && digits.length !== 10) {
      setPhoneError('Số điện thoại phải đủ 10 chữ số.');
    } else {
      setPhoneError('');
    }
  };

  const validateStep = (): boolean => {
    if (step === 0) {
      if (phoneNumber && phoneNumber.length !== 10) {
        setPhoneError('Số điện thoại phải đủ 10 chữ số.');
        return false;
      }
    }
    return true;
  };

  const next = () => {
    if (!validateStep()) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const buildPhone = () => {
    if (!phoneNumber.trim()) return null;
    const country = PHONE_COUNTRIES.find((c) => c.iso === phoneCode);
    return `${country?.code ?? '+84'} ${phoneNumber.trim()}`;
  };

  const buildBirthday = (): Birthday | null => {
    const d = parseInt(birthdayDay, 10);
    const m = parseInt(birthdayMonth, 10);
    const y = parseInt(birthdayYear, 10);
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

      if (Object.keys(fields).length > 0) {
        await updateProfileFields(user.uid, fields);
      }
      navigate('/feed', { replace: true });
    } catch (err) {
      console.error('Onboarding save error:', err);
    } finally {
      setSaving(false);
    }
  };

  const selectClass =
    'px-3 py-2.5 rounded-xl bg-white/70 dark:bg-white/10 border border-gray-200 dark:border-white/20 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-400 transition-all';

  return (
    <div className="min-h-screen bg-gradient-to-br from-cyan-50 via-blue-50 to-indigo-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-2xl p-8">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Chào mừng đến Surf! 🏄
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Hãy hoàn thiện hồ sơ để bạn bè dễ dàng tìm thấy bạn
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                  i <= step
                    ? 'bg-cyan-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                }`}
              >
                {i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`w-8 h-0.5 ${i < step ? 'bg-cyan-500' : 'bg-gray-200 dark:bg-gray-700'}`}
                />
              )}
            </div>
          ))}
        </div>
        <p className="text-center text-sm font-medium text-gray-600 dark:text-gray-300 mb-6">
          {STEPS[step]}
        </p>

        {/* Step 1: Basic */}
        {step === 0 && (
          <div className="space-y-4">
            {/* Birthday */}
            <div>
              <label className={labelClass}>Ngày sinh</label>
              <div className="flex gap-2">
                <select
                  value={birthdayMonth}
                  onChange={(e) => setBirthdayMonth(e.target.value)}
                  className={`${selectClass} flex-1`}
                >
                  <option value="">Tháng</option>
                  {months.map((m) => (
                    <option key={m} value={m}>
                      Tháng {m}
                    </option>
                  ))}
                </select>
                <select
                  value={birthdayDay}
                  onChange={(e) => setBirthdayDay(e.target.value)}
                  className={`${selectClass} flex-1`}
                >
                  <option value="">Ngày</option>
                  {days.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <select
                  value={birthdayYear}
                  onChange={(e) => setBirthdayYear(e.target.value)}
                  className={`${selectClass} flex-1`}
                >
                  <option value="">Năm</option>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Gender */}
            <div>
              <label className={labelClass}>Giới tính</label>
              <div className="flex gap-3">
                {GENDER_OPTIONS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGender(g)}
                    className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${
                      gender === g
                        ? 'bg-cyan-500 text-white border-cyan-500'
                        : 'bg-white/70 dark:bg-white/10 border-gray-200 dark:border-white/20 text-gray-700 dark:text-gray-300 hover:border-cyan-300'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
              {gender === 'Khác' && (
                <input
                  type="text"
                  placeholder="Nhập giới tính của bạn"
                  value={customGender}
                  onChange={(e) => setCustomGender(e.target.value)}
                  className={`${inputClass} mt-2`}
                />
              )}
            </div>

            {/* Phone */}
            <div>
              <label className={labelClass}>Số điện thoại</label>
              <div className="flex gap-2">
                <select
                  value={phoneCode}
                  onChange={(e) => setPhoneCode(e.target.value)}
                  className={`${selectClass} w-32`}
                >
                  {PHONE_COUNTRIES.map((c) => (
                    <option key={c.iso} value={c.iso}>
                      {c.iso} ({c.code})
                    </option>
                  ))}
                </select>
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder="0901234567"
                  maxLength={10}
                  value={phoneNumber}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  className={`${inputClass} flex-1 ${phoneError ? '!border-red-400 !ring-red-400' : ''}`}
                />
              </div>
              {phoneError && (
                <p className="text-xs text-red-500 mt-1">{phoneError}</p>
              )}
            </div>
          </div>
        )}

        {/* Step 2: About */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Tiểu sử</label>
              <textarea
                placeholder="Giới thiệu ngắn về bạn..."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={200}
                rows={3}
                className={`${inputClass} resize-none`}
              />
              <p className="text-xs text-gray-400 text-right mt-1">{bio.length}/200</p>
            </div>

            <div>
              <label className={labelClass}>Thành phố hiện tại</label>
              <LocationAutocomplete
                value={currentCity}
                onChange={setCurrentCity}
                placeholder="Tìm thành phố..."
                inputClass={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Quê quán</label>
              <LocationAutocomplete
                value={hometown}
                onChange={setHometown}
                placeholder="Tìm quê quán..."
                inputClass={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Tình trạng mối quan hệ</label>
              <select
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                className={`${selectClass} w-full`}
              >
                <option value="">-- Chọn --</option>
                {RELATIONSHIP_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {step === 2 && (
          <div className="space-y-3 text-sm">
            <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4 space-y-2">
              {buildBirthday() && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Ngày sinh</span>
                  <span className="text-gray-900 dark:text-gray-100">
                    {birthdayDay}/{birthdayMonth}/{birthdayYear}
                  </span>
                </div>
              )}
              {gender && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Giới tính</span>
                  <span className="text-gray-900 dark:text-gray-100">
                    {gender === 'Khác' && customGender ? customGender : gender}
                  </span>
                </div>
              )}
              {phoneNumber.trim() && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Điện thoại</span>
                  <span className="text-gray-900 dark:text-gray-100">{buildPhone()}</span>
                </div>
              )}
              {bio.trim() && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Tiểu sử</span>
                  <span className="text-gray-900 dark:text-gray-100 text-right max-w-[60%]">
                    {bio}
                  </span>
                </div>
              )}
              {currentCity.trim() && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Thành phố</span>
                  <span className="text-gray-900 dark:text-gray-100">{currentCity}</span>
                </div>
              )}
              {hometown.trim() && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Quê quán</span>
                  <span className="text-gray-900 dark:text-gray-100">{hometown}</span>
                </div>
              )}
              {relationship && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Quan hệ</span>
                  <span className="text-gray-900 dark:text-gray-100">{relationship}</span>
                </div>
              )}
              {!buildBirthday() &&
                !gender &&
                !phoneNumber.trim() &&
                !bio.trim() &&
                !currentCity.trim() &&
                !hometown.trim() &&
                !relationship && (
                  <p className="text-center text-gray-400 dark:text-gray-500 py-2">
                    Bạn chưa nhập thông tin nào. Bạn có thể bổ sung sau trong trang cá nhân.
                  </p>
                )}
            </div>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex justify-between mt-8">
          {step > 0 ? (
            <button
              type="button"
              onClick={back}
              className="px-5 py-2 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-white/20 hover:bg-gray-100 dark:hover:bg-white/10 transition-all"
            >
              Quay lại
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/feed', { replace: true })}
              className="px-5 py-2 rounded-xl text-sm font-medium text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-all"
            >
              Bỏ qua
            </button>
          )}

          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={next}
              className="px-6 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 shadow-lg shadow-cyan-500/25 transition-all"
            >
              Tiếp tục
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 shadow-lg shadow-cyan-500/25 transition-all disabled:opacity-50"
            >
              {saving ? 'Đang lưu...' : 'Hoàn tất'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
