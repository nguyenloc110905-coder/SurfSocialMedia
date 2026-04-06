import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? '' });
const MODEL = 'gemini-2.5-flash';

export interface ModerationResult {
  allowed: boolean;
  reason?: string;
}

async function callGemini(prompt: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
  });
  return response.text ?? '';
}

async function callGeminiWithImage(prompt: string, base64: string, mimeType: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: [
      { parts: [{ inlineData: { data: base64, mimeType } }, { text: prompt }] },
    ],
  });
  return response.text ?? '';
}

/**
 * Kiểm duyệt nội dung văn bản (caption, content).
 */
export async function moderateText(text: string): Promise<ModerationResult> {
  if (!text?.trim()) return { allowed: true };

  const prompt = `Bạn là hệ thống kiểm duyệt nội dung mạng xã hội. Hãy phân tích đoạn văn bản sau và xác định xem có vi phạm không.

Các nội dung VI PHẠM bao gồm:

BẠO LỰC & GÂY HẠI:
- Mô tả hoặc cổ vũ hành vi bạo lực (đánh nhau, giết người, tra tấn, hành hạ)
- Nội dung liên quan đến chiến tranh, khủng bố, tổ chức cực đoan
- Vũ khí (dao, súng, bom, chất nổ...) trong ngữ cảnh gây hại hoặc đe dọa
- Hướng dẫn hoặc khuyến khích làm hại người khác

ĐE DỌA & HÀNH VI NGUY HIỂM:
- Đe dọa trực tiếp hoặc gián tiếp đến cá nhân hoặc tổ chức
- Kích động bạo lực, gây rối hoặc hành vi nguy hiểm ngoài đời thực
- Tiết lộ thông tin cá nhân người khác (doxxing)

NỘI DUNG TÌNH DỤC & 18+:
- Nội dung khiêu dâm, mô tả hành vi tình dục
- Hình ảnh/video có yếu tố gợi dục rõ ràng
- Nội dung fetish hoặc mang tính kích thích tình dục
- BẤT KỲ nội dung tình dục liên quan đến trẻ vị thành niên (cấm tuyệt đối)

THÙ GHÉT & PHÂN BIỆT ĐỐI XỬ:
- Ngôn từ kích động thù hận (chủng tộc, giới tính, tôn giáo, quốc gia...)
- Xúc phạm, hạ thấp nhân phẩm một nhóm người
- Sử dụng từ ngữ mang tính miệt thị, phân biệt

QUẤY RỐI & LĂNG MẠ:
- Bắt nạt, xúc phạm, công kích cá nhân
- Nội dung mang tính sỉ nhục, làm nhục người khác
- Kêu gọi người khác tấn công hoặc "ném đá" một cá nhân/tổ chức

TỰ GÂY HẠI & TỰ TỬ:
- Nội dung cổ vũ hoặc bình thường hóa việc tự hại
- Hướng dẫn cách tự tử hoặc tự gây thương tích
- Dấu hiệu người dùng có ý định tự tử

THÔNG TIN SAI LỆCH & NỘI DUNG GÂY HẠI:
- Tin giả nguy hiểm (y tế, an toàn, xã hội)
- Lừa đảo, gian lận, nội dung đánh lừa người dùng
- Giả mạo danh tính hoặc gây hiểu nhầm

HOẠT ĐỘNG BẤT HỢP PHÁP:
- Buôn bán, sử dụng chất cấm
- Hướng dẫn phạm tội (hack, lừa đảo, vượt hệ thống)
- Các hành vi vi phạm pháp luật khác

SPAM & NỘI DUNG ĐỘC HẠI:
- Nội dung lặp lại, spam, không có giá trị
- Link lừa đảo, phishing, malware

Văn bản cần kiểm tra:
"""
${text}
"""

Trả lời theo đúng định dạng JSON sau, không thêm gì khác:
{"allowed": true} nếu nội dung ổn
{"allowed": false, "reason": "lý do ngắn gọn bằng tiếng Việt"} nếu vi phạm`;

  try {
    const raw = (await callGemini(prompt)).trim();
    console.log(`[Moderation] Text result: ${raw}`);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { allowed: true };
    const parsed = JSON.parse(match[0]);
    return { allowed: parsed.allowed === true, reason: parsed.reason };
  } catch (err) {
    console.error('[Moderation] Text check error:', err);
    return { allowed: true };
  }
}

/**
 * Kiểm duyệt ảnh từ URL (Cloudinary).
 */
export async function moderateImageUrl(imageUrl: string): Promise<ModerationResult> {
  if (!imageUrl) return { allowed: true };

  const prompt = `Bạn là hệ thống kiểm duyệt ảnh mạng xã hội. Hãy xem ảnh này và xác định xem có vi phạm không.

Các nội dung VI PHẠM bao gồm:

BẠO LỰC & GÂY HẠI:
- Hình ảnh bạo lực, máu me, thương tích nặng, tra tấn
- Vũ khí bất kỳ (dao, kiếm, súng, bom...) trong ngữ cảnh gây hại hoặc đe dọa
- Hình ảnh chiến tranh, khủng bố, tổ chức cực đoan có tính kích động

NỘI DUNG TÌNH DỤC & 18+:
- Hình ảnh khiêu dâm, lõa thể, hành vi tình dục
- Nội dung gợi dục rõ ràng
- BẤT KỲ nội dung tình dục liên quan đến trẻ vị thành niên (cấm tuyệt đối)

THÙ GHÉT & PHÂN BIỆT ĐỐI XỬ:
- Hình ảnh mang tính kỳ thị chủng tộc, tôn giáo, giới tính
- Biểu tượng thù hận, phân biệt

TỰ GÂY HẠI:
- Hình ảnh tự làm thương tích bản thân
- Nội dung cổ vũ tự tử

Trả lời theo đúng định dạng JSON sau, không thêm gì khác:
{"allowed": true} nếu ảnh ổn
{"allowed": false, "reason": "lý do ngắn gọn bằng tiếng Việt"} nếu vi phạm`;

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.warn(`[Moderation] Could not fetch image (${response.status}): ${imageUrl}`);
      return { allowed: true };
    }
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const mimeType = response.headers.get('content-type') ?? 'image/jpeg';

    const raw = (await callGeminiWithImage(prompt, base64, mimeType)).trim();
    console.log(`[Moderation] Image result for ${imageUrl.substring(0, 60)}: ${raw}`);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { allowed: true };
    const parsed = JSON.parse(match[0]);
    return { allowed: parsed.allowed === true, reason: parsed.reason };
  } catch (err) {
    console.error('[Moderation] Image check error:', err);
    return { allowed: true };
  }
}

/**
 * Kiểm duyệt toàn bộ bài đăng: text + tất cả ảnh.
 */
export async function moderatePost(
  content: string,
  mediaUrls: string[],
): Promise<ModerationResult> {
  const textResult = await moderateText(content);
  if (!textResult.allowed) return textResult;

  const imageUrls = mediaUrls.filter(
    (u) => !u.includes('/video/upload/') && !/\.(mp4|webm|mov|avi|mkv|ogv)(\?|$)/i.test(u),
  );

  for (const url of imageUrls) {
    const imgResult = await moderateImageUrl(url);
    if (!imgResult.allowed) return imgResult;
  }

  return { allowed: true };
}
