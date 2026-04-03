import type { ExtractResponse } from '@/lib/resume-extractor/types';

export async function extractResume(file: File): Promise<ExtractResponse> {
  const baseUrl = process.env.NEXT_PUBLIC_RESUME_EXTRACTOR_URL;
  if (!baseUrl) {
    throw new Error('Missing NEXT_PUBLIC_RESUME_EXTRACTOR_URL');
  }

  const form = new FormData();
  form.append('file', file);
  form.append('mime_type', file.type || 'application/octet-stream');
  form.append('filename', file.name);

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/extract`, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Extractor failed (${response.status}): ${text}`);
  }

  return response.json();
}
