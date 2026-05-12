# RDDT — Decision Card

**Verdict:** ⚪ Insufficient Data  •  **Weighted score:** 6.2 / 10

*Generated:* 2026-05-10  •  *10-K:* `0001713445-26-000022`  •  *Analyst videos:* 1

## Summary

RDDT returns an Insufficient Data verdict because three of six dimensions — moat durability, capital allocation, and cyclicality awareness — could not be scored from the filing extracts provided, with only table-of-contents stubs rather than substantive prose available for those sections. The data that does exist paints a mixed picture: a fortress balance sheet with ~$2.7B net cash and no meaningful debt is a genuine positive, but owner earnings quality is weak given that GAAP profitability only emerged in Q3 2024 and SBC runs at roughly 15% of revenues. The reverse DCF implies a 15.6% annual FCF CAGR is priced in over ten years — a demanding assumption for a business still proving its advertising monetization model — and the 1.88% FCF yield with no 10-year valuation median for context offers little margin of safety.

*Total LLM cost for this analysis:* $1.37 *(re-runs hit cache and cost $0).*

## Dimension scores

| Dimension | Score | Range | Uncertainty | Effective weight |
|---|---|---|---|---|
| Moat durability | **5.5** | — | ⚠️ **high** | 0.00 |
| Owner earnings quality | **4.0** | 0.0 | tight | 0.20 |
| Capital allocation | **5.5** | — | ⚠️ **high** | 0.00 |
| Debt sustainability | **9.0** | 0.0 | tight | 0.15 |
| Insider alignment | **6.5** | 0.5 | tight | 0.10 |
| Cyclicality awareness | **5.5** | — | ⚠️ **high** | 0.00 |

### Dimension reasoning

**Moat durability (5.5) *(high uncertainty)*:** Primary-source dimension marked insufficient: The business and risk-factors sections provided contain only header/page-reference text ('Item 1. Business6' and 'Item 1A. Risk Factors13...') with no substantive content. There is no actual prose describing Reddit's competitive position, pricing power, network effects, switching costs, or competitive risks to evaluate moat durability.

**Owner earnings quality (4.0):** Pass 2 found no new primary-source evidence that materially changes the calibration; it explicitly acknowledged that the concerns it identified — nascent profitability, uncertain sustainability, and SBC as a wedge between GAAP earnings and owner earnings — are already squarely reflected in Pass 1's score of 4. Pass 2 recommended zero adjustment and cited no additional passages. The primary sources confirm Pass 1's citations are accurate: net loss of $484.3M for FY2024, accumulated deficit of $671.1M, explicit management guidance for rising SBC and payroll costs, and management's own caution that losses may recur. Pass 1's score of 4 appropriately reflects these quality concerns.

**Capital allocation (5.5) *(high uncertainty)*:** Primary-source dimension marked insufficient: The MDA section provided contains only a table-of-contents stub (95 characters) with no actual narrative content on capital allocation, buybacks, dividends, or M&A activity. The financial-statements section provided is heavily truncated (79,905 of 416,337 characters) and the portion available consists almost entirely of forward-looking statement boilerplate, business description, risk factors, and user metric definitions — it does not include the cash flow statement, notes on acquisitions, debt notes, or the Liquidity and Capital Resources narrative that would be needed to evaluate how management has deployed capital. No share repurchase data (prices, volumes, timing), acquisition multiples, dividend history, or multi-year FCF/capex figures are present in the sections provided.

**Debt sustainability (9.0):** Pass 2 recommended zero adjustment and explicitly confirmed Pass 1's analysis, finding no additional structural concerns such as off-balance-sheet obligations, covenant triggers, pledged assets, or going-concern language. The primary sources corroborate the $2.7B net cash position, management's affirmation of liquidity sufficiency for at least 12 months, and the absence of any material long-term debt or covenant pressure. Pass 1's score of 9 is well-calibrated for an essentially unlevered balance sheet.

**Insider alignment (6.5):** Pass 2 confirmed it found no new material evidence beyond what Pass 1 already identified and weighed. Pass 2's observation about the no-hedging/pledging policy and clawback policy are minor positives already implicitly factored into Pass 1's 6.5 score. The core concerns — unknown Huffman ownership percentage, one-year RSU vesting, and 165% bonus payout despite DAUq miss — remain uncontested and appropriately weighted. Pass 2 recommended zero adjustment, and the primary sources support that conclusion.

**Cyclicality awareness (5.5) *(high uncertainty)*:** Primary-source dimension marked insufficient: The sections provided for risk-factors and mda contain only table-of-contents entries (page references and item titles) rather than actual substantive content. There is no prose from the Risk Factors section describing cyclical exposure, no MD&A narrative with multi-year revenue or margin trends, and no discussion of how Reddit's advertising-dependent business performed across economic cycles. Without the actual text of these sections, it is impossible to assess cyclicality awareness responsibly.

## Valuation context

- Reverse DCF (10% discount, 20× terminal): market is pricing in **15.6%** annual FCF growth for 10 years.

See `reverse-dcf.md` for full sensitivity grid.

## Cross-source findings (analyst vs. primary-source)

| Topic | Analyst view | Primary-source view | Agreement |
|---|---|---|---|
| Share dilution and buyback adequacy | SBC is ~15% of revenues but the $1B buyback authorization should partially offset ongoing dilution, making per-share projections more defensible. | Share count grew 39% (145M to 202M) in a single year. The $1B buyback is roughly 3.3% of current market cap and is materially insufficient to offset dilution at this pace; owner earnings quality is scored 4.0 reflecting this structural drag. | ✗ disagree |
| Balance sheet and solvency | Reddit has net cash of ~$2.75B, GAAP profitability, and positive FCF — a meaningful floor versus loss-making peers like Snapchat. | Debt sustainability scores 9.0 with a tight range; the net cash position is confirmed in the filing. The primary-source check notes that GAAP net income ($530M) exceeds EBIT ($442M), raising a flag about NOL utilization or non-operating income that m | ~ partial |
| Content moat and advertising monetization gap | Reddit's 100,000+ subreddits of aggregated human opinion are genuinely difficult to replicate and increasingly valuable as AI-generated content proliferates. | Moat durability could not be scored due to missing filing content, but the analyst's own data — Meta's ~$250+ US ARPU versus Reddit's ~$35 — illustrates that content uniqueness has not yet translated into advertising pricing power. | ~ partial |
| SMB advertiser scaling risk | Reddit faces structural difficulty attracting long-tail SMB advertisers needed for bid density and direct response scale, with Snap, Pinterest, and Twitter/X as cautionary comparables. | Cyclicality and capital allocation dimensions could not be scored, but the advertising revenue concentration and the absence of an SMB moat are consistent concerns across both sources. | ✓ agree |
| Data licensing revenue durability | OpenAI and Google licensing deals (~$60-70M each) are flagged as key revenue drivers of the Other Revenue segment. | The Other Revenue segment grew only 22% YoY versus 74% for advertising, suggesting deceleration. Renewal and termination risk for these contracts is not assessed by the analyst, and the primary-source filing does not disclose contract terms — this is | ✗ disagree |

### What the disagreements mean

The sharpest disagreement between the analyst and primary-source data is on dilution: the analyst frames the $1B buyback as a meaningful offset to SBC, but the filing shows share count grew 39% in a single year and the buyback covers only ~3.3% of market cap — this is a factual gap, not a judgment call, and the 10-K data should take precedence. The analyst also omits renewal risk on the data licensing contracts, which the primary-source review flags as an unresolved uncertainty; when an analyst treats a revenue stream as a durable driver without examining contract terms, that optimism should be stress-tested against the actual filing disclosures.

## Things to verify before acting

- Pull the full 10-K business and risk factors sections (not the TOC stubs) and read the competitive positioning and advertiser concentration disclosures — three dimensions were unscorable without this text. Focus on Item 1 and Item 1A prose specifically.
- Track the share count in each quarterly 10-Q and compare to the pace of buyback execution under the $1B authorization. If share count continues growing faster than buybacks offset, the per-share FCF trajectory implied by the reverse DCF (15.6% CAGR) will not materialize for shareholders.
- Read the Other Revenue footnote in the next 10-Q for any disclosure on contract renewal terms, minimum commitments, or expiration dates for the OpenAI and Google data licensing agreements — these represent a potential revenue cliff if AI companies internalize training data or renegotiate.
- Run a simple sanity check on the reverse DCF: at 15.6% annual FCF CAGR from today's ~$180M FCF base, Reddit would need ~$780M in FCF in year 10. Model what revenue, margin, and SBC trajectory gets you there, and compare to the analyst's stated requirements (30% revenue growth, 50% OI growth for three consecutive years).
- Check the Q3 and Q4 2024 earnings call transcripts for management commentary on logged-out traffic trends — the analyst flags that Google AI Overviews may be eroding this traffic, which is the primary channel for non-logged-in ad impressions and a leading indicator of monetization ceiling.
- Verify whether the GAAP net income ($530M) exceeding EBIT ($442M) reflects NOL carryforward utilization, and if so, estimate the remaining NOL balance and how many years of tax-free earnings it supports before the effective tax rate normalizes — this affects true owner earnings quality.

---

*This card is a synthesis of the primary-source value-investing checklist (3 LLM passes per dimension, triple-sampled), reverse DCF, historical valuation context, and analyst-video DecisionCards. Citations and full reasoning live in `primary-source-checklist.md` and `reverse-dcf.md`. The tool produces this card to inform your judgment, not to substitute for it.*