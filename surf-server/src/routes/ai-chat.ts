import { Router, Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import { getDb } from '../config/firebase-admin.js';

const router = Router();
const DEFAULT_OPENAI_CHAT_MODEL = 'gpt-4o-mini';
const MAX_HISTORY_MESSAGES = 100;
const MAX_REQUEST_HISTORY_MESSAGES = 30;
const MAX_MESSAGE_LENGTH = 4000;

type AiChatMessage = {
  role: 'user' | 'model';
  text: string;
};

type OpenAIChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

function getOpenAIApiKey() {
  return (process.env.OPENAI_API_KEY ?? '').trim();
}

function getOpenAIChatModel() {
  return (process.env.OPENAI_CHAT_MODEL ?? process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_CHAT_MODEL).trim() || DEFAULT_OPENAI_CHAT_MODEL;
}

function normalizeMessage(raw: unknown): AiChatMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const role = item.role === 'user' ? 'user' : item.role === 'model' || item.role === 'assistant' ? 'model' : null;
  const text = typeof item.text === 'string'
    ? item.text
    : typeof item.content === 'string'
      ? item.content
      : '';
  const trimmed = text.trim();
  if (!role || !trimmed) return null;
  return { role, text: trimmed.slice(0, MAX_MESSAGE_LENGTH) };
}

function normalizeHistory(raw: unknown, limit = MAX_REQUEST_HISTORY_MESSAGES): AiChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const messages = raw
    .map(normalizeMessage)
    .filter((item): item is AiChatMessage => item != null)
    .slice(-limit);

  while (messages[0]?.role === 'model') {
    messages.shift();
  }

  return messages;
}

async function callOpenAIChat(messages: OpenAIChatMessage[]) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getOpenAIApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: getOpenAIChatModel(),
      messages,
    }),
  });

  const rawText = await response.text();
  let payload: any = null;
  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || rawText || `OpenAI request failed (${response.status})`;
    throw new Error(message);
  }

  return payload?.choices?.[0]?.message?.content ?? '';
}

/**
 * @swagger
 * /api/ai-chat/status:
 *   get:
 *     tags: [AI Chat]
 *     summary: Kiểm tra trạng thái Surf AI
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OK
 */
router.get('/status', async (req: Request, res: Response): Promise<void> => {
  const uid = (req as AuthRequest).uid;
  if (!uid) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  res.json({
    available: Boolean(getOpenAIApiKey()),
    provider: 'openai',
    model: getOpenAIChatModel(),
  });
});

/**
 * @swagger
 * /api/ai-chat/history:
 *   get:
 *     tags: [AI Chat]
 *     summary: Lấy lịch sử chat với AI
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OK
 */
router.get('/history', async (req: Request, res: Response): Promise<void> => {
  const uid = (req as AuthRequest).uid;
  if (!uid) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const doc = await getDb().collection('users').doc(uid).collection('ai_history').doc('chat').get();
    res.json({ messages: normalizeHistory(doc.data()?.messages, MAX_HISTORY_MESSAGES) });
  } catch (error) {
    console.error('[AI Chat] Failed to fetch history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

/**
 * @swagger
 * /api/ai-chat/history:
 *   delete:
 *     tags: [AI Chat]
 *     summary: Xóa lịch sử chat với AI
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       204:
 *         description: Deleted
 */
router.delete('/history', async (req: Request, res: Response): Promise<void> => {
  const uid = (req as AuthRequest).uid;
  if (!uid) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    await getDb().collection('users').doc(uid).collection('ai_history').doc('chat').delete();
    res.status(204).send();
  } catch (error) {
    console.error('[AI Chat] Failed to delete history:', error);
    res.status(500).json({ error: 'Failed to delete history' });
  }
});

/**
 * @swagger
 * /api/ai-chat:
 *   post:
 *     tags: [AI Chat]
 *     summary: Gửi tin nhắn cho AI
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message: { type: string }
 *               history:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     role: { type: string, enum: [user, model] }
 *                     text: { type: string }
 *     responses:
 *       200:
 *         description: OK
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal Server Error
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const uid = (req as AuthRequest).uid;
  if (!uid) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { message, history } = req.body;
  const prompt = typeof message === 'string' ? message.trim().slice(0, MAX_MESSAGE_LENGTH) : '';

  if (!prompt) {
    res.status(400).json({ error: 'Message is required' });
    return;
  }

  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    res.status(503).json({ error: 'AI Assistant is currently unavailable (API key missing).' });
    return;
  }

  try {
    let userContext = '';
    try {
      const userDoc = await getDb().collection('users').doc(uid).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        if (userData) {
          const name = userData.displayName || 'Người dùng';
          const email = userData.email || '';
          const bio = userData.bio || userData.about || '';
          
          userContext = `\n\n--- THÔNG TIN NGƯỜI DÙNG HIỆN TẠI ---\n- Tên/Nickname: ${name}\n`;
          if (email) userContext += `- Email: ${email}\n`;
          if (bio) userContext += `- Tiểu sử/Giới thiệu bản thân: ${bio}\n`;
          userContext += `\nHướng dẫn: Hãy gọi tên của người dùng một cách thân thiện trong cuộc trò chuyện (nếu tự nhiên). Nếu người dùng hỏi bạn biết gì về họ, hãy sử dụng những thông tin trên để trả lời một cách tự nhiên. Tuyệt đối không xưng hô bằng Email.`;
        }
      }
    } catch (err) {
      console.error('[AI Chat] Failed to fetch user profile:', err);
    }

    const normalizedHistory = normalizeHistory(history);
    const formattedHistory = normalizedHistory.map((h) => ({
      role: h.role === 'model' ? 'assistant' as const : 'user' as const,
      content: h.text,
    }));

    const responseText = await callOpenAIChat([
        { role: 'system', content: `Bạn là Surf AI, trợ lý AI thân thiện dành riêng cho mạng xã hội Surf. Hãy trả lời người dùng một cách ngắn gọn, súc tích và hữu ích.${userContext}` },
        ...formattedHistory,
        { role: 'user', content: prompt }
      ]);
    res.json({ text: responseText });

    // Save history to Firestore in background
    try {
      const newMessages = [
        ...normalizedHistory,
        { role: 'user', text: prompt },
        { role: 'model', text: responseText }
      ];
      // Keep only last 100 messages to prevent document size from getting too large
      const trimmedMessages = newMessages.slice(-MAX_HISTORY_MESSAGES);

      await getDb()
        .collection('users')
        .doc(uid)
        .collection('ai_history')
        .doc('chat')
        .set({
          messages: trimmedMessages,
          updatedAt: new Date()
        }, { merge: true });
    } catch (saveErr) {
      console.error('[AI Chat] Failed to save history:', saveErr);
    }
  } catch (error) {
    console.error('[AI Chat] Error:', error);
    res.status(500).json({ error: 'Failed to communicate with AI Assistant.' });
  }
});

export default router;
