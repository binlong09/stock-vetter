# MELI — Primary-Source Value Checklist

*Source:* 10-K accession `0001099590-26-000006` + DEF 14A (where used)
*Citation verification:* 8/10 exact, 0 whitespace-normalized, 0 case-only, 1 punctuation-normalized, 1 **no-match**

> ⚠️ 1 citation(s) could not be located in the cited source. See annotations below.

Each dimension is scored 1–10 from primary sources only (no analyst opinions). Citations point to specific 10-K or proxy passages so you can verify the reasoning yourself — and learn what to look for in primary documents.

## Scores at a glance

| Dimension | Pass 1 | Skeptic Δ | Final | Decision |
|---|---|---|---|---|
| Moat durability | insufficient | 0 | 5.5 | split |
| Owner earnings quality | 5.5 | 0 | 5.5 | no-change |
| Capital allocation | insufficient | 0 | 5.5 | split |
| Debt sustainability | 5.5 | 0 | 5.5 | no-change |
| Insider alignment | 4.5 | -0.5 | 4.0 | split |
| Cyclicality awareness | insufficient | 0 | 5.5 | no-change |

## Moat durability

**Score:** insufficient

*Reason:* The primary-source sections provided contain only section header text (e.g., 'ITEM 1. BUSINESS5' and 'ITEM 1A. RISK FACTORS17') with no substantive content from either the Business or Risk Factors sections of the 10-K. There is no description of MercadoLibre's competitive positioning, moat sources (network effects, switching costs, scale), margin trends, or competitive risk disclosures available to analyze. Without the actual prose from these sections, it is impossible to score moat durability against the rubric or provide valid citations.

## Owner earnings quality

**Score:** 5.5 / 10   _samples: [5.5, 5.5, 5.5], range 0.0_ *(tight: low uncertainty)*

MELI's reported earnings quality is genuinely complex. The company operates a fintech-heavy model where loan origination creates a structural wedge between net income and free cash flow — credit receivables consume working capital as the lending book grows, making FCF an unreliable proxy for earnings power in any given year. The 5-year FCF CAGR of 66.9% demonstrates the model can produce cash, but the trailing FCF yield of -4.95% signals that current-period investment in the credit book and logistics infrastructure is absorbing all operating cash flow. Stock-based compensation is meaningful but not disclosed in the truncated section provided. The business is genuinely capital-consuming in a growth phase, and the gap between earnings and FCF is largely explained by deliberate reinvestment rather than accounting manipulation — but the complexity of the fintech receivables model makes owner earnings difficult to measure precisely.

### Citations

- **`financial-statements`** — "Our lending solution is available in Argentina, Brazil, Mexico and Chile. We offer loans mostly to merchants and consumers that already form part of our user base"
  *Why it matters:* A rapidly growing credit book means loan originations flow through working capital (or financing activities), creating a persistent wedge between net income and free cash flow that a value investor must adjust for when estimating owner earnings.
- **`financial-statements`** — "Credit Revenues, which includes revenues from interest earned on loans and advances granted to merchants and consumers, and interest and commissions earned on Mercado Pago credit card transactions"
  *Why it matters:* Credit revenue is a growing share of total revenue, and its quality depends on loss provisioning assumptions — if loan loss reserves are understated, reported earnings will overstate true owner earnings, a key risk the truncated financials do not allow full reconciliation of.
- **`financial-statements`** — "Our Commerce business is comprised of two primary revenue streams: Services and Product Sales."
  *Why it matters:* The commerce segment is capital-lighter and more predictable, but the mix of commerce vs. fintech revenues matters enormously for earnings quality — fintech earnings require significant capital to support loan growth, unlike a pure marketplace fee model.

### Pass 1 counter-evidence considered

The actual 5-year FCF CAGR of 66.9% and 3-year FCF CAGR of 69.5% demonstrate that the model does convert to cash over time, suggesting the near-term FCF deficit is investment-driven rather than structural. Additionally, MELI's logistics and fintech investments have clear operational logic described in the Business section — the negative FCF yield reflects growth reinvestment, not earnings manipulation. The truncated financial statements do not provide the full income statement, cash flow statement, or SBC footnote needed to fully adjudicate this dimension, which limits confidence in the score.

### Pass 2 — Skeptic

*Adjustment: no change recommended*

Pass 1 scored ownerEarningsQuality at 5.5 and acknowledged the key tension: strong historical FCF CAGR (66.9% over 5 years) versus a currently negative FCF yield (-4.95%), attributing the deficit to growth reinvestment. Pass 1 also noted that truncated financial statements limit full adjudication of SBC, capex, and earnings quality details. I reviewed the available primary-source sections — primarily the Business section, forward-looking statements, and government regulation sections — and found no income statement, cash flow statement, or SBC footnote data available to audit. The sections provided do not contain quantitative financial data that would allow me to independently assess accrual quality, SBC magnitude relative to earnings, working capital dynamics in the fintech/credit business, or loan loss provisioning practices. Nothing in the available text contradicts or materially supplements Pass 1's assessment. The fintech credit business does introduce earnings quality complexity (loan origination volumes, provisioning, interest income recognition) that could affect owner earnings quality, but this concern is implicitly embedded in Pass 1's note about the 'truncated financial statements' limiting confidence. Without access to the actual financial statements, I cannot identify specific new evidence that would shift the score in either direction. The 5.5 score with the noted uncertainty appears appropriately calibrated given the available evidence.

### Pass 3 — Judge

**Final score: 5.5 / 10** *(decision: no-change)*

Pass 2 found no new primary-source evidence to contradict or supplement Pass 1's assessment, explicitly acknowledging that the available sections contain no income statement, cash flow statement, or SBC footnote data. Both analysts agree the fintech credit book creates a structural wedge between earnings and FCF that complicates owner earnings measurement, and both acknowledge the strong historical FCF CAGR demonstrates the model can convert to cash over time. With no new evidence surfaced by Pass 2 and a recommended adjustment of 0, the 5.5 score reflecting genuine complexity and limited financial statement access remains appropriate.

## Capital allocation

**Score:** insufficient

*Reason:* The MDA section provided contains only a table of contents reference ('ITEM 7. MANAGEMENT'S DISCUSSION AND ANALYSIS OF FINANCIAL CONDITION AND RESULTS OF OPERATIONS39') with no actual narrative content. The financial-statements section provided is truncated at 79,905 characters of 569,021 total and contains only the Business section, Risk Factors summary, and regulatory descriptions — it does not include the actual cash flow statement, notes on acquisitions, share repurchase history, dividend history, or the Liquidity and Capital Resources narrative that are required to score capital allocation. Without the MD&A Liquidity section, the cash flow statement, or acquisition notes, it is not possible to evaluate buyback timing, M&A discipline, capital return history, or deployment priorities with primary-source citations.

## Debt sustainability

**Score:** 5.5 / 10

MELI carries net debt of ~$6.7B, which is meaningful but must be contextualized against its rapid EBITDA growth trajectory and the fact that a significant portion of its 'debt' is tied to its regulated fintech/banking subsidiaries that must hold capital and fund loan books — structurally different from pure corporate leverage. The company operates in multiple regulated markets requiring minimum capital buffers, and its fintech liabilities (user funds, loans payable) are intertwined with its asset base. The filing discloses layered debt instruments including senior notes and local-market issuances, but does not provide a single consolidated net-debt/EBITDA figure, making precise coverage ratio calculation difficult from the provided sections alone. The business generates strong and rapidly growing operating cash flows, but negative trailing FCF (-4.95% yield) reflects heavy reinvestment, not debt distress.

### Citations

- **`financial-statements`** **⚠️ NO-MATCH** — "In April 2025, Mercado Pago Servicios de Procesamiento S.R.L. created a global program for the issuance of debt securities. The maximum principal amount of the debt securities permitted to be outstanding at any one time under the program is $500 million (or its equivalent in other currencies and/or units of value or measure)."
  *Why it matters:* This discloses a new $500M debt issuance program at the subsidiary level in Argentina, indicating incremental leverage being added at operating subsidiaries, which adds complexity to consolidated debt analysis.
- **`financial-statements`** — "The new framework, which was effective starting in July 2023 with full implementation by January 2025, extended the application of the rule regarding proportionality of regulatory requirements (currently applicable to conglomerates of financial institutions) to financial conglomerates led by PIs. The rules required a gradual increase between 2023 and 2025 in the regulatory capital requirements applicable to our regulated Brazilian entities which from January 2025 onwards is 10.50%."
  *Why it matters:* Regulatory capital requirements in Brazil (10.5% minimum) constrain the fintech subsidiaries' ability to upstream cash to the parent, meaning consolidated debt service capacity is partially ring-fenced by regulators — a structural complication for debt sustainability analysis.
- **`financial-statements`** — "A rise in interest rates may negatively affect our Mercado Pago payment volume"
  *Why it matters:* Management explicitly flags interest rate sensitivity as a risk, which is relevant to debt sustainability given that MELI operates in high-rate LatAm environments and has floating-rate or locally-denominated debt exposures.

### Pass 1 counter-evidence considered

The provided sections are heavily weighted toward the Business description and regulatory disclosures rather than the detailed Notes on Debt, maturity schedule tables, or MD&A Liquidity section. Without those sections, it is impossible to precisely calculate net debt/EBITDA, interest coverage ratios, or near-term maturity walls. The company's 5-year FCF CAGR of 66.9% suggests rapidly improving capacity to service debt, which would argue for a higher score, but the negative trailing FCF yield (-4.95%) and $6.7B net debt position, combined with heavy reinvestment obligations and regulated capital requirements across multiple jurisdictions, warrant conservatism. The filing also references multiple local-currency debt instruments and a banking license application in Argentina, suggesting leverage may grow before it shrinks.

### Pass 2 — Skeptic

*Adjustment: no change recommended*

Pass 1's counter-evidence already addresses the core concerns: the $6.7B net debt position, negative trailing FCF yield, heavy reinvestment obligations, regulated capital requirements across multiple jurisdictions, and the possibility that leverage may grow before it shrinks (explicitly citing the Argentina banking license application). One additional element visible in the primary sources that Pass 1 did not specifically quantify is the Argentina debt program: in April 2025, MPSP created a global program for the issuance of debt securities with a maximum principal amount of $500 million outstanding at any one time, and in July 2025 was authorized by the CNV to issue debt securities under Argentina's public offering regime. This is a new local-currency or peso-linked debt facility in a jurisdiction with chronic currency instability, adding a layer of refinancing and FX risk beyond the general statement that leverage may grow. However, this $500 million program is modest relative to MELI's $82.8B market cap and does not materially change the debt sustainability picture Pass 1 already priced in. No adjustment is warranted.

- **`financial-statements`** — "In April 2025, Mercado Pago Servicios de Procesamiento S.R.L. ("MPSP") created a global program for the issuance of debt securities. The maximum principal amount of the debt securities permitted to be outstanding at any one time under the program is $500 million (or its equivalent in other currencies and/or units of value or measure). In July 2025, MPSP was authorized by the CNV to issue debt securities under Argentina's public offering regime, and as result, it is regulated by the CNV."
  *Why it matters:* Identifies a specific $500M Argentine debt program not quantified in Pass 1's counter-evidence, but the scale is modest relative to market cap and does not materially change the debt sustainability assessment Pass 1 already made.

### Pass 3 — Judge

**Final score: 5.5 / 10** *(decision: no-change)*

Pass 2 explicitly recommended zero adjustment and acknowledged that the $500M Argentine debt program it cited was already referenced in Pass 1's citations. Pass 2 confirmed the program is modest relative to MELI's market cap and does not materially change the debt sustainability picture Pass 1 already assessed. No new evidence was surfaced that would shift the score from 5.5, which appropriately reflects the balance between meaningful but complex net debt, strong FCF growth trajectory, and structural complications from regulated fintech subsidiaries.

## Insider alignment

**Score:** 4.5 / 10   _samples: [5.0, 4.5, 4.5], range 0.5_ *(tight: low uncertainty)*

MercadoLibre transitioned from a founder-led company to professional management in January 2026, with Marcos Galperin moving to Executive Chairman and new CEO Ariel Szarfsztejn owning only 76 shares. The Galperin Trust still holds ~7% of shares outstanding, providing some founder alignment, but the direct executive team's personal ownership is negligible. Compensation is heavily cash-based (LTRP is a cash program tied to stock price, not equity), and while 95.5% of CEO pay is 'performance-based,' the LTRP's cash structure with stock-price linkage is a weaker alignment mechanism than direct equity ownership.

### Citations

- **`proxy`** — "Galperin Trust(3)3,550,1367.00"
  *Why it matters:* The Galperin Trust retains a 7% beneficial ownership stake, providing meaningful founder-level alignment with shareholders, though this is held through a trust structure rather than direct personal holdings by the operating CEO.
- **`proxy`** — "50% of the cash payable under the 2025 LTRP will move in tandem with increases or decreases in our stock price during the six-year period over which the bonus is paid."
  *Why it matters:* The LTRP creates partial stock-price linkage for executive pay, but it is a cash instrument rather than equity, meaning executives bear no capital-at-risk and face no dilution alongside shareholders.
- **`proxy`** *(punctuation-normalized match)* — "95.5% of our chief executive officer's total target direct compensation for our 2025 fiscal year was performance-based and 84.4% of the average total target direct compensation of our other active named executive officers as of December 31, 2025 was performance-based."
  *Why it matters:* While a high proportion of pay is nominally performance-based, the structure is cash-dominant; the new CEO Szarfsztejn directly owns only 76 shares, reflecting minimal personal skin-in-the-game.
- **`proxy`** — "Directors and executive officers: Marcos Galperin(4)35*Martín de los Santos410*Ariel Szarfsztejn(5)76*Daniel Rabinovich——"
  *Why it matters:* The direct share ownership of the entire executive team is de minimis — the new CEO owns 76 shares and the COO owns zero — indicating very weak direct equity alignment for the operating leadership team.

### Pass 1 counter-evidence considered

The Galperin Trust's 7% ownership provides some meaningful alignment, and the LTRP's six-year vesting with forfeiture provisions creates retention incentive. Additionally, 83.9% say-on-pay approval at the 2025 annual meeting suggests shareholders are broadly comfortable with the compensation structure. The compensation committee is fully independent and uses external benchmarking, reflecting reasonable governance.

### Pass 2 — Skeptic

*Adjustment: recommends -0.5 (downgrade)*

Pass 1 scored insiderAlignment at 4.5 and already addressed the Galperin Trust's 7% ownership, the LTRP's six-year vesting with forfeiture, say-on-pay approval, and the fully independent compensation committee. On review of the primary sources, I looked for additional concerns or strengths not addressed by Pass 1.

One item worth noting that Pass 1 did not specifically address: the beneficial ownership table reveals that Marcos Galperin personally holds only 35 shares of common stock directly (from a Kaszek Ventures distribution), and the newly appointed CEO Ariel Szarfsztejn holds only 76 shares. The entire insider ownership group of 17 persons holds approximately 129,974 shares, representing less than 1% of outstanding shares. The 7% ownership cited favorably is held by the Galperin Trust — a trust structure with shared voting/dispositive power among multiple entities including entities domiciled in the Netherlands and British Virgin Islands — rather than direct personal holdings by the operating executives. This is a structural distinction Pass 1 did not address: the operating CEO (now Szarfsztejn) and outgoing CEO (Galperin, now Executive Chairman) have negligible direct personal skin-in-the-game via equity ownership.

Additionally, the proxy discloses that director Stelleo Passos Tolda entered into a prepaid variable forward sale contract on 20,000 of his shares (pledged as collateral, maturing August 2027), which economically reduces his alignment on those shares despite retaining voting rights. This specific transaction was not addressed in Pass 1's counter-evidence.

However, these concerns must be weighed carefully. The LTRP's stock-price-linked component (50% of cash moves with stock price) does create meaningful economic alignment for operating executives even without large equity ownership. The Galperin Trust's 7% ownership, while in a trust structure, still represents substantial economic interest aligned with stock performance. The Passos Tolda forward contract is disclosed and involves one non-executive director on a relatively small position. These factors together suggest a modest downward adjustment is warranted for the combination of: (1) near-zero direct equity ownership by current operating CEO, (2) trust structure complexity of the primary insider holding, and (3) the Passos Tolda pledging/forward contract not addressed by Pass 1 — but these are marginal concerns that do not fundamentally alter the dimension's character.

- **`proxy DEF 14A — Beneficial Ownership Table`** — "Marcos Galperin(4)35*
Ariel Szarfsztejn(5)76*
All current directors and executive officers as a group (17 persons)129,974*"
  *Why it matters:* The operating CEO holds only 76 shares and the outgoing CEO/Executive Chairman holds only 35 shares directly. Combined insider group holds under 1% of shares outstanding. Pass 1 cited the Galperin Trust's 7% but did not address that the operating executives themselves have negligible direct equity ownership, which is a distinct alignment concern.
- **`proxy DEF 14A — Beneficial Ownership Footnote 11`** — "Includes 20,000 shares of common stock related to a prepaid variable forward sale contract entered by Mr. Passos Tolda on June 5, 2023, amended on August 22, 2025, with an unaffiliated third party buyer (the 'counterparty') relating to a maximum of 20,000 shares of the Company's common stock... Mr. Passos Tolda pledged 20,000 shares of MercadoLibre, Inc. common stock to secure his obligations under the contract, and retained dividend and voting rights in such shares during the term of the pledge, subject to the counterparty's exercise of default remedies."
  *Why it matters:* A board director has pledged shares under a forward sale contract, economically decoupling his alignment from those shares while retaining voting rights. This pledging/hedging was not addressed in Pass 1's counter-evidence section despite the anti-pledging policy noting only that such transactions are 'strongly discouraged' rather than prohibited.
- **`proxy DEF 14A — Beneficial Ownership Footnote 3`** — "The Reporting Persons, on a combined basis, are the beneficial owners of an aggregate of 3,550,136 shares of our common stock and have shared voting power and shared dispositive power over 3,550,136 shares of our common stock."
  *Why it matters:* The primary insider holding (7%) is held through a multi-entity trust structure with shared voting/dispositive power across entities in South Dakota, Netherlands, and British Virgin Islands, rather than direct personal ownership by the founder/Executive Chairman. This structural complexity was not separately analyzed by Pass 1, which treated it simply as founder ownership alignment.

### Pass 3 — Judge

**Final score: 4.0 / 10** *(decision: split)*

Pass 2 raises two credible points not fully addressed by Pass 1: (1) the Galperin Trust's multi-entity, multi-jurisdictional structure (South Dakota trust, Netherlands LP, British Virgin Islands corp) means the 7% 'founder alignment' is structurally more complex and attenuated than simple founder ownership — Pass 1 acknowledged the trust structure but did not analyze this complexity; and (2) the Passos Tolda prepaid variable forward sale contract on 20,000 shares is confirmed in the primary source footnote 11, representing a genuine economic decoupling of a director's alignment on those shares while retaining voting rights, a concern Pass 1 entirely omitted. However, the Passos Tolda issue involves one non-executive director on a relatively small position, and the LTRP stock-price linkage partially mitigates the lack of direct equity ownership. These are incremental concerns warranting a modest downward adjustment of approximately half of Pass 2's recommended -0.5, yielding a final score of 4.0.

## Cyclicality awareness

**Score:** insufficient

*Reason:* The primary-source sections provided contain only the section headers/table-of-contents entries for risk-factors and mda (each under 100 characters of actual content), with no substantive text from either section. Without the actual body of the Risk Factors or MD&A narrative, it is impossible to assess cyclical exposure disclosures, through-cycle revenue/margin trends, or management commentary on demand sensitivity — all of which are required to score cyclicality awareness responsibly.
