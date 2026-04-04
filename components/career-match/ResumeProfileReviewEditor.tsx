'use client';

import { useEffect, useState } from 'react';
import type { CareerResumeDetail } from '@/components/career-match/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export interface ResumeProfileReviewEditorProps {
  detail: CareerResumeDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void> | void;
}

export function ResumeProfileReviewEditor({
  detail,
  open,
  onOpenChange,
  onSaved,
}: ResumeProfileReviewEditorProps) {
  const candidate = detail.effectiveProfile?.candidate ?? null;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: '',
    current_title: '',
    email: '',
    phone: '',
    location: '',
    linkedin: '',
    github: '',
    portfolio: '',
    summary: '',
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      full_name: candidate?.full_name ?? '',
      current_title: candidate?.current_title ?? '',
      email: candidate?.email ?? '',
      phone: candidate?.phone ?? '',
      location: candidate?.location ?? '',
      linkedin: candidate?.linkedin ?? '',
      github: candidate?.github ?? '',
      portfolio: candidate?.portfolio ?? '',
      summary: candidate?.summary ?? '',
    });
    setError(null);
  }, [candidate, open]);

  async function handleSave() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/resumes/${detail.resume.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manualOverrides: {
            candidate: {
              full_name: form.full_name || null,
              current_title: form.current_title || null,
              email: form.email || null,
              phone: form.phone || null,
              location: form.location || null,
              linkedin: form.linkedin || null,
              github: form.github || null,
              portfolio: form.portfolio || null,
              summary: form.summary || null,
            },
          },
        }),
      });

      const payload = (await response.json()) as {
        error?: { message?: string };
      };

      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Could not save manual resume review changes.');
      }

      await onSaved();
      onOpenChange(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Could not save manual resume review changes.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Review parsed profile</DialogTitle>
          <DialogDescription>
            Manual corrections override parsed resume values in the review workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="full_name">
              Full name
            </label>
            <Input id="full_name" value={form.full_name} onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="current_title">
              Current title
            </label>
            <Input id="current_title" value={form.current_title} onChange={(event) => setForm((current) => ({ ...current, current_title: event.target.value }))} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="email">
              Email
            </label>
            <Input id="email" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="phone">
              Phone
            </label>
            <Input id="phone" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="location">
              Location
            </label>
            <Input id="location" value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="linkedin">
              LinkedIn
            </label>
            <Input id="linkedin" value={form.linkedin} onChange={(event) => setForm((current) => ({ ...current, linkedin: event.target.value }))} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="github">
              GitHub
            </label>
            <Input id="github" value={form.github} onChange={(event) => setForm((current) => ({ ...current, github: event.target.value }))} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="portfolio">
              Portfolio
            </label>
            <Input id="portfolio" value={form.portfolio} onChange={(event) => setForm((current) => ({ ...current, portfolio: event.target.value }))} />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-text-primary" htmlFor="summary">
            Summary
          </label>
          <Textarea
            id="summary"
            value={form.summary}
            onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))}
            className="min-h-[160px]"
          />
        </div>

        {error ? <div className="text-sm text-danger">{error}</div> : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={submitting}>
            {submitting ? 'Saving...' : 'Save corrections'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
