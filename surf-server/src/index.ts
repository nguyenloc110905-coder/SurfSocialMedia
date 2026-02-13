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

const app = express();
const httpServer = createServer(app);
const PORT = Number(process.env.PORT) || 4000;
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173,http://localhost:5174';
const frontendUrls = frontendUrl.split(',').map((u) => u.trim()).filter(Boolean);
const corsOrigin = frontendUrls.length > 1 ? frontendUrls : frontendUrls[0] ?? 'http://localhost:5173';

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
  
  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });
});

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());

// Mọi request /api đều cần đăng nhập; ensureUser tạo doc user nếu chưa có (để xuất hiện trong Gợi ý kết bạn)
app.use('/api', requireAuth, ensureUser);

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/friends', friendsRoutes);

app.get('/health', (_, res) => res.json({ ok: true }));

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Surf API http://0.0.0.0:${PORT}`);
  console.log(`🔌 Socket.io ready`);
});
