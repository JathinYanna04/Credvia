import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { logInfo } from '@/lib/utils/logger';

const VERBOSE_MIDDLEWARE_LOGGING = process.env.CREDVIA_VERBOSE_MIDDLEWARE === 'true';

const PUBLIC_PATHS = [
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/communities',
  '/jobs',
  '/legal',
  '/auth/callback',
];

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

function logMiddlewareInfo(message: string, meta?: Record<string, unknown>) {
  if (!VERBOSE_MIDDLEWARE_LOGGING) {
    return;
  }

  logInfo('middleware', message, meta);
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const method = request.method;

  if (shouldBypassMiddleware(pathname)) {
    logMiddlewareInfo('Bypassing middleware for asset/system request', {
      pathname,
    });
    return NextResponse.next();
  }

  logMiddlewareInfo('Middleware handling request', {
    pathname,
  });

  const { response, user } = await updateSession(request);

  if (!user && !isPublicPath(pathname) && !isPublicApiRequest(pathname, method)) {
    if (isApiPath(pathname)) {
      logMiddlewareInfo('Returning JSON 401 for unauthenticated API request', {
        pathname,
      });
      return NextResponse.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'You need to sign in.',
          },
        },
        { status: 401 },
      );
    }

    logMiddlewareInfo('Redirecting unauthenticated request to login', {
      pathname,
    });
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (!isApiPath(pathname) && user && (pathname === '/login' || pathname === '/signup')) {
    logMiddlewareInfo('Redirecting authenticated user away from auth page', {
      pathname,
    });
    return NextResponse.redirect(new URL('/feed', request.url));
  }

  logMiddlewareInfo('Allowing request to continue', {
    pathname,
    hasUser: Boolean(user),
  });
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)'],
};
