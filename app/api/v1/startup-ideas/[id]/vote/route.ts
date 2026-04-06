import { POST as postVotePost } from '@/app/api/v1/posts/[id]/vote/route';

export async function POST(
	request: Request,
	{ params }: { params: { id: string } },
) {
	const response = await postVotePost(request, { params: { id: params.id } });
	const payload = await response.clone().json().catch(() => null);

	if (
		!payload ||
		typeof payload !== 'object' ||
		!('data' in payload) ||
		!payload.data ||
		typeof payload.data !== 'object'
	) {
		return response;
	}

	return Response.json(
		{
			...payload,
			data: {
				...(payload.data as Record<string, unknown>),
				entityType: 'startup_idea',
			},
		},
		{ status: response.status },
	);
}
