# RDDT — Primary-Source Value Checklist

*Source:* 10-K accession `0001713445-26-000022` + DEF 14A (where used)
*Citation verification:* 5/9 exact, 0 whitespace-normalized, 2 case-only, 2 punctuation-normalized, 0 **no-match**

Each dimension is scored 1–10 from primary sources only (no analyst opinions). Citations point to specific 10-K or proxy passages so you can verify the reasoning yourself — and learn what to look for in primary documents.

## Scores at a glance

| Dimension | Pass 1 | Skeptic Δ | Final | Decision |
|---|---|---|---|---|
| Moat durability | insufficient | 0 | 5.5 | split |
| Owner earnings quality | 4.0 | 0 | 4.0 | agreed-with-pass1 |
| Capital allocation | insufficient | 0 | 5.5 | split |
| Debt sustainability | 9.0 | 0 | 9.0 | no-change |
| Insider alignment | 6.5 | 0 | 6.5 | agreed-with-pass1 |
| Cyclicality awareness | insufficient | 0 | 5.5 | split |

## Moat durability

**Score:** insufficient

*Reason:* The business and risk-factors sections provided contain only header/page-reference text ('Item 1. Business6' and 'Item 1A. Risk Factors13...') with no substantive content. There is no actual prose describing Reddit's competitive position, pricing power, network effects, switching costs, or competitive risks to evaluate moat durability.

## Owner earnings quality

**Score:** 4.0 / 10   _samples: [4.0, 4.0], range 0.0_ *(tight: low uncertainty)*

Reddit only recently achieved profitability, having reported a net loss of $484.3M in FY2024, with net income only beginning in Q3 2024. Stock-based compensation is a substantial cost that likely materially dilutes FCF relative to reported earnings for a company of this revenue scale. The filing explicitly warns of expected future increases in 'payroll and stock-based compensation expense,' and the company remains in early-stage monetization. The FCF yield of 1.88% on a $30B market cap implies only ~$564M in FCF — at a P/E of 44.4× and a company that just turned profitable, the sustainability of the earnings-to-cash conversion is unproven across cycles.

### Citations

- **`financial-statements`** — "We incurred a net loss of $(484.3) million for the year ended December 31, 2024. As of December 31, 2025, we had an accumulated deficit of $(671.1) million."
  *Why it matters:* Reddit has only very recently turned profitable, meaning there is no multi-year track record to verify that reported earnings durably convert to owner cash flows.
- **`financial-statements`** — "We expect our costs and expenses to increase in future periods as we intend to continue to make significant investments to broaden and retain our user base, develop and implement new products, market new and existing products and promote our brand, expand our technical infrastructure, and hire additional employees (with a related expected increase in payroll and stock-based compensation expense)."
  *Why it matters:* Management explicitly guides for rising SBC and headcount costs, signaling that SBC dilution will remain a meaningful wedge between reported earnings and true owner earnings.
- **`financial-statements`** *(case-only match)* — "although we had net income for the three months ended September 30, 2024 and every quarter since, we have previously incurred net losses since our inception, and we may incur net losses again in the future."
  *Why it matters:* Profitability is nascent and management itself cautions it may not be sustained, undermining confidence in the quality and durability of current reported earnings.

### Pass 1 counter-evidence considered

The filing notes Reddit has a net cash position of ~$2.7B and references sufficiency of existing cash and marketable securities, suggesting the balance sheet is not distorted by debt-driven earnings inflation. The transition to profitability in recent quarters and a capital-light, user-generated content model could mean FCF improves rapidly as revenue scales without proportional capex growth — but insufficient multi-year FCF vs. net income data was provided in the excerpted sections to confirm this.

### Pass 2 — Skeptic

*Adjustment: no change recommended*

Pass 1 scored ownerEarningsQuality at 4 and noted the net cash position and capital-light model as positives, while flagging insufficient multi-year FCF vs. net income data to confirm quality. The primary sources provided are heavily weighted toward business description and risk factors rather than detailed financial statements. I looked for: (1) specific SBC figures relative to earnings that would indicate earnings inflation; (2) deferred revenue or working capital dynamics that could distort reported earnings; (3) capitalized software or other accounting choices that could inflate GAAP income; (4) any off-balance-sheet items or contingent liabilities. The filing confirms the company only recently turned profitable ('although we had net income for the three months ended September 30, 2024 and every quarter since') and still carries an accumulated deficit of $671.1 million as of December 31, 2025. It also explicitly warns of expected future cost increases and potential return to losses. However, these concerns — a very short profitability track record, uncertain sustainability, and the mismatch between GAAP earnings and potential owner earnings due to SBC — are squarely within the territory Pass 1's score of 4 already reflects. The financial statements section provided is truncated and does not supply granular income statement, cash flow statement, or SBC disclosure detail that would allow me to identify new, unaddressed evidence. No new primary-source evidence materially changes the calibration of Pass 1's score in either direction.

### Pass 3 — Judge

**Final score: 4.0 / 10** *(decision: agreed-with-pass1)*

Pass 2 found no new primary-source evidence that materially changes the calibration; it explicitly acknowledged that the concerns it identified — nascent profitability, uncertain sustainability, and SBC as a wedge between GAAP earnings and owner earnings — are already squarely reflected in Pass 1's score of 4. Pass 2 recommended zero adjustment and cited no additional passages. The primary sources confirm Pass 1's citations are accurate: net loss of $484.3M for FY2024, accumulated deficit of $671.1M, explicit management guidance for rising SBC and payroll costs, and management's own caution that losses may recur. Pass 1's score of 4 appropriately reflects these quality concerns.

## Capital allocation

**Score:** insufficient

*Reason:* The MDA section provided contains only a table-of-contents stub (95 characters) with no actual narrative content on capital allocation, buybacks, dividends, or M&A activity. The financial-statements section provided is heavily truncated (79,905 of 416,337 characters) and the portion available consists almost entirely of forward-looking statement boilerplate, business description, risk factors, and user metric definitions — it does not include the cash flow statement, notes on acquisitions, debt notes, or the Liquidity and Capital Resources narrative that would be needed to evaluate how management has deployed capital. No share repurchase data (prices, volumes, timing), acquisition multiples, dividend history, or multi-year FCF/capex figures are present in the sections provided.

## Debt sustainability

**Score:** 9.0 / 10   _samples: [9.0, 9.0, 9.0], range 0.0_ *(tight: low uncertainty)*

Reddit carries a net cash position of approximately $2.7B with no meaningful long-term debt visible in the filing, and management explicitly affirms that existing cash, cash equivalents, and marketable securities are sufficient to meet needs for at least the next 12 months. The company only recently reached profitability (net income in every quarter since Q3 2024), and there is no maturity wall, covenant pressure, or leverage concern described anywhere in the filing. This is a de-facto unlevered balance sheet for a growing platform business, placing it squarely in the 9–10 range.

### Citations

- **`financial-statements`** — "sufficiency of our existing cash, cash equivalents, and marketable securities and amounts available under our revolving credit facility to meet our working capital and capital expenditure needs over at least the next 12 months"
  *Why it matters:* Management explicitly affirms no near-term liquidity shortfall, relying on cash on hand and an available revolver rather than refinancing markets, indicating minimal debt sustainability risk.
- **`financial-statements`** *(case-only match)* — "although we had net income for the three months ended September 30, 2024 and every quarter since, we have previously incurred net losses since our inception, and we may incur net losses again in the future"
  *Why it matters:* The recent pivot to profitability, combined with a net cash balance sheet, means debt service is a non-issue; the primary financial risk is operational (sustaining profitability), not solvency.

### Pass 1 counter-evidence considered

The filing references an available revolving credit facility, suggesting some debt capacity is drawn or accessible, and the accumulated deficit of $(671.1) million as of December 31, 2025 reflects years of cash burn that reduced the equity cushion. However, with $2.7B in net cash and no disclosed material long-term debt obligations or covenant pressure in the risk factors, these are historical footnotes rather than current solvency concerns.

### Pass 2 — Skeptic

*Adjustment: no change recommended*

Pass 1 scored debtSustainability at 9/10, citing $2.7B net cash, no material long-term debt, and no covenant pressure. The counter-evidence section already addressed the revolving credit facility and the accumulated deficit of $(671.1) million. My independent review of the primary sources confirms these are the primary debt-related items. The filing's forward-looking statements confirm management's own view: 'sufficiency of our existing cash, cash equivalents, and marketable securities and amounts available under our revolving credit facility to meet our working capital and capital expenditure needs over at least the next 12 months.' No additional structural concerns — such as off-balance-sheet obligations, covenant triggers, pledged assets, or going-concern language — are disclosed in the risk factors or financial statements. The score of 9 is well-calibrated.

### Pass 3 — Judge

**Final score: 9.0 / 10** *(decision: no-change)*

Pass 2 recommended zero adjustment and explicitly confirmed Pass 1's analysis, finding no additional structural concerns such as off-balance-sheet obligations, covenant triggers, pledged assets, or going-concern language. The primary sources corroborate the $2.7B net cash position, management's affirmation of liquidity sufficiency for at least 12 months, and the absence of any material long-term debt or covenant pressure. Pass 1's score of 9 is well-calibrated for an essentially unlevered balance sheet.

## Insider alignment

**Score:** 6.5 / 10   _samples: [6.5, 6.0, 6.5], range 0.5_ *(tight: low uncertainty)*

Reddit's CEO Steve Huffman is a co-founder, which provides some alignment, but the proxy does not disclose his specific ownership percentage in this window. Compensation is heavily equity-weighted with meaningful performance-based cash bonuses tied to DAUq, revenue, and Adjusted EBITDA metrics. However, RSU vesting periods are only one year — unusually short for long-term alignment — and the 165% bonus payout at below-target DAUq performance raises questions about metric calibration. The structure shows reasonable but not exceptional alignment: professional management rather than a deeply entrenched founder-owner.

### Citations

- **`proxy`** *(punctuation-normalized match)* — "A significant portion of executive pay is delivered as long-term incentives (equity awards), which are designed to align executive officers' interests with stockholder interests, promote retention through the reward of long-term company performance, and encourage ownership in Reddit's stock."
  *Why it matters:* Management explicitly ties executive pay philosophy to stockholder alignment, but the one-year RSU vesting period disclosed immediately below this statement undermines the 'long-term' framing.
- **`proxy`** *(punctuation-normalized match)* — "vests in equal quarterly installments over one year, commencing on February 20, 2025, subject to the executive's continued service on each such date."
  *Why it matters:* One-year RSU vesting is notably short for long-term alignment; most best-in-class programs use three- to four-year vesting schedules to more durably tie executive wealth to stock price performance.
- **`proxy`** — "Key metric performance resulted in overall corporate bonus funding of 165% for 2025."
  *Why it matters:* The 165% payout occurred despite DAUq coming in at 121.4M versus a 124.0M target (below target), suggesting the weighting toward revenue and EBITDA — where Reddit significantly outperformed — can produce outsized payouts even with partial goal miss, which modestly weakens pay-for-performance rigor.
- **`proxy`** — "We did not grant RSUs to Messrs. Huffman and Vollero and Ms. Wong in 2025 after taking into account the retentive and incentive value of their existing equity awards."
  *Why it matters:* The CEO and COO were not granted new equity in 2025, indicating they hold substantial existing equity stakes that already align their interests with shareholders — a positive signal for alignment without further dilution.

### Pass 1 counter-evidence considered

The proxy window provided does not include the Beneficial Ownership table showing Huffman's exact share count or percentage ownership, which is the most important data point for founder-level alignment scoring. Additionally, RSU vesting over only one year is much shorter than best-practice three- to four-year schedules, meaningfully reducing long-term lock-in. The bonus plan also produced a 165% payout despite missing the DAUq target, suggesting metrics may be calibrated to pay out generously.

### Pass 2 — Skeptic

*Adjustment: no change recommended*

Pass 1 already addressed the three most material concerns for insider alignment: (1) Huffman's beneficial ownership data not being visible in the proxy window, (2) one-year RSU vesting being shorter than best practice, and (3) the bonus plan paying 165% despite missing the DAUq target. Reviewing the primary sources independently, I find no new material evidence that Pass 1 failed to address. The proxy confirms the dual-class share structure is referenced implicitly through Class A common stock grants to executives and directors, but the actual voting power concentration via Class B/C shares is a structural governance issue that would need to be verified against the 10-K or a different proxy window — Pass 1's score of 6.5 already appears to have incorporated the uncertainty around Huffman's exact ownership. The compensation policies table explicitly states 'No hedging or pledging of our stock per the terms of our Insider Trading Policy and Procedures,' which is a positive alignment feature. The clawback/compensation recovery policy is also documented. The CEO received no new RSU grants in 2025 (relying on existing equity), which is consistent with the proxy note that the committee 'did not grant RSUs to Messrs. Huffman and Vollero and Ms. Wong in 2025 after taking into account the retentive and incentive value of their existing equity awards.' This neither strengthens nor weakens the Pass 1 assessment materially. No new evidence found that Pass 1 did not already weigh.

### Pass 3 — Judge

**Final score: 6.5 / 10** *(decision: agreed-with-pass1)*

Pass 2 confirmed it found no new material evidence beyond what Pass 1 already identified and weighed. Pass 2's observation about the no-hedging/pledging policy and clawback policy are minor positives already implicitly factored into Pass 1's 6.5 score. The core concerns — unknown Huffman ownership percentage, one-year RSU vesting, and 165% bonus payout despite DAUq miss — remain uncontested and appropriately weighted. Pass 2 recommended zero adjustment, and the primary sources support that conclusion.

## Cyclicality awareness

**Score:** insufficient

*Reason:* The sections provided for risk-factors and mda contain only table-of-contents entries (page references and item titles) rather than actual substantive content. There is no prose from the Risk Factors section describing cyclical exposure, no MD&A narrative with multi-year revenue or margin trends, and no discussion of how Reddit's advertising-dependent business performed across economic cycles. Without the actual text of these sections, it is impossible to assess cyclicality awareness responsibly.
