const MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const expectedBuildSha = process.env.EXPECTED_BUILD_SHA ?? null;
const rawBaseUrl = process.argv[2] ?? process.env.CAREER_PROBE_BASE_URL;

if (!rawBaseUrl) {
  console.error('Usage: node scripts/probe-production-career-routes.mjs <base-url>');
  process.exit(1);
}

const baseUrl = rawBaseUrl.replace(/\/+$/, '');
const probeValue = Date.now().toString();

const checks = [
  { path: '/career', expectedStatus: 307, expectedLocationPrefix: '/login' },
  { path: '/career/jobs', expectedStatus: 200 },
  { path: '/jobs', expectedStatus: 307, expectedLocationPrefix: '/career/jobs' },
  { path: '/careers', expectedStatus: 307, expectedLocationPrefix: '/career' },
  { path: '/carreers', expectedStatus: 307, expectedLocationPrefix: '/career' },
];

function formatHeaders(headers) {
  const names = [
    'location',
    'x-vercel-id',
    'x-vercel-cache',
    'x-credvia-middleware',
    'x-credvia-build-sha',
    'x-credvia-route-canonical',
    'x-credvia-auth-decision',
  ];

  return names
    .map((name) => `${name}=${headers.get(name) ?? ''}`)
    .join(' ');
}

async function runCheck(check) {
  const separator = check.path.includes('?') ? '&' : '?';
  const targetUrl = `${baseUrl}${check.path}${separator}__probe=${probeValue}`;
  const response = await fetch(targetUrl, {
    method: 'GET',
    redirect: 'manual',
    signal: AbortSignal.timeout(45000),
    headers: {
      'user-agent': MOBILE_USER_AGENT,
      'cache-control': 'no-cache',
      pragma: 'no-cache',
    },
  });

  console.log(`[probe-production-career-routes] ${check.path} -> ${response.status} ${formatHeaders(response.headers)}`);

  if (response.status !== check.expectedStatus) {
    throw new Error(`Expected ${check.path} to return ${check.expectedStatus}, got ${response.status}`);
  }

  const location = response.headers.get('location') ?? '';

  if (check.expectedLocationPrefix && !location.startsWith(check.expectedLocationPrefix)) {
    throw new Error(
      `Expected ${check.path} to redirect to ${check.expectedLocationPrefix}, got ${location || '<none>'}`,
    );
  }

  const middlewareHeader = response.headers.get('x-credvia-middleware');
  if (!middlewareHeader) {
    throw new Error(`Expected ${check.path} to include x-credvia-middleware header.`);
  }

  if (expectedBuildSha) {
    const actualBuildSha = response.headers.get('x-credvia-build-sha');
    if (actualBuildSha !== expectedBuildSha) {
      throw new Error(
        `Expected build sha ${expectedBuildSha} for ${check.path}, got ${actualBuildSha ?? '<none>'}`,
      );
    }
  }
}

async function main() {
  for (const check of checks) {
    await runCheck(check);
  }
}

main().catch((error) => {
  console.error('[probe-production-career-routes] failed');
  console.error(error);
  process.exitCode = 1;
});
