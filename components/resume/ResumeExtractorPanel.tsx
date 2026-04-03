'use client';

import { useMemo, useState } from 'react';
import { extractResume } from '@/lib/resume-extractor/client';
import type { ExtractResponse } from '@/lib/resume-extractor/types';
import { ChevronDown, Loader2, UploadCloud } from 'lucide-react';

const MAX_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'txt', 'rtf', 'png', 'jpg', 'jpeg'];

export function ResumeExtractorPanel() {
  const [result, setResult] = useState<ExtractResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const skills = useMemo(() => result?.sections.skills ?? null, [result]);
  const education = useMemo(() => result?.sections.education ?? [], [result]);
  const experience = useMemo(() => result?.sections.experience ?? [], [result]);
  const projects = useMemo(() => result?.sections.projects ?? [], [result]);

  async function handleFile(file: File) {
    setError(null);
    setLoading(true);
    try {
      const response = await extractResume(file);
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extraction failed.');
    } finally {
      setLoading(false);
    }
  }

  function validateFile(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `Unsupported file type. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`;
    }
    if (file.size > MAX_SIZE_BYTES) {
      return 'File exceeds 10 MB.';
    }
    return null;
  }

  return (
    <section className="surface-panel space-y-4 p-5">
      <div className="flex items-center gap-3">
        <UploadCloud className="h-5 w-5 text-accent" />
        <h2 className="text-lg font-semibold">Resume Extractor (Phase 1)</h2>
      </div>

      <input
        type="file"
        className="block w-full rounded-xl border border-border-subtle bg-bg-surface px-3 py-2 text-sm text-text-secondary"
        accept={ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(',')}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const validationError = validateFile(file);
          if (validationError) {
            setError(validationError);
            return;
          }
          void handleFile(file);
        }}
      />

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          Extracting resume...
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <div className="rounded-xl border border-border-subtle bg-bg-surface p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Candidate</div>
              <div className="mt-2 text-base font-semibold text-text-primary">
                {result.candidate.full_name ?? 'Name not detected'}
              </div>
              <div className="mt-1 text-xs text-text-tertiary">
                {result.candidate.email ?? 'Email not detected'}
              </div>
              <div className="mt-1 text-xs text-text-tertiary">
                {result.candidate.phone ?? 'Phone not detected'}
              </div>
              <div className="mt-2 text-sm text-text-secondary">
                {result.candidate.summary ?? 'Summary not detected yet.'}
              </div>
              <div className="mt-3 text-xs text-text-tertiary">
                {result.candidate.location ?? 'Location not detected'}
              </div>
            </div>

            <div className="rounded-xl border border-border-subtle bg-bg-surface p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Quality</div>
              <div className="mt-3 text-sm text-text-secondary">
                Confidence: <span className="text-text-primary">{Math.round(result.confidence.overall * 100)}%</span>
              </div>
              <div className="mt-2 text-sm text-text-secondary">
                Extraction score: <span className="text-text-primary">{Math.round(result.ats.extraction_quality_score)}</span>
              </div>
              <div className="mt-2 text-xs text-text-tertiary">
                Method: {result.diagnostics.method_used}
              </div>
              {result.diagnostics.final_source ? (
                <div className="mt-2 inline-flex items-center rounded-full border border-border-subtle px-2 py-0.5 text-[11px] uppercase tracking-[0.12em] text-text-tertiary">
                  {result.diagnostics.final_source === 'llm'
                    ? 'LLM'
                    : result.diagnostics.final_source === 'merged'
                    ? 'Merged'
                    : 'Fallback'}
                </div>
              ) : null}
              <div className="mt-2 text-xs text-text-tertiary">
                Contamination score: {Math.round(result.diagnostics.contamination_score)}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border-subtle bg-bg-surface p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Skills</div>
            {skills ? (
              <div className="mt-3 space-y-3 text-xs text-text-primary">
                {(
                  [
                    ['Languages', skills.languages],
                    ['Frameworks', skills.frameworks],
                    ['Tools', skills.tools],
                    ['Databases', skills.databases],
                    ['Cloud', skills.cloud],
                    ['Other', skills.others],
                  ] as const
                ).map(([label, list]) => (
                  <div key={label}>
                    <div className="text-[11px] uppercase tracking-[0.12em] text-text-tertiary">{label}</div>
                    {list.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {list.map((skill) => (
                          <span key={`${label}-${skill}`} className="rounded-full border border-border-subtle px-3 py-1">
                            {skill}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 text-sm text-text-secondary">No {label.toLowerCase()} detected.</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 text-sm text-text-secondary">No skills detected yet.</div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border-subtle bg-bg-surface p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Education</div>
              {education.length > 0 ? (
                <div className="mt-3 space-y-3 text-sm text-text-secondary">
                  {education.map((item, index) => (
                    <div key={`edu-${index}`} className="rounded-lg border border-border-subtle p-3">
                      <div className="text-text-primary">{item.institution ?? item.degree ?? 'Education entry'}</div>
                      <div className="mt-1 text-xs text-text-tertiary">
                        {item.degree ?? 'Degree not detected'} {item.end_date ? `• ${item.end_date}` : ''}
                      </div>
                      {item.description ? (
                        <div className="mt-2 text-xs text-text-secondary">{item.description}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 text-sm text-text-secondary">No education entries detected.</div>
              )}
            </div>

            <div className="rounded-xl border border-border-subtle bg-bg-surface p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Experience</div>
              {experience.length > 0 ? (
                <div className="mt-3 space-y-3 text-sm text-text-secondary">
                  {experience.map((item, index) => (
                    <div key={`exp-${index}`} className="rounded-lg border border-border-subtle p-3">
                      <div className="text-text-primary">{item.title ?? item.company ?? 'Experience entry'}</div>
                      <div className="mt-1 text-xs text-text-tertiary">
                        {item.company ?? 'Company not detected'}
                      </div>
                      <div className="mt-1 text-xs text-text-tertiary">
                        {item.start_date ?? 'Start unknown'} {item.end_date ? `- ${item.end_date}` : ''}
                      </div>
                      {item.bullets.length > 0 ? (
                        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-text-secondary">
                          {item.bullets.slice(0, 4).map((bullet, idx) => (
                            <li key={`exp-${index}-bullet-${idx}`}>{bullet}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 text-sm text-text-secondary">No experience entries detected.</div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border-subtle bg-bg-surface p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Projects</div>
            {projects.length > 0 ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {projects.map((item, index) => (
                  <div key={`proj-${index}`} className="rounded-lg border border-border-subtle p-3 text-sm text-text-secondary">
                    <div className="text-text-primary">{item.name ?? 'Project'}</div>
                    {item.description ? (
                      <div className="mt-2 text-xs text-text-secondary">{item.description}</div>
                    ) : null}
                    {item.bullets.length > 0 ? (
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-text-secondary">
                        {item.bullets.slice(0, 3).map((bullet, idx) => (
                          <li key={`proj-${index}-bullet-${idx}`}>{bullet}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 text-sm text-text-secondary">No project entries detected.</div>
            )}
          </div>

          <div className="rounded-xl border border-border-subtle bg-bg-surface p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-text-tertiary">Warnings</div>
            {result.status.warnings.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm text-warning">
                {result.status.warnings.map((warning, index) => (
                  <li key={`${warning}-${index}`}>{warning}</li>
                ))}
              </ul>
            ) : (
              <div className="mt-2 text-sm text-text-secondary">No warnings.</div>
            )}
          </div>

          <details className="rounded-xl border border-border-subtle bg-bg-surface p-4">
            <summary className="flex cursor-pointer items-center gap-2 text-xs uppercase tracking-[0.16em] text-text-tertiary">
              <ChevronDown className="h-3.5 w-3.5" />
              Raw preview
            </summary>
            <pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap text-xs text-text-secondary">
              {result.raw.cleaned_text.slice(0, 1000)}
              {result.raw.cleaned_text.length > 1000 ? '...' : ''}
            </pre>
          </details>
        </div>
      ) : null}
    </section>
  );
}
