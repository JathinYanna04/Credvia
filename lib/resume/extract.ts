import { createRequire } from 'node:module';
import type { ResumeExtractionErrorDetails } from '@/lib/types';

const DOCX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const LEGACY_DOC_MIME_TYPES = new Set(['application/msword']);

const TEXT_MIME_TYPES = new Set(['text/plain']);

const RTF_MIME_TYPES = new Set(['text/rtf', 'application/rtf', 'application/x-rtf']);

const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg']);

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
  /\+?\d[\d\s()+-]{7,}/g,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
];

const SECTION_PATTERNS = [
  /(^|\n)\s*(education|academics?)\s*:?(\n|$)/gi,
  /(^|\n)\s*(skills?|technical skills?)\s*:?(\n|$)/gi,
  /(^|\n)\s*(experience|work experience|professional experience)\s*:?(\n|$)/gi,
  /(^|\n)\s*(projects?|project experience)\s*:?(\n|$)/gi,
];

const OCR_PAGE_LIMIT = 3;
const MIN_ACCEPTABLE_CONFIDENCE_SCORE = 42;
const MIN_RECOVERABLE_CONFIDENCE_SCORE = 34;

const OCR_UNAVAILABLE_PATTERNS: RegExp[] = [
  /cannot find module ['"]@napi-rs\/canvas['"]/i,
  /cannot find module ['"]tesseract\.js['"]/i,
  /canvas.*not (available|supported|implemented)/i,
  /dommatrix is not defined/i,
  /path2d is not defined/i,
  /offscreencanvas is not defined/i,
  /module did not self-register/i,
  /was compiled against a different node\.js version/i,
  /napi/i,
  /failed to load.*canvas/i,
];

export const RESUME_UPLOAD_LIMIT_BYTES = 10 * 1024 * 1024;

export type ResumeExtractionMethod =
  | 'docx-mammoth'
  | 'txt-direct'
  | 'rtf-direct'
  | 'image-ocr'
  | 'pdfjs-text'
  | 'pdf-parse-fallback'
  | 'pdf-token-fallback'
  | 'pdf-ocr';

export interface ResumeTextQuality {
  isAcceptable: boolean;
  reason: string | null;
  textLength: number;
  wordCount: number;
  likelyScannedPdf: boolean;
  confidenceScore: number;
  confidenceTier: 'high' | 'medium' | 'low';
  detectedSectionCount: number;
  junkRatio: number;
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
  ocrAttempted: boolean;
  ocrImprovedQuality: boolean | null;
  ocrConfidence: number | null;
  ocrAvailable: boolean;
  ocrUnavailableReason: string | null;
  acceptedWithWarnings: boolean;
  warningCode: ResumeExtractionWarningCode | null;
  warningMessage: string | null;
  attemptedMethods: ResumeExtractionMethod[];
  textLength: number;
  readiness: 'good' | 'partial' | 'poor' | 'failed';
  quality: ResumeTextQuality;
}

export type ResumeExtractionFailureCode =
  | 'EXTRACTION_FAILED'
  | 'IMAGE_BASED_PDF'
  | 'LOW_TEXT_CONFIDENCE'
  | 'OCR_UNAVAILABLE'
  | 'OCR_FAILED'
  | 'EMPTY_EXTRACTED_TEXT';

export type ResumeExtractionWarningCode =
  | 'LOW_TEXT_CONFIDENCE'
  | 'OCR_UNAVAILABLE'
  | 'OCR_DID_NOT_IMPROVE';

type ResumeExtractionDiagnostics = Omit<ResumeExtractionErrorDetails, 'attemptedMethods' | 'method'> & {
  attemptedMethods: ResumeExtractionMethod[];
  method: ResumeExtractionMethod | null;
};

export class ResumeExtractionError extends Error {
  constructor(
    message: string,
    public readonly quality: ResumeTextQuality | null = null,
    public readonly method: ResumeExtractionMethod | null = null,
    public readonly attemptedMethods: ResumeExtractionMethod[] = [],
    public readonly failureCode: ResumeExtractionFailureCode = 'EXTRACTION_FAILED',
    public readonly diagnostics: ResumeExtractionDiagnostics | null = null,
  ) {
    super(message);
    this.name = 'ResumeExtractionError';
  }
}

export interface ResumeExtractionTestOverrides {
  docxText?: string;
  pdfDirectText?: string;
  pdfCleanedText?: string;
  pdfTokenText?: string;
  pdfOcrText?: string;
  ocrConfidence?: number | null;
  extractDocxText?: (fileBuffer: Buffer) => Promise<string>;
  extractPdfTextWithPdfJs?: (fileBuffer: Buffer) => Promise<string>;
  extractPdfTextWithPdfParse?: (fileBuffer: Buffer) => Promise<string>;
  extractPdfTextFallback?: (fileBuffer: Buffer) => string;
  extractPdfTextWithOcr?: (
    fileBuffer: Buffer,
  ) => Promise<{ text: string; confidence: number | null }>;
  extractImageTextWithOcr?: (
    fileBuffer: Buffer,
  ) => Promise<{ text: string; confidence: number | null }>;
}

let resumeExtractionTestOverrides: ResumeExtractionTestOverrides | null = null;
const nodeRequire = createRequire(import.meta.url);

type CanvasRuntimeModule = typeof import('@napi-rs/canvas');
type TesseractRuntimeModule = typeof import('tesseract.js');

export function __setResumeExtractionTestOverrides(
  overrides: ResumeExtractionTestOverrides | null,
) {
  resumeExtractionTestOverrides = overrides;
}

export interface ExtractResumeTextOptions {
  forceOcr?: boolean;
  forceOCR?: boolean;
}

export function getResumeExtension(filename: string) {
  const extension = filename.toLowerCase().split('.').pop();
  return extension === 'pdf' ||
    extension === 'docx' ||
    extension === 'doc' ||
    extension === 'txt' ||
    extension === 'rtf' ||
    extension === 'png' ||
    extension === 'jpg' ||
    extension === 'jpeg'
    ? extension
    : null;
}

export function isLegacyDocMimeType(mimeType: string, filename: string) {
  const extension = getResumeExtension(filename);
  return LEGACY_DOC_MIME_TYPES.has(mimeType) || extension === 'doc';
}

export function isSupportedResumeMimeType(mimeType: string, filename: string) {
  const extension = getResumeExtension(filename);

  if (isLegacyDocMimeType(mimeType, filename)) {
    return false;
  }

  return (
    mimeType === 'application/pdf' ||
    DOCX_MIME_TYPES.has(mimeType) ||
    TEXT_MIME_TYPES.has(mimeType) ||
    RTF_MIME_TYPES.has(mimeType) ||
    IMAGE_MIME_TYPES.has(mimeType) ||
    extension === 'pdf' ||
    extension === 'docx' ||
    extension === 'txt' ||
    extension === 'rtf' ||
    extension === 'png' ||
    extension === 'jpg' ||
    extension === 'jpeg'
  );
}

function loadCanvasRuntime(): CanvasRuntimeModule {
  return nodeRequire('@napi-rs/canvas') as CanvasRuntimeModule;
}

function tryLoadCanvasRuntime(): CanvasRuntimeModule | null {
  try {
    return loadCanvasRuntime();
  } catch {
    return null;
  }
}

function loadTesseractRuntime(): TesseractRuntimeModule {
  return nodeRequire('tesseract.js') as TesseractRuntimeModule;
}

function installCanvasPolyfills(canvasRuntime: CanvasRuntimeModule) {
  const globalScope = globalThis as unknown as {
    DOMMatrix?: unknown;
    ImageData?: unknown;
    Path2D?: unknown;
  };

  if (!globalScope.DOMMatrix && 'DOMMatrix' in canvasRuntime) {
    globalScope.DOMMatrix = canvasRuntime.DOMMatrix;
  }

  if (!globalScope.ImageData && 'ImageData' in canvasRuntime) {
    globalScope.ImageData = canvasRuntime.ImageData;
  }

  if (!globalScope.Path2D && 'Path2D' in canvasRuntime) {
    globalScope.Path2D = canvasRuntime.Path2D;
  }
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown OCR runtime error';
  }
}

function resolveOcrUnavailableReason(error: unknown): string | null {
  const message = toErrorMessage(error);
  const normalized = message.toLowerCase();

  const hasUnavailablePattern = OCR_UNAVAILABLE_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(message);
  });

  if (!hasUnavailablePattern) {
    return null;
  }

  if (normalized.includes('@napi-rs/canvas')) {
    return 'OCR canvas runtime is missing (@napi-rs/canvas is unavailable).';
  }

  if (normalized.includes('tesseract.js')) {
    return 'OCR engine runtime is missing (tesseract.js is unavailable).';
  }

  if (normalized.includes('dommatrix') || normalized.includes('path2d')) {
    return 'OCR runtime lacks required canvas/polyfill primitives (DOMMatrix/Path2D).';
  }

  if (normalized.includes('module did not self-register')) {
    return 'OCR native dependencies are incompatible with the current runtime.';
  }

  return 'OCR runtime dependencies are unavailable in this deployment environment.';
}

function countPatternMatches(text: string, patterns: RegExp[]) {
  let total = 0;

  for (const pattern of patterns) {
    const matches = text.match(pattern);
    total += matches?.length ?? 0;
  }

  return total;
}

function isRecoverableLowConfidenceQuality(
  quality: Pick<
    ResumeTextQuality,
    | 'confidenceScore'
    | 'alphaWordCount'
    | 'humanReadableRatio'
    | 'resumeHintCount'
    | 'detectedSectionCount'
    | 'suspiciousTokenCount'
    | 'totalWordCount'
    | 'pdfInternalHitCount'
  >,
) {
  const maxSuspicious = Math.max(18, Math.floor(quality.totalWordCount * 0.2));

  return (
    quality.confidenceScore >= MIN_RECOVERABLE_CONFIDENCE_SCORE &&
    quality.alphaWordCount >= 22 &&
    quality.humanReadableRatio >= 0.36 &&
    (quality.resumeHintCount >= 3 || quality.detectedSectionCount >= 2) &&
    quality.suspiciousTokenCount <= maxSuspicious &&
    quality.pdfInternalHitCount <= 12
  );
}

function isExtractionCandidateUsable(
  candidate: ResumeExtractionResult | null,
) {
  if (!candidate) {
    return false;
  }

  return (
    candidate.quality.isAcceptable ||
    isRecoverableLowConfidenceQuality(candidate.quality)
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
      /^[a-z(]/.test(line) || /^\d{2,4}\b/.test(line) || /^[,&/)-]/.test(line);
    const previousLooksIncomplete =
      previous.length > 25 &&
      !/[.:;!?-]$/.test(previous) &&
      !/^[A-Z][A-Z\s]{2,}:?$/.test(previous) &&
      !/^[-*]/.test(previous);
    const currentLooksSectionHeader = /^[A-Z][A-Za-z/&\s]{2,}:?$/.test(line);
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

function dehyphenateWrappedWords(text: string) {
  return text.replace(/([A-Za-z])-\n\s*(?=[A-Za-z])/g, '$1');
}

function normalizeExtractedText(
  text: string,
  source: 'pdf' | 'docx' | 'txt' | 'rtf' | 'image' = 'pdf',
) {
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

  normalized = dehyphenateWrappedWords(normalized);
  normalized = mergeWrappedLines(normalized)
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return normalized;
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
  const detectedSectionCount = SECTION_PATTERNS.reduce((count, pattern) => {
    pattern.lastIndex = 0;
    return count + (pattern.test(normalized) ? 1 : 0);
  }, 0);
  const humanReadableRatio = tokens.length > 0 ? alphaWords.length / tokens.length : 0;
  const junkRatio = tokens.length > 0 ? suspiciousTokens.length / tokens.length : 1;
  const likelyScannedPdf =
    alphaWords.length < 14 || (humanReadableRatio < 0.32 && resumeHintCount <= 2);

  const confidenceScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        humanReadableRatio * 58 +
          Math.min(alphaWords.length, 260) * 0.19 +
          resumeHintCount * 4.5 +
          detectedSectionCount * 5.5 -
          junkRatio * 9 -
          suspiciousTokens.length * 0.7 -
          pdfInternalHitCount * 1.6,
      ),
    ),
  );

  const confidenceTier =
    confidenceScore >= 75 ? 'high' : confidenceScore >= 45 ? 'medium' : 'low';

  const qualityWithoutResultFlags: Omit<ResumeTextQuality, 'isAcceptable' | 'reason'> = {
    textLength: normalized.length,
    wordCount: tokens.length,
    likelyScannedPdf,
    confidenceScore,
    confidenceTier,
    detectedSectionCount,
    junkRatio,
    humanReadableRatio,
    alphaWordCount: alphaWords.length,
    totalWordCount: tokens.length,
    suspiciousTokenCount: suspiciousTokens.length,
    pdfInternalHitCount,
    resumeHintCount,
  };
  const recoverableLowConfidence = isRecoverableLowConfidenceQuality({
    ...qualityWithoutResultFlags,
  });

  let reason: string | null = null;

  if (!normalized) {
    reason = 'No readable text could be extracted from this file.';
  } else if (pdfInternalHitCount >= 10 && resumeHintCount <= 1) {
    reason =
      'Extracted text looks like raw PDF internals instead of readable resume content.';
  } else if (alphaWords.length < 12) {
    reason = 'Extracted text is too short to build a reliable resume profile.';
  } else if (humanReadableRatio < 0.32) {
    reason = 'Extracted text is not human-readable enough to trust for resume parsing.';
  } else if (detectedSectionCount < 1 && resumeHintCount < 2 && alphaWords.length < 32) {
    reason = 'Extracted text is missing key resume sections and may be incomplete.';
  } else if (
    suspiciousTokens.length > Math.max(14, Math.floor(tokens.length * 0.18)) &&
    resumeHintCount <= 2
  ) {
    reason = 'Extracted text is dominated by binary-like or document-object tokens.';
  } else if (
    confidenceScore < MIN_ACCEPTABLE_CONFIDENCE_SCORE &&
    !recoverableLowConfidence
  ) {
    reason = 'Extracted text quality is too low to trust for resume parsing.';
  }

  return {
    isAcceptable: reason === null,
    reason,
    ...qualityWithoutResultFlags,
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
    return normalizeExtractedText(textMatches.join(' '), 'pdf');
  }

  const printable = raw.match(/[A-Za-z0-9][A-Za-z0-9 ,.+:/()_\-\n]{20,}/g) ?? [];
  return normalizeExtractedText(printable.join(' '), 'pdf');
}

async function extractDocxText(fileBuffer: Buffer) {
  const mammoth = await import('mammoth');
  const parsed = await mammoth.extractRawText({ buffer: fileBuffer });
  return normalizeExtractedText(parsed.value ?? '', 'docx');
}

function extractTxtText(fileBuffer: Buffer) {
  return normalizeExtractedText(fileBuffer.toString('utf8'), 'txt');
}

function extractRtfText(fileBuffer: Buffer) {
  const raw = fileBuffer.toString('utf8');
  const withoutControls = raw
    .replace(/\\'[0-9a-fA-F]{2}/g, ' ')
    .replace(/\\[a-zA-Z]+-?\d*\s?/g, ' ')
    .replace(/[{}]/g, ' ');

  return normalizeExtractedText(withoutControls, 'rtf');
}

async function extractPdfTextWithPdfJs(fileBuffer: Buffer) {
  const optionalCanvasRuntime = tryLoadCanvasRuntime();
  if (optionalCanvasRuntime) {
    installCanvasPolyfills(optionalCanvasRuntime);
  }

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
  const canvasRuntime = loadCanvasRuntime();
  installCanvasPolyfills(canvasRuntime);

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { createCanvas } = canvasRuntime;
  const { createWorker } = loadTesseractRuntime();

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
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext('2d');

      await page
        .render({
          canvas: canvas as never,
          canvasContext: context as never,
          viewport,
        })
        .promise;

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

async function extractImageTextWithOcr(fileBuffer: Buffer) {
  const { createWorker } = loadTesseractRuntime();
  const worker = await createWorker('eng');

  try {
    const result = await worker.recognize(fileBuffer);
    return {
      text: normalizeExtractedText(result.data.text ?? '', 'image'),
      confidence:
        typeof result.data.confidence === 'number' ? result.data.confidence : null,
    };
  } finally {
    await worker.terminate();
  }
}

function createExtractionCandidate(args: {
  text: string;
  method: ResumeExtractionMethod;
  attemptedMethods: ResumeExtractionMethod[];
  usedOcr?: boolean;
  ocrAttempted?: boolean;
  ocrImprovedQuality?: boolean | null;
  ocrConfidence?: number | null;
  source?: 'pdf' | 'docx' | 'txt' | 'rtf' | 'image';
}): ResumeExtractionResult {
  const cleanedText = normalizeExtractedText(args.text, args.source ?? 'pdf');
  const quality = assessResumeTextQuality(cleanedText);

  return {
    text: cleanedText,
    method: args.method,
    usedOcr: args.usedOcr ?? false,
    ocrAttempted: args.ocrAttempted ?? false,
    ocrImprovedQuality: args.ocrImprovedQuality ?? null,
    ocrConfidence: args.ocrConfidence ?? null,
    ocrAvailable: true,
    ocrUnavailableReason: null,
    acceptedWithWarnings: false,
    warningCode: null,
    warningMessage: null,
    attemptedMethods: [...args.attemptedMethods],
    textLength: cleanedText.length,
    readiness: deriveReadiness(quality),
    quality,
  };
}

function deriveReadiness(
  quality: ResumeTextQuality,
): 'good' | 'partial' | 'poor' | 'failed' {
  if (quality.isAcceptable && quality.confidenceTier === 'high') {
    return 'good';
  }

  if (quality.isAcceptable) {
    return 'partial';
  }

  if (isRecoverableLowConfidenceQuality(quality)) {
    return 'poor';
  }

  return 'failed';
}

function classifyExtractionFailure(
  quality: ResumeTextQuality | null,
  attemptedMethods: ResumeExtractionMethod[],
  ocrAttempted: boolean,
): ResumeExtractionFailureCode {
  if (!quality || quality.totalWordCount === 0 || quality.alphaWordCount === 0) {
    return ocrAttempted || attemptedMethods.includes('pdf-ocr')
      ? 'EMPTY_EXTRACTED_TEXT'
      : 'EXTRACTION_FAILED';
  }

  if (attemptedMethods.includes('image-ocr')) {
    return quality.confidenceTier === 'low' ? 'LOW_TEXT_CONFIDENCE' : 'EXTRACTION_FAILED';
  }

  if (quality.likelyScannedPdf && quality.confidenceTier === 'low') {
    return 'IMAGE_BASED_PDF';
  }

  if (!quality.isAcceptable || quality.confidenceTier !== 'high') {
    return 'LOW_TEXT_CONFIDENCE';
  }

  return 'EXTRACTION_FAILED';
}

function buildDiagnostics(
  candidate: ResumeExtractionResult | null,
  attemptedMethods: ResumeExtractionMethod[],
  ocrAttempted: boolean,
  ocrImprovedQuality: boolean | null,
  ocrAvailable = true,
  ocrUnavailableReason: string | null = null,
): ResumeExtractionDiagnostics {
  return {
    reason: candidate?.quality.reason ?? null,
    attemptedMethods,
    method: candidate?.method ?? null,
    usedOcr: candidate?.usedOcr ?? false,
    ocrAttempted,
    ocrImprovedQuality,
    ocrConfidence: candidate?.ocrConfidence ?? null,
    textLength: candidate?.textLength ?? 0,
    wordCount: candidate?.quality.wordCount ?? 0,
    readiness: candidate?.readiness ?? 'failed',
    confidenceScore: candidate?.quality.confidenceScore ?? 0,
    confidenceTier: candidate?.quality.confidenceTier ?? 'low',
    detectedSectionCount: candidate?.quality.detectedSectionCount ?? 0,
    junkRatio: candidate?.quality.junkRatio ?? 1,
    likelyScannedPdf: candidate?.quality.likelyScannedPdf ?? false,
    ocrAvailable,
    ocrUnavailableReason,
  };
}

function applyExtractionWarnings(
  candidate: ResumeExtractionResult,
  options: {
    ocrAttempted: boolean;
    ocrImprovedQuality: boolean | null;
    ocrAvailable: boolean;
    ocrUnavailableReason: string | null;
  },
) {
  const next: ResumeExtractionResult = {
    ...candidate,
    ocrAttempted: options.ocrAttempted,
    ocrImprovedQuality: options.ocrImprovedQuality,
    ocrAvailable: options.ocrAvailable,
    ocrUnavailableReason: options.ocrUnavailableReason,
  };

  let warningCode: ResumeExtractionWarningCode | null = null;
  let warningMessage: string | null = null;

  if (options.ocrAttempted && !options.ocrAvailable) {
    warningCode = 'OCR_UNAVAILABLE';
    warningMessage =
      'OCR fallback is unavailable in the current runtime. Processing continued with lower-confidence text extraction.';
  } else if (options.ocrAttempted && options.ocrImprovedQuality === false) {
    warningCode = 'OCR_DID_NOT_IMPROVE';
    warningMessage =
      'OCR fallback ran but did not significantly improve extraction quality. Results may be incomplete.';
  } else if (!next.quality.isAcceptable || next.quality.confidenceTier === 'low') {
    warningCode = 'LOW_TEXT_CONFIDENCE';
    warningMessage =
      'Text extraction completed with low confidence. Review parsed details before relying on analysis output.';
  }

  next.warningCode = warningCode;
  next.warningMessage = warningMessage;
  next.acceptedWithWarnings = warningCode !== null;

  return next;
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
    bestCandidate.quality.confidenceTier === 'low' ||
    bestCandidate.quality.resumeHintCount <= 2
  );
}

export async function extractResumeText(
  fileBuffer: Buffer,
  mimeType: string,
  filename: string,
  options: ExtractResumeTextOptions = {},
): Promise<ResumeExtractionResult> {
  const forceOcrRequested = options.forceOcr ?? options.forceOCR ?? false;
  const extension = getResumeExtension(filename);
  const isPdf = mimeType === 'application/pdf' || extension === 'pdf';
  const isDocx = DOCX_MIME_TYPES.has(mimeType) || extension === 'docx';
  const isLegacyDoc = isLegacyDocMimeType(mimeType, filename);
  const isTxt = TEXT_MIME_TYPES.has(mimeType) || extension === 'txt';
  const isRtf = RTF_MIME_TYPES.has(mimeType) || extension === 'rtf';
  const isImage =
    IMAGE_MIME_TYPES.has(mimeType) ||
    extension === 'png' ||
    extension === 'jpg' ||
    extension === 'jpeg';
  const attemptedMethods: ResumeExtractionMethod[] = [];
  const overrides = resumeExtractionTestOverrides;
  let bestNonOcrCandidate: ResumeExtractionResult | null = null;
  let ocrAttempted = false;
  let ocrAvailable = true;
  let ocrUnavailableReason: string | null = null;

  if (isLegacyDoc) {
    throw new ResumeExtractionError(
      'Legacy DOC files are not supported safely. Please convert to DOCX, TXT, or PDF and upload again.',
      null,
      null,
      [],
      'EXTRACTION_FAILED',
      null,
    );
  }

  if (isTxt || isRtf) {
    const method: ResumeExtractionMethod = isTxt ? 'txt-direct' : 'rtf-direct';
    attemptedMethods.push(method);
    const candidate = createExtractionCandidate({
      text: isTxt ? extractTxtText(fileBuffer) : extractRtfText(fileBuffer),
      method,
      attemptedMethods,
      ocrAttempted: false,
      source: isTxt ? 'txt' : 'rtf',
    });

    if (candidate.quality.isAcceptable) {
      return applyExtractionWarnings(candidate, {
        ocrAttempted: false,
        ocrImprovedQuality: null,
        ocrAvailable: true,
        ocrUnavailableReason: null,
      });
    }

    const failureCode = classifyExtractionFailure(candidate.quality, attemptedMethods, false);
    throw new ResumeExtractionError(
      'The uploaded text file does not contain enough structured resume content.',
      candidate.quality,
      candidate.method,
      attemptedMethods,
      failureCode,
      buildDiagnostics(candidate, attemptedMethods, false, null),
    );
  }

  if (isImage) {
    attemptedMethods.push('image-ocr');
    const ocr = await (overrides?.extractImageTextWithOcr ?? extractImageTextWithOcr)(
      fileBuffer,
    );
    const candidate = createExtractionCandidate({
      text: ocr.text,
      method: 'image-ocr',
      attemptedMethods,
      usedOcr: true,
      ocrAttempted: true,
      ocrConfidence: ocr.confidence,
      source: 'image',
    });

    if (candidate.quality.isAcceptable) {
      return applyExtractionWarnings(candidate, {
        ocrAttempted: true,
        ocrImprovedQuality: null,
        ocrAvailable: true,
        ocrUnavailableReason: null,
      });
    }

    const failureCode = classifyExtractionFailure(candidate.quality, attemptedMethods, true);
    throw new ResumeExtractionError(
      'The uploaded image could not be read reliably. Please upload a clearer PNG/JPG or a text-based PDF/DOCX.',
      candidate.quality,
      candidate.method,
      attemptedMethods,
      failureCode,
      buildDiagnostics(candidate, attemptedMethods, true, null),
    );
  }

  if (isDocx) {
    attemptedMethods.push('docx-mammoth');
    const docxText =
      overrides?.docxText ??
      (await (overrides?.extractDocxText ?? extractDocxText)(fileBuffer));
    const candidate = createExtractionCandidate({
      text: docxText,
      method: 'docx-mammoth',
      attemptedMethods,
      ocrAttempted: false,
      source: 'docx',
    });

    if (candidate.quality.isAcceptable) {
      return applyExtractionWarnings(candidate, {
        ocrAttempted: false,
        ocrImprovedQuality: null,
        ocrAvailable: true,
        ocrUnavailableReason: null,
      });
    }

    const failureCode = classifyExtractionFailure(candidate.quality, attemptedMethods, false);
    throw new ResumeExtractionError(
      'This resume could not be read reliably. Try a clearer PDF or DOCX.',
      candidate.quality,
      candidate.method,
      attemptedMethods,
      failureCode,
      buildDiagnostics(candidate, attemptedMethods, false, null),
    );
  }

  if (!isPdf) {
    throw new ResumeExtractionError(
      'Unsupported resume format. Upload PDF, DOCX, TXT, RTF, PNG, or JPG.',
      null,
      null,
      [],
      'EXTRACTION_FAILED',
      null,
    );
  }

  const attempts: Array<{
    method: ResumeExtractionMethod;
    run: () => Promise<{ text: string; ocrConfidence?: number | null }>;
  }> = [
    {
      method: 'pdfjs-text',
      run: async () => ({
        text:
          overrides?.pdfDirectText ??
          (await (overrides?.extractPdfTextWithPdfJs ?? extractPdfTextWithPdfJs)(fileBuffer)),
      }),
    },
    {
      method: 'pdf-parse-fallback',
      run: async () => ({
        text:
          overrides?.pdfCleanedText ??
          (await (overrides?.extractPdfTextWithPdfParse ?? extractPdfTextWithPdfParse)(fileBuffer)),
      }),
    },
    {
      method: 'pdf-token-fallback',
      run: async () => ({
        text:
          overrides?.pdfTokenText ??
          (overrides?.extractPdfTextFallback ?? extractPdfTextFallback)(fileBuffer),
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
        ocrAttempted: false,
        source: 'pdf',
      });
      bestCandidate = chooseBetterCandidate(bestCandidate, candidate);
      bestNonOcrCandidate = chooseBetterCandidate(bestNonOcrCandidate, candidate);

      if (
        !forceOcrRequested &&
        candidate.quality.isAcceptable &&
        candidate.quality.confidenceTier !== 'low'
      ) {
        return applyExtractionWarnings(candidate, {
          ocrAttempted: false,
          ocrImprovedQuality: null,
          ocrAvailable: true,
          ocrUnavailableReason: null,
        });
      }
    } catch {
      continue;
    }
  }

  if (forceOcrRequested || shouldAttemptOcr(bestCandidate)) {
    ocrAttempted = true;
    attemptedMethods.push('pdf-ocr');

    try {
      const ocr =
        overrides?.pdfOcrText !== undefined
          ? {
              text: overrides.pdfOcrText,
              confidence: overrides.ocrConfidence ?? null,
            }
          : await (overrides?.extractPdfTextWithOcr ?? extractPdfTextWithOcr)(fileBuffer);

      const candidate = createExtractionCandidate({
        text: ocr.text,
        method: 'pdf-ocr',
        attemptedMethods,
        usedOcr: true,
        ocrAttempted: true,
        ocrConfidence: ocr.confidence ?? null,
        source: 'pdf',
      });
      const ocrImprovedQuality =
        bestNonOcrCandidate === null
          ? true
          : candidate.quality.confidenceScore >
            bestNonOcrCandidate.quality.confidenceScore;
      candidate.ocrImprovedQuality = ocrImprovedQuality;
      bestCandidate = chooseBetterCandidate(bestCandidate, candidate);

      if (isExtractionCandidateUsable(candidate)) {
        return applyExtractionWarnings(candidate, {
          ocrAttempted: true,
          ocrImprovedQuality,
          ocrAvailable: true,
          ocrUnavailableReason: null,
        });
      }

      if (bestCandidate && isExtractionCandidateUsable(bestCandidate)) {
        return applyExtractionWarnings(bestCandidate, {
          ocrAttempted: true,
          ocrImprovedQuality,
          ocrAvailable: true,
          ocrUnavailableReason: null,
        });
      }
    } catch (ocrError) {
      ocrUnavailableReason = resolveOcrUnavailableReason(ocrError);
      ocrAvailable = ocrUnavailableReason === null;

      const ocrImprovedQuality = bestCandidate
        ? bestNonOcrCandidate === null
          ? true
          : bestCandidate.quality.confidenceScore >
            bestNonOcrCandidate.quality.confidenceScore
        : null;

      if (bestCandidate && isExtractionCandidateUsable(bestCandidate)) {
        return applyExtractionWarnings(bestCandidate, {
          ocrAttempted: true,
          ocrImprovedQuality,
          ocrAvailable,
          ocrUnavailableReason,
        });
      }

      const diagnostics = buildDiagnostics(
        bestCandidate,
        attemptedMethods,
        true,
        ocrImprovedQuality,
        ocrAvailable,
        ocrUnavailableReason,
      );
      throw new ResumeExtractionError(
        ocrAvailable
          ? 'OCR fallback failed. Please upload a clearer text-based PDF or a DOCX resume.'
          : 'OCR fallback is unavailable in the current runtime environment.',
        bestCandidate?.quality ?? null,
        bestCandidate?.method ?? null,
        attemptedMethods,
        ocrAvailable ? 'OCR_FAILED' : 'OCR_UNAVAILABLE',
        diagnostics,
      );
    }
  }

  if (bestCandidate && isExtractionCandidateUsable(bestCandidate)) {
    const ocrImprovedQuality =
      ocrAttempted && bestCandidate.usedOcr
        ? bestNonOcrCandidate === null
          ? true
          : bestCandidate.quality.confidenceScore >
            bestNonOcrCandidate.quality.confidenceScore
        : null;

    return applyExtractionWarnings(bestCandidate, {
      ocrAttempted,
      ocrImprovedQuality,
      ocrAvailable,
      ocrUnavailableReason,
    });
  }

  const failureCode: ResumeExtractionFailureCode = ocrAvailable
    ? classifyExtractionFailure(
        bestCandidate?.quality ?? null,
        attemptedMethods,
        ocrAttempted,
      )
    : 'OCR_UNAVAILABLE';
  const diagnostics = buildDiagnostics(
    bestCandidate,
    attemptedMethods,
    ocrAttempted,
    ocrAttempted && bestCandidate
          ? bestNonOcrCandidate === null
            ? true
            : bestCandidate.quality.confidenceScore >
              bestNonOcrCandidate.quality.confidenceScore
      : null,
    ocrAvailable,
    ocrUnavailableReason,
  );

  throw new ResumeExtractionError(
    failureCode === 'OCR_UNAVAILABLE'
      ? 'OCR fallback is unavailable and direct extraction quality was too low.'
      : 'This resume could not be read reliably. Try a clearer PDF or DOCX.',
    bestCandidate?.quality ?? null,
    bestCandidate?.method ?? null,
    attemptedMethods,
    failureCode,
    diagnostics,
  );
}
