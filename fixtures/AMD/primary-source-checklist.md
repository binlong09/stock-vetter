# AMD — Primary-Source Value Checklist

*Source:* 10-K accession `0000002488-26-000018` + DEF 14A (where used)
*Citation verification:* 18/23 exact, 0 whitespace-normalized, 0 case-only, 3 punctuation-normalized, 2 **no-match**

> ⚠️ 2 citation(s) could not be located in the cited source. See annotations below.

Each dimension is scored 1–10 from primary sources only (no analyst opinions). Citations point to specific 10-K or proxy passages so you can verify the reasoning yourself — and learn what to look for in primary documents.

## Scores at a glance

| Dimension | Pass 1 | Skeptic Δ | Final | Decision |
|---|---|---|---|---|
| Moat durability | 5.5 | 0 | 5.5 | no-change |
| Owner earnings quality | 4.5 | -0.5 | 4.0 | split |
| Capital allocation | 5.0 | 0 | 5.0 | agreed-with-pass1 |
| Debt sustainability | 8.5 | 0 | 8.5 | no-change |
| Insider alignment | 6.5 | 0 | 6.5 | agreed-with-pass1 |
| Cyclicality awareness | 3.0 | 0 | 3.0 | no-change |

## Moat durability

**Score:** 5.5 / 10   _samples: [5.5, 5.5, 5.5], range 0.0_ *(tight: low uncertainty)*

AMD has built genuine competitive advantages in x86 CPU architecture (EPYC server CPUs), AI accelerators (Instinct GPUs), and FPGA/adaptive SoCs (Xilinx heritage), giving it multi-dimensional product differentiation and a growing AI software stack (ROCm). However, the Risk Factors reveal that all three major product categories face intense, well-resourced incumbents — Nvidia dominates the GPU/AI accelerator market with a proprietary CUDA software ecosystem that creates deep customer lock-in against AMD, Intel aggressively prices x86 products, and Altera/Lattice compete in FPGAs. The moat is real but narrow and perpetually contested: AMD must win each product generation anew rather than benefiting from structural lock-in.

### Citations

- **`business`** — "AMD was the first company to integrate a dedicated neural processing unit (NPU) on the same SoC as an x86 CPU for AI PCs. By bringing NPU‑accelerated AI capabilities directly into mainstream x86 platforms, we established a differentiated technology footprint"
  *Why it matters:* This claims a genuine first-mover technical advantage in AI PCs, suggesting at least a temporary moat in this product category — but it is a design-cycle lead, not a structural barrier.
- **`business`** — "In October 2025, we entered into a product purchase agreement with OpenAI OpCo, LLC, (OpenAI) to deploy 6 gigawatts of AMD GPUs, with the deployment of the first gigawatt of capacity powered by our AMD Instinct MI450 series products."
  *Why it matters:* A multi-year hyperscale partnership with OpenAI signals meaningful customer traction for AMD's AI accelerators, suggesting some competitive position — though it does not constitute a durable switching-cost moat.
- **`risk-factors`** — "Nvidia Corporation (Nvidia) leverages its market position in data center GPU, financial resources, and proprietary software ecosystem to promote its systems and influences customers who do business with us."
  *Why it matters:* Management explicitly acknowledges that Nvidia's proprietary CUDA software ecosystem creates competitive lock-in that actively works against AMD's AI accelerator business — this is the clearest disclosure of a structural disadvantage in AMD's most important growth market.
- **`risk-factors`** — "Intel Corporation (Intel) uses its microprocessor market position to price its products aggressively and target our customers and channel partners with special incentives. These aggressive activities have reduced and may reduce our unit sales and average selling prices for many of our products"
  *Why it matters:* AMD's server CPU business faces a financially stronger incumbent willing to use predatory pricing — indicating that AMD's x86 CPU moat depends on sustained performance-per-dollar leadership rather than any structural barrier.

### Pass 1 counter-evidence considered

The Risk Factors note that in September 2025 Nvidia announced a partnership and investment in Intel to jointly develop data center and client platform products, which could simultaneously strengthen both of AMD's primary competitors. Additionally, AMD's own disclosures acknowledge that some hyperscale customers are 'internally developing their own data center microprocessor products and accelerator products,' reducing the total addressable market for AMD's products even if it continues to execute well. The Embedded segment faces entrenched competition from ASICs and multiple programmable-logic vendors. These factors collectively suggest AMD's moat is thin and execution-dependent rather than structurally durable.

### Pass 2 — Skeptic

*Adjustment: no change recommended*

Pass 1's counter-evidence already addresses the primary structural concerns about AMD's moat durability: the Nvidia-Intel partnership, hyperscaler in-house chip development, and embedded segment ASIC competition. Reading the primary sources independently, I looked for additional evidence Pass 1 may have missed — such as switching-cost dynamics, software ecosystem lock-in, x86 architecture durability, or specific structural advantages not captured in the score. The risk factors confirm the execution-dependent nature of AMD's competitive position, noting that 'delivering the latest and best products to market on time is critical to revenue growth' and that competition is 'driven by rapid technological change, evolving standards, shifting customer preferences, product obsolescence, and frequent product launches.' The business section does document some moat-adjacent strengths: AMD's ROCm open software stack, the OpenAI 6-gigawatt multiyear GPU deployment agreement, EPYC server CPU leadership, and the custom chiplet/Infinity Fabric platform as a differentiated custom-silicon capability. However, the filing also repeatedly emphasizes that AMD competes on performance delivery cadence rather than structural lock-in — these are real but transient advantages. None of this constitutes new evidence materially different from what Pass 1 already weighed. A score of 5.5 appropriately reflects a company with genuine but thin, execution-dependent competitive advantages across multiple segments where structural durability is limited. No adjustment is warranted.

### Pass 3 — Judge

**Final score: 5.5 / 10** *(decision: no-change)*

Pass 2 explicitly agrees with Pass 1's score of 5.5 and recommends zero adjustment, finding no material new evidence beyond what Pass 1 already weighed. Pass 2's citations — the competition-driven-by-rapid-technological-change language and the ROCm/OpenAI/EPYC moat-adjacent strengths — are all already captured in Pass 1's analysis. The score of 5.5 correctly reflects genuine but execution-dependent, structurally thin competitive advantages across multiple contested segments.

## Owner earnings quality

**Score:** 4.5 / 10   _samples: [4.0, 4.5, 4.5], range 0.5_ *(tight: low uncertainty)*

AMD's reported net income of $4.34B in 2025 is substantially burdened by non-cash charges that require careful adjustment to estimate owner earnings. Operating cash flow from continuing operations was $6.49B versus net income of $4.27B (continuing ops), a favorable ratio — but $2.25B of acquisition-related intangible amortization and $1.64B of stock-based compensation together dwarf reported GAAP net income, meaning segment-level economic earnings are far higher than GAAP suggests, yet SBC represents real dilutive cost to owners. FCF from continuing ops (operating CF $6.49B minus capex $0.97B) is approximately $5.5B against a $742B market cap, yielding a ~0.74% FCF yield — consistent with the 0.97% trailing FCF yield noted in the financial context. The SBC load ($1.64B pretax, ~$1.35B after tax) is 25% of operating cash flow, a meaningful but not catastrophic drag. The larger distortion is the $2.25B amortization of acquisition-related intangibles flowing through COGS and opex, which inflates the gap between GAAP earnings and segment operating income; true economic earning power is obscured in either direction depending on whether these intangibles represent real economic depreciation.

### Citations

- **`financial-statements`** — "Stock-based compensation1,638 1,407 1,384"
  *Why it matters:* SBC of $1.638B in 2025 is a real cost to owners via dilution; at ~25% of operating cash flow from continuing operations ($6.49B), it meaningfully reduces the cash a long-term owner could extract without dilution.
- **`financial-statements`** — "Amortization of acquisition-related intangibles2,254 2,393 2,811"
  *Why it matters:* Over $2.25B of non-cash amortization from the Xilinx and other acquisitions runs through the P&L annually, suppressing GAAP net income well below segment operating income and making reported earnings a poor proxy for economic earning power.
- **`financial-statements`** — "Net cash provided by operating activities of continuing operations6,493 3,041 1,667"
  *Why it matters:* Operating cash flow from continuing operations has grown rapidly but must be reduced by $974M capex and $1.638B SBC (real cost) to estimate true owner FCF, yielding roughly $3.9B economic FCF against $742B market cap — a thin yield.
- **`financial-statements`** — "During the year ended December 27, 2025, the Company recorded approximately $440 million of net inventory and related charges associated with the U.S. government export control on AMD Instinct™ MI308 Data Center GPU products in Cost of sales."
  *Why it matters:* A $440M one-time charge in 2025 COGS distorts the year's reported earnings; management does not prominently adjust it out, making year-over-year comparisons and normalized earnings harder to assess.

### Pass 1 counter-evidence considered

The most significant counter-evidence is that operating cash flow from continuing operations ($6.49B) substantially exceeds GAAP net income from continuing operations ($4.27B), suggesting cash conversion is better than reported earnings imply. However, this gap is almost entirely explained by addbacks of non-cash amortization ($2.25B) and SBC ($1.64B) that are partially offset by working capital consumption (inventory grew $2.19B), so the cash generation is real but the quality depends on whether one treats SBC as a genuine owner cost — which value investors should.

### Pass 2 — Skeptic

*Adjustment: recommends -0.5 (downgrade)*

Pass 1 correctly identified the core tension in AMD's owner earnings quality: operating cash flow of $6.49B substantially exceeds GAAP net income of $4.27B, but the gap is driven by $2.25B amortization and $1.64B SBC addbacks offset by $2.19B inventory build. Pass 1 already addressed SBC as a genuine owner cost and inventory consumption as a quality concern. One item Pass 1 did not explicitly address is the $440 million of net inventory and related charges recorded in Cost of Sales associated with U.S. government export controls on AMD Instinct MI308 products. This charge is a non-recurring item that inflates cost of sales in 2025 but would not recur absent further export restrictions, meaning normalized gross margins and earnings are modestly higher than reported — a mild positive for earnings quality, not a negative. Additionally, Pass 1 did not separately note the $341 million in gains on long-term investments included in Other income (expense), net that flows through operating income but is backed out in operating cash flow (shown as '(Gains) losses on long-term investments, net (341)' in the cash flow statement). This $341M gain is non-recurring and inflates GAAP net income relative to sustainable earnings power, which slightly reduces owner earnings quality versus what the $4.27B GAAP net income implies. However, this is a relatively minor item (~8% of net income) and does not materially change the overall picture Pass 1 assessed. The unrecognized SBC pipeline — $3.5B for RSUs plus $232M for PRSUs plus $51M for options, totaling ~$3.8B — indicates future SBC expense will remain elevated and continue to be a drag on owner earnings. Pass 1 already flagged SBC as a concern. On balance, these findings are marginal and do not materially change the score; the non-recurring investment gain is a modest incremental negative not explicitly called out, but it is small enough that a -0.5 adjustment is appropriate.

- **`financial-statements`** — "During the year ended December 27, 2025, the Company recorded approximately $440 million of net inventory and related charges associated with the U.S. government export control on AMD Instinct™ MI308 Data Center GPU products in Cost of sales."
  *Why it matters:* This non-recurring charge depresses reported gross margin and earnings in 2025; normalized owner earnings are modestly higher than GAAP implies, a mild positive for quality not discussed by Pass 1.
- **`financial-statements`** — "(Gains) losses on long-term investments, net (341)"
  *Why it matters:* A $341M non-recurring investment gain flowed through GAAP net income but was backed out in operating cash flow, meaning reported GAAP earnings overstate sustainable owner earnings by this amount — a quality concern Pass 1 did not address.

### Pass 3 — Judge

**Final score: 4.0 / 10** *(decision: split)*

Pass 2 surfaces one genuinely valid incremental concern Pass 1 missed: the $341M non-recurring investment gain flowing through GAAP net income but backed out in operating cash flow, confirmed directly in the cash flow statement as '(Gains) losses on long-term investments, net (341)'. This modestly overstates sustainable GAAP earnings (~8% of net income). However, Pass 2's other point — that the $440M export control charge is actually a mild positive for normalized earnings quality — was already cited by Pass 1 as a distortion, and framing it as an incremental positive is a minor recharacterization rather than new evidence. The investment gain concern is real but small, justifying a partial adjustment of roughly half Pass 2's recommended -0.5, yielding a final score of 4.25, rounded to 4.0 given the cumulative weight of SBC, amortization complexity, thin FCF yield, and now the non-recurring gain all working against earnings quality.

## Capital allocation

**Score:** 5.0 / 10   _samples: [5.0, 5.5, 5.0], range 0.5_ *(tight: low uncertainty)*

AMD's capital allocation shows strategic activity but mixed discipline. The ZT Systems deal ($4.4B acquired, ~$2.4B manufacturing arm sold to Sanmina within months) reflects a buy-and-restructure approach that preserved design IP while monetizing capital-intensive manufacturing — a defensible rationale. However, buybacks of $1.3B occurred at very elevated valuations (trailing P/E of 151x), and the OpenAI warrant granting 160M shares at $0.01 introduces substantial potential dilution tied to commercial milestones. Capital expenditures ($974M in 2025 vs. $636M in 2024) are rising but remain relatively modest given revenue scale, which is consistent with AMD's fabless model.

### Citations

- **`mda`** — "In 2025, we returned a total of $1.3 billion to shareholders through the repurchase of 12.4 million shares of common stock under our stock repurchase program."
  *Why it matters:* Buybacks of $1.3B at an implied average price of ~$106/share occurred when AMD's trailing P/E was above 100x, suggesting management repurchased shares at elevated valuations rather than conserving capital for trough opportunities — a value-destroying timing pattern.
- **`mda`** — "In March 2025, we completed the acquisition of ZT Systems for $3.2 billion in cash and 8.3 million shares of our common stock. We retained select intellectual property and employees associated with the design operations (ZT Design Business), and in October 2025, we sold the ZT data center infrastructure manufacturing business (ZT Manufacturing Business) to Sanmina Corporation (Sanmina) for $2.4 billion in cash"
  *Why it matters:* The rapid buy-and-partial-sell of ZT Systems within months shows management's intent was primarily to acquire design IP and talent rather than manufacturing assets — a strategically coherent rationale, but the net cash outflow of ~$800M for the ZT Design Business plus integration costs raises questions about the price paid for intangibles.
- **`mda`** *(punctuation-normalized match)* — "we issued to OpenAI a warrant to purchase up to an aggregate of 160 million shares of AMD's common stock at an exercise price of $0.01 per share."
  *Why it matters:* The near-zero-strike warrant for 160M shares (~10% of diluted share count) represents a significant potential shareholder dilution used as a commercial incentive — an unconventional capital allocation decision that prioritizes revenue commitments over equity preservation.
- **`financial-statements`** **⚠️ NO-MATCH** — "Net cash provided by operating activities of continuing operations$6,493 $3,041"
  *Why it matters:* Operating cash flow nearly doubled year-over-year to $6.5B, providing substantial capital for allocation decisions; however, the majority was reinvested in short-term investments and acquisitions rather than returned to shareholders, reflecting a reinvestment-heavy posture at elevated market valuations.

### Pass 1 counter-evidence considered

AMD's fabless model keeps capex contained ($974M in 2025 on $34.6B revenue, ~2.8% of sales), which is genuinely capital-light and preserves FCF for strategic deployment. The ZT divestiture to Sanmina, including a preferred manufacturing partnership and up to $450M in contingent earn-out, demonstrates some deal sophistication. The $9.4B remaining buyback authorization also signals management's stated willingness to return capital, even if current execution timing is suboptimal from a valuation discipline standpoint. R&D investment of $8.1B (23% of revenue) could be viewed as high-return reinvestment rather than waste, given AMD's competitive trajectory in AI silicon.

### Pass 2 — Skeptic

*Adjustment: no change recommended*

Pass 1's counter-evidence already addresses the key tensions in AMD's capital allocation: the ZT Systems deal structure and divestiture, buyback timing versus valuation, R&D intensity, and the capital-light fabless model. On audit, I reviewed the primary sources for any material capital allocation concern not captured by Pass 1. One item warrants brief note but not score adjustment: AMD issued OpenAI a warrant to purchase up to 160 million shares at $0.01 per share — essentially a deeply dilutive instrument tied to GPU purchase milestones. This is a meaningful use of the equity capital structure as a sales incentive, and represents potential dilution of ~9.8% of current shares outstanding (160M / ~1,630M shares outstanding). However, the filing discloses that none of the warrant shares met vesting or exercise conditions in 2025, the warrant is explicitly contingent on purchase milestones and stock price targets, and the structure is fully disclosed. Pass 1's score of 5 implicitly captures the tension between strategic deal-making sophistication and the question of capital discipline — the OpenAI warrant is an unconventional but disclosed arrangement that fits within that framing. The $12.2 billion in unconditional purchase commitments (with $8.5B due in fiscal 2026) also represents a significant capital deployment obligation not explicitly called out by Pass 1, but is consistent with AMD's fabless supply-chain model and is covered under their stated liquidity assessment. No new evidence rises to the level of a score adjustment.

- **`mda`** — "we issued to OpenAI a warrant to purchase up to an aggregate of 160 million shares of AMD's common stock at an exercise price of $0.01 per share. The warrant shares will vest in tranches based on certain AMD Instinct GPU purchase milestones by OpenAI, or its affiliates, or indirectly through third parties, and achievement of specified AMD stock price targets and stock performance."
  *Why it matters:* The OpenAI warrant represents potential dilution of ~9.8% of shares outstanding used as a sales incentive — a form of equity capital deployed commercially. Pass 1 did not specifically address this instrument, but since no shares vested in 2025 and the structure is fully disclosed and contingent, it does not materially change the capital allocation assessment at this time.
- **`mda`** — "As of December 27, 2025, we had unconditional commitments of approximately $12.2 billion, of which $8.5 billion are in fiscal year 2026."
  *Why it matters:* The $8.5B in near-term purchase commitments is a large capital obligation not explicitly highlighted by Pass 1, but consistent with AMD's fabless model supply-chain prepayments and does not alter the capital allocation score given AMD's $10.6B cash position and $6.5B operating cash flow.

### Pass 3 — Judge

**Final score: 5.0 / 10** *(decision: agreed-with-pass1)*

Pass 2 recommended no adjustment and explicitly acknowledged that its two cited concerns — the OpenAI warrant and the $12.2B purchase commitments — were already captured within Pass 1's framing or were consistent with AMD's fabless model. Pass 2's rebuttal adds no material new evidence that Pass 1 missed or under-weighted; it largely validates Pass 1's balanced assessment of strategic deal-making sophistication against valuation-insensitive buybacks and unconventional equity use. The score of 5 appropriately reflects the mixed capital allocation picture documented in the primary sources.

## Debt sustainability

**Score:** 8.5 / 10   _samples: [8.5, 8.5, 8.5], range 0.0_ *(tight: low uncertainty)*

AMD carries $3.25B in gross debt against net cash of ~$8.5B (cash + short-term investments of ~$10.55B vs. debt of $3.22B net), making it effectively a net-cash company. Interest coverage is extraordinarily strong: 2025 operating income of $3.69B against $131M of interest expense implies ~28× coverage, and actual cash paid for interest was only $91M. The maturity schedule is well-laddered with no clustering: $875M due 2026, $625M due 2028, $750M due 2030, and $1B beyond 2030. The revolving credit facility ($3B) was undrawn and the company was in compliance with all covenants. The only meaningful caution is $12.2B in unconditional purchase commitments ($8.5B due in 2026 alone) and $1.3B in uncommenced lease obligations, which are off-balance-sheet obligations that modestly reduce the apparent financial flexibility.

### Citations

- **`financial-statements`** — "As of December 27, 2025, the Company was in compliance with the covenants associated with all of its debt."
  *Why it matters:* Confirms no covenant stress or distress signals at year-end, a key threshold test for debt sustainability.
- **`financial-statements`** **⚠️ NO-MATCH** — "Future Payments on Total Debt
Term Debt (Principal only)$875 $— $625 $— $750 $1,000 $3,250"
  *Why it matters:* The maturity schedule shows no dangerous clustering: only $875M comes due in 2026, with the remainder spread to 2028, 2030, and beyond, giving AMD ample time to refinance or repay from operating cash flows that reached $6.5B from continuing operations in 2025.
- **`financial-statements`** — "The Company has $3 billion available under an unsecured revolving credit facility that expires on April 29, 2027. During 2025, the Company did not draw funds from the revolving credit facility."
  *Why it matters:* An undrawn $3B revolving credit line provides a substantial liquidity backstop, and the fact it was never tapped in 2025 signals AMD did not need emergency funding even while making major acquisitions.
- **`financial-statements`** — "Cash and cash equivalents$5,539 $3,787"
  *Why it matters:* Combined with $5.0B in short-term investments, AMD holds roughly $10.5B in liquid assets against $3.25B in total debt principal, confirming a strong net-cash position that provides a wide margin of safety for debt serviceability.

### Pass 1 counter-evidence considered

The $12.2B in unconditional purchase commitments (with $8.5B due in fiscal 2026 alone) represents a significant off-balance-sheet cash obligation that dwarfs the formal debt load and could strain liquidity if revenue growth slows unexpectedly. Additionally, the company added $1.5B of new debt in March 2025 and has $1.3B in uncommenced lease obligations, indicating growing off-balance-sheet liabilities. The near-term maturity of the $875M 4.212% Notes in 2026 coincides with the peak commitment year.

### Pass 2 — Skeptic

*Adjustment: no change recommended*

Pass 1 already identified the key concerns for this dimension: the $12.2B in unconditional purchase commitments (with $8.5B due in fiscal 2026), the $1.5B of new debt issued in March 2025, and the $1.3B in uncommenced lease obligations. I reviewed the primary sources looking for additional concerns not captured by Pass 1. The balance sheet shows net cash of approximately $8.5B (cash $5,539M + short-term investments $5,013M minus total debt principal $3,250M), the company has $3B undrawn revolving credit facility expiring April 2027, and was in compliance with all debt covenants as of year-end. The debt maturity schedule is manageable: $875M due 2026, $625M due 2028, $750M due 2030, and $1,000M due 2032+. Operating cash flow from continuing operations was $6.5B in FY2025, providing strong coverage. The revolving credit facility expiring April 2027 is a minor structural note — it expires before the 2028 notes mature — but this is a standard refinancing risk for a company of AMD's creditworthiness and does not represent a material unaddressed concern. Pass 1's counter-evidence section directly addresses the purchase commitments, new debt issuance, uncommenced leases, and the 2026 maturity coincidence. No additional material concerns are found in the primary sources that Pass 1 did not address. The 8.5 score appears well-calibrated given AMD's strong liquidity ($10.5B in cash and short-term investments), robust and growing operating cash flows, and manageable formal debt load, offset appropriately by the large off-balance-sheet purchase commitments Pass 1 already flagged.

### Pass 3 — Judge

**Final score: 8.5 / 10** *(decision: no-change)*

Pass 2 found no additional material concerns beyond what Pass 1 already identified and properly weighted. Both analysts agree on the core facts: net cash of ~$8.5B, $3.25B in well-laddered debt, ~28x interest coverage, undrawn $3B revolver, and covenant compliance. Pass 2 explicitly confirmed that Pass 1's counter-evidence section already captured the $12.2B in purchase commitments, new debt issuance, uncommenced leases, and 2026 maturity coincidence. The 8.5 score appropriately reflects strong formal debt metrics offset by the large off-balance-sheet purchase commitment load, and Pass 2 recommended zero adjustment.

## Insider alignment

**Score:** 6.5 / 10   _samples: [6.5, 6.5, 6.5], range 0.0_ *(tight: low uncertainty)*

AMD operates a professional-management model with Lisa Su as a hired (not founder) CEO, but compensation is heavily weighted toward long-term, performance-based equity — approximately 96% of Su's target total direct compensation is variable or 'at risk.' The proxy discloses robust stock ownership requirements, clawback policies, and multi-year PRSU vesting tied to relative TSR and EPS growth, all of which create meaningful alignment. However, insider ownership levels for the CEO and NEOs are not disclosed as large percentage stakes in the provided section, and this is a professional management team rather than a founder-led company with concentrated ownership.

### Citations

- **`proxy`** *(punctuation-normalized match)* — "Approximately 96% of our Chief Executive Officer's target total direct compensation and approximately 92% of the average target total direct compensation of our other Named Executive Officers was delivered in the form of variable or "at risk" compensation tied to company, individual, or stock price performance"
  *Why it matters:* This demonstrates that the vast majority of NEO pay is contingent on performance outcomes, creating strong alignment between executive rewards and shareholder value rather than guaranteed cash.
- **`proxy`** *(punctuation-normalized match)* — "Long-term equity awards (the ultimate value of which depends on our stock price) continued to be the largest element of compensation, representing approximately 89% of our Chief Executive Officer's target total direct compensation and approximately 83% of the average target total direct compensation of our other Named Executive Officers"
  *Why it matters:* Equity dominance in pay mix means executives' personal wealth is directly tied to multi-year stock price performance, a hallmark of owner-oriented alignment.
- **`proxy`** — "We have robust stock ownership requirements for our Chief Executive Officer, our other Named Executive Officers and our Directors."
  *Why it matters:* Mandatory stock ownership requirements force executives to maintain skin in the game beyond vesting events, reducing the incentive to manage for short-term metrics and then sell.
- **`proxy`** — "We prohibit our employees (including our Named Executive Officers) and Directors from hedging AMD securities. Pledging of AMD securities is not permitted without the preapproval of the Nominating and Governance Committee of our Board which is only granted in very limited circumstances and has not been granted to date."
  *Why it matters:* Anti-hedging and anti-pledging policies ensure that nominal share ownership translates into genuine economic exposure to stock price movements.

### Pass 1 counter-evidence considered

The proxy section provided does not disclose specific share counts or percentage ownership for CEO Lisa Su or other NEOs in the beneficial ownership table (only institutional holders Vanguard and BlackRock are quantified). Without knowing whether Su holds, say, 0.1% or 1%+ of AMD's shares, it is impossible to confirm founder-level alignment. Additionally, the PRSU performance period for 2022-2025 awards yielded 96.84% payout against a TSR that underperformed the S&P 500 (53.55% vs. 55.13%), suggesting the relative performance bar may not be sufficiently rigorous. The company is also a professional management team, not founder-led, which limits the highest alignment scores.

### Pass 2 — Skeptic

*Adjustment: no change recommended*

Pass 1's counter-evidence already addresses the two primary concerns: (1) lack of disclosed share counts/percentages for CEO Su and other NEOs in the beneficial ownership table, and (2) the 96.84% PRSU payout against TSR that slightly underperformed the S&P 500. Reviewing the primary sources independently, I find a few additional positive structural elements that are worth noting but do not materially change the score. The proxy explicitly discloses robust stock ownership requirements for the CEO, NEOs, and directors; a strict anti-hedging and anti-pledging policy (with no pledging having been granted to date); double-trigger change-of-control provisions capped at 2x; no excise tax gross-ups; and a clawback policy. Approximately 96% of CEO compensation is variable/at-risk, with ~89% in long-term equity. For fiscal 2025, the PRSU metric was also revised to measure TSR on a percentile-ranking basis relative to S&P 500 constituents (rather than absolute TSR vs. the index), which is a more rigorous relative comparison. These are governance positives that support the existing score rather than suggesting it is too high. One minor observation not explicitly addressed by Pass 1: the proxy notes a late Form 4 filing for Mr. Guido ('a Form 4 filing for Mr. Guido that reported a one-time purchase of AMD shares, which was filed after the applicable Form 4 deadline due to an administrative error'). This is a trivial administrative lapse and does not materially affect alignment scoring. On balance, Pass 1's score of 6.5 appears well-calibrated: the compensation structure is heavily equity-linked and performance-oriented with sound governance guardrails, but the absence of disclosed insider ownership figures for named executives and the non-founder management team prevent a higher score. No adjustment is warranted.

### Pass 3 — Judge

**Final score: 6.5 / 10** *(decision: agreed-with-pass1)*

Pass 2's rebuttal is substantively in agreement with Pass 1 and recommends zero adjustment. Pass 2 confirms the same positive structural elements (96% variable pay, equity dominance, anti-hedging/pledging policies, double-trigger CIC, clawback) and acknowledges the same limitations (no disclosed insider ownership percentages for NEOs, professional rather than founder-led management). Pass 2's additional observations — the revised TSR percentile-ranking metric for 2025 PRSUs and the trivial Guido Form 4 administrative error — do not materially alter the alignment picture in either direction. The 6.5 score appropriately reflects strong compensation-structure alignment without founder-level ownership concentration.

## Cyclicality awareness

**Score:** 3.0 / 10   _samples: [3.0, 3.0, 3.0], range 0.0_ *(tight: low uncertainty)*

AMD operates in a highly cyclical industry by its own explicit admission, with revenue exposed to semiconductor industry downturns, consumer PC demand swings, gaming console cycles, cryptocurrency volatility, embedded inventory destocking, and AI infrastructure buildout timing — all simultaneously. The Risk Factors enumerate multiple distinct cyclical vectors across all four business segments, and AMD has a documented history of 'substantial losses in previous downturns.' The current period appears to be benefiting from an AI infrastructure buildout surge that is explicitly flagged as uncertain in trajectory, suggesting results may be near a cyclical peak for that segment. The Embedded segment is already in a documented inventory-digestion trough, illustrating how quickly AMD's segments can turn. No through-cycle resilience evidence is provided — there is no multi-year revenue stability data or trough-margin disclosure in the sections given.

### Citations

- **`risk-factors`** — "The semiconductor industry is highly cyclical and has experienced significant downturns, often alongside constant and rapid technological change, wide fluctuations in supply and demand, continuous new product introductions, price erosion and declines in general economic conditions."
  *Why it matters:* Management explicitly acknowledges structural cyclicality in AMD's core industry, and notes prior substantial losses during downturns, confirming this is not a theoretical risk but a demonstrated historical pattern.
- **`risk-factors`** — "To the extent our embedded customers are faced with higher inventory levels, they may choose to draw down their existing inventory and order less of our products."
  *Why it matters:* This confirms that AMD's Embedded segment is already experiencing a classic semiconductor inventory-correction cycle, illustrating real-time cyclical exposure rather than a hypothetical one.
- **`risk-factors`** — "the near-term and long-term trajectory of such generative AI solutions is unknown. Some customers in AI markets may be unable to secure access to internal and external infrastructure, including availability of sufficient data center capacity or energy"
  *Why it matters:* The primary growth driver (Data Center AI) is itself flagged as cyclically uncertain, meaning current elevated demand cannot be treated as a stable baseline for valuation purposes.

### Pass 1 counter-evidence considered

AMD's growing diversification across Data Center, Client, Gaming, and Embedded segments provides some offset — when one segment is in a trough (e.g., Embedded), another (e.g., Data Center AI) may be in an upcycle. However, the Risk Factors do not present this diversification as meaningfully dampening overall cyclicality, and historical downturns have tended to compress results across segments simultaneously during macro recessions.

### Pass 2 — Skeptic

*Adjustment: no change recommended*

Pass 1 scored cyclicalityAwareness at 3, noting AMD's multi-segment diversification provides only limited offset and that historical downturns have compressed results across segments simultaneously. The primary sources confirm this framing robustly. The Risk Factors explicitly state 'The semiconductor industry is highly cyclical and has experienced significant downturns' and enumerate concrete cyclical vulnerabilities: seasonal revenue patterns weighted to second half, short product lifecycles, inventory obsolescence risk, and demand sensitivity across all four end markets simultaneously. Additionally, the filing discloses a material new cyclical-adjacent risk — the $800 million inventory and related charges from U.S. export controls on MI308 products in Q2 2025 — which introduces a policy-driven demand cliff distinct from traditional economic cyclicality. This export-control shock represents a sudden, government-mandated demand disruption that acted similarly to a cyclical trough in the Data Center segment, AMD's highest-growth business. However, Pass 1's counter-evidence already acknowledges that downturns tend to compress results across segments simultaneously during macro recessions. The export control charge is a form of regulatory cyclicality rather than macroeconomic cyclicality, and while material, it is already disclosed prominently in the filing and represents a one-time shock (partially reversed at $360M) rather than an ongoing structural cyclical amplifier. No additional evidence found that meaningfully changes the calibration of the score beyond what Pass 1 already weighed. A score of 3 appropriately reflects AMD's high inherent cyclicality with partial but insufficient diversification offset. No adjustment warranted.

### Pass 3 — Judge

**Final score: 3.0 / 10** *(decision: no-change)*

Pass 2 explicitly recommended 0 adjustment and agreed that Pass 1's score of 3 appropriately reflects AMD's high inherent cyclicality. Pass 2's additional evidence about the $800M MI308 export control charge, while materially documented in the primary sources, was correctly characterized as a one-time policy-driven shock already partially reversed at $360M rather than a structural cyclical amplifier that would change the score calibration. Both analysts converge on the same assessment, and the primary sources robustly support the multi-vector cyclical risk characterization underlying the score of 3.
