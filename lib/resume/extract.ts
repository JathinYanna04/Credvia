const DOCX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]);

const PDF_INTERNAL_PATTERNS = [
  /\bxref\b/gi,
  /\bflatedecode\b/gi,
  /\bobjstm\b/gi,
  /\blength\d*\b/gi,
  /\bfilter\b/gi,
  /\bdecodeparms\b/gi,
  /\bpdftex\b/gi,
  /\/[A-Za-z][A-Za-z0-9]+/g,
  /\bendobj\b/gi,
  /\bstream\b/gi,
  /\bendstream\b/gi,
];

const RESUME_HINT_PATTERNS = [
  /\bexperience\b/gi,
  /\beducation\b/gi,
  /\bskills?\b/gi,
  /\bprojects?\b/gi,
  /\bsummary\b/gi,
  /\bprofile\b/gi,
  /\blinkedin\b/gi,
  /\bgithub\b/gi,
  /\bremote\b/gi,
  /\bengineer\b/gi,
  /\bdeveloper\b/gi,
  /\bmanager\b/gi,
  /\bportfolio\b/gi,
  /\bemail\b/gi,
];

const OCR_PAGE_LIMIT = 3;

export const RESUME_UPLOAD_LIMIT_BYTES = 10 * 1024 * 1024;

export type ResumeExtractionMethod =
  | 'docx-mammoth'
  | 'pdfjs-text'
  | 'pdf-parse-fallback'
  | 'pdf-token-fallback'
  | 'pdf-ocr';

export interface ResumeTextQuality {
  isAcceptable: boolean;
  reason: string | null;
  humanReadableRatio: number;
  alphaWordCount: number;
  totalWordCount: number;
  suspiciousTokenCount: number;
  pdfInternalHitCount: number;
  resumeHintCount: number;
}

export interface ResumeExtractionResult {
  text: string;
  method: ResumeExtractionMethod;
  usedOcr: boolean;
  ocrConfidence: number | null;
  quality: ResumeTextQuality;
}

export class ResumeExtractionError extends Error {
  constructor(
    message: string,
    public readonly quality: ResumeTextQuality | null = null,
    public readonly method: ResumeExtractionMethod | null = null,
  ) {
    super(message);
    this.name = 'ResumeExtractionError';
  }
}

export function getResumeExtension(filename: string) {
  const extension = filename.toLowerCase().split('.').pop();
  return extension === 'pdf' || extension === 'docx' || extension === 'doc' ? extension : null;
}

export function isSupportedResumeMimeType(mimeType: string, filename: string) {
  const extension = getResumeExtension(filename);
  return (
    mimeType === 'application/pdf' ||
    DOCX_MIME_TYPES.has(mimeType) ||
    extension === 'pdf' ||
    extension === 'docx'
  );
}

function normalizeExtractedText(text: string) {
  return text
    .replace(/\u0000/g, ' ')
    .replace(/[\u0001-\u0008\u000B-\u001A\u007F]/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[^\S\n]+$/gm, '')
    .trim();
}

function countPatternMatches(text: string, patterns: RegExp[]) {
  let total = 0;

  for (const pattern of patterns) {
    const matches = text.match(pattern);
    total += matches?.length ?? 0;
  }

  return total;
}

export function assessResumeTextQuality(text: string): ResumeTextQuality {
  const normalized = normalizeExtractedText(text);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const alphaWords = normalized.match(/\b[A-Za-z]{2,}\b/g) ?? [];
  const suspiciousTokens =
    normalized.match(/\/[A-Za-z][A-Za-z0-9]+|[A-Fa-f0-9]{16,}|(?:\d+\s+0\s+R)|(?:\d+\.\d+)|(?:[A-Za-z0-9+/]{24,}={0,2})/g) ??
    [];
  const pdfInternalHitCount = countPatternMatches(normalized, PDF_INTERNAL_PATTERNS);
  const resumeHintCount = countPatternMatches(normalized, RESUME_HINT_PATTERNS);
  const humanReadableRatio = tokens.length > 0 ? alphaWords.length / tokens.length : 0;

  let reason: string | null = null;

  if (!normalized) {
    reason = 'No readable text could be extracted from this file.';
  } else if (pdfInternalHitCount >= 8 && resumeHintCount <= 2) {
    reason = 'Extracted text looks like raw PDF internals instead of readable resume content.';
  } else if (alphaWords.length < 20) {
    reason = 'Extracted text is too short to build a reliable resume profile.';
  } else if (humanReadableRatio < 0.45) {
    reason = 'Extracted text is not human-readable enough to trust for resume parsing.';
  } else if (suspiciousTokens.length > Math.max(12, Math.floor(tokens.length * 0.12)) && resumeHintCount <= 3) {
    reason = 'Extracted text is dominated by binary-like or document-object tokens.';
  }

  return {
    isAcceptable: reason === null,
    reason,
    humanReadableRatio,
    alphaWordCount: alphaWords.length,
    totalWordCount: tokens.length,
    suspiciousTokenCount: suspiciousTokens.length,
    pdfInternalHitCount,
    resumeHintCount,
  };
}

function extractPdfTextFallback(fileBuffer: Buffer) {
  const raw = fileBuffer.toString('latin1');
  const textMatches = [...raw.matchAll(/\(([^()]*)\)\s*Tj/g)].map((match) =>
    (match[1] ?? '')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\n/g, ' ')
      .replace(/\\r/g, ' ')
      .replace(/\\t/g, ' '),
  );

  if (textMatches.length > 0) {
    return textMatches.join(' ').replace(/\s+/g, ' ').trim();
  }

  const printable = raw.match(/[A-Za-z0-9][A-Za-z0-9 ,.+:/()_\-]{20,}/g) ?? [];
  return printable.join(' ').replace(/\s+/g, ' ').trim();
}

async function extractDocxText(fileBuffer: Buffer) {
  const mammoth = await import('mammoth');
  const parsed = await mammoth.extractRawText({ buffer: fileBuffer });
  return normalizeExtractedText(parsed.value ?? '');
}

async function extractPdfTextWithPdfJs(fileBuffer: Buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await pdfjs.getDocument({
    data: new Uint8Array(fileBuffer),
    useSystemFonts: true,
    disableFontFace: true,
  }).promise;

  let extracted = '';

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => {
          if (!('str' in item)) {
            return '';
          }

          const suffix = item.hasEOL ? '\n' : ' ';
          return `${item.str}${suffix}`;
        })
        .join('')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      if (pageText) {
        extracted += `${pageText}\n`;
      }
    }
  } finally {
    await document.destroy();
  }

  return normalizeExtractedText(extracted);
}

async function extractPdfTextWithPdfParse(fileBuffer: Buffer) {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: fileBuffer });

  try {
    const parsed = await parser.getText();
    return normalizeExtractedText(parsed.text ?? '');
  } finally {
    await parser.destroy();
  }
}

async function extractPdfTextWithOcr(fileBuffer: Buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { createCanvas } = eval('require')('@napi-rs/canvas') as typeof import('@napi-rs/canvas');
  const { createWorker } = eval('require')('tesseract.js') as typeof import('tesseract.js');
  const document = await pdfjs.getDocument({
    data: new Uint8Array(fileBuffer),
    useSystemFonts: true,
    disableFontFace: true,
  }).promise;

  const worker = await createWorker('eng');
  const pageTexts: string[] = [];
  const confidences: number[] = [];

  try {
    const maxPages = Math.min(document.numPages, OCR_PAGE_LIMIT);

    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext('2d');

      await page.render({
        canvas: canvas as never,
        canvasContext: context as never,
        viewport,
      }).promise;

      const image = canvas.toBuffer('image/png');
      const result = await worker.recognize(image);
      const pageText = normalizeExtractedText(result.data.text ?? '');

      if (pageText) {
        pageTexts.push(pageText);
      }

      if (typeof result.data.confidence === 'number') {
        confidences.push(result.data.confidence);
      }
    }
  } finally {
    await worker.terminate();
    await document.destroy();
  }

  const averageConfidence =
    confidences.length > 0
      ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
      : null;

  return {
    text: normalizeExtractedText(pageTexts.join('\n\n')),
    confidence: averageConfidence,
  };
}

function ensureAcceptedExtraction(
  text: string,
  method: ResumeExtractionMethod,
  usedOcr = false,
  ocrConfidence: number | null = null,
) {
  const normalized = normalizeExtractedText(text);
  const quality = assessResumeTextQuality(normalized);

  if (!quality.isAcceptable) {
    throw new ResumeExtractionError(quality.reason ?? 'Resume extraction quality was too low.', quality, method);
  }

  return {
    text: normalized,
    method,
    usedOcr,
    ocrConfidence,
    quality,
  } satisfies ResumeExtractionResult;
}

export async function extractResumeText(
  fileBuffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<ResumeExtractionResult> {
  if (mimeType !== 'application/pdf' && !filename.toLowerCase().endsWith('.pdf')) {
    const docxText = await extractDocxText(fileBuffer);
    return ensureAcceptedExtraction(docxText, 'docx-mammoth');
  }

  const attempts: Array<{
    method: ResumeExtractionMethod;
    run: () => Promise<{ text: string; ocrConfidence?: number | null }>;
  }> = [
    {
      method: 'pdfjs-text',
      run: async () => ({ text: await extractPdfTextWithPdfJs(fileBuffer) }),
    },
    {
      method: 'pdf-parse-fallback',
      run: async () => ({ text: await extractPdfTextWithPdfParse(fileBuffer) }),
    },
    {
      method: 'pdf-token-fallback',
      run: async () => ({ text: extractPdfTextFallback(fileBuffer) }),
    },
  ];

  let lastQualityFailure: ResumeExtractionError | null = null;

  for (const attempt of attempts) {
    try {
      const result = await attempt.run();
      return ensureAcceptedExtraction(result.text, attempt.method);
    } catch (error) {
      if (error instanceof ResumeExtractionError) {
        lastQualityFailure = error;
        continue;
      }
    }
  }

  try {
    const ocr = await extractPdfTextWithOcr(fileBuffer);
    return ensureAcceptedExtraction(ocr.text, 'pdf-ocr', true, ocr.confidence ?? null);
  } catch (error) {
    if (error instanceof ResumeExtractionError) {
      throw new ResumeExtractionError(
        `${error.message} PDF parsing can be brittle for scanned or badly structured files. Try uploading a DOCX resume for the best results.`,
        error.quality,
        error.method,
      );
    }

    throw new ResumeExtractionError(
      `${lastQualityFailure?.message ?? 'Could not extract readable text from this PDF.'} PDF parsing can be brittle for scanned or badly structured files. Try uploading a DOCX resume for the best results.`,
      lastQualityFailure?.quality ?? null,
      lastQualityFailure?.method ?? null,
    );
  }
}
