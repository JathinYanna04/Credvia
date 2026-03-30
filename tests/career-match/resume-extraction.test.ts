import { describe, expect, it } from 'vitest';
import { assessResumeTextQuality } from '@/lib/resume/extract';
import { parseResumeText } from '@/lib/resume/parse';

describe('resume extraction quality', () => {
  it('rejects PDF internal metadata masquerading as resume text', () => {
    const brokenPdfText =
      'Linearized 1 /L 165905 /H O 8 /E 165310 /N 1 /T 165621 Type /XRef /Length 80 /Filter /FlateDecode /DecodeParms Columns 5 /Predictor 12 /Type /Catalog Type /ObjStm /Length 2278 /Filter /FlateDecode /N 33 /First 250 /Producer (pdfTeX-1.40.27)';

    const quality = assessResumeTextQuality(brokenPdfText);

    expect(quality.isAcceptable).toBe(false);
    expect(quality.reason).toContain('raw PDF internals');
  });

  it('accepts readable resume-style text', () => {
    const readableResume = `
      Jane Builder
      Product Engineer
      jane@example.com
      Skills: TypeScript, React, PostgreSQL, Supabase
      Experience: 4 years building startup tools
      Projects: Led roadmap for developer platform
      Education: BSc Computer Science
    `;

    const quality = assessResumeTextQuality(readableResume);

    expect(quality.isAcceptable).toBe(true);
    expect(quality.alphaWordCount).toBeGreaterThan(20);
  });
});

describe('resume parsing', () => {
  it('extracts structured fields from readable resume text', () => {
    const parsed = parseResumeText(`
      Jane Builder
      Product Engineer
      jane@example.com
      +91 9000000000
      Bangalore, India
      Summary: Product engineer building startup tools
      Skills: TypeScript, React, PostgreSQL, Supabase
      Experience: 4 years building startup tools
      Projects: Led roadmap for developer platform
      Education: BSc Computer Science
    `);

    expect(parsed.fullName).toBe('Jane Builder');
    expect(parsed.currentTitle).toBe('Product Engineer');
    expect(parsed.email).toBe('jane@example.com');
    expect(parsed.summary).toContain('startup tools');
    expect(parsed.directSkillSlugs).toEqual(
      expect.arrayContaining(['typescript', 'react', 'postgresql']),
    );
  });
});
