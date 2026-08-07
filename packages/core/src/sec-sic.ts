// SIC-code sector classification, straight from EDGAR.
//
// Building a *tech* universe needs a sector for every registrant, and the two
// obvious sources are both wrong for this job: Yahoo's `quote` batch doesn't
// carry sector at all (only the per-ticker `quoteSummary` does, which is one
// request each and rate-limited into uselessness at universe scale), and a
// hand-maintained ticker list goes stale the moment a company IPOs.
//
// EDGAR's submissions API carries the SIC code the registrant itself files
// under. It is authoritative, free, covered by the same rate limiter as every
// other SEC call, and — the part that matters — it is the same identifier the
// SEC's own Office of Technology uses to route filings. One request per CIK,
// so callers should narrow by market cap FIRST and classify only the
// survivors.

import { secFetchJson } from './sec-http.js';

export type CompanyProfile = {
  cik: string;
  name: string;
  /** 4-digit SIC, or '' when EDGAR has none (common for shells and new filers). */
  sic: string;
  sicDescription: string;
  /** Exchange codes from EDGAR, e.g. ['Nasdaq']. Empty for unlisted filers. */
  exchanges: string[];
};

type SubmissionsHeader = {
  cik?: string | number;
  name?: string;
  sic?: string;
  sicDescription?: string;
  exchanges?: string[];
};

/**
 * Fetch one registrant's EDGAR profile (name, SIC, exchanges).
 *
 * The submissions payload also carries the recent-filings arrays, which we
 * throw away — there is no lighter endpoint that exposes SIC, and gzip keeps
 * the transfer tolerable at the few-thousand-CIK scale this is used at.
 */
export async function fetchCompanyProfile(cik: string): Promise<CompanyProfile> {
  const padded = cik.padStart(10, '0');
  const sub = await secFetchJson<SubmissionsHeader>(
    `https://data.sec.gov/submissions/CIK${padded}.json`,
  );
  return {
    cik: padded,
    name: sub.name ?? '',
    sic: sub.sic ?? '',
    sicDescription: sub.sicDescription ?? '',
    exchanges: sub.exchanges ?? [],
  };
}

/**
 * SIC ranges that make up "tech" for the radar's purposes, inclusive on both
 * ends. Deliberately built from ranges rather than a flat code list: SIC
 * groups are contiguous by design, and a range keeps a newly-used code inside
 * an existing group (e.g. a filer picking 3676 over 3674) from silently
 * dropping out of the universe.
 *
 * Excluded on purpose:
 *   - 3630-3649 (appliances, lighting) — electrical, not electronics.
 *   - 3826 / 8731 (lab analytical instruments, biological research) — these
 *     are overwhelmingly biotech and biotech tools, a different game with
 *     different catalysts (trial readouts, not product cycles).
 *   - 4813 / 4899 (telecom carriers, satellite services) — capital-structure
 *     stories, not technology ones. Add with `--include-sic` if wanted.
 */
export const TECH_SIC_RANGES: Array<{ from: number; to: number; label: string }> = [
  { from: 3559, to: 3559, label: 'Semiconductor capital equipment' },
  { from: 3570, to: 3579, label: 'Computer & office equipment' },
  { from: 3651, to: 3651, label: 'Audio & video equipment' },
  { from: 3661, to: 3669, label: 'Communications equipment' },
  { from: 3670, to: 3679, label: 'Semiconductors & electronic components' },
  { from: 3690, to: 3695, label: 'Electrical & magnetic/optical media' },
  { from: 3760, to: 3769, label: 'Guided missiles & space vehicles' },
  { from: 3812, to: 3812, label: 'Search, detection, navigation & guidance' },
  { from: 3825, to: 3825, label: 'Instruments for measuring electricity' },
  { from: 3827, to: 3827, label: 'Optical instruments & lenses' },
  { from: 7370, to: 7379, label: 'Software, IT & data-processing services' },
];

/** The tech-group label for a SIC code, or null when it isn't a tech code. */
export function techSicLabel(sic: string): string | null {
  const n = Number(sic);
  if (!Number.isFinite(n) || n <= 0) return null;
  return TECH_SIC_RANGES.find((r) => n >= r.from && n <= r.to)?.label ?? null;
}

/** Whether a SIC code falls in the tech set above. */
export function isTechSic(sic: string): boolean {
  return techSicLabel(sic) != null;
}

/**
 * Parse a `--include-sic=7372,3674-3679` style list into a matcher that can be
 * OR'd with (or substituted for) the default tech set.
 */
export function parseSicRanges(spec: string): Array<{ from: number; to: number }> {
  const out: Array<{ from: number; to: number }> = [];
  for (const part of spec.split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = /^(\d{2,4})(?:\s*-\s*(\d{2,4}))?$/.exec(part);
    if (!m) throw new Error(`bad SIC spec: "${part}" (want 7372 or 3674-3679)`);
    const from = Number(m[1]);
    const to = m[2] ? Number(m[2]) : from;
    if (to < from) throw new Error(`bad SIC range: "${part}" (end before start)`);
    out.push({ from, to });
  }
  return out;
}

/** Whether a SIC code falls inside any of the given ranges. */
export function sicInRanges(sic: string, ranges: Array<{ from: number; to: number }>): boolean {
  const n = Number(sic);
  if (!Number.isFinite(n) || n <= 0) return false;
  return ranges.some((r) => n >= r.from && n <= r.to);
}
