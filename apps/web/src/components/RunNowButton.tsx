'use client';

import { useRouter } from 'next/navigation';
import { useState, useRef } from 'react';

type Phase = 'idle' | 'starting' | 'running' | 'done' | 'error';

// Trigger a tracker run and poll for completion, then refresh the view.
// Completion = the run-lock clears AND thesis_status.updated_at has advanced
// past where it was before we fired (so we know new state landed).
export function RunNowButton({ baselineUpdatedAt }: { baselineUpdatedAt: string | null }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');
  const [msg, setMsg] = useState<string>('');
  const [showSince, setShowSince] = useState(false);
  const [since, setSince] = useState('');
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function pollUntilDone(baseline: string | null, sawRunning: boolean, ticks: number) {
    // Give up after ~5 min (runs take a couple minutes; this is a safety stop).
    if (ticks > 100) {
      setPhase('error');
      setMsg('Timed out waiting for the run. It may still finish — refresh shortly.');
      return;
    }
    try {
      const res = await fetch('/api/run-status', { cache: 'no-store' });
      const data = (await res.json()) as { inFlight: boolean; lastUpdatedAt: string | null };
      const advanced = data.lastUpdatedAt != null && data.lastUpdatedAt !== baseline;

      if (data.inFlight) {
        setPhase('running');
        pollTimer.current = setTimeout(() => pollUntilDone(baseline, true, ticks + 1), 3000);
        return;
      }
      // Lock cleared. Done if we ever saw it running, or state advanced.
      if (sawRunning || advanced) {
        setPhase('done');
        setMsg('Run finished — refreshing.');
        router.refresh();
        return;
      }
      // Lock not yet taken (dispatch → runner startup lag). Keep waiting.
      pollTimer.current = setTimeout(() => pollUntilDone(baseline, sawRunning, ticks + 1), 3000);
    } catch {
      pollTimer.current = setTimeout(() => pollUntilDone(baseline, sawRunning, ticks + 1), 3000);
    }
  }

  async function fire() {
    setPhase('starting');
    setMsg('');
    try {
      const res = await fetch('/api/trigger-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(since ? { since } : {}),
      });
      if (res.status === 409) {
        setPhase('error');
        setMsg('A run is already in flight. Try again when it finishes.');
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setPhase('error');
        setMsg(data.error ?? `Couldn't start the run (${res.status}).`);
        return;
      }
      setPhase('running');
      setMsg('Run started — this takes a couple of minutes…');
      pollUntilDone(baselineUpdatedAt, false, 0);
    } catch {
      setPhase('error');
      setMsg('Network error starting the run.');
    }
  }

  const busy = phase === 'starting' || phase === 'running';

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowSince((v) => !v)}
          className="text-[11px] text-slate-400 hover:text-slate-600"
          title="Run a wider catch-up if you've been away"
        >
          look back further
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={fire}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {phase === 'starting' ? 'Starting…' : phase === 'running' ? 'Running…' : 'Run analysis now'}
        </button>
      </div>
      {showSince && (
        <div className="flex items-center gap-1.5">
          <label className="text-[11px] text-slate-400">since</label>
          <input
            type="date"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            disabled={busy}
            className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px]"
          />
        </div>
      )}
      {msg && (
        <span className={`text-[11px] ${phase === 'error' ? 'text-rose-600' : 'text-slate-500'}`}>{msg}</span>
      )}
    </div>
  );
}
