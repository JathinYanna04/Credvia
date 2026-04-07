import type {
  CommentSummary,
  CommunitySummary,
  NotificationSummary,
  PostSummary,
  UserSummary,
} from '@/lib/types';

const webDevCommunity: CommunitySummary = {
  id: 'community-web-dev',
  name: 'Web Development',
  slug: 'web-dev',
  description: 'HTML, CSS, browser APIs, frameworks, and frontend systems thinking.',
  icon: 'WD',
  memberCount: 18400,
  postCount: 3220,
  accent: 'var(--accent)',
};

const aiCommunity: CommunitySummary = {
  id: 'community-ai-ml',
  name: 'AI / ML',
  slug: 'ai-ml',
  description: 'Applied machine learning, LLM workflows, evaluation, and model engineering.',
  icon: 'AI',
  memberCount: 12900,
  postCount: 2874,
  accent: 'var(--info)',
};

const openSourceCommunity: CommunitySummary = {
  id: 'community-open-source',
  name: 'Open Source',
  slug: 'open-source',
  description: 'Contributing, maintainer habits, project discovery, and public proof-of-work.',
  icon: 'OS',
  memberCount: 9300,
  postCount: 1428,
  accent: 'var(--success)',
};

const communities: CommunitySummary[] = [
  webDevCommunity,
  aiCommunity,
  openSourceCommunity,
];

const adaUser: UserSummary = {
  id: 'user-ada',
  username: 'adaforge',
  fullName: 'Ada Narang',
  headline: 'Frontend engineer building design systems and DX workflows.',
  avatarUrl: '',
  skills: ['TypeScript', 'React', 'Design Systems'],
  location: 'Bengaluru',
  currentCompany: 'Forge Labs',
  reputation: [
    {
      communityId: webDevCommunity.id,
      communityName: webDevCommunity.name,
      communitySlug: webDevCommunity.slug,
      score: 1480,
    },
    {
      communityId: openSourceCommunity.id,
      communityName: openSourceCommunity.name,
      communitySlug: openSourceCommunity.slug,
      score: 460,
    },
  ],
};

const rioUser: UserSummary = {
  id: 'user-rio',
  username: 'rioquery',
  fullName: 'Rio Patel',
  headline: 'Backend engineer focused on search, performance, and ranking.',
  avatarUrl: '',
  skills: ['PostgreSQL', 'Search', 'Next.js'],
  location: 'Pune',
  currentCompany: 'Schema House',
  reputation: [
    {
      communityId: aiCommunity.id,
      communityName: aiCommunity.name,
      communitySlug: aiCommunity.slug,
      score: 2860,
    },
  ],
};

const users: UserSummary[] = [adaUser, rioUser];

export const mockCommunities = communities;
export const mockUsers = users;

export const mockPosts: PostSummary[] = [
  {
    id: 'post-ranking',
    title: 'How would you rank internship projects to show actual engineering depth?',
    body: 'I have three shipped projects: a compiler toy, a production dashboard clone, and an open-source CLI. I want to present them to recruiters in a way that shows tradeoff thinking instead of just screenshots.',
    createdAt: new Date(Date.now() - 1000 * 60 * 48).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 48).toISOString(),
    postType: 'question',
    voteScore: 84,
    commentCount: 12,
    saveCount: 19,
    author: adaUser,
    community: webDevCommunity,
    tags: ['portfolio', 'internships', 'frontend'],
  },
  {
    id: 'post-oss',
    title: 'Project showcase: a semantic code search pipeline with pgvector and trigrams',
    body: 'Spent the last three weekends building a hybrid retrieval flow for source code. The surprising part: old-fashioned trigram support still carries a lot of weight for typo resilience.',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    postType: 'project_showcase',
    voteScore: 132,
    commentCount: 18,
    saveCount: 46,
    author: rioUser,
    community: openSourceCommunity,
    tags: ['postgresql', 'search', 'open-source'],
    externalUrl: 'https://github.com/credvia/example',
  },
  {
    id: 'post-unanswered',
    title: 'Question: what signals actually matter when applying to ML internships without published papers?',
    body: 'I can show project repos, Kaggle work, and one TA experience, but I have no publications. I am trying to understand what genuinely helps versus what just looks good on paper.',
    createdAt: new Date(Date.now() - 1000 * 60 * 22).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 22).toISOString(),
    postType: 'question',
    voteScore: 17,
    commentCount: 0,
    saveCount: 11,
    author: rioUser,
    community: aiCommunity,
    tags: ['internships', 'ml-careers'],
    unanswered: true,
  },
];

export const mockComments: CommentSummary[] = [
  {
    id: 'comment-1',
    author: rioUser,
    body: 'Rank them by technical complexity, then explicitly call out constraints, tradeoffs, and what changed after feedback. Recruiters remember decision-making more than polished screenshots.',
    createdAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    voteScore: 24,
    isBestAnswer: true,
    replies: [
      {
        id: 'comment-1-1',
        author: adaUser,
        body: 'That framing helps a lot. I had been leading with visuals instead of systems decisions.',
        createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
        updatedAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
        voteScore: 7,
      },
    ],
  },
  {
    id: 'comment-2',
    author: adaUser,
    body: 'If one project has real users, put that first even if it is less novel. Usage pressure usually reveals better engineering judgment than isolated demos.',
    createdAt: new Date(Date.now() - 1000 * 60 * 9).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 9).toISOString(),
    voteScore: 16,
  },
];

export const mockNotifications: NotificationSummary[] = [
  {
    id: 'notification-1',
    type: 'best_answer',
    actor: rioUser,
    description: 'marked your reply as the best answer in Web Development.',
    createdAt: new Date(Date.now() - 1000 * 60 * 32).toISOString(),
    unread: true,
  },
  {
    id: 'notification-2',
    type: 'follow',
    actor: adaUser,
    description: 'followed your profile after your search pipeline post.',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    unread: false,
  },
];
