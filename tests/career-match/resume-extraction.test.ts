import { afterEach, describe, expect, it } from 'vitest';
import {
  __setResumeExtractionTestOverrides,
  assessResumeTextQuality,
  extractResumeText,
} from '@/lib/resume/extract';
import { parseResumeText } from '@/lib/resume/parse';

const sampleResumeText = `
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
`;

afterEach(() => {
  __setResumeExtractionTestOverrides(null);
});

describe('resume extraction quality', () => {
  it('rejects PDF internal metadata masquerading as resume text', () => {
    const brokenPdfText =
      'Linearized 1 /L 165905 /H O 8 /E 165310 /N 1 /T 165621 Type /XRef /Length 80 /Filter /FlateDecode /DecodeParms Columns 5 /Predictor 12 /Type /Catalog Type /ObjStm /Length 2278 /Filter /FlateDecode /N 33 /First 250 /Producer (pdfTeX-1.40.27)';

    const quality = assessResumeTextQuality(brokenPdfText);

    expect(quality.isAcceptable).toBe(false);
    expect(quality.reason).toMatch(/raw PDF internals|too short to build/);
  });

  it('accepts readable resume-style text', () => {
    const quality = assessResumeTextQuality(sampleResumeText);

    expect(quality.isAcceptable).toBe(true);
    expect(quality.alphaWordCount).toBeGreaterThan(20);
    expect(quality.confidenceTier).not.toBe('low');
  });
});

describe('resume extraction recovery', () => {
  it('succeeds for a clean PDF via direct extraction', async () => {
    __setResumeExtractionTestOverrides({
      pdfDirectText: sampleResumeText,
    });

    const result = await extractResumeText(
      Buffer.from('fake pdf'),
      'application/pdf',
      'resume.pdf',
    );

    expect(result.method).toBe('pdf-direct');
    expect(result.usedOcr).toBe(false);
    expect(result.attemptedMethods).toEqual(['pdf-direct']);
    expect(result.quality.isAcceptable).toBe(true);
  });

  it('falls back to OCR when direct PDF extraction is noisy', async () => {
    __setResumeExtractionTestOverrides({
      pdfDirectText:
        'Linearized 1 /L 165905 /H O 8 /E 165310 /N 1 /T 165621 Type /XRef /Length 80 /Filter /FlateDecode',
      pdfCleanedText: '/Type /Catalog stream endstream xref obj',
      pdfTokenText: 'ObjStm Filter DecodeParms Length 2278 First 250',
      pdfOcrText: sampleResumeText,
      ocrConfidence: 92,
    });

    const result = await extractResumeText(
      Buffer.from('fake pdf'),
      'application/pdf',
      'resume.pdf',
    );

    expect(result.method).toBe('pdf-ocr');
    expect(result.usedOcr).toBe(true);
    expect(result.attemptedMethods).toEqual([
      'pdf-direct',
      'pdf-cleaned',
      'pdf-token-fallback',
      'pdf-ocr',
    ]);
    expect(result.quality.isAcceptable).toBe(true);
    expect(result.quality.confidenceTier).toMatch(/high|medium/);
  });

  it('can force OCR even when a direct candidate exists', async () => {
    __setResumeExtractionTestOverrides({
      pdfDirectText: sampleResumeText,
      pdfOcrText: sampleResumeText.replace('Skills:', 'Skills:\n-'),
      ocrConfidence: 96,
    });

    const result = await extractResumeText(
      Buffer.from('fake pdf'),
      'application/pdf',
      'resume.pdf',
      { forceOcr: true },
    );

    expect(result.attemptedMethods).toContain('pdf-ocr');
    expect(result.usedOcr).toBe(true);
  });

  it('fails only after all PDF extraction methods are exhausted', async () => {
    __setResumeExtractionTestOverrides({
      pdfDirectText: 'stream endstream xref obj /Type /Catalog',
      pdfCleanedText: 'obj obj obj stream stream',
      pdfTokenText: '/XRef /Length /Filter /Producer',
      pdfOcrText: 'scan',
      ocrConfidence: 18,
    });

    await expect(
      extractResumeText(Buffer.from('fake pdf'), 'application/pdf', 'resume.pdf'),
    ).rejects.toMatchObject({
      message: 'This resume could not be read reliably. Try a clearer PDF or DOCX.',
      attemptedMethods: ['pdf-direct', 'pdf-cleaned', 'pdf-token-fallback', 'pdf-ocr'],
    });
  });

  it('succeeds for DOCX extraction', async () => {
    __setResumeExtractionTestOverrides({
      docxText: sampleResumeText,
    });

    const result = await extractResumeText(
      Buffer.from('fake docx'),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'resume.docx',
    );

    expect(result.method).toBe('docx-direct');
    expect(result.usedOcr).toBe(false);
    expect(result.attemptedMethods).toEqual(['docx-direct']);
    expect(result.quality.isAcceptable).toBe(true);
  });

  it('normalizes OCR cleanup output for wrapped lines and bullets', async () => {
    __setResumeExtractionTestOverrides({
      pdfDirectText: 'stream endstream xref obj /Type /Catalog',
      pdfCleanedText: 'obj obj obj stream stream',
      pdfTokenText: '/XRef /Length /Filter /Producer',
      pdfOcrText: `
        Jane Builder
        Product Engineer
        jane@example.com
        Experi-
        ence
        \u2022 Built product platforms
        Skills
        TypeScript React PostgreSQL
        Educa-
        tion
        BSc Computer Science
        Projects
        Led product launches
      `,
      ocrConfidence: 88,
    });

    const result = await extractResumeText(
      Buffer.from('fake pdf'),
      'application/pdf',
      'resume.pdf',
    );

    expect(result.text).toContain('Experience');
    expect(result.text).toContain('- Built product platforms');
    expect(result.text).toContain('Education');
  });
});

describe('resume parsing', () => {
  it('extracts structured fields from readable resume text', () => {
    const parsed = parseResumeText(sampleResumeText, {
      extractionMethod: 'pdf-ocr',
      attemptedMethods: ['pdf-direct', 'pdf-cleaned', 'pdf-token-fallback', 'pdf-ocr'],
      usedOcr: true,
    });

    expect(parsed.fullName).toBe('Jane Builder');
    expect(parsed.currentTitle).toBe('Product Engineer');
    expect(parsed.email).toBe('jane@example.com');
    expect(parsed.summary).toContain('startup tools');
    expect(parsed.parsedSections.__meta?.attemptedMethods).toEqual([
      'pdf-direct',
      'pdf-cleaned',
      'pdf-token-fallback',
      'pdf-ocr',
    ]);
    expect(parsed.directSkillSlugs).toEqual(
      expect.arrayContaining(['typescript', 'react', 'postgresql']),
    );
  });
});
