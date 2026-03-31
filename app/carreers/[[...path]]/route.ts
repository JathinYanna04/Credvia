import { NextResponse } from 'next/server';

const BUILD_SHA = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'unknown';

function buildRedirect(request: Request, params: { path?: string[] }) {
  const url = new URL(request.url);
  const suffix = params.path?.length ? `/${params.path.join('/')}` : '';
  url.pathname = `/career${suffix}`;

  const response = NextResponse.redirect(url);
  response.headers.set('x-credvia-middleware', 'fallback-route');
  response.headers.set('x-credvia-build-sha', BUILD_SHA);
  response.headers.set('x-credvia-route-canonical', `/career${suffix || ''}`);
  response.headers.set('x-credvia-auth-decision', 'public');
  return response;
}

export async function GET(request: Request, { params }: { params: { path?: string[] } }) {
  return buildRedirect(request, params);
}

export async function HEAD(request: Request, { params }: { params: { path?: string[] } }) {
  return buildRedirect(request, params);
}
