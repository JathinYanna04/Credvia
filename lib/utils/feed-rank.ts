import type { PostSummary } from '@/lib/types';

export function computeFeedScore(
  post: PostSummary,
  communityRepByAuthor = new Map<string, number>(),
) {
  const hoursSincePosted = Math.max(
    1,
    (Date.now() - new Date(post.createdAt).getTime()) / (1000 * 60 * 60),
  );
  const unansweredBoost =
    post.postType === 'question' && post.commentCount === 0 ? 5 : 0;
  const timeDecay = Math.pow(hoursSincePosted / 12, 1.8);
  const authorRep = Math.max(communityRepByAuthor.get(post.author.id) ?? 1, 1);
  const authorRepBonus = Math.log10(authorRep) * 0.5;

  return (
    post.voteScore * 1.5 +
    post.commentCount * 2 +
    post.saveCount +
    unansweredBoost +
    authorRepBonus -
    timeDecay
  );
}

export function getRankedFeed(
  posts: PostSummary[],
  communityRepByAuthor = new Map<string, number>(),
) {
  return [...posts].sort(
    (left, right) =>
      computeFeedScore(right, communityRepByAuthor) -
      computeFeedScore(left, communityRepByAuthor),
  );
}
