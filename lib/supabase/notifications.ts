import type { Json } from '@/lib/supabase/types';
import { createServiceRoleClient } from '@/lib/supabase/service';

export interface SendNotificationInput {
  userId: string;
  notifType: 'reply' | 'vote' | 'mod_action';
  actorUserId?: string | null;
  entityType?: 'post' | 'comment' | null;
  entityId?: string | null;
  payload?: Json | null;
}

export async function sendNotification(input: SendNotificationInput) {
  const serviceClient = createServiceRoleClient();

  if (!serviceClient) {
    return;
  }

  if (input.actorUserId && input.userId === input.actorUserId) {
    return;
  }

  await serviceClient.from('notifications').insert({
    user_id: input.userId,
    notif_type: input.notifType,
    actor_user_id: input.actorUserId ?? null,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    payload: input.payload ?? null,
  });
}
