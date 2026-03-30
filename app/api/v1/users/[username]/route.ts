import { fail, handleApiError, ok } from '@/lib/api';
import { getPublicProfileBundle } from '@/lib/supabase/public-profile';

export async function GET(
  _request: Request,
  { params }: { params: { username: string } },
) {
  try {
    const bundle = await getPublicProfileBundle(params.username);
    return ok(bundle);
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'digest' in error
    ) {
      return fail('NOT_FOUND', 'User not found.', 404);
    }

    return handleApiError(error);
  }
}
