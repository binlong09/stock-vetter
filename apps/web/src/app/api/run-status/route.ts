/**
 * GET /api/run-status — lightweight poll target for the "Run analysis now"
 * button. Returns whether a tracker run is currently in flight (the Turso
 * run-lock is live) and the most-recent thesis_status update time, so the UI
 * can detect "the run finished and wrote new state" and refresh.
 *
 * Auth-gated like everything else (the middleware redirects unauthenticated
 * requests; we also check the session and return 401).
 */
import 'server-only';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let inFlight = false;
  let lastUpdatedAt: string | null = null;
  try {
    const lock = await db().execute({
      sql: `SELECT expires_at FROM signal_run_lock WHERE id = 'track' LIMIT 1`,
    });
    const lockRow = lock.rows[0];
    inFlight = lockRow ? String(lockRow.expires_at) > new Date().toISOString() : false;

    const upd = await db().execute({
      sql: `SELECT MAX(updated_at) AS last FROM thesis_status`,
    });
    const u = upd.rows[0]?.last;
    lastUpdatedAt = u == null ? null : String(u);
  } catch {
    // Tables missing / DB hiccup — report defaults.
  }

  return NextResponse.json({ inFlight, lastUpdatedAt });
}
