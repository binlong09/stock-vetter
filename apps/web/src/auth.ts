/**
 * Auth.js (NextAuth v5) configuration.
 *
 * Read-only viewer shared with a handful of people: magic-link email login via
 * Resend, with a hard allowlist. Sessions are JWT (no session table needed);
 * the libSQL adapter exists only so the magic-link verification token can be
 * stored and consumed.
 *
 * The allowlist lives in the `allowed_emails` Turso table (migration 0004),
 * NOT an env var — so a reader can be added with `pnpm allow-email <addr>`
 * with no env change and no Vercel redeploy. It is checked in the `signIn`
 * callback against the email the magic link was issued to. Fails closed: an
 * empty table, or a DB read error, denies sign-in.
 */
import NextAuth from 'next-auth';
import Resend from 'next-auth/providers/resend';
import { db } from './db';
import { LibsqlAdapter } from './auth-libsql-adapter';

/** True iff `email` has a row in the allowlist table. Fails closed on error. */
async function isEmailAllowed(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  try {
    const res = await db().execute({
      sql: `SELECT 1 FROM allowed_emails WHERE email = ? LIMIT 1`,
      args: [normalized],
    });
    return res.rows.length > 0;
  } catch {
    // Table missing or DB unreachable — deny rather than fail open.
    return false;
  }
}

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
      return isEmailAllowed(user?.email ?? '');
    },
  },
});
