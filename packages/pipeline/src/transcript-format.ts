import type { TranscriptCue } from '@stock-vetter/schema';

export function formatTime(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatTranscriptForLLM(cues: TranscriptCue[]): string {
  return cues.map((c) => `[${formatTime(c.startSec)}] ${c.text}`).join('\n');
}

const LINE_RE = /^\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*(.*)$/;

export function reparseTranscript(
  original: TranscriptCue[],
  cleanedText: string,
): TranscriptCue[] {
  // Map cleaned-line text back onto original cues by start time when possible,
  // falling back to index alignment.
  const byTime = new Map<number, TranscriptCue>();
  for (const c of original) byTime.set(c.startSec, c);

  const cleaned: TranscriptCue[] = [];
  const lines = cleanedText.split(/\r?\n/);
  let idx = 0;
  for (const raw of lines) {
    const m = raw.match(LINE_RE);
    if (!m) continue;
    const a = Number(m[1]);
    const b = Number(m[2]);
    const c = m[3] ? Number(m[3]) : null;
    const startSec = c !== null ? a * 3600 + b * 60 + c : a * 60 + b;
    const text = (m[4] ?? '').trim();
    const orig = byTime.get(startSec) ?? original[idx];
    if (!orig) continue;
    cleaned.push({ startSec, endSec: orig.endSec, text });
    idx++;
  }
  // If parse produced fewer than 50% of original cues, treat as failure.
  if (cleaned.length < Math.max(1, Math.floor(original.length * 0.5))) return original;
  return cleaned;
}
