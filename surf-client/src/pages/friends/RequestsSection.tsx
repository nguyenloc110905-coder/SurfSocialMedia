import { Link } from 'react-router-dom';
import { useFriends } from './FriendsContext';
import { Avatar, EmptyState, Spinner, Card, GradBtn } from './ui';

export default function RequestsSection() {
  const { requests, sent, reqTab, setReqTab, actioningId, handleAccept, handleReject, handleCancelSent, resolve } = useFriends();

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-gray-100 dark:bg-gray-800/60">
        {(['received', 'sent'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setReqTab(tab)}
            className={[
              'flex-1 py-2 rounded-lg text-sm font-semibold transition-all',
              reqTab === tab
                ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300',
            ].join(' ')}
          >
            {tab === 'received'
              ? `Nhận được${requests.length > 0 ? ` (${requests.length})` : ''}`
              : `Đã gửi${sent.length > 0 ? ` (${sent.length})` : ''}`}
          </button>
        ))}
      </div>

      {/* Received */}
      {reqTab === 'received' && (
        requests.length === 0 ? (
          <EmptyState
            icon={<svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>}
            title="Không có lời mời nào"
            desc="Khi ai đó gửi lời mời, sẽ hiện ở đây."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {requests.map((r) => (
              <Card key={r.id}>
                <Link to={`/feed/profile/${r.fromUid}`}><Avatar url={r.avatarUrl} name={resolve(r.fromUid, r.name)} /></Link>
                <div className="flex-1 min-w-0">
                  <Link to={`/feed/profile/${r.fromUid}`} className="font-semibold text-sm text-gray-900 dark:text-gray-100 hover:text-surf-primary transition-colors truncate block">{resolve(r.fromUid, r.name)}</Link>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Muốn kết bạn</p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <GradBtn variant="primary" disabled={actioningId === r.id} onClick={() => handleAccept(r.id)}>
                    {actioningId === r.id ? <Spinner /> : null}
                    Nhận
                  </GradBtn>
                  <GradBtn variant="ghost" disabled={actioningId === r.id} onClick={() => handleReject(r.id)}>
                    Xoá
                  </GradBtn>
                </div>
              </Card>
            ))}
          </div>
        )
      )}

      {/* Sent */}
      {reqTab === 'sent' && (
        sent.length === 0 ? (
          <EmptyState
            icon={<svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>}
            title="Chưa gửi lời mời nào"
            desc="Lời mời bạn đã gửi và chưa được chấp nhận sẽ hiển thị ở đây."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {sent.map((s) => (
              <Card key={s.id}>
                <Link to={`/feed/profile/${s.toUid}`}><Avatar url={s.avatarUrl} name={resolve(s.toUid, s.name)} /></Link>
                <div className="flex-1 min-w-0">
                  <Link to={`/feed/profile/${s.toUid}`} className="font-semibold text-sm text-gray-900 dark:text-gray-100 hover:text-surf-primary transition-colors truncate block">{resolve(s.toUid, s.name)}</Link>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Đang chờ xác nhận</p>
                </div>
                <GradBtn variant="ghost" disabled={actioningId === s.id} onClick={() => handleCancelSent(s.id, s.toUid)}>
                  {actioningId === s.id ? <Spinner /> : null}
                  Hủy
                </GradBtn>
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  );
}
