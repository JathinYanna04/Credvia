'use client';

import { useEffect, useState } from 'react';
import type { CareerResumeDetail } from '@/components/career-match/types';
import { EducationEditor } from '@/components/resume/EducationEditor';
import { ProjectsEditor } from '@/components/resume/ProjectsEditor';
import { SkillsEditor } from '@/components/resume/SkillsEditor';
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

function serializeExperience(
  values: NonNullable<CareerResumeDetail['effectiveProfile']>['experience'] | undefined,
) {
  return (values ?? [])
    .map((entry) =>
      [
        entry.title ?? '',
        entry.company ?? '',
        entry.location ?? '',
        entry.start_date ?? '',
        entry.end_date ?? '',
        (entry.bullets ?? []).join('; '),
        (entry.technologies ?? []).join(', '),
      ].join(' | '),
    )
    .join('\n\n');
}

function parseExperience(value: string) {
  return value
    .split(/\n\s*\n/)
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => {
      const [title, company, location, start_date, end_date, bullets, technologies] = row
        .split('|')
        .map((part) => part.trim());
      return {
        title: title || null,
        company: company || null,
        location: location || null,
        start_date: start_date || null,
        end_date: end_date || null,
        currently_working: /present/i.test(end_date ?? ''),
        bullets: bullets
          ? bullets.split(';').map((entry) => entry.trim()).filter(Boolean)
          : [],
        technologies: technologies
          ? technologies.split(',').map((entry) => entry.trim()).filter(Boolean)
          : [],
      };
    });
}

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
  const effectiveProfile = detail.effectiveProfile;
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
    skills_languages: [] as string[],
    skills_frameworks: [] as string[],
    skills_tools: [] as string[],
    skills_databases: [] as string[],
    skills_cloud: [] as string[],
    skills_others: [] as string[],
    skills_spoken: [] as string[],
    experience: '',
    projects: effectiveProfile?.projects ?? [],
    education: effectiveProfile?.education ?? [],
    certifications: [] as string[],
    achievements: [] as string[],
    positions: [] as string[],
    volunteering: [] as string[],
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
      skills_languages: effectiveProfile?.skills.languages ?? [],
      skills_frameworks: effectiveProfile?.skills.frameworks ?? [],
      skills_tools: effectiveProfile?.skills.tools ?? [],
      skills_databases: effectiveProfile?.skills.databases ?? [],
      skills_cloud: effectiveProfile?.skills.cloud ?? [],
      skills_others: effectiveProfile?.skills.others ?? [],
      skills_spoken: effectiveProfile?.skills.spoken_languages ?? [],
      experience: serializeExperience(effectiveProfile?.experience),
      projects: effectiveProfile?.projects ?? [],
      education: effectiveProfile?.education ?? [],
      certifications: effectiveProfile?.additional.certifications ?? [],
      achievements: effectiveProfile?.additional.achievements ?? [],
      positions: effectiveProfile?.additional.positions_of_responsibility ?? [],
      volunteering: effectiveProfile?.additional.volunteering ?? [],
    });
    setError(null);
  }, [candidate, effectiveProfile, open]);

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
            skills: {
              languages: form.skills_languages,
              frameworks: form.skills_frameworks,
              tools: form.skills_tools,
              databases: form.skills_databases,
              cloud: form.skills_cloud,
              others: form.skills_others,
              spoken_languages: form.skills_spoken,
            },
            experience: parseExperience(form.experience),
            projects: form.projects,
            education: form.education,
            additional: {
              certifications: form.certifications,
              achievements: form.achievements,
              positions_of_responsibility: form.positions,
              volunteering: form.volunteering,
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

        <div className="grid gap-4 md:grid-cols-2">
          <SkillsEditor title="Languages" values={form.skills_languages} onChange={(values) => setForm((current) => ({ ...current, skills_languages: values }))} />
          <SkillsEditor title="Frameworks" values={form.skills_frameworks} onChange={(values) => setForm((current) => ({ ...current, skills_frameworks: values }))} />
          <SkillsEditor title="Tools" values={form.skills_tools} onChange={(values) => setForm((current) => ({ ...current, skills_tools: values }))} />
          <SkillsEditor title="Databases" values={form.skills_databases} onChange={(values) => setForm((current) => ({ ...current, skills_databases: values }))} />
          <SkillsEditor title="Cloud and platforms" values={form.skills_cloud} onChange={(values) => setForm((current) => ({ ...current, skills_cloud: values }))} />
          <SkillsEditor title="Other strengths" values={form.skills_others} onChange={(values) => setForm((current) => ({ ...current, skills_others: values }))} />
          <SkillsEditor title="Spoken languages" values={form.skills_spoken} onChange={(values) => setForm((current) => ({ ...current, skills_spoken: values }))} />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-text-primary" htmlFor="experience">
            Experience entries
          </label>
          <Textarea
            id="experience"
            value={form.experience}
            onChange={(event) => setForm((current) => ({ ...current, experience: event.target.value }))}
            className="min-h-[180px]"
          />
          <p className="text-xs text-text-tertiary">
            Format: `Title | Company | Location | Start | End | Bullet 1; Bullet 2 | Tech 1, Tech 2`
          </p>
        </div>

        <div className="space-y-3">
          <label className="text-sm font-medium text-text-primary">Projects</label>
          <ProjectsEditor projects={form.projects} onChange={(projects) => setForm((current) => ({ ...current, projects }))} />
        </div>

        <div className="space-y-3">
          <label className="text-sm font-medium text-text-primary">Education</label>
          <EducationEditor education={form.education} onChange={(education) => setForm((current) => ({ ...current, education }))} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <SkillsEditor title="Certifications" values={form.certifications} onChange={(values) => setForm((current) => ({ ...current, certifications: values }))} />
          <SkillsEditor title="Achievements" values={form.achievements} onChange={(values) => setForm((current) => ({ ...current, achievements: values }))} />
          <SkillsEditor title="Positions of responsibility" values={form.positions} onChange={(values) => setForm((current) => ({ ...current, positions: values }))} />
          <SkillsEditor title="Volunteering" values={form.volunteering} onChange={(values) => setForm((current) => ({ ...current, volunteering: values }))} />
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
