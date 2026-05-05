// Transcript fetch path:
//   1. youtubei.js: get video metadata + caption-track URLs, fetch JSON3 timed-text directly.
//   2. If that returns no cues (YouTube has been tightening timedtext auth in ways
//      youtubei.js can't follow without a fix release — empty 200 responses for
//      both manual and ASR tracks at time of writing), fall back to spawning
//      yt-dlp, which ships fixes for these auth changes within days.
//   3. If yt-dlp also yields nothing, throw MissingCaptionsError.
// The youtubei.js path is intentionally primary so we benefit when YouTube.js
// catches up and we can drop the Python subprocess.
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Innertube } from 'youtubei.js';
import type { Chapter, TranscriptCue, VideoBundle } from '@stock-vetter/schema';
import { InvalidYoutubeUrlError, MissingCaptionsError } from './errors.js';

const execFileP = promisify(execFile);

function debugLog(debug: boolean, msg: string): void {
  if (debug) process.stderr.write(`[transcript] ${msg}\n`);
}

export function parseYoutubeUrl(url: string): string {
  // Accept youtu.be/<id>, youtube.com/watch?v=<id>, youtube.com/shorts/<id>
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0];
      if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) return id;
    }
    if (u.hostname.endsWith('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
      const m = u.pathname.match(/\/(shorts|embed|live)\/([A-Za-z0-9_-]{11})/);
      if (m && m[2]) return m[2];
    }
  } catch {
    // fallthrough
  }
  throw new InvalidYoutubeUrlError(url);
}

export function parseChaptersFromDescription(description: string): Chapter[] {
  const chapters: Chapter[] = [];
  for (const rawLine of description.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s+[-–—]?\s*(.+)$/);
    if (!m) continue;
    const a = Number(m[1]);
    const b = Number(m[2]);
    const c = m[3] ? Number(m[3]) : null;
    const title = (m[4] ?? '').trim();
    if (!title) continue;
    const startSec = c !== null ? a * 3600 + b * 60 + c : a * 60 + b;
    chapters.push({ title, startSec });
  }
  // Heuristic: only treat as chapters if there are at least 3 timestamps in order.
  const ordered = chapters.every((ch, i) => i === 0 || ch.startSec >= chapters[i - 1]!.startSec);
  if (chapters.length >= 3 && ordered) return chapters;
  return [];
}

async function fetchViaYoutubei(videoId: string, debug: boolean): Promise<VideoBundle> {
  const yt = await Innertube.create();
  let info: Awaited<ReturnType<typeof yt.getInfo>>;
  try {
    info = await yt.getInfo(videoId);
  } catch (e) {
    throw new Error(`youtubei.js getInfo failed: ${(e as Error).message}`);
  }

  const basic = info.basic_info;
  const title: string = basic.title ?? '';
  const channel: string =
    (basic as unknown as { channel?: { name?: string }; author?: string }).channel?.name ??
    (basic as unknown as { author?: string }).author ??
    '';
  const channelId: string =
    (basic as unknown as { channel?: { id?: string } }).channel?.id ??
    (basic as unknown as { channel_id?: string }).channel_id ??
    '';
  const durationSeconds: number =
    typeof basic.duration === 'number'
      ? basic.duration
      : (basic as unknown as { duration?: { seconds?: number } }).duration?.seconds ?? 0;
  const description: string =
    (basic as unknown as { short_description?: string }).short_description ??
    (info as unknown as { secondary_info?: { description?: { text?: string } } }).secondary_info
      ?.description?.text ??
    '';
  const tags: string[] = (basic as unknown as { keywords?: string[] }).keywords ?? [];
  const publishedAtRaw =
    (info as unknown as { primary_info?: { published?: { text?: string } } }).primary_info?.published
      ?.text ?? '';
  const publishedAt = normalizeDate(publishedAtRaw);

  // The caption track URLs exposed via info.captions can be fetched directly
  // for timed-text JSON3 — bypasses youtubei.js's brittle getTranscript() path.
  const cues = await fetchCuesFromCaptionTracks(info, debug);
  if (!cues.length) throw new MissingCaptionsError(videoId);

  return {
    videoId,
    title,
    channel,
    channelId,
    publishedAt,
    description,
    tags,
    chapters: parseChaptersFromDescription(description),
    transcript: cues,
    durationSeconds,
  };
}

type CaptionTrack = {
  base_url: string;
  language_code: string;
  kind?: string;
  name?: { text?: string };
};

async function fetchCuesFromCaptionTracks(
  info: { captions?: { caption_tracks?: CaptionTrack[] } },
  debug: boolean,
): Promise<TranscriptCue[]> {
  const tracks = info.captions?.caption_tracks ?? [];
  debugLog(
    debug,
    `caption_tracks count=${tracks.length} langs=${tracks
      .map((t) => `${t.language_code}${t.kind === 'asr' ? '/asr' : ''}`)
      .join(',')}`,
  );
  if (!tracks.length) return [];
  // Prefer manually-uploaded English; fall back to auto-generated English; then any English.
  const score = (t: CaptionTrack) => {
    const lang = (t.language_code ?? '').toLowerCase();
    const isEnglish = lang === 'en' || lang.startsWith('en');
    const isAuto = t.kind === 'asr';
    return (isEnglish ? 2 : 0) + (isAuto ? 0 : 1);
  };
  const ranked = [...tracks].sort((a, b) => score(b) - score(a));
  const chosen = ranked[0];
  if (!chosen?.base_url) return [];
  const url = chosen.base_url.includes('fmt=')
    ? chosen.base_url
    : `${chosen.base_url}&fmt=json3`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    },
  });
  debugLog(debug, `caption response status=${res.status}`);
  if (!res.ok) return [];
  const body = await res.text();
  debugLog(debug, `caption body len=${body.length}`);
  const parsed = body.trim().startsWith('{') ? parseJson3(body) : parseTimedTextXml(body);
  debugLog(debug, `parsed cues=${parsed.length}`);
  return parsed;
}

function parseJson3(body: string): TranscriptCue[] {
  type Json3Event = {
    tStartMs?: number;
    dDurationMs?: number;
    segs?: { utf8?: string }[];
  };
  let parsed: { events?: Json3Event[] };
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }
  const cues: TranscriptCue[] = [];
  for (const ev of parsed.events ?? []) {
    if (!ev.segs) continue;
    const text = ev.segs
      .map((s) => s.utf8 ?? '')
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    const startMs = ev.tStartMs ?? 0;
    const endMs = startMs + (ev.dDurationMs ?? 0);
    cues.push({
      startSec: Math.round(startMs / 1000),
      endSec: Math.round(endMs / 1000),
      text,
    });
  }
  return mergeShortCues(cues);
}

function parseTimedTextXml(body: string): TranscriptCue[] {
  const cues: TranscriptCue[] = [];
  const re = /<text\s+start="([\d.]+)"\s+dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const start = parseFloat(m[1]!);
    const dur = parseFloat(m[2]!);
    const text = decodeHtmlEntities(m[3]!).replace(/\s+/g, ' ').trim();
    if (!text) continue;
    cues.push({
      startSec: Math.round(start),
      endSec: Math.round(start + dur),
      text,
    });
  }
  return mergeShortCues(cues);
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function mergeShortCues(cues: TranscriptCue[]): TranscriptCue[] {
  // Auto-captions emit ~1 cue per word. Merge into ~10s chunks for the LLM
  // so the prompt isn't dominated by per-word [MM:SS] prefixes.
  if (!cues.length) return cues;
  const TARGET_LEN = 10; // seconds
  const merged: TranscriptCue[] = [];
  let cur: TranscriptCue | null = null;
  for (const c of cues) {
    if (!cur) {
      cur = { ...c };
      continue;
    }
    if (c.endSec - cur.startSec < TARGET_LEN) {
      cur.endSec = c.endSec;
      cur.text = `${cur.text} ${c.text}`.replace(/\s+/g, ' ').trim();
    } else {
      merged.push(cur);
      cur = { ...c };
    }
  }
  if (cur) merged.push(cur);
  return merged;
}

async function fetchViaYtDlp(videoId: string, debug: boolean): Promise<VideoBundle> {
  debugLog(debug, `falling back to yt-dlp for ${videoId}`);
  // Requires `yt-dlp` on PATH. If absent, surface a clear error.
  const tmp = await mkdtemp(join(tmpdir(), 'stock-vetter-'));
  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const { stdout: metaOut } = await execFileP('yt-dlp', [
      '--dump-json',
      '--skip-download',
      '--no-warnings',
      url,
    ]);
    const meta = JSON.parse(metaOut) as {
      id: string;
      title?: string;
      channel?: string;
      channel_id?: string;
      uploader?: string;
      uploader_id?: string;
      description?: string;
      tags?: string[];
      duration?: number;
      upload_date?: string;
    };

    // json3 is the same format YouTube's timedtext endpoint serves natively.
    // It has no rolling-window duplication unlike auto-sub VTT (which would
    // 5x-inflate the transcript and blow past per-minute token rate limits).
    await execFileP('yt-dlp', [
      '--write-auto-sub',
      '--sub-lang',
      'en.*,en',
      '--sub-format',
      'json3',
      '--skip-download',
      '--no-warnings',
      '-o',
      join(tmp, '%(id)s.%(ext)s'),
      url,
    ]);

    const files = await readdir(tmp);
    const subFile = files.find((f) => f.endsWith('.json3'));
    if (!subFile) throw new MissingCaptionsError(videoId);
    const body = await readFile(join(tmp, subFile), 'utf-8');
    const cues = parseJson3(body);
    if (!cues.length) throw new MissingCaptionsError(videoId);

    return {
      videoId,
      title: meta.title ?? '',
      channel: meta.channel ?? meta.uploader ?? '',
      channelId: meta.channel_id ?? meta.uploader_id ?? '',
      publishedAt: meta.upload_date ? formatYtDlpDate(meta.upload_date) : '',
      description: meta.description ?? '',
      tags: meta.tags ?? [],
      chapters: parseChaptersFromDescription(meta.description ?? ''),
      transcript: cues,
      durationSeconds: meta.duration ?? 0,
    };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

function formatYtDlpDate(yyyymmdd: string): string {
  if (!/^\d{8}$/.test(yyyymmdd)) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function normalizeDate(raw: string): string {
  if (!raw) return '';
  // youtubei.js returns strings like "Premiered Apr 12, 2024" or "Apr 12, 2024".
  const m = raw.match(/([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/);
  if (!m) return raw;
  const month = monthIndex(m[1]!);
  if (month === -1) return raw;
  const day = String(Number(m[2])).padStart(2, '0');
  const mm = String(month + 1).padStart(2, '0');
  return `${m[3]}-${mm}-${day}`;
}

function monthIndex(name: string): number {
  const months = [
    'jan',
    'feb',
    'mar',
    'apr',
    'may',
    'jun',
    'jul',
    'aug',
    'sep',
    'oct',
    'nov',
    'dec',
  ];
  return months.indexOf(name.slice(0, 3).toLowerCase());
}

export async function fetchVideoBundle(
  url: string,
  options: { debug?: boolean } = {},
): Promise<VideoBundle> {
  const debug = options.debug === true;
  const videoId = parseYoutubeUrl(url);
  // Order: youtubei.js → on empty body or error → yt-dlp → MissingCaptionsError.
  try {
    return await fetchViaYoutubei(videoId, debug);
  } catch (err) {
    debugLog(debug, `youtubei.js path failed: ${(err as Error).message}`);
    try {
      return await fetchViaYtDlp(videoId, debug);
    } catch (fallbackErr) {
      debugLog(debug, `yt-dlp fallback failed: ${(fallbackErr as Error).message}`);
      throw new MissingCaptionsError(videoId);
    }
  }
}
