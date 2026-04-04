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
// Recall-first extraction: only hard-fail when text is truly unusable.
const MIN_ACCEPTABLE_CONFIDENCE_SCORE = 20;
const MIN_HUMAN_READABLE_RATIO = 0.18;
const MAX_HARD_FAIL_JUNK_RATIO = 0.8;
const MIN_RECOVERABLE_TEXT_LENGTH = 300;
const MIN_RECOVERABLE_WORD_COUNT = 50;
const MIN_RECOVERABLE_ALPHA_WORD_COUNT = 22;
const MIN_RECOVERABLE_HUMAN_READABLE_RATIO = 0.2;
const MAX_RECOVERABLE_JUNK_RATIO = 0.7;
const MIN_RECOVERABLE_RESUME_HINT_COUNT = 2;
const MAX_RECOVERABLE_PDF_INTERNAL_HITS = 140;

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
  | 'pdf-ocr'
  | 'render-extractor';

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
  rawText: string;
  method: ResumeExtractionMethod;
  pageCount?: number;
  pageSourceSummary?: Record<string, number>;
  pageDecisions?: Array<Record<string, unknown>>;
  layoutReconstructionUsed?: boolean;
  usedOcr: boolean;
  ocrNeeded: boolean;
  ocrStatus:
    | 'skipped_unnecessary'
    | 'attempted_no_gain'
    | 'failed_preserved_previous'
    | 'used_successfully'
    | 'unavailable_preserved_previous'
    | null;
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
  cleanedTextLength: number;
  contaminationScore: number;
  salvageScore: number;
  cleaningActions: string[];
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
  | 'OCR_DID_NOT_IMPROVE'
  | 'SALVAGED_FROM_NOISE'
  | 'CLEANED_TEXT_LOW_SIGNAL';

type ResumeQualityTier = 'accepted' | 'accepted-with-warnings' | 'failed';

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
    | 'textLength'
    | 'alphaWordCount'
    | 'wordCount'
    | 'humanReadableRatio'
    | 'junkRatio'
    | 'resumeHintCount'
    | 'detectedSectionCount'
    | 'pdfInternalHitCount'
  >,
) {
  const signalCount =
    (quality.textLength >= MIN_RECOVERABLE_TEXT_LENGTH ? 1 : 0) +
    (quality.wordCount >= MIN_RECOVERABLE_WORD_COUNT ? 1 : 0) +
    (quality.alphaWordCount >= MIN_RECOVERABLE_ALPHA_WORD_COUNT ? 1 : 0) +
    (quality.resumeHintCount >= MIN_RECOVERABLE_RESUME_HINT_COUNT ? 1 : 0);

  const hasSufficientContent = signalCount >= 2;

  const hasResumeSignals =
    quality.resumeHintCount >= MIN_RECOVERABLE_RESUME_HINT_COUNT ||
    quality.detectedSectionCount >= 1 ||
    (quality.resumeHintCount >= 1 && quality.alphaWordCount >= 18);

  const hasBalancedReadabilityAndNoise =
    quality.humanReadableRatio >= MIN_RECOVERABLE_HUMAN_READABLE_RATIO ||
    quality.junkRatio <= MAX_RECOVERABLE_JUNK_RATIO;

  return (
    hasSufficientContent &&
    hasResumeSignals &&
    hasBalancedReadabilityAndNoise &&
    quality.pdfInternalHitCount <= MAX_RECOVERABLE_PDF_INTERNAL_HITS
  );
}

function classifyResumeQualityTier(quality: ResumeTextQuality): ResumeQualityTier {
  if (quality.isAcceptable && quality.confidenceTier !== 'low') {
    return 'accepted';
  }

  if (quality.isAcceptable || isRecoverableLowConfidenceQuality(quality)) {
    return 'accepted-with-warnings';
  }

  return 'failed';
}

function isExtractionCandidateUsable(
  candidate: ResumeExtractionResult | null,
) {
  if (!candidate) {
    return false;
  }

  if (
    candidate.contaminationScore >= 85 &&
    candidate.salvageScore < 20 &&
    candidate.cleanedTextLength < 200 &&
    candidate.quality.resumeHintCount <= 1
  ) {
    return false;
  }

  return classifyResumeQualityTier(candidate.quality) !== 'failed';
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

function computeContaminationScore(text: string) {
  const normalized = text.trim();
  if (!normalized) {
    return 100;
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return 100;
  }

  const pdfInternalHits = countPatternMatches(normalized, PDF_INTERNAL_PATTERNS);
  const slashHits = normalized.match(/\/[A-Za-z]/g)?.length ?? 0;
  const binaryLikeHits =
    (normalized.match(/[A-Fa-f0-9]{24,}/g)?.length ?? 0) +
    (normalized.match(/[A-Za-z0-9+/]{32,}={0,2}/g)?.length ?? 0);
  const objectStreamHits = normalized.match(/\b\d+\s+\d+\s+obj\b/gi)?.length ?? 0;
  const metadataBoost = /linearized|\/flatedecode|\/creationdate|\/producer|\/creator/i.test(
    normalized,
  )
    ? 20
    : 0;

  const internalRatio = (pdfInternalHits + slashHits) / tokens.length;
  const binaryRatio = binaryLikeHits / Math.max(tokens.length, 1);
  const objectRatio = objectStreamHits / Math.max(tokens.length, 1);

  const score = Math.min(
    100,
    Math.round(
      internalRatio * 70 +
        binaryRatio * 60 +
        objectRatio * 50 +
        Math.min(pdfInternalHits, 80) * 0.5 +
        metadataBoost,
    ),
  );

  return Math.max(0, score);
}

function computeSalvageScore(quality: ResumeTextQuality) {
  const score = Math.round(
    Math.min(quality.alphaWordCount, 220) * 0.2 +
      quality.resumeHintCount * 7 +
      quality.detectedSectionCount * 6 +
      quality.humanReadableRatio * 50 -
      quality.junkRatio * 25 -
      Math.min(quality.pdfInternalHitCount, 80) * 0.35,
  );

  return Math.max(0, Math.min(100, score));
}

function shouldDropPdfNoiseLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) {
    return true;
  }

  if (/\blinearized\b/i.test(trimmed)) {
    return true;
  }

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length < 6) {
    return false;
  }

  const alphaWords = trimmed.match(/\b[A-Za-z]{2,}\b/g) ?? [];
  const pdfInternalHits = countPatternMatches(trimmed, PDF_INTERNAL_PATTERNS);
  const slashHits = trimmed.match(/\/[A-Za-z]/g)?.length ?? 0;
  const internalRatio = pdfInternalHits / tokens.length;
  const alphaRatio = alphaWords.length / tokens.length;
  const looksLikeMetadata =
    /\/(Title|Author|Creator|Producer|CreationDate|ModDate|Keywords|Subject|Trapped)\b/i.test(
      trimmed,
    );

  const hasHighInternalRatio =
    internalRatio >= 0.35 && alphaRatio < 0.4 && alphaWords.length < 5;
  const hasSlashNoise =
    slashHits >= 4 && tokens.length >= 8 && alphaWords.length < 4;
  const hasMetadataNoise =
    looksLikeMetadata ||
    /\/(FlateDecode|Length\d*|CreationDate|ModDate|PTEX\.Fullbanner|Producer|Creator)\b/i.test(
      trimmed,
    );
  const longAndNoisy = trimmed.length > 140 && internalRatio > 0.25 && alphaRatio < 0.35;

  return hasHighInternalRatio || hasSlashNoise || hasMetadataNoise || longAndNoisy;
}

function removePdfNoiseLines(text: string) {
  const lines = text.split('\n');
  const filtered = lines.filter((line) => !shouldDropPdfNoiseLine(line));
  return filtered.join('\n');
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

function cleanExtractedText(
  text: string,
  source: 'pdf' | 'docx' | 'txt' | 'rtf' | 'image' = 'pdf',
) {
  const cleaningActions: string[] = [];
  let normalized = text ?? '';

  normalized = normalizeBulletsAndDashes(normalized)
    .replace(/\u0000/g, ' ')
    .replace(/[\u0001-\u0008\u000B-\u001A\u007F]/g, ' ')
    .replace(/\r/g, '\n');
  cleaningActions.push('normalize_bullets', 'strip_control_chars', 'normalize_line_breaks');

  if (source === 'pdf') {
    normalized = stripPdfObjectNoise(normalized);
    cleaningActions.push('strip_pdf_object_noise');
  }

  normalized = stripBinaryLikeFragments(normalized)
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[^\S\n]+$/gm, '')
    .trim();
  cleaningActions.push('strip_binary_fragments', 'collapse_whitespace');

  if (source === 'pdf') {
    normalized = removePdfNoiseLines(normalized);
    cleaningActions.push('remove_pdf_noise_lines');
  }

  normalized = dehyphenateWrappedWords(normalized);
  normalized = mergeWrappedLines(normalized)
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  cleaningActions.push('dehyphenate_wrapped_words', 'merge_wrapped_lines');

  return {
    text: normalized,
    contaminationScore: computeContaminationScore(text),
    cleaningActions,
  };
}

function normalizeExtractedText(
  text: string,
  source: 'pdf' | 'docx' | 'txt' | 'rtf' | 'image' = 'pdf',
) {
  return cleanExtractedText(text, source).text;
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

  const cappedPdfInternalHits = Math.min(pdfInternalHitCount, 60);
  const cappedSuspiciousTokens = Math.min(suspiciousTokens.length, 120);

  const confidenceScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        humanReadableRatio * 58 +
          Math.min(alphaWords.length, 260) * 0.19 +
          resumeHintCount * 4.5 +
          detectedSectionCount * 5.5 -
          junkRatio * 6 -
          cappedSuspiciousTokens * 0.4 -
          cappedPdfInternalHits * 0.6,
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
  } else if (
    normalized.length < 120 ||
    tokens.length < 20 ||
    alphaWords.length < 8
  ) {
    reason = 'Extracted text is too short to build a reliable resume profile.';
  } else if (
    pdfInternalHitCount >= 40 &&
    resumeHintCount <= 1 &&
    alphaWords.length < 20
  ) {
    reason =
      'Extracted text looks like raw PDF internals instead of readable resume content.';
  } else if (
    humanReadableRatio < MIN_HUMAN_READABLE_RATIO &&
    resumeHintCount <= 1 &&
    alphaWords.length < 18
  ) {
    reason = 'Extracted text is not human-readable enough to trust for resume parsing.';
  } else if (junkRatio > MAX_HARD_FAIL_JUNK_RATIO && resumeHintCount <= 1) {
    reason = 'Extracted text is too noisy to trust for resume parsing.';
  } else if (
    suspiciousTokens.length > Math.max(30, Math.floor(tokens.length * 0.45)) &&
    resumeHintCount <= 1 &&
    humanReadableRatio < 0.22
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

function extractTxtText(fileBuffer: Buffer) {
  return fileBuffer.toString('utf8');
}

function extractRtfText(fileBuffer: Buffer) {
  const raw = fileBuffer.toString('utf8');
  const withoutControls = raw
    .replace(/\\'[0-9a-fA-F]{2}/g, ' ')
    .replace(/\\[a-zA-Z]+-?\d*\s?/g, ' ')
    .replace(/[{}]/g, ' ');

  return withoutControls;
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
      const pageText = result.data.text ?? '';

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

async function extractImageTextWithOcr(fileBuffer: Buffer) {
  const { createWorker } = loadTesseractRuntime();
  const worker = await createWorker('eng');

  try {
    const result = await worker.recognize(fileBuffer);
    return {
      text: result.data.text ?? '',
      confidence:
        typeof result.data.confidence === 'number' ? result.data.confidence : null,
    };
  } finally {
    await worker.terminate();
  }
}

function createExtractionCandidate(args: {
  text: string;
  rawText?: string;
  method: ResumeExtractionMethod;
  attemptedMethods: ResumeExtractionMethod[];
  usedOcr?: boolean;
  ocrNeeded?: boolean;
  ocrStatus?:
    | 'skipped_unnecessary'
    | 'attempted_no_gain'
    | 'failed_preserved_previous'
    | 'used_successfully'
    | 'unavailable_preserved_previous'
    | null;
  ocrAttempted?: boolean;
  ocrImprovedQuality?: boolean | null;
  ocrConfidence?: number | null;
  source?: 'pdf' | 'docx' | 'txt' | 'rtf' | 'image';
  pageCount?: number;
  pageSourceSummary?: Record<string, number>;
  pageDecisions?: Array<Record<string, unknown>>;
  layoutReconstructionUsed?: boolean;
}): ResumeExtractionResult {
  const rawText = args.rawText ?? args.text;
  const cleaned = cleanExtractedText(rawText, args.source ?? 'pdf');
  const cleanedText = cleaned.text;
  const quality = assessResumeTextQuality(cleanedText);
  const salvageScore = computeSalvageScore(quality);

  return {
    text: cleanedText,
    rawText,
    method: args.method,
    pageCount: args.pageCount,
    pageSourceSummary: args.pageSourceSummary,
    pageDecisions: args.pageDecisions,
    layoutReconstructionUsed: args.layoutReconstructionUsed,
    usedOcr: args.usedOcr ?? false,
    ocrNeeded: args.ocrNeeded ?? false,
    ocrStatus: args.ocrStatus ?? null,
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
    cleanedTextLength: cleanedText.length,
    contaminationScore: cleaned.contaminationScore,
    salvageScore,
    cleaningActions: cleaned.cleaningActions,
    readiness: deriveReadiness(quality),
    quality,
  };
}

function deriveReadiness(
  quality: ResumeTextQuality,
): 'good' | 'partial' | 'poor' | 'failed' {
  const qualityTier = classifyResumeQualityTier(quality);

  if (qualityTier === 'accepted' && quality.confidenceTier === 'high') {
    return 'good';
  }

  if (qualityTier === 'accepted') {
    return 'partial';
  }

  if (qualityTier === 'accepted-with-warnings') {
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
  ocrNeeded: boolean,
  ocrAttempted: boolean,
  ocrStatus:
    | 'skipped_unnecessary'
    | 'attempted_no_gain'
    | 'failed_preserved_previous'
    | 'used_successfully'
    | 'unavailable_preserved_previous'
    | null,
  ocrImprovedQuality: boolean | null,
  ocrAvailable = true,
  ocrUnavailableReason: string | null = null,
): ResumeExtractionDiagnostics {
  return {
    reason: candidate?.quality.reason ?? null,
    attemptedMethods,
    method: candidate?.method ?? null,
    pageCount: candidate?.pageCount,
    pageSourceSummary: candidate?.pageSourceSummary,
    pageDecisions: candidate?.pageDecisions,
    layoutReconstructionUsed: candidate?.layoutReconstructionUsed,
    usedOcr: candidate?.usedOcr ?? false,
    ocrNeeded,
    ocrStatus,
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
    contaminationScore: candidate?.contaminationScore ?? 0,
    cleanedTextLength: candidate?.cleanedTextLength ?? 0,
    salvageScore: candidate?.salvageScore ?? 0,
    cleaningActions: candidate?.cleaningActions ?? [],
    ocrAvailable,
    ocrUnavailableReason,
  };
}

function applyExtractionWarnings(
  candidate: ResumeExtractionResult,
  options: {
    ocrNeeded: boolean;
    ocrStatus:
      | 'skipped_unnecessary'
      | 'attempted_no_gain'
      | 'failed_preserved_previous'
      | 'used_successfully'
      | 'unavailable_preserved_previous'
      | null;
    ocrAttempted: boolean;
    ocrImprovedQuality: boolean | null;
    ocrAvailable: boolean;
    ocrUnavailableReason: string | null;
  },
) {
  const next: ResumeExtractionResult = {
    ...candidate,
    ocrNeeded: options.ocrNeeded,
    ocrStatus: options.ocrStatus,
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
  } else if (next.contaminationScore >= 70 && next.salvageScore >= 35) {
    warningCode = 'SALVAGED_FROM_NOISE';
    warningMessage =
      'We recovered readable content from noisy PDF text. Some sections may still be incomplete.';
  } else if (next.salvageScore < 35 && next.quality.isAcceptable) {
    warningCode = 'CLEANED_TEXT_LOW_SIGNAL';
    warningMessage =
      'Cleaned text is usable but has limited structured signal. Some sections may be missing.';
  } else if (classifyResumeQualityTier(next.quality) === 'accepted-with-warnings') {
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

  const scoreCandidate = (candidate: ResumeExtractionResult) => {
    const quality = candidate.quality;
    const readableScore = Math.round(
      quality.humanReadableRatio * 60 +
        quality.resumeHintCount * 8 +
        quality.detectedSectionCount * 4 -
        quality.junkRatio * 30 -
        Math.min(quality.pdfInternalHitCount, 80) * 0.4,
    );

    return readableScore;
  };

  const nextScore = scoreCandidate(next);
  const currentScore = scoreCandidate(current);

  if (nextScore !== currentScore) {
    return nextScore > currentScore ? next : current;
  }

  if (next.quality.confidenceScore !== current.quality.confidenceScore) {
    return next.quality.confidenceScore > current.quality.confidenceScore ? next : current;
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

function isStrongTextPdfCandidate(candidate: ResumeExtractionResult | null) {
  if (!candidate) {
    return false;
  }

  return (
    candidate.quality.isAcceptable &&
    candidate.quality.confidenceTier === 'high' &&
    !candidate.quality.likelyScannedPdf &&
    candidate.quality.humanReadableRatio >= 0.7 &&
    candidate.quality.resumeHintCount >= 4 &&
    candidate.textLength >= 500
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
        ocrNeeded: false,
        ocrStatus: null,
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
      buildDiagnostics(candidate, attemptedMethods, false, false, null, null),
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
        ocrNeeded: true,
        ocrStatus: 'used_successfully',
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
      buildDiagnostics(candidate, attemptedMethods, true, true, 'used_successfully', null),
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
        ocrNeeded: false,
        ocrStatus: null,
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
      buildDiagnostics(candidate, attemptedMethods, false, false, null, null),
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
          ocrNeeded: false,
          ocrStatus: null,
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

  const ocrNeeded = shouldAttemptOcr(bestCandidate);
  const forceOcrBlocked = forceOcrRequested && isStrongTextPdfCandidate(bestNonOcrCandidate);
  const shouldRunOcr = ocrNeeded || (forceOcrRequested && !forceOcrBlocked);

  if (forceOcrBlocked && bestNonOcrCandidate) {
    return applyExtractionWarnings(bestNonOcrCandidate, {
      ocrNeeded: false,
      ocrStatus: 'skipped_unnecessary',
      ocrAttempted: false,
      ocrImprovedQuality: null,
      ocrAvailable: true,
      ocrUnavailableReason: null,
    });
  }

  if (shouldRunOcr) {
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
          ocrNeeded: true,
          ocrStatus: 'used_successfully',
          ocrAttempted: true,
          ocrImprovedQuality,
          ocrAvailable: true,
          ocrUnavailableReason: null,
        });
      }

      if (bestCandidate && isExtractionCandidateUsable(bestCandidate)) {
        return applyExtractionWarnings(bestCandidate, {
          ocrNeeded: shouldRunOcr,
          ocrStatus: ocrImprovedQuality ? 'used_successfully' : 'attempted_no_gain',
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
          ocrNeeded: true,
          ocrStatus: ocrAvailable ? 'failed_preserved_previous' : 'unavailable_preserved_previous',
          ocrAttempted: true,
          ocrImprovedQuality,
          ocrAvailable,
          ocrUnavailableReason,
        });
      }

      const diagnostics = buildDiagnostics(
        bestCandidate,
        attemptedMethods,
        shouldRunOcr,
        true,
        ocrAvailable ? 'failed_preserved_previous' : 'unavailable_preserved_previous',
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
      ocrNeeded,
      ocrStatus: ocrAttempted
        ? bestCandidate.usedOcr && ocrImprovedQuality !== false
          ? 'used_successfully'
          : 'attempted_no_gain'
        : null,
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
    ocrNeeded,
    ocrAttempted,
    ocrAttempted && !ocrAvailable
      ? 'unavailable_preserved_previous'
      : ocrAttempted
        ? 'failed_preserved_previous'
        : null,
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
