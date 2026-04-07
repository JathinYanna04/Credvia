import { fail, parseJson } from '@/lib/api';
import { handleChatApiError } from '@/lib/chat/api';
import { ChatServiceError } from '@/lib/chat/errors';
import {
  createOrGetDmConversation,
  getConversationSummary,
  getUserKeypair,
} from '@/lib/chat/queries';
import { CreateDmConversationSchema } from '@/lib/schemas/chat';
import { getRequiredUser } from '@/lib/supabase/helpers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service';
import type { ApiResponse } from '@/lib/types';
import { logError, logInfo } from '@/lib/utils/logger';

export async function POST(request: Request) {
  let requesterUserId: string | null = null;
  let targetUserId: string | null = null;

  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    requesterUserId = user.id;
    const body = await parseJson(request, CreateDmConversationSchema);
    targetUserId = body.targetUserId;

    logInfo('api-chat-dm', 'DM bootstrap request received', {
      requesterUserId: user.id,
      targetUserId: body.targetUserId,
      wrappedKeyCount: body.wrappedKeys?.length ?? 0,
    });

    if (body.targetUserId === user.id) {
      throw new ChatServiceError(
        'VALIDATION_ERROR',
        'Cannot start a DM with yourself.',
        400,
      );
    }

    const privilegedClient = createServiceRoleClient() ?? supabase;
    const recipientResult = await privilegedClient
      .from('users')
      .select('id')
      .eq('id', body.targetUserId)
      .maybeSingle();

    if (recipientResult.error) {
      throw new Error(recipientResult.error.message);
    }

    if (!recipientResult.data) {
      throw new ChatServiceError('NOT_FOUND', 'Recipient user not found.', 404);
    }

    const requesterKeypair = await getUserKeypair(privilegedClient, user.id);
    if (!requesterKeypair) {
      throw new ChatServiceError(
        'VALIDATION_ERROR',
        'Your secure chat identity is not initialized yet. Please refresh and try again.',
        409,
        {
          reason: 'REQUESTER_CHAT_IDENTITY_MISSING',
          userId: user.id,
        },
      );
    }

    const recipientKeypair = await getUserKeypair(
      privilegedClient,
      body.targetUserId,
    );
    logInfo('api-chat-dm', 'DM preconditions checked', {
      requesterUserId: user.id,
      targetUserId: body.targetUserId,
      requesterKeypairExists: Boolean(requesterKeypair),
      recipientKeypairExists: Boolean(recipientKeypair),
    });

    if (!recipientKeypair) {
      throw new ChatServiceError(
        'VALIDATION_ERROR',
        'Recipient secure chat identity is not initialized yet.',
        409,
        {
          reason: 'RECIPIENT_CHAT_IDENTITY_MISSING',
          userId: body.targetUserId,
        },
      );
    }

    const dmResult = await createOrGetDmConversation(privilegedClient, {
      requesterUserId: user.id,
      targetUserId: body.targetUserId,
      wrappedKeys: body.wrappedKeys,
    });

    const summary = await getConversationSummary(
      supabase,
      user.id,
      dmResult.conversation.id,
    );

    if (!summary) {
      throw new ChatServiceError('NOT_FOUND', 'Conversation not found.', 404);
    }

    const responseStatus = dmResult.created ? 201 : 200;

    logInfo('api-chat-dm', 'DM bootstrap succeeded', {
      requesterUserId: user.id,
      targetUserId: body.targetUserId,
      conversationId: dmResult.conversation.id,
      created: dmResult.created,
      recoveredFromUniqueConflict: dmResult.recoveredFromUniqueConflict,
      status: responseStatus,
    });

    return Response.json(
      {
        data: summary,
      } satisfies ApiResponse<typeof summary>,
      {
        status: responseStatus,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const details =
      error instanceof ChatServiceError && error.details
        ? error.details
        : null;

    logError('api-chat-dm', 'DM bootstrap failed', {
      requesterUserId,
      targetUserId,
      errorMessage: message,
      errorDetails: details,
    });

    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleChatApiError(error);
  }
}
