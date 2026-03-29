import { handleApiError, ok } from '@/lib/api';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { toPostSummaries } from '@/lib/supabase/query-helpers';

type IdeaSort = 'recent' | 'traction';

function getIdeaSort(value: string | null): IdeaSort {
  if (value === 'traction') {
    return value;
  }

  return 'recent';
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sort = getIdeaSort(searchParams.get('sort'));
    const stage = searchParams.get('stage');
    const category = searchParams.get('category');
    const supabase = await createServerSupabaseClient();

    let ideaQuery = supabase
      .from('startup_ideas')
      .select('post_id')
      .order('created_at', { ascending: false })
      .limit(100);

    if (stage) {
      ideaQuery = ideaQuery.eq('stage', stage);
    }

    if (category) {
      ideaQuery = ideaQuery.eq('market_category', category);
    }

    const ideaIdsResult = await ideaQuery;

    if (ideaIdsResult.error) {
      throw new Error(ideaIdsResult.error.message);
    }

    const postIds = (ideaIdsResult.data ?? []).map((idea) => idea.post_id);

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

    const ideas = await toPostSummaries(supabase, postsResult.data ?? []);
    const sorted = [...ideas].sort((left, right) => {
      if (sort === 'traction') {
        return (right.startupIdea?.validationScore ?? 0) - (left.startupIdea?.validationScore ?? 0);
      }

      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });

    return ok(sorted);
  } catch (error) {
    return handleApiError(error);
  }
}
