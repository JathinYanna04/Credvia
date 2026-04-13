import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

const port = Number.parseInt(process.env.PORT ?? '3000', 10);

let workerStarted = false;
let workerExited = false;
let lastExitCode = null;
let workerProcess = null;

function healthPayload() {
  return {
    ok: workerStarted && !workerExited,
    workerStarted,
    workerExited,
    lastExitCode,
    timestamp: new Date().toISOString(),
  };
}

function startWorker() {
  if (workerStarted) {
    return;
  }

  workerStarted = true;

  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  workerProcess = spawn(npmCommand, ['run', 'ai:worker'], {
    stdio: 'inherit',
    env: process.env,
  });

  workerProcess.on('exit', (code) => {
    workerExited = true;
    lastExitCode = typeof code === 'number' ? code : null;

    console.error(
      JSON.stringify({
        scope: 'ai-worker-web-exit',
        message: 'ai:worker process exited',
        exitCode: lastExitCode,
        timestamp: new Date().toISOString(),
      }),
    );

    process.exit(lastExitCode ?? 1);
  });
}

const server = createServer((req, res) => {
  if (req.url === '/health') {
    const payload = healthPayload();
    const statusCode = payload.ok ? 200 : 503;

    res.writeHead(statusCode, {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    });
    res.end(JSON.stringify(payload));
    return;
  }

  res.writeHead(200, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end('Credvia AI worker web wrapper is running.');
});

function shutdown(signal) {
  console.info(
    JSON.stringify({
      scope: 'ai-worker-web-shutdown',
      signal,
      timestamp: new Date().toISOString(),
    }),
  );

  if (workerProcess && !workerExited) {
    workerProcess.kill('SIGTERM');
  }

  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

server.listen(port, '0.0.0.0', () => {
  console.info(
    JSON.stringify({
      scope: 'ai-worker-web-startup',
      message: 'Worker health server listening',
      port,
      healthPath: '/health',
      timestamp: new Date().toISOString(),
    }),
  );

  startWorker();
});