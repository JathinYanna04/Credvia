import { existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

if (existsSync('.next/types')) {
  rmSync('.next/types', { recursive: true, force: true });
}

const result = spawnSync('npx', ['tsc', '--noEmit'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
