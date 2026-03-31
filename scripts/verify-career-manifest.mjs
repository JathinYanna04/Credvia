import fs from 'node:fs';

const manifestPath = '.next/app-path-routes-manifest.json';

if (!fs.existsSync(manifestPath)) {
  console.error(`[verify-career-manifest] missing manifest: ${manifestPath}`);
  process.exit(1);
}

const appPathRoutesManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const routeEntries = Object.entries(appPathRoutesManifest);

const requiredRoutes = ['/career', '/career/jobs', '/career/jobs/[jobId]'];
const resolvedRoutes = Object.fromEntries(
  requiredRoutes.map((route) => [
    route,
    routeEntries.find(([, pathname]) => pathname === route)?.[0] ?? null,
  ]),
);

const missingRoutes = requiredRoutes.filter((route) => !resolvedRoutes[route]);

if (missingRoutes.length > 0) {
  console.error(`[verify-career-manifest] missing routes: ${missingRoutes.join(', ')}`);
  process.exit(1);
}

console.log('[verify-career-manifest] verified routes:');
for (const route of requiredRoutes) {
  console.log(`- ${route} -> ${resolvedRoutes[route]}`);
}
