import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('startup idea ownership policy migration', () => {
  it('requires founder ownership and matching post author on insert and update', () => {
    const migrationPath = path.join(
      process.cwd(),
      'supabase',
      'migrations',
      '010_startup_ideas.sql',
    );
    const sql = fs.readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('CREATE POLICY "startup_ideas: founder insert"');
    expect(sql).toContain('CREATE POLICY "startup_ideas: founder update"');
    expect(sql).toContain('auth.uid() = founder_user_id');
    expect(sql).toContain('posts.author_id = auth.uid()');
    expect(sql).toContain('WITH CHECK');
  });
});
