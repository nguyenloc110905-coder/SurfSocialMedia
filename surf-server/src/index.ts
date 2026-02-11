import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import postsRoutes from './routes/posts.js';
import feedRoutes from './routes/feed.js';

const app = express();
const PORT = process.env.PORT || 4000;
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

app.use(cors({ origin: frontendUrl, credentials: true }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/feed', feedRoutes);

app.get('/health', (_, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Surf API http://localhost:${PORT}`);
});
