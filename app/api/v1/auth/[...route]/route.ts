import { ok } from '@/lib/api';

export async function GET() {
  return ok({ route: 'auth' });
}

export async function POST() {
  return ok({ route: 'auth' });
}
