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

### 5. Chia sẻ link cho bất kỳ ai — đăng ký và kết bạn (không cần cùng WiFi)

Để **ai có link cũng có thể đăng ký và kết bạn**, không bắt buộc cùng mạng Wi‑Fi, dùng một trong hai cách:

---

#### Cách A: Dùng tunnel (phù hợp khi đang dev)

Tunnel tạo URL công khai tạm thời trỏ vào máy bạn. Ai mở link đó đều vào được app.

**Bước 1 – Chạy app như bình thường**

- Cấu hình Firebase (server + client) như mục 2 và 4.
- **Không** đặt `VITE_API_URL` trong `surf-client/.env`.
- Chạy backend: `cd surf-server && npm run dev`
- Chạy frontend: `cd surf-client && npm run dev`

**Bước 2 – Tạo tunnel cho frontend và API**

Cần 2 URL công khai: một cho app (port 5173), một cho API (port 4000).

- **Cài ngrok** (https://ngrok.com) hoặc dùng **Cloudflare Tunnel** (https://developers.cloudflare.com/cloudflare-one/connections/connect-apps).

Ví dụ với **ngrok** (sau khi cài và đăng ký):

```bash
# Terminal 1: tunnel cho frontend
ngrok http 5173

# Terminal 2: tunnel cho API (mở terminal mới)
ngrok http 4000
```

Ngrok sẽ in ra 2 URL dạng `https://xxxx-xx-xx-xx-xx.ngrok-free.app`. Ghi lại:
- URL frontend (port 5173), ví dụ: `https://abc123.ngrok-free.app`
- URL API (port 4000), ví dụ: `https://def456.ngrok-free.app`

**Bước 3 – Cấu hình CORS và API URL**

- Trong `surf-server/.env` thêm hoặc sửa:
  ```env
  FRONTEND_URL=https://abc123.ngrok-free.app
  ```
  (thay bằng URL frontend tunnel của bạn)

- Trong `surf-client/.env` đặt API trỏ sang URL tunnel của API:
  ```env
  VITE_API_URL=https://def456.ngrok-free.app
  ```
  (thay bằng URL API tunnel của bạn)

- **Khởi động lại** cả surf-server và surf-client (để đọc lại `.env`).

**Bước 4 – Chia sẻ link**

- Chia sẻ **URL frontend** (vd: `https://abc123.ngrok-free.app`) cho bạn bè.
- Ai mở link đó đều có thể đăng ký, đăng nhập và kết bạn với nhau (Gợi ý / Lời mời / Trang cá nhân → Thêm bạn bè).

**Lưu ý tunnel:** URL ngrok đổi mỗi lần chạy (trừ khi dùng bản trả phí). Khi đổi URL, cập nhật lại `FRONTEND_URL` và `VITE_API_URL`, đồng thời thêm domain tunnel vào **Authorized domains** trong Firebase Console (Authentication → Settings → Authorized domains) để đăng nhập hoạt động.

---

#### Cách B: Deploy lên production (link cố định, dùng lâu dài)

Deploy frontend + API lên internet để có link cố định. **Ai có link đều đăng ký và kết bạn được**, không cần cùng WiFi.

Thứ tự làm: **deploy API trước** → lấy URL API → **deploy frontend** (build kèm URL API) → cấu hình Firebase → chia sẻ link.

---

**Bước 1 – Deploy API (surf-server) lên Render**

Render (https://render.com) có free tier, không cần Docker, deploy Node.js trực tiếp.

1. **Đăng ký / đăng nhập Render** (có thể dùng GitHub).

2. **Tạo Web Service mới:**
   - Dashboard → **New +** → **Web Service**.
   - Nếu dùng GitHub: chọn repo **Surf**, branch (vd: `main`).  
   - Nếu không dùng GitHub: chọn **Deploy an existing image from a registry** hoặc dùng **Public Git repository** (nếu repo public).

3. **Cấu hình dịch vụ:**
   - **Name:** `surf-api` (hoặc tên bất kỳ).
   - **Region:** chọn gần bạn (vd: Singapore).
   - **Root Directory:** `surf-server` (quan trọng — Render build trong thư mục này).
   - **Runtime:** `Node`.
   - **Build Command:**  
     ```bash
     npm install && npm run build
     ```
   - **Start Command:**  
     ```bash
     npm start
     ```
   - **Instance type:** Free (hoặc paid nếu cần).

4. **Biến môi trường (Environment Variables):**
   - **FRONTEND_URL** = `https://surf-7ce71.web.app` (sẽ dùng sau khi deploy frontend; nếu đã đổi domain thì điền đúng URL app của bạn).
   - **NODE_ENV** = `production`.
   - **PORT** = Render tự gán, không cần tạo (trừ khi doc Render yêu cầu).
   - **Firebase:** Chọn một trong hai:
     - **FIREBASE_SERVICE_ACCOUNT_JSON:**  
       Vào Firebase Console → Project settings → Service accounts → Generate new private key. Mở file JSON, **copy toàn bộ nội dung** (từ `{` đến `}`), paste vào giá trị biến (Render cho phép giá trị nhiều dòng).  
     - Hoặc **FIREBASE_SERVICE_ACCOUNT_PATH:** Trên Render thường không dùng file local; nên dùng `FIREBASE_SERVICE_ACCOUNT_JSON` như trên.

5. **Deploy:** Bấm **Create Web Service**. Render sẽ build và chạy; đợi đến khi status **Live**.

6. **Lấy URL API:** Trên trang service, có dạng `https://surf-api-xxxx.onrender.com`. Copy URL này — dùng làm **VITE_API_URL** ở bước 2.

**Lưu ý:** Free tier Render có thể sleep sau vài phút không có request; lần đầu mở app sau khi sleep sẽ chậm vài giây.

---

**Bước 2 – Deploy frontend (surf-client) lên Firebase Hosting**

Frontend cần build với **đúng URL API** vừa deploy (Render) để app gọi đúng server.

1. **Cấu hình API URL khi build:**
   - Trong `surf-client` tạo hoặc sửa file `.env.production` (dùng khi `npm run build`):
     ```env
     VITE_API_URL=https://surf-api-xxxx.onrender.com
     ```
     Thay `https://surf-api-xxxx.onrender.com` bằng **đúng URL API** bạn đã copy ở Bước 1 (không có dấu `/` ở cuối).
   - Các biến Firebase và Cloudinary (nếu dùng) vẫn đặt trong `.env` hoặc `.env.production` như bình thường (vd: `VITE_FIREBASE_API_KEY`, …).

2. **Build và deploy:**
   - Từ **thư mục gốc Surf** (có `firebase.json`):
     ```bash
     firebase login
     cd surf-client
     npm run build
     cd ..
     firebase deploy
     ```
   - Nếu chưa có `firebase.json` / `.firebaserc`: chạy `firebase init` trong thư mục gốc, chọn Hosting, chọn project Firebase, set **public directory** = `surf-client/dist`.

3. **Kiểm tra:** Mở URL Hosting (vd: `https://surf-7ce71.web.app`). App mở được, đăng nhập không báo lỗi CORS là ổn.

---

**Bước 3 – Cấu hình Firebase Authorized domains**

Để đăng nhập (Email/Google…) hoạt động trên domain production:

1. Vào **Firebase Console** → project của bạn → **Authentication** → **Settings** (tab) → **Authorized domains**.
2. Kiểm tra đã có domain của Hosting (vd: `surf-7ce71.web.app`). Nếu chưa → **Add domain** → nhập domain (không cần `https://`) → Save.

Không cần thêm domain API (Render) vào Authorized domains; chỉ cần domain **frontend** (nơi user mở app).

---

**Bước 4 – Cập nhật CORS trên API (nếu dùng domain khác)**

Nếu bạn **không** dùng `surf-7ce71.web.app` mà dùng domain khác (subdomain, custom domain):

- Trên Render (hoặc nơi chạy surf-server), sửa biến **FRONTEND_URL** = đúng URL app (vd: `https://my-surf-app.web.app`).  
- Rồi **redeploy** API (Render → Manual Deploy hoặc push code nếu đã nối GitHub).

Sau đó build lại frontend (vẫn với cùng `VITE_API_URL`) và deploy lại Hosting nếu cần.

---

**Bước 5 – Chia sẻ link và sử dụng**

- Link app = URL Firebase Hosting (vd: `https://surf-7ce71.web.app`).
- Gửi link này cho bất kỳ ai; họ mở bằng trình duyệt (điện thoại, máy tính, mạng khác đều được).
- Đăng ký / đăng nhập → vào **Cài đặt** hoặc **Chỉnh sửa hồ sơ** ít nhất một lần → sau đó có thể vào **Bạn bè** → Gợi ý / Lời mời để kết bạn.

---

**Tóm tắt thứ tự**

| Bước | Việc làm |
|------|----------|
| 1 | Deploy surf-server lên Render, cấu hình env (Firebase + FRONTEND_URL), copy URL API. |
| 2 | Trong surf-client đặt `VITE_API_URL` (trong `.env.production`) = URL API → `npm run build` → `firebase deploy`. |
| 3 | Firebase Console → Authorized domains thêm domain frontend (nếu chưa có). |
| 4 | (Tùy chọn) Nếu đổi domain frontend thì sửa FRONTEND_URL trên Render và redeploy API. |
| 5 | Chia sẻ link app; ai có link đều đăng ký và kết bạn được. |

**Nền tảng khác cho API:** Nếu không dùng Render, có thể deploy **surf-server** lên **Railway** (railway.app) hoặc **Fly.io**; cách làm tương tự: chọn root `surf-server`, build `npm install && npm run build`, start `npm start`, set `FRONTEND_URL` và Firebase env. Sau đó dùng URL API đó làm `VITE_API_URL` khi build frontend như Bước 2.

---

#### Đăng ký và kết bạn (dùng chung cho Cách A và B)

1. Mỗi người mở link (tunnel hoặc production), đăng ký/đăng nhập bằng Firebase.
2. Mỗi người nên mở **Cài đặt** hoặc **Chỉnh sửa hồ sơ** ít nhất một lần để tạo hồ sơ trên server (xuất hiện trong Gợi ý kết bạn).
3. **Kết bạn:** A vào Bạn bè → Gợi ý (hoặc trang cá nhân của B) → **Thêm bạn bè**; B vào Bạn bè → Lời mời kết bạn → **Xác nhận**.

Dữ liệu bạn bè và lời mời lưu trên Firestore qua surf-server; cần cấu hình Firebase Admin trong `surf-server/.env`.

---

### 6. Chạy trên mạng LAN (cùng WiFi, không dùng tunnel)

Nếu chỉ cần hai máy **cùng Wi‑Fi** truy cập (không cần link công khai):

1. Máy chạy code: cấu hình Firebase, không đặt `VITE_API_URL`. Có thể đặt `FRONTEND_URL=http://<IP>:5173,http://localhost:5173` trong `surf-server/.env`.
2. Chạy backend rồi frontend với `npm run dev -- --host` trong surf-client.
3. Máy kia mở trình duyệt: `http://<IP_máy_chạy_code>:5173` (xem IP bằng `ipconfig` trên Windows).

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
