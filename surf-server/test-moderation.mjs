import dotenv from 'dotenv';
dotenv.config();
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash-lite'; // working model

const testCases = [
  'Tao ghét người da đen',
  'dao thái',
  'Hôm nay trời đẹp quá',
];

for (const text of testCases) {
  const prompt = `Bạn là hệ thống kiểm duyệt nội dung mạng xã hội. Phân tích văn bản sau có vi phạm không (bạo lực, vũ khí, kỳ thị chủng tộc, 18+). Trả lời JSON: {"allowed":true} hoặc {"allowed":false,"reason":"..."}\n\nVăn bản: "${text}"`;
  const response = await ai.models.generateContent({ model: MODEL, contents: prompt });
  console.log(`"${text}" => ${response.text?.trim()}`);
}

