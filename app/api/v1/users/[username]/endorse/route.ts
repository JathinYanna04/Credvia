import { fail, handleApiError, ok, parseJson } from '@/lib/api';
import { z } from 'zod';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRequiredUser } from '@/lib/supabase/helpers';
import { resolveTargetUserId } from '../_resolve-user';

const EndorseSchema = z
  .object({
    domainTag: z.string().min(2).max(80),
    note: z.string().max(240).optional(),
    weight: z.number().int().min(1).max(5).default(1),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: { username: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const body = await parseJson(request, EndorseSchema);
    const targetUserId = await resolveTargetUserId(supabase, params.username);

    const [endorsementResult, interactionResult] = await Promise.all([
      supabase.from('endorsement_graph').upsert({
        endorser_user_id: user.id,
        endorsed_user_id: targetUserId,
        domain_tag: body.domainTag,
        note: body.note ?? null,
        weight: body.weight,
      }),
      supabase.from('interaction_events').insert({
        actor_user_id: user.id,
        target_user_id: targetUserId,
        entity_type: 'profile',
        entity_id: targetUserId,
        interaction_type: 'endorse_expertise',
        value: body.weight,
        metadata: {
          domain_tag: body.domainTag,
          note: body.note ?? null,
        },
      }),
    ]);

    if (endorsementResult.error) {
      throw new Error(endorsementResult.error.message);
    }

    if (interactionResult.error) {
      throw new Error(interactionResult.error.message);
    }

    return ok({
      endorsedUserId: targetUserId,
      domainTag: body.domainTag,
      weight: body.weight,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    if (error instanceof Response) {
      return error;
    }

    return handleApiError(error);
  }
}
