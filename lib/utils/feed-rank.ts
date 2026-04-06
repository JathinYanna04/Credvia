import type { FeedExplanation, PostSummary } from '@/lib/types';
import type { PersonaSlug } from '@/lib/personas';

function getPostTypeBoost(post: PostSummary) {
  switch (post.postType) {
    case 'startup_idea':
      return 2.5;
    case 'resume_review':
      return 2;
    case 'project_showcase':
      return 1.5;
    case 'opportunity':
      return 1.25;
    default:
      return 0;
  }
}

function getPersonaRelevance(post: PostSummary, persona?: PersonaSlug | null) {
  if (!persona) {
    return 0;
  }

  const haystack = [
    post.title,
    post.body,
    post.postType,
    post.author.primaryPersona ?? '',
    ...(post.tags ?? []),
    ...(post.author.expertiseTags ?? []),
    ...(post.author.interestTags ?? []),
  ]
    .join(' ')
    .toLowerCase();

  if (persona === 'student') {
    return ['intern', 'project', 'learn', 'career', 'resume', 'student'].some((token) =>
      haystack.includes(token),
    )
      ? 3
      : 0;
  }

  if (persona === 'job_seeker') {
    return ['job', 'resume', 'hiring', 'career', 'interview', 'opportunity'].some((token) =>
      haystack.includes(token),
    )
      ? 3
      : 0;
  }

  if (persona === 'founder') {
    return ['startup', 'mvp', 'traction', 'validation', 'gtm', 'cofounder'].some((token) =>
      haystack.includes(token),
    )
      ? 3.5
      : 0;
  }

  if (persona === 'recruiter') {
    return ['candidate', 'hiring', 'talent', 'resume', 'role', 'opportunity'].some((token) =>
      haystack.includes(token),
    )
      ? 3
      : 0;
  }

  if (persona === 'mentor') {
    return ['advice', 'mentor', 'help', 'guide', 'question', 'review'].some((token) =>
      haystack.includes(token),
    )
      ? 3
      : 0;
  }

  return ['industry', 'discussion', 'guide', 'framework'].some((token) => haystack.includes(token))
    ? 2
    : 0;
}

function getTabBoost(post: PostSummary, tab: string) {
  switch (tab) {
    case 'trending':
      return post.voteScore * 0.65 + post.commentCount * 0.75;
    case 'founders':
      return post.postType === 'startup_idea' || post.author.primaryPersona === 'founder' ? 4 : -1;
    case 'careers':
      return ['resume_review', 'opportunity'].includes(post.postType) ? 4 : 0;
    case 'mentors':
      return post.author.primaryPersona === 'mentor' ? 4 : 0;
    case 'recruiters':
      return post.author.primaryPersona === 'recruiter' || post.postType === 'opportunity' ? 4 : 0;
    case 'following':
      return 2;
    default:
      return 0;
  }
}

export function buildFeedExplanation(
  post: PostSummary,
  options: { tab?: string; persona?: PersonaSlug | null } = {},
): FeedExplanation {
  const reasons: string[] = [];
  const hoursSincePosted = Math.max(
    1,
    (Date.now() - new Date(post.createdAt).getTime()) / (1000 * 60 * 60),
  );

  if ((options.tab ?? 'for-you') !== 'for-you') {
    reasons.push(`Ranked in ${String(options.tab ?? 'for-you').replace(/-/g, ' ')} mode`);
  }

  if (options.persona && getPersonaRelevance(post, options.persona) > 0) {
    reasons.push(`Aligned with your ${options.persona.replace('_', ' ')} persona`);
  }

  if (post.voteScore >= 5) {
    reasons.push('Strong trust-weighted engagement');
  }

  if (post.commentCount >= 3) {
    reasons.push('Active discussion momentum');
  }

  if (post.author.scoreSummary?.credibility_score && post.author.scoreSummary.credibility_score >= 20) {
    reasons.push('Author has visible credibility in this network');
  }

  const layer: FeedExplanation['layer'] =
    hoursSincePosted <= 12 ? 'real-time' : hoursSincePosted <= 72 ? 'rising' : 'stable';

  if (reasons.length === 0) {
    reasons.push('Selected to diversify your feed');
  }

  return { layer, reasons: reasons.slice(0, 3) };
}

export function computeFeedScore(
  post: PostSummary,
  communityRepByAuthor = new Map<string, number>(),
  options: { tab?: string; persona?: PersonaSlug | null } = {},
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
  const trustBonus =
    ((post.author.scoreSummary?.credibility_score ?? 0) * 0.02) +
    ((post.author.scoreSummary?.contribution_score ?? 0) * 0.015);
  const personaBoost = getPersonaRelevance(post, options.persona);
  const postTypeBoost = getPostTypeBoost(post);
  const tabBoost = getTabBoost(post, options.tab ?? 'for-you');

  return (
    post.voteScore * 1.5 +
    post.commentCount * 2 +
    post.saveCount +
    unansweredBoost +
    authorRepBonus -
    timeDecay +
    trustBonus +
    personaBoost +
    postTypeBoost +
    tabBoost
  );
}

export function getRankedFeed(
  posts: PostSummary[],
  communityRepByAuthor = new Map<string, number>(),
  options: { tab?: string; persona?: PersonaSlug | null } = {},
) {
  return [...posts].sort(
    (left, right) =>
      computeFeedScore(right, communityRepByAuthor, options) -
      computeFeedScore(left, communityRepByAuthor, options),
  );
}
