'use client';

import { useState } from 'react';
import { Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const REPORT_REASONS = [
  { value: 'spam', label: 'Spam or promotion' },
  { value: 'harassment', label: 'Harassment or abuse' },
  { value: 'misinformation', label: 'Misleading claims' },
  { value: 'low_quality', label: 'Low quality / vague idea' },
  { value: 'plagiarism', label: 'Plagiarism or copied idea' },
  { value: 'fraud', label: 'Fraud or dishonest claims' },
  { value: 'off_topic', label: 'Off topic' },
  { value: 'other', label: 'Other' },
] as const;

export interface ReportIdeaButtonProps {
  postId: string;
}

export function ReportIdeaButton({ postId }: ReportIdeaButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REPORT_REASONS)[number]['value']>('spam');
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submitReport = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch('/api/v1/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_type: 'post',
          target_id: postId,
          reason_code: reason,
          details: details || undefined,
        }),
      });

      const payload = (await response.json()) as {
        error?: { message?: string };
      };

      if (!response.ok) {
        setError(payload.error?.message ?? 'Could not submit this report.');
        return;
      }

      setOpen(false);
      setDetails('');
      setMessage('Report submitted. A moderator can review it now.');
    } catch {
      setError('Could not submit this report.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        className="w-full justify-center sm:w-auto"
        onClick={() => {
          setOpen((current) => !current);
          setError(null);
          setMessage(null);
        }}
      >
        <Flag className="h-4 w-4" />
        Report
      </Button>

      {message ? <p className="text-sm text-success">{message}</p> : null}

      {open ? (
        <div className="rounded-2xl border border-border-subtle bg-bg-base p-4">
          <div className="grid gap-3">
            <label className="grid gap-2 text-sm text-text-secondary">
              <span>Reason</span>
              <select
                value={reason}
                onChange={(event) =>
                  setReason(event.target.value as (typeof REPORT_REASONS)[number]['value'])
                }
                className="flex h-11 w-full rounded-xl border border-border-default bg-bg-surface px-4 text-sm text-text-primary"
              >
                {REPORT_REASONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm text-text-secondary">
              <span>Details</span>
              <Textarea
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                placeholder="Add context that helps moderators review this startup idea."
                className="min-h-[110px]"
              />
            </label>

            {error ? <p className="text-sm text-danger">{error}</p> : null}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void submitReport()} disabled={loading}>
                {loading ? 'Submitting...' : 'Submit report'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
