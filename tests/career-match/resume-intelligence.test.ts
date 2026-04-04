import { describe, expect, it } from 'vitest';
import type { CareerStructuredProfile } from '@/components/career-match/types';
import {
  buildResumeAtsAnalysis,
  getEffectiveStructuredProfile,
  normalizeResumeAtsAnalysis,
} from '@/lib/resume/intelligence';

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
        raw_sections: { summary: [], skills: [], projects: [], experience: [], education: [], other: [], __meta: { finalSource: 'merged', llmStatus: 'success', llmRequested: true, llmSkipped: false, llmAttempted: true, extractionQuality: { confidenceScore: 86, confidenceTier: 'high' } } },
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
    expect(analysis!.overallScoreDetail).toMatchObject({
      value: analysis!.overallScore,
      max: 100,
    });
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
        raw_sections: { summary: [], skills: [], projects: [], experience: [], education: [], other: [], __meta: { finalSource: 'deterministic_only', llmStatus: 'error', llmRequested: true, llmSkipped: false, llmAttempted: true, llmError: 'timeout', extractionQuality: { confidenceScore: 28, confidenceTier: 'low' } } },
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
          finalSource: 'deterministic_only',
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

  it('manual overrides immediately affect the effective profile and ATS analysis', () => {
    const profile = {
      id: 'profile-3',
      resume_id: 'resume-3',
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
      raw_sections: {
        summary: [],
        skills: [],
        projects: [],
        experience: [],
        education: [],
        other: [],
        __structured: buildProfile(),
        __manual: {
          candidate: { current_title: 'Backend Developer' },
          skills: { languages: ['Python', 'TypeScript', 'Go'] },
        },
      },
      parsed_text: 'parsed',
      parsed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const effectiveProfile = getEffectiveStructuredProfile(profile);
    const analysis = buildResumeAtsAnalysis({
      profile,
      effectiveProfile,
      topMatches: [],
    });

    expect(effectiveProfile?.candidate.current_title).toBe('Backend Developer');
    expect(effectiveProfile?.skills.languages).toContain('Go');
    expect(analysis).not.toBeNull();
    expect(analysis!.skillsCoverage).toBeGreaterThan(50);
  });

  it('normalizes object-shaped overall score back to the numeric contract', () => {
    const normalized = normalizeResumeAtsAnalysis({
      overallScore: {
        value: 78,
        max: 100,
        label: 'Strong',
        confidence: 0.84,
      },
      mode: 'general',
      parseConfidence: 80,
      sectionCompleteness: 70,
      contactCompleteness: 70,
      skillsCoverage: 70,
      educationQuality: 70,
      experienceDepth: 70,
      projectsQuality: 70,
      strengths: [],
      warnings: [],
      missingEssentials: [],
      missingKeywords: [],
      confidenceLabel: 'medium',
      summary: 'Test summary',
      subScores: [],
      suggestedActions: [],
    } as never);

    expect(normalized?.overallScore).toBe(78);
    expect(normalized?.overallScoreDetail).toMatchObject({
      value: 78,
      max: 100,
      label: 'Strong',
      confidence: 0.84,
    });
  });
});
