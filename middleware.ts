import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requiresPersonaOnboarding } from '@/lib/profile-state';
import { updateSession } from '@/lib/supabase/middleware';

const BUILD_SHA = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'unknown';

const PUBLIC_PATHS = [
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/communities',
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

function logMiddlewareInfo(message: string, meta?: Record<string, unknown>) {
  console.info(JSON.stringify({
    level: 'info',
    scope: 'middleware',
    message,
    timestamp: new Date().toISOString(),
    ...(meta ?? {}),
  }));
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
    return pathname.startsWith('/api/v1/auth') || pathname === '/api/v1/ai/worker';
  }

  return (
    pathname === '/api/v1/ai/worker' ||
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

function isFounderFeedbackApiPath(pathname: string) {
  return /^\/api\/v1\/ideas\/[^/]+\/ai-feedback$/.test(pathname);
}

function isOnboardingPath(pathname: string) {
  return pathname === '/onboarding' || pathname.startsWith('/onboarding/');
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const method = request.method;

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
  }

  if (shouldBypassMiddleware(pathname)) {
    logMiddlewareInfo('Bypassing middleware for asset/system request', {
      pathname,
    });
    return NextResponse.next();
  }

  if (isFounderFeedbackApiPath(pathname)) {
    logMiddlewareInfo('Bypassing middleware auth refresh for founder ai-feedback route', {
      pathname,
    });
    return NextResponse.next();
  }

  logMiddlewareInfo('Middleware handling request', {
    pathname,
  });

  const { response, user, profile } = await updateSession(request);

  if (!user && !isPublicPath(pathname) && !isPublicApiRequest(pathname, method)) {
    if (isApiPath(pathname)) {
      logMiddlewareInfo('Returning JSON 401 for unauthenticated API request', {
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

    logMiddlewareInfo('Redirecting unauthenticated request to login', {
      pathname,
    });
    return applyCareerDebugHeaders(NextResponse.redirect(new URL('/login', request.url)), pathname, 'redirect-login');
  }

  const requiresOnboarding = Boolean(user) && (!profile || requiresPersonaOnboarding(profile));

  if (
    !isApiPath(pathname) &&
    user &&
    !isOnboardingPath(pathname) &&
    requiresOnboarding
  ) {
    logMiddlewareInfo('Redirecting authenticated user into onboarding', {
      pathname,
    });
    return NextResponse.redirect(new URL('/onboarding', request.url));
  }

  if (!isApiPath(pathname) && user && isOnboardingPath(pathname) && !requiresOnboarding) {
    logMiddlewareInfo('Redirecting fully onboarded user away from onboarding', {
      pathname,
    });
    return NextResponse.redirect(new URL('/feed', request.url));
  }

  if (!isApiPath(pathname) && user && (pathname === '/login' || pathname === '/signup')) {
    logMiddlewareInfo('Redirecting authenticated user away from auth page', {
      pathname,
    });
    return NextResponse.redirect(
      new URL(requiresOnboarding ? '/onboarding' : '/feed', request.url),
    );
  }

  logMiddlewareInfo('Allowing request to continue', {
    pathname,
    hasUser: Boolean(user),
  });
  return applyCareerDebugHeaders(response, pathname, user ? 'pass' : 'public');
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)'],
};
