# Surf - Social Media

Dự án social kiểu Threads/FB, dùng Firebase.

## Cấu trúc

- **surf-server** – API Node.js (Express + Firebase Admin)
- **surf-client** – Giao diện React (Vite)
- **surf-realtime** – Backend realtime (chưa triển khai)
- **docs** – Tài liệu

## Chạy dự án

### 1. Cài dependency

```bash
cd surf-server && npm install
cd ../surf-client && npm install
```

### 2. Chạy backend (API)

```bash
cd surf-server
npm run dev
```

API chạy tại **http://localhost:4000** (hoặc port trong `.env`).

**Lưu ý:** Để dùng đăng nhập, feed, bài viết… cần cấu hình Firebase:

- Tạo file `.env` trong `surf-server` (xem `surf-server/.env.example`)
- Đặt `FIREBASE_SERVICE_ACCOUNT_PATH` hoặc `FIREBASE_SERVICE_ACCOUNT_JSON`

Nếu chưa cấu hình, server vẫn chạy; khi gọi API sẽ báo lỗi Firebase chưa cấu hình.

### 3. Chạy frontend

```bash
cd surf-client
npm run dev
```

Giao diện chạy tại **http://localhost:5173**.

Trong dev, Vite proxy `/api` sang `http://localhost:4000`, nên gọi API từ client qua `/api/...` sẽ tới surf-server.

### 4. (Tuỳ chọn) Cấu hình Firebase cho client

Trong `surf-client` tạo `.env` (xem `surf-client/.env.example`) và điền biến `VITE_FIREBASE_*` từ Firebase Console để dùng đăng nhập/đăng ký.

---

## 4. Triển khai lên Firebase Hosting

Tức là đưa **surf-client** (giao diện React) lên web, truy cập được qua **https://surf-7ce71.web.app**.

**Các bước (theo hướng dẫn Firebase):**

| Bước | Lệnh | Ý nghĩa |
|------|------|----------|
| 1. Đăng nhập Google | `firebase login` | Liên kết tài khoản Firebase với máy |
| 2. Khởi tạo dự án | `firebase init` | Chọn Hosting, chọn project (đã có sẵn `firebase.json` + `.firebaserc` trong repo) |
| 3. Triển khai | Build client rồi `firebase deploy` | Đẩy thư mục build lên Hosting |

**Trong repo Surf đã cấu hình sẵn:** `firebase.json` (hosting dùng `surf-client/dist`) và `.firebaserc` (project `surf-7ce71`). Chỉ cần:

```bash
# Từ thư mục gốc Surf
firebase login
cd surf-client && npm run build && cd ..
firebase deploy
```

Sau khi deploy xong, mở **https://surf-7ce71.web.app** để xem app.

**Lưu ý:** Hosting chỉ chạy **frontend**. API (surf-server) cần deploy riêng (VD: Cloud Run, Railway, Render) rồi cập nhật `VITE_API_URL` trong surf-client trỏ tới URL API đó.
