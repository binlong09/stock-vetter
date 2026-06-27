/**
 * POST /api/trigger-run — auth-gated trigger for the signal-tracker workflow.
 *
 * Lets an allowlisted reader kick off a signal-tracker run from the web app
 * (the "did anything file today" / "I've been away, catch up" buttons on
 * /theses), via GitHub's workflow_dispatch API.
 *
 * Hard requirements (see Change 3):
 *   - Gated behind the SAME magic-link + allowlist auth as viewing data. The
 *     middleware already redirects unauthenticated *page* requests; for this
 *     API route we additionally check the session server-side and return 401 to
 *     an unauthenticated caller (no redirect, no trigger).
 *   - The GitHub token lives ONLY here (GH_DISPATCH_TOKEN, a Vercel env var).
 *     The browser calls this route; this route calls GitHub. The token is never
 *     sent to the client.
 *   - Optional `since` (YYYY-MM-DD) is passed through as a workflow_dispatch
 *     input for the catch-up case. Omitted ⇒ the workflow's 14-day default.
 *   - Reuses the Turso run-lock: if a run is already in flight we refuse (409)
 *     rather than firing a second — the rate-limit against fat-fingered repeat
 *     taps burning paid compute. We only READ the lock here; the GitHub run
 *     itself acquires/releases it (acquiring here would make the cron back off).
 */
import 'server-only';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GH_OWNER = 'binlong09';
const GH_REPO = 'stock-vetter';
const WORKFLOW_FILE = 'signal-tracker.yml';
const WORKFLOW_REF = 'main';

// Is a tracker run currently in flight? Read-only check of the Turso run-lock
// (same table track.ts uses). A row whose expires_at is in the future means a
// run holds the lock. Missing table / no Turso ⇒ treat as "not locked".
async function runInFlight(): Promise<boolean> {
  try {
    const res = await db().execute({
      sql: `SELECT expires_at FROM signal_run_lock WHERE id = 'track' LIMIT 1`,
    });
    const row = res.rows[0];
    if (!row) return false;
    return String(row.expires_at) > new Date().toISOString();
  } catch {
    return false;
  }
}

function isValidSince(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

export async function POST(req: Request): Promise<NextResponse> {
  // 1. Auth — same gate as viewing data. Unauthenticated ⇒ nothing.
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 2. Token — server-only.
  const token = process.env.GH_DISPATCH_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'trigger not configured (GH_DISPATCH_TOKEN unset)' }, { status: 503 });
  }

  // 3. Optional `since` passthrough (catch-up case).
  let since: string | undefined;
  try {
    const body = (await req.json()) as { since?: unknown };
    if (typeof body.since === 'string' && body.since.length) {
      if (!isValidSince(body.since)) {
        return NextResponse.json({ error: 'since must be YYYY-MM-DD' }, { status: 400 });
      }
      since = body.since;
    }
  } catch {
    // No/invalid JSON body ⇒ no since override (default 14-day window).
  }

  // 4. Run-lock — refuse a second concurrent run.
  if (await runInFlight()) {
    return NextResponse.json(
      { error: 'a run is already in flight — try again when it finishes' },
      { status: 409 },
    );
  }

  // 5. Fire the workflow_dispatch.
  const inputs: Record<string, string> = {};
  if (since) inputs.since = since;
  const ghRes = await fetch(
    `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: WORKFLOW_REF, inputs }),
    },
  );

  if (ghRes.status !== 204) {
    const detail = await ghRes.text();
    return NextResponse.json(
      { error: `GitHub dispatch failed: ${ghRes.status}`, detail: detail.slice(0, 300) },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, since: since ?? null });
}
