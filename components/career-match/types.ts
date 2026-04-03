import type { AnyResumeStatus } from '@/lib/resume/lifecycle';

export interface CareerSkill {
  id: string;
  slug: string;
  name: string;
}

export interface CareerResumeExtractionMeta {
  extractionMethod?: string;
  attemptedMethods?: string[];
  extractionQuality?: {
    confidenceScore?: number;
    confidenceTier?: 'high' | 'medium' | 'low';
    likelyScannedPdf?: boolean;
    humanReadableRatio?: number;
    suspiciousTokenCount?: number;
    resumeHintCount?: number;
    pdfInternalHitCount?: number;
    contaminationScore?: number;
    salvageScore?: number;
    [key: string]: unknown;
  };
  usedOcr?: boolean;
  ocrAttempted?: boolean;
  ocrImprovedQuality?: boolean | null;
  ocrConfidence?: number | null;
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
  rawText?: string;
  cleanedText?: string;
  finalSource?: 'llm' | 'heuristic_fallback' | 'merged';
  llmStatus?: 'success' | 'invalid_json' | 'timeout' | 'error' | 'skipped';
  llmError?: string | null;
  llmRawPresent?: boolean | null;
}

export interface CareerResumeAnalysisReadiness {
  ready: boolean;
  code:
    | 'RESUME_FILE_MISSING'
    | 'RESUME_FILE_UNSUPPORTED'
    | 'RESUME_TEXT_MISSING'
    | 'ANALYSIS_IN_PROGRESS'
    | 'RESUME_NOT_READY'
    | null;
  message: string | null;
}

export interface CareerResumeSections {
  summary: string[];
  skills: string[];
  projects: string[];
  experience: string[];
  education: string[];
  other: string[];
  __meta?: CareerResumeExtractionMeta;
}

export interface CareerResumeProfile {
  id: string;
  resume_id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  summary: string | null;
  current_title: string | null;
  years_experience: number | null;
  education: string[];
  experience: string[];
  projects: string[];
  raw_sections: CareerResumeSections;
  parsed_text: string | null;
  parsed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CareerResumeSummary {
  id: string;
  user_id: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  file_size_bytes: number | null;
  is_active: boolean;
  parse_status: AnyResumeStatus;
  source: string;
  uploaded_at: string;
  created_at: string;
  updated_at: string;
  profile: CareerResumeProfile | null;
  skills: CareerSkill[];
  latestRun?: {
    resume_id: string;
    status: string;
    parser_version: string | null;
    error_message: string | null;
    created_at: string;
  } | null;
}

export interface CareerAnalysisRun {
  id: string;
  resume_id: string;
  user_id: string;
  status:
    | 'queued'
    | 'running'
    | 'extracting'
    | 'parsing'
    | 'analyzing'
    | 'completed'
    | 'failed';
  parser_version: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface CareerJobCompany {
  id: string;
  source_key: string;
  source_company_id: string;
  company_name: string;
  company_slug: string | null;
  website_url: string | null;
  careers_url: string | null;
  location: string | null;
  remote_policy: string | null;
  company_stage: string | null;
  is_hiring: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CareerJobSkill {
  slug: string;
  name: string;
  required: boolean;
  weight: number;
}

export interface CareerJob {
  id: string;
  startup_company_id: string;
  source_key: string;
  source_job_id: string;
  title: string;
  role_family: string | null;
  seniority: string | null;
  location: string | null;
  remote_policy: string | null;
  description_raw: string | null;
  description_clean: string | null;
  apply_url: string;
  salary_min: number | null;
  salary_max: number | null;
  currency: string | null;
  is_active: boolean;
  posted_at: string | null;
  ingested_at: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  company: CareerJobCompany | null;
  skills: CareerJobSkill[];
}

export interface CareerMatch {
  id: string;
  user_id: string;
  resume_id: string;
  job_id: string;
  overall_score: number;
  skill_match_score: number;
  title_fit_score: number;
  experience_score: number;
  location_fit_score: number;
  matched_skills: string[];
  missing_skills: string[];
  strengths: string[];
  warnings: string[];
  explanation: {
    fitEstimateLabel?: string;
    roleFamily?: {
      resume?: string;
      job?: string;
    };
    matchedSkillCount?: number;
    missingSkillCount?: number;
    [key: string]: unknown;
  };
  computed_at: string;
  created_at: string;
  updated_at: string;
  saved?: boolean;
  job: CareerJob | null;
}

export interface CareerResumeDetail {
  resume: CareerResumeSummary;
  analysisReadiness: CareerResumeAnalysisReadiness;
  profile: CareerResumeProfile | null;
  skills: Array<{
    source: string;
    confidence: number;
    skill: CareerSkill;
  }>;
  analysisRuns: CareerAnalysisRun[];
  topMatches: CareerMatch[];
}
