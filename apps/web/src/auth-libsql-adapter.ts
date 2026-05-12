/**
 * Minimal Auth.js (NextAuth v5) adapter backed by libSQL / Turso.
 *
 * Why custom: there's no first-party libSQL/Turso adapter on npm, and the
 * alternatives (Drizzle, Kysely) drag a whole query layer in for four tables.
 * The Email/Resend magic-link flow needs an adapter (it stores a one-time
 * verification token server-side and checks it on click-through); with JWT
 * sessions we don't need the session-table methods, so this implements just:
 *   - user CRUD: createUser / getUser / getUserByEmail / getUserByAccount /
 *     updateUser / linkAccount
 *   - verification tokens: createVerificationToken / useVerificationToken
 *
 * Schema lives in our own migration file alongside the app tables (single DB).
 */
import type { Client } from '@libsql/client';
import type { Adapter, AdapterUser, AdapterAccount, VerificationToken } from 'next-auth/adapters';

function rowToUser(row: Record<string, unknown>): AdapterUser {
  return {
    id: String(row.id),
    email: String(row.email),
    emailVerified: row.email_verified ? new Date(String(row.email_verified)) : null,
    name: row.name == null ? null : String(row.name),
    image: row.image == null ? null : String(row.image),
  };
}

export function LibsqlAdapter(client: Client): Adapter {
  return {
    async createUser(user) {
      const id = crypto.randomUUID();
      await client.execute({
        sql: `INSERT INTO auth_users (id, email, email_verified, name, image) VALUES (?, ?, ?, ?, ?)`,
        args: [
          id,
          user.email,
          user.emailVerified ? user.emailVerified.toISOString() : null,
          user.name ?? null,
          user.image ?? null,
        ],
      });
      return { ...user, id };
    },

    async getUser(id) {
      const res = await client.execute({ sql: `SELECT * FROM auth_users WHERE id = ?`, args: [id] });
      const row = res.rows[0];
      return row ? rowToUser(row as Record<string, unknown>) : null;
    },

    async getUserByEmail(email) {
      const res = await client.execute({
        sql: `SELECT * FROM auth_users WHERE email = ?`,
        args: [email],
      });
      const row = res.rows[0];
      return row ? rowToUser(row as Record<string, unknown>) : null;
    },

    async getUserByAccount({ provider, providerAccountId }) {
      const res = await client.execute({
        sql: `SELECT u.* FROM auth_users u
                JOIN auth_accounts a ON a.user_id = u.id
               WHERE a.provider = ? AND a.provider_account_id = ?`,
        args: [provider, providerAccountId],
      });
      const row = res.rows[0];
      return row ? rowToUser(row as Record<string, unknown>) : null;
    },

    async updateUser(user) {
      // Fetch current, then write merged values back.
      const cur = await client.execute({
        sql: `SELECT * FROM auth_users WHERE id = ?`,
        args: [user.id],
      });
      const row = cur.rows[0] as Record<string, unknown> | undefined;
      const existing = row ? rowToUser(row) : null;
      const merged: AdapterUser = {
        id: user.id,
        email: user.email ?? existing?.email ?? '',
        emailVerified:
          user.emailVerified !== undefined ? user.emailVerified : (existing?.emailVerified ?? null),
        name: user.name !== undefined ? user.name : (existing?.name ?? null),
        image: user.image !== undefined ? user.image : (existing?.image ?? null),
      };
      await client.execute({
        sql: `UPDATE auth_users SET email = ?, email_verified = ?, name = ?, image = ? WHERE id = ?`,
        args: [
          merged.email,
          merged.emailVerified ? merged.emailVerified.toISOString() : null,
          merged.name ?? null,
          merged.image ?? null,
          merged.id,
        ],
      });
      return merged;
    },

    async linkAccount(account: AdapterAccount) {
      await client.execute({
        sql: `INSERT INTO auth_accounts
                (user_id, type, provider, provider_account_id, refresh_token, access_token,
                 expires_at, token_type, scope, id_token, session_state)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          account.userId,
          account.type,
          account.provider,
          account.providerAccountId,
          (account.refresh_token as string | undefined) ?? null,
          (account.access_token as string | undefined) ?? null,
          (account.expires_at as number | undefined) ?? null,
          (account.token_type as string | undefined) ?? null,
          (account.scope as string | undefined) ?? null,
          (account.id_token as string | undefined) ?? null,
          (account.session_state as string | undefined) ?? null,
        ],
      });
      return account;
    },

    async createVerificationToken(token: VerificationToken) {
      await client.execute({
        sql: `INSERT INTO auth_verification_tokens (identifier, token, expires) VALUES (?, ?, ?)`,
        args: [token.identifier, token.token, token.expires.toISOString()],
      });
      return token;
    },

    async useVerificationToken({ identifier, token }) {
      const res = await client.execute({
        sql: `DELETE FROM auth_verification_tokens WHERE identifier = ? AND token = ? RETURNING identifier, token, expires`,
        args: [identifier, token],
      });
      const row = res.rows[0] as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        identifier: String(row.identifier),
        token: String(row.token),
        expires: new Date(String(row.expires)),
      };
    },
  };
}
