import nodemailer from 'nodemailer';

let _transporter: nodemailer.Transporter | null = null;

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