import { describe, expect, it } from 'vitest';
import type { CareerStructuredProfile } from '@/components/career-match/types';
import { computeJobMatch } from '@/lib/matching/score';

const structuredProfile: CareerStructuredProfile = {
  candidate: {
    full_name: 'Vaishali Ragi',
    current_title: 'Backend Developer',
    email: 'vaishali@example.com',
    phone: '+91 9999999999',
    location: 'Hyderabad, India',
    linkedin: null,
    github: 'https://github.com/vaishali',
    portfolio: null,
    summary: 'Backend-focused builder working with FastAPI, TypeScript, and PostgreSQL.',
  },
  skills: {
    languages: ['Python', 'TypeScript'],
    frameworks: ['FastAPI', 'React'],
    libraries: [],
    tools: ['Docker'],
    databases: ['PostgreSQL'],
    cloud: ['AWS'],
    ai_ml: [],
    devops: [],
    platforms: [],
    others: [],
    spoken_languages: ['English'],
  },
  experience: [],
  projects: [
    {
      name: 'Resume Intelligence',
      description: 'ATS analysis and matching',
      technologies: ['FastAPI', 'React', 'PostgreSQL'],
      links: [],
      bullets: [
        'Built retry-safe extraction flows for Render cold starts and production resilience.',
        'Implemented ATS and job matching logic grounded in structured evidence.',
      ],
    },
  ],
  education: [],
  additional: {
    certifications: [],
    achievements: [],
    hackathons: [],
    leadership: [],
    volunteering: [],
    publications: [],
    positions_of_responsibility: [],
    extracurricular: [],
  },
  provenance: {},
  diagnostics: {},
  analysis: null,
};

describe('job match scoring', () => {
  it('penalizes missing must-have skills', () => {
    const match = computeJobMatch({
      structuredProfile,
      job: {
        id: 'job-1',
        startup_company_id: 'company-1',
        source_key: 'test',
        source_job_id: 'job-1',
        title: 'Backend Engineer',
        role_family: 'engineering',
        seniority: 'mid',
        location: 'Remote',
        remote_policy: 'remote',
        description_raw: 'Build backend services with Go, Kafka, and PostgreSQL.',
        description_clean: 'Build backend services with Go, Kafka, and PostgreSQL.',
        apply_url: 'https://example.com',
        salary_min: null,
        salary_max: null,
        currency: null,
        is_active: true,
        posted_at: null,
        ingested_at: new Date().toISOString(),
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      jobSkills: [
        { slug: 'go', name: 'Go', required: true, weight: 1.5 },
        { slug: 'kafka', name: 'Kafka', required: true, weight: 1.5 },
        { slug: 'postgresql', name: 'PostgreSQL', required: true, weight: 1.2 },
      ],
    });

    expect(match.missingSkills).toContain('Go');
    expect(match.overallScore).toBeLessThan(70);
  });

  it('rewards strong project evidence for fresher-style profiles', () => {
    const match = computeJobMatch({
      structuredProfile,
      job: {
        id: 'job-2',
        startup_company_id: 'company-1',
        source_key: 'test',
        source_job_id: 'job-2',
        title: 'Backend Engineer',
        role_family: 'engineering',
        seniority: 'junior',
        location: 'Remote',
        remote_policy: 'remote',
        description_raw: 'Build ATS pipelines, APIs, and Postgres-backed services.',
        description_clean: 'Build ATS pipelines, APIs, and Postgres-backed services.',
        apply_url: 'https://example.com',
        salary_min: null,
        salary_max: null,
        currency: null,
        is_active: true,
        posted_at: null,
        ingested_at: new Date().toISOString(),
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      jobSkills: [
        { slug: 'python', name: 'Python', required: true, weight: 1.5 },
        { slug: 'fastapi', name: 'FastAPI', required: true, weight: 1.5 },
        { slug: 'postgresql', name: 'PostgreSQL', required: true, weight: 1.2 },
      ],
    });

    expect(match.overallScore).toBeGreaterThanOrEqual(65);
    expect(Array.isArray((match.explanation as { matchedEvidence?: unknown[] }).matchedEvidence)).toBe(true);
  });
});
