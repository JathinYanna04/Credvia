import { describe, expect, it } from 'vitest';
import type { CareerStructuredProfile } from '@/components/career-match/types';
import { buildResumeAtsAnalysis } from '@/lib/resume/intelligence';

function buildProfile(overrides: Partial<CareerStructuredProfile> = {}): CareerStructuredProfile {
  return {
    candidate: {
      full_name: 'Vaishali Ragi',
      current_title: 'Software Engineering Student',
      email: 'vaishali@example.com',
      phone: '+91 9999999999',
      location: 'Hyderabad, India',
      linkedin: null,
      github: 'https://github.com/vaishali',
      portfolio: null,
      summary: 'Engineering student building ATS and matching tools with FastAPI and TypeScript.',
    },
    skills: {
      languages: ['Python', 'TypeScript'],
      frameworks: ['FastAPI', 'React'],
      libraries: [],
      tools: ['Docker'],
      databases: ['PostgreSQL'],
      cloud: [],
      ai_ml: [],
      devops: [],
      platforms: [],
      others: ['Problem solving'],
      spoken_languages: ['English', 'Hindi'],
    },
    experience: [],
    projects: [
      {
        name: 'Resume Intelligence',
        description: 'ATS analysis platform',
        technologies: ['FastAPI', 'React', 'PostgreSQL'],
        links: [],
        bullets: [
          'Built an ATS scoring workflow with explainable factor breakdowns.',
          'Implemented retry-safe remote extraction integration for Render cold starts.',
        ],
      },
    ],
    education: [
      {
        institution: 'ABC University',
        degree: 'B.Tech Computer Science',
        field_of_study: 'Computer Science',
        start_date: '2022',
        end_date: '2026',
        grade: '8.8',
        location: 'Hyderabad',
        description: null,
      },
    ],
    additional: {
      certifications: [],
      achievements: [],
      hackathons: ['Hackathon Finalist'],
      leadership: [],
      volunteering: [],
      publications: [],
      positions_of_responsibility: [],
      extracurricular: [],
    },
    provenance: {},
    diagnostics: {
      finalSource: 'merged',
      llmStatus: 'success',
      confidence: 86,
      ocrStatus: 'skipped_unnecessary',
    },
    analysis: null,
    ...overrides,
  };
}

describe('resume ATS intelligence', () => {
  it('scores students fairly when projects are strong', () => {
    const analysis = buildResumeAtsAnalysis({
      profile: {
        id: 'profile-1',
        resume_id: 'resume-1',
        user_id: 'user-1',
        full_name: 'Vaishali Ragi',
        email: 'vaishali@example.com',
        phone: '+91 9999999999',
        location: 'Hyderabad, India',
        summary: 'Engineering student',
        current_title: 'Student',
        years_experience: null,
        education: [],
        experience: [],
        projects: [],
        raw_sections: { summary: [], skills: [], projects: [], experience: [], education: [], other: [], __meta: { finalSource: 'merged', llmStatus: 'success', extractionQuality: { confidenceScore: 86, confidenceTier: 'high' } } },
        parsed_text: 'parsed',
        parsed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      effectiveProfile: buildProfile(),
      topMatches: [],
    });

    expect(analysis).not.toBeNull();
    expect(analysis!.overallScore).toBeGreaterThanOrEqual(65);
    expect(analysis!.experienceDepth).toBeGreaterThanOrEqual(60);
  });

  it('penalizes weak extraction without pretending confidence is strong', () => {
    const analysis = buildResumeAtsAnalysis({
      profile: {
        id: 'profile-2',
        resume_id: 'resume-2',
        user_id: 'user-1',
        full_name: null,
        email: null,
        phone: null,
        location: null,
        summary: null,
        current_title: null,
        years_experience: null,
        education: [],
        experience: [],
        projects: [],
        raw_sections: { summary: [], skills: [], projects: [], experience: [], education: [], other: [], __meta: { finalSource: 'heuristic_fallback', llmStatus: 'error', llmError: 'timeout', extractionQuality: { confidenceScore: 28, confidenceTier: 'low' } } },
        parsed_text: 'parsed',
        parsed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      effectiveProfile: buildProfile({
        candidate: {
          full_name: null,
          current_title: null,
          email: null,
          phone: null,
          location: null,
          linkedin: null,
          github: null,
          portfolio: null,
          summary: null,
        },
        skills: {
          languages: [],
          frameworks: [],
          libraries: [],
          tools: [],
          databases: [],
          cloud: [],
          ai_ml: [],
          devops: [],
          platforms: [],
          others: [],
          spoken_languages: [],
        },
        projects: [],
        education: [],
        diagnostics: {
          finalSource: 'heuristic_fallback',
          llmStatus: 'error',
          confidence: 28,
          ocrStatus: 'attempted_no_gain',
        },
      }),
      topMatches: [],
    });

    expect(analysis).not.toBeNull();
    expect(analysis!.overallScore).toBeLessThan(50);
    expect(analysis!.confidenceLabel).toBe('low');
    expect(analysis!.warnings.some((warning) => warning.includes('deterministic fallback'))).toBe(true);
  });
});
