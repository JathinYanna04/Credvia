import { fail } from '@/lib/api';

export async function GET() {
  return fail('NOT_FOUND', 'This auth endpoint is not available in V1.', 404);
}

export async function POST() {
  return fail('NOT_FOUND', 'This auth endpoint is not available in V1.', 404);
}
