// 10-K / 10-Q section extraction. The naive approach (find "Item N." in
// cleaned text) fails because filings contain three competing kinds of
// "Item N." occurrences: real section anchors, table-of-contents entries,
// and cross-references. POC observation across META, KO, BRK.B, CHD, JPM:
// real anchors are reliably distinguishable by DOM structure — they are
// bold (`font-weight:700`), live as direct children of `<body>` rather than
// inside `<table>` cells, and don't have a trailing page number glued to
// the section title. We score each candidate anchor by these signals and
// pick the highest-scoring per item.

import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { ItemDef } from './sec-constants.js';
import { EXPECTED_SECTION_LENGTHS, lengthConfidence } from './sec-constants.js';

// cheerio uses `AnyNode` from the `domhandler` package internally. To avoid
// adding domhandler as a direct dependency just for one type annotation,
// we use `any` at the parser boundaries — this is internal code and type
// safety on DOM nodes isn't critical here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DomElement = any;

export type AnchorCandidate = {
  itemNumber: string;
  text: string;
  score: number;
  signals: string[];
  pos: number; // position in document order (element index)
  textPos: number; // position in cleaned full-text (char index)
  tag: string;
  // For debugging when an extraction goes wrong.
  styleSnippet: string;
  parentChain: string;
};

export type ExtractedSection = {
  id: string;
  label: string;
  itemNumber: string;
  charLength: number;
  body: string;
  preview: string;
  confidence: 'high' | 'low' | 'failed';
  warnings: string[];
  // Bundled sections: when this section's content is incorporated by
  // reference into another section (or vice versa), both reference each
  // other here. Downstream consumers (the value-checklist dimension router)
  // must treat any bundled set as one corpus for prompts.
  // Example: JPM's MD&A is a 394-char stub; Item 8 contains both. Result:
  //   mda.bundled = ['financial-statements'] and
  //   financial-statements.bundled = ['mda']
  bundled?: string[];
  // The chosen anchor and (optionally) the runners-up for debug.
  chosenAnchor: { text: string; score: number; signals: string[]; pos: number };
  rejectedAnchors?: { text: string; score: number; signals: string[]; pos: number }[];
};

export type ParseResult = {
  sections: ExtractedSection[];
  missing: string[]; // item ids the parser couldn't find a credible anchor for
  cleanedTextLength: number;
  parserWarnings: string[];
};

export type ParseOptions = {
  debug?: boolean; // include rejected anchors in output
};

// Match "Item N." or "ITEM N." or "Item NA." with optional whitespace.
const ITEM_RE = /^\s*item\s+(\d+[a-z]?)\s*\.?/i;
// Trailing page number indicates TOC entry: "Item 8.Financial Statements...82"
const HAS_TRAILING_PAGE_NUMBER = /\d+\s*$/;

function styleHasBold(style: string): boolean {
  // SEC filings often use inline styles. font-weight:700 or font-weight:bold both indicate bold.
  // Treat anything >=600 as bold-ish.
  const m = style.match(/font-weight\s*:\s*(\d+|bold)/i);
  if (!m) return false;
  if (m[1]!.toLowerCase() === 'bold') return true;
  return parseInt(m[1]!, 10) >= 600;
}

// Some filers (notably JPM) use larger font-size, not bold, for section
// headings. Body text in SEC filings is typically 10pt; headings >= 12pt.
function styleHasLargerFont(style: string): boolean {
  const m = style.match(/font-size\s*:\s*(\d+(?:\.\d+)?)\s*pt/i);
  if (!m) return false;
  return parseFloat(m[1]!) >= 11.5;
}

function styleHasBlueColor(style: string): boolean {
  return /color\s*:\s*#0000ff/i.test(style);
}

function isInsideTable($el: cheerio.Cheerio<DomElement>): boolean {
  return $el.parents('table').length > 0;
}

function isUnderTopLevelBody($el: cheerio.Cheerio<DomElement>): boolean {
  // Real anchors at META are <div> direct children of <body>.
  // We check: parent chain contains <body> within 1-2 hops, and no <table> in the chain.
  const parents = $el.parents().toArray();
  const tags = parents.map((p) => (p as { tagName?: string }).tagName?.toLowerCase() ?? '');
  if (tags.includes('table')) return false;
  // First non-self ancestor is <body> or <html>. Direct-child-of-body anchors score highest.
  return tags[0] === 'body' || tags[0] === 'html';
}

function scoreAnchor(
  $: CheerioAPI,
  el: DomElement,
  text: string,
): { score: number; signals: string[] } {
  const $el = $(el);
  const style = ($el.attr('style') ?? '').replace(/\s+/g, ' ');
  const tag = el.tagName?.toLowerCase() ?? '';
  const signals: string[] = [];
  let score = 0;

  // Heading-tag signal: standard HTML headings.
  if (['h1', 'h2', 'h3', 'h4'].includes(tag)) {
    score += 4;
    signals.push(`heading-tag:${tag}`);
  }
  // Bold / strong inline element.
  if (['strong', 'b'].includes(tag)) {
    score += 2;
    signals.push(`bold-tag:${tag}`);
  }
  // Inline style indicating bold. SEC filings rely heavily on this. Most
  // common pattern: a non-bold <div> wraps a bold <span> with the heading
  // text. Credit the parent for any bold descendant.
  let descendantBold = false;
  if (!styleHasBold(style)) {
    $el.find('[style]').each((_, child) => {
      const cs = ($(child).attr('style') ?? '').replace(/\s+/g, ' ');
      if (styleHasBold(cs)) {
        descendantBold = true;
        return false; // break out of .each
      }
      return undefined;
    });
  }
  if (styleHasBold(style)) {
    score += 3;
    signals.push('inline-bold');
  } else if (descendantBold) {
    score += 3;
    signals.push('descendant-bold');
  }
  // Larger font-size on this element or any descendant is a heading signal.
  let largerFont = styleHasLargerFont(style);
  if (!largerFont) {
    $el.find('[style]').each((_, child) => {
      const cs = ($(child).attr('style') ?? '').replace(/\s+/g, ' ');
      if (styleHasLargerFont(cs)) {
        largerFont = true;
        return false;
      }
      return undefined;
    });
  }
  if (largerFont) {
    score += 2;
    signals.push('larger-font');
  }
  // All-caps text, e.g. "ITEM 1A. RISK FACTORS" — common in CHD-style filings.
  // Restrict to text that's short enough to actually be a heading.
  if (text.length < 200 && text === text.toUpperCase() && /[A-Z]/.test(text)) {
    score += 2;
    signals.push('all-caps');
  }
  // STRONG NEGATIVE SIGNALS:
  // Inside a <table> = TOC entry. Heavy penalty.
  if (isInsideTable($el)) {
    score -= 5;
    signals.push('-inside-table');
  }
  // Hyperlink colored blue = TOC navigation link.
  if (styleHasBlueColor(style)) {
    score -= 4;
    signals.push('-blue-link-color');
  }
  if (tag === 'a') {
    score -= 3;
    signals.push('-anchor-tag');
  }
  // Trailing page number on text = TOC entry. "Item 8.Financial Statements...82"
  if (HAS_TRAILING_PAGE_NUMBER.test(text)) {
    score -= 4;
    signals.push('-trailing-page-number');
  }
  // Direct child of <body> with no table ancestors = strong positive.
  if (isUnderTopLevelBody($el)) {
    score += 2;
    signals.push('top-level-body-descendant');
  }
  // Very long text = likely a paragraph, not a heading.
  if (text.length > 300) {
    score -= 3;
    signals.push('-long-text');
  }
  return { score, signals };
}

function collectCandidates(
  $: CheerioAPI,
  fullText: string,
  itemNumbers: Set<string>,
): Map<string, AnchorCandidate[]> {
  // To map elements to fullText offsets, walk the document in order and
  // maintain a "next-search-from" cursor. For each element we want a
  // candidate for, find its text in fullText starting from the cursor.
  // The cursor advances past each match, so children of containers we've
  // already visited don't re-find earlier occurrences.
  const byItem = new Map<string, AnchorCandidate[]>();
  let pos = 0;
  let textCursor = 0;
  $('body *').each((_, el) => {
    const $el = $(el);
    // Use full text but limit to avoid scoring container divs.
    const elText = $el.text().trim();
    if (!elText || elText.length > 500) {
      pos++;
      return;
    }
    const m = ITEM_RE.exec(elText);
    if (!m) {
      pos++;
      return;
    }
    const itemNumber = m[1]!.toUpperCase();
    if (!itemNumbers.has(itemNumber)) {
      pos++;
      return;
    }
    // Locate this element's text in fullText, starting from the cursor.
    // We don't advance the cursor for every match (children would lose their
    // own positions); instead we use the *element index in document order*
    // as a tiebreaker so adjacent matches are nearby in textPos too.
    // Practical search key: first 40 chars of normalized text. If this
    // element's text is short ("Item 1."), the indexOf will find the
    // earliest occurrence at-or-after cursor — which is what we want for
    // disambiguating TOC vs real anchors, since the cursor will have
    // already advanced past the TOC by the time we hit real anchors.
    const searchKey = elText.replace(/\s+/g, ' ').slice(0, 40);
    let textPos = fullText.indexOf(searchKey, textCursor);
    if (textPos === -1) textPos = fullText.indexOf(searchKey);
    const tag = el.tagName?.toLowerCase() ?? '';
    const style = ($el.attr('style') ?? '').replace(/\s+/g, ' ');
    const { score, signals } = scoreAnchor($, el, elText);
    const parents = $el
      .parents()
      .map((_i, p) => (p as { tagName?: string }).tagName ?? '')
      .toArray()
      .slice(0, 4)
      .join('>');
    const cand: AnchorCandidate = {
      itemNumber,
      text: elText.slice(0, 200),
      score,
      signals,
      pos,
      textPos,
      tag,
      styleSnippet: style.slice(0, 80),
      parentChain: parents,
    };
    if (!byItem.has(itemNumber)) byItem.set(itemNumber, []);
    byItem.get(itemNumber)!.push(cand);
    // Advance textCursor past this match for parent-level elements (those
    // with longer text) — but for very short matches like "Item 1." that
    // are children inside another match, don't advance the cursor or we
    // skip past the real anchor that comes later.
    if (textPos !== -1 && elText.length > 30) {
      textCursor = Math.max(textCursor, textPos + searchKey.length);
    }
    pos++;
  });
  return byItem;
}

function dedupeNestedAnchors(
  candidates: AnchorCandidate[],
): AnchorCandidate[] {
  // When the DOM has <div>Item 1.<span>Item 1.</span>Business</div>, both the
  // div and inner span get scored. The div has more representative text
  // ("Item 1.Business") and is the right anchor. The span has just "Item 1.".
  // Strategy: when two candidates are within ~5 positions of each other and
  // one's text starts with the other's text, keep the one with the longer
  // text (i.e. the parent containing more context).
  if (!candidates.length) return [];
  const sorted = [...candidates].sort((a, b) => a.pos - b.pos);
  const result: AnchorCandidate[] = [];
  for (const c of sorted) {
    const last = result[result.length - 1];
    if (last && c.pos - last.pos <= 5) {
      // Adjacent — pick the one with longer text. If text length is equal,
      // pick the higher-scoring.
      if (c.text.length > last.text.length) {
        // Inherit any positive signals from the shorter one (e.g., a
        // bold child's bold signal might already be on the longer one,
        // but be defensive).
        const merged: AnchorCandidate = {
          ...c,
          score: Math.max(c.score, last.score),
          signals: Array.from(new Set([...c.signals, ...last.signals])),
        };
        result[result.length - 1] = merged;
      } else if (c.text.length === last.text.length && c.score > last.score) {
        result[result.length - 1] = c;
      }
      continue;
    }
    result.push(c);
  }
  return result;
}

export function parseFiling(html: string, items: ItemDef[], options: ParseOptions = {}): ParseResult {
  const $ = cheerio.load(html);
  $('script, style, head, noscript').remove();
  // Build a cleaned-text version we'll slice section bodies from. We need a
  // way to map DOM elements back to positions in this string. Approach:
  // walk the DOM in document order and concatenate text nodes, recording
  // a position offset for each element we visit. Then anchor candidates
  // can use those offsets for slice boundaries.
  const fullText = $('body').text().replace(/\s+/g, ' ').trim();
  const itemNumbers = new Set(items.map((i) => i.itemNumber));
  const candidatesByItem = collectCandidates($, fullText, itemNumbers);

  // Pick the best anchor per item. Ties broken by document position
  // (real anchors come after TOC, so prefer later positions when scores tie).
  const chosenAnchors: { item: ItemDef; anchor: AnchorCandidate; rejected: AnchorCandidate[] }[] = [];
  const missing: string[] = [];
  for (const item of items) {
    const cands = dedupeNestedAnchors(candidatesByItem.get(item.itemNumber) ?? []);
    if (!cands.length) {
      missing.push(item.id);
      continue;
    }
    // Pick highest score, with later position breaking ties.
    cands.sort((a, b) => (b.score - a.score) || (b.pos - a.pos));
    const best = cands[0]!;
    // If even the best candidate is strongly negative, treat as missing.
    if (best.score < -2) {
      missing.push(item.id);
      continue;
    }
    chosenAnchors.push({ item, anchor: best, rejected: cands.slice(1, 4) });
  }

  // Sort chosen anchors by their text position to build sections in order.
  chosenAnchors.sort((a, b) => a.anchor.textPos - b.anchor.textPos);
  const sections: ExtractedSection[] = [];

  for (let k = 0; k < chosenAnchors.length; k++) {
    const { item, anchor, rejected } = chosenAnchors[k]!;
    const textPos = anchor.textPos;
    if (textPos < 0) {
      missing.push(item.id);
      continue;
    }
    const end = k + 1 < chosenAnchors.length ? chosenAnchors[k + 1]!.anchor.textPos : fullText.length;
    const body = fullText.slice(textPos, end).trim();
    const charLength = body.length;
    const confidence = lengthConfidence(item.id, charLength);
    const warnings: string[] = [];
    // Detect incorporation-by-reference stubs: short section whose body is
    // dominated by phrases like "See", "Refer to", "incorporated herein",
    // "appears under", "see Item N". JPM/BRK.B/CHD all do this for Item 7A.
    // Stub sections announce themselves at the top, not at the end. A real
    // section with one closing cross-reference shouldn't be flagged.
    const stubProbe = body.slice(0, 500);
    const incorpByRef =
      charLength < 3000 &&
      /(?:see|refer to|appears under|appears on pages?|incorporated herein by reference|this information appears)/i.test(stubProbe);
    if (incorpByRef) {
      warnings.push('incorporation-by-reference: real content lives elsewhere in the filing');
    }
    if (confidence === 'low') {
      warnings.push(`Section length ${charLength} below expected floor for ${item.id}`);
    } else if (confidence === 'failed' && !incorpByRef) {
      warnings.push(`Section length ${charLength} far below floor — likely TOC entry or missing content`);
    }
    sections.push({
      id: item.id,
      label: item.label,
      itemNumber: item.itemNumber,
      charLength,
      body,
      preview: body.slice(0, 250),
      confidence,
      warnings,
      chosenAnchor: { text: anchor.text, score: anchor.score, signals: anchor.signals, pos: anchor.pos },
      rejectedAnchors: options.debug
        ? rejected.map((r) => ({ text: r.text, score: r.score, signals: r.signals, pos: r.pos }))
        : undefined,
    });
  }

  // Bundled-content detection. When a section is an incorporation-by-reference
  // stub AND a nearby section is suspiciously large, we infer the stub's
  // real content was absorbed into the larger section. Mark both with a
  // `bundled` field so downstream consumers (the value-checklist dimension
  // router) treat them as a single corpus.
  //
  // Heuristic: for each stub section S, walk forward (and then backward) in
  // document order skipping over adjacent stubs, until a non-stub section
  // is found. If that section's length is at least its own typical value
  // PLUS half of S's typical, treat S as bundled into it. The "+half typical"
  // threshold is intentionally conservative — we only mark when the bigger
  // section is *visibly* carrying the stub's content.
  //
  // Skipping over intermediate stubs matters for JPM, where MD&A and
  // Quant-Risk are both stubs back-to-back, and both are absorbed into
  // Item 8 two and one hops away respectively.
  const isStub = (s: ExtractedSection): boolean =>
    s.warnings.some((w) => w.startsWith('incorporation-by-reference')) &&
    s.charLength < 3000;

  for (let k = 0; k < sections.length; k++) {
    const s = sections[k]!;
    if (!isStub(s)) continue;
    // Find the next non-stub forward and the previous non-stub backward.
    let forward: ExtractedSection | null = null;
    for (let j = k + 1; j < sections.length; j++) {
      if (!isStub(sections[j]!)) { forward = sections[j]!; break; }
    }
    let backward: ExtractedSection | null = null;
    for (let j = k - 1; j >= 0; j--) {
      if (!isStub(sections[j]!)) { backward = sections[j]!; break; }
    }
    const candidates = [forward, backward].filter((x): x is ExtractedSection => x !== null);
    for (const neighbor of candidates) {
      const stubExpected = EXPECTED_SECTION_LENGTHS[s.id];
      const neighborExpected = EXPECTED_SECTION_LENGTHS[neighbor.id];
      if (!stubExpected || !neighborExpected) continue;
      const threshold = neighborExpected.typical + Math.floor(stubExpected.typical / 2);
      if (neighbor.charLength >= threshold) {
        s.bundled = Array.from(new Set([...(s.bundled ?? []), neighbor.id]));
        neighbor.bundled = Array.from(new Set([...(neighbor.bundled ?? []), s.id]));
        s.warnings.push(`bundled into "${neighbor.id}" (${neighbor.charLength.toLocaleString()} chars vs threshold ${threshold.toLocaleString()})`);
        neighbor.warnings.push(`absorbed bundled content from "${s.id}"`);
        break; // one bundling target is enough
      }
    }
  }

  // Anchor was "missing" if either no candidate or extraction failed.
  // Add anchor-failed items to missing if not already there. Exception:
  // sections that are bundled into another section are *not* missing —
  // their content is available, just under another id.
  for (const s of sections) {
    if (s.confidence === 'failed' && !missing.includes(s.id) && !s.bundled?.length) {
      missing.push(s.id);
    }
  }

  // Top-level parser warnings: items with no anchor at all.
  const parserWarnings: string[] = [];
  for (const id of missing) {
    parserWarnings.push(`Item not extracted cleanly: ${id}`);
  }

  return {
    sections,
    missing,
    cleanedTextLength: fullText.length,
    parserWarnings,
  };
}
