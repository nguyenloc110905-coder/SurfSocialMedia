# Cloudinary – Upload ảnh từ browser

Ứng dụng dùng **unsigned upload** từ trình duyệt: không cần `api_secret` trên client, chỉ cần **Upload preset** (Unsigned).

## Cấu hình

1. Vào [Cloudinary Dashboard](https://console.cloudinary.com/) → **Settings** → **Upload**.
2. Mục **Upload presets** → **Add upload preset**.
3. Đặt **Signing Mode** = **Unsigned** (preset Unsigned không cho overwrite; code dùng public_id duy nhất mỗi lần: `avatar_ts`, `cover_ts`, `highlight_ts`).
4. (Tùy chọn) **Folder** có thể để trống; code sẽ gửi folder `users/{uid}`.
5. Lưu và copy **Preset name** (ví dụ `surf_PRJ`).

## Cấu hình (chọn một trong hai)

**Cách 1 – Sửa trực tiếp (khuyên dùng):** mở `src/lib/cloudinary-config.ts`, sửa 3 hằng số:
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_UPLOAD_PRESET`

**Cách 2 – Dùng .env:** thêm vào `.env` (và chạy script để sinh `public/cloudinary-config.js`):

```env
VITE_CLOUDINARY_CLOUD_NAME=dg8oqqjes
VITE_CLOUDINARY_API_KEY=627384989373517
VITE_CLOUDINARY_UPLOAD_PRESET=surf_PRJ
```

- **Không** đặt `api_secret` trong frontend (chỉ dùng cho server nếu sau này có backend upload).

## Luồng hiện tại

- Avatar, cover, ảnh nổi bật: resize (nếu cần) → `uploadImage()` → lưu URL vào Firestore và Auth (photoURL).
