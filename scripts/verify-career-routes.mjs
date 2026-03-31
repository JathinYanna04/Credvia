import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function getAvailablePort() {
  if (process.env.CAREER_VERIFY_PORT) {
    return process.env.CAREER_VERIFY_PORT;
  }

  return await new Promise((resolve, reject) => {
    const server = createServer();

    server.listen(0, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Could not resolve a free port for career route verification.'));
        return;
      }

      const port = String(address.port);
      server.close(() => resolve(port));
    });

    server.on('error', reject);
  });
}

const checks = [
  {
    path: '/career',
    assert: (response) => {
      if (response.status !== 307 || response.headers.get('location') !== '/login') {
        throw new Error(`Expected /career to redirect to /login, got ${response.status} ${response.headers.get('location') ?? ''}`);
      }
    },
  },
  {
    path: '/career?_rsc=test',
    assert: (response) => {
      if (response.status === 404) {
        throw new Error('Expected /career?_rsc=test to avoid 404.');
      }
      if (response.status !== 307 || response.headers.get('location') !== '/login') {
        throw new Error(`Expected /career?_rsc=test to redirect to /login, got ${response.status} ${response.headers.get('location') ?? ''}`);
      }
    },
  },
  {
    path: '/career/jobs',
    assert: (response) => {
      if (response.status !== 200) {
        throw new Error(`Expected /career/jobs to return 200, got ${response.status}`);
      }
    },
  },
  {
    path: '/jobs',
    assert: (response) => {
      if (response.status !== 307 || response.headers.get('location') !== '/career/jobs') {
        throw new Error(`Expected /jobs to redirect to /career/jobs, got ${response.status} ${response.headers.get('location') ?? ''}`);
      }
    },
  },
  {
    path: '/careers',
    assert: (response) => {
      if (response.status !== 307 || response.headers.get('location') !== '/career') {
        throw new Error(`Expected /careers to redirect to /career, got ${response.status} ${response.headers.get('location') ?? ''}`);
      }
    },
  },
  {
    path: '/carreers',
    assert: (response) => {
      if (response.status !== 307 || response.headers.get('location') !== '/career') {
        throw new Error(`Expected /carreers to redirect to /career, got ${response.status} ${response.headers.get('location') ?? ''}`);
      }
    },
  },
];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServerReady(childProcess, port) {
  let output = '';

  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for next start on port ${port}.\n${output}`));
    }, 60000);

    function cleanup() {
      clearTimeout(timeout);
      childProcess.stdout?.off('data', onData);
      childProcess.stderr?.off('data', onData);
      childProcess.off('exit', onExit);
    }

    function onData(chunk) {
      output += chunk.toString();

      if (output.includes('Ready in') || output.includes('started server on')) {
        cleanup();
        resolve(output);
      }
    }

    function onExit(code) {
      cleanup();
      reject(new Error(`next start exited early with code ${code}.\n${output}`));
    }

    childProcess.stdout?.on('data', onData);
    childProcess.stderr?.on('data', onData);
    childProcess.on('exit', onExit);
  });
}

async function stopProcessTree(childProcess) {
  if (!childProcess.pid) {
    return;
  }

  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(childProcess.pid), '/t', '/f'], {
      stdio: 'ignore',
    });
    await new Promise((resolve) => killer.on('exit', resolve));
    return;
  }

  childProcess.kill('SIGTERM');
  await wait(500);

  if (!childProcess.killed) {
    childProcess.kill('SIGKILL');
  }
}

async function main() {
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const nextBinPath = join(__dirname, '..', 'node_modules', 'next', 'dist', 'bin', 'next');
  const childProcess = spawn(process.execPath, [nextBinPath, 'start', '-p', port], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  try {
    await waitForServerReady(childProcess, port);
    await wait(1000);

    for (const check of checks) {
      console.log(`[verify-career-routes] checking ${check.path}`);
      const response = await fetch(`${baseUrl}${check.path}`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(45000),
        headers: {
          'user-agent': 'CredviaCareerRouteVerifier/1.0',
        },
      });

      check.assert(response);
      console.log(`[verify-career-routes] ${check.path} OK -> ${response.status} ${response.headers.get('location') ?? ''}`.trim());
    }
  } finally {
    await stopProcessTree(childProcess);
  }
}

main().catch((error) => {
  console.error('[verify-career-routes] failed');
  console.error(error);
  process.exitCode = 1;
});
