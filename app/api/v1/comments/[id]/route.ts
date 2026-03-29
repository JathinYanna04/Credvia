import { ok } from '@/lib/api';

export async function GET() {
  return ok({ id: 'comment', status: 'published' });
}
