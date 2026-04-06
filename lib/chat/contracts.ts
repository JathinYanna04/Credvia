import type { Json } from '@/lib/supabase/types';

export type ChatConversationType = 'dm' | 'idea_group';
export type ChatSourceType = 'idea';
export type ChatParticipantRole = 'owner' | 'member';
export type ChatParticipantStatus = 'active' | 'left' | 'removed';
export type ChatMessageType = 'text' | 'system' | 'context_card';

export interface ChatEncryptedMessagePayload {
  ciphertext: string;
  iv: string;
  algorithm: string;
  keyVersion: number;
  payloadMeta?: Record<string, unknown> | null;
}

export interface ChatConversationSummary {
  id: string;
  type: ChatConversationType;
  sourceType: ChatSourceType | null;
  sourceId: string | null;
  title: string | null;
  description: string | null;
  isArchived: boolean;
  lastMessageAt: string | null;
  lastMessageId: string | null;
  messageCount: number;
  unreadCount: number;
  counterpart:
    | {
        userId: string;
        username: string;
        fullName: string | null;
        avatarUrl: string | null;
      }
    | null;
  lastMessage:
    | {
        id: string;
        senderId: string | null;
        messageType: ChatMessageType;
        isDeleted: boolean;
        createdAt: string;
      }
    | null;
}

export interface ChatMessageRecord {
  id: string;
  conversationId: string;
  senderId: string | null;
  messageType: ChatMessageType;
  ciphertext: string | null;
  iv: string | null;
  algorithm: string | null;
  keyVersion: number | null;
  payloadMeta: Json | null;
  clientGeneratedId: string | null;
  replyToMessageId: string | null;
  isDeleted: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatThreadPage {
  messages: ChatMessageRecord[];
  nextCursor: string | null;
}
