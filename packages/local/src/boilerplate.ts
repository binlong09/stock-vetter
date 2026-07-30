// Deterministic boilerplate removal — Phase 1, no model involved.
//
// A 10-K's Item 7 + Item 8 runs 200K-350K characters. A large fraction of it
// is text that is legally required, identical year over year, identical across
// companies, and carries no information about the business: safe-harbor
// recitals, the standard PCAOB audit-scope paragraphs, "the accompanying notes
// are an integral part of these financial statements" repeated on every page,
// running headers, signature blocks. Stripping it is the cheapest token
// reduction available and it costs nothing in signal.
//
// THE RISK, and how this module handles it. Boilerplate rules are pattern
// matches, and the highest-value sentences in a filing sit inside paragraphs
// that look like boilerplate. "Management identified a material weakness in
// internal control over financial reporting" appears inside the ICFR report,
// which is otherwise pure recital. "Substantial doubt about our ability to
// continue as a going concern" appears inside the accounting-policies note.
// Deleting those is not a small error — it is deleting the thesis.
//
// So: PROTECTED_PHRASES wins over every rule. A block containing one is never
// removed no matter how much boilerplate surrounds it. This is deliberately
// asymmetric — keeping a boilerplate paragraph costs a few hundred tokens,
// dropping a material-weakness disclosure costs the entire analysis.
//
// Every removal is counted and attributed to a rule, and `strippedFraction`
// is reported upward so an over-aggressive rule shows up as a number rather
// than as a quietly worse answer.

import type { LayoutBlock } from '@stock-vetter/core';

// If any of these appear in a block, that block survives. Case-insensitive.
// Bias hard toward over-inclusion: a false positive here costs tokens, a
// false negative costs the finding.
const PROTECTED_PHRASES = [
  'material weakness',
  'significant deficiency',
  'going concern',
  'substantial doubt',
  'restat', // restate / restated / restatement
  'non-reliance',
  'should no longer be relied upon',
  'adverse opinion',
  'qualified opinion',
  'disagreement',
  'critical audit matter',
  'covenant',
  'default',
  'forbearance',
  'impairment',
  'write-down',
  'write-off',
  'subsequent event',
  'contingenc',
  'investigation',
  'subpoena',
  'sec comment letter',
  'change in accounting',
  // NOT bare 'error': the standard PCAOB audit paragraph contains "whether due
  // to error or fraud", so protecting on it would make the audit-scope rule a
  // no-op on every filing.
  'accounting error',
  'material error',
  'irregularit',
  'dismissed',
  'resigned',
];

function isProtected(text: string): boolean {
  const t = text.toLowerCase();
  return PROTECTED_PHRASES.some((p) => t.includes(p));
}

export type StripRule = {
  id: string;
  why: string;
  test: (text: string, block: LayoutBlock) => boolean;
};

// Ordered most-specific first; the first matching rule gets the attribution.
export const STRIP_RULES: StripRule[] = [
  {
    id: 'safe-harbor',
    why: 'PSLRA forward-looking-statements recital — statutory, identical every year',
    test: (t) =>
      /forward[- ]looking statements?/i.test(t) &&
      /(private securities litigation reform act|section 27a|section 21e|actual results (?:could|may) differ materially|undertake no obligation to (?:update|revise))/i.test(t),
  },
  {
    id: 'notes-legend',
    why: 'Per-page legend attached to every financial statement',
    test: (t) =>
      /^(?:see\s+)?the accompanying notes are an integral part/i.test(t.trim()) ||
      /^see accompanying notes/i.test(t.trim()),
  },
  {
    id: 'audit-scope',
    why: 'Standard PCAOB audit-scope language; Critical Audit Matters are protected separately',
    // Filers write "standards of the PCAOB" as often as they spell it out —
    // CHD's 2025 10-K uses the abbreviation exclusively, so a rule keyed only
    // on the long form silently matches nothing.
    test: (t) =>
      /we conducted our audits? in accordance with the standards of the (?:public company accounting oversight board|pcaob)/i.test(t) ||
      /our audits? included performing procedures to assess the risks of material misstatement/i.test(t) ||
      /we are a public accounting firm registered with the (?:public company accounting oversight board|pcaob)/i.test(t),
  },
  {
    id: 'icfr-recital',
    why: "Definition of internal control over financial reporting — verbatim from the rule, not about this company",
    test: (t) =>
      /internal control over financial reporting is a process designed to provide reasonable assurance/i.test(t) ||
      /because of its inherent limitations, internal control over financial reporting may not prevent or detect misstatements/i.test(
        t,
      ),
  },
  {
    id: 'page-furniture',
    why: 'Running headers, page numbers, TOC breadcrumbs',
    test: (t) => {
      const s = t.trim();
      if (!s) return true;
      if (/^table of contents$/i.test(s)) return true;
      if (/^(page\s*)?\d{1,3}$/i.test(s)) return true;
      if (/^form\s+10-[kq]$/i.test(s)) return true;
      // "Apple Inc. | 2025 Form 10-K | 34"
      if (s.length < 120 && /\|/.test(s) && /form\s+10-[kq]/i.test(s)) return true;
      return false;
    },
  },
  {
    id: 'signature-block',
    why: 'Signature page — names and dates, no disclosure',
    test: (t) =>
      /^pursuant to the requirements of (the securities exchange act|section 13)/i.test(t.trim()) ||
      /^\/s\/\s/i.test(t.trim()),
  },
  {
    id: 'exhibit-index',
    why: 'Exhibit index — filenames and incorporation-by-reference pointers',
    test: (t) => /^exhibit (index|no\.?)/i.test(t.trim()) || /incorporated by reference to exhibit/i.test(t),
  },
  {
    id: 'xbrl-artifact',
    why: 'Inline-XBRL rendering residue',
    test: (t) => /^(iso4217:|xbrli:|us-gaap:|\d+ ?false ?true)/i.test(t.trim()),
  },
];

export type StripReport = {
  ruleId: string;
  why: string;
  blocksRemoved: number;
  charsRemoved: number;
};

export type StripResult = {
  blocks: LayoutBlock[];
  reports: StripReport[];
  charsBefore: number;
  charsAfter: number;
  /** 0..1. A value above ~0.5 means a rule is probably eating real content. */
  strippedFraction: number;
  /** Blocks that matched a rule but were kept because of a protected phrase. */
  protectedFromStripping: number;
  warnings: string[];
};

export type StripOptions = {
  /** Rule ids to skip. */
  disable?: string[];
  /** Above this stripped fraction, emit a warning. Default 0.5. */
  warnFractionOver?: number;
};

/**
 * Remove boilerplate blocks, keeping a per-rule audit trail.
 *
 * Tables are never removed. A financial table is data by definition, and no
 * boilerplate rule has any business deleting one.
 */
export function stripBoilerplate(blocks: LayoutBlock[], opts: StripOptions = {}): StripResult {
  const disabled = new Set(opts.disable ?? []);
  const rules = STRIP_RULES.filter((r) => !disabled.has(r.id));
  const byRule = new Map<string, StripReport>();
  const kept: LayoutBlock[] = [];
  let charsBefore = 0;
  let protectedCount = 0;

  for (const b of blocks) {
    charsBefore += b.markdown.length;
    if (b.kind === 'table') {
      kept.push(b);
      continue;
    }
    const matched = rules.find((r) => r.test(b.text, b));
    if (!matched) {
      kept.push(b);
      continue;
    }
    if (isProtected(b.text)) {
      protectedCount++;
      kept.push(b);
      continue;
    }
    const rep = byRule.get(matched.id) ?? {
      ruleId: matched.id,
      why: matched.why,
      blocksRemoved: 0,
      charsRemoved: 0,
    };
    rep.blocksRemoved++;
    rep.charsRemoved += b.markdown.length;
    byRule.set(matched.id, rep);
  }

  const charsAfter = kept.reduce((n, b) => n + b.markdown.length, 0);
  const strippedFraction = charsBefore ? (charsBefore - charsAfter) / charsBefore : 0;
  const warnings: string[] = [];
  const limit = opts.warnFractionOver ?? 0.5;
  if (strippedFraction > limit) {
    warnings.push(
      `boilerplate stripping removed ${(strippedFraction * 100).toFixed(1)}% of the section ` +
        `(${charsBefore - charsAfter} of ${charsBefore} chars) — review STRIP_RULES before trusting this filing`,
    );
  }

  return {
    blocks: kept,
    reports: [...byRule.values()].sort((a, b) => b.charsRemoved - a.charsRemoved),
    charsBefore,
    charsAfter,
    strippedFraction,
    protectedFromStripping: protectedCount,
    warnings,
  };
}
