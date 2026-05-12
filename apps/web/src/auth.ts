/**
 * Auth.js (NextAuth v5) configuration.
 *
 * Single-user app: magic-link email login via Resend, with a hard allowlist of
 * one address (`ALLOWED_EMAIL`). Sessions are JWT (no session table needed); the
 * libSQL adapter exists only so the magic-link verification token can be stored
 * and consumed. The allowlist is enforced in the `signIn` callback — both the
 * deny path (any other email) and the allow path go through here.
 */
import NextAuth from 'next-auth';
import Resend from 'next-auth/providers/resend';
import { db } from './db';
import { LibsqlAdapter } from './auth-libsql-adapter';

const ALLOWED_EMAIL = (process.env.ALLOWED_EMAIL ?? '').trim().toLowerCase();

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: LibsqlAdapter(db()),
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
      const email = (user?.email ?? '').trim().toLowerCase();
      if (!ALLOWED_EMAIL) {
        // Misconfiguration: fail closed.
        return false;
      }
      return email === ALLOWED_EMAIL;
    },
  },
});
