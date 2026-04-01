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
Summary: Product engineer building startup tools
Experience: 4 years building startup tools
Skills: TypeScript, React, PostgreSQL, Supabase
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
    expect(quality.reason).toContain('raw PDF internals');
  });

  it('accepts readable resume-style text', () => {
    const quality = assessResumeTextQuality(sampleResumeText);

    expect(quality.isAcceptable).toBe(true);
    expect(quality.alphaWordCount).toBeGreaterThan(20);
  });
});

describe('resume extraction fallbacks', () => {
  it('extracts clean text from a PDF without OCR', async () => {
    __setResumeExtractionTestOverrides({
      extractPdfTextWithPdfJs: async () => sampleResumeText,
    });

    const result = await extractResumeText(
      Buffer.from('fake-pdf'),
      'application/pdf',
      'resume.pdf',
    );

    expect(result.method).toBe('pdfjs-text');
    expect(result.usedOcr).toBe(false);
    expect(result.attemptedMethods).toContain('pdfjs-text');
    expect(result.quality.confidenceTier).toBe('high');
    expect(result.text).toContain('Product Engineer');
  });

  it('falls back to OCR when direct PDF extraction is too noisy', async () => {
    __setResumeExtractionTestOverrides({
      extractPdfTextWithPdfJs: async () =>
        'Linearized 1 /L 165905 /H O 8 /E 165310 /Type /ObjStm /FlateDecode',
      extractPdfTextWithPdfParse: async () =>
        'stream endobj xref /Producer (pdfTeX-1.40.27)',
      extractPdfTextFallback: () =>
        'obj 12 0 stream /Length 2278 /Filter /FlateDecode',
      extractPdfTextWithOcr: async () => ({
        text: sampleResumeText,
        confidence: 93,
      }),
    });

    const result = await extractResumeText(
      Buffer.from('fake-pdf'),
      'application/pdf',
      'resume.pdf',
    );

    expect(result.method).toBe('pdf-ocr');
    expect(result.usedOcr).toBe(true);
    expect(result.ocrConfidence).toBe(93);
    expect(result.attemptedMethods).toEqual(
      expect.arrayContaining(['pdfjs-text', 'pdf-parse-fallback', 'pdf-token-fallback', 'pdf-ocr']),
    );
    expect(result.quality.confidenceTier).toBe('high');
  });

  it('supports forceOCR to prefer OCR when requested', async () => {
    __setResumeExtractionTestOverrides({
      extractPdfTextWithPdfJs: async () =>
        'Skills Projects Summary Experience Education TypeScript React',
      extractPdfTextWithOcr: async () => ({
        text: `
          Jane Builder
          Experience: Led engineering execution
          Skills: TypeScript, OCR, Parsing
          Projects: Built resume scoring workflows
          Education: BSc Computer Science
          Summary: Product engineer focused on reliable resume extraction
        `,
        confidence: 88,
      }),
    });

    const result = await extractResumeText(
      Buffer.from('fake-pdf'),
      'application/pdf',
      'resume.pdf',
      { forceOcr: true },
    );

    expect(result.usedOcr).toBe(true);
    expect(result.ocrAttempted).toBe(true);
    expect(result.ocrImprovedQuality).toBe(true);
    expect(result.method).toBe('pdf-ocr');
    expect(result.attemptedMethods).toContain('pdf-ocr');
  });

  it('supports forceOCR alias in extraction options', async () => {
    __setResumeExtractionTestOverrides({
      extractPdfTextWithPdfJs: async () =>
        'Skills Projects Summary Experience Education TypeScript React',
      extractPdfTextWithOcr: async () => ({
        text: `
          Jane Builder
          Summary: Reliable extraction specialist
          Experience: 3 years building OCR-assisted resume pipelines
          Skills: OCR, Parsing, TypeScript
          Projects: Improved scanned PDF recovery
          Education: BSc Computer Science
        `,
        confidence: 85,
      }),
    });

    const result = await extractResumeText(
      Buffer.from('fake-pdf'),
      'application/pdf',
      'resume.pdf',
      { forceOCR: true },
    );

    expect(result.usedOcr).toBe(true);
    expect(result.method).toBe('pdf-ocr');
  });

  it('throws only after all extraction methods, including OCR, fail', async () => {
    __setResumeExtractionTestOverrides({
      extractPdfTextWithPdfJs: async () => '',
      extractPdfTextWithPdfParse: async () => '',
      extractPdfTextFallback: () => '',
      extractPdfTextWithOcr: async () => ({
        text: '',
        confidence: 12,
      }),
    });

    await expect(
      extractResumeText(Buffer.from('fake-pdf'), 'application/pdf', 'resume.pdf'),
    ).rejects.toMatchObject({
      name: 'ResumeExtractionError',
      failureCode: 'EMPTY_EXTRACTED_TEXT',
      attemptedMethods: expect.arrayContaining(['pdf-ocr']),
    });
  });

  it('classifies image-based PDF failures when OCR still cannot recover quality text', async () => {
    __setResumeExtractionTestOverrides({
      extractPdfTextWithPdfJs: async () => '',
      extractPdfTextWithPdfParse: async () => '',
      extractPdfTextFallback: () => '',
      extractPdfTextWithOcr: async () => ({
        text: 'img 1 2 3 scan page',
        confidence: 19,
      }),
    });

    await expect(
      extractResumeText(Buffer.from('fake-pdf'), 'application/pdf', 'resume.pdf', {
        forceOCR: true,
      }),
    ).rejects.toMatchObject({
      failureCode: 'IMAGE_BASED_PDF',
    });
  });

  it('reports OCR attempted but not improved for low-quality OCR output', async () => {
    __setResumeExtractionTestOverrides({
      extractPdfTextWithPdfJs: async () =>
        'Experience Education Skills Projects Summary LinkedIn GitHub',
      extractPdfTextWithPdfParse: async () =>
        'Experience Education Skills Projects Summary LinkedIn GitHub',
      extractPdfTextFallback: () =>
        'Experience Education Skills Projects Summary LinkedIn GitHub',
      extractPdfTextWithOcr: async () => ({
        text: 'page image scan block text',
        confidence: 22,
      }),
    });

    await expect(
      extractResumeText(Buffer.from('fake-pdf'), 'application/pdf', 'resume.pdf', {
        forceOCR: true,
      }),
    ).rejects.toMatchObject({
      failureCode: 'LOW_TEXT_CONFIDENCE',
      diagnostics: expect.objectContaining({
        ocrAttempted: true,
        ocrImprovedQuality: false,
      }),
    });
  });

  it('cleans OCR output by dehyphenating wrapped words and normalizing bullets', async () => {
    __setResumeExtractionTestOverrides({
      extractPdfTextWithPdfJs: async () => '',
      extractPdfTextWithPdfParse: async () => '',
      extractPdfTextFallback: () => '',
      extractPdfTextWithOcr: async () => ({
        text: `
          Jane Builder
          Experi-
          ence
          • Built resilient resume pipelines
          Skills
          • TypeScript
          • Resume parsing
          Educa-
          tion
          - BSc Computer Science
          Projects
          • Career hub matching improvements
          Summary
          Product engineer focused on reliable extraction
        `,
        confidence: 84,
      }),
    });

    const result = await extractResumeText(
      Buffer.from('fake-pdf'),
      'application/pdf',
      'resume.pdf',
    );

    expect(result.usedOcr).toBe(true);
    expect(result.text).toContain('Experience');
    expect(result.text).toContain('- Built resilient resume pipelines');
    expect(result.text).toContain('Education');
  });

  it('extracts DOCX text without OCR', async () => {
    __setResumeExtractionTestOverrides({
      extractDocxText: async () => sampleResumeText,
    });

    const result = await extractResumeText(
      Buffer.from('fake-docx'),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'resume.docx',
    );

    expect(result.method).toBe('docx-mammoth');
    expect(result.usedOcr).toBe(false);
    expect(result.attemptedMethods).toEqual(['docx-mammoth']);
    expect(result.text).toContain('Supabase');
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
