import { ok } from '@/lib/api';
import { mockNotifications } from '@/lib/mock-data';

export async function GET() {
  return ok(mockNotifications);
}
