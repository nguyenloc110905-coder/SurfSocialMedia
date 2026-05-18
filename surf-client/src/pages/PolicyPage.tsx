import React from 'react';
import { Link } from 'react-router-dom';

export default function PolicyPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-surf-dark text-slate-800 dark:text-slate-200 selection:bg-surf-primary/20">
      {/* Header */}
      <header className="bg-white/80 dark:bg-surf-card/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/feed" className="text-2xl font-bold text-surf-primary flex items-center gap-2 hover:opacity-80 transition">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z" />
            </svg>
            Surf
          </Link>
          <div className="flex gap-4 items-center">
            <span className="text-sm font-medium text-slate-500 hidden sm:inline-block">Cập nhật: Tháng 5, 2026</span>
            <a href="#contact" className="text-sm font-semibold text-surf-primary bg-surf-primary/10 px-4 py-2 rounded-full hover:bg-surf-primary/20 transition">
              Liên hệ
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-white dark:bg-surf-card border-b border-slate-200 dark:border-slate-800 py-16 lg:py-24">
        <div className="absolute inset-0 bg-gradient-to-br from-surf-primary/5 to-cyan-400/5 dark:from-surf-primary/10 dark:to-cyan-400/10 pointer-events-none"></div>
        <div className="max-w-4xl mx-auto px-6 relative z-10 text-center">
          <h1 className="text-4xl md:text-5xl font-extrabold mb-6 bg-gradient-to-r from-surf-primary to-surf-secondary bg-clip-text text-transparent leading-tight">
            Chính sách và Tiêu chuẩn Cộng đồng Surf
          </h1>
          <p className="text-lg md:text-xl text-slate-600 dark:text-slate-400 max-w-3xl mx-auto leading-relaxed">
            Chúng tôi mong muốn Surf là một không gian an toàn, truyền cảm hứng và tôn trọng sự khác biệt. 
            Để thực hiện điều đó, chúng tôi cần sự hợp tác của bạn trong việc tuân thủ các nguyên tắc sau đây.
          </p>
        </div>
      </section>

      {/* Main Content Area with TOC */}
      <main className="max-w-6xl mx-auto px-6 py-12 flex flex-col lg:flex-row gap-12">
        {/* Table of Contents - Sticky Sidebar */}
        <aside className="lg:w-1/4 hidden lg:block">
          <div className="sticky top-24 bg-white dark:bg-surf-card p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-4 uppercase tracking-wider text-sm">Danh mục nội dung</h3>
            <ul className="space-y-3 text-sm font-medium text-slate-600 dark:text-slate-400">
              <li><a href="#community" className="hover:text-surf-primary transition">1. Tiêu chuẩn cộng đồng</a></li>
              <li><a href="#privacy" className="hover:text-surf-primary transition">2. Quyền riêng tư & Dữ liệu</a></li>
              <li><a href="#ownership" className="hover:text-surf-primary transition">3. Quyền sở hữu nội dung</a></li>
              <li><a href="#safety" className="hover:text-surf-primary transition">4. An toàn cho trẻ em</a></li>
              <li><a href="#enforcement" className="hover:text-surf-primary transition">5. Xử lý vi phạm</a></li>
              <li><a href="#contact" className="hover:text-surf-primary transition">6. Liên hệ chúng tôi</a></li>
            </ul>
          </div>
        </aside>

        {/* Content Body */}
        <div className="lg:w-3/4 space-y-16">
          
          {/* 1. Tiêu chuẩn cộng đồng (The 6 boxes expanded) */}
          <section id="community" className="scroll-mt-24">
            <h2 className="text-3xl font-bold mb-8 text-slate-900 dark:text-white flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-surf-primary/10 text-surf-primary flex items-center justify-center text-xl">1</span>
              Tiêu chuẩn cộng đồng
            </h2>
            <p className="text-slate-600 dark:text-slate-400 mb-8 leading-relaxed">
              Các nguyên tắc này áp dụng cho mọi nội dung bạn chia sẻ trên Surf, bao gồm bài viết (Post), Video ngắn (Surf Clips), Bình luận, tin nhắn Waves và trong Nhóm.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-surf-card p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
                <h3 className="text-lg font-bold mb-2 text-red-600 dark:text-red-400">Spam và Lừa đảo</h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
                  Cấm các hành vi gửi tin nhắn rác, dùng tài khoản giả mạo, hoặc cố ý lừa đảo lấy thông tin cá nhân/tài sản. Chúng tôi ngăn chặn mạnh mẽ các đường link độc hại, mã độc.
                </p>
              </div>
              <div className="bg-white dark:bg-surf-card p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
                <h3 className="text-lg font-bold mb-2 text-orange-600 dark:text-orange-400">Ngôn từ thù địch & Quấy rối</h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
                  Bất kỳ nội dung nào đe dọa, nhục mạ, bắt nạt hoặc kêu gọi bạo lực nhắm vào một cá nhân hay nhóm người (dựa trên tôn giáo, giới tính, chủng tộc) đều sẽ bị xóa bỏ.
                </p>
              </div>
              <div className="bg-white dark:bg-surf-card p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
                <h3 className="text-lg font-bold mb-2 text-pink-600 dark:text-pink-400">Nội dung 18+ & Bạo lực</h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
                  Surf cấm chia sẻ hình ảnh/video khiêu dâm, bóc lột tình dục, và các nội dung mô tả bạo lực tàn bạo, máu me gây ám ảnh, trừ khi có mục đích giáo dục hoặc tin tức rõ ràng.
                </p>
              </div>
              <div className="bg-white dark:bg-surf-card p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
                <h3 className="text-lg font-bold mb-2 text-blue-600 dark:text-blue-400">Tin giả & Lệch lạc thông tin</h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
                  Chúng tôi nỗ lực hạn chế sự lan truyền của thông tin sai sự thật (Fake news) có khả năng gây hoang mang dư luận, ảnh hưởng tới sức khỏe, bầu cử hoặc can thiệp chính trị.
                </p>
              </div>
              <div className="bg-white dark:bg-surf-card p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
                <h3 className="text-lg font-bold mb-2 text-indigo-600 dark:text-indigo-400">Bán hàng trái phép</h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
                  Môi trường Surf Market cấm buôn bán vũ khí, ma túy, chất kích thích, động vật hoang dã, và các sản phẩm vi phạm pháp luật hiện hành tại quốc gia sở tại.
                </p>
              </div>
              <div className="bg-white dark:bg-surf-card p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
                <h3 className="text-lg font-bold mb-2 text-cyan-600 dark:text-cyan-400">Bản quyền & Sở hữu trí tuệ</h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
                  Bạn chỉ nên đăng những nội dung do bạn tạo ra. Chúng tôi sẽ gỡ bỏ nội dung khi nhận được báo cáo vi phạm bản quyền hoặc thương hiệu hợp lệ từ chủ sở hữu.
                </p>
              </div>
            </div>
          </section>

          <hr className="border-slate-200 dark:border-slate-800" />

          {/* 2. Privacy Policy */}
          <section id="privacy" className="scroll-mt-24">
            <h2 className="text-3xl font-bold mb-6 text-slate-900 dark:text-white flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-surf-secondary/10 text-surf-secondary flex items-center justify-center text-xl">2</span>
              Quyền riêng tư & Thu thập dữ liệu
            </h2>
            <div className="prose prose-slate dark:prose-invert max-w-none text-slate-600 dark:text-slate-400">
              <p>Quyền riêng tư của bạn là ưu tiên hàng đầu của Surf. Chúng tôi minh bạch trong cách thu thập và sử dụng dữ liệu:</p>
              <ul className="list-disc pl-5 space-y-2 mt-4">
                <li><strong>Dữ liệu thu thập:</strong> Thông tin cá nhân (Email, Tên, Ảnh đại diện), Lịch sử tương tác, Dữ liệu thiết bị (dùng cho Push Notification và bảo mật).</li>
                <li><strong>Mục đích sử dụng:</strong> Cung cấp dịch vụ, đề xuất bảng tin (Feed), cải thiện chất lượng Surf Clips và ngăn chặn gian lận.</li>
                <li><strong>Chia sẻ với bên thứ ba:</strong> Surf cam kết <strong>không bán</strong> dữ liệu của bạn. Dữ liệu chỉ được chia sẻ cho các đối tác hạ tầng (như hệ thống lưu trữ Cloudinary, Livekit) phục vụ trực tiếp cho tính năng của bạn.</li>
              </ul>
              <p className="mt-4">Bạn luôn có quyền tải xuống toàn bộ dữ liệu của mình hoặc yêu cầu xóa tài khoản vĩnh viễn trong phần <em>Cài đặt</em>.</p>
            </div>
          </section>

          <hr className="border-slate-200 dark:border-slate-800" />

          {/* 3. Content Ownership */}
          <section id="ownership" className="scroll-mt-24">
            <h2 className="text-3xl font-bold mb-6 text-slate-900 dark:text-white flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-xl">3</span>
              Quyền sở hữu nội dung
            </h2>
            <div className="prose prose-slate dark:prose-invert max-w-none text-slate-600 dark:text-slate-400">
              <p>Bạn luôn giữ quyền sở hữu đối với tất cả văn bản, hình ảnh, video mà bạn đăng tải trên Surf.</p>
              <p>Tuy nhiên, bằng việc đăng tải lên hệ thống, bạn cấp cho Surf một giấy phép toàn cầu, không độc quyền, có thể chuyển nhượng để hiển thị, lưu trữ, và phân phối nội dung của bạn nhằm mục đích vận hành ứng dụng (ví dụ: hiển thị bài viết của bạn cho bạn bè, hoặc tạo bản thumbnail cho Surf Clips).</p>
            </div>
          </section>

          <hr className="border-slate-200 dark:border-slate-800" />

          {/* 4. Child Safety */}
          <section id="safety" className="scroll-mt-24">
            <h2 className="text-3xl font-bold mb-6 text-slate-900 dark:text-white flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center text-xl">4</span>
              An toàn cho trẻ vị thành niên
            </h2>
            <div className="prose prose-slate dark:prose-invert max-w-none text-slate-600 dark:text-slate-400">
              <p>Surf là nền tảng dành cho người dùng từ <strong>13 tuổi trở lên</strong>. Bất kỳ tài khoản nào bị phát hiện thuộc về trẻ em dưới độ tuổi này sẽ bị khóa vô điều kiện.</p>
              <p>Chúng tôi áp dụng các thuật toán AI và kiểm duyệt thủ công nghiêm ngặt để ngăn chặn mọi hình ảnh lạm dụng, bóc lột hoặc gây nguy hiểm cho trẻ em. Bất kỳ hành vi vi phạm nào trong danh mục này không chỉ bị cấm khỏi Surf mà còn bị báo cáo lên các cơ quan chức năng (như NCMEC).</p>
            </div>
          </section>

          <hr className="border-slate-200 dark:border-slate-800" />

          {/* 5. Enforcement */}
          <section id="enforcement" className="scroll-mt-24">
            <h2 className="text-3xl font-bold mb-6 text-slate-900 dark:text-white flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center text-xl">5</span>
              Quy trình xử lý vi phạm
            </h2>
            <div className="prose prose-slate dark:prose-invert max-w-none text-slate-600 dark:text-slate-400">
              <p>Hệ thống của chúng tôi xử lý hàng ngàn báo cáo (Report) mỗi ngày. Khi phát hiện vi phạm, chúng tôi có thể áp dụng các hình thức:</p>
              <ul className="list-disc pl-5 space-y-2 mt-4">
                <li><strong>Cảnh báo:</strong> Gửi thông báo nhắc nhở đối với các vi phạm nhẹ hoặc vô ý.</li>
                <li><strong>Gỡ bỏ nội dung:</strong> Xóa ngay bài viết, bình luận, Surf Clips vi phạm Tiêu chuẩn cộng đồng.</li>
                <li><strong>Hạn chế tính năng:</strong> Tạm khóa khả năng đăng bài, nhắn tin, livestream hoặc bình luận từ 24h đến 30 ngày.</li>
                <li><strong>Khóa tài khoản vĩnh viễn:</strong> Áp dụng cho các vi phạm nghiêm trọng (lừa đảo, khiêu dâm trẻ em, khủng bố, buôn bán chất cấm).</li>
              </ul>
              <p className="mt-4 font-semibold text-slate-800 dark:text-slate-200">Quyền khiếu nại:</p>
              <p>Nếu bạn cho rằng chúng tôi đã xử lý sai, bạn có quyền gửi yêu cầu khiếu nại (Appeal) trong vòng 30 ngày. Đội ngũ kiểm duyệt con người sẽ xem xét lại quyết định của AI.</p>
            </div>
          </section>

          <hr className="border-slate-200 dark:border-slate-800" />

          {/* 6. Contact Us */}
          <section id="contact" className="scroll-mt-24 bg-surf-primary/5 dark:bg-surf-primary/10 border border-surf-primary/20 p-8 rounded-3xl">
            <div className="text-center max-w-2xl mx-auto">
              <h2 className="text-3xl font-bold mb-4 text-slate-900 dark:text-white">Liên hệ với chúng tôi</h2>
              <p className="text-slate-600 dark:text-slate-400 mb-8 leading-relaxed">
                Bạn có câu hỏi, thắc mắc về chính sách, hoặc cần hỗ trợ về tài khoản? Đội ngũ của Surf luôn ở đây để giúp đỡ bạn! 
                Chúng tôi cam kết phản hồi trong vòng 24 - 48 giờ làm việc.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <button className="w-full sm:w-auto bg-surf-primary hover:bg-surf-primary/90 text-white px-8 py-3.5 rounded-xl font-semibold transition flex items-center justify-center gap-2 shadow-lg shadow-surf-primary/30">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  Gửi Email Hỗ Trợ
                </button>
                <Link to="/feed" className="w-full sm:w-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-200 px-8 py-3.5 rounded-xl font-semibold transition flex items-center justify-center gap-2">
                  Quay lại Trang Chủ
                </Link>
              </div>

              <div className="mt-8 pt-8 border-t border-slate-200 dark:border-slate-700/50 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-slate-500">
                <div>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Email Trụ Sở:</span> support@surf-social.com
                </div>
                <div>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Hotline:</span> 1900-SURF (Giờ hành chính)
                </div>
              </div>
            </div>
          </section>

        </div>
      </main>
      
      <footer className="bg-white dark:bg-surf-card border-t border-slate-200 dark:border-slate-800 py-10 mt-12">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-white">
             <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-surf-primary">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z" />
            </svg>
            Surf
          </div>
          <p className="text-sm text-slate-500">
            &copy; {new Date().getFullYear()} Surf Social Media. All rights reserved.
          </p>
          <div className="flex gap-4 text-sm font-medium text-slate-500">
            <Link to="/policy" className="hover:text-surf-primary transition">Điều khoản</Link>
            <Link to="/policy" className="hover:text-surf-primary transition">Quyền riêng tư</Link>
            <Link to="/policy" className="hover:text-surf-primary transition">Cookie</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
