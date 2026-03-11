import { useFriends } from './FriendsContext';
import { GradBtn, Spinner } from './ui';

export default function AddFriendBtn({ uid, name, avatarUrl }: { uid: string; name: string; avatarUrl?: string }) {
  const { isFriend, hasSent, hasRequest, requests, sentMap, actioningId, handleAccept, handleAddFriend, handleCancelSent } = useFriends();

  if (isFriend(uid)) return (
    <span className="inline-flex items-center gap-1.5 px-4 h-9 rounded-2xl text-sm font-semibold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400">
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" /></svg>
      Bạn bè
    </span>
  );

  if (hasRequest(uid)) {
    const req = requests.find((r) => r.fromUid === uid);
    return (
      <GradBtn variant="primary" disabled={actioningId === req?.id} onClick={() => req && handleAccept(req.id)}>
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" /></svg>
        Xác nhận
      </GradBtn>
    );
  }

  if (hasSent(uid)) {
    const reqId = sentMap.get(uid)!;
    return (
      <GradBtn variant="ghost" disabled={actioningId === reqId} onClick={() => handleCancelSent(reqId, uid)}>
        {actioningId === reqId ? <Spinner /> : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" /></svg>}
        Đã gửi
      </GradBtn>
    );
  }

  return (
    <GradBtn variant="primary" disabled={actioningId === uid} onClick={() => handleAddFriend(uid, name, avatarUrl)}>
      {actioningId === uid ? <Spinner /> : <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" /></svg>}
      Thêm bạn
    </GradBtn>
  );
}
