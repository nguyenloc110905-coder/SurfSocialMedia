<div align="center">
  <h1>🌊 Surf Social Media</h1>
  <p><strong>The Next-Gen Social Experience: Seamless, Real-Time, AI-Powered</strong></p>

  <p>
    <img src="https://img.shields.io/badge/Platform-Web%20%7C%20iOS%20%7C%20Android-blueviolet?style=for-the-badge" alt="Platforms" />
    <img src="https://img.shields.io/badge/Stack-Node.js%20%7C%20React%20%7C%20Expo-blue?style=for-the-badge&logo=react" alt="Tech Stack" />
    <img src="https://img.shields.io/badge/Realtime-Socket.io%20%7C%20LiveKit-ff69b4?style=for-the-badge&logo=socket.io" alt="Realtime" />
  </p>
</div>

---

## 🌟 Welcome to Surf
**Surf** không chỉ là một mạng xã hội thông thường; nó là một hệ sinh thái kỹ thuật số được thiết kế tỉ mỉ dành cho người dùng hiện đại. Bằng cách kết hợp những tinh hoa của kết nối xã hội, chia sẻ đa phương tiện, giao tiếp thời gian thực và thương mại điện tử, Surf mang đến một nền tảng thống nhất định nghĩa lại cách chúng ta tương tác trên không gian mạng.

Dù bạn đang chia sẻ những khoảnh khắc lướt qua, tham gia các cuộc gọi nhóm chất lượng cao, livestream tương tác với khán giả, hay mua bán trên chợ điện tử, Surf làm cho mọi thứ trở nên dễ dàng, tức thời và bảo mật.

---

## 🔥 Tính Năng Đột Phá (Cutting-Edge Features)

### 💬 Kết Nối Thời Gian Thực (Unified Real-Time)
- **Instant Messaging:** Nhắn tin tức thời với độ trễ cực thấp, được xây dựng trên kiến trúc **Socket.io** kết hợp **Redis**.
- **Crystal Clear Calls:** Gọi thoại và Video Call 1-1 hoặc gọi Nhóm độ nét cao, sức mạnh được cung cấp bởi hạ tầng **LiveKit**.
- **Smart Push Notifications:** Không bao giờ bỏ lỡ thông báo quan trọng với hệ thống đẩy thông báo sâu của Firebase Cloud Messaging.

### 🎥 Giải Trí & Đa Phương Tiện
- **Moments (Shorts/Reels):** Lướt video ngắn kiểu TikTok với cơ chế cuộn vô tận, tối ưu hóa auto-play mượt mà 60fps.
- **Live Streaming:** Bắt đầu phát sóng trực tiếp chỉ với 1 chạm hoặc khám phá các top trending streams.
- **Rich Media Sharing:** Tải lên ảnh/video siêu tốc, tự động tối ưu hóa dung lượng qua **Cloudinary** và **Firebase Storage**.

### 🤖 Hệ Sinh Thái Tích Hợp AI
- **Intelligent Moderation:** Hệ thống tự động kiểm duyệt nội dung, phát hiện ngôn từ độc hại hoặc hình ảnh không phù hợp thông qua **Gemini & OpenAI**.
- **Smart Recommendations:** Gợi ý kết bạn và chọn lọc bảng tin thông minh dựa trên ngữ cảnh người dùng.

### 🛒 Chợ Điện Tử (Marketplace)
- **Seamless Trading:** Mua, bán và khám phá các món đồ ngay trong cộng đồng của bạn.
- **Cổng Thanh Toán Nội Địa:** Tích hợp sâu các ví điện tử hàng đầu Việt Nam như **VNPAY, MoMo, ZaloPay** cho trải nghiệm giao dịch 1-chạm.

---

## 🚀 Kiến Trúc Hệ Thống (The Architecture)
Surf được thiết kế theo tiêu chuẩn Enterprise-grade, đảm bảo khả năng mở rộng (scalability) linh hoạt và hiệu năng vượt trội.

### 📱 Frontend (Web & Mobile App)
- **Web App:** React 18, Vite, TailwindCSS mang tới UI/UX hiện đại (Dark Mode, Glassmorphism).
- **Mobile App:** React Native (Expo) kết hợp Reanimated cho hiệu ứng mượt mà.
- **State Management:** Zustand (tối ưu hóa re-render).
- **Media RTC:** LiveKit Client SDK.

### ⚙️ Backend (Server API)
- **Core:** Node.js, Express, TypeScript.
- **Database:** Firebase Firestore (NoSQL), tối ưu cực tốt cho đồng bộ hóa thời gian thực.
- **Caching & Pub/Sub:** Redis (Upstash) giúp hệ thống chat mở rộng không giới hạn.
- **Video/Audio MCU:** LiveKit Server SDK quản lý phòng họp và luồng media.
- **Payment Webhooks:** Xử lý xác thực chữ ký (checksum) và callback an toàn tuyệt đối cho thanh toán.

---

## 🛡️ Bảo Mật & Giám Sát (Security & Performance)
- **Zero-Trust Auth:** Xác thực đa kênh qua Firebase Auth (Email, Google, Facebook, Apple).
- **Edge Caching:** Tài nguyên tĩnh được phân phối toàn cầu qua hệ thống CDN.
- **Crash Reporting:** Tích hợp **Sentry** trên toàn bộ Web, Mobile và Node.js để theo dõi lỗi realtime 24/7.

---

## 📄 Hướng Dẫn Chấm Điểm & Chạy Dự Án (Dành Cho Giảng Viên)

### 1. Công Nghệ Sử Dụng
- **Mobile Framework:** React Native (Expo) - *(Lưu ý: Dự án sử dụng React Native/Expo thay vì Flutter/Dart)*
- **Frontend Web:** ReactJS (Vite, TailwindCSS)
- **Backend API:** Node.js (Express, TypeScript)
- **Cơ sở dữ liệu:** Firebase Firestore (NoSQL) & Storage
- **Realtime & Media:** Socket.io, Redis, LiveKit

### 2. Các Bước Cài Đặt Và Chạy Project

**Yêu cầu môi trường:**
- Node.js (v18.x trở lên)
- npm (v9.x trở lên)
- Máy ảo Android (Android Studio) hoặc ứng dụng Expo Go trên điện thoại thật.

**Bước 1: Clone repository**
```bash
git clone <LINK_REPO>
cd Surf
```

**Bước 2: Chạy Server (Backend)**
```bash
cd surf-server
npm install
npm run dev
```

**Bước 3: Chạy Mobile App**
Mở một terminal mới:
```bash
cd surf-mobile
npm install
npm start
# Quét mã QR bằng ứng dụng Expo Go trên điện thoại, hoặc bấm 'a' để mở trên Android Emulator.
```

**Bước 4: Chạy Web App (Khuyến nghị để test đầy đủ tính năng)**
Mở một terminal mới:
```bash
cd surf-client
npm install
npm run dev
```

### 3. Tài Khoản Test
*(Giảng viên có thể tự đăng ký một tài khoản mới trực tiếp trên ứng dụng để trải nghiệm các luồng như OTP và tạo Profile).*

### 4. Cấu Hình Firebase & Dữ Liệu
- **File cấu hình:** 
  - Android: `google-services.json` đã được tích hợp sẵn trong thư mục `surf-mobile/`.
  - **Backend / Web / Mobile:** Tệp nén chứa các khóa bảo mật `.env` sẽ được sinh viên gửi kèm (hoặc gửi riêng). Giảng viên vui lòng giải nén và **chép đè các file này vào đúng vị trí** tương ứng bên dưới trước khi chạy lệnh `npm install`:
    1. Chép file `.env` và `serviceAccountKey.json` vào thư mục `surf-server/`
    2. Chép file `.env` vào thư mục `surf-client/`
    3. Chép file `.env` vào thư mục `surf-mobile/`
- **Cơ sở dữ liệu mẫu:** Do hệ thống sử dụng **Firebase Firestore (NoSQL)** hoạt động trên Cloud, toàn bộ schema (Collections: `users`, `posts`, `messages`,...), Rules và dữ liệu mẫu **đã tồn tại sẵn trực tuyến**. Hệ thống sẽ tự động fetch dữ liệu về khi ứng dụng chạy. **Không cần chạy script tạo database** hay import dữ liệu thủ công.
- **Firebase Rules:** File cấu hình Rule gốc có thể kiểm chứng tại `firestore.rules` và `storage.rules` ở thư mục gốc của repo.

### 5. Báo Cáo Đồ Án
File báo cáo hoàn chỉnh (`.pdf`) đã được nộp đính kèm ngay trong Repository. Giảng viên vui lòng kiểm tra tại thư mục `Reports/` của mã nguồn.

---

<div align="center">
  <p><i>"Ride the wave of next-gen social networking."</i></p>
  <b>Developed with ❤️ by <a href="https://github.com/nguyenloc110905-coder">Nguyen Loc</a> & The Surf Team LDSK</b>
</div>
