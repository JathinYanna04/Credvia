'use client';

import { Loader2, UploadCloud } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

export interface ResumeUploadCardProps {
  onUploaded: () => Promise<void> | void;
}

export function ResumeUploadCard({ onUploaded }: ResumeUploadCardProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.set('resume', file);

      const response = await fetch('/api/v1/resumes', {
        method: 'POST',
        body: formData,
      });

      const payload = (await response.json()) as {
        error?: { message?: string };
      };

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Your session expired. Sign in again before uploading a resume.');
        }
        throw new Error(payload.error?.message ?? 'Could not upload your resume.');
      }

      await onUploaded();
      setSuccess('Resume uploaded. Run analysis to turn it into a match profile.');
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Could not upload your resume.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="surface-panel space-y-4 p-5">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Upload your resume</h2>
        <p className="text-sm text-text-secondary">
          Upload one PDF or DOCX resume. Credvia keeps the original file private and parses it into a structured fit profile.
        </p>
      </div>

      <div className="rounded-2xl border border-dashed border-border-default bg-bg-surface/40 p-5">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void handleFile(file);
            }
          }}
        />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm text-text-primary">Supported formats: PDF and DOCX</p>
            <p className="text-xs text-text-tertiary">Max file size: 10 MB</p>
          </div>
          <Button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            {uploading ? 'Uploading...' : 'Choose resume'}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-2xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          {success}
        </div>
      ) : null}
    </section>
  );
}
