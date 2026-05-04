import { getDb } from './config/firebase-admin.js';
import { logger } from './config/logger.js';

import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import morgan from 'morgan';
import { createServer } from 'http';
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
import conversationsRoutes from './routes/conversations.js';
import messagesRoutes from './routes/messages.js';
import groupsRoutes from './routes/groups.js';
import presenceRoutes from './routes/presence.js';
import callsRoutes from './routes/calls.js';
import marketplaceRoutes from './routes/marketplace.js';
import { initRedis, initSocketRedisAdapter } from './config/redis.js';
import { initIo } from './realtime/io.js';
import { registerSocketHandlers } from './realtime/register-socket-handlers.js';

const app = express();
const httpServer = createServer(app);
const PORT = Number(process.env.PORT) || 4000;
const lanOriginPattern = /^https?:\/\/(?:localhost|127\.0\.0\.1|(?:\d{1,3}\.){3}\d{1,3})(?::\d+)?$/;

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

const isAllowedOrigin = (origin?: string) => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  return lanOriginPattern.test(origin);
};

const corsOrigin = (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
) => {
  if (isAllowedOrigin(origin)) {
    callback(null, true);
    return;
  }

  callback(new Error(`Origin ${origin ?? 'unknown'} is not allowed by CORS`));
};

const io = initIo(httpServer, corsOrigin as never);
registerSocketHandlers(io);

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(morgan('dev', { stream: { write: (msg) => logger.http(msg.trimEnd()) } }));

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
app.use('/api/conversations', conversationsRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/groups', groupsRoutes);
app.use('/api/presence', presenceRoutes);
app.use('/api/calls', callsRoutes);
app.use('/api/marketplace', marketplaceRoutes);

initRedis()
  .then(() => initSocketRedisAdapter(io))
  .catch((err) => {
    console.error('Failed to initialize Redis:', err);
  });
app.use('/api/notifications', notificationsRoutes);

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
    logger.error('[Trash cleanup] Lỗi', { stack: e instanceof Error ? e.stack : String(e) });
  }
}

// Global error handler — phải đặt sau tất cả routes
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(err.message, { stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// Chạy ngay khi khởi động server, sau đó mỗi giờ một lần
cleanupTrash();
setInterval(cleanupTrash, 60 * 60 * 1000);
