import { fail } from '@/lib/api';

export async function POST() {
  return fail('NOT_FOUND', 'Best-answer flow is not part of V1.', 404);
}
