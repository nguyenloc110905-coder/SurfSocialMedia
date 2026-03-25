import { getDb } from './config/firebase-admin.js';

import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { requireAuth, ensureUser } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import postsRoutes from './routes/posts.js';
import feedRoutes from './routes/feed.js';
import friendsRoutes from './routes/friends.js';
import commentsRoutes from './routes/comments.js';
import notificationsRoutes from './routes/notifications.js';
import momentsRoutes from './routes/moments.js';
import musicRoutes from './routes/music.js';
import videosRoutes from './routes/videos.js';

const app = express();
const httpServer = createServer(app);
const PORT = Number(process.env.PORT) || 4000;

// Allowed CORS origins
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://surf-7ce71.web.app',
  'https://surf-7ce71.firebaseapp.com',
];

// Add additional origins from environment variable if provided
const frontendUrl = process.env.FRONTEND_URL;
if (frontendUrl) {
  const envUrls = frontendUrl
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
  envUrls.forEach((url) => {
    if (!allowedOrigins.includes(url)) {
      allowedOrigins.push(url);
    }
  });
}

const corsOrigin = allowedOrigins;

// Setup Socket.io
export const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    credentials: true,
  },
});

io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);

  // Join room theo userId để nhận notifications riêng
  socket.on('join', (userId: string) => {
    socket.join(`user:${userId}`);
    const room = io.sockets.adapter.rooms.get(`user:${userId}`);
    const roomSize = room ? room.size : 0;
    console.log(`👤 User ${userId} joined their room (${roomSize} clients in room)`);
  });

  // RT-4: join/leave room để nhận comment:new real-time
  socket.on('post:join', (postId: string) => {
    socket.join(`post:${postId}`);
  });

  socket.on('post:leave', (postId: string) => {
    socket.leave(`post:${postId}`);
  });

  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });
});

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Health check — trước app.use('/api', requireAuth) để không cần auth
app.get('/api/health', (_, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    env: process.env.NODE_ENV ?? 'development',
  });
});

// Mọi request /api đều cần đăng nhập; ensureUser tạo doc user nếu chưa có (để xuất hiện trong Gợi ý kết bạn)
app.use('/api', requireAuth, ensureUser);

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/comments', commentsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/moments', momentsRoutes);
app.use('/api/music', musicRoutes);
app.use('/api/videos', videosRoutes);

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Surf API http://0.0.0.0:${PORT}`);
  console.log(`🔌 Socket.io ready`);
  console.log(`🏥 Health check: http://0.0.0.0:${PORT}/api/health`);
});

// ── Dọn thùng rác: xóa vĩnh viễn bài viết đã xóa quá 36 ngày ─────────────
async function cleanupTrash() {
  try {
    const db = getDb();
    const cutoff = Date.now() - 36 * 24 * 60 * 60 * 1000;
    const snap = await db.collection('posts').where('deleted', '==', true).get();
    if (snap.empty) return;
    const batch = db.batch();
    let count = 0;
    snap.docs.forEach((doc) => {
      const raw = doc.data().deletedAt;
      const ts: number = raw?.toMillis?.() ?? raw?.getTime?.() ?? 0;
      if (ts > 0 && ts < cutoff) {
        batch.delete(doc.ref);
        count++;
      }
    });
    if (count > 0) {
      await batch.commit();
      console.log(`[Trash cleanup] Đã xóa vĩnh viễn ${count} bài viết.`);
    }
  } catch (e) {
    console.error('[Trash cleanup] Lỗi:', e);
  }
}

// Chạy ngay khi khởi động server, sau đó mỗi giờ một lần
cleanupTrash();
setInterval(cleanupTrash, 60 * 60 * 1000);
