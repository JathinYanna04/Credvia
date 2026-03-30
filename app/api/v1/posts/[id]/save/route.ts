import { fail } from '@/lib/api';

export async function POST() {
  return fail('NOT_FOUND', 'Saved posts are not part of V1.', 404);
}
