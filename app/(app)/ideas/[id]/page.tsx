import { notFound } from 'next/navigation';
import { PostDetail } from '@/components/post/PostDetail';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getStartupIdeaBundle } from '@/lib/supabase/startup-ideas';

export default async function IdeaPage({ params }: { params: { id: string } }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const bundle = await getStartupIdeaBundle(supabase, params.id, user?.id);

  if (bundle instanceof Response) {
    notFound();
  }

  return (
    <PostDetail
      post={bundle.idea}
      comments={bundle.comments}
      startupIdeaContext={{
        revisions: bundle.revisions,
        canRevise: bundle.canRevise,
        isFollowing: bundle.isFollowing,
      }}
    />
  );
}
