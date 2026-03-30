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

export function humanizeParseStatus(status: 'uploaded' | 'parsing' | 'parsed' | 'failed') {
  switch (status) {
    case 'uploaded':
      return 'Uploaded';
    case 'parsing':
      return 'Analyzing';
    case 'parsed':
      return 'Ready';
    case 'failed':
      return 'Needs attention';
    default:
      return status;
  }
}

export function parseStatusVariant(status: 'uploaded' | 'parsing' | 'parsed' | 'failed') {
  switch (status) {
    case 'parsed':
      return 'success' as const;
    case 'parsing':
      return 'info' as const;
    case 'failed':
      return 'danger' as const;
    default:
      return 'secondary' as const;
  }
}

export function explainRequirement(required: boolean) {
  return required ? 'Required' : 'Preferred';
}

export function describeAnalysisMethod(parserVersion: string | null | undefined) {
  if (!parserVersion) {
    return null;
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
