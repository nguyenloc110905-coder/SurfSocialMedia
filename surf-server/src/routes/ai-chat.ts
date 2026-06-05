import { Router, Request, Response } from 'express';
import OpenAI from 'openai';
import { AuthRequest } from '../middleware/auth.js';
import { getDb } from '../config/firebase-admin.js';

const router = Router();

function getOpenAIApiKey() {
  return (process.env.OPENAI_API_KEY ?? '').trim();
}

function getOpenAIClient() {
  return new OpenAI({ apiKey: getOpenAIApiKey() });
}

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
    res.json({ messages: doc.data()?.messages ?? [] });
  } catch (error) {
    console.error('[AI Chat] Failed to fetch history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
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

  if (!message) {
    res.status(400).json({ error: 'Message is required' });
    return;
  }

  const apiKey = getOpenAIApiKey();
  if (!apiKey) {
    res.status(503).json({ error: 'AI Assistant is currently unavailable (API key missing).' });
    return;
  }

  try {
    const openai = getOpenAIClient();

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

    const formattedHistory = Array.isArray(history) ? history.map((h: any) => ({
      role: h.role === 'model' || h.role === 'assistant' ? 'assistant' : 'user',
      content: h.text || h.content || '',
    })) : [];

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: `Bạn là Surf AI, trợ lý AI thân thiện dành riêng cho mạng xã hội Surf. Hãy trả lời người dùng một cách ngắn gọn, súc tích và hữu ích.${userContext}` },
        ...formattedHistory,
        { role: 'user', content: message }
      ],
    });

    const responseText = response.choices[0]?.message?.content ?? '';
    res.json({ text: responseText });

    // Save history to Firestore in background
    try {
      const newMessages = [
        ...(Array.isArray(history) ? history : []),
        { role: 'user', text: message },
        { role: 'model', text: responseText }
      ];
      // Keep only last 100 messages to prevent document size from getting too large
      const trimmedMessages = newMessages.slice(-100);

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
