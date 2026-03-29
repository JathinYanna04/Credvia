import { handleApiError, ok, parseJson } from '@/lib/api';
import { BestAnswerSchema } from '@/lib/schemas/comment';

export async function POST(request: Request) {
  try {
    const body = await parseJson(request, BestAnswerSchema);
    return ok(body);
  } catch (error) {
    return handleApiError(error);
  }
}
