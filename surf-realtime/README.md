# Surf Realtime (Fastify Skeleton)

Khung message realtime cho app kiểu LinkedIn/Facebook:

- `REST` chỉ để load inbox/history ban đầu.
- `Socket.IO` để gửi nhận message, typing, read-receipt.
- `Redis` để scale nhiều instance + lưu presence/unread nóng.
- `Firestore` để lưu message bền vững.

## 1) Chạy nhanh

```bash
cd surf-realtime
cp .env.example .env
npm install
npm run dev
```

Server mặc định chạy ở `http://localhost:4100`.

## 2) Cấu trúc thư mục

```txt
src/
  app.ts
  index.ts
  config/
    env.ts
    firebase-admin.ts
  plugins/
    auth.ts
  realtime/
    socket.ts
  repositories/
    chat-repository.ts
  routes/
    messages.ts
  services/
    redis-service.ts
```

## 3) Firestore schema gợi ý

### `conversations/{conversationId}`

```json
{
  "type": "direct",
  "memberIds": ["uidA", "uidB"],
  "memberKey": "uidA__uidB",
  "lastMessageText": "hello",
  "lastMessageAt": "serverTimestamp",
  "updatedAt": "serverTimestamp",
  "createdAt": "serverTimestamp"
}
```

### `conversations/{conversationId}/messages/{messageId}`

```json
{
  "conversationId": "uidA__uidB",
  "senderId": "uidA",
  "text": "hello",
  "clientMessageId": "uuid-from-client",
  "createdAt": "serverTimestamp"
}
```

## 4) REST endpoints (khởi tạo UI)

- `GET /api/messages/inbox?cursor=<ms>&limit=20`
- `POST /api/messages/direct/:peerUid/conversation`
- `GET /api/messages/:conversationId?cursor=<ms>&limit=30`
- `POST /api/messages/:conversationId/read`

Header auth: `Authorization: Bearer <firebase-id-token>`.

## 5) Socket events

Client -> Server:

- `presence:ping`
- `conversation:join` `{ conversationId }`
- `conversation:leave` `{ conversationId }`
- `message:send` `{ conversationId, text, clientMessageId? }`
- `message:read` `{ conversationId, messageId }`
- `typing` `{ conversationId, isTyping }`

Server -> Client:

- `message:new` `{ conversationId, message }`
- `conversation:updated` `{ conversationId, lastMessageText, lastMessageAt }`
- `message:read` `{ conversationId, messageId, readerId, readAt }`
- `typing` `{ conversationId, userId, isTyping }`

## 6) Redis key design

- `presence:user:{uid}` (TTL)
- `unread:{uid}:{conversationId}`

## 7) Gắn vào app hiện tại

1. Frontend mở thêm socket tới `surf-realtime` (không dùng socket ở `surf-server` cho chat mới).
2. Sau login, truyền Firebase ID token trong `socket.auth.token`.
3. Mở trang inbox:
   - Gọi `GET /api/messages/inbox`.
4. Mở cuộc trò chuyện:
   - Gọi `GET /api/messages/:conversationId`.
   - Emit `conversation:join`.
5. Bấm gửi:
   - Emit `message:send`.
   - Nhận `message:new` để cập nhật cả 2 phía realtime.

## 8) Checklist tối ưu request/s

- Không polling inbox 1-2 giây/lần.
- Typing indicator debounce 300-500ms.
- Read receipt gửi theo batch.
- Dùng cursor pagination, không load full history.
- Cache unread/presence bằng Redis, hạn chế đọc Firestore.
