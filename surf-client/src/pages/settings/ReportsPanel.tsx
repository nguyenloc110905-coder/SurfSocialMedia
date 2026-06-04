import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

type Report = {
  id: string;
  type: string;
  commentId?: string;
  postId?: string;
  reason: string;
  status: 'pending' | 'resolved_removed' | 'resolved_kept';
  aiReason?: string;
  createdAt: string;
  resolvedAt?: string;
};

const VIETNAMESE_REASONS: Record<string, string> = {
  spam: 'Spam / Rác tin',
  inappropriate: 'Nội dung không phù hợp / Nhạy cảm',
  misinformation: 'Thông tin sai lệch / Tin giả',
  hate_speech: 'Ngôn từ kích động thù hận',
  harassment: 'Quấy rối / Công kích cá nhân',
  violence: 'Bạo lực / Gây nguy hiểm',
  copyright: 'Vi phạm bản quyền',
  other: 'Lý do khác',
};

export default function ReportsPanel() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ reports: Report[] }>('/api/users/me/reports')
      .then(res => setReports(res.reports || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-2xl mx-auto w-full">
      <div className="mb-6 border-b border-slate-200/80 dark:border-slate-700/80 pb-4">
        <h2 className="text-2xl font-black text-slate-800 dark:text-white">Báo cáo của bạn</h2>
        <p className="mt-1 text-sm text-slate-500">Xem lại các nội dung bạn đã báo cáo và trạng thái xử lý từ hệ thống.</p>
      </div>

      {loading ? (
        <div className="text-center py-10"><div className="inline-block w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div></div>
      ) : reports.length === 0 ? (
        <div className="text-center py-10 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700">
          <div className="text-4xl mb-3">🛡️</div>
          <p className="text-slate-500 font-medium">Bạn chưa báo cáo nội dung nào.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map(report => (
            <div key={report.id} className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <span className="inline-block px-2.5 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-lg mb-2">
                    {report.type === 'comment' ? 'Bình luận' : 'Bài viết'}
                  </span>
                  <p className="font-bold text-slate-800 dark:text-slate-200">Lý do: {VIETNAMESE_REASONS[report.reason] || report.reason}</p>
                  <p className="text-xs text-slate-500 mt-1">{new Date(report.createdAt).toLocaleString('vi-VN')}</p>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                  report.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                  report.status === 'resolved_removed' ? 'bg-emerald-100 text-emerald-700' :
                  'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                }`}>
                  {report.status === 'pending' ? 'Đang xử lý' :
                   report.status === 'resolved_removed' ? 'Đã gỡ bỏ' : 'Đã giữ lại'}
                </div>
              </div>
              
              {report.aiReason && (
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 text-sm">
                  <p className="font-semibold text-slate-700 dark:text-slate-300 mb-1">Phản hồi từ hệ thống:</p>
                  <p className="text-slate-600 dark:text-slate-400 italic">"{report.aiReason}"</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
