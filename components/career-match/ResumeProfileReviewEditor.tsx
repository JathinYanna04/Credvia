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

function toLineList(value: string) {
  return value
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function serializeLineList(values: string[] | undefined) {
  return (values ?? []).join('\n');
}

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

function serializeProjects(
  values: NonNullable<CareerResumeDetail['effectiveProfile']>['projects'] | undefined,
) {
  return (values ?? [])
    .map((entry) =>
      [
        entry.name ?? '',
        entry.description ?? '',
        (entry.bullets ?? []).join('; '),
        (entry.technologies ?? []).join(', '),
        (entry.links ?? []).join(', '),
      ].join(' | '),
    )
    .join('\n\n');
}

function parseProjects(value: string) {
  return value
    .split(/\n\s*\n/)
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => {
      const [name, description, bullets, technologies, links] = row
        .split('|')
        .map((part) => part.trim());
      return {
        name: name || null,
        description: description || null,
        bullets: bullets ? bullets.split(';').map((entry) => entry.trim()).filter(Boolean) : [],
        technologies: technologies
          ? technologies.split(',').map((entry) => entry.trim()).filter(Boolean)
          : [],
        links: links ? links.split(',').map((entry) => entry.trim()).filter(Boolean) : [],
      };
    });
}

function serializeEducation(
  values: NonNullable<CareerResumeDetail['effectiveProfile']>['education'] | undefined,
) {
  return (values ?? [])
    .map((entry) =>
      [
        entry.degree ?? '',
        entry.institution ?? '',
        entry.field_of_study ?? '',
        entry.start_date ?? '',
        entry.end_date ?? '',
        entry.grade ?? '',
        entry.location ?? '',
        entry.description ?? '',
      ].join(' | '),
    )
    .join('\n\n');
}

function parseEducation(value: string) {
  return value
    .split(/\n\s*\n/)
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => {
      const [degree, institution, field_of_study, start_date, end_date, grade, location, description] = row
        .split('|')
        .map((part) => part.trim());
      return {
        degree: degree || null,
        institution: institution || null,
        field_of_study: field_of_study || null,
        start_date: start_date || null,
        end_date: end_date || null,
        grade: grade || null,
        location: location || null,
        description: description || null,
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
    skills_languages: '',
    skills_frameworks: '',
    skills_tools: '',
    skills_databases: '',
    skills_cloud: '',
    skills_others: '',
    skills_spoken: '',
    experience: '',
    projects: '',
    education: '',
    certifications: '',
    achievements: '',
    positions: '',
    volunteering: '',
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
      skills_languages: serializeLineList(effectiveProfile?.skills.languages),
      skills_frameworks: serializeLineList(effectiveProfile?.skills.frameworks),
      skills_tools: serializeLineList(effectiveProfile?.skills.tools),
      skills_databases: serializeLineList(effectiveProfile?.skills.databases),
      skills_cloud: serializeLineList(effectiveProfile?.skills.cloud),
      skills_others: serializeLineList(effectiveProfile?.skills.others),
      skills_spoken: serializeLineList(effectiveProfile?.skills.spoken_languages),
      experience: serializeExperience(effectiveProfile?.experience),
      projects: serializeProjects(effectiveProfile?.projects),
      education: serializeEducation(effectiveProfile?.education),
      certifications: serializeLineList(effectiveProfile?.additional.certifications),
      achievements: serializeLineList(effectiveProfile?.additional.achievements),
      positions: serializeLineList(effectiveProfile?.additional.positions_of_responsibility),
      volunteering: serializeLineList(effectiveProfile?.additional.volunteering),
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
              languages: toLineList(form.skills_languages),
              frameworks: toLineList(form.skills_frameworks),
              tools: toLineList(form.skills_tools),
              databases: toLineList(form.skills_databases),
              cloud: toLineList(form.skills_cloud),
              others: toLineList(form.skills_others),
              spoken_languages: toLineList(form.skills_spoken),
            },
            experience: parseExperience(form.experience),
            projects: parseProjects(form.projects),
            education: parseEducation(form.education),
            additional: {
              certifications: toLineList(form.certifications),
              achievements: toLineList(form.achievements),
              positions_of_responsibility: toLineList(form.positions),
              volunteering: toLineList(form.volunteering),
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
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="skills_languages">
              Languages
            </label>
            <Textarea id="skills_languages" value={form.skills_languages} onChange={(event) => setForm((current) => ({ ...current, skills_languages: event.target.value }))} className="min-h-[120px]" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="skills_frameworks">
              Frameworks
            </label>
            <Textarea id="skills_frameworks" value={form.skills_frameworks} onChange={(event) => setForm((current) => ({ ...current, skills_frameworks: event.target.value }))} className="min-h-[120px]" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="skills_tools">
              Tools
            </label>
            <Textarea id="skills_tools" value={form.skills_tools} onChange={(event) => setForm((current) => ({ ...current, skills_tools: event.target.value }))} className="min-h-[120px]" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="skills_databases">
              Databases
            </label>
            <Textarea id="skills_databases" value={form.skills_databases} onChange={(event) => setForm((current) => ({ ...current, skills_databases: event.target.value }))} className="min-h-[120px]" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="skills_cloud">
              Cloud and platforms
            </label>
            <Textarea id="skills_cloud" value={form.skills_cloud} onChange={(event) => setForm((current) => ({ ...current, skills_cloud: event.target.value }))} className="min-h-[120px]" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="skills_others">
              Other strengths
            </label>
            <Textarea id="skills_others" value={form.skills_others} onChange={(event) => setForm((current) => ({ ...current, skills_others: event.target.value }))} className="min-h-[120px]" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="skills_spoken">
              Spoken languages
            </label>
            <Textarea id="skills_spoken" value={form.skills_spoken} onChange={(event) => setForm((current) => ({ ...current, skills_spoken: event.target.value }))} className="min-h-[120px]" />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="experience">
              Experience entries
            </label>
            <Textarea id="experience" value={form.experience} onChange={(event) => setForm((current) => ({ ...current, experience: event.target.value }))} className="min-h-[180px]" />
            <p className="text-xs text-text-tertiary">Format: `Title | Company | Location | Start | End | Bullet 1; Bullet 2 | Tech 1, Tech 2`</p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="projects">
              Project entries
            </label>
            <Textarea id="projects" value={form.projects} onChange={(event) => setForm((current) => ({ ...current, projects: event.target.value }))} className="min-h-[180px]" />
            <p className="text-xs text-text-tertiary">Format: `Name | Description | Bullet 1; Bullet 2 | Tech 1, Tech 2 | Link 1, Link 2`</p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-text-primary" htmlFor="education">
            Education entries
          </label>
          <Textarea id="education" value={form.education} onChange={(event) => setForm((current) => ({ ...current, education: event.target.value }))} className="min-h-[160px]" />
          <p className="text-xs text-text-tertiary">Format: `Degree | Institution | Field | Start | End | Grade | Location | Description`</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="certifications">
              Certifications
            </label>
            <Textarea id="certifications" value={form.certifications} onChange={(event) => setForm((current) => ({ ...current, certifications: event.target.value }))} className="min-h-[120px]" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="achievements">
              Achievements
            </label>
            <Textarea id="achievements" value={form.achievements} onChange={(event) => setForm((current) => ({ ...current, achievements: event.target.value }))} className="min-h-[120px]" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="positions">
              Positions of responsibility
            </label>
            <Textarea id="positions" value={form.positions} onChange={(event) => setForm((current) => ({ ...current, positions: event.target.value }))} className="min-h-[120px]" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="volunteering">
              Volunteering
            </label>
            <Textarea id="volunteering" value={form.volunteering} onChange={(event) => setForm((current) => ({ ...current, volunteering: event.target.value }))} className="min-h-[120px]" />
          </div>
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
