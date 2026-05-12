/**
 * Route protection. Everything except the sign-in page and the auth API routes
 * requires a session; unauthenticated requests are redirected to /signin.
 */
import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic =
    pathname === '/signin' ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico';
  if (isPublic) return;
  if (!req.auth) {
    const url = new URL('/signin', req.nextUrl.origin);
    return NextResponse.redirect(url);
  }
});

export const config = {
  // Run on everything except Next internals and static files.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
