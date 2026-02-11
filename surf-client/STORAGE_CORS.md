# Cấu hình CORS cho Firebase Storage (bắt buộc khi chạy localhost)

Lỗi **"blocked by CORS policy"** khi đổi ảnh đại diện / ảnh bìa là do bucket Firebase Storage chưa cho phép request từ `http://localhost:5174`. Cần làm **đúng 3 bước** dưới đây **một lần** trên máy bạn.

---

## Bước 1: Cài Google Cloud SDK

- Vào: https://cloud.google.com/sdk/docs/install  
- Chọn Windows → tải installer và cài.  
- Hoặc mở **PowerShell** (Run as Administrator) và chạy:  
  `winget install Google.CloudSDK`

Đóng rồi mở lại terminal sau khi cài.

---

## Bước 2: Đăng nhập Google (tài khoản dùng Firebase)

Mở **PowerShell** hoặc **CMD**, chạy:

```bash
gcloud auth login
```

Mở link trong trình duyệt, đăng nhập đúng tài khoản Google của project Firebase **surf-7ce71**.

---

## Bước 3: Bật CORS cho bucket Storage

Trong terminal, chạy:

```bash
cd D:\DuanCode\Surf\surf-client
gsutil cors set cors.json gs://surf-7ce71.firebasestorage.app
```

Nếu báo lỗi "gsutil not found", mở **Command Prompt** từ **Start Menu** → gõ **"Google Cloud SDK Shell"** và mở app đó, rồi chạy lại hai lệnh `cd` và `gsutil` ở trên.

Khi thành công sẽ không có thông báo lỗi. Sau đó:

1. Tắt hẳn app (Ctrl+C trong terminal chạy `npm run dev`).
2. Chạy lại `npm run dev`.
3. Vào trang cá nhân và thử đổi ảnh đại diện / ảnh bìa lại.

---

## Nếu vẫn lỗi

- Vào **Firebase Console** → **Storage** → **Rules**: đảm bảo có rule cho phép user ghi file trong `users/{userId}` (ví dụ: `request.auth != null && request.auth.uid == userId`).
- Kiểm tra lại tên bucket: trong Firebase Console → Project settings → Storage, xem tên bucket (dạng `ten-du-an.firebasestorage.app`) và thay đúng trong lệnh `gsutil`.
