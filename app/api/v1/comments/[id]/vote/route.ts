import { handleApiError, ok, parseJson } from '@/lib/api';
import { VoteCommentSchema } from '@/lib/schemas/comment';

export async function POST(request: Request) {
  try {
    const body = await parseJson(request, VoteCommentSchema);
    return ok(body);
  } catch (error) {
    return handleApiError(error);
  }
}
