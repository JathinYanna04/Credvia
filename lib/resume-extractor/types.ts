export type ExtractResponse = {
  schema_version: string;
  parser_version: string;
  request: {
    request_id: string;
    filename: string;
    mime_type: string;
    file_size_bytes: number;
    parsed_at: string;
  };
  status: {
    success: boolean;
    processing_mode: string;
    warnings: string[];
    errors: string[];
    confidence_overall: number;
  };
  raw: {
    raw_text: string;
    cleaned_text: string;
    page_count: number;
  };
  candidate: {
    full_name?: string | null;
    current_title?: string | null;
    email?: string | null;
    phone?: string | null;
    linkedin?: string | null;
    github?: string | null;
    portfolio?: string | null;
    location?: string | null;
    summary?: string | null;
  };
  sections: {
    skills: {
      languages: string[];
      frameworks: string[];
      tools: string[];
      databases: string[];
      cloud: string[];
      others: string[];
      spoken_languages: string[];
    };
    education: Array<{
      institution?: string | null;
      degree?: string | null;
      field_of_study?: string | null;
      start_date?: string | null;
      end_date?: string | null;
      grade?: string | null;
      location?: string | null;
      description?: string | null;
    }>;
    experience: Array<{
      company?: string | null;
      title?: string | null;
      location?: string | null;
      start_date?: string | null;
      end_date?: string | null;
      currently_working: boolean;
      bullets: string[];
      technologies: string[];
    }>;
    projects: Array<{
      name?: string | null;
      description?: string | null;
      technologies: string[];
      links: string[];
      bullets: string[];
    }>;
    certifications: string[];
    achievements: string[];
    positions_of_responsibility: string[];
    hackathons: string[];
    publications: string[];
    volunteering: string[];
  };
  ats: {
    total_experience_months: number | null;
    inferred_role?: string | null;
    seniority_level?: string | null;
    top_keywords: string[];
    missing_fields: string[];
    extraction_quality_score: number;
  };
  confidence: {
    candidate_basics: number;
    skills: number;
    education: number;
    experience: number;
    projects: number;
    overall: number;
  };
  diagnostics: {
    method_used: string;
    page_methods: Array<Record<string, string>>;
    contamination_score: number;
    salvage_score: number;
    cleaning_actions: string[];
    final_source?: 'llm' | 'heuristic_fallback' | 'merged';
    llm_status?: 'success' | 'invalid_json' | 'timeout' | 'error' | 'skipped';
    llm_error?: string | null;
    llm_raw_present?: boolean | null;
  };
  normalized_resume: {
    text: string;
    sections: Record<string, string[]>;
  };
};
