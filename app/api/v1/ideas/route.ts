import { handleApiError, ok } from '@/lib/api';
import { IdeaSearchSchema } from '@/lib/schemas/community';
import { isMissingStartupIdeaAdvancedSchemaError } from '@/lib/supabase/startup-idea-schema';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { toPostSummaries } from '@/lib/supabase/query-helpers';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filters = IdeaSearchSchema.parse({
      query: searchParams.get('q') ?? undefined,
      sort: searchParams.get('sort') ?? undefined,
      stage: searchParams.get('stage') ?? undefined,
      category: searchParams.get('category') ?? undefined,
    });
    const supabase = await createServerSupabaseClient();

    let ideaQuery = supabase
      .from('startup_ideas')
      .select('post_id, problem, target_audience, solution, market_category, stage, created_at')
      .order('created_at', { ascending: false })
      .limit(100);

    if (filters.stage) {
      ideaQuery = ideaQuery.eq('stage', filters.stage);
    }

    if (filters.category) {
      ideaQuery = ideaQuery.ilike('market_category', `%${filters.category}%`);
    }

    let ideaIdsResult = await ideaQuery;

    if (ideaIdsResult.error && isMissingStartupIdeaAdvancedSchemaError(ideaIdsResult.error)) {
      ideaIdsResult = await supabase
        .from('startup_ideas')
        .select('post_id, problem, target_audience, solution, market_category, stage, created_at')
        .order('created_at', { ascending: false })
        .limit(100);
    }

    if (ideaIdsResult.error) {
      throw new Error(ideaIdsResult.error.message);
    }

    const baseIdeaRows = ideaIdsResult.data ?? [];
    const ideaIds = new Set(baseIdeaRows.map((idea) => idea.post_id));

    if (filters.query) {
      const pattern = `%${filters.query}%`;
      const titleBodyMatches = await supabase
        .from('posts')
        .select('id')
        .eq('post_type', 'startup_idea')
        .eq('status', 'published')
        .or(`title.ilike.${pattern},body_md.ilike.${pattern}`)
        .limit(100);

      if (titleBodyMatches.error) {
        throw new Error(titleBodyMatches.error.message);
      }

      for (const post of titleBodyMatches.data ?? []) {
        ideaIds.add(post.id);
      }
    }

    const postIds = [...ideaIds];

    if (postIds.length === 0) {
      return ok([]);
    }

    const postsResult = await supabase
      .from('posts')
      .select('*')
      .in('id', postIds)
      .eq('post_type', 'startup_idea')
      .eq('status', 'published')
      .order('created_at', { ascending: false });

    if (postsResult.error) {
      throw new Error(postsResult.error.message);
    }

    let ideas = await toPostSummaries(supabase, postsResult.data ?? []);

    if (filters.query) {
      const normalized = filters.query.toLowerCase();
      ideas = ideas.filter((idea) => {
        const startupIdea = idea.startupIdea;
        return [
          idea.title,
          idea.body,
          startupIdea?.problem,
          startupIdea?.targetAudience,
          startupIdea?.solution,
          startupIdea?.marketCategory,
        ]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(normalized));
      });
    }

    const sorted = [...ideas].sort((left, right) => {
      if (filters.sort === 'traction') {
        return (right.startupIdea?.validationScore ?? 0) - (left.startupIdea?.validationScore ?? 0);
      }

      if (filters.sort === 'active') {
        return (
          new Date(right.startupIdea?.lastRevisionAt ?? right.createdAt).getTime() -
          new Date(left.startupIdea?.lastRevisionAt ?? left.createdAt).getTime()
        );
      }

      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });

    return ok(sorted);
  } catch (error) {
    return handleApiError(error);
  }
}
