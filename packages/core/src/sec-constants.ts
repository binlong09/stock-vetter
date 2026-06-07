// Standard 10-K items per Reg S-K. Subset relevant to value-investing analysis.
// Aliases handle case variants we've observed in real filings; the parser
// matches against these in the DOM but the canonical id is what gets written
// to disk and referenced downstream.

export type ItemDef = {
  id: string;
  label: string;
  itemNumber: string; // canonical: "1", "1A", "7", "7A", "8"
};

export const TENK_ITEMS: ItemDef[] = [
  { id: 'business', label: 'Business', itemNumber: '1' },
  { id: 'risk-factors', label: 'Risk Factors', itemNumber: '1A' },
  { id: 'properties', label: 'Properties', itemNumber: '2' },
  { id: 'legal-proceedings', label: 'Legal Proceedings', itemNumber: '3' },
  { id: 'mda', label: "Management's Discussion and Analysis", itemNumber: '7' },
  { id: 'quant-risk', label: 'Quantitative and Qualitative Disclosures About Market Risk', itemNumber: '7A' },
  { id: 'financial-statements', label: 'Financial Statements', itemNumber: '8' },
];

// 10-Q is structurally different — fewer items, financials front-loaded.
// Item 1: Financial Statements; Item 2: MD&A; Item 3: Quant Risk; Item 4: Controls.
// Plus Part II Item 1A (risk factor updates).
export const TENQ_ITEMS: ItemDef[] = [
  { id: 'financial-statements', label: 'Financial Statements', itemNumber: '1' },
  { id: 'mda', label: "Management's Discussion and Analysis", itemNumber: '2' },
  { id: 'quant-risk', label: 'Quantitative and Qualitative Disclosures About Market Risk', itemNumber: '3' },
  // Risk factor updates live in Part II — same item number as 10-K but different document position.
  // We don't disambiguate by Part for now; if a 10-Q has updated risk factors, they'll merge.
  { id: 'risk-factors', label: 'Risk Factors (updates)', itemNumber: '1A' },
];

// Length floors for sanity checks. Below floor = parser warning.
// Below 30% of floor = treat as not-extracted.
// "typical" is a rough mid-range for benchmarking; not used for validation, only for debug context.
export type LengthExpectation = { floor: number; typical: number };
export const EXPECTED_SECTION_LENGTHS: Record<string, LengthExpectation> = {
  'business': { floor: 5_000, typical: 40_000 },
  'risk-factors': { floor: 15_000, typical: 80_000 },
  'properties': { floor: 500, typical: 5_000 },
  'legal-proceedings': { floor: 500, typical: 8_000 },
  'mda': { floor: 20_000, typical: 60_000 },
  'quant-risk': { floor: 2_000, typical: 30_000 },
  // Item 8 is the highest-stakes section. Real financial statements with notes
  // run 100K+ for any non-trivial filer. Anything under 50K is almost certainly
  // a TOC entry or an incorporation-by-reference stub.
  'financial-statements': { floor: 50_000, typical: 200_000 },
};

export function lengthConfidence(
  sectionId: string,
  charLength: number,
): 'high' | 'low' | 'failed' {
  const exp = EXPECTED_SECTION_LENGTHS[sectionId];
  if (!exp) return 'high'; // unknown section, no floor
  if (charLength < exp.floor * 0.3) return 'failed';
  if (charLength < exp.floor) return 'low';
  return 'high';
}
