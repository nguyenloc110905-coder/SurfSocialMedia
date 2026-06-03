# Surf Social Media - Mobile App

Đây là mã nguồn ứng dụng Mobile của mạng xã hội Surf, được xây dựng bằng **React Native** và hệ sinh thái **Expo (Custom Dev Client)**. 

Ứng dụng hiện tại hỗ trợ tốt nhất trên nền tảng **Android**.

## Yêu cầu hệ thống (Prerequisites)

Để chạy được dự án này, máy tính của bạn cần cài đặt sẵn các công cụ sau:
1. **Node.js** (Phiên bản 18.x trở lên).
2. **Android Studio** (Bao gồm Android SDK và công cụ `adb`).
3. Môi trường phát triển Java (**JDK 17**).
4. Một thiết bị Android thật (để sử dụng Camera/Video Call/Voice) hoặc Android Emulator.

## Hướng dẫn cài đặt Android Studio hiệu quả (Cho React Native/Expo)

Để tránh các lỗi môi trường lặt vặt (như thiếu SDK, sai đường dẫn ADB...), bạn cần cài đặt Android Studio theo chuẩn sau:

1. **Tải và cài đặt Android Studio**: Tải bản mới nhất từ [trang chủ Android Studio](https://developer.android.com/studio). Cài đặt với các tùy chọn mặc định (Standard).
2. **Cài đặt SDK đúng chuẩn**:
   - Mở Android Studio > Chọn **More Actions** (hoặc biểu tượng 3 chấm) > **SDK Manager**.
   - Ở tab **SDK Platforms**, tick chọn **Android 14 (API Level 34)** và **Android 13 (API Level 33)**.
   - Chuyển sang tab **SDK Tools**, tick chọn (hoặc đảm bảo đã tick):
     - `Android SDK Build-Tools 34` (hoặc bản mới nhất)
     - `Android Emulator`
     - `Android SDK Platform-Tools` (Cực kỳ quan trọng, chứa công cụ `adb`)
   - Bấm **Apply** để tải về.
3. **Cấu hình Biến môi trường (Environment Variables) trên Windows**:
   - Mở Windows Search, gõ `Environment Variables` và chọn *Edit the system environment variables*.
   - Trong bảng **User variables**, bấm **New...** để tạo biến mới:
     - Variable name: `ANDROID_HOME`
     - Variable value: `C:\Users\Tên_Máy_Tính_Của_Bạn\AppData\Local\Android\Sdk` (Thường mặc định là đường dẫn này).
   - Tiếp tục tìm biến **Path** (trong mục User variables), bấm **Edit** > **New**, thêm 2 dòng sau:
     - `%ANDROID_HOME%\emulator`
     - `%ANDROID_HOME%\platform-tools` (Để có thể gõ lệnh `adb` trực tiếp từ Terminal bất kỳ).
4. **Kiểm tra**: Mở Terminal mới và gõ lệnh `adb --version`. Nếu nó hiện ra phiên bản ADB thì bạn đã cài đặt thành công và hoàn hảo!

## Cài đặt (Installation)

1. Mở Terminal và di chuyển vào thư mục `surf-mobile`:
   ```bash
   cd surf-mobile
   ```

2. Cài đặt các gói thư viện phụ thuộc:
   ```bash
   npm install
   ```
   *(Hoặc `yarn install` nếu bạn dùng Yarn)*

3. Cấu hình biến môi trường:
   - Tạo hoặc mở file `.env` nằm ở thư mục gốc của `surf-mobile`.
   - Lưu ý quan trọng: Biến `EXPO_PUBLIC_API_URL` đang được **ẩn (comment out)** để ứng dụng kích hoạt chế độ **Tự động nhận diện IP của máy chủ Expo (Metro Bundler)**. Việc này giúp bạn không cần phải đổi IP thủ công mỗi khi thay đổi mạng Wi-Fi.

## Hướng dẫn chạy ứng dụng (Run on Android)

Vì dự án có sử dụng các native modules (như gọi video qua WebRTC, thu âm...), chúng ta không thể dùng ứng dụng "Expo Go" thông thường mà phải sử dụng **Expo Custom Dev Client**.

### Bước 1: Build Native App lên điện thoại
Chạy lệnh sau để build và cài đặt khung ứng dụng (Custom Client) lên thiết bị Android của bạn qua cáp USB hoặc ADB Wi-Fi:

```bash
npx expo run:android
```
*(Quá trình này có thể mất vài phút cho lần đầu tiên tải Gradle và biên dịch mã Java/C++).*

### Bước 2: Khởi động Metro Bundler
Sau khi ứng dụng "Surf" đã được cài đặt thành công trên điện thoại, bạn khởi động máy chủ Metro Bundler:

```bash
npx expo start -c
```
*(Cờ `-c` dùng để xóa cache, đảm bảo app luôn nhận cấu hình mới nhất).*

### Bước 3: Mở App
- Khi Terminal hiện mã QR, hãy **mở ứng dụng Surf trên điện thoại của bạn** lên.
- Bạn có thể nhấn phím **`a`** trên Terminal để Expo tự động gọi kết nối tới app trên điện thoại.

---

## Mẹo khắc phục lỗi kết nối ADB (Wi-Fi Debugging)

Khi chạy không dây (Wireless Debugging) thường hay gặp lỗi ngắt kết nối ADB `No Android connected device found` hoặc lỗi timeout `10060`. 

**Cách xử lý nhanh:**
1. Mở Cài đặt trên điện thoại > **Tùy chọn nhà phát triển** > **Gỡ lỗi không dây**. Tắt đi và bật lại.
2. Bấm vào mục **Ghép nối thiết bị bằng mã ghép nối**, xem IP, Port và mã 6 số.
3. Mở Terminal trên máy tính gõ:
   ```bash
   adb pair 192.168.x.x:<Port_Ghép_Nối>
   ```
   *(Nhập mã 6 số khi được hỏi).*
4. Ra ngoài lại màn hình Gỡ lỗi không dây, xem IP và Port chính, gõ:
   ```bash
   adb connect 192.168.x.x:<Port_Chính>
   ```
5. Khi Terminal báo `connected`, gõ lệnh `npx expo start` và nhấn `a` để tiếp tục.

---

## Đóng gói ứng dụng (Production)

Khi bạn muốn đóng gói thành file `.apk` hoặc `.aab` để phát hành:
1. Mở lại file `.env` và bỏ dấu `#` ở dòng `EXPO_PUBLIC_API_URL`, sau đó điền tên miền server thật của bạn vào (VD: `https://api.yourdomain.com`).
2. Sử dụng EAS Build để đóng gói:
   ```bash
   eas build -p android --profile production
   ```
