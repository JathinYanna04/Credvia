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

function createHexNoiseTokens(count: number, seed = 11) {
  return Array.from({ length: count }, (_, index) => {
    const hex = (index + seed).toString(16).padStart(4, '0');
    return `ab${hex}cd${hex}ef${hex}ab`;
  }).join(' ');
}

function createNeutralTokens(count: number, seed = 2000) {
  return Array.from({ length: count }, (_, index) => `n${seed + index}x`).join(' ');
}

const borderlineResumeSignalText = [
  'alex rivera engineer with profile summary focused on building reliable parsing services for hiring teams and candidate analytics across startup environments',
  'this narrative covers practical architecture api reliability incident response and testing practices with strong collaboration and delivery ownership',
  'experience spans backend workflows and production support while skills include typescript node react postgres observability communication planning and execution',
  'projects include extraction tuning ranking improvements service hardening and release verification with measurable operational outcomes',
  'contact email alex.rivera@example.com phone +1 555 0100 0100 linkedin github',
].join(' ');

const borderlineNoisyPdfText = [
  borderlineResumeSignalText,
  createNeutralTokens(22, 2020),
  createHexNoiseTokens(75, 21),
  'xref stream',
].join(' ');

const garbageText = [
  createHexNoiseTokens(240, 101),
  'xref obj stream endstream /Type /Catalog /Filter /FlateDecode',
  createNeutralTokens(60, 3030),
].join(' ');

afterEach(() => {
  __setResumeExtractionTestOverrides(null);
});

describe('resume extraction quality', () => {
  it('rejects PDF internal metadata masquerading as resume text', () => {
    const brokenPdfText =
      'Linearized 1 /L 165905 /H O 8 /E 165310 /N 1 /T 165621 Type /XRef /Length 80 /Filter /FlateDecode /DecodeParms Columns 5 /Type /Catalog Type /ObjStm /Length 2278 /Filter /FlateDecode /N 33 /First 250 /Producer (pdfTeX-1.40.27)';

    const quality = assessResumeTextQuality(brokenPdfText);

    expect(quality.isAcceptable).toBe(false);
    expect(quality.reason).toBeTruthy();
  });

  it('accepts readable resume-style text', () => {
    const quality = assessResumeTextQuality(sampleResumeText);

    expect(quality.isAcceptable).toBe(true);
    expect(quality.alphaWordCount).toBeGreaterThan(20);
    expect(quality.confidenceTier).not.toBe('low');
  });

  it('keeps hard failures for truly unreadable garbage text', () => {
    const quality = assessResumeTextQuality(garbageText);

    expect(quality.isAcceptable).toBe(false);
    expect(quality.junkRatio).toBeGreaterThan(0.7);
    expect(quality.reason).toBeTruthy();
  });
});

describe('resume extraction fallbacks', () => {
  it('extracts clean text from a PDF without OCR', async () => {
    __setResumeExtractionTestOverrides({
      pdfDirectText: sampleResumeText,
    });

    const result = await extractResumeText(
      Buffer.from('fake-pdf'),
      'application/pdf',
      'resume.pdf',
    );

    expect(result.method).toBe('pdfjs-text');
    expect(result.usedOcr).toBe(false);
    expect(result.attemptedMethods).toEqual(['pdfjs-text']);
    expect(result.quality.confidenceTier).toBe('high');
  });

  it('falls back to OCR when direct extraction is noisy', async () => {
    __setResumeExtractionTestOverrides({
      pdfDirectText:
        'Linearized 1 /L 165905 /H O 8 /E 165310 /N 1 /T 165621 Type /XRef /Length 80 /Filter /FlateDecode',
      pdfCleanedText: '/Type /Catalog stream endstream xref obj',
      pdfTokenText: 'ObjStm Filter DecodeParms Length 2278 First 250',
      pdfOcrText: sampleResumeText,
      ocrConfidence: 92,
    });

    const result = await extractResumeText(
      Buffer.from('fake-pdf'),
      'application/pdf',
      'resume.pdf',
    );

    expect(result.method).toBe('pdf-ocr');
    expect(result.usedOcr).toBe(true);
    expect(result.attemptedMethods).toEqual([
      'pdfjs-text',
      'pdf-parse-fallback',
      'pdf-token-fallback',
      'pdf-ocr',
    ]);
    expect(result.quality.isAcceptable).toBe(true);
  });

  it('supports forced OCR', async () => {
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
      pdfDirectText: sampleResumeText,
      pdfOcrText: sampleResumeText.replace('Skills:', 'Skills:\n-'),
      ocrConfidence: 96,
    });

    const result = await extractResumeText(
      Buffer.from('fake-pdf'),
      'application/pdf',
      'resume.pdf',
      { forceOCR: true },
    );

    expect(result.attemptedMethods).toContain('pdf-ocr');
    expect(result.usedOcr).toBe(true);
    expect(result.method).toBe('pdf-ocr');
  });

  it('continues with direct extraction when OCR runtime is unavailable but text is usable', async () => {
    __setResumeExtractionTestOverrides({
      pdfDirectText: sampleResumeText,
      extractPdfTextWithOcr: async () => {
        throw new Error("Cannot find module '@napi-rs/canvas'");
      },
    });

    const result = await extractResumeText(
      Buffer.from('fake-pdf'),
      'application/pdf',
      'resume.pdf',
      { forceOCR: true },
    );

    expect(result.method).toBe('pdfjs-text');
    expect(result.acceptedWithWarnings).toBe(true);
    expect(result.warningCode).toBe('OCR_UNAVAILABLE');
    expect(result.ocrAvailable).toBe(false);
    expect(result.ocrUnavailableReason).toMatch(/canvas runtime is missing/i);
  });

  it('returns OCR_UNAVAILABLE when OCR runtime is missing and no usable text can be extracted', async () => {
    __setResumeExtractionTestOverrides({
      pdfDirectText: 'obj stream endstream xref /Type /Catalog',
      pdfCleanedText: '/Type /Catalog obj stream',
      pdfTokenText: '/XRef /Length /Filter /Producer',
      extractPdfTextWithOcr: async () => {
        throw new Error("Cannot find module '@napi-rs/canvas'");
      },
    });

    await expect(
      extractResumeText(Buffer.from('fake-pdf'), 'application/pdf', 'resume.pdf', {
        forceOCR: true,
      }),
    ).rejects.toMatchObject({
      failureCode: 'OCR_UNAVAILABLE',
      diagnostics: expect.objectContaining({
        ocrAvailable: false,
      }),
    });
  });

  it('throws only after all extraction methods, including OCR, fail', async () => {
    __setResumeExtractionTestOverrides({
      pdfDirectText: '',
      pdfCleanedText: '',
      pdfTokenText: '',
      pdfOcrText: '',
      ocrConfidence: 6,
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

  it('keeps processing when OCR does not improve quality but text is still usable', async () => {
    __setResumeExtractionTestOverrides({
      extractPdfTextWithPdfJs: async () => borderlineResumeSignalText,
      extractPdfTextWithPdfParse: async () => borderlineResumeSignalText,
      extractPdfTextFallback: () => borderlineResumeSignalText,
      extractPdfTextWithOcr: async () => ({
        text: 'page image scan block text',
        confidence: 22,
      }),
    });

    const result = await extractResumeText(
      Buffer.from('fake-pdf'),
      'application/pdf',
      'resume.pdf',
      { forceOCR: true },
    );

    expect(result.acceptedWithWarnings).toBe(true);
    expect(result.warningCode).toBe('OCR_DID_NOT_IMPROVE');
    expect(result.ocrAttempted).toBe(true);
    expect(result.ocrImprovedQuality).toBe(false);
  });

  it('accepts borderline noisy PDF text with warnings when OCR does not improve', async () => {
    const baselineQuality = assessResumeTextQuality(borderlineNoisyPdfText);

    expect(baselineQuality.textLength).toBeGreaterThanOrEqual(700);
    expect(baselineQuality.wordCount).toBeGreaterThanOrEqual(110);
    expect(baselineQuality.resumeHintCount).toBeGreaterThanOrEqual(6);
    expect(['low', 'medium']).toContain(baselineQuality.confidenceTier);
    expect(baselineQuality.humanReadableRatio).toBeGreaterThan(0.3);
    expect(baselineQuality.junkRatio).toBeLessThanOrEqual(0.65);
    expect(baselineQuality.isAcceptable).toBe(true);

    __setResumeExtractionTestOverrides({
      pdfDirectText: borderlineNoisyPdfText,
      pdfCleanedText: borderlineNoisyPdfText,
      pdfTokenText: borderlineNoisyPdfText,
      extractPdfTextWithOcr: async () => {
        throw new Error('OCR worker exited before recognition completed');
      },
    });

    const result = await extractResumeText(
      Buffer.from('fake-pdf'),
      'application/pdf',
      'resume.pdf',
      { forceOCR: true },
    );

    expect(result.acceptedWithWarnings).toBe(true);
    expect(result.warningCode).toBe('OCR_DID_NOT_IMPROVE');
    expect(result.ocrAttempted).toBe(true);
    expect(result.ocrAvailable).toBe(true);
    expect(result.quality.isAcceptable).toBe(true);
    expect(['low', 'medium']).toContain(result.quality.confidenceTier);
    expect(result.quality.resumeHintCount).toBeGreaterThanOrEqual(6);
    expect(result.readiness).toBe('partial');
  });

  it('cleans OCR output by dehyphenating wrapped words and normalizing bullets', async () => {
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
        \u2022 Built resilient resume pipelines
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
      docxText: sampleResumeText,
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

  it('extracts plain TXT resumes directly', async () => {
    const result = await extractResumeText(
      Buffer.from(sampleResumeText, 'utf8'),
      'text/plain',
      'resume.txt',
    );

    expect(result.method).toBe('txt-direct');
    expect(result.usedOcr).toBe(false);
    expect(result.attemptedMethods).toEqual(['txt-direct']);
    expect(result.quality.isAcceptable).toBe(true);
  });

  it('extracts RTF resumes directly', async () => {
    const rtf = [
      '{\\rtf1\\ansi',
      'Jane Builder\\line',
      'Product Engineer\\line',
      'jane@example.com\\line',
      'Summary: Product engineer building startup tools\\line',
      'Skills: TypeScript, React, PostgreSQL, Supabase\\line',
      'Experience: 4 years building startup tools\\line',
      'Projects: Led roadmap for developer platform\\line',
      'Education: BSc Computer Science',
      '}',
    ].join(' ');
    const result = await extractResumeText(Buffer.from(rtf, 'utf8'), 'application/rtf', 'resume.rtf');

    expect(result.method).toBe('rtf-direct');
    expect(result.usedOcr).toBe(false);
    expect(result.attemptedMethods).toEqual(['rtf-direct']);
    expect(result.text).toContain('Jane Builder');
  });

  it('uses OCR-first extraction for image uploads', async () => {
    __setResumeExtractionTestOverrides({
      extractImageTextWithOcr: async () => ({
        text: sampleResumeText,
        confidence: 94,
      }),
    });

    const result = await extractResumeText(
      Buffer.from('fake-image'),
      'image/png',
      'resume.png',
    );

    expect(result.method).toBe('image-ocr');
    expect(result.usedOcr).toBe(true);
    expect(result.ocrAttempted).toBe(true);
    expect(result.attemptedMethods).toEqual(['image-ocr']);
  });
});

describe('resume parsing', () => {
  it('extracts structured fields from readable resume text', () => {
    const parsed = parseResumeText(sampleResumeText, {
      extractionMethod: 'pdf-ocr',
      attemptedMethods: [
        'pdfjs-text',
        'pdf-parse-fallback',
        'pdf-token-fallback',
        'pdf-ocr',
      ],
      usedOcr: true,
    });

    expect(parsed.fullName).toBe('Jane Builder');
    expect(parsed.currentTitle).toBe('Product Engineer');
    expect(parsed.email).toBe('jane@example.com');
    expect(parsed.summary).toContain('startup tools');
    expect(parsed.parsedSections.__meta?.attemptedMethods).toEqual([
      'pdfjs-text',
      'pdf-parse-fallback',
      'pdf-token-fallback',
      'pdf-ocr',
    ]);
    expect(parsed.directSkillSlugs).toEqual(
      expect.arrayContaining(['typescript', 'react', 'postgresql']),
    );
  });
});
