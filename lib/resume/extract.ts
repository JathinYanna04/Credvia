const DOCX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]);

export const RESUME_UPLOAD_LIMIT_BYTES = 10 * 1024 * 1024;

export function getResumeExtension(filename: string) {
  const extension = filename.toLowerCase().split('.').pop();
  return extension === 'pdf' || extension === 'docx' || extension === 'doc' ? extension : null;
}

export function isSupportedResumeMimeType(mimeType: string, filename: string) {
  const extension = getResumeExtension(filename);
  return mimeType === 'application/pdf' || DOCX_MIME_TYPES.has(mimeType) || extension === 'pdf' || extension === 'docx';
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

  const printable = raw.match(/[A-Za-z0-9][A-Za-z0-9 ,.+:/()_-]{20,}/g) ?? [];
  return printable.join(' ').replace(/\s+/g, ' ').trim();
}

export async function extractResumeText(
  fileBuffer: Buffer,
  mimeType: string,
  filename: string,
) {
  if (mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')) {
    try {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: fileBuffer });
      const parsed = await parser.getText();
      await parser.destroy();
      const extracted = parsed.text?.trim() ?? '';
      if (extracted) {
        return extracted;
      }
    } catch {
      // Fall through to a text-object fallback for simple PDFs.
    }

    const fallbackText = extractPdfTextFallback(fileBuffer);
    if (fallbackText) {
      return fallbackText;
    }

    throw new Error('Could not extract text from this PDF resume.');
  }

  const mammoth = await import('mammoth');
  const parsed = await mammoth.extractRawText({ buffer: fileBuffer });
  return parsed.value ?? '';
}
