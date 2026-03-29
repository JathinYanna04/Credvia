import { fail, ok } from '@/lib/api';
import { mockUsers } from '@/lib/mock-data';

export async function GET(
  _request: Request,
  { params }: { params: { username: string } },
) {
  const user = mockUsers.find((item) => item.username === params.username);

  if (!user) {
    return fail('NOT_FOUND', 'User not found.', 404);
  }

  return ok(user);
}
