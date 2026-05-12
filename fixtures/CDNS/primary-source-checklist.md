# CDNS — Primary-Source Value Checklist

*Source:* 10-K accession `0000813672-26-000016` + DEF 14A (where used)
*Citation verification:* 17/22 exact, 0 whitespace-normalized, 0 case-only, 4 punctuation-normalized, 1 **no-match**

> ⚠️ 1 citation(s) could not be located in the cited source. See annotations below.

Each dimension is scored 1–10 from primary sources only (no analyst opinions). Citations point to specific 10-K or proxy passages so you can verify the reasoning yourself — and learn what to look for in primary documents.

## Scores at a glance

| Dimension | Pass 1 | Skeptic Δ | Final | Decision |
|---|---|---|---|---|
| Moat durability | 7.5 | 0 | 7.5 | no-change |
| Owner earnings quality | 6.5 | 0 | 6.5 | agreed-with-pass1 |
| Capital allocation | 5.5 | 0 | 5.5 | no-change |
| Debt sustainability | 7.5 | 0 | 7.5 | no-change |
| Insider alignment | 6.0 | 0 | 6.0 | no-change |
| Cyclicality awareness | 5.5 | 0 | 5.5 | no-change |

## Moat durability

**Score:** 7.5 / 10   _samples: [7.5, 7.5, 7.5], range 0.0_ *(tight: low uncertainty)*

Cadence operates in a duopoly-like EDA market alongside Synopsys, with products like Virtuoso described as 'the industry standard for custom and analog IC design' — a powerful switching-cost indicator since chip designs are multi-year, engineer-workflow-embedded processes. Revenue grew from $3.83B (2023) to $5.30B (2025) and the company held $7.8B in contracted but unsatisfied performance obligations at year-end 2025, reflecting deep customer entrenchment via multi-year time-based license arrangements. The moat is multi-dimensional: proprietary algorithms (patents/trade secrets), workflow integration (PDK co-development with leading foundries), and rising complexity of chip design that structurally increases customer dependence. However, Risk Factors explicitly acknowledge substantial competition — including emerging Chinese EDA players and open-source alternatives — and export control risk that could accelerate customer defection, preventing a higher score.

### Citations

- **`business`** — "Virtuoso is our flagship platform used by engineers to design and verify analog, custom, RF, mixed-signal IC, memory, and photonics devices. It is considered the industry standard for custom and analog IC design"
  *Why it matters:* Industry-standard status in a workflow-embedded tool signals high switching costs, as migrating a design mid-cycle is prohibitively expensive and risky for customers.
- **`business`** — "Contracted but unsatisfied performance obligations were $7.8 billion as of December 31, 2025, which included $0.6 billion of non-cancelable commitments from customers where actual product selection and quantities of specific products or services are to be determined by customers at a later date."
  *Why it matters:* A $7.8B backlog against ~$5.3B in annual revenue indicates deep multi-year customer lock-in and predictable future cash flows, a hallmark of durable switching-cost moats.
- **`risk-factors`** — "Entity List restrictions and other trade restrictions may also encourage customers to seek substitute products from our competitors, including a growing class of foreign competitors and open source alternatives, that are not subject to these restrictions or to develop their own solutions, thereby decreasing our long-term competitiveness."
  *Why it matters:* This passage legally requires management to disclose that trade restrictions could catalyze moat erosion by pushing Chinese customers toward domestic EDA alternatives, a credible structural threat.
- **`risk-factors`** — "The competition in our industries is substantial, and we may not be able to continue to compete successfully."
  *Why it matters:* Risk Factors confirm that while Cadence has a strong competitive position, the EDA market faces meaningful competitive intensity from Synopsys, Siemens EDA, and emerging Chinese players, tempering the moat score.

### Pass 1 counter-evidence considered

The Risk Factors section explicitly flags that China's national policy to become a global semiconductor leader by 2030 has 'resulted in and may continue to cause increased competitive capability in China,' naming specific emerging Chinese EDA competitors (Huada Empyrean, Xpeedic, X-EPIC, Primarius, etc.). This represents a credible long-term moat erosion vector in what has historically been a significant revenue geography for Cadence. Additionally, the Business section itself acknowledges that 'some customers have chosen to focus on one discrete phase of the design process or opt for less advanced, but less risky, manufacturing processes that may not require the most advanced EDA products,' suggesting customers can partially avoid dependence on cutting-edge Cadence tools.

### Pass 2 — Skeptic

*Adjustment: no change recommended*

Pass 1 already identified the two most material moat-erosion vectors visible in the primary sources: (1) named Chinese EDA competitors enabled by China's 2030 semiconductor policy, and (2) customers opting for less advanced manufacturing processes that reduce dependence on cutting-edge EDA. I reviewed the full Business and Risk Factors sections independently and found no additional moat-relevant evidence that Pass 1 failed to address. The primary sources also document substantial positive moat indicators—industry-standard flagship platforms (Virtuoso for custom IC, Innovus for digital IC), $7.8 billion in contracted but unsatisfied performance obligations, 2–3 year time-based license structures with remix rights that create high switching costs, deep foundry PDK co-development relationships, and an expanding Intelligent System Design platform that extends lock-in beyond core EDA into SD&A and semiconductor IP. These structural advantages are consistent with a 7.5 score. The China competitive risk and customer behavior risk were explicitly weighed by Pass 1. No new primary-source evidence warrants an adjustment in either direction.

### Pass 3 — Judge

**Final score: 7.5 / 10** *(decision: no-change)*

Pass 2 explicitly confirmed that Pass 1 already identified and appropriately weighted all material moat-erosion vectors visible in the primary sources, including named Chinese EDA competitors and customer behavior risks. Pass 2 found no new primary-source evidence warranting adjustment in either direction, and its independent review corroborated the positive moat indicators (Virtuoso industry-standard status, $7.8B backlog, 2-3 year time-based license structures, foundry PDK co-development) that support the 7.5 score. With zero recommended adjustment and full agreement on the evidence, Pass 1's score stands unchanged.

## Owner earnings quality

**Score:** 6.5 / 10   _samples: [6.5, 6.5, 6.5], range 0.0_ *(tight: low uncertainty)*

Cadence's reported earnings are reasonably representative of owner earnings, supported by a predominantly subscription/time-based revenue model (~80% recurring) with strong deferred revenue underpinning. Operating cash flow of $1.73B in 2025 exceeded net income of $1.11B, a healthy 1.56× ratio indicating real cash generation. However, stock-based compensation is substantial at $455M in 2025 (~26% of operating cash flow and ~41% of net income), which meaningfully inflates reported cash flow relative to true owner earnings. The business is also capital-light on maintenance capex (~$142M vs. $228M D&A), but growing goodwill from acquisitions ($2.75B) and a $128M contingent liability loss in 2025 add noise to reported figures.

### Citations

- **`financial-statements`** — "Stock-based compensation455,175 391,219 325,611"
  *Why it matters:* SBC has grown from $326M to $455M over three years; at 41% of 2025 net income, this is a material non-cash charge that inflates operating cash flow well above true owner earnings available without ongoing equity dilution.
- **`financial-statements`** — "Net cash provided by operating activities1,728,781 1,260,551 1,349,176"
  *Why it matters:* Operating cash flow consistently exceeds net income (1.56× in 2025), but the gap is substantially explained by SBC rather than favorable working capital dynamics, requiring adjustment to compute true owner earnings.
- **`financial-statements`** *(punctuation-normalized match)* — "Recurring revenue includes revenue recognized over time from certain of Cadence's software licensing arrangements, services, royalties, maintenance on IP licenses and hardware, and operating leases of hardware."
  *Why it matters:* The ~80% recurring revenue base means cash is collected predictably and deferred revenue ($934M) represents real advance payments, supporting the quality of reported earnings over time.
- **`financial-statements`** — "Loss related to contingent liability128,545 8,322 —"
  *Why it matters:* A $128.5M contingent liability charge in 2025 (versus $8.3M in 2024 and zero in 2023) represents an irregular item that inflates costs and depresses reported net income, distorting year-over-year earnings comparability.

### Pass 1 counter-evidence considered

Capital expenditures of ~$142M are well below D&A of $228M, suggesting limited maintenance reinvestment burden and supporting FCF conversion. However, growing acquisitions (goodwill up to $2.75B, $430M cash paid in 2025) and increasing unbilled receivables ($456M vs. $293M in 2024) could signal revenue recognition that runs slightly ahead of cash collection, and the 5-year FCF CAGR has decelerated sharply from 30.9% to a 3-year rate of 12.4%, suggesting the earnings growth story is maturing faster than the valuation implies.

### Pass 2 — Skeptic

*Adjustment: no change recommended*

Pass 1 already addressed the two main concerns for this dimension: (1) growing unbilled receivables as a potential revenue recognition timing issue, and (2) FCF CAGR deceleration. On inspection of the primary sources, I looked for additional evidence Pass 1 did not address. The most notable new item is the sharp increase in contract assets from $29.3M to $67.8M (a 131% increase), which is distinct from unbilled receivables and represents revenue recognized before Cadence has an unconditional right to invoice. This is a more aggressive recognition signal than unbilled receivables alone. However, in absolute terms ($67.8M vs. $5.3B revenue), this is immaterial (~1.3% of revenue). I also noted the $128.5M 'loss related to contingent liability' in 2025 operating expenses — a one-time charge that reduced GAAP earnings but not cash, which actually improves the GAAP-to-cash earnings quality narrative rather than harming it. The revenue mix shift toward up-front revenue (20% in 2025 vs. 16% in 2023) slightly increases lumpiness, but Pass 1's concern about unbilled receivables implicitly encompasses timing differences. The remaining performance obligations of $7.8B (nearly 1.5x annual revenue) provide strong forward earnings quality visibility not explicitly quantified by Pass 1, but this is a positive rather than a missed concern. PwC flagged revenue recognition as the sole critical audit matter, consistent with Pass 1's framing. No material weakness, no going-concern language, and internal controls are effective per management and auditor. On balance, Pass 1's score of 6.5 is well-calibrated. The contract assets increase is new but immaterial; all other concerns were already addressed.

### Pass 3 — Judge

**Final score: 6.5 / 10** *(decision: agreed-with-pass1)*

Pass 2 identified the contract assets increase (from $29.3M to $67.8M, a 131% jump) as a new concern Pass 1 missed, but correctly acknowledged this is immaterial at ~1.3% of revenue. Pass 2's other observations — the $7.8B remaining performance obligations as a positive, the contingent liability charge as neutral-to-positive for cash quality, and the revenue mix shift — either reinforce Pass 1's score or are already subsumed in Pass 1's analysis. Pass 2 recommended zero adjustment and provided no decisive evidence that Pass 1's 6.5 score was miscalibrated; the primary concerns of high SBC (~41% of net income), unbilled receivables growth, and FCF CAGR deceleration remain the controlling factors, and Pass 1 already weighed these appropriately.

## Capital allocation

**Score:** 5.5 / 10   _samples: [5.5, 5.5, 6.0], range 0.5_ *(tight: low uncertainty)*

Cadence demonstrates a consistent reinvestment discipline (heavy R&D at ~33% of revenue, bolt-on acquisitions to extend its ISD strategy) and active buybacks, but the capital allocation picture is mixed. The September 2024 $2.5B senior notes issuance—used partly to fund acquisitions and buybacks—introduced meaningful leverage at what proved to be elevated valuation levels (trailing P/E ~85x). The pending €2.70B Hexagon D&E acquisition, partly stock-funded, represents the largest deal in Cadence's recent history and introduces integration and premium risk. Buybacks have been consistent but not demonstrably trough-timed. The overall pattern is competent but not best-in-class capital allocation.

### Citations

- **`mda`** — "In May 2025, our Board of Directors increased the prior authorization to repurchase shares of our common stock by authorizing an additional $1.5 billion."
  *Why it matters:* The Board added buyback capacity at a time when CDNS traded at ~85x earnings, suggesting repurchases are driven by program maintenance rather than valuation discipline; as of year-end ~$1.4B remained unspent, implying only modest execution against the new authorization.
- **`mda`** *(punctuation-normalized match)* — "Under the terms of the purchase agreement, we will pay Hexagon aggregate consideration of approximately €2.70 billion. Approximately €1.89 billion of the aggregate consideration will be paid in the form of cash, subject to customary purchase price adjustments in accordance with the purchase agreement, with the remaining consideration payable in the form of newly issued shares of Cadence's common stock."
  *Why it matters:* The Hexagon D&E deal is large relative to Cadence's ~$1.5B net debt position and annual FCF of ~$1.5B, and the partial stock consideration at stretched multiples is dilutive to existing shareholders, raising questions about acquisition pricing discipline.
- **`mda`** **⚠️ NO-MATCH** — "In September 2024, we issued $2.5 billion aggregate principal amount of senior notes, consisting of $500.0 million aggregate principal amount of 4.200% Senior Notes due 2027, $1.0 billion aggregate principal amount of 4.300% Senior Notes due 2029 and $1.0 billion aggregate principal amount of 4.700% Senior Notes due 2034."
  *Why it matters:* Adding $2.5B of long-term debt to fund acquisitions and buybacks in a period of peak valuations is a mixed signal; it accelerated returns in a rising market but elevated financial risk entering the Hexagon deal.
- **`mda`** — "Cash used for investing activities decreased during fiscal 2025, as compared to fiscal 2024, primarily due to decreased payments for business combinations and an increase in proceeds from the sale and maturity of investments in equity and debt securities."
  *Why it matters:* The moderation in acquisition spending in fiscal 2025 (vs. the BETA CAE year) suggests some capital discipline, but the pending Hexagon deal means the M&A cadence resumes at a larger scale in 2026.

### Pass 1 counter-evidence considered

Cadence's multi-year R&D investment (consistently ~33-34% of revenue) and a string of strategically coherent tuck-in acquisitions (BETA CAE, Artisan IP, Secure-IC, VLAB Works) suggest management prioritizes capability-building over financial engineering. Operating cash flow grew from ~$1.26B in 2024 to ~$1.73B in 2025, meaning the company generates substantial organic cash to self-fund growth, partially mitigating concerns about debt-funded buybacks. The OBBBA tax benefit ($151M cash tax savings in 2025) also improved near-term capital availability.

### Pass 2 — Skeptic

*Adjustment: no change recommended*

Pass 1's counter-evidence already addresses the key capital allocation dynamics: R&D intensity (~33-34% of revenue), strategic tuck-in acquisitions, strong OCF growth, and OBBBA tax benefit. Reviewing the primary sources, I looked for additional concerns not addressed by Pass 1: (1) The pending Hexagon D&E acquisition at ~€2.70 billion (~$2.9B equivalent) is a materially larger deal than prior tuck-ins, with ~€1.89B in cash funded via 'cash on hand and borrowings under existing debt facilities,' implying incremental debt on top of the existing $2.5B Senior Notes. This is a step-change in acquisition scale that goes beyond the 'tuck-in' characterization. However, this deal is disclosed prominently in the MDA and represents a strategic adjacency (System Design & Analysis expansion), so Pass 1 likely considered it implicitly under the acquisition track record. (2) The $140.6M in aggregate penalties paid to BIS/DOJ for export control violations, plus the $128.5M charge, represent a capital allocation misstep not flagged in Pass 1's counter-evidence — though this is a compliance/governance issue more than a capital allocation quality issue per se. (3) Buybacks were executed ($1.03B increase in treasury stock from ~$5.31B to ~$6.34B in 2025) at a trailing P/E of ~85x and FCF yield of ~1.5%, which is expensive. Pass 1's score of 5.5 appears to have weighted the buyback price question already given the overall moderate score. The Hexagon acquisition scale is the one item not explicitly named in Pass 1's counter-evidence, but it is prominently disclosed in the filing and is a known strategic move, not a hidden concern. No single item rises to the level of a material omission from Pass 1's analysis that would warrant adjustment.

- **`mda`** — "Under the terms of the purchase agreement, we will pay Hexagon aggregate consideration of approximately €2.70 billion. Approximately €1.89 billion of the aggregate consideration will be paid in the form of cash, subject to customary purchase price adjustments in accordance with the purchase agreement, with the remaining consideration payable in the form of newly issued shares of Cadence's common stock. We intend to fund the cash consideration through a combination of cash on hand and borrowings under existing debt facilities."
  *Why it matters:* The Hexagon D&E acquisition is significantly larger than prior tuck-ins, involves ~€1.89B in cash (partly debt-funded on top of existing $2.5B Senior Notes), and includes stock issuance dilution. This is a scale shift in M&A strategy, but it is prominently disclosed and Pass 1's score already reflects moderate conviction in capital allocation quality.

### Pass 3 — Judge

**Final score: 5.5 / 10** *(decision: no-change)*

Pass 2 recommended zero adjustment and explicitly acknowledged that Pass 1's score already incorporated the key concerns: buybacks at elevated valuations (~85x P/E), the Hexagon D&E acquisition scale and debt-funding implications, and the $2.5B senior notes issuance. Pass 2's sole incremental citation (the Hexagon deal terms) was already present as Pass 1's citation [1], making the rebuttal largely redundant. The BIS/DOJ penalty point raised by Pass 2 is more a compliance issue than a capital allocation quality signal, and Pass 1's 5.5 score adequately reflects the mixed picture of strong R&D reinvestment discipline against imperfect buyback timing and rising M&A ambition at elevated prices.

## Debt sustainability

**Score:** 7.5 / 10   _samples: [7.5, 7.5, 7.5], range 0.0_ *(tight: low uncertainty)*

Cadence carries $2.5B in fixed-rate senior notes with maturities in 2027, 2029, and 2034, against $3.0B in cash — leaving net debt of roughly $1.5B. With 2025 operating income of ~$1.49B and interest expense of ~$117M, interest coverage is approximately 13×, well above distress thresholds. The debt is laddered across three tranches with no near-term maturity wall (earliest is $500M in 2027), and operating cash flow of $1.73B comfortably covers annual debt service. The main knock is that leverage was added relatively recently (2024) to fund M&A, and the 2027 maturity will require refinancing in about two years.

### Citations

- **`financial-statements`** — "2027 Notes500,000 (2,073)497,927 500,000 (3,206)496,794 2029 Notes1,000,000 (7,747)992,253 1,000,000 (9,666)990,334 2034 Notes1,000,000 (10,030)989,970"
  *Why it matters:* The debt table shows $2.5B total principal spread across 2027, 2029, and 2034 maturities — no single-year maturity wall — with the nearest tranche ($500M) due in 2027, giving Cadence roughly two years before any refinancing is needed.
- **`financial-statements`** — "Cash paid for interest$111,951 $43,219 $34,934"
  *Why it matters:* Cash interest paid jumped from ~$43M in 2024 to ~$112M in 2025 after the 2024 debt issuance, but against $1.73B of operating cash flow this represents a coverage ratio of approximately 15×, indicating highly comfortable debt service capacity.
- **`financial-statements`** — "Cash and cash equivalents$3,001,317 $2,644,030"
  *Why it matters:* Cadence held $3.0B in cash at year-end 2025 against $2.5B in total debt principal, meaning gross debt is essentially matched by cash on hand, reducing solvency risk even before considering ongoing free cash flow generation.

### Pass 1 counter-evidence considered

The $500M 2027 Notes will require refinancing within approximately two years, creating modest interest-rate and credit-market exposure. Additionally, total debt tripled from ~$850M pre-2024 to $2.5B after the September 2024 issuance of new notes, and the $128.5M loss related to a contingent liability in 2025 (versus $8.3M in 2024) suggests episodic cash drains that could modestly reduce headroom if they recur at scale.

### Pass 2 — Skeptic

*Adjustment: no change recommended*

Pass 1 already addressed the key concerns: the $500M 2027 Notes refinancing risk, the tripling of total debt in 2024, and the episodic contingent liability drain. Reading the primary sources independently, I looked for additional concerns not captured in Pass 1's counter-evidence: (1) covenant or cross-default language in the debt notes, (2) off-balance-sheet obligations, (3) cash adequacy relative to near-term maturities, and (4) interest coverage trends. The balance sheet shows $3.0B in cash against $2.5B total debt, meaning gross cash exceeds total debt — the net debt position of ~$1.5B per the financial context is entirely driven by the $500M 2027 Notes being the nearest maturity. Operating cash flow of $1.73B in 2025 covers total interest expense of $116.5M roughly 14.8x, and interest paid was $112M. The $7.8B in contracted but unsatisfied performance obligations provides strong forward revenue visibility that supports debt service. No going-concern language, no covenant breach disclosures, no material off-balance-sheet financing structures are present. The score of 7.5 appears well-calibrated: the company carries meaningful but manageable leverage for a high-FCF software business, with cash on hand alone nearly sufficient to retire all outstanding debt and with strong interest coverage. No new primary-source evidence warrants adjustment.

### Pass 3 — Judge

**Final score: 7.5 / 10** *(decision: no-change)*

Pass 2 explicitly recommended a 0 adjustment and agreed that Pass 1's 7.5 score is well-calibrated. Pass 2's independent review confirmed the same key facts: $3.0B cash against $2.5B total debt, ~14.8× interest coverage, no covenant breaches, no going-concern language, and $7.8B in contracted performance obligations providing forward revenue visibility. No new primary-source evidence was surfaced that would warrant changing the score.

## Insider alignment

**Score:** 6.0 / 10   _samples: [6.0, 6.0, 6.0], range 0.0_ *(tight: low uncertainty)*

Cadence is professionally managed with no founder currently at the helm; CEO Anirudh Devgan holds 823,017 shares (~0.30% of shares outstanding), which is meaningful in absolute dollar terms (~$244M at $296/share) but well below the founder-level threshold. Compensation structure is genuinely performance-oriented: a substantial majority of pay is at-risk via LTP Awards requiring >200% market cap growth over five years, new PSUs tied to operating income growth and relative TSR, and a long history of strong say-on-pay support averaging ~93% over ten years. However, the ownership percentage is modest for a professional CEO, and executive stock option grants represent a large portion of the beneficial ownership table, suggesting much of the 'skin in the game' is option-derived rather than purchased shares.

### Citations

- **`proxy`** — "Anirudh Devgan(4)(6)(7) 823,017 *"
  *Why it matters:* The CEO's beneficial ownership of 823,017 shares represents less than 1% of the ~276 million shares outstanding, indicating meaningful absolute dollar exposure but limited percentage ownership relative to a founder-led company.
- **`proxy`** *(punctuation-normalized match)* — "the LTP Awards granted in 2025 require the company's valuation to grow by more than 200% from the date of grant over five years for the maximum award to be earned."
  *Why it matters:* The LTP program creates direct alignment between executive pay and long-term stockholder value creation, requiring the company to more than triple its market capitalization over five years for maximum vesting — a high performance bar.
- **`proxy`** — "Over the past ten years, our say-on-pay proposals have had an average level of stockholder support of approximately 93% of the votes cast (excluding abstentions)."
  *Why it matters:* Sustained near-unanimous say-on-pay support over a decade suggests stockholders view the compensation structure as genuinely aligned with their interests, lending credibility to the pay-for-performance framing.
- **`proxy`** *(punctuation-normalized match)* — "Stock Ownership Guidelines. All of Cadence's executive officers are in compliance with Cadence's Stock Ownership Guidelines, which require ownership of shares of Cadence common stock with a minimum value of three times the annual base salary for Cadence's CEO"
  *Why it matters:* Formal ownership requirements enforce a minimum alignment floor, though a 3x salary guideline is relatively modest for a company of this size and does not prevent executives from diversifying beyond that threshold.

### Pass 1 counter-evidence considered

A significant portion of CEO share ownership derives from exercisable stock options (619,883 of the 823,017 shares are option-derived per footnote 4), meaning true outright ownership of shares purchased or held is much smaller — roughly 203,000 shares (~$60M), reducing the 'skin in the game' argument. Additionally, the proxy discloses a late Form 4 filing for director Gavrielov involving three broker-directed transactions, a minor governance lapse. No recent open-market purchases by the CEO are disclosed, and the ownership table shows all insiders combined hold well under 1% of shares outstanding.

### Pass 2 — Skeptic

*Adjustment: no change recommended*

Pass 1's counter-evidence already addresses the key concerns about insider alignment: the option-heavy composition of CEO ownership, the small outright share count, the absence of open-market purchases, the sub-1% aggregate insider ownership, and the Gavrielov Form 4 late filing. Reviewing the primary sources independently, I find no material concerns that Pass 1 did not already address. The proxy confirms the stock ownership guidelines (3x salary for CEO, 1x for other NEOs), a clawback policy, prohibition on hedging and pledging, and strong say-on-pay support averaging 93% over 10 years. The LTP program structure requiring a doubling of market cap creates genuine long-term alignment. The ownership table and footnotes are consistent with what Pass 1 described. No new structural concerns (dual-class shares, pledged shares, off-balance-sheet alignment issues) are present in the sources. The score of 6 appears well-calibrated given the modest outright ownership offset by strong pay-for-performance program design.

### Pass 3 — Judge

**Final score: 6.0 / 10** *(decision: no-change)*

Pass 2 recommended zero adjustment and explicitly confirmed that Pass 1 had already addressed all material concerns including the option-heavy ownership composition, small outright share count, absence of open-market purchases, sub-1% aggregate insider ownership, and the Gavrielov Form 4 late filing. The primary source sections confirm all of Pass 1's citations accurately: CEO beneficial ownership of 823,017 shares of which 619,883 are exercisable options, 3x salary ownership guidelines, 93% average say-on-pay support, and the LTP program requiring >200% valuation growth. No new structural concerns were identified by Pass 2, making the score of 6 well-calibrated as originally assessed.

## Cyclicality awareness

**Score:** 5.5 / 10   _samples: [6.0, 5.5, 5.5], range 0.5_ *(tight: low uncertainty)*

Cadence serves the semiconductor and electronics systems industries, which are explicitly acknowledged as cyclical in the 10-K. However, a substantial portion of revenue is recognized over time via time-based software licenses, which creates a natural revenue smoothing effect and lag in downturns. The risk factors candidly disclose both the cyclical nature of end markets and a buffering mechanism, placing CDNS between a pure cyclical and a stable compounder. The filing does not provide explicit through-cycle revenue data (e.g., 2020 or 2009 performance), limiting the ability to confirm trough resilience empirically from the provided sections.

### Citations

- **`risk-factors`** — "The semiconductor and electronics systems industries are cyclical and are characterized by constant and rapid technological change, product obsolescence and price erosion, evolving standards, short product life cycles and wide fluctuations in product supply and demand."
  *Why it matters:* Management explicitly admits the core end-markets are cyclical, meaning demand for EDA tools and IP is tied to semiconductor design activity, which swings materially across economic cycles.
- **`risk-factors`** — "A substantial portion of our software licenses yield revenue recognized over time, which may make it difficult for us to rapidly increase our revenue in future fiscal periods and means that a decrease in orders in a given period would negatively affect our revenue in future periods."
  *Why it matters:* The ratable revenue recognition model is a double-edged buffer: it dampens both upside and downside, meaning revenue does not collapse immediately in a downturn, but the lagged impact of lower bookings will eventually flow through, reducing the severity of near-term cyclical swings.
- **`risk-factors`** — "If growth in the semiconductor and electronics systems industries slows or stalls, then demand for our products and services could decrease and our business, financial condition and results of operations could be adversely affected."
  *Why it matters:* This direct linkage between semiconductor industry health and CDNS demand confirms that the business is not immune to cyclicality, even if revenue recognition smoothing provides a temporary cushion.

### Pass 1 counter-evidence considered

The risk factors note that a decrease in orders in any given period would 'negatively affect our revenue in future periods' due to ratable recognition, meaning the revenue model structurally delays but does not eliminate cyclical pain. Additionally, hardware and IP revenue is recognized at a point in time and is explicitly described as 'inherently difficult to predict' and sensitive to customers' willingness to 'expend capital,' making that segment more directly exposed to cyclical capex cuts. No through-cycle financial data (e.g., 2020 COVID period or 2009 recession results) was provided in the sections given to confirm empirical resilience.

### Pass 2 — Skeptic

*Adjustment: no change recommended*

Pass 1's counter-evidence already addresses the core cyclicality concerns: the ratable recognition model delays but doesn't eliminate cyclical pain, hardware/IP revenue is point-in-time and explicitly sensitive to capex cuts, and no through-cycle empirical data was provided. Reviewing the primary sources independently, the risk factors confirm these same dynamics — semiconductor industry cyclicality is disclosed explicitly ('The semiconductor and electronics systems industries are cyclical'), hardware/IP revenue is described as 'inherently difficult to predict' due to customer willingness to 'expend capital,' and the ratable model is described as delaying rather than eliminating revenue impact from order declines. No additional primary-source evidence materially beyond what Pass 1 already considered is present. The geopolitical/China export control risks are real but are not a cyclicality issue per se — they are regulatory/concentration risks. The score of 5.5 appears well-calibrated given the structural revenue model provides meaningful but imperfect cyclical buffering, and Pass 1 has already flagged the key limitations.

### Pass 3 — Judge

**Final score: 5.5 / 10** *(decision: no-change)*

Pass 2 explicitly recommended zero adjustment and confirmed that Pass 1's analysis was well-calibrated, finding no additional primary-source evidence beyond what Pass 1 already considered. Both analysts agree on the core dynamics: semiconductor cyclicality is explicitly disclosed, the ratable revenue recognition model buffers but does not eliminate cyclical pain, and hardware/IP revenue is point-in-time and capex-sensitive. The score of 5.5 accurately reflects a business with meaningful but imperfect cyclical insulation.
