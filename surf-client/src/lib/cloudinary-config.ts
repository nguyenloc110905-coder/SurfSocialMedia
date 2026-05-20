/**
 * Cấu hình Cloudinary – sửa trực tiếp tại đây (ưu tiên cao nhất).
 * Tên biến phải đúng: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_UPLOAD_PRESET.
 */
export const CLOUDINARY_CLOUD_NAME = 'dg8oqqjes';
export const CLOUDINARY_API_KEY = '244888796188991';
export const CLOUDINARY_UPLOAD_PRESET = 'Surf_Project2';

/**
 * Danh sách các tài khoản Cloudinary để "gánh" tải.
 * App sẽ tự động random chọn 1 trong các tài khoản này mỗi lần up ảnh/video.
 * Bạn có thể tạo thêm nhiều tài khoản Gmail -> đăng ký Cloudinary -> thêm thông tin vào đây.
 */
export const CLOUDINARY_ACCOUNTS = [
  {
    cloudName: CLOUDINARY_CLOUD_NAME,
    apiKey: CLOUDINARY_API_KEY,
    uploadPreset: CLOUDINARY_UPLOAD_PRESET,
  },
  // Tài khoản thứ 2 của bạn (đã được cấu hình tự động gánh tải):
  {
    cloudName: 'dgmosozwy',
    apiKey: '118719293725719',
    uploadPreset: 'xnqch2h6',
  },
  {
    cloudName: 'dcretnmap',
    apiKey: '253436686229428',
    uploadPreset: 'wemtskwo',
  },
  {
    cloudName: 'dhtzpphlm',
    apiKey: '142586853316187',
    uploadPreset: 'b5o7yzn6',
  },
];
