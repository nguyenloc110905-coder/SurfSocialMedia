/**
 * Development Debug Configuration
 * 
 * Dùng để test các screen khác nhau mà không cần authenticate
 * Mỗi lần code thay đổi, chỉ cần sửa DEV_MODE_ENABLED và SELECT_SCREEN
 */

// ===== BẬT/TẮT CHỈ SỬA 2-3 DÒNG NÀY =====
export const DEV_MODE_ENABLED = false ; // Đặt false để dùng normal flow (cần login)
export const SELECT_SCREEN = 'Auth'; // Chọn screen nào: 'Auth' | 'MainTabs' | 'Profile' | 'Messages' | 'AI'
export const DEV_MODE_CLEAR_AUTH = false ; // ⭐ QUAN TRỌNG: Đặt true để:
                                           //   1. Clear persisted auth khi app start (force logout)
                                           //   2. Bypass auth requirement (nhập gì cũng được)
                                           //   3. Cho phép test login flow mà không cần real account

// =========================================

/**
 * Kiểu screen có thể chọn
 */
export type DebugScreenType = 'Auth' | 'MainTabs' | 'Profile' | 'Messages' | 'AI';

/**
 * Kiểm tra dev mode bật hay tắt
 */
export function isDevModeEnabled(): boolean {
  return DEV_MODE_ENABLED;
}

/**
 * Lấy screen sẽ hiển thị khi dev mode
 */
export function getDebugScreen(): DebugScreenType {
  return SELECT_SCREEN;
}

/**
 * Lấy config clear auth
 */
export function shouldClearAuthOnStartup(): boolean {
  return DEV_MODE_CLEAR_AUTH;
}

/**
 * Log debug info khi app start
 */
export function logDebugInfo(): void {
  console.log('═══════════════════════════════════');
  if (DEV_MODE_ENABLED) {
    console.log('🔧 DEV MODE ENABLED');
    console.log(`📱 Starting screen: ${SELECT_SCREEN}`);
  } else {
    console.log('🔓 Normal mode (dev mode OFF)');
  }
  if (DEV_MODE_CLEAR_AUTH) {
    console.log('🔑 DEV_MODE_CLEAR_AUTH: ON — Auth bypass + Clear persisted user');
  }
  console.log('═══════════════════════════════════');
}

/**
 * Danh sách các screen có thể chọn (dùng để validate)
 */
export const AVAILABLE_SCREENS: readonly DebugScreenType[] = [
  'Auth',
  'MainTabs',
  'Profile',
  'Messages',
  'AI',
];

/**
 * Validate selected screen
 */
export function validateDebugScreen(screen: DebugScreenType): boolean {
  return AVAILABLE_SCREENS.includes(screen);
}

/**
 * Mô tả từng screen (để dễ chọn)
 */
export const SCREEN_DESCRIPTIONS: Record<DebugScreenType, string> = {
  'Auth': '🔐 Trang xác thực (Login/Register)',
  'MainTabs': '🏠 Trang chính (feed, home, profile tabs)',
  'Profile': '👤 Trang profile người dùng',
  'Messages': '💬 Trang tin nhắn',
  'AI': '🤖 Trang AI assistant',
};

/**
 * Get screen description
 */
export function getScreenDescription(screen: DebugScreenType): string {
  return SCREEN_DESCRIPTIONS[screen] || 'Unknown screen';
}
