export type MessageType = 'text' | 'image' | 'file' | 'audio' | 'call_log';

export type CallLogMode = 'audio' | 'video';

export type CallLogOutcome =
  | 'completed'
  | 'missed'
  | 'declined'
  | 'busy'
  | 'failed'
  | 'ended'
  | 'started';

export type MessageDoc = {
  id: string;
  conversationId: string;
  senderId: string;
  type: MessageType;
  text: string;
  mediaUrl?: string;
  fileName?: string;
  createdAt: Date;
  callMode?: CallLogMode;
  callOutcome?: CallLogOutcome;
  durationSeconds?: number;
};

export type SendTextMessageInput = {
  conversationId: string;
  senderId: string;
  text: string;
};

export type SendMediaMessageInput = {
  conversationId: string;
  senderId: string;
  type: 'image' | 'file' | 'audio';
  mediaUrl: string;
  fileName?: string;
  text?: string;
};
export type CreateCallLogInput = {
  conversationId: string;
  actorId: string;
  recipientIds: string[];
  mode: CallLogMode;
  outcome: CallLogOutcome;
  durationSeconds?: number;
};
