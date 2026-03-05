import { useState, useEffect, useRef, useCallback } from 'react';
import {
  type UserProfile,
  type WorkEntry,
  type EducationEntry,
  type Birthday,
  updateProfileFields,
} from '@/lib/firebase/profile';

// ─── Static suggestion data ────────────────────────────────────────────────

const COMPANY_SUGGESTIONS = [
  // ── Công nghệ thông tin / Phần mềm VN ──
  'FPT Software', 'FPT Corporation', 'FPT Telecom', 'FPT IS',
  'VNG Corporation', 'VNG Cloud', 'Zalo', 'ZaloPay',
  'Viettel', 'Viettel Digital', 'Viettel Solutions', 'Viettel CyberSecurity',
  'VNPT', 'VNPT Technology', 'VNPT-IT',
  'CMC Corporation', 'CMC Telecom', 'CMC Technology & Solutions',
  'TMA Solutions', 'TMA Technology', 'TMA Innovation',
  'KMS Technology', 'KMS Healthcare', 'KMS Solutions',
  'Nashtech', 'Axon Active', 'Logigear', 'Orient Software',
  'SotaTek', 'Rikkeisoft', 'Sun* Inc.', 'Framgia',
  'Base.vn', 'MISA', 'Lạc Việt Computing', 'Bravo Software',
  'VCCorp', 'Vietnamworks', 'Teko Vietnam', 'VHT',
  'Pascal Technology', 'Techbase Vietnam', 'Savvycom', 'Elcom',
  'Harvey Nash Vietnam', 'CyberLogitec Vietnam',
  'Global CyberSoft', 'Fujinet Systems', 'OceanTech', 'SmartDev',
  'Đất Xanh Technology', 'HMS Vietnam',
  'Gameloft Vietnam', 'Gear Inc.', 'Hiker Games', 'Topebox',
  // ── E-commerce / Fintech / Giao vận ──
  'MoMo', 'VNPay', 'Moca', 'ShopeePay', 'AirPay',
  'Tiki', 'Shopee Vietnam', 'Lazada Vietnam', 'Sendo', 'Sapo',
  'Haravan', 'KiotViet', 'POS365',
  'Grab Vietnam', 'Gojek Vietnam', 'Be Group', 'FastGo',
  'Ahamove', 'GHN (Giao Hàng Nhanh)', 'GHTK', 'Viettel Post', 'Vietnam Post',
  // ── Ngân hàng & Tài chính ──
  'Vietcombank', 'BIDV', 'Agribank', 'VietinBank', 'MB Bank',
  'Techcombank', 'VPBank', 'ACB', 'Sacombank', 'HDBank',
  'TPBank', 'MSB', 'OCB', 'SHB', 'SeABank', 'VIB', 'Eximbank',
  'LienVietPostBank', 'Nam A Bank', 'BacABank', 'Bản Việt Bank',
  'Manulife Vietnam', 'Prudential Vietnam', 'AIA Vietnam',
  'Bảo Việt', 'PVI Holdings', 'Bảo hiểm PTI',
  'SSI Securities', 'VPS Securities', 'VCSC', 'HSC Securities',
  // ── Viễn thông ──
  'Mobifone', 'Reddi (Vietnamobile)', 'Indochina Telecom',
  // ── Tập đoàn & Sản xuất ──
  'VinGroup', 'VinHomes', 'VinFast', 'VinCommerce', 'VinBus', 'Vinmec',
  'Vinamilk', 'TH True Milk', 'Masan Group', 'Hòa Phát Group',
  'Trung Nguyên Legend', 'Highlands Coffee', 'Phúc Long Coffee',
  'Biti\'s', 'PetroVietnam (PVN)', 'PVGas', 'PVOil', 'PVFCCo',
  'EVN (Điện lực Việt Nam)', 'Vinacomin', 'Vicem', 'Sabeco', 'Habeco',
  'Unilever Vietnam', 'P&G Vietnam', 'Nestlé Vietnam', 'Abbott Vietnam',
  // ── Bất động sản & Xây dựng ──
  'Novaland', 'Hưng Thịnh Land', 'Phát Đạt', 'Khải Hoàn Land',
  'Nam Long Group', 'Đất Xanh Group', 'Sunshine Homes',
  'Coteccons', 'Hòa Bình Corporation', 'Ricons', 'Delta',
  // ── Bán lẻ & Tiêu dùng ──
  'Thế Giới Di Động (MWG)', 'Điện Máy Xanh', 'FPT Shop', 'Viettel Store',
  'Co.opMart', 'VinMart / WinMart', 'Bách Hóa Xanh', 'Circle K Vietnam', 'GS25 Vietnam',
  'Lotte Mart', 'AEON Vietnam', 'BigC (Central Group)',
  // ── Y tế & Giáo dục ──
  'Bệnh viện Vinmec', 'Bệnh viện Medlatec', 'Bệnh viện Thu Cúc',
  'VUS', 'Anh văn Hội Việt Mỹ', 'Apax English', 'ZIM Academy', 'IELTS Fighter',
  // ── Truyền thông & PR ──
  'VTV', 'VTC', 'HTV', 'VnExpress', 'Báo Tuổi Trẻ', 'Báo Thanh Niên',
  'Kenh14 (VCCorp)', 'Zing.vn', 'Dentsu Vietnam', 'Ogilvy Vietnam',
  // ── Đa quốc gia tại VN ──
  'Intel Products Vietnam', 'Samsung Vietnam (SEV/SEVT)',
  'LG Electronics Vietnam', 'Canon Vietnam', 'Nidec Vietnam',
  'Bosch Vietnam', 'Siemens Vietnam', 'ABB Vietnam',
  'Panasonic Vietnam', 'Fujitsu Vietnam', 'NTT Data Vietnam',
  'Hitachi Vietnam', 'Mitsubishi Vietnam', 'Honda Vietnam', 'Toyota Vietnam',
  'KPMG Vietnam', 'Deloitte Vietnam', 'PwC Vietnam', 'EY Vietnam',
  'McKinsey Vietnam', 'BCG Vietnam', 'Accenture Vietnam',
  // ── Quốc tế (toàn cầu) ──
  'Google', 'Microsoft', 'Meta', 'Apple', 'Amazon', 'Netflix',
  'Spotify', 'TikTok (ByteDance)', 'Alibaba', 'Tencent',
  'Nvidia', 'AMD', 'Intel', 'IBM', 'Oracle', 'SAP', 'Salesforce',
  'Shopify', 'Stripe', 'PayPal', 'Visa', 'Mastercard',
  'Airbnb', 'Uber', 'SpaceX', 'Tesla',
  // ── Khác ──
  'Freelancer / Tự do', 'Tự kinh doanh', 'Startup của riêng tôi',
  'Đang tìm việc', 'Sinh viên / Học sinh', 'Về hưu',
];

const SCHOOL_SUGGESTIONS = [
  // ══ HÀ NỘI & MIỀN BẮC ══
  'Đại học Bách khoa Hà Nội',
  'Đại học Quốc gia Hà Nội',
  'Đại học Khoa học Tự nhiên (ĐHQGHN)',
  'Đại học Khoa học Xã hội và Nhân văn (ĐHQGHN)',
  'Đại học Công nghệ (ĐHQGHN)',
  'Đại học Kinh tế (ĐHQGHN)',
  'Đại học Ngoại ngữ (ĐHQGHN)',
  'Đại học Kinh tế Quốc dân',
  'Đại học Ngoại thương',
  'Đại học Luật Hà Nội',
  'Đại học Sư phạm Hà Nội',
  'Đại học Sư phạm Hà Nội 2',
  'Đại học Giao thông Vận tải',
  'Đại học Xây dựng Hà Nội',
  'Đại học Thủy Lợi',
  'Đại học Y Hà Nội',
  'Đại học Dược Hà Nội',
  'Đại học Y tế Công cộng',
  'Học viện Nông nghiệp Việt Nam',
  'Đại học Lâm nghiệp',
  'Đại học Mỏ - Địa chất',
  'Đại học Điện lực',
  'Đại học Công nghiệp Hà Nội',
  'Đại học Thương mại',
  'Đại học Hà Nội (HANU)',
  'Đại học Kiến trúc Hà Nội',
  'Đại học Mỹ thuật Việt Nam',
  'Học viện Âm nhạc Quốc gia Việt Nam',
  'Đại học Văn hóa Hà Nội',
  // Học viện Hà Nội
  'Học viện Công nghệ Bưu chính Viễn thông (PTIT)',
  'Học viện Kỹ thuật Quân sự',
  'Học viện Hành chính Quốc gia',
  'Học viện Tài chính',
  'Học viện Ngân hàng',
  'Học viện Báo chí và Tuyên truyền',
  'Học viện Ngoại giao',
  'Học viện Cảnh sát Nhân dân',
  'Học viện An ninh Nhân dân',
  // Tư thục Hà Nội
  'Đại học FPT (Hà Nội)',
  'Đại học Thăng Long',
  'Đại học Đại Nam',
  'Đại học Phương Đông',
  'Đại học Kinh doanh và Công nghệ Hà Nội',
  // Miền Bắc khác
  'Đại học Hải Phòng',
  'Đại học Hàng Hải Việt Nam',
  'Đại học Sư phạm Kỹ thuật Hưng Yên',
  'Đại học Công nghiệp Quảng Ninh',
  'Đại học Thái Nguyên',
  'Đại học Kỹ thuật Công nghiệp Thái Nguyên',
  'Đại học Nông Lâm Thái Nguyên',
  'Đại học Vinh',
  'Đại học Sư phạm Kỹ thuật Vinh',
  // ══ TP. HỒ CHÍ MINH & MIỀN NAM ══
  'Đại học Quốc gia TP.HCM',
  'Đại học Bách khoa TP.HCM',
  'Đại học Khoa học Tự nhiên TP.HCM',
  'Đại học Khoa học Xã hội và Nhân văn TP.HCM',
  'Đại học Công nghệ Thông tin TP.HCM',
  'Đại học Quốc tế (ĐHQG TP.HCM)',
  'Đại học Kinh tế - Luật TP.HCM',
  'Đại học Kinh tế TP.HCM (UEH)',
  'Đại học Ngân hàng TP.HCM',
  'Đại học Luật TP.HCM',
  'Đại học Sư phạm TP.HCM',
  'Đại học Sư phạm Kỹ thuật TP.HCM',
  'Đại học Y Dược TP.HCM',
  'Đại học Nông Lâm TP.HCM',
  'Đại học Tôn Đức Thắng',
  'Đại học Mở TP.HCM',
  'Đại học Công nghiệp TP.HCM',
  'Đại học Kiến trúc TP.HCM',
  'Đại học Giao thông Vận tải TP.HCM',
  'Đại học Tài chính - Marketing',
  'Đại học Văn Lang',
  'Đại học Hoa Sen',
  'Đại học Nguyễn Tất Thành',
  'Đại học Gia Định',
  'Đại học Công nghệ Sài Gòn (STU)',
  'Đại học Việt Đức (VGU)',
  'Đại học RMIT Vietnam',
  'Đại học BUV (British University Vietnam)',
  'Đại học FPT (TP.HCM)',
  'Đại học Lạc Hồng',
  'Đại học Thủ Dầu Một',
  'Đại học Bình Dương',
  'Đại học Cần Thơ',
  'Đại học An Giang',
  'Đại học Tiền Giang',
  'Đại học Trà Vinh',
  'Đại học Kiên Giang',
  // ══ ĐÀ NẴNG & MIỀN TRUNG ══
  'Đại học Đà Nẵng',
  'Đại học Bách khoa Đà Nẵng',
  'Đại học Kinh tế Đà Nẵng',
  'Đại học Sư phạm Đà Nẵng',
  'Đại học Ngoại ngữ Đà Nẵng',
  'Đại học Công nghệ Thông tin và Truyền thông Việt Hàn',
  'Đại học FPT (Đà Nẵng)',
  'Đại học Duy Tân',
  'Đại học Đông Á',
  'Đại học Huế',
  'Đại học Khoa học (ĐH Huế)',
  'Đại học Nông Lâm (ĐH Huế)',
  'Đại học Y Dược Huế',
  'Đại học Nha Trang',
  'Đại học Tây Nguyên',
  'Đại học Quy Nhơn',
  'Đại học Phạm Văn Đồng (Quảng Ngãi)',
  // ══ CAO ĐẲNG ══
  'Cao đẳng FPT Polytechnic',
  'Cao đẳng Công nghệ Thủ Đức',
  'Cao đẳng Kỹ thuật Cao Thắng',
  'Cao đẳng Kinh tế TP.HCM',
  'Cao đẳng Công nghệ Thông tin TP.HCM',
  'Cao đẳng Nghề Việt Nam - Hàn Quốc',
  'Cao đẳng Kinh tế - Kỹ thuật Hà Nội',
  'Cao đẳng Cộng đồng Hà Nội',
  // ══ TRUNG HỌC ══
  'THPT Chuyên (các tỉnh)',
  'THPT Hanoi - Amsterdam',
  'THPT Chu Văn An (Hà Nội)',
  'THPT Lê Hồng Phong (TP.HCM)',
  'THPT Chuyên Trần Đại Nghĩa (TP.HCM)',
  'Trường Quốc tế (International School)',
  // ══ QUỐC TẾ ══
  'Harvard University',
  'MIT',
  'Stanford University',
  'UC Berkeley',
  'National University of Singapore (NUS)',
  'Nanyang Technological University (NTU)',
  'RMIT University (Australia)',
  'University of Melbourne',
  'Australian National University (ANU)',
  'Ritsumeikan University',
  'Waseda University',
  'Keio University',
  'Seoul National University',
  'KAIST',
  'Tsinghua University',
  'Peking University',
];

const DEGREE_SUGGESTIONS = [
  // ── Bằng cấp ──
  'Cử nhân', 'Kỹ sư', 'Thạc sĩ', 'Tiến sĩ',
  'Cao đẳng', 'Trung cấp', 'Liên thông Đại học', 'Văn bằng 2',
  // ── CNTT & Kỹ thuật số ──
  'Công nghệ Thông tin', 'Kỹ thuật Phần mềm', 'Khoa học Máy tính',
  'Hệ thống Thông tin', 'Trí tuệ Nhân tạo', 'Khoa học Dữ liệu',
  'An toàn Thông tin (Cyber Security)', 'Mạng Máy tính và Truyền thông',
  'Kỹ thuật Máy tính', 'Internet of Things (IoT)', 'Thiết kế Game',
  'Công nghệ Thông tin (Tiếng Anh)',
  // ── Kỹ thuật ──
  'Kỹ thuật Điện tử Viễn thông', 'Kỹ thuật Điện - Điện tử',
  'Kỹ thuật Điều khiển và Tự động hóa', 'Kỹ thuật Cơ điện tử',
  'Kỹ thuật Cơ khí', 'Kỹ thuật Ô tô', 'Kỹ thuật Hàng không',
  'Kỹ thuật Xây dựng', 'Kỹ thuật Môi trường', 'Kỹ thuật Hóa học',
  'Kỹ thuật Nhiệt', 'Kỹ thuật Dầu khí', 'Kỹ thuật Địa chất',
  'Kỹ thuật Giao thông', 'Kỹ thuật Y sinh',
  // ── Kinh tế & Quản trị ──
  'Quản trị Kinh doanh (BBA)', 'Quản trị Kinh doanh (MBA)',
  'Kinh tế', 'Kinh tế Quốc tế', 'Kinh tế Phát triển',
  'Tài chính - Ngân hàng', 'Tài chính Doanh nghiệp',
  'Kế toán', 'Kiểm toán', 'Kế toán - Kiểm toán',
  'Marketing', 'Quản trị Marketing', 'Digital Marketing',
  'Thương mại Điện tử', 'Kinh doanh Quốc tế',
  'Logistics và Quản lý Chuỗi cung ứng',
  'Quản trị Nhân lực', 'Quản lý Dự án', 'Khởi nghiệp và Đổi mới sáng tạo',
  // ── Luật ──
  'Luật', 'Luật Kinh tế', 'Luật Quốc tế', 'Luật Dân sự',
  'Quản lý Nhà nước', 'Hành chính Công',
  // ── Ngoại ngữ ──
  'Ngôn ngữ Anh', 'Ngôn ngữ Nhật', 'Ngôn ngữ Hàn',
  'Ngôn ngữ Trung', 'Ngôn ngữ Pháp', 'Ngôn ngữ Đức', 'Ngôn ngữ Nga',
  'Biên - Phiên dịch Anh', 'Sư phạm Tiếng Anh',
  // ── Y - Dược ──
  'Y đa khoa', 'Răng Hàm Mặt', 'Y học dự phòng',
  'Điều dưỡng', 'Dược học', 'Y tế Công cộng',
  'Kỹ thuật Xét nghiệm Y học', 'Kỹ thuật Hình ảnh Y học', 'Phục hồi Chức năng',
  // ── Sư phạm ──
  'Sư phạm Toán', 'Sư phạm Vật lý', 'Sư phạm Hóa học',
  'Sư phạm Ngữ văn', 'Sư phạm Lịch sử', 'Sư phạm Địa lý',
  'Giáo dục Tiểu học', 'Giáo dục Mầm non', 'Giáo dục Đặc biệt',
  'Tâm lý Giáo dục', 'Công tác Xã hội', 'Xã hội học', 'Tâm lý học',
  // ── Kiến trúc & Thiết kế ──
  'Kiến trúc', 'Quy hoạch Đô thị',
  'Thiết kế Đồ họa', 'Thiết kế Nội thất',
  'Thiết kế Công nghiệp', 'Thiết kế Thời trang',
  'Mỹ thuật Ứng dụng', 'Nghệ thuật Số',
  // ── Truyền thông ──
  'Báo chí', 'Truyền thông Đa phương tiện',
  'Quan hệ Công chúng (PR)', 'Quảng cáo', 'Xuất bản',
  // ── Nông - Lâm - Ngư ──
  'Nông học', 'Chăn nuôi Thú y', 'Thủy sản', 'Lâm nghiệp',
  'Công nghệ Thực phẩm', 'Công nghệ Sinh học', 'Môi trường',
  // ── Du lịch & Khách sạn ──
  'Quản trị Du lịch - Lữ hành', 'Quản trị Khách sạn',
  'Ẩm thực (Culinary Arts)', 'Quản trị Nhà hàng',
  // ── Khoa học tự nhiên ──
  'Toán học', 'Vật lý', 'Hóa học', 'Sinh học', 'Địa lý',
  'Khoa học Vật liệu', 'Địa chất học',
  // ── Khác ──
  'Thể dục Thể thao', 'Âm nhạc', 'Điện ảnh', 'Sân khấu', 'Khác',
];

// ─── AutocompleteInput component ───────────────────────────────────────────

type SuggestionMode =
  | { type: 'static'; list: string[] }
  | { type: 'location' };          // uses Nominatim OpenStreetMap API

interface AutocompleteInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mode: SuggestionMode;
  className?: string;
  autoFocus?: boolean;
}

function AutocompleteInput({
  value,
  onChange,
  placeholder,
  mode,
  className = '',
  autoFocus,
}: AutocompleteInputProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // ── Close on outside click ──
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Fetch / filter suggestions on input change ──
  const fetchSuggestions = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) { setSuggestions([]); setOpen(false); return; }

    if (mode.type === 'static') {
      const lower = trimmed.toLowerCase();
      const filtered = mode.list
        .filter((s) => s.toLowerCase().includes(lower))
        .slice(0, 8);
      setSuggestions(filtered);
      setOpen(filtered.length > 0);
      setHighlighted(-1);
      return;
    }

    // Location mode — Nominatim
    setLoading(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trimmed)}&addressdetails=1&limit=8&accept-language=vi`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'vi' } });
      const data: Array<{ display_name: string; address?: { city?: string; town?: string; county?: string; state?: string; country?: string } }> = await res.json();
      const items = data.map((item) => {
        const a = item.address ?? {};
        const city = a.city ?? a.town ?? a.county ?? '';
        const state = a.state ?? '';
        const country = a.country ?? '';
        return [city, state, country].filter(Boolean).join(', ');
      }).filter(Boolean);
      const unique = [...new Set(items)].slice(0, 8);
      setSuggestions(unique);
      setOpen(unique.length > 0);
      setHighlighted(-1);
    } catch {
      setSuggestions([]);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }, [mode]);

  const handleChange = (v: string) => {
    onChange(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(v), mode.type === 'location' ? 400 : 100);
  };

  const pick = (s: string) => {
    onChange(s);
    setSuggestions([]);
    setOpen(false);
    setHighlighted(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted((h) => Math.min(h + 1, suggestions.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, 0)); }
    if (e.key === 'Enter' && highlighted >= 0) { e.preventDefault(); pick(suggestions[highlighted]); }
    if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          autoFocus={autoFocus}
          className={`w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-surf-primary/50 placeholder-gray-400 pr-8 ${className}`}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
        />
        {loading && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
            <svg className="w-4 h-4 animate-spin text-surf-primary" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
            </svg>
          </span>
        )}
        {!loading && mode.type === 'location' && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-base pointer-events-none">📍</span>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl overflow-hidden max-h-60 overflow-y-auto">
          {suggestions.map((s, i) => (
            <li key={s}
              onMouseDown={(e) => { e.preventDefault(); pick(s); }}
              className={`flex items-center gap-2.5 px-3 py-2.5 text-sm cursor-pointer transition-colors
                ${i === highlighted
                  ? 'bg-surf-primary/10 text-surf-primary'
                  : 'text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
            >
              <span className="shrink-0 text-base">
                {mode.type === 'location' ? '📍' : mode.list === SCHOOL_SUGGESTIONS ? '🎓' : '🏢'}
              </span>
              <span className="truncate">{s}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── AutocompleteInlineEdit — like InlineEdit but with autocomplete ─────────

function AutocompleteInlineEdit({
  label,
  value,
  onChange,
  placeholder,
  mode,
  maxLength,
  onSave,
  onCancel,
  saving,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mode: SuggestionMode;
  maxLength?: number;
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
}) {
  return (
    <div className="mt-2 rounded-xl border border-surf-primary/30 bg-surf-primary/5 dark:bg-surf-primary/10 p-4 space-y-3">
      <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</label>
      <AutocompleteInput
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        mode={mode}
        autoFocus
      />
      {maxLength && <p className="text-xs text-gray-400 text-right">{value.length}/{maxLength}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel}
          className="px-4 py-1.5 text-sm rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
          Hủy
        </button>
        <button type="button" onClick={onSave} disabled={saving}
          className="px-4 py-1.5 text-sm rounded-xl bg-surf-primary text-white hover:bg-surf-primary/90 disabled:opacity-60 transition-colors font-medium">
          {saving ? 'Đang lưu...' : 'Lưu'}
        </button>
      </div>
    </div>
  );
}

// ─── Types ─────────────────────────────────────────────────────────────────

type Section = 'overview' | 'work_edu' | 'places' | 'contact' | 'basic' | 'life';

interface SectionDef {
  id: Section;
  label: string;
  icon: string;
}

const SECTIONS: SectionDef[] = [
  { id: 'overview', label: 'Tổng quan', icon: '🌊' },
  { id: 'work_edu', label: 'Công việc & Học vấn', icon: '💼' },
  { id: 'places', label: 'Địa điểm', icon: '📍' },
  { id: 'contact', label: 'Liên hệ & Mạng xã hội', icon: '📱' },
  { id: 'basic', label: 'Thông tin cơ bản', icon: '🌐' },
  { id: 'life', label: 'Sự kiện cuộc đời', icon: '⭐' },
];

const RELATIONSHIP_OPTIONS = [
  { value: 'single', label: 'Độc thân' },
  { value: 'in_relationship', label: 'Đang hẹn hò' },
  { value: 'engaged', label: 'Đã đính hôn' },
  { value: 'married', label: 'Đã kết hôn' },
  { value: 'complicated', label: 'Phức tạp' },
  { value: 'separated', label: 'Đã ly thân' },
  { value: 'divorced', label: 'Đã ly hôn' },
  { value: 'widowed', label: 'Góa bụa' },
];

const GENDER_OPTIONS = [
  { value: 'male', label: 'Nam' },
  { value: 'female', label: 'Nữ' },
  { value: 'custom', label: 'Tùy chỉnh' },
];

const LANGUAGE_OPTIONS = [
  'Tiếng Việt', 'English', 'Tiếng Trung', '日本語', '한국어',
  'Français', 'Deutsch', 'Español', 'ภาษาไทย', 'Bahasa Indonesia',
];

const RELIGION_OPTIONS = [
  'Thiên Chúa giáo', 'Phật giáo', 'Hồi giáo', 'Đạo Tin Lành',
  'Ấn Độ giáo', 'Do Thái giáo', 'Không tôn giáo', 'Khác',
];

const POLITICAL_OPTIONS = [
  'Tự do', 'Bảo thủ', 'Ôn hòa', 'Cấp tiến', 'Trung lập', 'Khác',
];

const MONTHS = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
];

// ─── Helpers ───────────────────────────────────────────────────────────────

function relationshipLabel(val?: string | null) {
  return RELATIONSHIP_OPTIONS.find((r) => r.value === val)?.label ?? '';
}

function genderLabel(val?: string | null, custom?: string | null) {
  if (val === 'custom') return custom || 'Tùy chỉnh';
  return GENDER_OPTIONS.find((g) => g.value === val)?.label ?? '';
}

function birthdayLabel(b?: Birthday | null) {
  if (!b) return '';
  const m = MONTHS[b.month - 1] ?? '';
  return b.showYear ? `${b.day} ${m}, ${b.year}` : `${b.day} ${m}`;
}

function formatJoinedAt(ts: any): string {
  if (!ts) return '';
  try {
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('vi-VN', { year: 'numeric', month: 'long' });
  } catch {
    return '';
  }
}

// ─── Reusable sub-components ───────────────────────────────────────────────

function SectionRow({
  icon,
  primary,
  secondary,
  onEdit,
  onDelete,
  isOwn,
}: {
  icon: string;
  primary: string;
  secondary?: string;
  onEdit?: () => void;
  onDelete?: () => void;
  isOwn: boolean;
}) {
  return (
    <div className="group flex items-start gap-3 py-2.5">
      <span className="text-xl mt-0.5 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-snug">{primary}</p>
        {secondary && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{secondary}</p>}
      </div>
      {isOwn && (
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-surf-primary/10 hover:text-surf-primary transition-colors"
              title="Chỉnh sửa"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15.232 5.232l3.536 3.536M9 13l6.293-6.293a1 1 0 011.414 0l1.586 1.586a1 1 0 010 1.414L12 16H9v-3z" />
              </svg>
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-red-50 hover:text-red-500 transition-colors"
              title="Xóa"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 text-sm font-medium text-surf-primary hover:text-surf-primary/80 py-1.5 transition-colors"
    >
      <span className="w-7 h-7 rounded-full bg-surf-primary/10 flex items-center justify-center">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </span>
      {label}
    </button>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-700/60 p-5 shadow-sm">
      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
        <span className="w-1 h-5 rounded-full bg-gradient-to-b from-surf-primary to-surf-secondary shrink-0" />
        {title}
      </h3>
      <div className="divide-y divide-gray-100 dark:divide-gray-800/60">
        {children}
      </div>
    </div>
  );
}

// ─── Inline text edit panel ────────────────────────────────────────────────

function InlineEdit({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  maxLength,
  onSave,
  onCancel,
  saving,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
}) {
  return (
    <div className="mt-2 rounded-xl border border-surf-primary/30 bg-surf-primary/5 dark:bg-surf-primary/10 p-4 space-y-3">
      <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</label>
      {multiline ? (
        <textarea
          className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-gray-100 resize-none focus:outline-none focus:ring-2 focus:ring-surf-primary/50 placeholder-gray-400"
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
        />
      ) : (
        <input
          type="text"
          className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-surf-primary/50 placeholder-gray-400"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
        />
      )}
      {maxLength && (
        <p className="text-xs text-gray-400 text-right">{value.length}/{maxLength}</p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel}
          className="px-4 py-1.5 text-sm rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
          Hủy
        </button>
        <button type="button" onClick={onSave} disabled={saving}
          className="px-4 py-1.5 text-sm rounded-xl bg-surf-primary text-white hover:bg-surf-primary/90 disabled:opacity-60 transition-colors font-medium">
          {saving ? 'Đang lưu...' : 'Lưu'}
        </button>
      </div>
    </div>
  );
}

// ─── Modal wrapper ──────────────────────────────────────────────────────────

function SmallModal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <button type="button" onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

interface ProfileAboutProps {
  uid: string;
  profile: UserProfile;
  loginEmail?: string | null;
  isOwn: boolean;
  onProfileUpdate: (updated: Partial<UserProfile>) => void;
  postsCount: number;
  friendsCount: number;
}

export default function ProfileAbout({
  uid,
  profile,
  loginEmail,
  isOwn,
  onProfileUpdate,
  postsCount,
  friendsCount,
}: ProfileAboutProps) {
  const [activeSection, setActiveSection] = useState<Section>('overview');
  const [saving, setSaving] = useState(false);

  // ── inline edit flags ──
  const [editBio, setEditBio] = useState(false);
  const [editWebsite, setEditWebsite] = useState(false);
  const [editPhone, setEditPhone] = useState(false);
  const [editContactEmail, setEditContactEmail] = useState(false);
  const [editCity, setEditCity] = useState(false);
  const [editHometown, setEditHometown] = useState(false);
  const [editCustomGender, setEditCustomGender] = useState(false);

  // ── draft values ──
  const [bioDraft, setBioDraft] = useState('');
  const [websiteDraft, setWebsiteDraft] = useState('');
  const [phoneDraft, setPhoneDraft] = useState('');
  const [contactEmailDraft, setContactEmailDraft] = useState('');
  const [cityDraft, setCityDraft] = useState('');
  const [hometownDraft, setHometownDraft] = useState('');
  const [customGenderDraft, setCustomGenderDraft] = useState('');

  // ── modal states ──
  const [workModal, setWorkModal] = useState<{ open: boolean; index: number | null }>({ open: false, index: null });
  const [workDraft, setWorkDraft] = useState<WorkEntry>({ company: '', title: '', current: true });

  const [eduModal, setEduModal] = useState<{ open: boolean; index: number | null }>({ open: false, index: null });
  const [eduDraft, setEduDraft] = useState<EducationEntry>({ school: '', degree: '' });

  const [birthdayModal, setBirthdayModal] = useState(false);
  const [bdDraft, setBdDraft] = useState<Birthday>({ day: 1, month: 1, year: 2000, showYear: true });

  const [relationshipModal, setRelationshipModal] = useState(false);
  const [genderModal, setGenderModal] = useState(false);
  const [languageModal, setLanguageModal] = useState(false);
  const [religionModal, setReligionModal] = useState(false);
  const [politicsModal, setPoliticsModal] = useState(false);

  // ── save helper ──
  const save = async (fields: Partial<UserProfile>) => {
    setSaving(true);
    try {
      await updateProfileFields(uid, fields);
      onProfileUpdate(fields);
    } finally {
      setSaving(false);
    }
  };

  // ── convenience ──
  const work = profile.work ?? [];
  const education = profile.education ?? [];
  const languages = profile.languages ?? [];
  const joined = formatJoinedAt(profile.joinedAt);

  // ─── SECTION: Tổng quan ─────────────────────────────────────────────────────

  const OverviewSection = () => (
    <div className="space-y-4">
      {/* Bio */}
      <SectionCard title="Tiểu sử">
        {profile.bio ? (
          <SectionRow
            icon="✍️"
            primary={profile.bio}
            isOwn={isOwn}
            onEdit={() => { setBioDraft(profile.bio ?? ''); setEditBio(true); }}
          />
        ) : isOwn ? (
          <AddButton label="Thêm tiểu sử" onClick={() => { setBioDraft(''); setEditBio(true); }} />
        ) : <p className="text-sm text-gray-400 py-1">Chưa có tiểu sử</p>}
        {editBio && (
          <InlineEdit
            label="Tiểu sử (tối đa 101 ký tự)"
            value={bioDraft}
            onChange={setBioDraft}
            placeholder='Ví dụ: "Student | Love guitar 🎸"'
            multiline
            maxLength={101}
            saving={saving}
            onSave={async () => { await save({ bio: bioDraft.trim() || null }); setEditBio(false); }}
            onCancel={() => setEditBio(false)}
          />
        )}
      </SectionCard>

      {/* Quick overview items */}
      <SectionCard title="Thông tin nổi bật">
        {work[0] && (
          <SectionRow
            icon="💼"
            primary={work[0].title ? `${work[0].title} tại ${work[0].company}` : work[0].company}
            secondary={work[0].current ? 'Đang làm việc' : undefined}
            isOwn={isOwn}
            onEdit={() => { setWorkDraft({ ...work[0] }); setWorkModal({ open: true, index: 0 }); }}
          />
        )}
        {education[0] && (
          <SectionRow
            icon="🎓"
            primary={`Học tại ${education[0].school}`}
            secondary={education[0].degree || undefined}
            isOwn={isOwn}
            onEdit={() => { setEduDraft({ ...education[0] }); setEduModal({ open: true, index: 0 }); }}
          />
        )}
        {profile.currentCity && (
          <SectionRow
            icon="🏙️"
            primary={`Đang sống tại ${profile.currentCity}`}
            isOwn={isOwn}
            onEdit={() => { setCityDraft(profile.currentCity ?? ''); setActiveSection('places'); setTimeout(() => setEditCity(true), 50); }}
          />
        )}
        {profile.hometown && (
          <SectionRow
            icon="🏡"
            primary={`Quê ở ${profile.hometown}`}
            isOwn={isOwn}
            onEdit={() => { setHometownDraft(profile.hometown ?? ''); setActiveSection('places'); setTimeout(() => setEditHometown(true), 50); }}
          />
        )}
        {profile.relationship && (
          <SectionRow
            icon="❤️"
            primary={relationshipLabel(profile.relationship)}
            isOwn={isOwn}
            onEdit={() => setRelationshipModal(true)}
          />
        )}
        {joined && (
          <SectionRow icon="🌊" primary={`Tham gia Surf từ ${joined}`} isOwn={false} />
        )}
        {!work[0] && !education[0] && !profile.currentCity && !profile.hometown && !profile.relationship && !joined && (
          <p className="text-sm text-gray-400 py-1">Chưa có thông tin để hiển thị</p>
        )}
      </SectionCard>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { val: postsCount, label: 'Bài viết', icon: '📝' },
          { val: friendsCount, label: 'Bạn bè', icon: '👥' },
          { val: null, label: 'Người theo dõi', icon: '⭐' },
        ].map(({ val, label, icon }) => (
          <div key={label} className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-700/60 p-4 text-center shadow-sm">
            <p className="text-2xl font-bold text-surf-primary">{val ?? '—'}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{icon} {label}</p>
          </div>
        ))}
      </div>
    </div>
  );

  // ─── SECTION: Công việc & Học vấn ──────────────────────────────────────────

  const WorkEduSection = () => (
    <div className="space-y-4">
      <SectionCard title="Công việc">
        {work.map((w, i) => (
          <SectionRow
            key={i}
            icon="💼"
            primary={w.title ? `${w.title} tại ${w.company}` : w.company}
            secondary={w.current ? 'Đang làm việc' : 'Đã từng làm'}
            isOwn={isOwn}
            onEdit={() => { setWorkDraft({ ...w }); setWorkModal({ open: true, index: i }); }}
            onDelete={async () => {
              const next = work.filter((_, j) => j !== i);
              await save({ work: next });
            }}
          />
        ))}
        {isOwn && (
          <div className="pt-2">
            <AddButton label="Thêm nơi làm việc" onClick={() => {
              setWorkDraft({ company: '', title: '', current: true });
              setWorkModal({ open: true, index: null });
            }} />
          </div>
        )}
        {!isOwn && work.length === 0 && <p className="text-sm text-gray-400 py-1">Chưa có thông tin công việc</p>}
      </SectionCard>

      <SectionCard title="Học vấn">
        {education.map((e, i) => (
          <SectionRow
            key={i}
            icon="🎓"
            primary={e.school}
            secondary={[e.degree, e.year ? `Năm ${e.year}` : undefined].filter(Boolean).join(' · ')}
            isOwn={isOwn}
            onEdit={() => { setEduDraft({ ...e }); setEduModal({ open: true, index: i }); }}
            onDelete={async () => {
              const next = education.filter((_, j) => j !== i);
              await save({ education: next });
            }}
          />
        ))}
        {isOwn && (
          <div className="pt-2">
            <AddButton label="Thêm trường học" onClick={() => {
              setEduDraft({ school: '', degree: '' });
              setEduModal({ open: true, index: null });
            }} />
          </div>
        )}
        {!isOwn && education.length === 0 && <p className="text-sm text-gray-400 py-1">Chưa có thông tin học vấn</p>}
      </SectionCard>
    </div>
  );

  // ─── SECTION: Địa điểm ─────────────────────────────────────────────────────

  const PlacesSection = () => (
    <div className="space-y-4">
      <SectionCard title="Nơi sống">
        {profile.currentCity ? (
          <SectionRow
            icon="🏙️"
            primary={`Đang sống tại ${profile.currentCity}`}
            isOwn={isOwn}
            onEdit={() => { setCityDraft(profile.currentCity ?? ''); setEditCity(false); setTimeout(() => setEditCity(true), 0); }}
            onDelete={async () => { await save({ currentCity: null }); }}
          />
        ) : isOwn ? (
          <AddButton label="Thêm thành phố đang sống" onClick={() => { setCityDraft(''); setEditCity(true); }} />
        ) : <p className="text-sm text-gray-400 py-1">Chưa cập nhật</p>}
        {editCity && (
          <AutocompleteInlineEdit
            label="Thành phố đang sống"
            value={cityDraft}
            onChange={setCityDraft}
            placeholder="Nhập tên thành phố..."
            mode={{ type: 'location' }}
            saving={saving}
            onSave={async () => { await save({ currentCity: cityDraft.trim() || null }); setEditCity(false); }}
            onCancel={() => setEditCity(false)}
          />
        )}
      </SectionCard>

      <SectionCard title="Quê quán">
        {profile.hometown ? (
          <SectionRow
            icon="🏡"
            primary={`Quê ở ${profile.hometown}`}
            isOwn={isOwn}
            onEdit={() => { setHometownDraft(profile.hometown ?? ''); setEditHometown(true); }}
            onDelete={async () => { await save({ hometown: null }); }}
          />
        ) : isOwn ? (
          <AddButton label="Thêm quê quán" onClick={() => { setHometownDraft(''); setEditHometown(true); }} />
        ) : <p className="text-sm text-gray-400 py-1">Chưa cập nhật</p>}
        {editHometown && (
          <AutocompleteInlineEdit
            label="Quê quán"
            value={hometownDraft}
            onChange={setHometownDraft}
            placeholder="Nhập tên tỉnh / thành phố..."
            mode={{ type: 'location' }}
            saving={saving}
            onSave={async () => { await save({ hometown: hometownDraft.trim() || null }); setEditHometown(false); }}
            onCancel={() => setEditHometown(false)}
          />
        )}
      </SectionCard>
    </div>
  );

  // ─── SECTION: Liên hệ ──────────────────────────────────────────────────────

  const ContactSection = () => (
    <div className="space-y-4">
      <SectionCard title="Thông tin liên hệ">
        {/* Email hiển thị mặc định là email đăng nhập */}
        <SectionRow
          icon="📧"
          primary={profile.contactEmail || loginEmail || 'Chưa cập nhật email liên hệ'}
          secondary="Email liên hệ"
          isOwn={isOwn}
          onEdit={() => { setContactEmailDraft(profile.contactEmail ?? loginEmail ?? ''); setEditContactEmail(true); }}
        />
        {editContactEmail && (
          <InlineEdit
            label="Email liên hệ"
            value={contactEmailDraft}
            onChange={setContactEmailDraft}
            placeholder="email@example.com"
            saving={saving}
            onSave={async () => { await save({ contactEmail: contactEmailDraft.trim() || null }); setEditContactEmail(false); }}
            onCancel={() => setEditContactEmail(false)}
          />
        )}

        {profile.phone ? (
          <SectionRow
            icon="📱"
            primary={profile.phone}
            secondary="Số điện thoại"
            isOwn={isOwn}
            onEdit={() => { setPhoneDraft(profile.phone ?? ''); setEditPhone(true); }}
            onDelete={async () => { await save({ phone: null }); }}
          />
        ) : isOwn ? (
          <AddButton label="Thêm số điện thoại" onClick={() => { setPhoneDraft(''); setEditPhone(true); }} />
        ) : null}
        {editPhone && (
          <InlineEdit
            label="Số điện thoại"
            value={phoneDraft}
            onChange={setPhoneDraft}
            placeholder="+84 912 345 678"
            saving={saving}
            onSave={async () => { await save({ phone: phoneDraft.trim() || null }); setEditPhone(false); }}
            onCancel={() => setEditPhone(false)}
          />
        )}

        {profile.website ? (
          <SectionRow
            icon="🌐"
            primary={profile.website}
            secondary="Website cá nhân"
            isOwn={isOwn}
            onEdit={() => { setWebsiteDraft(profile.website ?? ''); setEditWebsite(true); }}
            onDelete={async () => { await save({ website: null }); }}
          />
        ) : isOwn ? (
          <AddButton label="Thêm website cá nhân" onClick={() => { setWebsiteDraft(''); setEditWebsite(true); }} />
        ) : null}
        {editWebsite && (
          <InlineEdit
            label="Website cá nhân"
            value={websiteDraft}
            onChange={setWebsiteDraft}
            placeholder="https://yourwebsite.com"
            saving={saving}
            onSave={async () => { await save({ website: websiteDraft.trim() || null }); setEditWebsite(false); }}
            onCancel={() => setEditWebsite(false)}
          />
        )}

        {!profile.phone && !profile.website && !isOwn && (
          <p className="text-sm text-gray-400 py-1">Không có thêm thông tin liên hệ</p>
        )}
      </SectionCard>
    </div>
  );

  // ─── SECTION: Thông tin cơ bản ─────────────────────────────────────────────

  const BasicSection = () => (
    <div className="space-y-4">
      <SectionCard title="Thông tin cá nhân">
        {/* Birthday */}
        {profile.birthday ? (
          <SectionRow
            icon="🎂"
            primary={birthdayLabel(profile.birthday)}
            secondary="Ngày sinh"
            isOwn={isOwn}
            onEdit={() => { setBdDraft(profile.birthday ?? { day: 1, month: 1, year: 2000, showYear: true }); setBirthdayModal(true); }}
            onDelete={async () => { await save({ birthday: null }); }}
          />
        ) : isOwn ? (
          <AddButton label="Thêm ngày sinh" onClick={() => { setBdDraft({ day: 1, month: 1, year: 2000, showYear: true }); setBirthdayModal(true); }} />
        ) : null}

        {/* Gender */}
        {profile.gender ? (
          <SectionRow
            icon="🪪"
            primary={genderLabel(profile.gender, profile.customGender)}
            secondary="Giới tính"
            isOwn={isOwn}
            onEdit={() => setGenderModal(true)}
            onDelete={async () => { await save({ gender: null, customGender: null }); }}
          />
        ) : isOwn ? (
          <AddButton label="Thêm giới tính" onClick={() => setGenderModal(true)} />
        ) : null}

        {/* Relationship */}
        {profile.relationship ? (
          <SectionRow
            icon="❤️"
            primary={relationshipLabel(profile.relationship)}
            secondary="Tình trạng mối quan hệ"
            isOwn={isOwn}
            onEdit={() => setRelationshipModal(true)}
            onDelete={async () => { await save({ relationship: null }); }}
          />
        ) : isOwn ? (
          <AddButton label="Thêm tình trạng mối quan hệ" onClick={() => setRelationshipModal(true)} />
        ) : null}

        {!profile.birthday && !profile.gender && !profile.relationship && !isOwn && (
          <p className="text-sm text-gray-400 py-1">Chưa cập nhật thông tin cơ bản</p>
        )}
      </SectionCard>

      <SectionCard title="Ngôn ngữ & Tín ngưỡng">
        {/* Languages */}
        {languages.length > 0 ? (
          <SectionRow
            icon="🗣️"
            primary={languages.join(', ')}
            secondary="Ngôn ngữ"
            isOwn={isOwn}
            onEdit={() => setLanguageModal(true)}
          />
        ) : isOwn ? (
          <AddButton label="Thêm ngôn ngữ" onClick={() => setLanguageModal(true)} />
        ) : null}

        {/* Religion */}
        {profile.religion ? (
          <SectionRow
            icon="🕊️"
            primary={profile.religion}
            secondary="Tôn giáo"
            isOwn={isOwn}
            onEdit={() => setReligionModal(true)}
            onDelete={async () => { await save({ religion: null }); }}
          />
        ) : isOwn ? (
          <AddButton label="Thêm tôn giáo (tùy chọn)" onClick={() => setReligionModal(true)} />
        ) : null}

        {/* Political */}
        {profile.politicalViews ? (
          <SectionRow
            icon="🏛️"
            primary={profile.politicalViews}
            secondary="Quan điểm chính trị"
            isOwn={isOwn}
            onEdit={() => setPoliticsModal(true)}
            onDelete={async () => { await save({ politicalViews: null }); }}
          />
        ) : isOwn ? (
          <AddButton label="Thêm quan điểm chính trị (tùy chọn)" onClick={() => setPoliticsModal(true)} />
        ) : null}

        {languages.length === 0 && !profile.religion && !profile.politicalViews && !isOwn && (
          <p className="text-sm text-gray-400 py-1">Chưa cập nhật</p>
        )}
      </SectionCard>
    </div>
  );

  // ─── SECTION: Cuộc đời ─────────────────────────────────────────────────────

  const LifeSection = () => (
    <div className="space-y-4">
      <SectionCard title="Sự kiện cuộc đời">
        {joined && (
          <SectionRow
            icon="🌊"
            primary={`Tham gia Surf vào ${joined}`}
            secondary="Bắt đầu hành trình Surf"
            isOwn={false}
          />
        )}
        {profile.birthday && (
          <SectionRow
            icon="🎂"
            primary={`Sinh nhật: ${birthdayLabel(profile.birthday)}`}
            isOwn={false}
          />
        )}
        {profile.relationship && (
          <SectionRow
            icon="❤️"
            primary={relationshipLabel(profile.relationship)}
            isOwn={false}
          />
        )}
        {!joined && !profile.birthday && !profile.relationship && (
          <p className="text-sm text-gray-400 py-1">Chưa có sự kiện nào</p>
        )}
      </SectionCard>
    </div>
  );

  const sectionMap: Record<Section, React.ReactNode> = {
    overview: <OverviewSection />,
    work_edu: <WorkEduSection />,
    places: <PlacesSection />,
    contact: <ContactSection />,
    basic: <BasicSection />,
    life: <LifeSection />,
  };

  // ─── Modals ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Layout */}
      <div className="flex flex-col md:flex-row gap-4">
        {/* Left nav */}
        <aside className="md:w-56 shrink-0">
          <div className="md:sticky md:top-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-700/60 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Giới thiệu</p>
            </div>
            {/* Mobile: horizontal scroll */}
            <div className="flex md:flex-col overflow-x-auto md:overflow-x-visible p-2 gap-1">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveSection(s.id)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap shrink-0 md:w-full text-left
                    ${activeSection === s.id
                      ? 'bg-surf-primary/10 text-surf-primary dark:bg-surf-primary/20'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                >
                  <span className="text-base">{s.icon}</span>
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Right content */}
        <div className="flex-1 min-w-0 space-y-4">
          {sectionMap[activeSection]}
        </div>
      </div>

      {/* ── Work Modal ── */}
      {workModal.open && (
        <SmallModal
          title={workModal.index !== null ? 'Chỉnh sửa công việc' : 'Thêm nơi làm việc'}
          onClose={() => setWorkModal({ open: false, index: null })}
        >
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Tên công ty *</label>
              <AutocompleteInput
                value={workDraft.company}
                onChange={(v) => setWorkDraft({ ...workDraft, company: v })}
                placeholder="Ví dụ: Google, FPT Software..."
                mode={{ type: 'static', list: COMPANY_SUGGESTIONS }}
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Chức danh</label>
              <input type="text"
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-surf-primary/50"
                placeholder="Ví dụ: Software Developer, Intern..."
                value={workDraft.title}
                onChange={(e) => setWorkDraft({ ...workDraft, title: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="rounded border-gray-300"
                checked={workDraft.current}
                onChange={(e) => setWorkDraft({ ...workDraft, current: e.target.checked })}
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Đang làm việc tại đây</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setWorkModal({ open: false, index: null })}
                className="px-4 py-1.5 text-sm rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 transition-colors">
                Hủy
              </button>
              <button type="button" disabled={!workDraft.company.trim() || saving}
                className="px-4 py-1.5 text-sm rounded-xl bg-surf-primary text-white hover:bg-surf-primary/90 disabled:opacity-60 font-medium transition-colors"
                onClick={async () => {
                  const next = [...work];
                  if (workModal.index !== null) next[workModal.index] = workDraft;
                  else next.push(workDraft);
                  await save({ work: next });
                  setWorkModal({ open: false, index: null });
                }}>
                {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </SmallModal>
      )}

      {/* ── Education Modal ── */}
      {eduModal.open && (
        <SmallModal
          title={eduModal.index !== null ? 'Chỉnh sửa học vấn' : 'Thêm trường học'}
          onClose={() => setEduModal({ open: false, index: null })}
        >
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Tên trường *</label>
              <AutocompleteInput
                value={eduDraft.school}
                onChange={(v) => setEduDraft({ ...eduDraft, school: v })}
                placeholder="Ví dụ: Đại học Bách khoa Hà Nội..."
                mode={{ type: 'static', list: SCHOOL_SUGGESTIONS }}
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Chuyên ngành / Bằng cấp</label>
              <AutocompleteInput
                value={eduDraft.degree}
                onChange={(v) => setEduDraft({ ...eduDraft, degree: v })}
                placeholder="Ví dụ: Kỹ thuật Phần mềm, Tài chính - Ngân hàng..."
                mode={{ type: 'static', list: DEGREE_SUGGESTIONS }}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Năm tốt nghiệp (tuỳ chọn)</label>
              <input type="number"
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-surf-primary/50"
                placeholder="Ví dụ: 2025"
                min={1950} max={2100}
                value={eduDraft.year ?? ''}
                onChange={(e) => setEduDraft({ ...eduDraft, year: e.target.value ? Number(e.target.value) : undefined })}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEduModal({ open: false, index: null })}
                className="px-4 py-1.5 text-sm rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 transition-colors">
                Hủy
              </button>
              <button type="button" disabled={!eduDraft.school.trim() || saving}
                className="px-4 py-1.5 text-sm rounded-xl bg-surf-primary text-white hover:bg-surf-primary/90 disabled:opacity-60 font-medium transition-colors"
                onClick={async () => {
                  const next = [...education];
                  if (eduModal.index !== null) next[eduModal.index] = eduDraft;
                  else next.push(eduDraft);
                  await save({ education: next });
                  setEduModal({ open: false, index: null });
                }}>
                {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </SmallModal>
      )}

      {/* ── Birthday Modal ── */}
      {birthdayModal && (
        <SmallModal title="Ngày sinh" onClose={() => setBirthdayModal(false)}>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Ngày</label>
                <select className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-surf-primary/50"
                  value={bdDraft.day}
                  onChange={(e) => setBdDraft({ ...bdDraft, day: Number(e.target.value) })}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Tháng</label>
                <select className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-surf-primary/50"
                  value={bdDraft.month}
                  onChange={(e) => setBdDraft({ ...bdDraft, month: Number(e.target.value) })}>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Năm</label>
                <select className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-surf-primary/50"
                  value={bdDraft.year}
                  onChange={(e) => setBdDraft({ ...bdDraft, year: Number(e.target.value) })}>
                  {Array.from({ length: 100 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="rounded border-gray-300"
                checked={bdDraft.showYear}
                onChange={(e) => setBdDraft({ ...bdDraft, showYear: e.target.checked })}
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Hiển thị năm sinh</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setBirthdayModal(false)}
                className="px-4 py-1.5 text-sm rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 transition-colors">
                Hủy
              </button>
              <button type="button" disabled={saving}
                className="px-4 py-1.5 text-sm rounded-xl bg-surf-primary text-white hover:bg-surf-primary/90 disabled:opacity-60 font-medium transition-colors"
                onClick={async () => { await save({ birthday: bdDraft }); setBirthdayModal(false); }}>
                {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </SmallModal>
      )}

      {/* ── Relationship Modal ── */}
      {relationshipModal && (
        <SmallModal title="Tình trạng mối quan hệ" onClose={() => setRelationshipModal(false)}>
          <div className="space-y-1.5">
            {RELATIONSHIP_OPTIONS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={async () => { await save({ relationship: r.value }); setRelationshipModal(false); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors text-left
                  ${profile.relationship === r.value
                    ? 'bg-surf-primary/10 text-surf-primary'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
                <span>{r.value === 'single' ? '💔' : r.value === 'married' ? '💍' : r.value === 'engaged' ? '💌' : '❤️'}</span>
                {r.label}
              </button>
            ))}
            {profile.relationship && (
              <button type="button"
                onClick={async () => { await save({ relationship: null }); setRelationshipModal(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-left">
                <span>🚫</span> Xóa tình trạng mối quan hệ
              </button>
            )}
          </div>
        </SmallModal>
      )}

      {/* ── Gender Modal ── */}
      {genderModal && (
        <SmallModal title="Giới tính" onClose={() => setGenderModal(false)}>
          <div className="space-y-1.5">
            {GENDER_OPTIONS.map((g) => (
              <button
                key={g.value}
                type="button"
                onClick={() => {
                  if (g.value !== 'custom') {
                    save({ gender: g.value, customGender: null });
                    setGenderModal(false);
                  } else {
                    setCustomGenderDraft(profile.customGender ?? '');
                    setEditCustomGender(true);
                  }
                }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors text-left
                  ${profile.gender === g.value
                    ? 'bg-surf-primary/10 text-surf-primary'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
                <span>{g.value === 'male' ? '♂️' : g.value === 'female' ? '♀️' : '⚧️'}</span>
                {g.label}
              </button>
            ))}
            {editCustomGender && (
              <InlineEdit
                label="Giới tính tùy chỉnh"
                value={customGenderDraft}
                onChange={setCustomGenderDraft}
                placeholder="Nhập giới tính của bạn..."
                saving={saving}
                onSave={async () => {
                  await save({ gender: 'custom', customGender: customGenderDraft.trim() || null });
                  setEditCustomGender(false);
                  setGenderModal(false);
                }}
                onCancel={() => setEditCustomGender(false)}
              />
            )}
          </div>
        </SmallModal>
      )}

      {/* ── Language Modal ── */}
      {languageModal && (
        <SmallModal title="Ngôn ngữ" onClose={() => setLanguageModal(false)}>
          <div className="space-y-1.5">
            {LANGUAGE_OPTIONS.map((lang) => {
              const selected = languages.includes(lang);
              return (
                <button
                  key={lang}
                  type="button"
                  onClick={() => {
                    const next = selected
                      ? languages.filter((l) => l !== lang)
                      : [...languages, lang];
                    save({ languages: next });
                  }}
                  className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium transition-colors text-left
                    ${selected
                      ? 'bg-surf-primary/10 text-surf-primary'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
                  <span>{lang}</span>
                  {selected && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex justify-end pt-2">
            <button type="button" onClick={() => setLanguageModal(false)}
              className="px-4 py-1.5 text-sm rounded-xl bg-surf-primary text-white hover:bg-surf-primary/90 font-medium transition-colors">
              Xong
            </button>
          </div>
        </SmallModal>
      )}

      {/* ── Religion Modal ── */}
      {religionModal && (
        <SmallModal title="Tôn giáo" onClose={() => setReligionModal(false)}>
          <div className="space-y-1.5">
            {RELIGION_OPTIONS.map((r) => (
              <button key={r} type="button"
                onClick={async () => { await save({ religion: r }); setReligionModal(false); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors text-left
                  ${profile.religion === r ? 'bg-surf-primary/10 text-surf-primary' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
                🕊️ {r}
              </button>
            ))}
          </div>
        </SmallModal>
      )}

      {/* ── Political Views Modal ── */}
      {politicsModal && (
        <SmallModal title="Quan điểm chính trị" onClose={() => setPoliticsModal(false)}>
          <div className="space-y-1.5">
            {POLITICAL_OPTIONS.map((p) => (
              <button key={p} type="button"
                onClick={async () => { await save({ politicalViews: p }); setPoliticsModal(false); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors text-left
                  ${profile.politicalViews === p ? 'bg-surf-primary/10 text-surf-primary' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
                🏛️ {p}
              </button>
            ))}
          </div>
        </SmallModal>
      )}
    </>
  );
}
