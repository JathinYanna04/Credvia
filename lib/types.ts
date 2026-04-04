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
  | 'idea_revision'
  | 'mod_action'
  | 'reputation_gain';

export interface StartupIdeaRevisionSummary {
  id: string;
  revisionNumber: number;
  title: string;
  body: string;
  problem: string;
  targetAudience: string;
  solution: string;
  marketCategory: string;
  stage: 'idea' | 'problem_validation' | 'mvp_building' | 'early_users';
  monetizationModel?: string;
  changeSummary?: string;
  createdAt: string;
}

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
    followerCount: number;
    revisionCount: number;
    lastRevisionAt?: string;
    currentRevisionId?: string;
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
    | 'ANALYSIS_IN_PROGRESS'
    | 'RESUME_FILE_MISSING'
    | 'RESUME_FILE_UNSUPPORTED'
    | 'RESUME_TEXT_MISSING'
    | 'EXTRACTION_FAILED'
    | 'IMAGE_BASED_PDF'
    | 'LOW_TEXT_CONFIDENCE'
    | 'OCR_UNAVAILABLE'
    | 'OCR_FAILED'
    | 'EMPTY_EXTRACTED_TEXT'
    | 'RESUME_NOT_READY'
    | 'UNSUPPORTED_RESUME_FORMAT'
    | 'RESUME_ANALYSIS_RUNS_RLS_BLOCKED'
    | 'RATE_LIMITED'
    | 'ANALYSIS_SERVICE_UNAVAILABLE'
    | 'INTERNAL_ERROR';
  message: string;
  details?: unknown;
  suggestedAction?: string;
}

export interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
  meta?: {
    cursor?: string | null;
    total?: number;
  };
}

export interface AnalyzeResumeRequest {
  rerun?: boolean;
  targetRole?: string;
  jobDescription?: string;
  forceOCR?: boolean;
  forceOcr?: boolean;
}

export interface ResumeExtractionQualitySummary {
  textLength: number;
  wordCount: number;
  confidenceScore: number;
  confidenceTier: 'high' | 'medium' | 'low';
  detectedSectionCount: number;
  junkRatio: number;
  likelyScannedPdf: boolean;
  humanReadableRatio: number;
  suspiciousTokenCount: number;
  resumeHintCount: number;
  pdfInternalHitCount?: number;
  contaminationScore?: number;
  salvageScore?: number;
}

export interface ResumeExtractionSummary {
  method: string;
  attemptedMethods: string[];
  pageCount?: number;
  pageSourceSummary?: Record<string, number>;
  pageDecisions?: Array<Record<string, unknown>>;
  layoutReconstructionUsed?: boolean;
  usedOcr: boolean;
  ocrNeeded?: boolean;
  ocrStatus?:
    | 'skipped_unnecessary'
    | 'attempted_no_gain'
    | 'failed_preserved_previous'
    | 'used_successfully'
    | 'unavailable_preserved_previous'
    | null;
  ocrAttempted?: boolean;
  ocrImprovedQuality?: boolean | null;
  ocrConfidence: number | null;
  ocrAvailable?: boolean;
  ocrUnavailableReason?: string | null;
  acceptedWithWarnings?: boolean;
  warningCode?:
    | 'LOW_TEXT_CONFIDENCE'
    | 'OCR_UNAVAILABLE'
    | 'OCR_DID_NOT_IMPROVE'
    | 'SALVAGED_FROM_NOISE'
    | 'CLEANED_TEXT_LOW_SIGNAL'
    | null;
  warningMessage?: string | null;
  textLength?: number;
  cleanedTextLength?: number;
  contaminationScore?: number;
  salvageScore?: number;
  cleaningActions?: string[];
  readiness?: 'good' | 'partial' | 'poor' | 'failed';
  quality: ResumeExtractionQualitySummary;
}

export interface ResumeExtractionErrorDetails {
  reason?: string | null;
  attemptedMethods: string[];
  method: string | null;
  pageCount?: number;
  pageSourceSummary?: Record<string, number>;
  pageDecisions?: Array<Record<string, unknown>>;
  layoutReconstructionUsed?: boolean;
  usedOcr: boolean;
  ocrNeeded?: boolean;
  ocrStatus?:
    | 'skipped_unnecessary'
    | 'attempted_no_gain'
    | 'failed_preserved_previous'
    | 'used_successfully'
    | 'unavailable_preserved_previous'
    | null;
  ocrAttempted: boolean;
  ocrImprovedQuality: boolean | null;
  ocrConfidence: number | null;
  ocrAvailable?: boolean;
  ocrUnavailableReason?: string | null;
  textLength: number;
  cleanedTextLength?: number;
  wordCount: number;
  readiness: 'good' | 'partial' | 'poor' | 'failed';
  confidenceScore: number;
  confidenceTier: 'high' | 'medium' | 'low';
  detectedSectionCount: number;
  junkRatio: number;
  likelyScannedPdf: boolean;
  contaminationScore?: number;
  salvageScore?: number;
  cleaningActions?: string[];
}

export interface AnalyzeResumeResponse {
  analyzed: boolean;
  resumeId: string;
  status?: string;
  matchCount?: number;
  extraction?: ResumeExtractionSummary;
  warning?: string | null;
}
