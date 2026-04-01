export type MessageType = 'text' | 'image' | 'file' | 'audio';

export type MessageDoc = {
  id: string;
  conversationId: string;
  senderId: string;
  type: MessageType;
  text: string;
  mediaUrl?: string;
  fileName?: string;
  createdAt: Date;
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
