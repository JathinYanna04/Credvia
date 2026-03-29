import { handleApiError, ok, parseJson, fail } from '@/lib/api';
import { CreatePostSchema } from '@/lib/schemas/post';
import { enforceRateLimit } from '@/lib/rate-limit';
import { sanitizeHtml } from '@/lib/utils/sanitize';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRequiredUser } from '@/lib/supabase/helpers';
import { toPostSummaries } from '@/lib/supabase/query-helpers';
import { logError, logInfo } from '@/lib/utils/logger';

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      throw new Error(error.message);
    }

    const posts = await toPostSummaries(supabase, data ?? []);
    return ok(posts);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const body = await parseJson(request, CreatePostSchema);
    const requestId = crypto.randomUUID();

    logInfo('posts-create', 'Create post request received', {
      requestId,
      userId: user.id,
      postType: body.post_type,
      communityId: body.community_id,
      hasStartupIdea: Boolean(body.startup_idea),
    });

    const limit = await enforceRateLimit('post_create', user.id);

    if (!limit.success) {
      return fail('RATE_LIMITED', 'Too many posts created. Try again soon.', 429);
    }

    const { data, error } = await supabase
      .from('posts')
      .insert({
        title: body.title,
        post_type: body.post_type,
        community_id: body.community_id,
        body_md: body.body_md ?? null,
        body_html: sanitizeHtml(body.body_md ?? ''),
        external_url: body.external_url || null,
        media_url: body.media_url ?? null,
        author_id: user.id,
        status: 'published',
      })
      .select('*')
      .single();

    if (error) {
      logError('posts-create', 'Failed to insert post row', {
        requestId,
        userId: user.id,
        postType: body.post_type,
        error: error.message,
      });
      throw new Error(error.message);
    }

    if (body.post_type === 'startup_idea' && body.startup_idea) {
      const startupIdeaInsert = await supabase.from('startup_ideas').insert({
        post_id: data.id,
        founder_user_id: user.id,
        problem: body.startup_idea.problem,
        target_audience: body.startup_idea.target_audience,
        solution: body.startup_idea.solution,
        market_category: body.startup_idea.market_category,
        stage: body.startup_idea.stage,
        monetization_model: body.startup_idea.monetization_model ?? null,
      });

      if (startupIdeaInsert.error) {
        logError('posts-create', 'Failed to insert startup_ideas row', {
          requestId,
          userId: user.id,
          postId: data.id,
          error: startupIdeaInsert.error.message,
        });
        await supabase.from('posts').delete().eq('id', data.id);
        throw new Error(startupIdeaInsert.error.message);
      }
    }

    const [post] = await toPostSummaries(supabase, [data]);
    logInfo('posts-create', 'Create post request succeeded', {
      requestId,
      postId: post?.id ?? data.id,
      postType: body.post_type,
    });
    return ok(post);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    logError('posts-create', 'Create post request failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return handleApiError(error);
  }
}
