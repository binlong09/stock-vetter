// 8-K parsing.
//
// 8-Ks do not have Item 7 or Item 8, so `sec-parser.ts`'s anchor scoring —
// which is built around long, bold, top-level Reg S-K section headings in a
// 200-page document — has nothing to bite on. They are short (often under
// 2,000 words), their items are numbered `N.NN`, and the substance frequently
// isn't in the 8-K body at all: it's in an attached EX-99.1 press release,
// with the body saying little more than "see Exhibit 99.1".
//
// Two things matter here for short work:
//
//  1. Item 4.02 — "Non-Reliance on Previously Issued Financial Statements" —
//     is a company telling the market its past numbers were wrong. Item 4.01
//     (auditor change), 3.01 (delisting notice) and 2.04 (debt acceleration
//     triggered) are the next tier. These need NO model to detect. Reading the
//     item number is enough, and a deterministic detector can't be talked out
//     of its finding by a persuasive narrative the way a model can.
//
//  2. The earnings 8-K (Item 2.02) is the fastest-moving quantitative
//     disclosure a company makes — it lands weeks before the 10-Q that
//     contains the same figures.

import { renderFilingLayout, type LayoutBlock } from './sec-layout.js';

/** How much a bare item number, with no reading of the content, should move us. */
export type ItemSeverity = 'critical' | 'high' | 'medium' | 'low';

export type EightKItemDef = {
  number: string; // "4.02"
  label: string;
  severity: ItemSeverity;
  /** Why this matters to a short thesis. Surfaced in the brief. */
  shortSideNote?: string;
};

// Not exhaustive — the full Form 8-K instruction list runs to ~30 items. These
// are the ones that carry information about deteriorating financial condition,
// which is what this pipeline is for. Unlisted items still parse; they just
// get 'low' severity.
export const EIGHTK_ITEMS: EightKItemDef[] = [
  { number: '1.01', label: 'Entry into a Material Definitive Agreement', severity: 'medium' },
  { number: '1.02', label: 'Termination of a Material Definitive Agreement', severity: 'high', shortSideNote: 'Lost contract or terminated credit facility.' },
  { number: '1.03', label: 'Bankruptcy or Receivership', severity: 'critical' },
  { number: '2.01', label: 'Completion of Acquisition or Disposition of Assets', severity: 'medium' },
  { number: '2.02', label: 'Results of Operations and Financial Condition', severity: 'medium', shortSideNote: 'Earnings release; the quantitative disclosure that leads the 10-Q.' },
  { number: '2.03', label: 'Creation of a Direct Financial Obligation', severity: 'medium', shortSideNote: 'New debt — check terms against existing covenants.' },
  { number: '2.04', label: 'Triggering Events That Accelerate a Financial Obligation', severity: 'critical', shortSideNote: 'A covenant broke. Debt may be immediately due.' },
  { number: '2.05', label: 'Costs Associated with Exit or Disposal Activities', severity: 'high', shortSideNote: 'Restructuring — often the first admission a segment is failing.' },
  { number: '2.06', label: 'Material Impairments', severity: 'high', shortSideNote: 'Write-down of assets acquired at prices management now disowns.' },
  { number: '3.01', label: 'Notice of Delisting or Failure to Satisfy a Listing Rule', severity: 'critical' },
  { number: '3.02', label: 'Unregistered Sales of Equity Securities', severity: 'high', shortSideNote: 'Dilution, often on punitive terms when other financing is closed.' },
  { number: '3.03', label: 'Material Modification to Rights of Security Holders', severity: 'high' },
  { number: '4.01', label: "Changes in Registrant's Certifying Accountant", severity: 'critical', shortSideNote: 'Auditor change. Read for disagreements and reportable conditions.' },
  { number: '4.02', label: 'Non-Reliance on Previously Issued Financial Statements', severity: 'critical', shortSideNote: 'A restatement. The company is withdrawing its own numbers.' },
  { number: '5.01', label: 'Changes in Control of Registrant', severity: 'medium' },
  { number: '5.02', label: 'Departure or Election of Directors or Officers', severity: 'high', shortSideNote: 'CFO or auditor-facing departures cluster ahead of restatements.' },
  { number: '5.03', label: 'Amendments to Articles or Bylaws; Change in Fiscal Year', severity: 'medium', shortSideNote: 'A fiscal-year change can reset comparability and hide a bad period.' },
  { number: '7.01', label: 'Regulation FD Disclosure', severity: 'low' },
  { number: '8.01', label: 'Other Events', severity: 'low' },
  { number: '9.01', label: 'Financial Statements and Exhibits', severity: 'low' },
];

const ITEM_BY_NUMBER = new Map(EIGHTK_ITEMS.map((i) => [i.number, i]));

export type EightKItem = {
  number: string;
  label: string;
  severity: ItemSeverity;
  shortSideNote?: string;
  /** Body text for this item, markdown-rendered (tables preserved). */
  body: string;
};

export type ParsedEightK = {
  items: EightKItem[];
  /** Highest severity across the items present. */
  maxSeverity: ItemSeverity;
  /** Item numbers seen that aren't in EIGHTK_ITEMS. */
  unknownItems: string[];
  blocks: LayoutBlock[];
};

const SEVERITY_RANK: Record<ItemSeverity, number> = { low: 0, medium: 1, high: 2, critical: 3 };

export function maxSeverity(items: { severity: ItemSeverity }[]): ItemSeverity {
  let best: ItemSeverity = 'low';
  for (const i of items) if (SEVERITY_RANK[i.severity] > SEVERITY_RANK[best]) best = i.severity;
  return best;
}

// "Item 4.02" / "ITEM 4.02." / "Item 4.02(a)". Anchored at block start so a
// mid-sentence cross-reference ("as described in Item 9.01 below") doesn't
// open a spurious section.
const EIGHTK_ITEM_RE = /^\s*item\s+(\d\.\d{2})\s*(?:\([a-z]\))?\s*[.:—–-]?\s*/i;

/**
 * Parse 8-K HTML into its items.
 *
 * Unlike the 10-K parser this needs no anchor scoring: 8-Ks have no table of
 * contents to be confused by, and every item heading is a block of its own.
 */
export function parseEightK(html: string): ParsedEightK {
  const blocks = renderFilingLayout(html);

  // Locate item headings. A heading block whose text begins with "Item N.NN"
  // opens a new item; everything until the next such block is its body.
  const starts: { idx: number; number: string }[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (b.kind === 'table') continue;
    const m = EIGHTK_ITEM_RE.exec(b.text);
    if (!m) continue;
    // Guard against a long paragraph that merely opens with a cross-reference.
    // Real item headings are short, or are immediately followed by the item's
    // own title text on the same line.
    if (b.text.length > 300) continue;
    starts.push({ idx: i, number: m[1]! });
  }

  const items: EightKItem[] = [];
  const unknownItems: string[] = [];
  for (let s = 0; s < starts.length; s++) {
    const { idx, number } = starts[s]!;
    const end = s + 1 < starts.length ? starts[s + 1]!.idx : blocks.length;
    const def = ITEM_BY_NUMBER.get(number);
    if (!def) unknownItems.push(number);
    const body = blocks
      .slice(idx, end)
      .map((b) => b.markdown)
      .join('\n\n')
      .trim();
    items.push({
      number,
      label: def?.label ?? `Item ${number}`,
      severity: def?.severity ?? 'low',
      shortSideNote: def?.shortSideNote,
      body,
    });
  }

  return { items, maxSeverity: maxSeverity(items), unknownItems, blocks };
}

/** Item numbers whose mere presence justifies escalating to the cloud model. */
export function criticalItems(parsed: ParsedEightK): EightKItem[] {
  return parsed.items.filter((i) => i.severity === 'critical' || i.severity === 'high');
}
