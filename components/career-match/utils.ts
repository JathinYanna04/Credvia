import { normalizeResumeLifecycleStatus } from '@/lib/resume/lifecycle';

export function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return 'Unknown date';
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Unknown time';
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function humanizeParseStatus(status: string) {
  const normalized = normalizeResumeLifecycleStatus(status);

  switch (normalized) {
    case 'UPLOADED':
      return 'Uploaded';
    case 'EXTRACTING':
      return 'Extracting';
    case 'EXTRACTED':
      return 'Extracted';
    case 'EXTRACTED_WITH_WARNINGS':
      return 'Extracted with warnings';
    case 'PARSED':
      return 'Parsed';
    case 'READY':
      return 'Ready';
    case 'ANALYZING':
      return 'Analysis in progress';
    case 'ANALYZED':
      return 'Analysis complete';
    case 'EXTRACTION_FAILED':
      return 'Extraction failed';
    case 'PARSING_FAILED':
      return 'Parsing failed';
    case 'ANALYSIS_FAILED':
      return 'Analysis failed';
    default:
      return status;
  }
}

export function parseStatusVariant(status: string) {
  const normalized = normalizeResumeLifecycleStatus(status);

  switch (normalized) {
    case 'READY':
    case 'ANALYZED':
      return 'success' as const;
    case 'EXTRACTING':
    case 'PARSED':
    case 'ANALYZING':
      return 'info' as const;
    case 'EXTRACTED_WITH_WARNINGS':
      return 'warning' as const;
    case 'EXTRACTION_FAILED':
    case 'PARSING_FAILED':
    case 'ANALYSIS_FAILED':
      return 'danger' as const;
    default:
      return 'secondary' as const;
  }
}

export function canAnalyzeFromStatus(status: string) {
  const normalized = normalizeResumeLifecycleStatus(status);
  return normalized === 'READY' || normalized === 'EXTRACTED_WITH_WARNINGS';
}

export function explainRequirement(required: boolean) {
  return required ? 'Required' : 'Preferred';
}

export function describeAnalysisMethod(parserVersion: string | null | undefined) {
  if (!parserVersion) {
    return null;
  }

  if (parserVersion.startsWith('render-extractor:')) {
    const [, source] = parserVersion.split(':');
    if (source === 'merged') return 'Render extractor (Merged)';
    if (source === 'ocr_fallback') return 'Render extractor (OCR fallback)';
    if (source === 'deterministic_only') return 'Render extractor (Deterministic fallback)';
    return 'Render extractor';
  }

  if (parserVersion.includes('pdfjs-text')) {
    return 'Native PDF text extraction';
  }

  if (parserVersion.includes('pdf-parse-fallback')) {
    return 'Fallback PDF text extraction';
  }

  if (parserVersion.includes('pdf-token-fallback')) {
    return 'Last-resort PDF text fallback';
  }

  if (parserVersion.includes('docx-mammoth')) {
    return 'DOCX text extraction';
  }

  if (parserVersion.includes('pdf-ocr') || parserVersion.includes(':ocr')) {
    return 'OCR fallback';
  }

  return parserVersion;
}
