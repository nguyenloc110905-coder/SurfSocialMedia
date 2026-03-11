export type FriendItem  = { id: string; name: string; avatarUrl?: string; mutualCount?: number };
export type RequestItem = { id: string; fromUid: string; name: string; avatarUrl?: string };
export type SentItem    = { id: string; toUid: string;  name: string; avatarUrl?: string };
