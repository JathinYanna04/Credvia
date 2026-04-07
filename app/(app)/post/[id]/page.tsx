import { notFound } from 'next/navigation';
import { PostDetail } from '@/components/post/PostDetail';
import type { CommentSummary, PostSummary } from '@/lib/types';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { toCommentSummaries, toPostSummaries } from '@/lib/supabase/query-helpers';
import type { Database } from '@/lib/supabase/types';
import { logError } from '@/lib/utils/logger';
import { buildServerVersion } from '@/lib/voting';

type PostRow = Database['public']['Tables']['posts']['Row'];

function buildFallbackPostSummary(post: PostRow): PostSummary {
  return {
    id: post.id,
    title: post.title,
    body: post.body_md ?? '',
    createdAt: post.created_at,
    updatedAt: post.updated_at,
    version: buildServerVersion(post.updated_at),
    postType: post.post_type as PostSummary['postType'],
    voteScore: post.vote_score ?? 0,
    upvoteCount: 0,
    downvoteCount: 0,
    currentUserVote: 0,
    commentCount: post.comment_count ?? 0,
    saveCount: post.save_count ?? 0,
    author: {
      id: post.author_id,
      username: `user_${post.author_id.slice(0, 8)}`,
      fullName: 'Credvia User',
      headline: '',
      avatarUrl: '',
      skills: [],
      reputation: [],
    },
    community: {
      id: post.community_id,
      name: 'Unknown Community',
      slug: 'unknown',
      description: '',
      icon: 'UC',
      memberCount: 0,
      postCount: 0,
      accent: 'var(--accent)',
    },
    tags: [],
    unanswered: post.post_type === 'question' && (post.comment_count ?? 0) === 0,
    externalUrl: post.external_url ?? undefined,
  };
}

export default async function PostPage({ params }: { params: { id: string } }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const postResult = await supabase
    .from('posts')
    .select('*')
    .eq('id', params.id)
    .eq('status', 'published')
    .maybeSingle();

  if (postResult.error || !postResult.data) {
    notFound();
  }

  let post: PostSummary;
  try {
    const [mappedPost] = await toPostSummaries(supabase, [postResult.data], user?.id);
    if (!mappedPost) {
      notFound();
    }
    post = mappedPost;
  } catch (error) {
    logError('post-page', 'Failed to hydrate post summary, using fallback', {
      postId: params.id,
      error: error instanceof Error ? error.message : String(error),
    });
    post = buildFallbackPostSummary(postResult.data);
  }

  let comments: CommentSummary[] = [];
  try {
    const commentsResult = await supabase
      .from('comments')
      .select('*')
      .eq('post_id', params.id)
      .eq('status', 'published')
      .order('created_at', { ascending: true });

    if (commentsResult.error) {
      throw new Error(commentsResult.error.message);
    }

    comments = await toCommentSummaries(
      supabase,
      commentsResult.data ?? [],
      postResult.data.community_id,
      user?.id,
    );
  } catch (error) {
    logError('post-page', 'Failed to hydrate comments, rendering without comments', {
      postId: params.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return <PostDetail post={post} comments={comments} currentUserId={user?.id ?? null} />;
}
