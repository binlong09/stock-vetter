# NOW — Primary-Source Value Checklist

*Source:* 10-K accession `0001373715-26-000007` + DEF 14A (where used)
*Citation verification:* 16/23 exact, 0 whitespace-normalized, 0 case-only, 3 punctuation-normalized, 0 table-normalized, 4 **no-match**

> ⚠️ 4 citation(s) could not be located in the cited source. See annotations below.

Each dimension is scored 1–10 from primary sources only (no analyst opinions). Citations point to specific 10-K or proxy passages so you can verify the reasoning yourself — and learn what to look for in primary documents.

## Scores at a glance

| Dimension | Pass 1 | Skeptic Δ | Final | Decision |
|---|---|---|---|---|
| Moat durability | 7.0 | 0 | 7.0 | no-change |
| Owner earnings quality | 4.5 | 0 | 4.5 | no-change |
| Capital allocation | 5.0 | -0.5 | 4.5 | agreed-with-pass2 |
| Debt sustainability | 9.2 | 0 | 9.2 | no-change |
| Insider alignment | 6.5 | 0 | 6.5 | no-change |
| Cyclicality awareness | 7.5 | 0 | 7.5 | no-change |

## Moat durability

**Score:** 7.0 / 10   _samples: [7.0, 7.0, 7.0], range 0.0_ *(tight: low uncertainty)*

ServiceNow operates a unified workflow platform with deep enterprise integration, creating meaningful switching costs as customers embed the platform across HR, IT, finance, and other critical functions. The Business section articulates a multi-layered architectural moat: years of platform iteration, cross-functional workflow expertise, and AI governance capabilities that competitors must replicate from scratch. However, Risk Factors honestly disclose that this is a 'highly competitive and rapidly evolving market characterized by fragmentation, low barriers to entry,' with large incumbents like Microsoft, Oracle, SAP, and Salesforce all competing, and AI-native entrants threatening to leapfrog the workflow model. The moat is real but not impenetrable — it rests on switching costs and accumulated enterprise trust rather than network effects or regulated structural barriers.

### Citations

- **`business`** *(punctuation-normalized match)* — "our platform's architecture, developed over years of iteration with customer feedback, allows organizations to deploy AI-enhanced workflows without replacing their existing technology infrastructure or disrupting established processes."
  *Why it matters:* This passage describes a sticky integration layer that accumulates customer-specific configurations over time, making displacement costly and operationally risky for enterprise customers.
- **`business`** **⚠️ NO-MATCH** — "While competitors are actively developing AI capabilities and several entrants have emerged with point solutions focused on data analysis and information generation, we believe many face challenges in delivering the comprehensive integration, workflow orchestration, governance frameworks, and enterprise-grade reliability that our customers require."
  *Why it matters:* Management explicitly argues that the moat is multi-dimensional — integration breadth, orchestration depth, governance, and reliability — which would need to be replicated simultaneously by any challenger.
- **`risk-factors`** **⚠️ NO-MATCH** — "We operate in a highly competitive and rapidly evolving market characterized by fragmentation, low barriers to entry, shifting customer needs and frequent introductions of new products and services."
  *Why it matters:* Management's legally required disclosure of 'low barriers to entry' is the key counter-signal to the Business section's moat narrative, indicating the advantage is not structural but must be continuously earned.
- **`risk-factors`** — "Cloud-based and AI native vendors may build more business applications or AI powered automation solutions that compete with our products and services."
  *Why it matters:* This identifies the most credible near-term threat: AI-native competitors could leapfrog the accumulated workflow logic that underpins ServiceNow's switching cost advantage.

### Pass 1 counter-evidence considered

Risk Factors explicitly state 'low barriers to entry' and flag that large incumbent competitors (Microsoft, Oracle, SAP, Salesforce) plus AI-native entrants are all targeting the same enterprise workflow space. The filing also acknowledges that 'Systems of record operators may attempt to create technology solutions or other mechanisms that would prevent our systems from integrating with theirs,' which could erode the connective-tissue advantage that is central to ServiceNow's positioning. Additionally, the AI transition is described as creating 'both opportunity and risk,' meaning the existing platform moat could be disrupted by architectural shifts that advantage incumbents with larger data assets or native AI integration.

### Pass 2 — Skeptic

*Adjustment: no change recommended*

Pass 1 scored moatDurability at 7 and its counter-evidence section already addresses the key risks: low barriers to entry, large incumbent competitors, systems-of-record lock-out risk, and AI architectural disruption. Reviewing the primary sources independently, I find that Pass 1's score is well-calibrated. The business section documents several concrete moat-supporting features that Pass 1's score appears to already reflect: the multi-instance architecture developed over years of customer iteration, the 'Now on Now' program creating continuous feedback loops, the 8,700-customer base with enterprise-wide deployments, the 2,000+ issued patents, and the partner ecosystem with major GSIs and hyperscalers. The competitive-positioning language in the business section ('workflow orchestration, governance frameworks, and enterprise-grade reliability') and the acknowledgment that 'competitors face challenges in delivering comprehensive integration' are consistent with a durable but not impregnable moat. The risk factors' explicit 'low barriers to entry' language is already captured in Pass 1's counter-evidence. No new material evidence exists in the primary sources that Pass 1 failed to address — neither a structural concern that would warrant a downgrade nor a clearly understated strength that would warrant an upgrade. The 7/10 score appropriately reflects a real but contested moat.

### Pass 3 — Judge

**Final score: 7.0 / 10** *(decision: no-change)*

Pass 2 found no new material evidence beyond what Pass 1 already identified and weighed. Both analysts converge on the same assessment: a real but contestable moat resting on switching costs, platform depth, and accumulated enterprise trust, offset by explicit 'low barriers to entry' disclosure and credible AI-native competitive threats. Pass 2's cited moat-supporting features (patents, partner ecosystem, Now on Now feedback loops) were implicitly captured in Pass 1's reasoning and do not alter the score. The 7/10 stands as well-calibrated.

## Owner earnings quality

**Score:** 4.5 / 10   _samples: [4.5, 4.5, 4.5], range 0.0_ *(tight: low uncertainty)*

ServiceNow's GAAP net income of $1.748B in 2025 looks strong, but operating cash flow of $5.444B is massively inflated by $1.179B of deferred revenue build (cash collected before revenue earned) and $1.955B of stock-based compensation that is real economic dilution excluded from non-GAAP metrics. SBC alone represents 36% of operating cash flow and 112% of GAAP net income, meaning the 'owner earnings' are substantially lower than either reported figure. The business does generate genuine cash, but the gap between FCF and true owner-extractable earnings is wide and growing, as SBC has risen from $1.604B (2023) to $1.955B (2025). Capex of $868M is only modestly below D&A of $738M, suggesting meaningful ongoing infrastructure spend, while $758M in deferred commission capitalization further flatters reported operating cash flow by deferring real costs.

### Citations

- **`financial-statements`** — "Stock-based compensation1,955 1,746 1,604"
  *Why it matters:* SBC has compounded from $1.604B to $1.955B over three years and equals 112% of 2025 GAAP net income, representing massive non-cash dilution that the cash flow statement backs out but true owners must absorb through share count creep.
- **`financial-statements`** — "Deferred revenue1,179 1,179 1,085"
  *Why it matters:* Operating cash flow is systematically boosted each year by $1.1-1.2B of deferred revenue build — cash collected before services are rendered — which is a timing benefit that inflates FCF relative to sustainable owner earnings.
- **`financial-statements`** — "Deferred commissions(758)(713)(717)"
  *Why it matters:* Nearly $760M per year of real cash commission costs are capitalized and excluded from operating cash flow, understating the true cash cost of acquiring new business and overstating owner-extractable cash.
- **`mda`** — "Non-GAAP free cash flow $4,636 $3,455 $2,728"
  *Why it matters:* Management's own non-GAAP FCF adds back $60M of business combination costs but does not adjust for $1.955B of SBC, meaning the headline FCF figure substantially overstates cash available to owners after compensating employees at market rates.

### Pass 1 counter-evidence considered

The deferred revenue model does reflect genuine prepaid subscription cash that will convert to revenue, and the business has generated positive and growing operating cash flows for over ten years. Renewal rates of 98% validate that deferred revenue is not a credit risk. Additionally, the $5.444B operating cash flow vs. $1.748B net income ratio, while partly SBC-inflated, also reflects real cash conversion advantages of the subscription model with annual upfront billing.

### Pass 2 — Skeptic

*Adjustment: no change recommended*

Pass 1 scored ownerEarningsQuality at 4.5, with counter-evidence focused on SBC inflation of operating cash flow and the deferred revenue model. I examined the primary sources for any additional concerns or strengths not addressed.

One item worth noting that Pass 1 did not explicitly address: the deferred commissions accounting creates a structural divergence between cash and GAAP earnings. Cash commissions paid in 2025 were $758M (deferred commissions capitalized per cash flow statement) while only $621M was amortized through P&L. This means operating cash flow is reduced by the net $137M difference, but owner earnings are further complicated by the 5-year amortization policy. However, this is a well-disclosed accounting policy that actually makes GAAP earnings look better than cash (commissions paid upfront, amortized over 5 years), which is a modest positive for earnings quality not a negative.

The more significant unaddressed item is the scale of deferred income taxes: $249M non-cash deferred tax expense added back in 2025 (vs. $98M in 2024 and negative $857M in 2023 due to the valuation allowance release). The 2023 figure was a one-time $1.05B valuation allowance release that massively inflated GAAP net income that year. Pass 1's counter-evidence does not separately address how this deferred tax volatility affects the quality and comparability of net income across years — specifically that 2023's $1.731B net income included ~$1.05B of non-cash tax benefit, making it artificially high relative to 2025's $1.748B. This means the apparent 'flat' net income from 2023 to 2025 actually represents substantial underlying improvement in operating earnings quality.

However, this actually supports a slightly higher score, not lower — the underlying operating earnings quality improved more than the net income line suggests. That said, this is already partially captured in the operating cash flow trend ($3.4B → $4.3B → $5.4B) which Pass 1 acknowledged. The magnitude of this positive clarification is modest and does not rise to a +0.5 threshold given Pass 1 already noted the strong OCF-to-net-income conversion.

- **`financial-statements`** — "Deferred income taxes249 98 (857)"
  *Why it matters:* The deferred tax line swings dramatically: -$857M in 2023 (reflecting the ~$1.05B valuation allowance release), +$98M in 2024, +$249M in 2025. This creates significant year-over-year comparability issues for GAAP net income that Pass 1 did not separately address when assessing earnings quality.
- **`financial-statements`** — "Deferred commissions(758)(713)(717)"
  *Why it matters:* Cash commissions paid ($758M) substantially exceed amortization ($621M), meaning operating cash flow is reduced by this difference while GAAP expenses are lower. This is a well-disclosed policy that modestly improves earnings quality optics but was not separately discussed in Pass 1's counter-evidence.

### Pass 3 — Judge

**Final score: 4.5 / 10** *(decision: no-change)*

Pass 2 recommended zero adjustment and its rebuttal actually identifies factors that modestly support a higher score (deferred tax dynamics revealing stronger underlying earnings improvement, deferred commissions policy being earnings-quality positive), yet concludes these don't reach the threshold for adjustment. Pass 1's core concerns remain valid: SBC at 112% of GAAP net income, systematic deferred revenue inflation of OCF, and capitalized commission costs overstating owner-extractable cash are real and well-cited. Pass 2 found no material counter-evidence that Pass 1 missed or misweighted, so the original score of 4.5 stands.

## Capital allocation

**Score:** 5.0 / 10   _samples: [5.0, 5.0, 5.0], range 0.0_ *(tight: low uncertainty)*

ServiceNow has generated strong and growing operating cash flows ($5.4B in 2025 vs $4.3B in 2024), demonstrating healthy cash generation. However, capital allocation raises some concerns: M&A activity is accelerating dramatically with a pending $7.75B Armis acquisition (requiring new debt financing), buybacks have been executed at very high valuations (stock trading at 55x trailing P/E), and goodwill nearly tripled from $1.3B to $3.6B in a single year from acquisitions. The company does not pay dividends and has no multi-cycle track record of buying back stock at trough valuations.

### Citations

- **`mda`** — "In January 2026, our board of directors authorized an additional $5.0 billion in repurchases under the Share Repurchase Program."
  *Why it matters:* The board is authorizing large buybacks at a time when NOW trades at 55x trailing earnings, suggesting repurchases are being made at elevated valuations rather than at cyclical troughs.
- **`financial-statements`** — "In December 2025, we signed a definitive agreement to acquire Armis Security Ltd. a cyber-exposure management and cyber-physical security solutions provider, for approximately $7.75 billion cash consideration, subject to customary adjustments."
  *Why it matters:* A $7.75B acquisition requiring new debt financing represents a major capital deployment decision at an uncertain premium, with integration and strategic execution risk materially above prior acquisitions.
- **`financial-statements`** — "Goodwill acquired2,225 Foreign currency translation adjustments80 Balance as of December 31, 2025$3,578"
  *Why it matters:* Goodwill nearly tripled in one year, reflecting aggressive acquisition pricing; the Moveworks deal alone allocated $1.75B to goodwill on a $2.4B purchase, indicating a substantial premium to tangible and identifiable intangible value.
- **`mda`** **⚠️ NO-MATCH** — "we do expect to seek additional debt financing to fund our acquisition of Armis Security Ltd. discussed in Note 5 'Business Combinations' in the notes to our consolidated financial statements."
  *Why it matters:* Management acknowledges it will lever up to fund Armis, departing from the historically conservative balance sheet and adding financial risk to an already expensive acquisition pipeline.

### Pass 1 counter-evidence considered

Operating cash flow grew 28% year-over-year to $5.4B, and the company has generated positive operating cash flows for more than ten years, providing a strong foundation for capital deployment. The Moveworks and Logik.io acquisitions are strategically coherent (AI and CRM expansion), and the SCF program and disciplined management of $7.9B in non-cancellable commitments suggest operational discipline alongside the M&A activity.

### Pass 2 — Skeptic

*Adjustment: recommends -0.5 (downgrade)*

Pass 1 scored capitalAllocation at 5. The counter-evidence section focuses on operating cash flow growth and strategic coherence of acquisitions, but does not address two specific concerns visible in the primary sources that collectively warrant a modest downgrade. First, the pending Armis Security acquisition ($7.75B cash) represents a commitment roughly 2.75x the company's current net cash position of $2.8B and will require new debt financing explicitly acknowledged in the MDA ('we do expect to seek additional debt financing to fund our acquisition of Armis Security Ltd.'). This is a transformational capital commitment made at a premium with no equity component disclosed, layered on top of the already-signed Veza deal (~$1.25B cash). Second, the share repurchase program shows a pattern of accelerating buybacks at elevated multiples: $538M in 2023, $696M in 2024, and $1.84B in 2025, with an additional $5.0B authorized in January 2026 — all while the stock trades at a trailing EV/EBIT of ~51x. The treasury stock balance grew from $535M to $3.045B in two years. Deploying capital at 51x EBIT for buybacks simultaneously with taking on debt for a $7.75B acquisition creates a capital allocation tension Pass 1 did not address. The combination of these two concerns — leveraged M&A pipeline plus aggressive buybacks at elevated multiples — is modestly negative beyond what Pass 1 articulated.

- **`mda`** — "we do expect to seek additional debt financing to fund our acquisition of Armis Security Ltd. discussed in Note 5 "Business Combinations" in the notes to our consolidated financial statements"
  *Why it matters:* The company explicitly plans to take on new debt for a $7.75B acquisition, materially changing the capital structure beyond current net cash levels — a forward-looking capital allocation concern not addressed in Pass 1's counter-evidence.
- **`financial-statements`** — "In December 2025, we signed a definitive agreement to acquire Armis Security Ltd. a cyber-exposure management and cyber-physical security solutions provider, for approximately $7.75 billion cash consideration, subject to customary adjustments."
  *Why it matters:* The $7.75B cash commitment dwarfs the $2.8B net cash position and will require substantial debt financing, concentrating capital allocation risk in a single deal.
- **`financial-statements`** — "In January 2026, our board of directors authorized an additional $5.0 billion in repurchases under the Share Repurchase Program."
  *Why it matters:* A new $5.0B buyback authorization layered on top of aggressive 2025 repurchases ($1.84B) and a $7.75B pending acquisition signals competing capital demands at a time when leverage is set to increase materially.
- **`financial-statements`** — "During the years ended December 31, 2025 and 2024, the Company repurchased approximately 10.3 million and 4.0 million shares of its common stock for $1.8 billion and $696 million, respectively."
  *Why it matters:* Buyback pace tripled year-over-year to $1.84B while the stock trades at ~51x EV/EBIT, representing capital deployed at a valuation that limits per-share return on that capital.

### Pass 3 — Judge

**Final score: 4.5 / 10** *(decision: agreed-with-pass2)*

Pass 2's rebuttal surfaces a genuine incremental concern that Pass 1 noted but did not fully weight: the simultaneous acceleration of buybacks ($1.84B in 2025, $5B newly authorized in 2026) at ~51x EV/EBIT concurrent with a $7.75B leveraged acquisition creates a capital allocation tension beyond what Pass 1 articulated. Pass 1's counter-evidence focused on cash flow strength and strategic coherence but did not address the competing-capital-demands problem when the company is explicitly planning to increase debt for Armis while also authorizing record buybacks. Pass 2's citations are directly supported by the primary sources, and the -0.5 adjustment is modest and proportionate to the incremental risk identified.

## Debt sustainability

**Score:** 9.2 / 10   _samples: [9.2, 9.2, 9.2], range 0.0_ *(tight: low uncertainty)*

ServiceNow carries a single tranche of long-term debt — $1.5 billion of 1.40% fixed-rate notes maturing September 2030 — against $10.1 billion in cash and marketable securities and $5.4 billion of annual operating cash flow. Net cash position is approximately $2.8 billion, interest expense is only $23 million per year, and FCF coverage of interest exceeds 200×. The debt structure is simple, unsecured, and covenant-light, with no near-term maturity wall and no refinancing risk for five years.

### Citations

- **`financial-statements`** *(punctuation-normalized match)* — "In August 2020, we issued 1.40% fixed rate ten-year notes with an aggregate principal amount of $1.5 billion due on September 1, 2030 (the "2030 Notes")."
  *Why it matters:* A single, fixed-rate tranche at a historically low coupon maturing in 2030 means no near-term refinancing risk and minimal interest burden relative to cash flows.
- **`financial-statements`** — "For the periods ended December 31, 2025 and 2024, the carrying value of our outstanding debt was $1,491 million and $1,489 million, respectively, net of unamortized debt discount and issuance costs of $9 million and $11 million, respectively."
  *Why it matters:* Total debt is just $1.5 billion face value, dwarfed by $10.1 billion in liquid assets, confirming a net-cash position with no solvency concern.
- **`mda`** — "We anticipate cash flows generated from operations, cash, cash equivalents, marketable securities and long-term marketable securities will be sufficient to meet our liquidity needs for at least the next 12 months"
  *Why it matters:* Management explicitly confirms sufficiency of internal liquidity, and the $5.4 billion annual operating cash flow provides more than 360× coverage of the $23 million annual interest payment.
- **`financial-statements`** — "The 2030 Notes are unsecured obligations and the indentures governing the 2030 Notes contain customary events of default and covenants that, among others and subject to exceptions, restrict our ability to incur or guarantee debt secured by liens on specified assets or enter into sale and lease-back transactions"
  *Why it matters:* The covenants are minimal and standard — no financial maintenance covenants, leverage ratios, or coverage tests — eliminating any risk of covenant breach even in a severe downturn.

### Pass 1 counter-evidence considered

The company noted it 'does expect to seek additional debt financing to fund our acquisition of Armis Security Ltd.,' which could increase leverage. However, given $10.1 billion in liquid assets and $5.4 billion in annual operating cash flow, even a multi-billion dollar debt issuance would keep net leverage well below 1× EBITDA, posing no meaningful solvency risk.

### Pass 2 — Skeptic

*Adjustment: no change recommended*

Pass 1's score of 9.2 is well-calibrated. The primary sources confirm a single debt instrument — $1.5 billion of 1.40% fixed-rate 2030 Notes — against $10.1 billion in liquid assets (cash, cash equivalents, marketable securities, and long-term marketable securities) and $5.4 billion in operating cash flow. Net debt is deeply negative at approximately -$8.6 billion when netting liquid securities against the $1.5 billion principal. The indenture covenants are described as 'customary' and limited in scope (restrictions on secured debt and sale-leaseback transactions), posing no meaningful constraint on operations. Interest expense of $23 million annually against $1.8 billion EBIT represents an interest coverage ratio exceeding 79×. The Armis debt financing concern was already addressed by Pass 1. No new primary-source evidence warrants adjustment in either direction.

- **`financial-statements`** — "In August 2020, we issued 1.40% fixed rate ten-year notes with an aggregate principal amount of $1.5 billion due on September 1, 2030 (the "2030 Notes"). The 2030 Notes were issued at 99.63% of principal and we incurred $13 million for debt issuance costs. The effective interest rate for the 2030 Notes was 1.53%"
  *Why it matters:* Single, low-cost fixed-rate debt instrument with no floating-rate exposure and a long runway to maturity (September 2030), confirming minimal refinancing and interest rate risk.
- **`financial-statements`** — "The 2030 Notes are unsecured obligations and the indentures governing the 2030 Notes contain customary events of default and covenants that, among others and subject to exceptions, restrict our ability to incur or guarantee debt secured by liens on specified assets or enter into sale and lease-back transactions with respect to specified properties."
  *Why it matters:* Covenant structure is non-restrictive and standard; no financial maintenance covenants, no leverage ratio tests, no risk of covenant breach.
- **`mda`** — "When assessing sources of liquidity, we also include cash and cash equivalents, marketable securities and long-term marketable securities totaling $10.1 billion as of December 31, 2025."
  *Why it matters:* Liquid assets of $10.1 billion against $1.5 billion of debt principal results in deeply negative net debt, confirming exceptional debt sustainability.

### Pass 3 — Judge

**Final score: 9.2 / 10** *(decision: no-change)*

Pass 2 fully agrees with Pass 1's score and reasoning, citing the same primary-source passages confirming $1.5 billion of fixed-rate 2030 Notes against $10.1 billion in liquid assets, minimal covenant constraints, and interest coverage exceeding 79×. Pass 2 recommended zero adjustment and surfaced no new concerns. The score of 9.2 accurately reflects exceptional debt sustainability with only a minor deduction for the prospective Armis debt financing that could modestly increase gross leverage.

## Insider alignment

**Score:** 6.5 / 10   _samples: [6.5, 6.5, 6.5], range 0.0_ *(tight: low uncertainty)*

ServiceNow has a professional CEO (not founder) with meaningful but not exceptional ownership — McDermott holds roughly 2.2 million shares (~0.2% of outstanding), primarily via options. Founder Luddy holds ~768,565 shares but is not operationally involved. Compensation is heavily performance-based with multi-year vesting PRSUs (3-year cliff), an rTSR modifier retained at shareholder request, and stock ownership guidelines recently increased to 6x base salary for the CEO. The structure is well-designed for alignment, but the actual insider ownership levels are modest relative to market cap, and a large portion of McDermott's 'ownership' is unexercised options rather than outright shares.

### Citations

- **`proxy`** — "Extending the PRSU vesting period to 3-year cliff vesting from 3-year ratable vesting"
  *Why it matters:* The shift to cliff vesting over three years meaningfully lengthens the incentive horizon, tying executive wealth more directly to sustained multi-year performance rather than near-term results.
- **`proxy`** **⚠️ NO-MATCH** — "Market Value of Shares Owned as a Multiple of Base Salary or Annual Retainer... Chief Executive Officer... Current Ownership Requirement... Six Times (6x)"
  *Why it matters:* The recently increased CEO stock ownership guideline of 6x base salary (up from 3x) demonstrates the board's intent to keep executive skin-in-the-game, though compliance has a 5-year runway.
- **`proxy`** — "Consists of (i) 2,030,265 shares of common stock subject to stock options held by Mr. McDermott that are exercisable within 60 days of February 28, 2026, (ii) 24,405 shares of common stock held by a trust, of which Mr. McDermott is a trustee, and (iii) 158,234 shares of common stock."
  *Why it matters:* The vast majority of McDermott's beneficial ownership is unexercised options rather than outright stock, meaning his economic exposure is leveraged but not equivalent to a long-term shareholder holding shares.
- **`proxy`** — "Consists of (i) 153,000 shares of common stock held by an LLC, of which Mr. Luddy may be deemed to have voting and investment power, and (ii) 615,565 shares of common stock held by a trust, of which Mr. Luddy is a trustee."
  *Why it matters:* Founder Luddy retains ~768,565 shares but is not in an operational role, so his alignment is passive rather than active strategic stewardship.

### Pass 1 counter-evidence considered

The 89% say-on-pay approval and robust shareholder engagement program suggest the compensation structure has broad support, but the overall insider ownership as a percentage of shares outstanding (~0.3% for all directors and NEOs combined) is quite low for a company of this scale, limiting the signaling value of insider alignment versus a founder-controlled or concentrated-ownership structure.

### Pass 2 — Skeptic

*Adjustment: no change recommended*

Pass 1 already identified the core concern — low aggregate insider ownership (~0.3%) limiting alignment signaling. Reviewing the proxy for additional evidence not addressed by Pass 1, I note several structural positives that are well-documented: (1) Stock ownership guidelines were recently increased in February 2025 to 6x base salary for CEO and 3x for other executive officers (up from 3x and 1x respectively), and 5x annual retainer for non-employee directors (up from 3x). (2) The compensation program has 89% say-on-pay approval and multiple performance-based vesting mechanisms (3-year cliff PRSUs, rTSR modifier). (3) The clawback policy applies to Section 16 officers. One item not explicitly addressed by Pass 1 is the related-party transaction involving Jeff Miller (former director serving as Chancellor Emeritus for $365,000) and the daughter of executive officer Mr. Fipps receiving employment exceeding $120,000 — these are disclosed and reviewed under the Related Party Transactions Policy, indicating governance process is functioning, but they represent minor nepotism/entrenchment signals. However, these are modest in scale and properly disclosed. The founder Frederic Luddy holds ~768,565 shares (~0.07% of outstanding) through trust/LLC structures, and CEO McDermott holds ~2.2M shares largely through exercisable options (2.03M of the 2.21M). The option-heavy nature of CEO ownership means his economic alignment is partially contingent on stock price but with asymmetric downside protection typical of options. This option-heavy structure is a nuance Pass 1 did not specifically call out, but it is a relatively minor concern given the scale and that PRSUs/RSUs are the current grant vehicle. Overall, Pass 1's score of 6.5 appears well-calibrated given the low aggregate ownership offset by strong governance structures.

- **`proxy`** — "Market Value of Shares Owned as a Multiple of Base Salary or Annual RetainerExecutive LevelPrevious Ownership RequirementCurrent Ownership RequirementChief Executive OfficerThree Times (3x)Six Times (6x)Other Executive OfficersOne Time (1x)Three Times (3x)Non-employee DirectorsThree Times (3x)Five Times (5x)"
  *Why it matters:* Ownership guidelines were materially increased in February 2025, a structural positive Pass 1 did not explicitly weigh against the low current ownership levels.
- **`proxy`** — "Consists of (i) 2,030,265 shares of common stock subject to stock options held by Mr. McDermott that are exercisable within 60 days of February 28, 2026, (ii) 24,405 shares of common stock held by a trust, of which Mr. McDermott is a trustee, and (iii) 158,234 shares of common stock."
  *Why it matters:* CEO's beneficial ownership is dominated by exercisable options (2.03M of 2.21M total), which have asymmetric payoff profiles compared to outright share ownership, a nuance not addressed in Pass 1's counter-evidence.
- **`proxy`** — "The daughter of our executive officer, Mr. Fipps, accepted an offer of employment with the Company to start later this year. Her annual compensation, which will exceed $120,000, is commensurate with the compensation of her peers and has been established in accordance with the Company's compensation practices applicable to employees with equivalent qualifications, experience and responsibilities."
  *Why it matters:* A related-party employment arrangement involving an NEO's family member, disclosed and reviewed under policy, represents a minor entrenchment/nepotism signal not noted by Pass 1, though it is modest in scale.

### Pass 3 — Judge

**Final score: 6.5 / 10** *(decision: no-change)*

Pass 2 explicitly recommends 0 adjustment and confirms Pass 1's score is well-calibrated. The additional details Pass 2 surfaces — the option-heavy CEO ownership structure, the increased ownership guidelines, and the minor related-party employment arrangement — were either already noted by Pass 1 or are too modest in scale to shift the score. The related-party transactions (Miller $365K, Fipps daughter employment) are properly disclosed and reviewed under policy, representing minimal alignment risk. Pass 1's 6.5 accurately reflects the tension between strong governance structures and low aggregate insider ownership (~0.3% of outstanding shares).

## Cyclicality awareness

**Score:** 7.5 / 10   _samples: [7.5, 7.5, 7.5], range 0.0_ *(tight: low uncertainty)*

ServiceNow sells subscription software to large enterprises under multi-year contracts, with a 98% renewal rate held steady across 2023-2025, which structurally insulates revenues from quarter-to-quarter economic swings. The company has generated positive operating cash flows for more than ten years continuously and explicitly expects to do so through 2026. However, management acknowledges in Risk Factors that macro deterioration can delay digital transformation spending and reduce willingness to purchase, and the business is not immune to budget freezes — it is non-cyclical rather than counter-cyclical, warranting a high but not maximum score.

### Citations

- **`mda`** — "Our renewal rate was 98% for each of the years ended December 31, 2025, 2024 and 2023."
  *Why it matters:* A sustained 98% renewal rate across multiple years — including the post-pandemic macro tightening period — demonstrates that existing revenue is highly sticky regardless of the economic environment.
- **`mda`** — "We have generated positive operating cash flows for more than ten years as we continue to grow our business in pursuit of our business strategy, and we expect to grow our business and generate positive cash flows from operations during 2026."
  *Why it matters:* A decade-plus unbroken streak of positive operating cash flow provides direct through-cycle evidence that the subscription model holds up across economic conditions.
- **`risk-factors`** *(punctuation-normalized match)* — "These conditions can arise suddenly and affect the rate of digital transformation spending and could adversely affect our customers' or prospective customers' ability or willingness to purchase our services, delay purchasing decisions, reduce the value or duration of their subscriptions, or affect renewal rates."
  *Why it matters:* Management explicitly flags macro sensitivity as a risk to new bookings and renewal rates, confirming the business is non-cyclical but not fully immune — a ceiling on the cyclicality score.

### Pass 1 counter-evidence considered

The risk factors acknowledge that global economic weakness can delay purchasing decisions and compress contract values, and the company flags significant seasonality (Q4 skew in signings and Q1 skew in collections), meaning near-term reported metrics can be misleading about underlying demand trends. Additionally, RPO growth could be meaningfully affected by foreign currency fluctuations, adding a macro-driven volatility layer even if underlying unit demand is stable.

### Pass 2 — Skeptic

*Adjustment: no change recommended*

Pass 1's counter-evidence already addresses the primary cyclicality concerns: macro sensitivity to purchasing decisions, Q4/Q1 seasonality skew, and FX-driven RPO volatility. Reviewing the primary sources independently, I find no material new evidence that would warrant an adjustment in either direction. The MDA confirms a 98% renewal rate for each of 2025, 2024, and 2023, subscription revenue recognized ratably over 12-36 month terms (which structurally dampens cyclical swings), and $28.2 billion RPO growing 27% YoY — all consistent with a business whose revenue base is highly recurring and not acutely cyclical. The risk factors acknowledge macro sensitivity but do not provide evidence of historical revenue contraction or meaningful churn in downturns. The structural insulation from ratable recognition and multi-year contracts supports the 7.5 score. No new primary-source evidence was found that Pass 1 failed to address.

### Pass 3 — Judge

**Final score: 7.5 / 10** *(decision: no-change)*

Pass 2 found no new primary-source evidence beyond what Pass 1 already identified and weighed. Both analysts agree the 98% renewal rate, ratable revenue recognition over 12-36 month terms, decade-plus positive operating cash flow streak, and $28.2B RPO support a structurally non-cyclical business, while the acknowledged macro sensitivity to new bookings and FX-driven RPO volatility appropriately cap the score below the maximum. Pass 2's rebuttal explicitly concurs with the 7.5 score and recommends zero adjustment.
