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

const PDF_OBJECT_NOISE_PATTERNS = [
  /\b\d+\s+\d+\s+obj\b/gi,
  /\b\d+\s+\d+\s+R\b/gi,
  /\btrailer\b/gi,
  /\bstartxref\b/gi,
  /\bobj\b/gi,
  /\bendobj\b/gi,
  /\bstream\b/gi,
  /\bendstream\b/gi,
  /\bxref\b/gi,
  /\/(?:Type|Length|Filter|DecodeParms|Root|Info|Pages|Catalog|Page|Font|Contents|MediaBox|Resources)\b/g,
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
  /\bphone\b/gi,
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
  likelyScannedPdf: boolean;
  confidenceScore: number;
  confidenceTier: 'high' | 'medium' | 'low';
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
  attemptedMethods: ResumeExtractionMethod[];
  quality: ResumeTextQuality;
}

export class ResumeExtractionError extends Error {
  constructor(
    message: string,
    public readonly quality: ResumeTextQuality | null = null,
    public readonly method: ResumeExtractionMethod | null = null,
    public readonly attemptedMethods: ResumeExtractionMethod[] = [],
  ) {
    super(message);
    this.name = 'ResumeExtractionError';
  }
}

interface ResumeExtractionTestOverrides {
  extractDocxText?: (fileBuffer: Buffer) => Promise<string>;
  extractPdfTextWithPdfJs?: (fileBuffer: Buffer) => Promise<string>;
  extractPdfTextWithPdfParse?: (fileBuffer: Buffer) => Promise<string>;
  extractPdfTextFallback?: (fileBuffer: Buffer) => string;
  extractPdfTextWithOcr?: (
    fileBuffer: Buffer,
  ) => Promise<{ text: string; confidence: number | null }>;
}

let resumeExtractionTestOverrides: ResumeExtractionTestOverrides | null = null;

export function __setResumeExtractionTestOverrides(
  overrides: ResumeExtractionTestOverrides | null,
) {
  resumeExtractionTestOverrides = overrides;
}

export function getResumeExtension(filename: string) {
  const extension = filename.toLowerCase().split('.').pop();
  return extension === 'pdf' || extension === 'docx' || extension === 'doc'
    ? extension
    : null;
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

function normalizeBulletsAndDashes(text: string) {
  return text
    .replace(/[\u2022\u2023\u25E6\u2043\u2219\u25CF\u25AA]/g, '-')
    .replace(/[\u2012\u2013\u2014\u2015]/g, '-');
}

function stripBinaryLikeFragments(text: string) {
  return text
    .replace(/[A-Fa-f0-9]{24,}/g, ' ')
    .replace(/[A-Za-z0-9+/]{32,}={0,2}/g, ' ')
    .replace(/\b(?:\d+\.){3,}\d+\b/g, ' ');
}

function stripPdfObjectNoise(text: string) {
  let cleaned = text;

  for (const pattern of PDF_OBJECT_NOISE_PATTERNS) {
    cleaned = cleaned.replace(pattern, ' ');
  }

  return cleaned;
}

function mergeWrappedLines(text: string) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const merged: string[] = [];

  for (const line of lines) {
    const previous = merged[merged.length - 1];

    if (!previous) {
      merged.push(line);
      continue;
    }

    const startsLikeContinuation =
      /^[a-z(]/.test(line) ||
      /^\d{2,4}\b/.test(line) ||
      /^[,&/)-]/.test(line);
    const previousLooksIncomplete =
      previous.length > 25 &&
      !/[.:;!?-]$/.test(previous) &&
      !/^[A-Z][A-Z\s]{2,}:?$/.test(previous) &&
      !/^[-*]/.test(previous);
    const currentLooksSectionHeader = /^[A-Z][A-Za-z/&\s]{2,}:$/.test(line);
    const currentLooksBullet = /^[-*]/.test(line);

    if (
      previousLooksIncomplete &&
      startsLikeContinuation &&
      !currentLooksSectionHeader &&
      !currentLooksBullet
    ) {
      merged[merged.length - 1] = `${previous} ${line}`.replace(/\s+/g, ' ').trim();
      continue;
    }

    merged.push(line);
  }

  return merged.join('\n');
}

function normalizeExtractedText(text: string, source: 'pdf' | 'docx' = 'pdf') {
  let normalized = text;

  normalized = normalizeBulletsAndDashes(normalized)
    .replace(/\u0000/g, ' ')
    .replace(/[\u0001-\u0008\u000B-\u001A\u007F]/g, ' ')
    .replace(/\r/g, '\n');

  if (source === 'pdf') {
    normalized = stripPdfObjectNoise(normalized);
  }

  normalized = stripBinaryLikeFragments(normalized)
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[^\S\n]+$/gm, '')
    .trim();

  normalized = mergeWrappedLines(normalized)
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return normalized;
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
    normalized.match(
      /\/[A-Za-z][A-Za-z0-9]+|[A-Fa-f0-9]{16,}|(?:\d+\s+0\s+R)|(?:\d+\.\d+)|(?:[A-Za-z0-9+/]{24,}={0,2})/g,
    ) ?? [];
  const pdfInternalHitCount = countPatternMatches(normalized, PDF_INTERNAL_PATTERNS);
  const resumeHintCount = countPatternMatches(normalized, RESUME_HINT_PATTERNS);
  const humanReadableRatio = tokens.length > 0 ? alphaWords.length / tokens.length : 0;
  const likelyScannedPdf =
    alphaWords.length < 20 || (humanReadableRatio < 0.35 && resumeHintCount <= 2);
  const confidenceScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        humanReadableRatio * 45 +
          Math.min(alphaWords.length, 220) * 0.2 +
          resumeHintCount * 4 -
          suspiciousTokens.length * 1.5 -
          pdfInternalHitCount * 2,
      ),
    ),
  );
  const confidenceTier =
    confidenceScore >= 75 ? 'high' : confidenceScore >= 45 ? 'medium' : 'low';

  let reason: string | null = null;

  if (!normalized) {
    reason = 'No readable text could be extracted from this file.';
  } else if (pdfInternalHitCount >= 8 && resumeHintCount <= 2) {
    reason =
      'Extracted text looks like raw PDF internals instead of readable resume content.';
  } else if (alphaWords.length < 20) {
    reason = 'Extracted text is too short to build a reliable resume profile.';
  } else if (humanReadableRatio < 0.45) {
    reason = 'Extracted text is not human-readable enough to trust for resume parsing.';
  } else if (
    suspiciousTokens.length > Math.max(12, Math.floor(tokens.length * 0.12)) &&
    resumeHintCount <= 3
  ) {
    reason = 'Extracted text is dominated by binary-like or document-object tokens.';
  } else if (likelyScannedPdf && confidenceTier === 'low') {
    reason = 'This PDF looks image-based or too low-quality for reliable text extraction.';
  }

  return {
    isAcceptable: reason === null,
    reason,
    likelyScannedPdf,
    confidenceScore,
    confidenceTier,
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
  return normalizeExtractedText(parsed.value ?? '', 'docx');
}

async function extractPdfTextWithPdfJs(fileBuffer: Buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await pdfjs
    .getDocument({
      data: new Uint8Array(fileBuffer),
      useSystemFonts: true,
      disableFontFace: true,
    })
    .promise;

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

  return normalizeExtractedText(extracted, 'pdf');
}

async function extractPdfTextWithPdfParse(fileBuffer: Buffer) {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: fileBuffer });

  try {
    const parsed = await parser.getText();
    return normalizeExtractedText(parsed.text ?? '', 'pdf');
  } finally {
    await parser.destroy();
  }
}

async function extractPdfTextWithOcr(fileBuffer: Buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { createCanvas } = eval('require')('@napi-rs/canvas') as typeof import('@napi-rs/canvas');
  const { createWorker } = eval('require')('tesseract.js') as typeof import('tesseract.js');
  const document = await pdfjs
    .getDocument({
      data: new Uint8Array(fileBuffer),
      useSystemFonts: true,
      disableFontFace: true,
    })
    .promise;

  const worker = await createWorker('eng');
  const pageTexts: string[] = [];
  const confidences: number[] = [];

  try {
    const maxPages = Math.min(document.numPages, OCR_PAGE_LIMIT);

    for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = createCanvas(
        Math.ceil(viewport.width),
        Math.ceil(viewport.height),
      );
      const context = canvas.getContext('2d');

      await page.render({
        canvas: canvas as never,
        canvasContext: context as never,
        viewport,
      }).promise;

      const image = canvas.toBuffer('image/png');
      const result = await worker.recognize(image);
      const pageText = normalizeExtractedText(result.data.text ?? '', 'pdf');

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
    text: normalizeExtractedText(pageTexts.join('\n\n'), 'pdf'),
    confidence: averageConfidence,
  };
}

function createExtractionCandidate(args: {
  text: string;
  method: ResumeExtractionMethod;
  attemptedMethods: ResumeExtractionMethod[];
  usedOcr?: boolean;
  ocrConfidence?: number | null;
  source?: 'pdf' | 'docx';
}) {
  const cleanedText = normalizeExtractedText(args.text, args.source ?? 'pdf');
  const quality = assessResumeTextQuality(cleanedText);

  return {
    text: cleanedText,
    method: args.method,
    usedOcr: args.usedOcr ?? false,
    ocrConfidence: args.ocrConfidence ?? null,
    attemptedMethods: [...args.attemptedMethods],
    quality,
  } satisfies ResumeExtractionResult;
}

function chooseBetterCandidate(
  current: ResumeExtractionResult | null,
  next: ResumeExtractionResult,
) {
  if (!current) {
    return next;
  }

  if (next.quality.isAcceptable && !current.quality.isAcceptable) {
    return next;
  }

  if (!next.quality.isAcceptable && current.quality.isAcceptable) {
    return current;
  }

  if (next.quality.confidenceScore !== current.quality.confidenceScore) {
    return next.quality.confidenceScore > current.quality.confidenceScore
      ? next
      : current;
  }

  if (current.usedOcr !== next.usedOcr) {
    return next.usedOcr ? next : current;
  }

  return next.text.length > current.text.length ? next : current;
}

function shouldAttemptOcr(bestCandidate: ResumeExtractionResult | null) {
  if (!bestCandidate) {
    return true;
  }

  return (
    !bestCandidate.quality.isAcceptable ||
    bestCandidate.quality.likelyScannedPdf ||
    bestCandidate.quality.confidenceTier === 'low'
  );
}

export async function extractResumeText(
  fileBuffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<ResumeExtractionResult> {
  const attemptedMethods: ResumeExtractionMethod[] = [];
  const overrides = resumeExtractionTestOverrides;

  if (mimeType !== 'application/pdf' && !filename.toLowerCase().endsWith('.pdf')) {
    attemptedMethods.push('docx-mammoth');
    const docxText = await (overrides?.extractDocxText ?? extractDocxText)(fileBuffer);
    const candidate = createExtractionCandidate({
      text: docxText,
      method: 'docx-mammoth',
      attemptedMethods,
      source: 'docx',
    });

    if (candidate.quality.isAcceptable) {
      return candidate;
    }

    throw new ResumeExtractionError(
      'This resume could not be read reliably. Try a clearer PDF or DOCX.',
      candidate.quality,
      candidate.method,
      attemptedMethods,
    );
  }

  const attempts: Array<{
    method: ResumeExtractionMethod;
    run: () => Promise<{ text: string; ocrConfidence?: number | null }>;
  }> = [
    {
      method: 'pdfjs-text',
      run: async () => ({
        text: await (overrides?.extractPdfTextWithPdfJs ?? extractPdfTextWithPdfJs)(
          fileBuffer,
        ),
      }),
    },
    {
      method: 'pdf-parse-fallback',
      run: async () => ({
        text: await (
          overrides?.extractPdfTextWithPdfParse ?? extractPdfTextWithPdfParse
        )(fileBuffer),
      }),
    },
    {
      method: 'pdf-token-fallback',
      run: async () => ({
        text: (overrides?.extractPdfTextFallback ?? extractPdfTextFallback)(fileBuffer),
      }),
    },
  ];

  let bestCandidate: ResumeExtractionResult | null = null;

  for (const attempt of attempts) {
    attemptedMethods.push(attempt.method);

    try {
      const result = await attempt.run();
      const candidate = createExtractionCandidate({
        text: result.text,
        method: attempt.method,
        attemptedMethods,
        source: 'pdf',
      });
      bestCandidate = chooseBetterCandidate(bestCandidate, candidate);

      if (candidate.quality.isAcceptable && candidate.quality.confidenceTier !== 'low') {
        return candidate;
      }
    } catch {
    }
  }

  if (shouldAttemptOcr(bestCandidate)) {
    attemptedMethods.push('pdf-ocr');

    try {
      const ocr = await (overrides?.extractPdfTextWithOcr ?? extractPdfTextWithOcr)(
        fileBuffer,
      );
      const candidate = createExtractionCandidate({
        text: ocr.text,
        method: 'pdf-ocr',
        attemptedMethods,
        usedOcr: true,
        ocrConfidence: ocr.confidence ?? null,
        source: 'pdf',
      });
      bestCandidate = chooseBetterCandidate(bestCandidate, candidate);
    } catch {
    }
  }

  if (bestCandidate?.quality.isAcceptable) {
    return bestCandidate;
  }

  throw new ResumeExtractionError(
    'This resume could not be read reliably. Try a clearer PDF or DOCX.',
    bestCandidate?.quality ?? null,
    bestCandidate?.method ?? null,
    attemptedMethods,
  );
}
