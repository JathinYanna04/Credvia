import { notFound } from 'next/navigation';
import { PostDetail } from '@/components/post/PostDetail';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { toCommentSummaries, toPostSummaries } from '@/lib/supabase/query-helpers';

export default async function PostPage({ params }: { params: { id: string } }) {
  const supabase = await createServerSupabaseClient();
  const postResult = await supabase
    .from('posts')
    .select('*')
    .eq('id', params.id)
    .eq('status', 'published')
    .maybeSingle();

  if (postResult.error || !postResult.data) {
    notFound();
  }

  const [post] = await toPostSummaries(supabase, [postResult.data]);
  if (!post) {
    notFound();
  }
  const commentsResult = await supabase
    .from('comments')
    .select('*')
    .eq('post_id', params.id)
    .eq('status', 'published')
    .order('created_at', { ascending: true });

  const comments = await toCommentSummaries(
    supabase,
    commentsResult.data ?? [],
    postResult.data.community_id,
  );

  return <PostDetail post={post} comments={comments} />;
}
