import { z } from 'zod';

export const WrappedConversationKeySchema = z
  .object({
    userId: z.string().uuid(),
    encryptedConversationKey: z.string().min(1),
    keyEncryptionAlgorithm: z.string().min(1).max(80),
    keyVersion: z.number().int().positive().optional(),
  })
  .strict();

export const CreateDmConversationSchema = z
  .object({
    targetUserId: z.string().uuid(),
    wrappedKeys: z.array(WrappedConversationKeySchema).max(10).optional(),
  })
  .strict();

export const CreateIdeaGroupSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(1000).optional(),
  })
  .strict();

export const JoinIdeaGroupSchema = z
  .object({
    join: z.boolean().optional(),
    wrappedKeys: z.array(WrappedConversationKeySchema).max(100).optional(),
  })
  .strict();

export const SendChatMessageSchema = z
  .object({
    ciphertext: z.string().min(1),
    iv: z.string().min(1),
    algorithm: z.string().min(1).max(64),
    keyVersion: z.number().int().positive(),
    clientGeneratedId: z.string().max(200).optional(),
    payloadMeta: z.record(z.unknown()).nullable().optional(),
    replyToMessageId: z.string().uuid().optional(),
  })
  .strict();

export const MarkConversationReadSchema = z
  .object({
    lastReadMessageId: z.string().uuid().optional(),
  })
  .strict();

export const UpsertChatUserKeypairSchema = z
  .object({
    publicKey: z.string().min(1),
    algorithm: z.string().min(1).max(80),
    keyVersion: z.number().int().positive().optional(),
  })
  .strict();

export const UpsertConversationKeySchema = z
  .object({
    encryptedConversationKey: z.string().min(1),
    keyEncryptionAlgorithm: z.string().min(1).max(80),
    keyVersion: z.number().int().positive().optional(),
  })
  .strict();
