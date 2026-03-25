import { useState, useEffect, useRef, useCallback } from 'react';
import {
  type UserProfile,
  type WorkEntry,
  type EducationEntry,
  type Birthday,
  updateProfileFields,
} from '@/lib/firebase/profile';

// ΓöÇΓöÇΓöÇ Static suggestion data ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

const COMPANY_SUGGESTIONS = [
  // ΓöÇΓöÇ C├┤ng nghß╗ç th├┤ng tin / Phß║ºn mß╗üm VN ΓöÇΓöÇ
  'FPT Software',
  'FPT Corporation',
  'FPT Telecom',
  'FPT IS',
  'VNG Corporation',
  'VNG Cloud',
  'Zalo',
  'ZaloPay',
  'Viettel',
  'Viettel Digital',
  'Viettel Solutions',
  'Viettel CyberSecurity',
  'VNPT',
  'VNPT Technology',
  'VNPT-IT',
  'CMC Corporation',
  'CMC Telecom',
  'CMC Technology & Solutions',
  'TMA Solutions',
  'TMA Technology',
  'TMA Innovation',
  'KMS Technology',
  'KMS Healthcare',
  'KMS Solutions',
  'Nashtech',
  'Axon Active',
  'Logigear',
  'Orient Software',
  'SotaTek',
  'Rikkeisoft',
  'Sun* Inc.',
  'Framgia',
  'Base.vn',
  'MISA',
  'Lß║íc Viß╗çt Computing',
  'Bravo Software',
  'VCCorp',
  'Vietnamworks',
  'Teko Vietnam',
  'VHT',
  'Pascal Technology',
  'Techbase Vietnam',
  'Savvycom',
  'Elcom',
  'Harvey Nash Vietnam',
  'CyberLogitec Vietnam',
  'Global CyberSoft',
  'Fujinet Systems',
  'OceanTech',
  'SmartDev',
  '─Éß║Ñt Xanh Technology',
  'HMS Vietnam',
  'Gameloft Vietnam',
  'Gear Inc.',
  'Hiker Games',
  'Topebox',
  // ΓöÇΓöÇ E-commerce / Fintech / Giao vß║¡n ΓöÇΓöÇ
  'MoMo',
  'VNPay',
  'Moca',
  'ShopeePay',
  'AirPay',
  'Tiki',
  'Shopee Vietnam',
  'Lazada Vietnam',
  'Sendo',
  'Sapo',
  'Haravan',
  'KiotViet',
  'POS365',
  'Grab Vietnam',
  'Gojek Vietnam',
  'Be Group',
  'FastGo',
  'Ahamove',
  'GHN (Giao H├áng Nhanh)',
  'GHTK',
  'Viettel Post',
  'Vietnam Post',
  // ΓöÇΓöÇ Ng├ón h├áng & T├ái ch├¡nh ΓöÇΓöÇ
  'Vietcombank',
  'BIDV',
  'Agribank',
  'VietinBank',
  'MB Bank',
  'Techcombank',
  'VPBank',
  'ACB',
  'Sacombank',
  'HDBank',
  'TPBank',
  'MSB',
  'OCB',
  'SHB',
  'SeABank',
  'VIB',
  'Eximbank',
  'LienVietPostBank',
  'Nam A Bank',
  'BacABank',
  'Bß║ún Viß╗çt Bank',
  'Manulife Vietnam',
  'Prudential Vietnam',
  'AIA Vietnam',
  'Bß║úo Viß╗çt',
  'PVI Holdings',
  'Bß║úo hiß╗âm PTI',
  'SSI Securities',
  'VPS Securities',
  'VCSC',
  'HSC Securities',
  // ΓöÇΓöÇ Viß╗àn th├┤ng ΓöÇΓöÇ
  'Mobifone',
  'Reddi (Vietnamobile)',
  'Indochina Telecom',
  // ΓöÇΓöÇ Tß║¡p ─æo├án & Sß║ún xuß║Ñt ΓöÇΓöÇ
  'VinGroup',
  'VinHomes',
  'VinFast',
  'VinCommerce',
  'VinBus',
  'Vinmec',
  'Vinamilk',
  'TH True Milk',
  'Masan Group',
  'H├▓a Ph├ít Group',
  'Trung Nguy├¬n Legend',
  'Highlands Coffee',
  'Ph├║c Long Coffee',
  "Biti's",
  'PetroVietnam (PVN)',
  'PVGas',
  'PVOil',
  'PVFCCo',
  'EVN (─Éiß╗çn lß╗▒c Viß╗çt Nam)',
  'Vinacomin',
  'Vicem',
  'Sabeco',
  'Habeco',
  'Unilever Vietnam',
  'P&G Vietnam',
  'Nestl├⌐ Vietnam',
  'Abbott Vietnam',
  // ΓöÇΓöÇ Bß║Ñt ─æß╗Öng sß║ún & X├óy dß╗▒ng ΓöÇΓöÇ
  'Novaland',
  'H╞░ng Thß╗ïnh Land',
  'Ph├ít ─Éß║ít',
  'Khß║úi Ho├án Land',
  'Nam Long Group',
  '─Éß║Ñt Xanh Group',
  'Sunshine Homes',
  'Coteccons',
  'H├▓a B├¼nh Corporation',
  'Ricons',
  'Delta',
  // ΓöÇΓöÇ B├ín lß║╗ & Ti├¬u d├╣ng ΓöÇΓöÇ
  'Thß║┐ Giß╗¢i Di ─Éß╗Öng (MWG)',
  '─Éiß╗çn M├íy Xanh',
  'FPT Shop',
  'Viettel Store',
  'Co.opMart',
  'VinMart / WinMart',
  'B├ích H├│a Xanh',
  'Circle K Vietnam',
  'GS25 Vietnam',
  'Lotte Mart',
  'AEON Vietnam',
  'BigC (Central Group)',
  // ΓöÇΓöÇ Y tß║┐ & Gi├ío dß╗Ñc ΓöÇΓöÇ
  'Bß╗çnh viß╗çn Vinmec',
  'Bß╗çnh viß╗çn Medlatec',
  'Bß╗çnh viß╗çn Thu C├║c',
  'VUS',
  'Anh v─ân Hß╗Öi Viß╗çt Mß╗╣',
  'Apax English',
  'ZIM Academy',
  'IELTS Fighter',
  // ΓöÇΓöÇ Truyß╗ün th├┤ng & PR ΓöÇΓöÇ
  'VTV',
  'VTC',
  'HTV',
  'VnExpress',
  'B├ío Tuß╗òi Trß║╗',
  'B├ío Thanh Ni├¬n',
  'Kenh14 (VCCorp)',
  'Zing.vn',
  'Dentsu Vietnam',
  'Ogilvy Vietnam',
  // ΓöÇΓöÇ ─Éa quß╗æc gia tß║íi VN ΓöÇΓöÇ
  'Intel Products Vietnam',
  'Samsung Vietnam (SEV/SEVT)',
  'LG Electronics Vietnam',
  'Canon Vietnam',
  'Nidec Vietnam',
  'Bosch Vietnam',
  'Siemens Vietnam',
  'ABB Vietnam',
  'Panasonic Vietnam',
  'Fujitsu Vietnam',
  'NTT Data Vietnam',
  'Hitachi Vietnam',
  'Mitsubishi Vietnam',
  'Honda Vietnam',
  'Toyota Vietnam',
  'KPMG Vietnam',
  'Deloitte Vietnam',
  'PwC Vietnam',
  'EY Vietnam',
  'McKinsey Vietnam',
  'BCG Vietnam',
  'Accenture Vietnam',
  // ΓöÇΓöÇ Quß╗æc tß║┐ (to├án cß║ºu) ΓöÇΓöÇ
  'Google',
  'Microsoft',
  'Meta',
  'Apple',
  'Amazon',
  'Netflix',
  'Spotify',
  'TikTok (ByteDance)',
  'Alibaba',
  'Tencent',
  'Nvidia',
  'AMD',
  'Intel',
  'IBM',
  'Oracle',
  'SAP',
  'Salesforce',
  'Shopify',
  'Stripe',
  'PayPal',
  'Visa',
  'Mastercard',
  'Airbnb',
  'Uber',
  'SpaceX',
  'Tesla',
  // ΓöÇΓöÇ Kh├íc ΓöÇΓöÇ
  'Freelancer / Tß╗▒ do',
  'Tß╗▒ kinh doanh',
  'Startup cß╗ºa ri├¬ng t├┤i',
  '─Éang t├¼m viß╗çc',
  'Sinh vi├¬n / Hß╗ìc sinh',
  'Vß╗ü h╞░u',
];

const SCHOOL_SUGGESTIONS = [
  // ΓòÉΓòÉ H├Ç Nß╗ÿI & MIß╗ÇN Bß║«C ΓòÉΓòÉ
  '─Éß║íi hß╗ìc B├ích khoa H├á Nß╗Öi',
  '─Éß║íi hß╗ìc Quß╗æc gia H├á Nß╗Öi',
  '─Éß║íi hß╗ìc Khoa hß╗ìc Tß╗▒ nhi├¬n (─ÉHQGHN)',
  '─Éß║íi hß╗ìc Khoa hß╗ìc X├ú hß╗Öi v├á Nh├ón v─ân (─ÉHQGHN)',
  '─Éß║íi hß╗ìc C├┤ng nghß╗ç (─ÉHQGHN)',
  '─Éß║íi hß╗ìc Kinh tß║┐ (─ÉHQGHN)',
  '─Éß║íi hß╗ìc Ngoß║íi ngß╗» (─ÉHQGHN)',
  '─Éß║íi hß╗ìc Kinh tß║┐ Quß╗æc d├ón',
  '─Éß║íi hß╗ìc Ngoß║íi th╞░╞íng',
  '─Éß║íi hß╗ìc Luß║¡t H├á Nß╗Öi',
  '─Éß║íi hß╗ìc S╞░ phß║ím H├á Nß╗Öi',
  '─Éß║íi hß╗ìc S╞░ phß║ím H├á Nß╗Öi 2',
  '─Éß║íi hß╗ìc Giao th├┤ng Vß║¡n tß║úi',
  '─Éß║íi hß╗ìc X├óy dß╗▒ng H├á Nß╗Öi',
  '─Éß║íi hß╗ìc Thß╗ºy Lß╗úi',
  '─Éß║íi hß╗ìc Y H├á Nß╗Öi',
  '─Éß║íi hß╗ìc D╞░ß╗úc H├á Nß╗Öi',
  '─Éß║íi hß╗ìc Y tß║┐ C├┤ng cß╗Öng',
  'Hß╗ìc viß╗çn N├┤ng nghiß╗çp Viß╗çt Nam',
  '─Éß║íi hß╗ìc L├óm nghiß╗çp',
  '─Éß║íi hß╗ìc Mß╗Å - ─Éß╗ïa chß║Ñt',
  '─Éß║íi hß╗ìc ─Éiß╗çn lß╗▒c',
  '─Éß║íi hß╗ìc C├┤ng nghiß╗çp H├á Nß╗Öi',
  '─Éß║íi hß╗ìc Th╞░╞íng mß║íi',
  '─Éß║íi hß╗ìc H├á Nß╗Öi (HANU)',
  '─Éß║íi hß╗ìc Kiß║┐n tr├║c H├á Nß╗Öi',
  '─Éß║íi hß╗ìc Mß╗╣ thuß║¡t Viß╗çt Nam',
  'Hß╗ìc viß╗çn ├ém nhß║íc Quß╗æc gia Viß╗çt Nam',
  '─Éß║íi hß╗ìc V─ân h├│a H├á Nß╗Öi',
  // Hß╗ìc viß╗çn H├á Nß╗Öi
  'Hß╗ìc viß╗çn C├┤ng nghß╗ç B╞░u ch├¡nh Viß╗àn th├┤ng (PTIT)',
  'Hß╗ìc viß╗çn Kß╗╣ thuß║¡t Qu├ón sß╗▒',
  'Hß╗ìc viß╗çn H├ánh ch├¡nh Quß╗æc gia',
  'Hß╗ìc viß╗çn T├ái ch├¡nh',
  'Hß╗ìc viß╗çn Ng├ón h├áng',
  'Hß╗ìc viß╗çn B├ío ch├¡ v├á Tuy├¬n truyß╗ün',
  'Hß╗ìc viß╗çn Ngoß║íi giao',
  'Hß╗ìc viß╗çn Cß║únh s├ít Nh├ón d├ón',
  'Hß╗ìc viß╗çn An ninh Nh├ón d├ón',
  // T╞░ thß╗Ñc H├á Nß╗Öi
  '─Éß║íi hß╗ìc FPT (H├á Nß╗Öi)',
  '─Éß║íi hß╗ìc Th─âng Long',
  '─Éß║íi hß╗ìc ─Éß║íi Nam',
  '─Éß║íi hß╗ìc Ph╞░╞íng ─É├┤ng',
  '─Éß║íi hß╗ìc Kinh doanh v├á C├┤ng nghß╗ç H├á Nß╗Öi',
  // Miß╗ün Bß║»c kh├íc
  '─Éß║íi hß╗ìc Hß║úi Ph├▓ng',
  '─Éß║íi hß╗ìc H├áng Hß║úi Viß╗çt Nam',
  '─Éß║íi hß╗ìc S╞░ phß║ím Kß╗╣ thuß║¡t H╞░ng Y├¬n',
  '─Éß║íi hß╗ìc C├┤ng nghiß╗çp Quß║úng Ninh',
  '─Éß║íi hß╗ìc Th├íi Nguy├¬n',
  '─Éß║íi hß╗ìc Kß╗╣ thuß║¡t C├┤ng nghiß╗çp Th├íi Nguy├¬n',
  '─Éß║íi hß╗ìc N├┤ng L├óm Th├íi Nguy├¬n',
  '─Éß║íi hß╗ìc Vinh',
  '─Éß║íi hß╗ìc S╞░ phß║ím Kß╗╣ thuß║¡t Vinh',
  // ΓòÉΓòÉ TP. Hß╗Æ CH├ì MINH & MIß╗ÇN NAM ΓòÉΓòÉ
  '─Éß║íi hß╗ìc Quß╗æc gia TP.HCM',
  '─Éß║íi hß╗ìc B├ích khoa TP.HCM',
  '─Éß║íi hß╗ìc Khoa hß╗ìc Tß╗▒ nhi├¬n TP.HCM',
  '─Éß║íi hß╗ìc Khoa hß╗ìc X├ú hß╗Öi v├á Nh├ón v─ân TP.HCM',
  '─Éß║íi hß╗ìc C├┤ng nghß╗ç Th├┤ng tin TP.HCM',
  '─Éß║íi hß╗ìc Quß╗æc tß║┐ (─ÉHQG TP.HCM)',
  '─Éß║íi hß╗ìc Kinh tß║┐ - Luß║¡t TP.HCM',
  '─Éß║íi hß╗ìc Kinh tß║┐ TP.HCM (UEH)',
  '─Éß║íi hß╗ìc Ng├ón h├áng TP.HCM',
  '─Éß║íi hß╗ìc Luß║¡t TP.HCM',
  '─Éß║íi hß╗ìc S╞░ phß║ím TP.HCM',
  '─Éß║íi hß╗ìc S╞░ phß║ím Kß╗╣ thuß║¡t TP.HCM',
  '─Éß║íi hß╗ìc Y D╞░ß╗úc TP.HCM',
  '─Éß║íi hß╗ìc N├┤ng L├óm TP.HCM',
  '─Éß║íi hß╗ìc T├┤n ─Éß╗⌐c Thß║»ng',
  '─Éß║íi hß╗ìc Mß╗ƒ TP.HCM',
  '─Éß║íi hß╗ìc C├┤ng nghiß╗çp TP.HCM',
  '─Éß║íi hß╗ìc Kiß║┐n tr├║c TP.HCM',
  '─Éß║íi hß╗ìc Giao th├┤ng Vß║¡n tß║úi TP.HCM',
  '─Éß║íi hß╗ìc T├ái ch├¡nh - Marketing',
  '─Éß║íi hß╗ìc V─ân Lang',
  '─Éß║íi hß╗ìc Hoa Sen',
  '─Éß║íi hß╗ìc Nguyß╗àn Tß║Ñt Th├ánh',
  '─Éß║íi hß╗ìc Gia ─Éß╗ïnh',
  '─Éß║íi hß╗ìc C├┤ng nghß╗ç S├ái G├▓n (STU)',
  '─Éß║íi hß╗ìc Viß╗çt ─Éß╗⌐c (VGU)',
  '─Éß║íi hß╗ìc RMIT Vietnam',
  '─Éß║íi hß╗ìc BUV (British University Vietnam)',
  '─Éß║íi hß╗ìc FPT (TP.HCM)',
  '─Éß║íi hß╗ìc Lß║íc Hß╗ông',
  '─Éß║íi hß╗ìc Thß╗º Dß║ºu Mß╗Öt',
  '─Éß║íi hß╗ìc B├¼nh D╞░╞íng',
  '─Éß║íi hß╗ìc Cß║ºn Th╞í',
  '─Éß║íi hß╗ìc An Giang',
  '─Éß║íi hß╗ìc Tiß╗ün Giang',
  '─Éß║íi hß╗ìc Tr├á Vinh',
  '─Éß║íi hß╗ìc Ki├¬n Giang',
  // ΓòÉΓòÉ ─É├Ç Nß║┤NG & MIß╗ÇN TRUNG ΓòÉΓòÉ
  '─Éß║íi hß╗ìc ─É├á Nß║╡ng',
  '─Éß║íi hß╗ìc B├ích khoa ─É├á Nß║╡ng',
  '─Éß║íi hß╗ìc Kinh tß║┐ ─É├á Nß║╡ng',
  '─Éß║íi hß╗ìc S╞░ phß║ím ─É├á Nß║╡ng',
  '─Éß║íi hß╗ìc Ngoß║íi ngß╗» ─É├á Nß║╡ng',
  '─Éß║íi hß╗ìc C├┤ng nghß╗ç Th├┤ng tin v├á Truyß╗ün th├┤ng Viß╗çt H├án',
  '─Éß║íi hß╗ìc FPT (─É├á Nß║╡ng)',
  '─Éß║íi hß╗ìc Duy T├ón',
  '─Éß║íi hß╗ìc ─É├┤ng ├ü',
  '─Éß║íi hß╗ìc Huß║┐',
  '─Éß║íi hß╗ìc Khoa hß╗ìc (─ÉH Huß║┐)',
  '─Éß║íi hß╗ìc N├┤ng L├óm (─ÉH Huß║┐)',
  '─Éß║íi hß╗ìc Y D╞░ß╗úc Huß║┐',
  '─Éß║íi hß╗ìc Nha Trang',
  '─Éß║íi hß╗ìc T├óy Nguy├¬n',
  '─Éß║íi hß╗ìc Quy Nh╞ín',
  '─Éß║íi hß╗ìc Phß║ím V─ân ─Éß╗ông (Quß║úng Ng├úi)',
  // ΓòÉΓòÉ CAO ─Éß║▓NG ΓòÉΓòÉ
  'Cao ─æß║│ng FPT Polytechnic',
  'Cao ─æß║│ng C├┤ng nghß╗ç Thß╗º ─Éß╗⌐c',
  'Cao ─æß║│ng Kß╗╣ thuß║¡t Cao Thß║»ng',
  'Cao ─æß║│ng Kinh tß║┐ TP.HCM',
  'Cao ─æß║│ng C├┤ng nghß╗ç Th├┤ng tin TP.HCM',
  'Cao ─æß║│ng Nghß╗ü Viß╗çt Nam - H├án Quß╗æc',
  'Cao ─æß║│ng Kinh tß║┐ - Kß╗╣ thuß║¡t H├á Nß╗Öi',
  'Cao ─æß║│ng Cß╗Öng ─æß╗ông H├á Nß╗Öi',
  // ΓòÉΓòÉ TRUNG Hß╗îC ΓòÉΓòÉ
  'THPT Chuy├¬n (c├íc tß╗ënh)',
  'THPT Hanoi - Amsterdam',
  'THPT Chu V─ân An (H├á Nß╗Öi)',
  'THPT L├¬ Hß╗ông Phong (TP.HCM)',
  'THPT Chuy├¬n Trß║ºn ─Éß║íi Ngh─⌐a (TP.HCM)',
  'Tr╞░ß╗¥ng Quß╗æc tß║┐ (International School)',
  // ΓòÉΓòÉ QUß╗ÉC Tß║╛ ΓòÉΓòÉ
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
  // ΓöÇΓöÇ Bß║▒ng cß║Ñp ΓöÇΓöÇ
  'Cß╗¡ nh├ón',
  'Kß╗╣ s╞░',
  'Thß║íc s─⌐',
  'Tiß║┐n s─⌐',
  'Cao ─æß║│ng',
  'Trung cß║Ñp',
  'Li├¬n th├┤ng ─Éß║íi hß╗ìc',
  'V─ân bß║▒ng 2',
  // ΓöÇΓöÇ CNTT & Kß╗╣ thuß║¡t sß╗æ ΓöÇΓöÇ
  'C├┤ng nghß╗ç Th├┤ng tin',
  'Kß╗╣ thuß║¡t Phß║ºn mß╗üm',
  'Khoa hß╗ìc M├íy t├¡nh',
  'Hß╗ç thß╗æng Th├┤ng tin',
  'Tr├¡ tuß╗ç Nh├ón tß║ío',
  'Khoa hß╗ìc Dß╗» liß╗çu',
  'An to├án Th├┤ng tin (Cyber Security)',
  'Mß║íng M├íy t├¡nh v├á Truyß╗ün th├┤ng',
  'Kß╗╣ thuß║¡t M├íy t├¡nh',
  'Internet of Things (IoT)',
  'Thiß║┐t kß║┐ Game',
  'C├┤ng nghß╗ç Th├┤ng tin (Tiß║┐ng Anh)',
  // ΓöÇΓöÇ Kß╗╣ thuß║¡t ΓöÇΓöÇ
  'Kß╗╣ thuß║¡t ─Éiß╗çn tß╗¡ Viß╗àn th├┤ng',
  'Kß╗╣ thuß║¡t ─Éiß╗çn - ─Éiß╗çn tß╗¡',
  'Kß╗╣ thuß║¡t ─Éiß╗üu khiß╗ân v├á Tß╗▒ ─æß╗Öng h├│a',
  'Kß╗╣ thuß║¡t C╞í ─æiß╗çn tß╗¡',
  'Kß╗╣ thuß║¡t C╞í kh├¡',
  'Kß╗╣ thuß║¡t ├ö t├┤',
  'Kß╗╣ thuß║¡t H├áng kh├┤ng',
  'Kß╗╣ thuß║¡t X├óy dß╗▒ng',
  'Kß╗╣ thuß║¡t M├┤i tr╞░ß╗¥ng',
  'Kß╗╣ thuß║¡t H├│a hß╗ìc',
  'Kß╗╣ thuß║¡t Nhiß╗çt',
  'Kß╗╣ thuß║¡t Dß║ºu kh├¡',
  'Kß╗╣ thuß║¡t ─Éß╗ïa chß║Ñt',
  'Kß╗╣ thuß║¡t Giao th├┤ng',
  'Kß╗╣ thuß║¡t Y sinh',
  // ΓöÇΓöÇ Kinh tß║┐ & Quß║ún trß╗ï ΓöÇΓöÇ
  'Quß║ún trß╗ï Kinh doanh (BBA)',
  'Quß║ún trß╗ï Kinh doanh (MBA)',
  'Kinh tß║┐',
  'Kinh tß║┐ Quß╗æc tß║┐',
  'Kinh tß║┐ Ph├ít triß╗ân',
  'T├ái ch├¡nh - Ng├ón h├áng',
  'T├ái ch├¡nh Doanh nghiß╗çp',
  'Kß║┐ to├ín',
  'Kiß╗âm to├ín',
  'Kß║┐ to├ín - Kiß╗âm to├ín',
  'Marketing',
  'Quß║ún trß╗ï Marketing',
  'Digital Marketing',
  'Th╞░╞íng mß║íi ─Éiß╗çn tß╗¡',
  'Kinh doanh Quß╗æc tß║┐',
  'Logistics v├á Quß║ún l├╜ Chuß╗ùi cung ß╗⌐ng',
  'Quß║ún trß╗ï Nh├ón lß╗▒c',
  'Quß║ún l├╜ Dß╗▒ ├ín',
  'Khß╗ƒi nghiß╗çp v├á ─Éß╗òi mß╗¢i s├íng tß║ío',
  // ΓöÇΓöÇ Luß║¡t ΓöÇΓöÇ
  'Luß║¡t',
  'Luß║¡t Kinh tß║┐',
  'Luß║¡t Quß╗æc tß║┐',
  'Luß║¡t D├ón sß╗▒',
  'Quß║ún l├╜ Nh├á n╞░ß╗¢c',
  'H├ánh ch├¡nh C├┤ng',
  // ΓöÇΓöÇ Ngoß║íi ngß╗» ΓöÇΓöÇ
  'Ng├┤n ngß╗» Anh',
  'Ng├┤n ngß╗» Nhß║¡t',
  'Ng├┤n ngß╗» H├án',
  'Ng├┤n ngß╗» Trung',
  'Ng├┤n ngß╗» Ph├íp',
  'Ng├┤n ngß╗» ─Éß╗⌐c',
  'Ng├┤n ngß╗» Nga',
  'Bi├¬n - Phi├¬n dß╗ïch Anh',
  'S╞░ phß║ím Tiß║┐ng Anh',
  // ΓöÇΓöÇ Y - D╞░ß╗úc ΓöÇΓöÇ
  'Y ─æa khoa',
  'R─âng H├ám Mß║╖t',
  'Y hß╗ìc dß╗▒ ph├▓ng',
  '─Éiß╗üu d╞░ß╗íng',
  'D╞░ß╗úc hß╗ìc',
  'Y tß║┐ C├┤ng cß╗Öng',
  'Kß╗╣ thuß║¡t X├⌐t nghiß╗çm Y hß╗ìc',
  'Kß╗╣ thuß║¡t H├¼nh ß║únh Y hß╗ìc',
  'Phß╗Ñc hß╗ôi Chß╗⌐c n─âng',
  // ΓöÇΓöÇ S╞░ phß║ím ΓöÇΓöÇ
  'S╞░ phß║ím To├ín',
  'S╞░ phß║ím Vß║¡t l├╜',
  'S╞░ phß║ím H├│a hß╗ìc',
  'S╞░ phß║ím Ngß╗» v─ân',
  'S╞░ phß║ím Lß╗ïch sß╗¡',
  'S╞░ phß║ím ─Éß╗ïa l├╜',
  'Gi├ío dß╗Ñc Tiß╗âu hß╗ìc',
  'Gi├ío dß╗Ñc Mß║ºm non',
  'Gi├ío dß╗Ñc ─Éß║╖c biß╗çt',
  'T├óm l├╜ Gi├ío dß╗Ñc',
  'C├┤ng t├íc X├ú hß╗Öi',
  'X├ú hß╗Öi hß╗ìc',
  'T├óm l├╜ hß╗ìc',
  // ΓöÇΓöÇ Kiß║┐n tr├║c & Thiß║┐t kß║┐ ΓöÇΓöÇ
  'Kiß║┐n tr├║c',
  'Quy hoß║ích ─É├┤ thß╗ï',
  'Thiß║┐t kß║┐ ─Éß╗ô hß╗ìa',
  'Thiß║┐t kß║┐ Nß╗Öi thß║Ñt',
  'Thiß║┐t kß║┐ C├┤ng nghiß╗çp',
  'Thiß║┐t kß║┐ Thß╗¥i trang',
  'Mß╗╣ thuß║¡t ß╗¿ng dß╗Ñng',
  'Nghß╗ç thuß║¡t Sß╗æ',
  // ΓöÇΓöÇ Truyß╗ün th├┤ng ΓöÇΓöÇ
  'B├ío ch├¡',
  'Truyß╗ün th├┤ng ─Éa ph╞░╞íng tiß╗çn',
  'Quan hß╗ç C├┤ng ch├║ng (PR)',
  'Quß║úng c├ío',
  'Xuß║Ñt bß║ún',
  // ΓöÇΓöÇ N├┤ng - L├óm - Ng╞░ ΓöÇΓöÇ
  'N├┤ng hß╗ìc',
  'Ch─ân nu├┤i Th├║ y',
  'Thß╗ºy sß║ún',
  'L├óm nghiß╗çp',
  'C├┤ng nghß╗ç Thß╗▒c phß║⌐m',
  'C├┤ng nghß╗ç Sinh hß╗ìc',
  'M├┤i tr╞░ß╗¥ng',
  // ΓöÇΓöÇ Du lß╗ïch & Kh├ích sß║ín ΓöÇΓöÇ
  'Quß║ún trß╗ï Du lß╗ïch - Lß╗» h├ánh',
  'Quß║ún trß╗ï Kh├ích sß║ín',
  'ß║¿m thß╗▒c (Culinary Arts)',
  'Quß║ún trß╗ï Nh├á h├áng',
  // ΓöÇΓöÇ Khoa hß╗ìc tß╗▒ nhi├¬n ΓöÇΓöÇ
  'To├ín hß╗ìc',
  'Vß║¡t l├╜',
  'H├│a hß╗ìc',
  'Sinh hß╗ìc',
  '─Éß╗ïa l├╜',
  'Khoa hß╗ìc Vß║¡t liß╗çu',
  '─Éß╗ïa chß║Ñt hß╗ìc',
  // ΓöÇΓöÇ Kh├íc ΓöÇΓöÇ
  'Thß╗â dß╗Ñc Thß╗â thao',
  '├ém nhß║íc',
  '─Éiß╗çn ß║únh',
  'S├ón khß║Ñu',
  'Kh├íc',
];

// ΓöÇΓöÇΓöÇ AutocompleteInput component ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

type SuggestionMode = { type: 'static'; list: string[] } | { type: 'location' }; // uses Nominatim OpenStreetMap API

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

  // ΓöÇΓöÇ Close on outside click ΓöÇΓöÇ
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ΓöÇΓöÇ Fetch / filter suggestions on input change ΓöÇΓöÇ
  const fetchSuggestions = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < 2) {
        setSuggestions([]);
        setOpen(false);
        return;
      }

      if (mode.type === 'static') {
        const lower = trimmed.toLowerCase();
        const filtered = mode.list.filter((s) => s.toLowerCase().includes(lower)).slice(0, 8);
        setSuggestions(filtered);
        setOpen(filtered.length > 0);
        setHighlighted(-1);
        return;
      }

      // Location mode ΓÇö Nominatim
      setLoading(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trimmed)}&addressdetails=1&limit=8&accept-language=vi`;
        const res = await fetch(url, { headers: { 'Accept-Language': 'vi' } });
        const data: Array<{
          display_name: string;
          address?: {
            city?: string;
            town?: string;
            county?: string;
            state?: string;
            country?: string;
          };
        }> = await res.json();
        const items = data
          .map((item) => {
            const a = item.address ?? {};
            const city = a.city ?? a.town ?? a.county ?? '';
            const state = a.state ?? '';
            const country = a.country ?? '';
            return [city, state, country].filter(Boolean).join(', ');
          })
          .filter(Boolean);
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
    },
    [mode]
  );

  const handleChange = (v: string) => {
    onChange(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => fetchSuggestions(v),
      mode.type === 'location' ? 400 : 100
    );
  };

  const pick = (s: string) => {
    onChange(s);
    setSuggestions([]);
    setOpen(false);
    setHighlighted(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, suggestions.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    }
    if (e.key === 'Enter' && highlighted >= 0) {
      e.preventDefault();
      pick(suggestions[highlighted]);
    }
    if (e.key === 'Escape') {
      setOpen(false);
    }
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
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"
              />
            </svg>
          </span>
        )}
        {!loading && mode.type === 'location' && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-base pointer-events-none">
            ≡ƒôì
          </span>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl overflow-hidden max-h-60 overflow-y-auto">
          {suggestions.map((s, i) => (
            <li
              key={s}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              className={`flex items-center gap-2.5 px-3 py-2.5 text-sm cursor-pointer transition-colors
                ${
                  i === highlighted
                    ? 'bg-surf-primary/10 text-surf-primary'
                    : 'text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
            >
              <span className="shrink-0 text-base">
                {mode.type === 'location' ? '≡ƒôì' : mode.list === SCHOOL_SUGGESTIONS ? '≡ƒÄô' : '≡ƒÅó'}
              </span>
              <span className="truncate">{s}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ΓöÇΓöÇΓöÇ AutocompleteInlineEdit ΓÇö like InlineEdit but with autocomplete ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

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
      <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        {label}
      </label>
      <AutocompleteInput
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        mode={mode}
        autoFocus
      />
      {maxLength && (
        <p className="text-xs text-gray-400 text-right">
          {value.length}/{maxLength}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-1.5 text-sm rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          Hß╗ºy
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="px-4 py-1.5 text-sm rounded-xl bg-surf-primary text-white hover:bg-surf-primary/90 disabled:opacity-60 transition-colors font-medium"
        >
          {saving ? '─Éang l╞░u...' : 'L╞░u'}
        </button>
      </div>
    </div>
  );
}

// ΓöÇΓöÇΓöÇ Types ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

type Section = 'overview' | 'work_edu' | 'places' | 'contact' | 'basic' | 'life';

interface SectionDef {
  id: Section;
  label: string;
  icon: string;
}

const SECTIONS: SectionDef[] = [
  { id: 'overview', label: 'Tß╗òng quan', icon: '≡ƒîè' },
  { id: 'work_edu', label: 'C├┤ng viß╗çc & Hß╗ìc vß║Ñn', icon: '≡ƒÆ╝' },
  { id: 'places', label: '─Éß╗ïa ─æiß╗âm', icon: '≡ƒôì' },
  { id: 'contact', label: 'Li├¬n hß╗ç & Mß║íng x├ú hß╗Öi', icon: '≡ƒô▒' },
  { id: 'basic', label: 'Th├┤ng tin c╞í bß║ún', icon: '≡ƒîÉ' },
  { id: 'life', label: 'Sß╗▒ kiß╗çn cuß╗Öc ─æß╗¥i', icon: 'Γ¡É' },
];

const RELATIONSHIP_OPTIONS = [
  { value: 'single', label: '─Éß╗Öc th├ón' },
  { value: 'in_relationship', label: '─Éang hß║╣n h├▓' },
  { value: 'engaged', label: '─É├ú ─æ├¡nh h├┤n' },
  { value: 'married', label: '─É├ú kß║┐t h├┤n' },
  { value: 'complicated', label: 'Phß╗⌐c tß║íp' },
  { value: 'separated', label: '─É├ú ly th├ón' },
  { value: 'divorced', label: '─É├ú ly h├┤n' },
  { value: 'widowed', label: 'G├│a bß╗Ña' },
];

const GENDER_OPTIONS = [
  { value: 'male', label: 'Nam' },
  { value: 'female', label: 'Nß╗»' },
  { value: 'custom', label: 'T├╣y chß╗ënh' },
];

const LANGUAGE_OPTIONS = [
  'Tiß║┐ng Viß╗çt',
  'English',
  'Tiß║┐ng Trung',
  'µùÑµ£¼Φ¬₧',
  'φò£Ω╡¡∞û┤',
  'Fran├ºais',
  'Deutsch',
  'Espa├▒ol',
  'α╕áα╕▓α╕⌐α╕▓α╣äα╕ùα╕ó',
  'Bahasa Indonesia',
];

const RELIGION_OPTIONS = [
  'Thi├¬n Ch├║a gi├ío',
  'Phß║¡t gi├ío',
  'Hß╗ôi gi├ío',
  '─Éß║ío Tin L├ánh',
  'ß║ñn ─Éß╗Ö gi├ío',
  'Do Th├íi gi├ío',
  'Kh├┤ng t├┤n gi├ío',
  'Kh├íc',
];

const POLITICAL_OPTIONS = ['Tß╗▒ do', 'Bß║úo thß╗º', '├ön h├▓a', 'Cß║Ñp tiß║┐n', 'Trung lß║¡p', 'Kh├íc'];

const MONTHS = [
  'Th├íng 1',
  'Th├íng 2',
  'Th├íng 3',
  'Th├íng 4',
  'Th├íng 5',
  'Th├íng 6',
  'Th├íng 7',
  'Th├íng 8',
  'Th├íng 9',
  'Th├íng 10',
  'Th├íng 11',
  'Th├íng 12',
];

// ΓöÇΓöÇΓöÇ Helpers ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

function relationshipLabel(val?: string | null) {
  return RELATIONSHIP_OPTIONS.find((r) => r.value === val)?.label ?? '';
}

function genderLabel(val?: string | null, custom?: string | null) {
  if (val === 'custom') return custom || 'T├╣y chß╗ënh';
  return GENDER_OPTIONS.find((g) => g.value === val)?.label ?? '';
}

function birthdayLabel(b?: Birthday | null) {
  if (!b) return '';
  const m = MONTHS[b.month - 1] ?? '';
  return b.showYear ? `${b.day} ${m}, ${b.year}` : `${b.day} ${m}`;
}

function formatJoinedAt(
  ts:
    | import('firebase/firestore').Timestamp
    | { toDate?: () => Date }
    | { _seconds: number; _nanoseconds: number }
    | string
    | number
    | null
    | undefined
): string {
  if (!ts) return '';
  try {
    if (typeof ts === 'object' && 'toDate' in ts && typeof (ts as { toDate?: unknown }).toDate === 'function') {
      return (ts as import('firebase/firestore').Timestamp).toDate().toLocaleDateString('vi-VN', { year: 'numeric', month: 'long' });
    }
    if (typeof ts === 'object' && '_seconds' in ts) {
      return new Date((ts as { _seconds: number })._seconds * 1000).toLocaleDateString('vi-VN', { year: 'numeric', month: 'long' });
    }
    const d = new Date(ts as string | number);
    return d.toLocaleDateString('vi-VN', { year: 'numeric', month: 'long' });
  } catch {
    return '';
  }
}

// ΓöÇΓöÇΓöÇ Reusable sub-components ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

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
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-snug">
          {primary}
        </p>
        {secondary && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{secondary}</p>
        )}
      </div>
      {isOwn && (
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-surf-primary/10 hover:text-surf-primary transition-colors"
              title="Chß╗ënh sß╗¡a"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.232 5.232l3.536 3.536M9 13l6.293-6.293a1 1 0 011.414 0l1.586 1.586a1 1 0 010 1.414L12 16H9v-3z"
                />
              </svg>
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-red-50 hover:text-red-500 transition-colors"
              title="X├│a"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
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

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-700/60 p-5 shadow-sm">
      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
        <span className="w-1 h-5 rounded-full bg-gradient-to-b from-surf-primary to-surf-secondary shrink-0" />
        {title}
      </h3>
      <div className="divide-y divide-gray-100 dark:divide-gray-800/60">{children}</div>
    </div>
  );
}

// ΓöÇΓöÇΓöÇ Inline text edit panel ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

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
      <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        {label}
      </label>
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
        <p className="text-xs text-gray-400 text-right">
          {value.length}/{maxLength}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-1.5 text-sm rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          Hß╗ºy
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="px-4 py-1.5 text-sm rounded-xl bg-surf-primary text-white hover:bg-surf-primary/90 disabled:opacity-60 transition-colors font-medium"
        >
          {saving ? '─Éang l╞░u...' : 'L╞░u'}
        </button>
      </div>
    </div>
  );
}

// ΓöÇΓöÇΓöÇ Modal wrapper ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

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
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

// ΓöÇΓöÇΓöÇ Main Component ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

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

  // ΓöÇΓöÇ inline edit flags ΓöÇΓöÇ
  const [editBio, setEditBio] = useState(false);
  const [editWebsite, setEditWebsite] = useState(false);
  const [editPhone, setEditPhone] = useState(false);
  const [editContactEmail, setEditContactEmail] = useState(false);
  const [editCity, setEditCity] = useState(false);
  const [editHometown, setEditHometown] = useState(false);
  const [editCustomGender, setEditCustomGender] = useState(false);

  // ΓöÇΓöÇ draft values ΓöÇΓöÇ
  const [bioDraft, setBioDraft] = useState('');
  const [websiteDraft, setWebsiteDraft] = useState('');
  const [phoneDraft, setPhoneDraft] = useState('');
  const [contactEmailDraft, setContactEmailDraft] = useState('');
  const [cityDraft, setCityDraft] = useState('');
  const [hometownDraft, setHometownDraft] = useState('');
  const [customGenderDraft, setCustomGenderDraft] = useState('');

  // ΓöÇΓöÇ modal states ΓöÇΓöÇ
  const [workModal, setWorkModal] = useState<{ open: boolean; index: number | null }>({
    open: false,
    index: null,
  });
  const [workDraft, setWorkDraft] = useState<WorkEntry>({ company: '', title: '', current: true });

  const [eduModal, setEduModal] = useState<{ open: boolean; index: number | null }>({
    open: false,
    index: null,
  });
  const [eduDraft, setEduDraft] = useState<EducationEntry>({ school: '', degree: '' });

  const [birthdayModal, setBirthdayModal] = useState(false);
  const [bdDraft, setBdDraft] = useState<Birthday>({
    day: 1,
    month: 1,
    year: 2000,
    showYear: true,
  });

  const [relationshipModal, setRelationshipModal] = useState(false);
  const [genderModal, setGenderModal] = useState(false);
  const [languageModal, setLanguageModal] = useState(false);
  const [religionModal, setReligionModal] = useState(false);
  const [politicsModal, setPoliticsModal] = useState(false);

  // ΓöÇΓöÇ save helper ΓöÇΓöÇ
  const save = async (fields: Partial<UserProfile>) => {
    setSaving(true);
    try {
      await updateProfileFields(uid, fields);
      onProfileUpdate(fields);
    } finally {
      setSaving(false);
    }
  };

  // ΓöÇΓöÇ convenience ΓöÇΓöÇ
  const work = profile.work ?? [];
  const education = profile.education ?? [];
  const languages = profile.languages ?? [];
  const joined = formatJoinedAt(profile.joinedAt);

  // ΓöÇΓöÇΓöÇ SECTION: Tß╗òng quan ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

  const OverviewSection = () => (
    <div className="space-y-4">
      {/* Bio */}
      <SectionCard title="Tiß╗âu sß╗¡">
        {profile.bio ? (
          <SectionRow
            icon="Γ£ì∩╕Å"
            primary={profile.bio}
            isOwn={isOwn}
            onEdit={() => {
              setBioDraft(profile.bio ?? '');
              setEditBio(true);
            }}
          />
        ) : isOwn ? (
          <AddButton
            label="Th├¬m tiß╗âu sß╗¡"
            onClick={() => {
              setBioDraft('');
              setEditBio(true);
            }}
          />
        ) : (
          <p className="text-sm text-gray-400 py-1">Ch╞░a c├│ tiß╗âu sß╗¡</p>
        )}
        {editBio && (
          <InlineEdit
            label="Tiß╗âu sß╗¡ (tß╗æi ─æa 101 k├╜ tß╗▒)"
            value={bioDraft}
            onChange={setBioDraft}
            placeholder='V├¡ dß╗Ñ: "Student | Love guitar ≡ƒÄ╕"'
            multiline
            maxLength={101}
            saving={saving}
            onSave={async () => {
              await save({ bio: bioDraft.trim() || null });
              setEditBio(false);
            }}
            onCancel={() => setEditBio(false)}
          />
        )}
      </SectionCard>

      {/* Quick overview items */}
      <SectionCard title="Th├┤ng tin nß╗òi bß║¡t">
        {work[0] && (
          <SectionRow
            icon="≡ƒÆ╝"
            primary={work[0].title ? `${work[0].title} tß║íi ${work[0].company}` : work[0].company}
            secondary={work[0].current ? '─Éang l├ám viß╗çc' : undefined}
            isOwn={isOwn}
            onEdit={() => {
              setWorkDraft({ ...work[0] });
              setWorkModal({ open: true, index: 0 });
            }}
          />
        )}
        {education[0] && (
          <SectionRow
            icon="≡ƒÄô"
            primary={`Hß╗ìc tß║íi ${education[0].school}`}
            secondary={education[0].degree || undefined}
            isOwn={isOwn}
            onEdit={() => {
              setEduDraft({ ...education[0] });
              setEduModal({ open: true, index: 0 });
            }}
          />
        )}
        {profile.currentCity && (
          <SectionRow
            icon="≡ƒÅÖ∩╕Å"
            primary={`─Éang sß╗æng tß║íi ${profile.currentCity}`}
            isOwn={isOwn}
            onEdit={() => {
              setCityDraft(profile.currentCity ?? '');
              setActiveSection('places');
              setTimeout(() => setEditCity(true), 50);
            }}
          />
        )}
        {profile.hometown && (
          <SectionRow
            icon="≡ƒÅí"
            primary={`Qu├¬ ß╗ƒ ${profile.hometown}`}
            isOwn={isOwn}
            onEdit={() => {
              setHometownDraft(profile.hometown ?? '');
              setActiveSection('places');
              setTimeout(() => setEditHometown(true), 50);
            }}
          />
        )}
        {profile.relationship && (
          <SectionRow
            icon="Γ¥ñ∩╕Å"
            primary={relationshipLabel(profile.relationship)}
            isOwn={isOwn}
            onEdit={() => setRelationshipModal(true)}
          />
        )}
        {joined && <SectionRow icon="≡ƒîè" primary={`Tham gia Surf tß╗½ ${joined}`} isOwn={false} />}
        {!work[0] &&
          !education[0] &&
          !profile.currentCity &&
          !profile.hometown &&
          !profile.relationship &&
          !joined && <p className="text-sm text-gray-400 py-1">Ch╞░a c├│ th├┤ng tin ─æß╗â hiß╗ân thß╗ï</p>}
      </SectionCard>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { val: postsCount, label: 'B├ái viß║┐t', icon: '≡ƒô¥' },
          { val: friendsCount, label: 'Bß║ín b├¿', icon: '≡ƒæÑ' },
          { val: null, label: 'Ng╞░ß╗¥i theo d├╡i', icon: 'Γ¡É' },
        ].map(({ val, label, icon }) => (
          <div
            key={label}
            className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-700/60 p-4 text-center shadow-sm"
          >
            <p className="text-2xl font-bold text-surf-primary">{val ?? 'ΓÇö'}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {icon} {label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );

  // ΓöÇΓöÇΓöÇ SECTION: C├┤ng viß╗çc & Hß╗ìc vß║Ñn ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

  const WorkEduSection = () => (
    <div className="space-y-4">
      <SectionCard title="C├┤ng viß╗çc">
        {work.map((w, i) => (
          <SectionRow
            key={i}
            icon="≡ƒÆ╝"
            primary={w.title ? `${w.title} tß║íi ${w.company}` : w.company}
            secondary={w.current ? '─Éang l├ám viß╗çc' : '─É├ú tß╗½ng l├ám'}
            isOwn={isOwn}
            onEdit={() => {
              setWorkDraft({ ...w });
              setWorkModal({ open: true, index: i });
            }}
            onDelete={async () => {
              const next = work.filter((_, j) => j !== i);
              await save({ work: next });
            }}
          />
        ))}
        {isOwn && (
          <div className="pt-2">
            <AddButton
              label="Th├¬m n╞íi l├ám viß╗çc"
              onClick={() => {
                setWorkDraft({ company: '', title: '', current: true });
                setWorkModal({ open: true, index: null });
              }}
            />
          </div>
        )}
        {!isOwn && work.length === 0 && (
          <p className="text-sm text-gray-400 py-1">Ch╞░a c├│ th├┤ng tin c├┤ng viß╗çc</p>
        )}
      </SectionCard>

      <SectionCard title="Hß╗ìc vß║Ñn">
        {education.map((e, i) => (
          <SectionRow
            key={i}
            icon="≡ƒÄô"
            primary={e.school}
            secondary={[e.degree, e.year ? `N─âm ${e.year}` : undefined].filter(Boolean).join(' ┬╖ ')}
            isOwn={isOwn}
            onEdit={() => {
              setEduDraft({ ...e });
              setEduModal({ open: true, index: i });
            }}
            onDelete={async () => {
              const next = education.filter((_, j) => j !== i);
              await save({ education: next });
            }}
          />
        ))}
        {isOwn && (
          <div className="pt-2">
            <AddButton
              label="Th├¬m tr╞░ß╗¥ng hß╗ìc"
              onClick={() => {
                setEduDraft({ school: '', degree: '' });
                setEduModal({ open: true, index: null });
              }}
            />
          </div>
        )}
        {!isOwn && education.length === 0 && (
          <p className="text-sm text-gray-400 py-1">Ch╞░a c├│ th├┤ng tin hß╗ìc vß║Ñn</p>
        )}
      </SectionCard>
    </div>
  );

  // ΓöÇΓöÇΓöÇ SECTION: ─Éß╗ïa ─æiß╗âm ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

  const PlacesSection = () => (
    <div className="space-y-4">
      <SectionCard title="N╞íi sß╗æng">
        {profile.currentCity ? (
          <SectionRow
            icon="≡ƒÅÖ∩╕Å"
            primary={`─Éang sß╗æng tß║íi ${profile.currentCity}`}
            isOwn={isOwn}
            onEdit={() => {
              setCityDraft(profile.currentCity ?? '');
              setEditCity(false);
              setTimeout(() => setEditCity(true), 0);
            }}
            onDelete={async () => {
              await save({ currentCity: null });
            }}
          />
        ) : isOwn ? (
          <AddButton
            label="Th├¬m th├ánh phß╗æ ─æang sß╗æng"
            onClick={() => {
              setCityDraft('');
              setEditCity(true);
            }}
          />
        ) : (
          <p className="text-sm text-gray-400 py-1">Ch╞░a cß║¡p nhß║¡t</p>
        )}
        {editCity && (
          <AutocompleteInlineEdit
            label="Th├ánh phß╗æ ─æang sß╗æng"
            value={cityDraft}
            onChange={setCityDraft}
            placeholder="Nhß║¡p t├¬n th├ánh phß╗æ..."
            mode={{ type: 'location' }}
            saving={saving}
            onSave={async () => {
              await save({ currentCity: cityDraft.trim() || null });
              setEditCity(false);
            }}
            onCancel={() => setEditCity(false)}
          />
        )}
      </SectionCard>

      <SectionCard title="Qu├¬ qu├ín">
        {profile.hometown ? (
          <SectionRow
            icon="≡ƒÅí"
            primary={`Qu├¬ ß╗ƒ ${profile.hometown}`}
            isOwn={isOwn}
            onEdit={() => {
              setHometownDraft(profile.hometown ?? '');
              setEditHometown(true);
            }}
            onDelete={async () => {
              await save({ hometown: null });
            }}
          />
        ) : isOwn ? (
          <AddButton
            label="Th├¬m qu├¬ qu├ín"
            onClick={() => {
              setHometownDraft('');
              setEditHometown(true);
            }}
          />
        ) : (
          <p className="text-sm text-gray-400 py-1">Ch╞░a cß║¡p nhß║¡t</p>
        )}
        {editHometown && (
          <AutocompleteInlineEdit
            label="Qu├¬ qu├ín"
            value={hometownDraft}
            onChange={setHometownDraft}
            placeholder="Nhß║¡p t├¬n tß╗ënh / th├ánh phß╗æ..."
            mode={{ type: 'location' }}
            saving={saving}
            onSave={async () => {
              await save({ hometown: hometownDraft.trim() || null });
              setEditHometown(false);
            }}
            onCancel={() => setEditHometown(false)}
          />
        )}
      </SectionCard>
    </div>
  );

  // ΓöÇΓöÇΓöÇ SECTION: Li├¬n hß╗ç ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

  const ContactSection = () => (
    <div className="space-y-4">
      <SectionCard title="Th├┤ng tin li├¬n hß╗ç">
        {/* Email hiß╗ân thß╗ï mß║╖c ─æß╗ïnh l├á email ─æ─âng nhß║¡p */}
        <SectionRow
          icon="≡ƒôº"
          primary={profile.contactEmail || loginEmail || 'Ch╞░a cß║¡p nhß║¡t email li├¬n hß╗ç'}
          secondary="Email li├¬n hß╗ç"
          isOwn={isOwn}
          onEdit={() => {
            setContactEmailDraft(profile.contactEmail ?? loginEmail ?? '');
            setEditContactEmail(true);
          }}
        />
        {editContactEmail && (
          <InlineEdit
            label="Email li├¬n hß╗ç"
            value={contactEmailDraft}
            onChange={setContactEmailDraft}
            placeholder="email@example.com"
            saving={saving}
            onSave={async () => {
              await save({ contactEmail: contactEmailDraft.trim() || null });
              setEditContactEmail(false);
            }}
            onCancel={() => setEditContactEmail(false)}
          />
        )}

        {profile.phone ? (
          <SectionRow
            icon="≡ƒô▒"
            primary={profile.phone}
            secondary="Sß╗æ ─æiß╗çn thoß║íi"
            isOwn={isOwn}
            onEdit={() => {
              setPhoneDraft(profile.phone ?? '');
              setEditPhone(true);
            }}
            onDelete={async () => {
              await save({ phone: null });
            }}
          />
        ) : isOwn ? (
          <AddButton
            label="Th├¬m sß╗æ ─æiß╗çn thoß║íi"
            onClick={() => {
              setPhoneDraft('');
              setEditPhone(true);
            }}
          />
        ) : null}
        {editPhone && (
          <InlineEdit
            label="Sß╗æ ─æiß╗çn thoß║íi"
            value={phoneDraft}
            onChange={setPhoneDraft}
            placeholder="+84 912 345 678"
            saving={saving}
            onSave={async () => {
              await save({ phone: phoneDraft.trim() || null });
              setEditPhone(false);
            }}
            onCancel={() => setEditPhone(false)}
          />
        )}

        {profile.website ? (
          <SectionRow
            icon="≡ƒîÉ"
            primary={profile.website}
            secondary="Website c├í nh├ón"
            isOwn={isOwn}
            onEdit={() => {
              setWebsiteDraft(profile.website ?? '');
              setEditWebsite(true);
            }}
            onDelete={async () => {
              await save({ website: null });
            }}
          />
        ) : isOwn ? (
          <AddButton
            label="Th├¬m website c├í nh├ón"
            onClick={() => {
              setWebsiteDraft('');
              setEditWebsite(true);
            }}
          />
        ) : null}
        {editWebsite && (
          <InlineEdit
            label="Website c├í nh├ón"
            value={websiteDraft}
            onChange={setWebsiteDraft}
            placeholder="https://yourwebsite.com"
            saving={saving}
            onSave={async () => {
              await save({ website: websiteDraft.trim() || null });
              setEditWebsite(false);
            }}
            onCancel={() => setEditWebsite(false)}
          />
        )}

        {!profile.phone && !profile.website && !isOwn && (
          <p className="text-sm text-gray-400 py-1">Kh├┤ng c├│ th├¬m th├┤ng tin li├¬n hß╗ç</p>
        )}
      </SectionCard>
    </div>
  );

  // ΓöÇΓöÇΓöÇ SECTION: Th├┤ng tin c╞í bß║ún ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

  const BasicSection = () => (
    <div className="space-y-4">
      <SectionCard title="Th├┤ng tin c├í nh├ón">
        {/* Birthday */}
        {profile.birthday ? (
          <SectionRow
            icon="≡ƒÄé"
            primary={birthdayLabel(profile.birthday)}
            secondary="Ng├áy sinh"
            isOwn={isOwn}
            onEdit={() => {
              setBdDraft(profile.birthday ?? { day: 1, month: 1, year: 2000, showYear: true });
              setBirthdayModal(true);
            }}
            onDelete={async () => {
              await save({ birthday: null });
            }}
          />
        ) : isOwn ? (
          <AddButton
            label="Th├¬m ng├áy sinh"
            onClick={() => {
              setBdDraft({ day: 1, month: 1, year: 2000, showYear: true });
              setBirthdayModal(true);
            }}
          />
        ) : null}

        {/* Gender */}
        {profile.gender ? (
          <SectionRow
            icon="≡ƒ¬¬"
            primary={genderLabel(profile.gender, profile.customGender)}
            secondary="Giß╗¢i t├¡nh"
            isOwn={isOwn}
            onEdit={() => setGenderModal(true)}
            onDelete={async () => {
              await save({ gender: null, customGender: null });
            }}
          />
        ) : isOwn ? (
          <AddButton label="Th├¬m giß╗¢i t├¡nh" onClick={() => setGenderModal(true)} />
        ) : null}

        {/* Relationship */}
        {profile.relationship ? (
          <SectionRow
            icon="Γ¥ñ∩╕Å"
            primary={relationshipLabel(profile.relationship)}
            secondary="T├¼nh trß║íng mß╗æi quan hß╗ç"
            isOwn={isOwn}
            onEdit={() => setRelationshipModal(true)}
            onDelete={async () => {
              await save({ relationship: null });
            }}
          />
        ) : isOwn ? (
          <AddButton
            label="Th├¬m t├¼nh trß║íng mß╗æi quan hß╗ç"
            onClick={() => setRelationshipModal(true)}
          />
        ) : null}

        {!profile.birthday && !profile.gender && !profile.relationship && !isOwn && (
          <p className="text-sm text-gray-400 py-1">Ch╞░a cß║¡p nhß║¡t th├┤ng tin c╞í bß║ún</p>
        )}
      </SectionCard>

      <SectionCard title="Ng├┤n ngß╗» & T├¡n ng╞░ß╗íng">
        {/* Languages */}
        {languages.length > 0 ? (
          <SectionRow
            icon="≡ƒùú∩╕Å"
            primary={languages.join(', ')}
            secondary="Ng├┤n ngß╗»"
            isOwn={isOwn}
            onEdit={() => setLanguageModal(true)}
          />
        ) : isOwn ? (
          <AddButton label="Th├¬m ng├┤n ngß╗»" onClick={() => setLanguageModal(true)} />
        ) : null}

        {/* Religion */}
        {profile.religion ? (
          <SectionRow
            icon="≡ƒòè∩╕Å"
            primary={profile.religion}
            secondary="T├┤n gi├ío"
            isOwn={isOwn}
            onEdit={() => setReligionModal(true)}
            onDelete={async () => {
              await save({ religion: null });
            }}
          />
        ) : isOwn ? (
          <AddButton label="Th├¬m t├┤n gi├ío (t├╣y chß╗ìn)" onClick={() => setReligionModal(true)} />
        ) : null}

        {/* Political */}
        {profile.politicalViews ? (
          <SectionRow
            icon="≡ƒÅ¢∩╕Å"
            primary={profile.politicalViews}
            secondary="Quan ─æiß╗âm ch├¡nh trß╗ï"
            isOwn={isOwn}
            onEdit={() => setPoliticsModal(true)}
            onDelete={async () => {
              await save({ politicalViews: null });
            }}
          />
        ) : isOwn ? (
          <AddButton
            label="Th├¬m quan ─æiß╗âm ch├¡nh trß╗ï (t├╣y chß╗ìn)"
            onClick={() => setPoliticsModal(true)}
          />
        ) : null}

        {languages.length === 0 && !profile.religion && !profile.politicalViews && !isOwn && (
          <p className="text-sm text-gray-400 py-1">Ch╞░a cß║¡p nhß║¡t</p>
        )}
      </SectionCard>
    </div>
  );

  // ΓöÇΓöÇΓöÇ SECTION: Cuß╗Öc ─æß╗¥i ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

  const LifeSection = () => (
    <div className="space-y-4">
      <SectionCard title="Sß╗▒ kiß╗çn cuß╗Öc ─æß╗¥i">
        {joined && (
          <SectionRow
            icon="≡ƒîè"
            primary={`Tham gia Surf v├áo ${joined}`}
            secondary="Bß║»t ─æß║ºu h├ánh tr├¼nh Surf"
            isOwn={false}
          />
        )}
        {profile.birthday && (
          <SectionRow
            icon="≡ƒÄé"
            primary={`Sinh nhß║¡t: ${birthdayLabel(profile.birthday)}`}
            isOwn={false}
          />
        )}
        {profile.relationship && (
          <SectionRow icon="Γ¥ñ∩╕Å" primary={relationshipLabel(profile.relationship)} isOwn={false} />
        )}
        {!joined && !profile.birthday && !profile.relationship && (
          <p className="text-sm text-gray-400 py-1">Ch╞░a c├│ sß╗▒ kiß╗çn n├áo</p>
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

  // ΓöÇΓöÇΓöÇ Modals ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

  return (
    <>
      {/* Layout */}
      <div className="flex flex-col md:flex-row gap-4">
        {/* Left nav */}
        <aside className="md:w-56 shrink-0">
          <div className="md:sticky md:top-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-700/60 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Giß╗¢i thiß╗çu</p>
            </div>
            {/* Mobile: horizontal scroll */}
            <div className="flex md:flex-col overflow-x-auto md:overflow-x-visible p-2 gap-1">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveSection(s.id)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap shrink-0 md:w-full text-left
                    ${
                      activeSection === s.id
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
        <div className="flex-1 min-w-0 space-y-4">{sectionMap[activeSection]}</div>
      </div>

      {/* ΓöÇΓöÇ Work Modal ΓöÇΓöÇ */}
      {workModal.open && (
        <SmallModal
          title={workModal.index !== null ? 'Chß╗ënh sß╗¡a c├┤ng viß╗çc' : 'Th├¬m n╞íi l├ám viß╗çc'}
          onClose={() => setWorkModal({ open: false, index: null })}
        >
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                T├¬n c├┤ng ty *
              </label>
              <AutocompleteInput
                value={workDraft.company}
                onChange={(v) => setWorkDraft({ ...workDraft, company: v })}
                placeholder="V├¡ dß╗Ñ: Google, FPT Software..."
                mode={{ type: 'static', list: COMPANY_SUGGESTIONS }}
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                Chß╗⌐c danh
              </label>
              <input
                type="text"
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-surf-primary/50"
                placeholder="V├¡ dß╗Ñ: Software Developer, Intern..."
                value={workDraft.title}
                onChange={(e) => setWorkDraft({ ...workDraft, title: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-gray-300"
                checked={workDraft.current}
                onChange={(e) => setWorkDraft({ ...workDraft, current: e.target.checked })}
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                ─Éang l├ám viß╗çc tß║íi ─æ├óy
              </span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setWorkModal({ open: false, index: null })}
                className="px-4 py-1.5 text-sm rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 transition-colors"
              >
                Hß╗ºy
              </button>
              <button
                type="button"
                disabled={!workDraft.company.trim() || saving}
                className="px-4 py-1.5 text-sm rounded-xl bg-surf-primary text-white hover:bg-surf-primary/90 disabled:opacity-60 font-medium transition-colors"
                onClick={async () => {
                  const next = [...work];
                  if (workModal.index !== null) next[workModal.index] = workDraft;
                  else next.push(workDraft);
                  await save({ work: next });
                  setWorkModal({ open: false, index: null });
                }}
              >
                {saving ? '─Éang l╞░u...' : 'L╞░u'}
              </button>
            </div>
          </div>
        </SmallModal>
      )}

      {/* ΓöÇΓöÇ Education Modal ΓöÇΓöÇ */}
      {eduModal.open && (
        <SmallModal
          title={eduModal.index !== null ? 'Chß╗ënh sß╗¡a hß╗ìc vß║Ñn' : 'Th├¬m tr╞░ß╗¥ng hß╗ìc'}
          onClose={() => setEduModal({ open: false, index: null })}
        >
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                T├¬n tr╞░ß╗¥ng *
              </label>
              <AutocompleteInput
                value={eduDraft.school}
                onChange={(v) => setEduDraft({ ...eduDraft, school: v })}
                placeholder="V├¡ dß╗Ñ: ─Éß║íi hß╗ìc B├ích khoa H├á Nß╗Öi..."
                mode={{ type: 'static', list: SCHOOL_SUGGESTIONS }}
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                Chuy├¬n ng├ánh / Bß║▒ng cß║Ñp
              </label>
              <AutocompleteInput
                value={eduDraft.degree}
                onChange={(v) => setEduDraft({ ...eduDraft, degree: v })}
                placeholder="V├¡ dß╗Ñ: Kß╗╣ thuß║¡t Phß║ºn mß╗üm, T├ái ch├¡nh - Ng├ón h├áng..."
                mode={{ type: 'static', list: DEGREE_SUGGESTIONS }}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                N─âm tß╗æt nghiß╗çp (tuß╗│ chß╗ìn)
              </label>
              <input
                type="number"
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-surf-primary/50"
                placeholder="V├¡ dß╗Ñ: 2025"
                min={1950}
                max={2100}
                value={eduDraft.year ?? ''}
                onChange={(e) =>
                  setEduDraft({
                    ...eduDraft,
                    year: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEduModal({ open: false, index: null })}
                className="px-4 py-1.5 text-sm rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 transition-colors"
              >
                Hß╗ºy
              </button>
              <button
                type="button"
                disabled={!eduDraft.school.trim() || saving}
                className="px-4 py-1.5 text-sm rounded-xl bg-surf-primary text-white hover:bg-surf-primary/90 disabled:opacity-60 font-medium transition-colors"
                onClick={async () => {
                  const next = [...education];
                  if (eduModal.index !== null) next[eduModal.index] = eduDraft;
                  else next.push(eduDraft);
                  await save({ education: next });
                  setEduModal({ open: false, index: null });
                }}
              >
                {saving ? '─Éang l╞░u...' : 'L╞░u'}
              </button>
            </div>
          </div>
        </SmallModal>
      )}

      {/* ΓöÇΓöÇ Birthday Modal ΓöÇΓöÇ */}
      {birthdayModal && (
        <SmallModal title="Ng├áy sinh" onClose={() => setBirthdayModal(false)}>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                  Ng├áy
                </label>
                <select
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-surf-primary/50"
                  value={bdDraft.day}
                  onChange={(e) => setBdDraft({ ...bdDraft, day: Number(e.target.value) })}
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                  Th├íng
                </label>
                <select
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-surf-primary/50"
                  value={bdDraft.month}
                  onChange={(e) => setBdDraft({ ...bdDraft, month: Number(e.target.value) })}
                >
                  {MONTHS.map((m, i) => (
                    <option key={i} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                  N─âm
                </label>
                <select
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-surf-primary/50"
                  value={bdDraft.year}
                  onChange={(e) => setBdDraft({ ...bdDraft, year: Number(e.target.value) })}
                >
                  {Array.from({ length: 100 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-gray-300"
                checked={bdDraft.showYear}
                onChange={(e) => setBdDraft({ ...bdDraft, showYear: e.target.checked })}
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Hiß╗ân thß╗ï n─âm sinh</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setBirthdayModal(false)}
                className="px-4 py-1.5 text-sm rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 transition-colors"
              >
                Hß╗ºy
              </button>
              <button
                type="button"
                disabled={saving}
                className="px-4 py-1.5 text-sm rounded-xl bg-surf-primary text-white hover:bg-surf-primary/90 disabled:opacity-60 font-medium transition-colors"
                onClick={async () => {
                  await save({ birthday: bdDraft });
                  setBirthdayModal(false);
                }}
              >
                {saving ? '─Éang l╞░u...' : 'L╞░u'}
              </button>
            </div>
          </div>
        </SmallModal>
      )}

      {/* ΓöÇΓöÇ Relationship Modal ΓöÇΓöÇ */}
      {relationshipModal && (
        <SmallModal title="T├¼nh trß║íng mß╗æi quan hß╗ç" onClose={() => setRelationshipModal(false)}>
          <div className="space-y-1.5">
            {RELATIONSHIP_OPTIONS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={async () => {
                  await save({ relationship: r.value });
                  setRelationshipModal(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors text-left
                  ${
                    profile.relationship === r.value
                      ? 'bg-surf-primary/10 text-surf-primary'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                  }`}
              >
                <span>
                  {r.value === 'single'
                    ? '≡ƒÆö'
                    : r.value === 'married'
                      ? '≡ƒÆì'
                      : r.value === 'engaged'
                        ? '≡ƒÆî'
                        : 'Γ¥ñ∩╕Å'}
                </span>
                {r.label}
              </button>
            ))}
            {profile.relationship && (
              <button
                type="button"
                onClick={async () => {
                  await save({ relationship: null });
                  setRelationshipModal(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-left"
              >
                <span>≡ƒÜ½</span> X├│a t├¼nh trß║íng mß╗æi quan hß╗ç
              </button>
            )}
          </div>
        </SmallModal>
      )}

      {/* ΓöÇΓöÇ Gender Modal ΓöÇΓöÇ */}
      {genderModal && (
        <SmallModal title="Giß╗¢i t├¡nh" onClose={() => setGenderModal(false)}>
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
                  ${
                    profile.gender === g.value
                      ? 'bg-surf-primary/10 text-surf-primary'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                  }`}
              >
                <span>{g.value === 'male' ? 'ΓÖé∩╕Å' : g.value === 'female' ? 'ΓÖÇ∩╕Å' : 'ΓÜº∩╕Å'}</span>
                {g.label}
              </button>
            ))}
            {editCustomGender && (
              <InlineEdit
                label="Giß╗¢i t├¡nh t├╣y chß╗ënh"
                value={customGenderDraft}
                onChange={setCustomGenderDraft}
                placeholder="Nhß║¡p giß╗¢i t├¡nh cß╗ºa bß║ín..."
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

      {/* ΓöÇΓöÇ Language Modal ΓöÇΓöÇ */}
      {languageModal && (
        <SmallModal title="Ng├┤n ngß╗»" onClose={() => setLanguageModal(false)}>
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
                    ${
                      selected
                        ? 'bg-surf-primary/10 text-surf-primary'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                    }`}
                >
                  <span>{lang}</span>
                  {selected && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => setLanguageModal(false)}
              className="px-4 py-1.5 text-sm rounded-xl bg-surf-primary text-white hover:bg-surf-primary/90 font-medium transition-colors"
            >
              Xong
            </button>
          </div>
        </SmallModal>
      )}

      {/* ΓöÇΓöÇ Religion Modal ΓöÇΓöÇ */}
      {religionModal && (
        <SmallModal title="T├┤n gi├ío" onClose={() => setReligionModal(false)}>
          <div className="space-y-1.5">
            {RELIGION_OPTIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={async () => {
                  await save({ religion: r });
                  setReligionModal(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors text-left
                  ${profile.religion === r ? 'bg-surf-primary/10 text-surf-primary' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'}`}
              >
                ≡ƒòè∩╕Å {r}
              </button>
            ))}
          </div>
        </SmallModal>
      )}

      {/* ΓöÇΓöÇ Political Views Modal ΓöÇΓöÇ */}
      {politicsModal && (
        <SmallModal title="Quan ─æiß╗âm ch├¡nh trß╗ï" onClose={() => setPoliticsModal(false)}>
          <div className="space-y-1.5">
            {POLITICAL_OPTIONS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={async () => {
                  await save({ politicalViews: p });
                  setPoliticsModal(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors text-left
                  ${profile.politicalViews === p ? 'bg-surf-primary/10 text-surf-primary' : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'}`}
              >
                ≡ƒÅ¢∩╕Å {p}
              </button>
            ))}
          </div>
        </SmallModal>
      )}
    </>
  );
}