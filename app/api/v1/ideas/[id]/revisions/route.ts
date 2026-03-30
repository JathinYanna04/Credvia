import { fail, handleApiError, ok, parseJson } from '@/lib/api';
import { CreateIdeaRevisionSchema } from '@/lib/schemas/post';
import { enforceRateLimit } from '@/lib/rate-limit';
import { sendNotifications } from '@/lib/supabase/notifications';
import { isMissingStartupIdeaAdvancedSchemaError } from '@/lib/supabase/startup-idea-schema';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getRequiredUser } from '@/lib/supabase/helpers';
import { sanitizeHtml } from '@/lib/utils/sanitize';

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await getRequiredUser(supabase);
    const body = await parseJson(request, CreateIdeaRevisionSchema);
    const limit = await enforceRateLimit('idea_revision', user.id);

    if (!limit.success) {
      return fail('RATE_LIMITED', 'Too many revisions created. Try again soon.', 429);
    }

    const [ideaResult, postResult] = await Promise.all([
      supabase
        .from('startup_ideas')
        .select('post_id, founder_user_id, revision_count')
        .eq('post_id', params.id)
        .maybeSingle(),
      supabase
        .from('posts')
        .select('id, author_id, title, status, post_type')
        .eq('id', params.id)
        .maybeSingle(),
    ]);

    if (ideaResult.error) {
      if (isMissingStartupIdeaAdvancedSchemaError(ideaResult.error)) {
        return fail('NOT_FOUND', 'Idea revisions are not enabled yet.', 404);
      }
      throw new Error(ideaResult.error.message);
    }

    if (postResult.error) {
      throw new Error(postResult.error.message);
    }

    if (!ideaResult.data || !postResult.data || postResult.data.post_type !== 'startup_idea' || postResult.data.status !== 'published') {
      return fail('NOT_FOUND', 'Startup idea not found.', 404);
    }

    if (ideaResult.data.founder_user_id !== user.id || postResult.data.author_id !== user.id) {
      return fail('FORBIDDEN', 'Only the founder can publish a revision.', 403);
    }

    const revisionNumber = (ideaResult.data.revision_count ?? 1) + 1;
    const nextBodyHtml = sanitizeHtml(body.body_md ?? '');
    const revisionInsert = await supabase
      .from('startup_idea_revisions')
      .insert({
        post_id: params.id,
        revision_number: revisionNumber,
        title: body.title,
        body_md: body.body_md ?? null,
        body_html: nextBodyHtml,
        problem: body.startup_idea.problem,
        target_audience: body.startup_idea.target_audience,
        solution: body.startup_idea.solution,
        market_category: body.startup_idea.market_category,
        stage: body.startup_idea.stage,
        monetization_model: body.startup_idea.monetization_model ?? null,
        change_summary: body.change_summary,
        created_by: user.id,
      })
      .select('id, revision_number, created_at')
      .single();

    if (revisionInsert.error || !revisionInsert.data) {
      if (isMissingStartupIdeaAdvancedSchemaError(revisionInsert.error)) {
        return fail('NOT_FOUND', 'Idea revisions are not enabled yet.', 404);
      }
      throw new Error(revisionInsert.error?.message ?? 'Could not create revision.');
    }

    const timestamp = new Date().toISOString();
    const [postUpdate, ideaUpdate, followersResult] = await Promise.all([
      supabase
        .from('posts')
        .update({
          title: body.title,
          body_md: body.body_md ?? null,
          body_html: nextBodyHtml,
          updated_at: timestamp,
        })
        .eq('id', params.id),
      supabase
        .from('startup_ideas')
        .update({
          problem: body.startup_idea.problem,
          target_audience: body.startup_idea.target_audience,
          solution: body.startup_idea.solution,
          market_category: body.startup_idea.market_category,
          stage: body.startup_idea.stage,
          monetization_model: body.startup_idea.monetization_model ?? null,
          current_revision_id: revisionInsert.data.id,
          revision_count: revisionNumber,
          last_revision_at: timestamp,
          updated_at: timestamp,
        })
        .eq('post_id', params.id),
      supabase
        .from('idea_followers')
        .select('user_id')
        .eq('post_id', params.id),
    ]);

    if (postUpdate.error) {
      throw new Error(postUpdate.error.message);
    }

    if (ideaUpdate.error) {
      if (isMissingStartupIdeaAdvancedSchemaError(ideaUpdate.error)) {
        return fail('NOT_FOUND', 'Idea revisions are not enabled yet.', 404);
      }
      throw new Error(ideaUpdate.error.message);
    }

    if (followersResult.error) {
      if (isMissingStartupIdeaAdvancedSchemaError(followersResult.error)) {
        return fail('NOT_FOUND', 'Idea revisions are not enabled yet.', 404);
      }
      throw new Error(followersResult.error.message);
    }

    await sendNotifications(
      (followersResult.data ?? [])
        .filter((follower) => follower.user_id !== user.id)
        .map((follower) => ({
          userId: follower.user_id,
          notifType: 'idea_revision' as const,
          actorUserId: user.id,
          entityType: 'revision' as const,
          entityId: revisionInsert.data.id,
          payload: {
            postId: params.id,
            title: body.title,
            revisionNumber,
            changeSummary: body.change_summary,
          },
        })),
    );

    return ok({
      revisionId: revisionInsert.data.id,
      revisionNumber: revisionInsert.data.revision_number,
      createdAt: revisionInsert.data.created_at,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('UNAUTHORIZED', 'You need to sign in.', 401);
    }

    return handleApiError(error);
  }
}
