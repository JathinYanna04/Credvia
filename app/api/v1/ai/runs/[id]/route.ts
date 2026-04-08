import { ZodError } from 'zod';
import { getAiRunById } from '@/lib/ai/runs-repo';
import { fail, handleApiError, ok } from '@/lib/api';
import { AiRunIdParamsSchema } from '@/lib/schemas/ai';
import { getRequiredUser } from '@/lib/supabase/helpers';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const parsed = AiRunIdParamsSchema.parse(params);
    const supabase = await createServerSupabaseClient();
    await getRequiredUser(supabase);

    const run = await getAiRunById(supabase, parsed.id);

    if (!run) {
      return fail('NOT_FOUND', 'AI run not found.', 404);
    }

    return ok({ run });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    if (error instanceof ZodError) {
      return fail('VALIDATION_ERROR', error.issues[0]?.message ?? 'Validation error.', 400);
    }

    return handleApiError(error);
  }
}
