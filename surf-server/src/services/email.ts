import nodemailer from 'nodemailer';
import dns from 'dns';

// Fix ENETUNREACH IPv6 issue on local development networks
dns.setDefaultResultOrder('ipv4first');

let _transporter: nodemailer.Transporter | null = null;

type SupportContactEmail = {
  uid: string;
  displayName: string;
  email: string;
  category: string;
  subject: string;
  message: string;
  supportMessageId: string;
};

function getTransporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }
  return _transporter;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });
}

/** Gửi email thông báo đăng nhập */
export async function sendLoginNotification(to: string, displayName: string) {
  const from = `"Surf Social" <${process.env.SMTP_EMAIL}>`;
  const now = new Date();
  const time = now.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

  await getTransporter().sendMail({
    from,
    to,
    subject: '🔐 Phát hiện đăng nhập mới vào tài khoản Surf',
    html: `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#f8fafc;border-radius:16px">
        <div style="text-align:center;margin-bottom:24px">
          <h1 style="color:#0891b2;margin:0;font-size:28px">🏄 Surf</h1>
        </div>
        <div style="background:#fff;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,.1)">
          <h2 style="margin:0 0 12px;color:#1e293b">Xin chào ${displayName},</h2>
          <p style="color:#475569;line-height:1.6;margin:0 0 16px">
            Chúng tôi phát hiện tài khoản của bạn vừa được <strong>đăng nhập</strong> vào lúc:
          </p>
          <div style="background:#f0fdfa;border-left:4px solid #0891b2;padding:12px 16px;border-radius:0 8px 8px 0;margin-bottom:16px">
            <p style="margin:0;color:#0e7490;font-weight:600">⏰ ${time}</p>
          </div>
          <p style="color:#475569;line-height:1.6;margin:0">
            Nếu đây không phải bạn, hãy đổi mật khẩu ngay để bảo vệ tài khoản.
          </p>
        </div>
        <p style="text-align:center;color:#94a3b8;font-size:12px;margin:20px 0 0">
          © ${now.getFullYear()} Surf Social Media. Bạn nhận email này vì có hoạt động đăng nhập trên tài khoản.
        </p>
      </div>
    `,
  });
}

/** Gửi nội dung form Trợ giúp & Hỗ trợ đến hộp thư support */
export async function sendSupportContactEmail(input: SupportContactEmail) {
  const to = process.env.SUPPORT_EMAIL || process.env.SMTP_EMAIL;
  if (!to) {
    throw new Error('Support email recipient is not configured');
  }

  const from = `"Surf Social" <${process.env.SMTP_EMAIL}>`;
  const emailSubject = input.subject.replace(/[\r\n]+/g, ' ').trim();
  const submittedAt = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const safeSubject = escapeHtml(input.subject);
  const safeMessage = escapeHtml(input.message).replace(/\n/g, '<br>');
  const safeDisplayName = escapeHtml(input.displayName);
  const safeEmail = escapeHtml(input.email || 'Không có email');
  const safeCategory = escapeHtml(input.category);
  const safeUid = escapeHtml(input.uid);
  const safeTicketId = escapeHtml(input.supportMessageId);

  await getTransporter().sendMail({
    from,
    to,
    replyTo: input.email || undefined,
    subject: `[Surf Support] ${emailSubject}`,
    text: [
      `Subject: ${input.subject}`,
      `Category: ${input.category}`,
      `From: ${input.displayName} <${input.email || 'no-email'}>`,
      `UID: ${input.uid}`,
      `Ticket: ${input.supportMessageId}`,
      `Submitted at: ${submittedAt}`,
      '',
      input.message,
    ].join('\n'),
    html: `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:620px;margin:0 auto;padding:28px;background:#f8fafc;border-radius:16px">
        <div style="background:#fff;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,.1)">
          <h2 style="margin:0 0 16px;color:#0f172a">Surf support contact</h2>
          <p style="margin:0 0 10px;color:#334155"><strong>Subject:</strong> ${safeSubject}</p>
          <p style="margin:0 0 10px;color:#334155"><strong>Category:</strong> ${safeCategory}</p>
          <p style="margin:0 0 10px;color:#334155"><strong>From:</strong> ${safeDisplayName} &lt;${safeEmail}&gt;</p>
          <p style="margin:0 0 10px;color:#334155"><strong>UID:</strong> ${safeUid}</p>
          <p style="margin:0 0 16px;color:#334155"><strong>Ticket:</strong> ${safeTicketId}</p>
          <div style="border-top:1px solid #e2e8f0;margin:16px 0"></div>
          <p style="margin:0;color:#0f172a;line-height:1.7">${safeMessage}</p>
        </div>
        <p style="text-align:center;color:#94a3b8;font-size:12px;margin:18px 0 0">
          Submitted at ${submittedAt}
        </p>
      </div>
    `,
  });
}

/** Gửi email chào mừng đăng ký */
export async function sendWelcomeEmail(to: string, displayName: string) {
  const from = `"Surf Social" <${process.env.SMTP_EMAIL}>`;
  const year = new Date().getFullYear();

  await getTransporter().sendMail({
    from,
    to,
    subject: '🎉 Chào mừng bạn đến với Surf!',
    html: `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#f8fafc;border-radius:16px">
        <div style="text-align:center;margin-bottom:24px">
          <h1 style="color:#0891b2;margin:0;font-size:28px">🏄 Surf</h1>
        </div>
        <div style="background:#fff;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,.1)">
          <h2 style="margin:0 0 12px;color:#1e293b">Chào mừng ${displayName}! 🎉</h2>
          <p style="color:#475569;line-height:1.6;margin:0 0 16px">
            Tài khoản của bạn trên <strong>Surf Social</strong> đã được tạo thành công.
          </p>
          <div style="background:#f0fdfa;border-radius:8px;padding:16px;margin-bottom:16px">
            <p style="margin:0 0 8px;color:#0e7490;font-weight:600">Bạn có thể:</p>
            <ul style="margin:0;padding-left:20px;color:#475569;line-height:1.8">
              <li>Hoàn thiện hồ sơ cá nhân</li>
              <li>Kết bạn và theo dõi mọi người</li>
              <li>Chia sẻ bài viết, ảnh và video</li>
              <li>Tham gia nhóm và sự kiện</li>
            </ul>
          </div>
          <p style="color:#475569;line-height:1.6;margin:0">
            Chúc bạn có những trải nghiệm tuyệt vời trên Surf! 🌊
          </p>
        </div>
        <p style="text-align:center;color:#94a3b8;font-size:12px;margin:20px 0 0">
          © ${year} Surf Social Media.
        </p>
      </div>
    `,
  });
}

/** Gửi mã OTP xác nhận đổi mật khẩu hoặc đổi email */
export async function sendOtpEmail(
  to: string,
  displayName: string,
  code: string,
  purpose: 'change-password' | 'change-email'
) {
  const from = `"Surf Social" <${process.env.SMTP_EMAIL}>`;
  const year = new Date().getFullYear();
  const subject =
    purpose === 'change-password'
      ? '🔑 Mã xác nhận đổi mật khẩu Surf của bạn'
      : '📧 Mã xác nhận đổi email Surf của bạn';
  const action = purpose === 'change-password' ? 'đổi mật khẩu' : 'đổi địa chỉ email';

  await getTransporter().sendMail({
    from,
    to,
    subject,
    html: `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#f8fafc;border-radius:16px">
        <div style="text-align:center;margin-bottom:24px">
          <h1 style="color:#0891b2;margin:0;font-size:28px">🏄 Surf</h1>
        </div>
        <div style="background:#fff;border-radius:12px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,.1)">
          <h2 style="margin:0 0 12px;color:#1e293b">Xin chào ${displayName},</h2>
          <p style="color:#475569;line-height:1.6;margin:0 0 20px">
            Bạn đã yêu cầu <strong>${action}</strong> trên tài khoản Surf.<br>
            Nhập mã bên dưới để xác nhận. Mã có hiệu lực trong <strong>5 phút</strong>.
          </p>
          <div style="background:linear-gradient(135deg,#0891b2,#06b6d4);border-radius:12px;padding:24px;text-align:center;margin-bottom:20px">
            <p style="color:rgba(255,255,255,.75);font-size:11px;margin:0 0 10px;letter-spacing:3px;text-transform:uppercase">Mã xác nhận</p>
            <p style="color:#fff;font-size:40px;font-weight:800;letter-spacing:12px;margin:0;font-family:monospace">${code}</p>
          </div>
          <p style="color:#94a3b8;font-size:13px;text-align:center;margin:0">
            Nếu bạn không yêu cầu thao tác này, hãy bỏ qua email này.
          </p>
        </div>
        <p style="text-align:center;color:#94a3b8;font-size:12px;margin:20px 0 0">
          © ${year} Surf Social Media.
        </p>
      </div>
    `,
  });
}

/** Gửi mã OTP xác nhận đăng ký tài khoản */
export async function sendRegisterOtpEmail(to: string, code: string) {
  const from = `"Surf Social" <${process.env.SMTP_EMAIL}>`;
  const year = new Date().getFullYear();

  await getTransporter().sendMail({
    from,
    to,
    subject: '🏄 Mã xác nhận đăng ký tài khoản Surf',
    html: `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#f8fafc;border-radius:16px">
        <div style="text-align:center;margin-bottom:24px">
          <h1 style="color:#0891b2;margin:0;font-size:28px">🏄 Surf</h1>
        </div>
        <div style="background:#fff;border-radius:12px;padding:28px;box-shadow:0 1px 3px rgba(0,0,0,.1)">
          <h2 style="margin:0 0 12px;color:#1e293b">Chào bạn,</h2>
          <p style="color:#475569;line-height:1.6;margin:0 0 20px">
            Cảm ơn bạn đã đăng ký tài khoản tại Surf.<br>
            Vui lòng nhập mã gồm 6 chữ số bên dưới để hoàn tất việc đăng ký. Mã này có hiệu lực trong <strong>5 phút</strong>.
          </p>
          <div style="background:linear-gradient(135deg,#0891b2,#06b6d4);border-radius:12px;padding:24px;text-align:center;margin-bottom:20px">
            <p style="color:rgba(255,255,255,.75);font-size:11px;margin:0 0 10px;letter-spacing:3px;text-transform:uppercase">Mã xác nhận</p>
            <p style="color:#fff;font-size:40px;font-weight:800;letter-spacing:12px;margin:0;font-family:monospace">${code}</p>
          </div>
          <p style="color:#94a3b8;font-size:13px;text-align:center;margin:0">
            Nếu bạn không thực hiện đăng ký này, hãy bỏ qua email.
          </p>
        </div>
        <p style="text-align:center;color:#94a3b8;font-size:12px;margin:20px 0 0">
          © ${year} Surf Social Media.
        </p>
      </div>
    `,
  });
}
