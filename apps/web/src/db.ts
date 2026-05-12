/**
 * libSQL client for the web app. Read-only usage: the pipeline CLI writes; the
 * web app only reads. One client per server process (Next.js module singleton).
 */
import 'server-only';
import { createClient, type Client } from '@libsql/client';

let client: Client | null = null;

export function db(): Client {
  if (client) return client;
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) {
    throw new Error('TURSO_DATABASE_URL is not set');
  }
  client = createClient({ url, authToken });
  return client;
}
