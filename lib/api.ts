import { ZodError, type ZodTypeAny } from 'zod';
import type { ApiResponse } from '@/lib/types';

export function ok<T>(data: T, meta?: ApiResponse<T>['meta']) {
  return Response.json({ data, meta } satisfies ApiResponse<T>);
}

export function fail(
  code: NonNullable<ApiResponse<never>['error']>['code'],
  message: string,
  status: number,
  details?: unknown,
) {
  return Response.json(
    { error: { code, message, details } } satisfies ApiResponse<never>,
    { status },
  );
}

export async function parseJson<TSchema extends ZodTypeAny>(
  request: Request,
  schema: TSchema,
) {
  const json = (await request.json()) as unknown;
  return schema.parse(json);
}

export function handleApiError(error: unknown) {
  if (error instanceof ZodError) {
    return fail(
      'VALIDATION_ERROR',
      error.issues[0]?.message ?? 'Validation error.',
      400,
    );
  }

  return fail('INTERNAL_ERROR', 'An unexpected error occurred.', 500);
}
