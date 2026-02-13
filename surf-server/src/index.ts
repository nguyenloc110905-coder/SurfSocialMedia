import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import postsRoutes from './routes/posts.js';
import feedRoutes from './routes/feed.js';
import friendsRoutes from './routes/friends.js';

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
const frontendUrls = frontendUrl.split(',').map((u) => u.trim()).filter(Boolean);
const corsOrigin = frontendUrls.length > 1 ? frontendUrls : frontendUrl;

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/friends', friendsRoutes);

app.get('/health', (_, res) => res.json({ ok: true }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Surf API http://0.0.0.0:${PORT}`);
});
