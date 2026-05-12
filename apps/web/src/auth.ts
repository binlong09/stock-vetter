/**
 * Auth.js (NextAuth v5) configuration.
 *
 * Read-only viewer shared with a handful of people: magic-link email login via
 * Resend, with a hard allowlist (`ALLOWED_EMAILS`, comma-separated). Sessions
 * are JWT (no session table needed); the libSQL adapter exists only so the
 * magic-link verification token can be stored and consumed. The allowlist is
 * enforced in the `signIn` callback — both the deny path (any other email) and
 * the allow path go through here. Fails closed if `ALLOWED_EMAILS` is empty.
 */
import NextAuth from 'next-auth';
import Resend from 'next-auth/providers/resend';
import { db } from './db';
import { LibsqlAdapter } from './auth-libsql-adapter';

const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter((e) => e.length > 0);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: LibsqlAdapter(db()),
  // Honor the Host header / AUTH_URL when building callback URLs. On Vercel,
  // set AUTH_URL to the stable production origin so magic-link emails point
  // there rather than at a per-deployment preview URL.
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/signin',
    // Auth.js renders its own "check your email" + error pages by default; we
    // point errors back at /signin so the UI is consistent (the ?error= param
    // is read there).
    verifyRequest: '/signin?sent=1',
    error: '/signin',
  },
  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.EMAIL_FROM,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (ALLOWED_EMAILS.length === 0) {
        // Misconfiguration: fail closed.
        return false;
      }
      return ALLOWED_EMAILS.includes((user?.email ?? '').trim().toLowerCase());
    },
  },
});
