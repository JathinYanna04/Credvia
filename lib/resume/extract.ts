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
  /\+?\d[\d\s()+-]{7,}/g,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
];

const OCR_PAGE_LIMIT = 3;
const MIN_ACCEPTABLE_CONFIDENCE_SCORE = 45;

export const RESUME_UPLOAD_LIMIT_BYTES = 10 * 1024 * 1024;

export type ResumeExtractionMethod =
  | 'docx-direct'
  | 'pdf-direct'
  | 'pdf-cleaned'
  | 'pdf-token-fallback'
  | 'pdf-ocr';

export interface ResumeTextQuality {
  isAcceptable: boolean;
  reason: string | null;
  confidenceScore: number;
  confidenceTier: 'high' | 'medium' | 'low';
  likelyScannedPdf: boolean;
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
  attemptedMethods: ResumeExtractionMethod[];
  ocrConfidence: number | null;
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

interface ExtractionCandidate {
  text: string;
  method: ResumeExtractionMethod;
  usedOcr: boolean;
  ocrConfidence: number | null;
  quality: ResumeTextQuality;
}

export interface ResumeExtractionTestOverrides {
  docxText?: string;
  pdfDirectText?: string;
  pdfCleanedText?: string;
  pdfTokenText?: string;
  pdfOcrText?: string;
  ocrConfidence?: number | null;
}

export interface ExtractResumeTextOptions {
  forceOcr?: boolean;
}

let resumeExtractionTestOverrides: ResumeExtractionTestOverrides | null = null;

export function __setResumeExtractionTestOverrides(overrides: ResumeExtractionTestOverrides | null) {
  resumeExtractionTestOverrides = overrides;
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

function countPatternMatches(text: string, patterns: RegExp[]) {
  let total = 0;

  for (const pattern of patterns) {
    const matches = text.match(pattern);
    total += matches?.length ?? 0;
  }

  return total;
}

function normalizeBulletsAndDashes(text: string) {
  return text
    .replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, '-')
    .replace(/[\u2012\u2013\u2014\u2015]/g, '-');
}

function stripBinaryLikeFragments(text: string) {
  return text
    .replace(/\u0000/g, ' ')
    .replace(/[\u0001-\u0008\u000B-\u001A\u007F]/g, ' ')
    .replace(/[A-Za-z0-9+/]{80,}={0,2}/g, ' ')
    .replace(/[A-Fa-f0-9]{48,}/g, ' ');
}

function stripPdfObjectNoise(text: string) {
  let cleaned = text;

  cleaned = cleaned.replace(/\b\d+\s+\d+\s+obj\b[\s\S]*?\bendobj\b/gi, ' ');
  cleaned = cleaned.replace(/\bstream\b[\s\S]*?\bendstream\b/gi, ' ');
  cleaned = cleaned.replace(/<<[\s\S]*?>>/g, ' ');

  for (const pattern of PDF_INTERNAL_PATTERNS) {
    cleaned = cleaned.replace(pattern, ' ');
  }

  return cleaned;
}

function mergeWrappedLines(text: string) {
  return text.replace(/([a-z0-9,])\n(?=[a-z0-9])/g, '$1 ');
}

function dehyphenateWrappedWords(text: string) {
  return text.replace(/([A-Za-z])-\n\s*(?=[A-Za-z])/g, '$1');
}

function normalizeExtractedText(text: string, source: 'docx' | 'pdf' = 'pdf') {
  let normalized = text;
  normalized = normalizeBulletsAndDashes(normalized);
  normalized = stripBinaryLikeFragments(normalized);

  if (source === 'pdf') {
    normalized = stripPdfObjectNoise(normalized);
  }

  normalized = normalized
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/[^\S\n]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n');

  normalized = dehyphenateWrappedWords(normalized);
  normalized = mergeWrappedLines(normalized);

  return normalized.trim();
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
    alphaWords.length < 20 ||
    (humanReadableRatio < 0.35 && resumeHintCount <= 2);

  const confidenceScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        humanReadableRatio * 45 +
          Math.min(alphaWords.length, 200) * 0.2 +
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
    reason = 'Extracted text looks like raw PDF internals instead of readable resume content.';
  } else if (alphaWords.length < 20) {
    reason = 'Extracted text is too short to build a reliable resume profile.';
  } else if (humanReadableRatio < 0.45) {
    reason = 'Extracted text is not human-readable enough to trust for resume parsing.';
  } else if (
    suspiciousTokens.length > Math.max(12, Math.floor(tokens.length * 0.12)) &&
    resumeHintCount <= 3
  ) {
    reason = 'Extracted text is dominated by binary-like or document-object tokens.';
  } else if (confidenceScore < MIN_ACCEPTABLE_CONFIDENCE_SCORE) {
    reason = 'Extracted text quality is too low to trust for resume parsing.';
  }

  return {
    isAcceptable: reason === null,
    reason,
    confidenceScore,
    confidenceTier,
    likelyScannedPdf,
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
    return textMatches.join(' ');
  }

  const printable = raw.match(/[A-Za-z0-9][A-Za-z0-9 ,.+:/()_\-\n]{20,}/g) ?? [];
  return printable.join(' ');
}

async function extractDocxText(fileBuffer: Buffer) {
  const mammoth = await import('mammoth');
  const parsed = await mammoth.extractRawText({ buffer: fileBuffer });
  return parsed.value ?? '';
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

          return `${item.str}${item.hasEOL ? '\n' : ' '}`;
        })
        .join('');

      if (pageText.trim()) {
        extracted += `${pageText}\n`;
      }
    }
  } finally {
    await document.destroy();
  }

  return extracted;
}

async function extractPdfTextWithPdfParse(fileBuffer: Buffer) {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: fileBuffer });

  try {
    const parsed = await parser.getText();
    return parsed.text ?? '';
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
    text: pageTexts.join('\n\n'),
    confidence: averageConfidence,
  };
}

function createExtractionCandidate(
  text: string,
  method: ResumeExtractionMethod,
  attemptedMethods: ResumeExtractionMethod[],
  usedOcr = false,
  ocrConfidence: number | null = null,
  source: 'docx' | 'pdf' = 'pdf',
) {
  const normalized = normalizeExtractedText(text, source);
  const quality = assessResumeTextQuality(normalized);

  return {
    candidate: {
      text: normalized,
      method,
      usedOcr,
      ocrConfidence,
      quality,
    } satisfies ExtractionCandidate,
    attemptedMethods,
  };
}

function chooseBetterCandidate(
  current: ExtractionCandidate | null,
  next: ExtractionCandidate,
) {
  if (!current) {
    return next;
  }

  if (next.quality.confidenceScore !== current.quality.confidenceScore) {
    return next.quality.confidenceScore > current.quality.confidenceScore ? next : current;
  }

  if (next.quality.resumeHintCount !== current.quality.resumeHintCount) {
    return next.quality.resumeHintCount > current.quality.resumeHintCount ? next : current;
  }

  if (next.text.length !== current.text.length) {
    return next.text.length > current.text.length ? next : current;
  }

  return current;
}

function shouldAttemptOcr(bestCandidate: ExtractionCandidate | null) {
  if (!bestCandidate) {
    return true;
  }

  return (
    !bestCandidate.quality.isAcceptable &&
    (bestCandidate.quality.likelyScannedPdf ||
      bestCandidate.quality.confidenceTier === 'low' ||
      bestCandidate.quality.resumeHintCount <= 2)
  );
}

function toExtractionResult(
  candidate: ExtractionCandidate,
  attemptedMethods: ResumeExtractionMethod[],
): ResumeExtractionResult {
  return {
    text: candidate.text,
    method: candidate.method,
    usedOcr: candidate.usedOcr,
    attemptedMethods,
    ocrConfidence: candidate.ocrConfidence,
    quality: candidate.quality,
  };
}

export async function extractResumeText(
  fileBuffer: Buffer,
  mimeType: string,
  filename: string,
  options: ExtractResumeTextOptions = {},
): Promise<ResumeExtractionResult> {
  const attemptedMethods: ResumeExtractionMethod[] = [];

  if (mimeType !== 'application/pdf' && !filename.toLowerCase().endsWith('.pdf')) {
    const docxText =
      resumeExtractionTestOverrides?.docxText ??
      (await extractDocxText(fileBuffer));
    attemptedMethods.push('docx-direct');
    const { candidate } = createExtractionCandidate(
      docxText,
      'docx-direct',
      attemptedMethods,
      false,
      null,
      'docx',
    );

    if (candidate.quality.isAcceptable) {
      return toExtractionResult(candidate, [...attemptedMethods]);
    }

    throw new ResumeExtractionError(
      'This resume could not be read reliably. Try a clearer PDF or DOCX.',
      candidate.quality,
      candidate.method,
      [...attemptedMethods],
    );
  }

  let bestCandidate: ExtractionCandidate | null = null;

  const directText =
    resumeExtractionTestOverrides?.pdfDirectText ??
    (await extractPdfTextWithPdfJs(fileBuffer));
  attemptedMethods.push('pdf-direct');
  const directCandidate = createExtractionCandidate(
    directText,
    'pdf-direct',
    attemptedMethods,
  ).candidate;
  bestCandidate = chooseBetterCandidate(bestCandidate, directCandidate);

  if (!options.forceOcr && directCandidate.quality.isAcceptable) {
    return toExtractionResult(directCandidate, [...attemptedMethods]);
  }

  if (!(options.forceOcr && directCandidate.quality.isAcceptable)) {
    const cleanedText =
      resumeExtractionTestOverrides?.pdfCleanedText ??
      (await extractPdfTextWithPdfParse(fileBuffer));
    attemptedMethods.push('pdf-cleaned');
    const cleanedCandidate = createExtractionCandidate(
      cleanedText,
      'pdf-cleaned',
      attemptedMethods,
    ).candidate;
    bestCandidate = chooseBetterCandidate(bestCandidate, cleanedCandidate);

    if (!options.forceOcr && cleanedCandidate.quality.isAcceptable) {
      return toExtractionResult(cleanedCandidate, [...attemptedMethods]);
    }

    const tokenText =
      resumeExtractionTestOverrides?.pdfTokenText ??
      extractPdfTextFallback(fileBuffer);
    attemptedMethods.push('pdf-token-fallback');
    const tokenCandidate = createExtractionCandidate(
      tokenText,
      'pdf-token-fallback',
      attemptedMethods,
    ).candidate;
    bestCandidate = chooseBetterCandidate(bestCandidate, tokenCandidate);

    if (!options.forceOcr && tokenCandidate.quality.isAcceptable) {
      return toExtractionResult(tokenCandidate, [...attemptedMethods]);
    }
  }

  if (options.forceOcr || shouldAttemptOcr(bestCandidate)) {
    const ocrResult =
      resumeExtractionTestOverrides?.pdfOcrText !== undefined
        ? {
            text: resumeExtractionTestOverrides.pdfOcrText,
            confidence: resumeExtractionTestOverrides.ocrConfidence ?? null,
          }
        : await extractPdfTextWithOcr(fileBuffer);

    attemptedMethods.push('pdf-ocr');
    const ocrCandidate = createExtractionCandidate(
      ocrResult.text,
      'pdf-ocr',
      attemptedMethods,
      true,
      ocrResult.confidence ?? null,
    ).candidate;
    bestCandidate = chooseBetterCandidate(bestCandidate, ocrCandidate);

    if (options.forceOcr && ocrCandidate.quality.isAcceptable) {
      return toExtractionResult(ocrCandidate, [...attemptedMethods]);
    }

    if (ocrCandidate.quality.isAcceptable) {
      return toExtractionResult(ocrCandidate, [...attemptedMethods]);
    }
  }

  throw new ResumeExtractionError(
    'This resume could not be read reliably. Try a clearer PDF or DOCX.',
    bestCandidate?.quality ?? null,
    bestCandidate?.method ?? null,
    [...attemptedMethods],
  );
}
