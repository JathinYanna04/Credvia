import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { logInfo } from '@/lib/utils/logger';

<<<<<<< HEAD
const BUILD_SHA = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'unknown';
=======
const VERBOSE_MIDDLEWARE_LOGGING = process.env.CREDVIA_VERBOSE_MIDDLEWARE === 'true';
const BUILD_SHA = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? 'unknown';
>>>>>>> 7b6b28a (`Refactor career routes and jobs pages to use new career path canonicalization`)

const PUBLIC_PATHS = [
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/communities',
  '/career/jobs',
  '/jobs',
  '/career/jobs',
  '/careers',
  '/carreers',
  '/legal',
  '/auth/callback',
];

function isCareerDebugPath(pathname: string) {
  return (
    pathname === '/career' ||
    pathname.startsWith('/career/') ||
    pathname === '/jobs' ||
    pathname.startsWith('/jobs/') ||
    pathname === '/careers' ||
    pathname.startsWith('/careers/') ||
    pathname === '/carreers' ||
    pathname.startsWith('/carreers/')
  );
}

function getCanonicalCareerPath(pathname: string) {
  if (pathname === '/jobs' || pathname.startsWith('/jobs/')) {
    return pathname.replace('/jobs', '/career/jobs');
  }

  if (pathname === '/careers' || pathname.startsWith('/careers/')) {
    return pathname.replace('/careers', '/career');
  }

  if (pathname === '/carreers' || pathname.startsWith('/carreers/')) {
    return pathname.replace('/carreers', '/career');
  }

  return pathname;
}

function stripInternalSearchParams(url: URL) {
  const nextUrl = new URL(url.toString());
  nextUrl.searchParams.delete('_rsc');
  return nextUrl;
}

function applyCareerDebugHeaders(response: NextResponse, pathname: string, authDecision: 'public' | 'redirect-login' | 'pass') {
  if (!isCareerDebugPath(pathname)) {
    return response;
  }

  response.headers.set('x-credvia-middleware', 'hit');
  response.headers.set('x-credvia-build-sha', BUILD_SHA);
  response.headers.set('x-credvia-route-canonical', getCanonicalCareerPath(pathname));
  response.headers.set('x-credvia-auth-decision', authDecision);
  return response;
}

function isPublicPath(pathname: string) {
  return (
    PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`)) ||
    pathname.startsWith('/c/') ||
    pathname.startsWith('/u/') ||
    pathname.startsWith('/post/') ||
    pathname.startsWith('/api/v1/auth')
  );
}

function isPublicApiRequest(pathname: string, method: string) {
  if (method !== 'GET') {
    return pathname.startsWith('/api/v1/auth');
  }

  return (
    pathname === '/api/v1/communities' ||
    pathname === '/api/v1/search' ||
    pathname === '/api/v1/jobs' ||
    pathname.startsWith('/api/v1/jobs/') ||
    pathname === '/api/v1/ideas' ||
    pathname.startsWith('/api/v1/ideas/') ||
    pathname === '/api/v1/posts' ||
    pathname.startsWith('/api/v1/posts/') ||
    pathname.startsWith('/api/v1/users/') ||
    pathname.startsWith('/api/v1/auth')
  );
}

function shouldBypassMiddleware(pathname: string) {
  return (
    pathname.startsWith('/_next/static') ||
    pathname.startsWith('/_next/image') ||
    pathname.startsWith('/_next/webpack-hmr') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    /\.[a-zA-Z0-9]+$/.test(pathname)
  );
}

function isApiPath(pathname: string) {
  return pathname.startsWith('/api/');
}

<<<<<<< HEAD
=======
function isCareerDebugPath(pathname: string) {
  return (
    pathname === '/career' ||
    pathname.startsWith('/career/') ||
    pathname === '/jobs' ||
    pathname.startsWith('/jobs/') ||
    pathname === '/careers' ||
    pathname.startsWith('/careers/') ||
    pathname === '/carreers' ||
    pathname.startsWith('/carreers/')
  );
}

function stripInternalSearchParams(url: URL) {
  const nextUrl = new URL(url.toString());
  nextUrl.searchParams.delete('_rsc');
  return nextUrl;
}

function applyCareerDebugHeaders(
  response: NextResponse,
  canonicalPath: '/career' | '/career/jobs',
  authDecision: 'pass' | 'public' | 'redirect-login' | 'canonical-redirect',
) {
  response.headers.set('x-credvia-middleware', 'hit');
  response.headers.set('x-credvia-build-sha', BUILD_SHA);
  response.headers.set('x-credvia-route-canonical', canonicalPath);
  response.headers.set('x-credvia-auth-decision', authDecision);
  return response;
}

function getCanonicalCareerPath(pathname: string) {
  if (pathname === '/jobs' || pathname.startsWith('/jobs/')) {
    return pathname.replace(/^\/jobs/, '/career/jobs');
  }

  if (pathname === '/careers' || pathname.startsWith('/careers/')) {
    return pathname.replace(/^\/careers/, '/career');
  }

  if (pathname === '/carreers' || pathname.startsWith('/carreers/')) {
    return pathname.replace(/^\/carreers/, '/career');
  }

  return null;
}

function logMiddlewareInfo(message: string, meta?: Record<string, unknown>) {
  if (!VERBOSE_MIDDLEWARE_LOGGING) {
    return;
  }

  logInfo('middleware', message, meta);
}

>>>>>>> 7b6b28a (`Refactor career routes and jobs pages to use new career path canonicalization`)
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const method = request.method;

<<<<<<< HEAD
  if (pathname === '/jobs' || pathname.startsWith('/jobs/')) {
    const url = stripInternalSearchParams(request.nextUrl);
    url.pathname = pathname.replace('/jobs', '/career/jobs');
    return applyCareerDebugHeaders(NextResponse.redirect(url), pathname, 'public');
  }

  if (pathname === '/careers' || pathname.startsWith('/careers/')) {
    const url = stripInternalSearchParams(request.nextUrl);
    url.pathname = pathname.replace('/careers', '/career');
    return applyCareerDebugHeaders(NextResponse.redirect(url), pathname, 'public');
  }

  if (pathname === '/carreers' || pathname.startsWith('/carreers/')) {
    const url = stripInternalSearchParams(request.nextUrl);
    url.pathname = pathname.replace('/carreers', '/career');
    return applyCareerDebugHeaders(NextResponse.redirect(url), pathname, 'public');
=======
  const canonicalCareerPath = getCanonicalCareerPath(pathname);
  if (canonicalCareerPath) {
    const redirectUrl = stripInternalSearchParams(request.nextUrl);
    redirectUrl.pathname = canonicalCareerPath;
    return applyCareerDebugHeaders(
      NextResponse.redirect(redirectUrl),
      canonicalCareerPath.startsWith('/career/jobs') ? '/career/jobs' : '/career',
      'canonical-redirect',
    );
>>>>>>> 7b6b28a (`Refactor career routes and jobs pages to use new career path canonicalization`)
  }

  if (shouldBypassMiddleware(pathname)) {
    logInfo('middleware', 'Bypassing middleware for asset/system request', {
      pathname,
    });
    return NextResponse.next();
  }

  logInfo('middleware', 'Middleware handling request', {
    pathname,
  });

  const { response, user } = await updateSession(request);

  if (!user && !isPublicPath(pathname) && !isPublicApiRequest(pathname, method)) {
    if (isApiPath(pathname)) {
      logInfo('middleware', 'Returning JSON 401 for unauthenticated API request', {
        pathname,
      });
      return applyCareerDebugHeaders(NextResponse.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'You need to sign in.',
          },
        },
        { status: 401 },
      ), pathname, 'redirect-login');
    }

    logInfo('middleware', 'Redirecting unauthenticated request to login', {
      pathname,
    });
<<<<<<< HEAD
    return applyCareerDebugHeaders(NextResponse.redirect(new URL('/login', request.url)), pathname, 'redirect-login');
=======
    const loginRedirect = NextResponse.redirect(new URL('/login', stripInternalSearchParams(request.nextUrl)));
    if (pathname === '/career' || pathname.startsWith('/career/')) {
      return applyCareerDebugHeaders(loginRedirect, '/career', 'redirect-login');
    }
    return loginRedirect;
>>>>>>> 7b6b28a (`Refactor career routes and jobs pages to use new career path canonicalization`)
  }

  if (!isApiPath(pathname) && user && (pathname === '/login' || pathname === '/signup')) {
    logInfo('middleware', 'Redirecting authenticated user away from auth page', {
      pathname,
    });
    return NextResponse.redirect(new URL('/feed', request.url));
  }

  logInfo('middleware', 'Allowing request to continue', {
    pathname,
    hasUser: Boolean(user),
  });
<<<<<<< HEAD
  return applyCareerDebugHeaders(response, pathname, user ? 'pass' : 'public');
=======

  if (isCareerDebugPath(pathname)) {
    return applyCareerDebugHeaders(
      response,
      pathname.startsWith('/career/jobs') ? '/career/jobs' : '/career',
      isPublicPath(pathname) ? 'public' : 'pass',
    );
  }

  return response;
>>>>>>> 7b6b28a (`Refactor career routes and jobs pages to use new career path canonicalization`)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)'],
};
