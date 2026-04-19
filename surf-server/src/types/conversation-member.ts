export type ConversationMemberDoc = {
  id: string;
  conversationId: string;
  userId: string;
  joinedAt?: Date;
  lastReadMessageId?: string | null;
  lastReadMessageCreatedAt?: Date;
  lastReadAt?: Date;
};
