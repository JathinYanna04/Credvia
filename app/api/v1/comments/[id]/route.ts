import { fail } from '@/lib/api';

export async function GET() {
  return fail('NOT_FOUND', 'Standalone comment detail is not exposed in V1.', 404);
}
