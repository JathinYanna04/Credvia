'use client';

import { Loader2, UploadCloud } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import posthog from '@/lib/analytics/posthog-client';

export interface ResumeUploadCardProps {
  onUploaded: () => Promise<void> | void;
  onUploadStateChange?: (uploading: boolean) => void;
  title?: string;
  description?: string;
  actionLabel?: string;
  compact?: boolean;
}

function logUploadDebug(message: string, details: Record<string, unknown>) {
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.info(message, details);
  }
}

export function ResumeUploadCard({
  onUploaded,
  onUploadStateChange,
  title,
  description,
  actionLabel,
  compact = false,
}: ResumeUploadCardProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const uploadInFlightRef = useRef(false);
  const lastSelectedFileRef = useRef<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleFile(file: File) {
    const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;

    if (uploading || uploadInFlightRef.current) {
      logUploadDebug('[resume-upload] blocked duplicate submit while upload is in flight', {
        fingerprint,
      });
      return;
    }

    if (lastSelectedFileRef.current === fingerprint) {
      logUploadDebug('[resume-upload] blocked duplicate file selection', {
        fingerprint,
      });
      return;
    }

    uploadInFlightRef.current = true;
    lastSelectedFileRef.current = fingerprint;
    setUploading(true);
    onUploadStateChange?.(true);
    setError(null);
    setSuccess(null);
    posthog.capture('resume_upload_started', {
      mimeType: file.type,
      fileExtension: file.name.split('.').pop()?.toLowerCase() ?? null,
    });

    try {
      const formData = new FormData();
      formData.set('resume', file);

      const response = await fetch('/api/v1/resumes', {
        method: 'POST',
        body: formData,
      });

      const payload = (await response.json()) as {
        error?: { message?: string; code?: string; suggestedAction?: string };
      };

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Your session expired. Sign in again before uploading a resume.');
        }
        if (response.status === 429) {
          logUploadDebug('[resume-upload] upload rate limited', {
            fingerprint,
            code: payload.error?.code ?? null,
          });
          throw new Error('Too many upload attempts. Please wait a few seconds and try again.');
        }
        throw new Error(payload.error?.message ?? 'Could not upload your resume.');
      }

      await onUploaded();
      setSuccess('Resume uploaded. We started extraction automatically and will mark it Ready when parsing completes.');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Could not upload your resume.');
    } finally {
      uploadInFlightRef.current = false;
      lastSelectedFileRef.current = null;
      setUploading(false);
      onUploadStateChange?.(false);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  }

  const showHeader = Boolean(title || description);

  return (
    <section className={compact ? 'space-y-4' : 'space-y-5'}>
      {showHeader ? (
        <div className="space-y-1">
          {title ? <h2 className="text-lg font-semibold">{title}</h2> : null}
          {description ? <p className="text-sm text-text-secondary">{description}</p> : null}
        </div>
      ) : null}

      <div className="group rounded-3xl border border-dashed border-border-default bg-bg-surface/40 p-6 transition-colors hover:border-border-strong">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt,.rtf,.png,.jpg,.jpeg,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/rtf,application/rtf,application/x-rtf,image/png,image/jpeg"
          className="hidden"
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void handleFile(file);
            }
          }}
        />

        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border-subtle bg-bg-surface/80 shadow-sm">
              <UploadCloud className="h-6 w-6 text-text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-sm text-text-primary">Supported formats: PDF, DOCX, TXT, RTF, PNG, JPG</p>
              <p className="text-xs text-text-tertiary">Legacy DOC requires conversion to DOCX/PDF before upload</p>
              <p className="text-xs text-text-tertiary">Max file size: 10 MB</p>
            </div>
          </div>
          <Button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            {uploading ? 'Uploading...' : actionLabel ?? 'Choose resume'}
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
