import { handleApiError, ok, parseJson } from '@/lib/api';
import { SavePostSchema } from '@/lib/schemas/post';

export async function POST(request: Request) {
  try {
    const body = await parseJson(request, SavePostSchema);
    return ok(body);
  } catch (error) {
    return handleApiError(error);
  }
}
