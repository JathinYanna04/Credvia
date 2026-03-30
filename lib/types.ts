export type AccountType = 'student' | 'professional' | 'recruiter' | 'founder' | 'mentor';

export type PostType =
  | 'question'
  | 'discussion'
  | 'project_showcase'
  | 'resource'
  | 'opportunity'
  | 'resume_review'
  | 'looking_for_collaborator'
  | 'startup_idea';

export type FeedTab = 'for-you' | 'communities' | 'following';

export type NotificationType =
  | 'reply'
  | 'mention'
  | 'vote'
  | 'best_answer'
  | 'follow'
  | 'mod_action'
  | 'reputation_gain';

export interface CommunitySummary {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  memberCount: number;
  postCount: number;
  accent: string;
}

export interface ReputationSummary {
  communityId: string;
  communityName: string;
  communitySlug: string;
  score: number;
}

export interface UserSummary {
  id: string;
  username: string;
  fullName: string;
  headline: string;
  avatarUrl: string;
  skills: string[];
  location?: string;
  currentCompany?: string;
  reputation: ReputationSummary[];
}

export interface PostSummary {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  postType: PostType;
  voteScore: number;
  commentCount: number;
  saveCount: number;
  author: UserSummary;
  community: CommunitySummary;
  tags: string[];
  unanswered?: boolean;
  externalUrl?: string;
  startupIdea?: {
    problem: string;
    targetAudience: string;
    solution: string;
    marketCategory: string;
    stage: 'idea' | 'problem_validation' | 'mvp_building' | 'early_users';
    monetizationModel?: string;
    validationScore: number;
    uniqueCommenters: number;
  };
}

export interface CommentSummary {
  id: string;
  author: UserSummary;
  body: string;
  createdAt: string;
  voteScore: number;
  isBestAnswer?: boolean;
  replies?: CommentSummary[];
}

export interface NotificationSummary {
  id: string;
  type: NotificationType;
  actor: UserSummary;
  description: string;
  entityId?: string;
  entityType?: string;
  createdAt: string;
  unread: boolean;
}

export interface ApiError {
  code:
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'VALIDATION_ERROR'
    | 'RATE_LIMITED'
    | 'INTERNAL_ERROR';
  message: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
  meta?: {
    cursor?: string | null;
    total?: number;
  };
}
