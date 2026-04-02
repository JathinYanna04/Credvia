import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('resume lifecycle migration contract', () => {
  it('contains safe parse_status constraint replacement and full lifecycle states', () => {
    const migrationFiles = [
      '014_resume_lifecycle_hardening.sql',
      '015_resume_lifecycle_hotfix.sql',
    ];

    const expectedStatuses = [
      'UPLOADED',
      'EXTRACTING',
      'EXTRACTED',
      'EXTRACTED_WITH_WARNINGS',
      'PARSED',
      'READY',
      'ANALYZING',
      'ANALYZED',
      'EXTRACTION_FAILED',
      'PARSING_FAILED',
      'ANALYSIS_FAILED',
    ];

    for (const migrationFile of migrationFiles) {
      const migrationPath = join(
        process.cwd(),
        'supabase',
        'migrations',
        migrationFile,
      );
      const sql = readFileSync(migrationPath, 'utf8');

      expect(sql).toContain('FOR resumes_constraint_name IN');
      expect(sql).toContain('DROP CONSTRAINT %I');
      expect(sql).toContain('ADD CONSTRAINT resumes_parse_status_check');
      expect(sql).toContain('idx_resumes_single_active_per_user');
      expect(sql).toContain("'application/x-rtf'");

      for (const status of expectedStatuses) {
        expect(sql).toContain(`'${status}'`);
      }
    }
  });

  it('hardens resume_analysis_runs to owner-read-only for authenticated users', () => {
    const migrationPath = join(
      process.cwd(),
      'supabase',
      'migrations',
      '016_resume_analysis_runs_rls_hardening.sql',
    );
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('ALTER TABLE public.resume_analysis_runs ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('DROP POLICY IF EXISTS %I ON public.resume_analysis_runs');
    expect(sql).toContain('CREATE POLICY "resume_analysis_runs: owner read"');
    expect(sql).toContain('FOR SELECT');
    expect(sql).toContain('resumes.user_id = auth.uid()');
    expect(sql).not.toContain('FOR INSERT');
    expect(sql).not.toContain('FOR UPDATE');
    expect(sql).not.toContain('FOR DELETE');
  });
});
