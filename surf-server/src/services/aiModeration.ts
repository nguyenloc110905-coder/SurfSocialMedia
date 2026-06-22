import { GoogleGenAI } from '@google/genai';

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-lite';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
type AiModerationProvider = 'openai' | 'gemini';

export interface ModerationResult {
  allowed: boolean;
  reason?: string;
}

export type MarketplaceModerationDecision = 'approved' | 'rejected' | 'needs_review';

export interface MarketplaceModerationInput {
  title: string;
  description: string;
  price: number;
  category: string;
  condition: string;
  location: string;
  mediaUrls: string[];
}

export interface MarketplaceModerationResult {
  decision: MarketplaceModerationDecision;
  reason?: string;
  confidence?: number;
  flags: string[];
  provider: AiModerationProvider;
}

function parseMarketplaceModeration(
  raw: string,
  provider: AiModerationProvider
): MarketplaceModerationResult | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  const parsed = JSON.parse(match[0]) as {
    decision?: unknown;
    reason?: unknown;
    confidence?: unknown;
    flags?: unknown;
  };
  const decision =
    parsed.decision === 'approved' ||
    parsed.decision === 'rejected' ||
    parsed.decision === 'needs_review'
      ? parsed.decision
      : null;
  if (!decision) return null;
  const result: MarketplaceModerationResult = {
    decision,
    flags: Array.isArray(parsed.flags)
      ? parsed.flags.filter((flag): flag is string => typeof flag === 'string')
      : [],
    provider,
  };
  if (typeof parsed.reason === 'string' && parsed.reason.trim())
    result.reason = parsed.reason.trim();
  if (typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)) {
    result.confidence = Math.min(1, Math.max(0, parsed.confidence));
  }
  return result;
}

function getGeminiApiKey() {
  return (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '').trim();
}

function getOpenAiApiKey() {
  return (process.env.OPENAI_API_KEY ?? '').trim();
}

function getGeminiClient() {
  return new GoogleGenAI({ apiKey: getGeminiApiKey() });
}

function getGeminiModel() {
  return (process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL;
}

function getOpenAiModel() {
  return (process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL).trim() || DEFAULT_OPENAI_MODEL;
}

function getPreferredAiModerationProvider(): AiModerationProvider {
  const configured = (
    process.env.MARKETPLACE_AI_PROVIDER ??
    process.env.AI_MODERATION_PROVIDER ??
    ''
  )
    .trim()
    .toLowerCase();
  if (configured === 'openai' || configured === 'gemini') return configured;
  return getOpenAiApiKey() ? 'openai' : 'gemini';
}

function hasProviderKey(provider: AiModerationProvider) {
  return provider === 'openai' ? Boolean(getOpenAiApiKey()) : Boolean(getGeminiApiKey());
}

export function getMarketplaceModerationProviderConfig() {
  const provider = getPreferredAiModerationProvider();
  const hasOpenAiKey = Boolean(getOpenAiApiKey());
  const hasGeminiKey = Boolean(getGeminiApiKey());
  return {
    provider,
    hasOpenAiKey,
    hasGeminiKey,
    hasAiKey: provider === 'openai' ? hasOpenAiKey : hasGeminiKey,
  };
}

function getMarketplaceImageModerationLimit() {
  const configured = Number(process.env.MARKETPLACE_AI_IMAGE_LIMIT ?? 1);
  if (!Number.isFinite(configured)) return 1;
  return Math.max(0, Math.min(3, Math.floor(configured)));
}

function getErrorText(err: unknown) {
  const message = err instanceof Error ? err.message : '';
  let raw = '';
  try {
    raw = JSON.stringify(err);
  } catch {
    raw = '';
  }
  return `${message} ${raw}`;
}

function getMarketplaceGeminiFailure(err: unknown): MarketplaceModerationResult {
  const text = getErrorText(err);
  if (/API_KEY_INVALID|API key not valid|INVALID_ARGUMENT/i.test(text)) {
    return {
      decision: 'needs_review',
      reason:
        'GEMINI_API_KEY không hợp lệ hoặc đã bị thu hồi. Hãy tạo/copy lại key từ Google AI Studio.',
      flags: ['invalid_gemini_key'],
      provider: 'gemini',
    };
  }
  if (/RESOURCE_EXHAUSTED|quota|rate limit|429/i.test(text)) {
    return {
      decision: 'needs_review',
      reason: 'Gemini đã hết quota hoặc bị giới hạn tần suất, cần thử lại sau.',
      flags: ['gemini_quota_exceeded'],
      provider: 'gemini',
    };
  }
  if (/model|not found|404/i.test(text)) {
    return {
      decision: 'needs_review',
      reason: 'Model Gemini đang cấu hình không khả dụng.',
      flags: ['gemini_model_unavailable'],
      provider: 'gemini',
    };
  }
  if (/UNAVAILABLE|high demand|503/i.test(text)) {
    return {
      decision: 'needs_review',
      reason: 'Model Gemini đang quá tải, cần thử lại sau hoặc đổi sang model nhẹ hơn.',
      flags: ['gemini_unavailable'],
      provider: 'gemini',
    };
  }
  return {
    decision: 'needs_review',
    reason: 'AI kiểm duyệt gặp lỗi, cần admin duyệt thủ công.',
    flags: ['ai_error'],
    provider: 'gemini',
  };
}

function getMarketplaceOpenAiFailure(err: unknown): MarketplaceModerationResult {
  const text = getErrorText(err);
  if (/invalid_api_key|Incorrect API key|401/i.test(text)) {
    return {
      decision: 'needs_review',
      reason:
        'OPENAI_API_KEY không hợp lệ hoặc đã bị thu hồi. Hãy tạo key mới trong OpenAI dashboard.',
      flags: ['invalid_openai_key'],
      provider: 'openai',
    };
  }
  if (/insufficient_quota|rate limit|429|quota/i.test(text)) {
    return {
      decision: 'needs_review',
      reason: 'OpenAI đã hết quota hoặc bị giới hạn tần suất, cần thử lại sau.',
      flags: ['openai_quota_exceeded'],
      provider: 'openai',
    };
  }
  if (/model_not_found|model|404/i.test(text)) {
    return {
      decision: 'needs_review',
      reason: 'Model OpenAI đang cấu hình không khả dụng.',
      flags: ['openai_model_unavailable'],
      provider: 'openai',
    };
  }
  if (/server_error|temporarily unavailable|503|502|500/i.test(text)) {
    return {
      decision: 'needs_review',
      reason: 'OpenAI đang quá tải hoặc tạm thời không khả dụng, cần thử lại sau.',
      flags: ['openai_unavailable'],
      provider: 'openai',
    };
  }
  return {
    decision: 'needs_review',
    reason: 'AI kiểm duyệt gặp lỗi, cần admin duyệt thủ công.',
    flags: ['ai_error'],
    provider: 'openai',
  };
}

function getMarketplaceProviderFailure(
  provider: AiModerationProvider,
  err: unknown
): MarketplaceModerationResult {
  return provider === 'openai'
    ? getMarketplaceOpenAiFailure(err)
    : getMarketplaceGeminiFailure(err);
}

async function callGemini(prompt: string): Promise<string> {
  const response = await getGeminiClient().models.generateContent({
    model: getGeminiModel(),
    contents: prompt,
  });
  return response.text ?? '';
}

async function callGeminiWithImage(
  prompt: string,
  base64: string,
  mimeType: string
): Promise<string> {
  const response = await getGeminiClient().models.generateContent({
    model: getGeminiModel(),
    contents: [{ parts: [{ inlineData: { data: base64, mimeType } }, { text: prompt }] }],
  });
  return response.text ?? '';
}

async function callOpenAi(prompt: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getOpenAiApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: getOpenAiModel(),
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Bạn là hệ thống kiểm duyệt an toàn. Chỉ trả về JSON hợp lệ, không thêm giải thích.',
        },
        { role: 'user', content: prompt },
      ],
    }),
  });
  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(data.error?.message || `OpenAI request failed: ${response.status}`);
  }
  return data.choices?.[0]?.message?.content ?? '';
}

async function callOpenAiWithImage(prompt: string, imageUrl: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getOpenAiApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: getOpenAiModel(),
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Bạn là hệ thống kiểm duyệt hình ảnh. Chỉ trả về JSON hợp lệ, không thêm giải thích.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
    }),
  });
  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(data.error?.message || `OpenAI image request failed: ${response.status}`);
  }
  return data.choices?.[0]?.message?.content ?? '';
}

async function callAi(prompt: string, provider: AiModerationProvider): Promise<string> {
  return provider === 'openai' ? callOpenAi(prompt) : callGemini(prompt);
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
  mediaUrls: string[]
): Promise<ModerationResult> {
  const textResult = await moderateText(content);
  if (!textResult.allowed) return textResult;

  const imageUrls = mediaUrls.filter(
    (u) => !u.includes('/video/upload/') && !/\.(mp4|webm|mov|avi|mkv|ogv)(\?|$)/i.test(u)
  );

  for (const url of imageUrls) {
    const imgResult = await moderateImageUrl(url);
    if (!imgResult.allowed) return imgResult;
  }

  return { allowed: true };
}

export async function moderateMarketplaceListing(
  input: MarketplaceModerationInput
): Promise<MarketplaceModerationResult> {
  const provider = getPreferredAiModerationProvider();
  if (!hasProviderKey(provider)) {
    return provider === 'openai'
      ? {
          decision: 'needs_review',
          reason: 'Chưa cấu hình OPENAI_API_KEY nên cần admin duyệt thủ công.',
          flags: ['missing_openai_key'],
          provider: 'openai',
        }
      : {
          decision: 'needs_review',
          reason: 'Chưa cấu hình GEMINI_API_KEY nên cần admin duyệt thủ công.',
          flags: ['missing_gemini_key'],
          provider: 'gemini',
        };
  }

  const textPrompt = `Bạn là hệ thống kiểm duyệt Marketplace. Hãy đánh giá bài niêm yết dưới đây trước khi cho hiển thị công khai.

Chính sách cần chặn:
- Hàng cấm hoặc nguy hiểm: vũ khí, chất cấm, thuốc không rõ nguồn gốc, giấy tờ giả, tài khoản/ngân hàng, nội dung 18+.
- Lừa đảo, giả mạo thương hiệu, yêu cầu chuyển tiền đáng ngờ, link/SDT spam.
- Mô tả gây hại, kích động bạo lực, thù ghét, quấy rối hoặc vi phạm pháp luật.
- Sản phẩm thiếu thông tin nghiêm trọng hoặc có dấu hiệu rủi ro cao thì chọn needs_review.

Bài niêm yết:
Tên: ${input.title}
Mô tả: ${input.description}
Giá: ${input.price} VND
Danh mục: ${input.category}
Tình trạng: ${input.condition}
Vị trí: ${input.location}
Số ảnh: ${input.mediaUrls.length}

Trả lời đúng JSON, không thêm nội dung ngoài JSON:
{"decision":"approved","confidence":0.9,"flags":[]}
{"decision":"rejected","reason":"lý do ngắn gọn tiếng Việt","confidence":0.95,"flags":["policy_violation"]}
{"decision":"needs_review","reason":"lý do cần admin xem","confidence":0.6,"flags":["suspicious"]}`;

  try {
    const textRaw = (await callAi(textPrompt, provider)).trim();
    const textResult = parseMarketplaceModeration(textRaw, provider);
    if (!textResult) {
      return {
        decision: 'needs_review',
        reason: 'AI trả về kết quả không đọc được, cần admin duyệt.',
        flags: ['invalid_ai_response'],
        provider,
      };
    }
    if (textResult.decision !== 'approved') return textResult;

    const imageUrls = input.mediaUrls
      .filter(
        (url) => !url.includes('/video/upload/') && !/\.(mp4|webm|mov|avi|mkv|ogv)(\?|$)/i.test(url)
      )
      .slice(0, getMarketplaceImageModerationLimit());

    for (const imageUrl of imageUrls) {
      const imagePrompt = `Kiểm duyệt ảnh sản phẩm Marketplace này. Chặn hàng cấm, vũ khí, chất cấm, ảnh 18+, bạo lực, lừa đảo, giấy tờ/tài khoản nhạy cảm. Nếu không chắc chắn hãy chọn needs_review.

Trả lời đúng JSON:
{"decision":"approved","confidence":0.9,"flags":[]}
{"decision":"rejected","reason":"lý do ngắn gọn tiếng Việt","confidence":0.95,"flags":["policy_violation"]}
{"decision":"needs_review","reason":"lý do cần admin xem","confidence":0.6,"flags":["suspicious_image"]}`;
      let imageRaw = '';
      if (provider === 'openai') {
        imageRaw = (await callOpenAiWithImage(imagePrompt, imageUrl)).trim();
      } else {
        const response = await fetch(imageUrl);
        if (!response.ok) {
          return {
            decision: 'needs_review',
            reason: 'Không tải được ảnh sản phẩm để AI kiểm duyệt.',
            flags: ['image_fetch_failed'],
            provider,
          };
        }
        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const mimeType = response.headers.get('content-type') ?? 'image/jpeg';
        imageRaw = (await callGeminiWithImage(imagePrompt, base64, mimeType)).trim();
      }
      const imageResult = parseMarketplaceModeration(imageRaw, provider);
      if (!imageResult) {
        return {
          decision: 'needs_review',
          reason: 'AI trả về kết quả kiểm duyệt ảnh không đọc được.',
          flags: ['invalid_image_ai_response'],
          provider,
        };
      }
      if (imageResult.decision !== 'approved') return imageResult;
    }

    return textResult;
  } catch (err) {
    console.error('[Moderation] Marketplace ' + provider + ' check error:', err);
    return getMarketplaceProviderFailure(provider, err);
  }
}

export async function moderateReportedComment(
  commentText: string,
  postText: string,
  reportReason: string
): Promise<{ violation: boolean; reason: string }> {
  const prompt = `Bạn là hệ thống AI kiểm duyệt tự động mạng xã hội. Người dùng vừa báo cáo một bình luận với lý do: "${reportReason}".
  
Nội dung bài viết gốc:
"""
${postText}
"""

Nội dung bình luận bị báo cáo:
"""
${commentText}
"""

Dựa vào ngữ cảnh bài viết và lý do báo cáo, hãy đánh giá bình luận này có THỰC SỰ vi phạm Tiêu chuẩn cộng đồng (Spam, chửi bới, xúc phạm, bạo lực, 18+, thông tin sai lệch...) hay không.

Trả lời duy nhất bằng JSON có định dạng sau:
{"violation": true, "reason": "Lý do ngắn gọn tại sao xóa bình luận này"} (nếu cần gỡ bỏ)
{"violation": false, "reason": "Lý do bình luận vẫn hợp lệ"} (nếu không vi phạm)`;

  try {
    const raw = (await callGemini(prompt)).trim();
    console.log(`[Moderation] Report Comment result: ${raw}`);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { violation: false, reason: 'Không thể phân tích phản hồi từ AI' };
    const parsed = JSON.parse(match[0]);
    return {
      violation: parsed.violation === true,
      reason: parsed.reason || '',
    };
  } catch (err) {
    console.error('[Moderation] Report Comment check error:', err);
    return { violation: false, reason: 'Lỗi hệ thống AI' };
  }
}

export async function moderateReportedPost(
  postText: string,
  mediaUrls: string[],
  reportReason: string
): Promise<{ violation: boolean; reason: string }> {
  const prompt = `Bạn là hệ thống AI kiểm duyệt tự động mạng xã hội. Người dùng vừa báo cáo một bài viết với lý do: "${reportReason}".
  
Nội dung bài viết bị báo cáo:
"""
${postText}
"""
Danh sách link ảnh/video đính kèm (nếu có): ${mediaUrls.join(', ')}

Dựa vào nội dung bài viết và lý do báo cáo, hãy đánh giá bài viết này có THỰC SỰ vi phạm Tiêu chuẩn cộng đồng (Spam, quấy rối, xúc phạm, bạo lực, 18+, thông tin sai lệch...) hay không.

Trả lời duy nhất bằng JSON có định dạng sau:
{"violation": true, "reason": "Lý do ngắn gọn tại sao xóa bài viết này"} (nếu cần gỡ bỏ)
{"violation": false, "reason": "Lý do bài viết vẫn hợp lệ"} (nếu không vi phạm)`;

  try {
    const raw = (await callGemini(prompt)).trim();
    console.log(`[Moderation] Report Post result: ${raw}`);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { violation: false, reason: 'Không thể phân tích phản hồi từ AI' };
    const parsed = JSON.parse(match[0]);
    return {
      violation: parsed.violation === true,
      reason: parsed.reason || '',
    };
  } catch (err) {
    console.error('[Moderation] Report Post check error:', err);
    return { violation: false, reason: 'Lỗi hệ thống AI' };
  }
}
