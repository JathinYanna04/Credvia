import { z } from 'zod';

const stringListSchema = z.array(z.string().trim()).default([]);

const candidateSchema = z.object({
  full_name: z.string().trim().nullable().optional(),
  current_title: z.string().trim().nullable().optional(),
  email: z.string().trim().nullable().optional(),
  phone: z.string().trim().nullable().optional(),
  linkedin: z.string().trim().nullable().optional(),
  github: z.string().trim().nullable().optional(),
  portfolio: z.string().trim().nullable().optional(),
  location: z.string().trim().nullable().optional(),
  summary: z.string().trim().nullable().optional(),
});

const skillsSchema = z.object({
  languages: stringListSchema,
  frameworks: stringListSchema,
  libraries: stringListSchema.optional().default([]),
  tools: stringListSchema,
  databases: stringListSchema,
  cloud: stringListSchema,
  ai_ml: stringListSchema.optional().default([]),
  devops: stringListSchema.optional().default([]),
  platforms: stringListSchema.optional().default([]),
  others: stringListSchema,
  spoken_languages: stringListSchema,
});

const educationSchema = z.object({
  institution: z.string().trim().nullable().optional(),
  degree: z.string().trim().nullable().optional(),
  field_of_study: z.string().trim().nullable().optional(),
  start_date: z.string().trim().nullable().optional(),
  end_date: z.string().trim().nullable().optional(),
  grade: z.string().trim().nullable().optional(),
  location: z.string().trim().nullable().optional(),
  description: z.string().trim().nullable().optional(),
});

const experienceSchema = z.object({
  company: z.string().trim().nullable().optional(),
  title: z.string().trim().nullable().optional(),
  location: z.string().trim().nullable().optional(),
  start_date: z.string().trim().nullable().optional(),
  end_date: z.string().trim().nullable().optional(),
  currently_working: z.boolean().default(false),
  bullets: stringListSchema,
  technologies: stringListSchema,
});

const projectSchema = z.object({
  name: z.string().trim().nullable().optional(),
  description: z.string().trim().nullable().optional(),
  technologies: stringListSchema,
  links: stringListSchema,
  bullets: stringListSchema,
});

export const extractorResponseSchema = z.object({
  schema_version: z.string(),
  parser_version: z.string(),
  request: z.object({
    request_id: z.string(),
    filename: z.string(),
    mime_type: z.string(),
    file_size_bytes: z.number(),
    parsed_at: z.string(),
  }),
  status: z.object({
    success: z.boolean(),
    processing_mode: z.string(),
    warnings: stringListSchema,
    errors: stringListSchema,
    confidence_overall: z.number(),
  }),
  raw: z.object({
    raw_text: z.string(),
    cleaned_text: z.string(),
    page_count: z.number(),
  }),
  candidate: candidateSchema,
  sections: z.object({
    skills: skillsSchema,
    education: z.array(educationSchema).default([]),
    experience: z.array(experienceSchema).default([]),
    projects: z.array(projectSchema).default([]),
    certifications: stringListSchema,
    achievements: stringListSchema,
    positions_of_responsibility: stringListSchema,
    hackathons: stringListSchema,
    volunteering: stringListSchema,
    publications: stringListSchema,
    extracurricular: stringListSchema.optional().default([]),
  }),
  ats: z.object({
    total_experience_months: z.number().nullable().default(null),
    inferred_role: z.string().trim().nullable().optional(),
    seniority_level: z.string().trim().nullable().optional(),
    top_keywords: stringListSchema,
    missing_fields: stringListSchema,
    extraction_quality_score: z.number().default(0),
  }).default({
    total_experience_months: null,
    inferred_role: null,
    seniority_level: null,
    top_keywords: [],
    missing_fields: [],
    extraction_quality_score: 0,
  }),
  confidence: z.object({
    candidate_basics: z.number().default(0),
    skills: z.number().default(0),
    education: z.number().default(0),
    experience: z.number().default(0),
    projects: z.number().default(0),
    overall: z.number().default(0),
  }).default({
    candidate_basics: 0,
    skills: 0,
    education: 0,
    experience: 0,
    projects: 0,
    overall: 0,
  }),
  diagnostics: z.object({
    method_used: z.string(),
    page_methods: z.array(z.record(z.string(), z.string())).default([]),
    page_decisions: z.array(z.record(z.string(), z.unknown())).default([]),
    page_source_summary: z.record(z.string(), z.number()).default({}),
    page_count: z.number().optional(),
    native_text_quality: z.record(z.string(), z.unknown()).optional(),
    contamination_score: z.number(),
    salvage_score: z.number(),
    extraction_quality_score: z.number().optional(),
    cleaning_actions: stringListSchema,
    ocr_needed: z.boolean().optional(),
    ocr_status: z
      .enum([
        'skipped_unnecessary',
        'attempted_no_gain',
        'failed_preserved_previous',
        'used_successfully',
        'unavailable_preserved_previous',
      ])
      .nullable()
      .optional(),
    ocr_attempted: z.boolean().optional(),
    ocr_improved_quality: z.boolean().nullable().optional(),
    layout_reconstruction_used: z.boolean().optional(),
    final_source: z
      .enum(['merged', 'deterministic_only', 'ocr_fallback'])
      .optional(),
    llm_requested: z.boolean().optional(),
    llm_skipped: z.boolean().optional(),
    llm_attempted: z.boolean().optional(),
    llm_status: z
      .enum(['success', 'error', 'skipped', 'not_configured'])
      .optional(),
    llm_error: z.string().nullable().optional(),
    llm_raw_present: z.boolean().nullable().optional(),
    warnings: stringListSchema.optional().default([]),
    errors: stringListSchema.optional().default([]),
    request_id: z.string().optional(),
    parser_version: z.string().optional(),
    schema_version: z.string().optional(),
  }),
  normalized_resume: z.object({
    text: z.string(),
    sections: z.record(z.string(), z.array(z.string())).default({}),
  }),
});

export type StrictExtractorResponse = z.infer<typeof extractorResponseSchema>;
