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
});
