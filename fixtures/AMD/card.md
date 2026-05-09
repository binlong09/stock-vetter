# Advanced Micro Devices (AMD) — Decision Card

**Verdict:** Pass  •  **Weighted score:** 3.3 / 10

*Analyst:* Drew Cohen   *Video date:* 2026-03-07   *Generated:* 2026-05-08   *Video:* qpcf_rxgCag

> AMD is a high-growth secular winner in data center CPUs and GPUs with massive upside if it can crack Nvidia's GPU market, but extreme historical cyclicality and CUDA moat make earnings projection very difficult, leaving valuation highly uncertain.

## Scores

| Dimension | Score | Rationale |
|---|---|---|
| Margin of Safety | 2.0 / 10 | Nearly every stress test assumption is rated high sensitivity and bear cases produce large negative return deltas: revenue bear case -25%, operating margin bear case -15%, contract non-execution -20%, earnings bear case -30%, dilution -5%, and multiple compression -10%. Cumulative bear case suggests returns could be -60% to -80% from current prices. The thesis requires simultaneous execution on 35% revenue CAGR, margin expansion from low single digits to 35%, two uncommitted mega-contracts executing, no CUDA moat entrenchment, no AI CapEx downcycle, and no Taiwan supply disruption. Missing risks include US export controls on China revenue (20-30% of historical revenue), TSMC single-supplier concentration, GAAP vs non-GAAP earnings divergence from $57B in acquisitions, and ongoing SBC dilution beyond the warrant haircut. The bear case in the stress test still produces deeply negative returns even under moderate downside assumptions. |
| Valuation Attractiveness | 3.0 / 10 | The current price of $435 implies a market cap of $710B, yet the financial snapshot shows a P/E of 146x on actual earnings and EV/EBIT of 1640x. The analyst's own valuation math contains multiple blocker-level inconsistencies: the stated 13.5x implied 2028 PE and 7.5x implied 2030 PE are internally consistent with each other but imply a market cap of roughly $322-324B, far below the actual $710B market cap, making both multiple figures wrong by approximately 2x. The implied return range of -50% to +100% is not reconcilable with any combination of the analyst's own revenue, margin, and multiple assumptions. FCF yield of 1.0% at current prices is extremely low. No 10-year median P/E or EV/EBIT comps are available for historical context. The bull case requires a 50x earnings increase in 5 years from 2025 actuals. |
| Business Quality | 4.0 / 10 | AMD has genuine competitive advantages in data center CPUs (chiplet architecture, TSMC manufacturing edge over Intel) and a credible AI GPU presence, but the moat durability score of 3/10 from the value checklist reflects a business that is contestable on both fronts. The GPU moat is nascent versus Nvidia's entrenched CUDA ecosystem. Capital allocation is mixed: Lisa Su's acquisitions are strategically sensible but issuing warrants for 20% of equity at a penny per share is a significant value transfer. Share count has grown from 792M to 1,622M over 9 years. Extreme cyclicality (90% EBIT decline 2021-2023) is a fundamental business quality detractor. Owner earnings quality is obscured by $57B in acquisitions generating heavy amortization. |
| Financial Health | 5.0 / 10 | AMD holds net cash of $8.5B and debt-to-equity has collapsed from 7.7x in 2017 to 0.03x in 2025, removing near-term solvency risk. FCF has been positive in recent years ($3.1B in 2024, $1.1B in 2025). However, the 2025 EBIT of only $401M on $35B+ revenue signals severely compressed margins, and 2024 EBIT of $1.26B being below net income of $1.32B implies large non-operating adjustments from acquisition amortization. Current P/E of 146x on actual earnings and EV/EBIT of 1640x confirm earnings are heavily distorted. Share count trend is growing (dilution concern). Ongoing SBC and warrant dilution risk compounds the concern. |
| Analyst Rigor | 4.0 / 10 | The analyst demonstrates genuine effort: explicit low-confidence labels on all forward assumptions, thorough cyclicality acknowledgment, detailed competitive landscape treatment of CUDA moat, and a conservative 10-12x peak semis multiple rather than growth multiples. However, three blocker-level mathematical inconsistencies undermine the valuation: implied PE multiples are off by ~2x versus actual market cap, the implied return range is not derivable from stated assumptions, and the tax rate bridge from operating margin to after-tax earnings is never stated. Additionally, five significant risks are inadequately addressed (TSMC geopolitical concentration, export controls, GAAP vs non-GAAP earnings, customer concentration, ongoing SBC dilution). The Nvidia revenue figure ($215B) appears to conflate revenue with market cap. These are material process failures for a valuation-dependent thesis. |

### Score citations

- **Margin of Safety**
  - stressTest[0]: revenue bear case impliedReturnDelta -0.25
  - stressTest[5]: contract non-execution impliedReturnDelta -0.20
  - stressTest[6]: earnings bear case impliedReturnDelta -0.30
  - missingRisks: TSMC/Taiwan concentration, US export controls on China, GAAP/non-GAAP divergence, customer concentration
  - risks: CUDA moat severity high; AI CapEx bubble severity high; contract uncertainty severity high
  - consistency blockers: 3 blocker-level inconsistencies in valuation math
- **Valuation Attractiveness**
  - consistency blocker: implied PE multiples (13.5x 2028, 7.5x 2030) inconsistent with $710B market cap
  - consistency blocker: implied return range -50% to +100% not reconcilable with stated assumptions
  - financialSnapshot.peRatio: 146.1x; evEbit: 1640x
  - financialSnapshot.fcfYield: 1.01%
  - financialSnapshot.peRatio10yMedian: null
  - stressTest[6]: bear case 2030 earnings $5-8B vs base $43B; impliedReturnDelta -0.30
- **Business Quality**
  - valueChecklist.moatDurability: score 3 - GPU moat nascent vs Nvidia CUDA ecosystem
  - valueChecklist.capitalAllocation: score 3 - warrant issuance at penny per share for 20% dilution
  - valueChecklist.cyclicalityAwareness: score 4 - EBIT fell 90% from 2021 to 2023
  - financialSnapshot.shareCountTrend: growing (792M to 1,622M over 9 years)
- **Financial Health**
  - financialSnapshot.netCash: $8.475B
  - annual[2025].debtToEquity: 0.031 vs 7.67 in 2017
  - annual[2025].ebit: $401M on implied $35B+ revenue
  - annual[2024].netIncome: $1.32B exceeds ebit $1.264B - unusual relationship
  - financialSnapshot.peRatio: 146x; evEbit: 1640x
  - financialSnapshot.shareCountTrend: growing
  - valueChecklist.debtSustainability: score 4
- **Analyst Rigor**
  - consistency blocker: implied PE multiple off by ~2x vs actual market cap
  - consistency blocker: implied return range not reconcilable with stated assumptions
  - consistency concern: tax rate bridge missing from operating margin to after-tax earnings
  - missingRisks: 5 concerns identified not addressed by analyst
  - risks: analystAddressedWell=false for Nvidia CPU entry, Taiwan risk, LLM slowdown

## Pros / Cons (analyst vs. critic)

| Topic | Analyst view | LLM pushback | Agreement |
|---|---|---|---|
| Valuation math integrity | AMD trades at 13.5x 2028 earnings and 7.5x 2030 earnings, implying 50-100% upside over 5 years. | Three blocker-level inconsistencies: the implied PE multiples assume a ~$322B market cap but AMD trades at $710B, making both multiples wrong by roughly 2x; the stated return range of -50% to +100% cannot be derived from any combination of the analyst's own assumptions. | disagree |
| Revenue growth assumption (35% CAGR) | Management guidance of 35% CAGR from $35B base is achievable via Meta/OpenAI GPU contracts and continued EPYC server CPU share gains. | All revenue assumptions are rated low confidence; neither Meta nor OpenAI contract is committed; AMD's historical cyclicality saw near-stagnation and deep declines in prior cycles; and the bear case of 10% CAGR produces revenue of only $56B by 2030, cutting projected earnings by over 80%. | partial |
| CUDA moat vs. AMD GPU opportunity | Nvidia's CUDA moat is strong but potentially vulnerable to AI-assisted code translation; AMD's ROCm is improving and Meta/OpenAI are actively investing to use Instinct GPUs. | Millions of engineers and vast codebases are locked into CUDA; AMD's real-world GPU performance is still inferior; the analyst acknowledges this is the single biggest competitive risk, and GPU market share gains remain unproven at scale beyond two uncommitted hyperscaler relationships. | partial |
| Data center CPU moat (EPYC) | AMD's EPYC has taken server CPU share from Intel, which has fallen from ~99% to ~65% market share, driven by chiplet architecture and TSMC manufacturing advantage. | This is AMD's strongest and most defensible competitive position; the critique largely agrees but notes Intel is fighting back with next-gen chips backed by government funding and customer support. | agree |
| Cyclicality and earnings quality | AMD's extreme cyclicality is a known risk; analyst applies low confidence to all assumptions and uses conservative 10-12x peak semis multiple rather than growth multiples. | The financial snapshot confirms the concern: 2025 EBIT of only $401M and net income of $854M on $35B+ revenue; the $43B 2030 earnings target requires a ~50x earnings increase in 5 years, and the bear case of $5-8B is more consistent with AMD's historical earnings range. | partial |
| Share dilution risk | 20% dilution from Meta and OpenAI warrants at a penny per share is flagged as a meaningful risk that reduces per-share upside. | Ongoing SBC dilution layered on top of warrant dilution is unaddressed; shares grew from 792M to 1,622M over 9 years; total dilution including SBC could approach 25-30% over the investment horizon, compressing per-share returns further than the stated 20% haircut. | partial |
| Balance sheet and solvency risk | AMD has $8.5B net cash, negligible debt-to-equity, and consistent recent FCF; no meaningful near-term solvency risk. | Agreed; the balance sheet is clean and this is one area where AMD scores well; however, $57B in acquisitions created large goodwill and intangible balances with impairment risk if acquisitions underperform. | agree |
| TSMC/Taiwan geopolitical and supply chain risk | Briefly mentioned in passing but not substantively addressed as a core investment risk. | AMD is 100% dependent on TSMC for all leading-edge manufacturing with zero fab redundancy; a Taiwan Strait conflict or major TSMC disruption could halt AMD's entire product roadmap for 12-24+ months, which is existential for a company whose thesis depends on continuous chip generation cadence. | disagree |
| US export controls and China revenue | Not mentioned in the analysis. | AMD historically derives 20-30% of revenue from China; US BIS export controls have already restricted MI300X-class GPUs from Chinese customers and are tightening; this is a structural revenue headwind compounding the cyclicality risk that was entirely omitted from the risk section. | disagree |
| Management quality (Lisa Su) | Lisa Su is highly regarded; stock 100x since her tenure began; prescient acquisitions positioned AMD ahead of AI trend. | Agreed on track record; however, issuing warrants for 20% of equity at a penny per share to two customers is a capital allocation question that deserves more scrutiny, and the lack of disclosed insider ownership data limits assessment of financial alignment. | partial |

## Things to verify

- Verify AMD's actual market cap at the video date (March 7, 2026) and recalculate the implied PE multiples on 2028 and 2030 earnings using the correct market cap; the analysis states 13.5x and 7.5x but current financial snapshot shows $710B market cap implying multiples 2-3x higher than stated, which fundamentally changes whether the stock is cheap or expensive.
- Pull AMD's latest 10-K to find (a) the precise GAAP vs non-GAAP operating income reconciliation, (b) annual intangible amortization from Xilinx and other acquisitions, and (c) actual share-based compensation expense as a percentage of revenue; the analyst's 35% operating margin target is almost certainly non-GAAP and GAAP margins are dramatically lower.
- Check AMD's China revenue disclosure in the most recent 10-K or 10-Q; if China represents 20-30% of revenue and advanced GPU exports are restricted, quantify the revenue at risk from further export control tightening before accepting the 35% CAGR assumption.
- Verify the current status of the Meta and OpenAI supply agreements: are they formal contracts with take-or-pay provisions, or letters of intent; specifically check whether warrant vesting is tied to purchasing milestones and what the performance walkaway triggers are for Meta.
- Confirm total share count including all dilutive securities (warrants, stock options, RSUs, convertibles) from the latest proxy or 10-Q diluted share table; the analyst states 20% warrant dilution but ongoing SBC has historically driven 8-9% annual dilution in earlier years and the combined impact on per-share earnings needs to be modeled.
- Look up AMD's most recent quarterly earnings release to determine whether data center revenue growth is tracking toward the 30%+ assumption or decelerating, and whether management has reaffirmed the multi-year guidance that underlies the entire valuation model.

## Financial snapshot

*As of:* 2026-05-08

| Metric | Value |
|---|---|
| Price | $435 |
| Market cap | $710.09B |
| Enterprise value | $657.72B |
| Net cash | $8.48B |
| P/E (TTM) | 146.1 |
| EV / EBIT | 1,640.2 |
| EV / Sales | — |
| FCF yield | 1.0% |
| Profitable (last FY) | yes |
| Positive FCF (last FY) | yes |
| Share count trend (3y) | growing |

## Valuation assumptions (analyst)

*Method:* Forward earnings multiple on management-guided revenue and margin targets (3-year and 5-year scenarios)  •  *Horizon:* 5 yr
*Implied return:* -50.0% – 100.0%

| Assumption | Value | Confidence | Citation |
|---|---|---|---|
| Revenue growth rate for next 3-5 years per management guidance | 35% per year | low | [0:55–1:15] |
| Revenue at 3 years (2028) at 35% CAGR from $35B | $85 billion | low | [58:25–58:50] |
| Revenue at 5 years (2030) at 35% CAGR from $35B | $155 billion | low | [58:50–59:05] |
| Operating margin target per management guidance | 35% | low | [58:55–59:15] |
| After-tax earnings in 3 years (2028) | ~$24 billion | low | [58:58–59:18] |
| After-tax earnings in 5 years (2030) | ~$43 billion | low | [59:10–59:30] |
| Implied multiple at current market cap on 2028 earnings (pre-dilution) | ~13.5x | medium | [59:08–59:22] |
| Implied multiple at current market cap on 2030 earnings (pre-dilution) | ~7.5x | medium | [59:20–59:40] |
| Dilution from Meta and OpenAI warrants | ~20% | medium | [59:43–59:58] |
| Appropriate PE multiple for peak semiconductor earnings per institutional investors | 10-12x (high single digit to low double digit) | medium | [1:00:00–1:00:25] |
| Bull case PE multiple if data center growth extends well beyond 5 years | 15x on 5-year earnings | low | [1:00:40–1:01:00] |

## Critique findings

### Internal consistency

- **[concern] Segment revenues vs. stated total revenue** (disagree)
  - Analyst: AMD's current revenue base is described as ~$35B (used as the starting point for 35% CAGR projections).
  - Pushback: The three segments sum to $16.8B + $14.7B + $3.5B = $35.0B, which does reconcile to the $35B baseline. No error here, but the Client and Gaming segment at $14.7B is extremely large — nearly as large as Data Center at $16.8B — which appears inconsistent with the analyst's own statement that Ryzen CPUs represent '30% of revenues' (30% of $35B = ~$10.5B, not $14.7B). If Client and Gaming is $14.7B that would be ~42% of revenues, not 30%.
  - Evidence: segments[1].revenue = $14,700,000,000; segments[1].keyDrivers includes 'Ryzen CPUs for notebook/desktop/business PCs (30% of revenues)'; total implied revenue = $35B
- **[concern] Nvidia revenue figure vs. AMD revenue comparison** (disagree)
  - Analyst: Nvidia dominates GPU market with '$215B revenue vs AMD's $35B'.
  - Pushback: Nvidia's trailing revenue as of early 2026 would be approximately $130B (fiscal year ending Jan 2026 was ~$130B). A $215B figure for Nvidia appears significantly overstated relative to any publicly available period, and this comparison is stated as fact within the analysis. If the analyst is projecting forward Nvidia revenue rather than citing current figures, that context is missing and the comparison is apples-to-oranges.
  - Evidence: competitiveLandscape[0].analystView: 'Nvidia dominates GPU market with $215B revenue vs AMD's $35B'; videoDate: 2026-03-07
- **[nit] 3-year revenue math at 35% CAGR from $35B** (disagree)
  - Analyst: Revenue at 3 years (2028) at 35% CAGR from $35B = '$85 billion'.
  - Pushback: $35B × (1.35)^3 = $35B × 2.460 = ~$86.1B. The stated $85B is close but slightly understated; this is a minor rounding issue and not materially wrong.
  - Evidence: valuation.keyAssumptions[1]: value = '$85 billion'; valuation.keyAssumptions[0]: value = '35% per year'; base revenue = $35B
- **[nit] 5-year revenue math at 35% CAGR from $35B** (disagree)
  - Analyst: Revenue at 5 years (2030) at 35% CAGR from $35B = '$155 billion'.
  - Pushback: $35B × (1.35)^5 = $35B × 4.484 = ~$156.9B. The stated $155B is a minor understatement but close enough to be rounding. Not a material error.
  - Evidence: valuation.keyAssumptions[2]: value = '$155 billion'; valuation.keyAssumptions[0]: value = '35% per year'; base revenue = $35B
- **[concern] After-tax earnings math for 2028** (disagree)
  - Analyst: After-tax earnings in 3 years (2028) = '~$24 billion', derived from $85B revenue × 35% operating margin.
  - Pushback: $85B × 35% operating margin = $29.75B operating income. To arrive at ~$24B after-tax implies a ~19% effective tax rate ($29.75B × 0.81 ≈ $24.1B), which is plausible but never stated. Alternatively, if the analyst meant net margin of ~28% on $85B that yields $23.8B. The tax rate assumption is entirely missing from the extracted analysis, creating an unreconciled gap between operating margin and after-tax earnings.
  - Evidence: valuation.keyAssumptions[3]: operating margin = '35%'; valuation.keyAssumptions[4]: after-tax earnings 2028 = '~$24 billion'; valuation.keyAssumptions[1]: 2028 revenue = '$85 billion'; no tax rate assumption present
- **[concern] After-tax earnings math for 2030** (disagree)
  - Analyst: After-tax earnings in 5 years (2030) = '~$43 billion', derived from $155B revenue × 35% operating margin.
  - Pushback: $155B × 35% = $54.25B operating income. To arrive at ~$43B after-tax implies a ~21% effective tax rate ($54.25B × 0.79 ≈ $42.9B). The implied tax rate is consistent with the 2028 figure (~19-21%), but again, no tax rate is stated. More importantly, $43B/$155B = 27.7% net margin, while $24B/$85B = 28.2% net margin — these are consistent, but the derivation is opaque since operating margin is 35% and no bridge is provided.
  - Evidence: valuation.keyAssumptions[3]: operating margin = '35%'; valuation.keyAssumptions[5]: after-tax earnings 2030 = '~$43 billion'; valuation.keyAssumptions[2]: 2030 revenue = '$155 billion'; no tax rate assumption present
- **[blocker] Implied PE multiple on 2028 earnings** (disagree)
  - Analyst: Implied multiple at current market cap on 2028 earnings (pre-dilution) = '~13.5x'.
  - Pushback: AMD's market cap as of early March 2026 was approximately $110-120B (share price ~$70-75 × ~1.62B shares). At $24B 2028 after-tax earnings, that implies a forward PE of roughly 4.6-5x, not 13.5x. To get 13.5x on $24B earnings would require a market cap of ~$324B, which would imply a share price of ~$200 — inconsistent with a stock described as trading at a level giving 50-100% upside potential over 5 years. This appears to be a significant math error in the implied multiple.
  - Evidence: valuation.keyAssumptions[6]: implied multiple 2028 = '~13.5x'; valuation.keyAssumptions[4]: 2028 after-tax earnings = '~$24 billion'; AMD market cap context needed; impliedReturn.high = 1.0 (100% upside)
- **[blocker] Implied PE multiple on 2030 earnings** (disagree)
  - Analyst: Implied multiple at current market cap on 2030 earnings (pre-dilution) = '~7.5x'.
  - Pushback: Similarly, if $43B 2030 after-tax earnings implies 7.5x, the implied market cap would be $322.5B — nearly identical to the 2028 implied market cap of $324B ($24B × 13.5x). This would mean AMD's market cap barely grows over 5 years despite 35% revenue CAGR, which contradicts the analyst's stated upside of up to 100%. The two multiples are internally inconsistent with each other: 13.5x on 2028 and 7.5x on 2030 imply roughly the same current market cap (~$322-324B), which at least is self-consistent, but that market cap figure appears far above AMD's actual ~$110-120B market cap at the time, making both multiples wrong by a factor of ~3x.
  - Evidence: valuation.keyAssumptions[6]: 2028 implied multiple = '~13.5x'; valuation.keyAssumptions[7]: 2030 implied multiple = '~7.5x'; valuation.keyAssumptions[4]: 2028 earnings = '$24B'; valuation.keyAssumptions[5]: 2030 earnings = '$43B'; $24B × 13.5 = $324B; $43B × 7.5 = $322.5B (consistent with each other but inconsistent with stated ~$110-120B market cap)
- **[blocker] Implied return range vs. valuation math** (disagree)
  - Analyst: Implied return range is -50% (low) to +100% (high) over the 5-year horizon.
  - Pushback: If the analyst's base case uses 10-12x PE on $43B 2030 earnings, that yields a $430-516B market cap — implying a ~3.6-4.3x return from a ~$120B current market cap, far above the stated 100% upside. Conversely, if the PE multiples already cited (13.5x and 7.5x) are applied to current market cap, the implied return is ~0% (stock is fairly valued at those multiples). The stated -50% to +100% range is not reconcilable with any combination of the analyst's own stated revenue, margin, and multiple assumptions.
  - Evidence: valuation.impliedReturn: low = -0.5, high = 1.0; valuation.keyAssumptions[9]: appropriate PE = '10-12x'; valuation.keyAssumptions[5]: 2030 earnings = '$43B'; $43B × 10x = $430B vs implied current market cap ~$120B = ~258% upside, not 100%
- **[concern] Nvidia revenue figure labeled as 'revenue' vs. market cap** (disagree)
  - Analyst: In the competitive landscape: 'Nvidia dominates GPU market with $215B revenue vs AMD's $35B'.
  - Pushback: The $215B figure more closely resembles a market cap or valuation figure than Nvidia's actual revenue. AMD's $35B is stated as revenue elsewhere in the analysis. If Nvidia's $215B is actually its market cap (which would be severely understated for Nvidia in 2026) rather than revenue, then comparing it to AMD's $35B revenue is an apples-to-oranges error. More likely '$215B' is a misstatement — possibly Nvidia's market cap was meant to be stated in trillions, or the figure reflects a different metric entirely.
  - Evidence: competitiveLandscape[0].analystView: '$215B revenue vs AMD's $35B'; segments sum to $35B confirming AMD revenue baseline; Nvidia's actual revenue trajectory by early 2026 would be ~$130B annualized
- **[concern] Tax rate bridge from operating margin to after-tax earnings** (missing)
  - Analyst: Operating margin = 35%; after-tax earnings = ~$24B (2028) and ~$43B (2030).
  - Pushback: No tax rate assumption is stated anywhere in the analysis. The implied effective tax rate is ~19-21%, but this is a non-trivial assumption for a semiconductor company that may benefit from significant R&D credits and international structures. Without stating it, the after-tax earnings figures cannot be independently verified.
  - Evidence: valuation.keyAssumptions[3]: operating margin = '35%'; valuation.keyAssumptions[4] and [5]: after-tax earnings figures; no tax rate field present in keyAssumptions
- **[concern] Dilution impact not applied to per-share valuation** (missing)
  - Analyst: 20% dilution from Meta and OpenAI warrants is flagged as a risk, and multiples are stated as 'pre-dilution'.
  - Pushback: The analyst acknowledges 20% dilution but the implied return range (-50% to +100%) does not appear to explicitly incorporate this dilution into a post-dilution per-share return estimate. If 20% dilution is applied to the bull case, a stated 100% gross return becomes approximately a 67% per-share return — a meaningful difference that is never reconciled in the valuation section.
  - Evidence: valuation.keyAssumptions[8]: dilution = '~20%'; valuation.impliedReturn.high = 1.0; keyAssumptions[6] and [7] explicitly labeled 'pre-dilution'; no post-dilution return figure provided

### Comps

- **[nit] Comps critique skipped** (missing)
  - Analyst: N/A
  - Pushback: No peer set is configured for this ticker in packages/pipeline/src/comps.ts. Add peers to enable the comps critique.
  - Evidence: config gap

### Missing risks

- **[concern] Share-based compensation dilution beyond warrant dilution** (missing)
  - Analyst: Analyst addressed ~20% dilution from Meta and OpenAI warrants at a penny per share.
  - Pushback: The analyst conflates warrant dilution with the ongoing, recurring SBC dilution from employee compensation. AMD's share count has grown from 792M (2016) to 1,622M (2025) — a 105% increase over 9 years, or roughly 8-9% annualized dilution in the earlier years, though it has stabilized recently around 1,610-1,622M. Even setting aside the warrant issue, AMD historically issues massive SBC as a fabless semiconductor company competing for TSMC/software talent. If SBC continues at historical rates AND warrants vest, per-share earnings targets in the valuation model could be materially overstated. The analyst's forward earnings figures ($24B in 2028, $43B in 2030) need to be divided by a share count that could be 20%+ higher than today's ~1.62B shares, compressing per-share figures further than the 20% warrant haircut alone implies.
  - Evidence: Shares outstanding grew from 792M (2016) to 1,622M (2025), a 105% increase over 9 years. Current share count is 1,622M. Analyst noted 20% warrant dilution separately but did not address ongoing SBC dilution layered on top.
- **[concern] TSMC/Taiwan geopolitical and supply chain concentration risk** (missing)
  - Analyst: Analyst briefly mentioned Taiwan/TSMC geopolitical risk in passing (cited startSec 1970-2010) but flagged it as not addressed well.
  - Pushback: AMD is 100% dependent on TSMC for leading-edge node manufacturing (3nm/5nm for EPYC and Instinct). Unlike Intel which has its own fabs, AMD has zero manufacturing redundancy. A Taiwan Strait conflict, TSMC export restriction, or even an earthquake/natural disaster at TSMC's Hsinchu/Tainan fabs could halt AMD's entire product roadmap for 12-24+ months. For a company whose entire data center growth thesis depends on continuous cadence of new chip generations (MI300 → MI350 → MI400), a TSMC supply disruption would be existential in the near term. TSMC's Arizona fab is years behind on leading-edge nodes. This is a single-supplier dependency that should materially affect margin of safety.
  - Evidence: AMD is 100% fabless with all leading-edge chips (EPYC, Instinct, Ryzen) manufactured at TSMC. Data center segment revenue is $16.8B and growing at 30%+. No alternative foundry can manufacture at 3nm/5nm at AMD's required volumes. TSMC Arizona not expected to reach leading-edge parity until late 2020s.
- **[concern] FCF vs. GAAP earnings divergence and massive goodwill/intangibles from acquisitions** (missing)
  - Analyst: Analyst bases valuation on forward GAAP earnings targets derived from management revenue and margin guidance. No discussion of goodwill impairment risk or the gap between reported GAAP income and cash earnings.
  - Pushback: AMD spent ~$57B on acquisitions (Xilinx $50B, Pensando $1.9B, ZT Systems $4.9B). This created enormous goodwill and intangible assets on the balance sheet. GAAP EBIT in 2024 was only $1.26B on what should be a much higher operating business — the gap between GAAP earnings and cash earnings is largely due to amortization of acquired intangibles (Xilinx alone generates ~$4-5B/year in amortization). The analyst's 35% operating margin target is almost certainly a non-GAAP figure. If valued on true GAAP earnings, the 13.5x and 7.5x implied multiples cited become meaningless. Meanwhile, if the Xilinx or ZT Systems acquisitions underperform, goodwill impairment could destroy book value. The financial snapshot shows 2024 EBIT of only $1.26B versus net income of $1.32B — a highly unusual relationship suggesting significant non-operating adjustments.
  - Evidence: 2024 EBIT: $1.264B, Net Income: $1.320B — implying net income exceeds EBIT, which suggests large tax benefits or non-GAAP adjustments. FCF in 2024 was $3.115B vs net income of $1.320B, showing large non-cash charges (likely intangible amortization). AMD paid ~$57B in acquisitions. GAAP vs non-GAAP spread is likely $4-6B/year in amortization alone.
- **[concern] Customer concentration risk with hyperscalers** (missing)
  - Analyst: Analyst mentions Meta and OpenAI as major partners (~$60B each in potential deals) and flags contract uncertainty, but does not address the concentration risk if these relationships represent the majority of data center GPU revenue.
  - Pushback: If Meta and OpenAI together represent the bulk of AMD's Instinct GPU revenue (as implied by the $60B deal sizes versus AMD's $16.8B total data center revenue), then AMD's GPU business is dangerously concentrated in two customers. If either relationship deteriorates — Meta redirects to custom MTIA chips, or OpenAI achieves CUDA parity via their own tooling — AMD's GPU growth story collapses. The analyst noted neither deal is committed, but didn't frame this as a customer concentration structural risk distinct from deal uncertainty. For a value investor, this means the 'secular GPU winner' narrative may actually be a 2-3 customer story with no diversified demand base.
  - Evidence: Meta and OpenAI cited as ~$60B each in potential deals. AMD total data center revenue is $16.8B. Two customers potentially representing multiples of current annual data center revenue. AMD's Instinct GPU has not demonstrated broad enterprise adoption beyond hyperscaler partnerships.
- **[concern] US export controls and China revenue exposure** (missing)
  - Analyst: Not addressed.
  - Pushback: AMD generates significant revenue from China (historically 20-30% of total revenue), and US export controls on advanced semiconductors have progressively tightened. AMD's MI300X and future Instinct GPUs above certain compute thresholds are already restricted from export to China. This is a meaningful ongoing revenue headwind that is not one-time — it's a structural reduction in AMD's addressable market. Furthermore, escalating trade tensions could affect AMD's ability to sell EPYC server CPUs into Chinese hyperscalers (Alibaba, Tencent, Baidu), which have historically been important data center CPU customers. This risk compounds the cyclicality concern.
  - Evidence: AMD historically derives 20-30% of revenue from China. US BIS export controls have restricted MI300X-class GPUs from Chinese customers. AMD filed disclosures about export control impacts on revenue in recent 10-Ks. This was not mentioned in the analyst's risk enumeration.
- **[nit] Embedded segment secular decline / Xilinx acquisition underperformance** (missing)
  - Analyst: Analyst discusses Embedded segment with $3.5B revenue and 5% growth, noting exposure to industrial, IoT, edge. No discussion of the dramatic revenue collapse this segment experienced.
  - Pushback: The Embedded segment (Xilinx FPGA business) experienced a catastrophic inventory correction — revenues fell from a peak of ~$6B+ (2022-2023) to roughly $3.5B, representing a ~40%+ decline. This is precisely the kind of semiconductor boom-bust cycle the analyst describes for the broader company, but applied to a $50B acquisition. If Xilinx continues to underperform the acquisition thesis (where AMD paid 35-40x sales), goodwill impairment becomes a real risk and the strategic rationale for the acquisition may need to be reassessed. The analyst's 5% growth assumption for Embedded may be optimistic if the FPGA market faces structural headwinds from custom ASICs at hyperscalers.
  - Evidence: Embedded segment revenue cited at $3.5B with 5% growth. AMD paid $50B for Xilinx in 2022. FPGA embedded revenue peaked well above $3.5B before collapsing in the 2023-2024 inventory correction. 2025 EBIT of only $401M on a business with $35B+ revenue suggests margins remain severely compressed.

### Assumption stress tests

| Assumption | Base | Bear (Δret) | Bull (Δret) | Sensitivity |
|---|---|---|---|---|
| Revenue growth rate for next 3-5 years (35% CAGR from $35B base) | 35% per year | 10% per year (~$47B in 3 years, ~$56B in 5 years) (-25%) | 35% per year ($85B in 3 years, $155B in 5 years) (+0%) | high |
| Operating margin target (35% at scale) | 35% | 20-22% (-15%) | 38-40% (+5%) | high |
| Dilution from Meta and OpenAI warrants | ~20% | 20-25% dilution (warrants fully exercised plus additional share-based comp) (-5%) | 5-10% dilution (warrants partially vest or contracts restructured) (+6%) | high |
| Appropriate PE multiple on peak/5-year earnings | 10-12x (institutional peak semis multiple) | 6-8x (-10%) | 15-18x (+8%) | high |
| Revenue at 3 years 2028 (implied by 35% CAGR from $35B) | $85 billion | $45-50 billion (-18%) | $85-95 billion (+3%) | high |
| Meta and OpenAI contract execution (~$60B each, dual-source GPU supplier) | Contracts partially execute and drive material GPU revenue | Neither contract fully executes; OpenAI defaults, Meta walks away (-20%) | Both contracts execute fully and AMD wins additional hyperscaler GPU contracts beyond Meta/OpenAI (+12%) | high |
| After-tax earnings in 5 years 2030 (~$43B implied) | ~$43 billion | $5-8 billion (-30%) | $50-55 billion (+5%) | high |
| Implied multiple at current market cap on 2028 earnings (pre-dilution, ~$24B earnings) | ~13.5x forward 2028 PE | 50-100x forward 2028 PE (earnings miss to $7-10B) (-15%) | 10-12x forward 2028 PE (earnings reach or exceed $24B) (+3%) | medium |

### Value-investing checklist

| Criterion | Score (1–5) | Rationale |
|---|---|---|
| Moat durability | 3 | AMD has a genuine but contestable moat in data center CPUs via chiplet architecture and TSMC manufacturing edge (taking server CPU share from Intel, which has fallen from ~99% to ~65%), but its GPU moat is nascent at best — Nvidia's CUDA ecosystem, NVLink/NV Switch networking, and $215B revenue base versus AMD's $35B represent a fortress AMD has not cracked in real-world AI factory deployments. |
| Owner earnings quality | 3 | FCF and net income have diverged significantly in several years (e.g., 2024 FCF of $3.1B vs. net income of $1.3B, and 2025 FCF of $1.1B vs. net income of $854M), but the gaps are partially explainable by heavy reinvestment and amortization from large acquisitions (Xilinx $50B, ZT Systems $4.9B); the business is not generating accounting fiction, but the acquisition-heavy balance sheet makes normalized owner earnings difficult to pin down. |
| Capital allocation | 3 | Lisa Su's acquisitions (Xilinx, Pensando, ZT Systems totaling ~$57B) appear strategically sound in hindsight, positioning AMD in data center and AI ahead of the curve, but issuing warrants representing ~20% dilution to Meta and OpenAI at a penny per share raises legitimate questions about selling equity too cheaply, and the share count has grown from 792M in 2016 to 1,622M in 2025 — a near-doubling that has diluted existing holders substantially. |
| Insider alignment | 2 | The extraction notes no specific insider ownership percentage for Lisa Su or other executives, and the financial snapshot confirms no insider ownership data is available; while Su's long tenure and reputational stake are noted, the absence of disclosed meaningful ownership and a growing share count trend (792M to 1,622M shares over a decade) does not suggest strong financial alignment with shareholders. |
| Debt sustainability | 4 | AMD holds net cash of approximately $8.5B per the financial snapshot, debt-to-equity has collapsed from 7.7x in 2017 to ~0.03x in 2025, and FCF has been consistently positive in recent years ($3.1B in 2024, $1.1B in 2025); there is no meaningful near-term solvency risk under reasonable scenarios. |
| Cyclicality awareness | 4 | The analyst explicitly flags AMD's extreme cyclicality — operating income fell ~90% from 2021 to 2023, and AMD has had only one 5-year stretch of positive and increasing earnings in 20+ years — and applies low confidence to all forward revenue and margin assumptions, using a conservative 10–12x multiple on peak semiconductor earnings rather than growth multiples; the analyst could have modeled an explicit trough case but the cyclicality treatment is otherwise thorough. |

