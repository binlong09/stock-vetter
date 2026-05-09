# Fair Isaac Corporation (FICO) — Decision Card

**Verdict:** Pass  •  **Weighted score:** 4.4 / 10

*Analyst:* Drew Cohen   *Video date:* 2026-03-25   *Generated:* 2026-05-09   *Video:* nHLrKyjHuGo

> FICO's moat in mortgage scoring remains durable due to Wall Street's reliance on its long time-series data for prepayment risk modeling, but aggressive price hikes have invited Vantage Score competition and regulatory scrutiny; at 32x forward earnings the stock is pricing in continued strong growth, making the investment thesis hinge on whether moat erosion is as serious as feared or overblown.

## Scores

| Dimension | Score | Rationale |
|---|---|---|
| Margin of Safety | 3.0 / 10 | The margin of safety is thin. The bear case stress tests show multiple compression alone could subtract 10% annualized (stressTest[0]); revenue growth decelerating to 6% subtracts another 9% (stressTest[1]); margin compression to 44% subtracts 6% more (stressTest[2]). These can compound. The analyst's own draconian scenario (15x exit) implies potential capital loss, and the LLM stress test suggests even 10x is plausible under bimerge + Vantage Score + regulatory action. Critically, the bimerge risk (one-third volume loss) — a high-severity risk flagged in the analysis — has no corresponding valuation scenario, meaning the downside is likely understated. The debt-funded buyback structure means an earnings miss could force deleveraging at precisely the wrong time. The thesis requires sustained pricing power, mortgage volume recovery, software inflection, AND multiple preservation — too many interdependent assumptions. The only offsets are the genuinely entrenched mortgage moat and strong recurring revenue, preventing a score of 1-2. |
| Valuation Attractiveness | 3.0 / 10 | At 35.6x P/E and 46x EV/EBIT, FICO is priced for perfection. FCF yield of only 2.8% offers minimal margin relative to risk-free rates. No 10-year median P/E or EV/EBIT comps are available in the snapshot, limiting historical comparison, but at 46x EV/EBIT the implied growth expectations are very high. The analyst's bull case (19% annualized return) requires 15% revenue growth, 60% operating margins, AND a 30x exit multiple — a confluence of favorable assumptions. The bear case implies returns as low as 2% annualized (with internal math inconsistencies flagged by the consistency critique suggesting even that may be optimistic). Stress tests show bear-case multiple compression alone could subtract 10% from annualized returns. At current prices, the risk/reward is asymmetric to the downside. |
| Business Quality | 7.0 / 10 | FICO's mortgage scoring franchise is genuinely entrenched. Wall Street MBS investors require FICO's multi-decade time-series data for prepayment risk modeling — a data advantage Vantage Score cannot replicate for at least 10 years by the analyst's own estimate. Safe harbor legal protection drives credit card usage; ABS collateral enhancement economics entrench auto scoring. CEO Lancing has compounded value significantly since 2012, and the buyback track record (share count -24% since 2015, -64% since 2006) reflects disciplined capital allocation in a capital-light model. However, the moat is being challenged for the first time: Synchrony has already defected in credit cards, pricing hikes from $0.60 to $10/score have invited serious regulatory scrutiny (DOJ/FTC), and the software segment faces intense competition from SAS, Pega, and AI fintechs with only ~30% EBIT margins versus ~92% for scoring. The bureau concentration risk — Equifax, Experian, and TransUnion co-own Vantage Score while also being FICO's sole data suppliers — is a structural conflict not fully appreciated by the analyst. Business quality is high but not exceptional given these accumulating pressures. |
| Financial Health | 5.0 / 10 | FICO is profitable with consistently positive FCF since 2019 and a shrinking share count — all positives. FCF conversion from EBIT is reasonable (2025: $464M FCF vs $642M EBIT, ~72 cents per EBIT dollar). However, net debt of ~$3.44B against 2025 EBIT of $642M implies net debt/EBIT of ~5.3x, which is stretched. Debt-to-equity expanded from ~1x in 2015-2019 to 5.5x in 2023, indicating buybacks have been substantially debt-funded. At elevated rates, refinancing risk is real. FCF yield at current price is only ~2.8%, thin for a value investor. The gap between 2024 FCF ($503M) and 2025 FCF ($464M) — a year-over-year decline — signals some emerging pressure. Revenue data is incomplete in the financial snapshot (most annual revenue fields show zero), limiting full revenue-trend analysis. |
| Analyst Rigor | 6.0 / 10 | The analyst demonstrates genuine depth in explaining the mechanics of FICO's moat across mortgage, credit card, and auto segments — particularly the Wall Street MBS prepayment risk modeling insight and the safe harbor legal protection argument. Multiple scenarios (bull/base/bear/draconian) are provided with explicit exit multiples. However, internal consistency failures are significant: segment revenues don't reconcile to management guidance ($2.025B vs $2.35B); the 2030 earnings range ($1.4B-$2.0B) doesn't reconcile with stated growth and margin inputs; the bear-case 2% return appears mathematically inconsistent with a potential market cap drawdown; and the 92% implied EBIT margin for the Score segment was never justified. The bimerge risk (high severity) has no valuation scenario. Debt leverage and FCF-vs-earnings distinction were not addressed. Comps were absent. These are meaningful gaps that cap the rigor score despite the qualitative depth. |

### Score citations

- **Margin of Safety**
  - stressTest[0].bearCase.impliedReturnDelta = -0.10 (multiple compression)
  - stressTest[1].bearCase.impliedReturnDelta = -0.09 (growth deceleration)
  - stressTest[2].bearCase.impliedReturnDelta = -0.06 (margin compression)
  - consistency[5]: trimerge-to-bimerge risk (high severity) has no valuation scenario
  - risks[2].severity = 'high'; risks[2].analystAddressedWell = false
  - missingRisks[0]: debt/leverage risk unaddressed by analyst
  - missingRisks[4]: bureau supplier concentration risk unaddressed
  - valuation.impliedReturn.low = 0.02 with internal consistency concerns flagged
- **Valuation Attractiveness**
  - financialSnapshot.peRatio = 35.64; evEbit = 45.97; fcfYield = 0.028
  - financialSnapshot.peRatio10yMedian = null; evEbit10yMedian = null (no historical comparison available)
  - valuation.impliedReturn.low = 0.02; impliedReturn.high = 0.19
  - stressTest[0]: bear case multiple compression to 18x subtracts ~10% from annualized return
  - consistency[2]: bear-end math ($1.4B × 20x = $28B) may represent a loss from current ~$40-50B market cap, not a 2% gain
  - comps critique: no peer set configured, limiting comp-based valuation check
- **Business Quality**
  - qualitativeFactors.moat: 'Strong but narrowing moat'
  - competitiveLandscape[0].analystView: Vantage Score lacks 10-year data for MBS prepayment modeling
  - competitiveLandscape[2]: Synchrony already switched to Vantage Score in credit cards
  - valueChecklist.moatDurability.score = 4; valueChecklist.capitalAllocation.score = 4
  - missingRisks[4]: bureau concentration / supplier conflict of interest
  - segments[5].ebit = $245M on $825M revenue implies ~30% EBIT margin for software vs implied ~92% for scoring
- **Financial Health**
  - financialSnapshot.netCash = -$3,437,198,976 (net debt ~$3.4B)
  - financialSnapshot.fcfYield = 0.028
  - financialSnapshot.shareCountTrend = 'shrinking'
  - financialSnapshot.isProfitable = true; hasPositiveFcf = true
  - annual[2023].debtToEquity = 5.51x vs annual[2018].debtToEquity = 1.06x
  - annual[2025].fcf = $464M vs annual[2024].fcf = $503M (YoY decline)
  - missingRisks[0]: debt load and leverage risk — analyst did not address
  - valueChecklist.debtSustainability.score = 3
- **Analyst Rigor**
  - consistency[0]: segment revenue sum ($2.025B) vs guidance ($2.35B) — unexplained $325M gap
  - consistency[1]: 2030 earnings range doesn't reconcile with stated growth/margin inputs
  - consistency[2]: bear-case 2% return mathematically inconsistent with implied market cap
  - consistency[3]: Score segment 92% EBIT margin never justified
  - consistency[5]: high-severity bimerge risk has no valuation scenario
  - missingRisks[3]: FCF vs earnings distinction not addressed in valuation
  - risks — 4 of 6 risks addressed well, 2 not addressed

## Pros / Cons (analyst vs. critic)

| Topic | Analyst view | LLM pushback | Agreement |
|---|---|---|---|
| Mortgage scoring moat durability | Wall Street MBS investors require FICO's decades-long time-series data for prepayment risk modeling, giving FICO an unassailable position in mortgage for at least 10 years. | The moat is real but being actively tested for the first time — Vantage Score is being offered free by the credit bureaus, and the bureaus co-own Vantage Score while also being FICO's sole data suppliers, creating a structural conflict that could accelerate displacement over the analyst's investment horizon. | partial |
| Buyback track record as capital allocation quality | Share count reduced 64% since 2006, with management religiously returning capital via buybacks, compounding per-share value exceptionally well. | Buybacks have been substantially debt-funded — debt-to-equity expanded from ~1x in 2015-2019 to 5.5x in 2023, meaning the apparent per-share compounding comes with significant leverage risk that was not acknowledged by the analyst. | disagree |
| Revenue growth rate assumption (10–15% annually to 2030) | Management guidance of $2.35B in 2026 provides a credible base, and continued price hikes plus software platform inflection support 10-15% annual growth. | Score segment growth of 28% has been primarily price-driven; if pricing is near its regulatory/competitive ceiling AND mortgage volumes remain depressed by elevated rates, 10-15% growth requires a mortgage origination recovery that is not guaranteed within the 4-year horizon. FCF actually declined YoY in 2025, suggesting early pressure. | disagree |
| Bimerge risk (trimerge to two-bureau standard) | Flagged as a high-severity risk but not quantified or addressed in the valuation scenarios. | A shift from trimerge to bimerge would eliminate roughly one-third of mortgage score volume — a catastrophic hit to the Score segment that drives most of FICO's value. This risk has no corresponding bear scenario in the analyst's valuation framework, meaning downside is structurally understated. | disagree |
| Valuation at 35x P/E / 46x EV/EBIT | At 32x forward earnings the stock prices in continued strong growth, and the analyst's scenarios show a range of 2-19% annualized returns depending on outcome. | The bear-case math is internally inconsistent — $1.4B earnings × 20x = $28B market cap, which would represent a meaningful loss from current levels, not a 2% annual gain. The true downside appears worse than presented, and at 46x EV/EBIT with 2.8% FCF yield there is almost no valuation cushion. | disagree |
| Software segment platform transition | On-platform revenue growing 33% YoY with 122% net dollar retention signals a successful cloud transition with significant cross-sell opportunity. | Overall software segment is growing only 1% — the impressive on-platform metrics mask severe legacy attrition. The 122% NRR on a small and growing base may overstate segment health, and software EBIT margins (~30%) are far below scoring margins (~92%), diluting overall profitability. | partial |
| Regulatory risk management | FTC and DOJ investigations into FICO pricing power are a medium-severity risk that the analyst acknowledges and addresses. | The analyst's 10-15% revenue growth implicitly assumes continued price hikes — if regulatory action caps or rolls back pricing, this assumption breaks simultaneously with potential multiple compression, creating correlated downside that is more severe than a 'medium' label implies. | partial |
| FCF quality and debt sustainability | Not addressed — analyst used aggregate earnings for valuation without discussing interest costs, FCF conversion, or debt sustainability. | With $3.4B net debt and 2025 interest expense implicitly consuming ~$178M (EBIT $642M minus FCF $464M gap, net of taxes/capex), the FCF yield of 2.8% is thin and the debt structure means earnings misses translate quickly into balance sheet stress. This omission is a material gap in the analysis. | disagree |

## Things to verify

- Pull FICO's latest 10-K (fiscal year ending September 2025) and reconcile total reported revenue against the analyst's segment figures: Score Segment ($1.2B) + Software ($825M) = $2.025B vs. management's $2.35B 2026 guidance — identify the missing ~$325M source to confirm the growth rate baseline is correct.
- Verify FICO's total debt, net debt, and interest expense from the balance sheet and income statement to confirm the net debt/EBIT ratio (~5.3x implied) and assess whether current FCF (~$464M) provides adequate coverage at prevailing rates — the analyst celebrated buybacks without flagging that debt-to-equity reached 5.5x in 2023.
- Check the status of the FHFA's bimerge proposal (shifting from trimerge to two-bureau mortgage credit pulls) — if this is actively advancing in rulemaking, it represents a one-third volume loss for the Score segment with no offsetting scenario in the analyst's valuation; search FHFA.gov for recent guidance.
- Confirm gross share-based compensation as a percentage of revenue from FICO's most recent 10-K (look in the cash flow statement under 'stock-based compensation') — the analyst praised net share count reduction without noting that buybacks funded by debt (D/E 5.5x) are economically different from organic cash generation, and SBC could be a meaningful cost offset.
- Verify Vantage Score adoption trends beyond Synchrony: check whether any additional top-10 credit card issuers (Capital One, Chase, Bank of America) have announced pilots or switches to Vantage Score since 2024, as this would directly test the analyst's claim that the credit card moat is intact despite the Synchrony defection.
- Look up the current status of DOJ/FTC investigations into FICO's mortgage score pricing practices — if formal proceedings or consent orders have advanced since the analyst's March 2025 video date, regulatory risk may have materially escalated and would directly threaten the pricing-driven revenue growth assumption.

## Financial snapshot

*As of:* 2026-05-09

| Metric | Value |
|---|---|
| Price | $1126 |
| Market cap | $26.11B |
| Enterprise value | $29.55B |
| Net cash | $-3.44B |
| P/E (TTM) | 35.6 |
| EV / EBIT | 46.0 |
| EV / Sales | — |
| FCF yield | 2.8% |
| Profitable (last FY) | yes |
| Positive FCF (last FY) | yes |
| Share count trend (3y) | shrinking |

## Valuation assumptions (analyst)

*Method:* Forward earnings multiple on projected 2030 earnings  •  *Horizon:* 4 yr
*Implied return:* 2.0% – 19.0%

| Assumption | Value | Confidence | Citation |
|---|---|---|---|
| 2026 base revenue (management guidance) | $2.35 billion | medium | [53:48–54:20] |
| Revenue growth rate 2026-2030 | 10% to 15% annually | medium | [54:20–55:00] |
| Operating margin in 2030 | 50% to 60% | medium | [55:00–56:00] |
| Implied 2030 earnings range | $1.4 billion to $2.0 billion | medium | [56:00–56:40] |
| Exit multiple - bull case (low double digit growth continues from 2030) | 30x earnings | medium | [56:40–57:25] |
| Exit multiple - base case (high single digit growth from 2030) | 25x earnings | medium | [57:25–57:55] |
| Exit multiple - bear case (low single digit growth from 2030) | 20x earnings | medium | [57:55–58:40] |
| Exit multiple - draconian case (Vantage Score gains prominence, real terminal risk) | 15x earnings | low | [59:40–1:00:20] |

## Critique findings

### Internal consistency

- **[concern] Segment revenue sum vs. total company revenue** (disagree)
  - Analyst: Score Segment total revenue is $1.2B and Software Segment revenue is $825M, implying total company revenue of roughly $2.025B.
  - Pushback: The analyst also states 2026 base revenue (management guidance) is $2.35B. The two named segments sum to only ~$2.025B, leaving an unexplained ~$325M gap. Either the segment figures are understated, the total guidance figure is overstated, or there is a third revenue source not accounted for.
  - Evidence: segments[0].revenue = $1,200,000,000; segments[5].revenue = $825,000,000; valuation.keyAssumptions[0].value = '$2.35 billion'
- **[concern] Implied 2030 earnings math** (disagree)
  - Analyst: Revenue grows 10-15% annually from $2.35B base over 4 years with 50-60% operating margins, implying 2030 earnings of $1.4B to $2.0B.
  - Pushback: At 10% annual growth, $2.35B becomes ~$3.44B in 2030; at 50% margin that yields ~$1.72B in earnings. At 15% growth, $2.35B becomes ~$4.11B; at 60% margin that yields ~$2.47B. The bear end ($1.4B) requires either lower-than-stated growth or margins below the stated 50% floor, and the bull end ($2.0B) is well below the $2.47B the stated high-end assumptions imply. The range does not reconcile cleanly with the stated inputs.
  - Evidence: valuation.keyAssumptions[1].value = '10% to 15% annually'; keyAssumptions[2].value = '50% to 60%'; keyAssumptions[3].value = '$1.4 billion to $2.0 billion'; keyAssumptions[0].value = '$2.35 billion'; valuation.timeHorizonYears = 4
- **[concern] Implied market cap / return calculation consistency** (disagree)
  - Analyst: Using 2030 earnings of $1.4B-$2.0B and exit multiples of 20x-30x, implied returns range from 2% to 19% annualized.
  - Pushback: At the bull end, $2.0B × 30x = $60B market cap. At the bear end, $1.4B × 20x = $28B. FICO's current market cap (at 32x forward earnings on ~$2.35B revenue with ~50%+ margins) is roughly in the $40-50B range. A $28B outcome in 4 years would represent a significant loss, not a 2% annual return. The low end of the implied return (2%) does not appear mathematically consistent with a meaningful drawdown scenario.
  - Evidence: valuation.impliedReturn.low = 0.02; valuation.impliedReturn.high = 0.19; keyAssumptions[3].value = '$1.4B to $2.0B'; exit multiples 20x-30x; thesisOneLiner references '32x forward earnings'
- **[concern] Score Segment EBIT margin implausibly high** (partial)
  - Analyst: Score Segment has revenue of $1.2B and EBIT of $1.1B, implying a ~92% EBIT margin.
  - Pushback: A 92% EBIT margin for the Score Segment is extraordinarily high and is never explicitly stated or justified by the analyst. While scoring businesses are high-margin, this figure strains credibility and is not reconciled with the overall company margin discussion (50-60% in 2030). It may be a data-entry error.
  - Evidence: segments[0].revenue = $1,200,000,000; segments[0].ebit = $1,100,000,000; valuation.keyAssumptions[2].value = '50% to 60%' (2030 operating margin target)
- **[nit] Vantage Score mortgage threat horizon vs. competitive threat label** (disagree)
  - Analyst: Vantage Score lacks the long FICO time-series data needed for Wall Street MBS prepayment risk modeling, 'limiting near-term mortgage inroads for at least 10 years,' yet the risk is labeled 'medium' severity with a '10+ year' horizon.
  - Pushback: The analyst's own valuation time horizon is only 4 years (2026-2030). If the mortgage threat is genuinely 10+ years away, it should have negligible impact on the 4-year investment thesis and arguably warrants lower severity within that framework. Labeling it 'medium' severity without explaining how a 10+-year threat materially affects a 4-year return analysis is an internal inconsistency.
  - Evidence: risks[0].severity = 'medium'; risks[0].risk references '10+ years'; valuation.timeHorizonYears = 4; competitiveLandscape[0].analystView = 'limiting near-term mortgage inroads for at least 10 years'
- **[concern] Trimerge-to-bimerge risk not quantified or addressed** (missing)
  - Analyst: The analyst flags the risk that the trimerge report could move to a bimerge (two bureaus instead of three), reducing FICO score volume by one-third, and marks it as NOT addressed well.
  - Pushback: Given the Score Segment drives the bulk of value and a one-third volume reduction would be a major earnings hit, the absence of any attempt to quantify this impact or integrate it into the bear/draconian scenario is a structural gap. The draconian case is attributed to Vantage Score, not bimerge risk, so this high-severity risk has no corresponding valuation scenario.
  - Evidence: risks[2].severity = 'high'; risks[2].analystAddressedWell = false; valuation.keyAssumptions — no bimerge scenario present; draconian case citation (startSec 3580) attributed to Vantage Score prominence

### Comps

- **[nit] Comps critique skipped** (missing)
  - Analyst: N/A
  - Pushback: No peer set is configured for this ticker in packages/pipeline/src/comps.ts. Add peers to enable the comps critique.
  - Evidence: config gap

### Missing risks

- **[concern] Debt load and leverage risk** (missing)
  - Analyst: Not addressed
  - Pushback: FICO carries significant net debt of ~$3.4B against an enterprise value of ~$29.6B, implying a net debt/EV ratio of roughly 12%. More notably, debt-to-equity has expanded dramatically from ~1.0x in 2015-2019 to 5.5x in 2023, suggesting the buyback program has been substantially debt-funded. With interest rates elevated, the cost of servicing and refinancing this debt is material. The analyst celebrated the buyback track record without noting that it has left the balance sheet highly leveraged. If earnings disappoint or credit markets tighten, refinancing risk could pressure the thesis.
  - Evidence: Net cash: -$3,437,198,976 (i.e., net debt of ~$3.4B); debt-to-equity rose from ~1.06x in 2018 to 5.51x in 2023; FCF in 2025 was $464M vs net debt of $3.4B (~7x FCF coverage needed to pay off debt)
- **[nit] Share-based compensation dilution impact on per-share returns** (missing)
  - Analyst: Analyst praised the buyback track record, noting share count reduced 64% since 2006, and used this as a key capital allocation positive.
  - Pushback: While the share count trend is indeed shrinking (which is positive), the analyst's valuation uses aggregate earnings ($1.4B-$2.0B by 2030) without explicitly adjusting for gross SBC dilution offset by buybacks. For a software/IP company like FICO, SBC can be a meaningful cost item that inflates reported FCF if not expensed properly. The analyst should confirm that SBC is adequately reflected in the earnings figures used, or flag the gross dilution rate before buybacks, since buybacks funded by debt are economically different from organic cash generation.
  - Evidence: Shares outstanding fell from 32.0M (2015) to 24.4M (2025), a reduction of ~7.6M shares. But buybacks are being funded alongside growing debt (D/E from 1x to 5.5x), so the net economic benefit to shareholders is partially offset by leverage risk.
- **[concern] Cyclicality of mortgage volume underpinning Score segment growth** (missing)
  - Analyst: Analyst acknowledged that revenue growth could disappoint if mortgage pricing hikes are near their ceiling and volume is cyclically weak, but framed this as a moderate risk.
  - Pushback: The analyst's 10-15% annual revenue growth assumption for 2026-2030 implicitly depends on either continued price hikes or a meaningful recovery in mortgage origination volume (currently suppressed by the rate environment). FICO's mortgage B2B scoring revenue is a function of both price-per-score AND volume of originations. With rates still elevated and the housing market locked up ('lock-in effect' from sub-3% mortgages), mortgage volume could remain depressed for years. The analyst's base case growth rate may be overly optimistic if pricing hikes are near ceiling AND volume recovery is delayed. This cyclicality is more severe than the analyst implied.
  - Evidence: Score segment revenue $1.2B growing at 28% YoY — much of this growth is price-driven. FCF in 2025 ($464M) was actually lower than 2024 ($503M), suggesting some pressure already. Management 2026 guidance implies $2.35B total revenue, requiring continued strong score growth despite a challenging mortgage market.
- **[concern] Capital intensity and FCF sustainability vs. reported earnings** (missing)
  - Analyst: Not addressed — analyst used earnings figures for valuation without discussing capex or FCF conversion.
  - Pushback: The analyst's valuation is built on projected 2030 earnings of $1.4B-$2.0B at 50-60% operating margins. However, there is a meaningful gap between reported EBIT ($642M in 2025) and FCF ($464M in 2025), implying significant cash costs below the EBIT line (interest expense on ~$3.4B debt, taxes, and potentially SBC). The FCF yield at current price is only ~2.8%, which is quite thin for a value investor. The analyst should reconcile whether the 50-60% margin assumption translates to proportional FCF, or whether interest costs on growing debt will suppress FCF well below operating income.
  - Evidence: FCF yield: 2.8%; 2025 EBIT: $642M but FCF only $464M (72 cents of FCF per dollar of EBIT); net debt: $3.4B means interest expense is a significant drag; EV/EBIT of 46x is very high for a business with a 2.8% FCF yield
- **[concern] Customer/partner concentration — dependence on three credit bureaus as data gatekeepers** (missing)
  - Analyst: Not addressed
  - Pushback: FICO's scoring business is fundamentally dependent on Equifax, Experian, and TransUnion as the data inputs for score generation. These same bureaus are co-owners of Vantage Score, creating a structural conflict of interest: the bureaus have financial incentive to promote Vantage Score (which they own) over FICO scores (for which they pay FICO royalties). If the bureaus find ways to push Vantage Score adoption — including attaching it free to trimerge reports as the analyst mentioned — FICO's leverage in price negotiations diminishes. This is not just a competitive threat but also a supplier concentration risk since FICO cannot generate scores without bureau data.
  - Evidence: Analyst noted Vantage Score is being offered free in mortgage by bureaus. Vantage Score is a joint venture of Equifax, Experian, and TransUnion — the same entities FICO relies on for data access. FICO has no alternative data suppliers for its core credit scoring product.
- **[nit] Accounting flag — revenue recognition in software segment platform transition** (missing)
  - Analyst: Analyst noted the software segment is transitioning from point solutions to a unified cloud platform, with on-platform revenue growing 33% YoY and 122% net dollar retention.
  - Pushback: SaaS platform transitions often involve complex revenue recognition judgments: timing of recognition for multi-year contracts, professional services bundling, and the treatment of legacy license revenue being converted to subscription. The 122% net dollar retention figure is impressive but should be scrutinized — if it is calculated on a small and growing 'on-platform' base while legacy revenue is declining, it may overstate the health of the software segment. The overall software segment growth rate of only 1% despite 33% on-platform growth suggests significant legacy attrition. Investors should verify that the platform transition is not masking aggressive recognition of multi-year deals upfront.
  - Evidence: Software segment revenue $825M growing at only 1% overall despite on-platform growing 33% — implies large legacy revenue decline. Software EBIT margin is 29.7% ($245M/$825M) vs. Score segment EBIT margin of ~92% ($1.1B/$1.2B), suggesting software economics are significantly weaker.

### Assumption stress tests

| Assumption | Base | Bear (Δret) | Bull (Δret) | Sensitivity |
|---|---|---|---|---|
| Exit multiple - base case (high single digit growth from 2030) | 25x earnings | 18x earnings (-10%) | 32x earnings (+5%) | high |
| Revenue growth rate 2026-2030 | 10% to 15% annually | 6% annually (-9%) | 18% annually (+6%) | high |
| Operating margin in 2030 | 50% to 60% | 44% (-6%) | 63% (+4%) | high |
| Exit multiple - bull case (low double digit growth continues from 2030) | 30x earnings | 22x earnings (-6%) | 35x earnings (+3%) | medium |
| Exit multiple - draconian case (Vantage Score gains prominence, real terminal risk) | 15x earnings | 10x earnings (-5%) | 18x earnings (+2%) | medium |
| 2026 base revenue (management guidance) | $2.35 billion | $2.20 billion (-2%) | $2.50 billion (+2%) | low |

### Value-investing checklist

| Criterion | Score (1–5) | Rationale |
|---|---|---|
| Moat durability | 4 | FICO's mortgage scoring franchise is deeply entrenched due to Wall Street MBS investors requiring its decades-long time-series data for prepayment risk modeling — a data advantage Vantage Score cannot replicate for at least 10 years by the analyst's own estimate. However, Synchrony Financial has already defected to Vantage Score in credit cards, pricing hikes from $0.60 to $10 per score have invited serious competitive and regulatory responses, and the software segment faces intense competition from SAS, Pega, and AI fintechs, preventing a fortress-level score. |
| Owner earnings quality | 4 | FCF tracks net income closely in recent years — 2025 FCF of $464.7M versus net income of $429.4M, and 2022 FCF of $342.9M exceeded net income of $236.4M — indicating a capital-light model where cash conversion is strong. The negative FCF years pre-2019 are a historical footnote from a different business mix and do not reflect current economics. |
| Capital allocation | 4 | Share count has been reduced from ~32M in 2015 to ~24.4M in 2025, a roughly 24% reduction over the decade (analyst cites 64% reduction since 2006), executed as the core business compounded — a disciplined use of a capital-light model. The trade-off is that debt has risen meaningfully (debt-to-equity reached 5.5x in 2023) to fund buybacks, which introduces leverage risk, keeping this from a 5. |
| Insider alignment | 3 | CEO William Lancing owns 1.5% of the business, meaningful for a professional CEO but below the >5% founder threshold for a top score; the analyst notes no recent insider buying activity, and at a $26B market cap, 1.5% represents roughly $390M of skin in the game — significant in dollar terms but the lack of recent open-market purchases limits conviction. |
| Debt sustainability | 3 | Net debt is approximately $3.44B against 2025 EBIT of $642.8M, implying net debt/EBIT of roughly 5.3x, which is stretched; however, FCF of $464.7M in 2025 provides solid interest coverage for a business with highly recurring, contractual revenue streams and no capital expenditure intensity, and FICO is not a cyclical cash burner — but leverage is elevated and warrants a cautious score. |
| Cyclicality awareness | 3 | The analyst acknowledges that mortgage volume is cyclically sensitive and notes that pricing hikes may be near a ceiling if mortgage origination volumes remain depressed, and the base case uses 10–15% annual revenue growth with management's $2.35B guidance as the anchor — reasonable but not explicitly stress-tested against a prolonged mortgage trough where volume declines compound with pricing fatigue, so a trough-case model is absent. |

