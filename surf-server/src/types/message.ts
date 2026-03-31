export type MessageType = 'text';

export type MessageDoc = {
  id: string;
  conversationId: string;
  senderId: string;
  type: MessageType;
  text: string;
  createdAt: Date;
};

export type SendTextMessageInput = {
  conversationId: string;
  senderId: string;
  text: string;
};
