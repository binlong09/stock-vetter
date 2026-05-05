# Reddit (RDDT) — Decision Card

**Verdict:** Pass  •  **Weighted score:** 3.3 / 10

*Analyst:* Drew Cohen   *Video date:* 2026-04-11   *Generated:* 2026-05-03   *Video:* mZ-XavKNBMw

> Reddit has transformed into a fast-growing advertising platform with better margins than peers at smaller scale, but faces significant structural obstacles to replicating Meta's direct-response ad dominance; current valuation already prices in ~30% annual revenue growth for three years, leaving limited margin of safety.

## Scores

| Dimension | Score | Rationale |
|---|---|---|
| Margin of Safety | 2.0 / 10 | The stress tests are comprehensive and consistently negative in bear cases. Revenue deceleration to 15%/yr implies -10% return delta. Terminal multiple compression to 15x implies -8% delta. Operating margin staying flat at 20% implies -6% delta. Cumulatively, a moderate bear case (not extreme) wipes out all returns and potentially delivers significant losses from current price. The analyst's own bull case only delivers 12-17% annually and requires near-perfect execution on SMB onboarding, margin expansion, and multiple maintenance — all three of which have precedent failures in direct peer comps (Snap, Pinterest, Twitter). The blocker-level discrepancy on profitability (Reddit was still EBIT-negative in 2025 per audited data while analyst claims $450M operating income) introduces compounding uncertainty. The time-horizon inconsistency (3-year breakeven vs 5-year bull case) means the bull scenario revenue trajectory underperforms what's 'priced in,' logically implying below-market returns even in the bull case. Multiple structural risks identified — logged-out users, no social graph, text format, SMB onboarding — are well-articulated but unresolved. Margin of safety is minimal. |
| Valuation Attractiveness | 2.0 / 10 | At current price of $166.48, market cap is $32B and EV/Sales is 36x on audited annual revenue of ~$804M (2025). Even accepting the analyst's TTM $2.2B revenue figure, EV/Sales is ~13x and P/E is 47.6x per snapshot (76x per analyst). Both peRatio10yMedian and evEbit10yMedian are null (insufficient history as a public company since 2024 IPO), so historical comparison is unavailable. The analyst's own work establishes that current pricing requires 30% annual revenue growth AND margin expansion from 20% to 35% simultaneously over three years just to break even with the current price — i.e., the stock is priced for a near-perfect execution scenario. FCF yield of 1.7% is thin even accepting the snapshot's implied profitability, and the company generated negative FCF in both audited years. No 10-year median multiples available. The valuation is rich on every available metric. |
| Business Quality | 5.0 / 10 | Reddit has a genuine content moat — 100,000+ subreddits of authentic human-generated content that becomes more defensible as AI-generated content proliferates — but the monetization ceiling is structurally constrained. The anonymous user base eliminates the social graph advantage that underpins Meta's direct-response dominance. The text-centric format is a harder advertising venue than image/video platforms. The analyst explicitly identifies that Snapchat, Twitter, and Pinterest all failed to build the SMB long-tail needed for bid density, and Reddit faces identical structural obstacles. The moatDurability score of 3/5 captures the content moat being real but monetization-limited. Capital allocation is poor: buybacks at 76x P/E with SBC at ~15% of revenues. Cyclicality awareness is a modest positive — analyst explicitly stress-tests deceleration risk against peer precedents. |
| Financial Health | 3.0 / 10 | The financial snapshot is unambiguous: Reddit was EBIT-negative in both 2024 (-$172M) and 2025 (-$140M), FCF-negative both years (-$100M and -$85M), and net income negative both years. isProfitable=false, hasPositiveFcf=false. The analyst's claim of $450M operating income and $350M NOPAT on a TTM basis represents a dramatic inflection that is either very recent (post-2025) or relies on adjusted/non-GAAP figures — a blocker-level discrepancy flagged in missingRisks. The sole positive is a $2.75B net cash position, which eliminates solvency risk. Share count trend is flat, which partially offsets SBC dilution concern. The gap between analyst's claimed profitability and audited annual data is too large to dismiss and materially depresses this score. |
| Analyst Rigor | 7.0 / 10 | This is a genuinely above-average piece of analysis. The analyst explicitly identifies structural obstacles (anonymous user base, no social graph, text-centric format, SMB onboarding difficulty), stress-tests deceleration risk against peer precedents, discloses implied growth required to justify current price, and addresses 9 of 10 extracted risks well. The valuation methodology (implied-growth breakeven plus scenario analysis) is appropriate. However, three material gaps lower the score: (1) The blocker-level profitability discrepancy — the analyst claims GAAP profitability with $450M operating income while audited 2025 data shows EBIT of -$140M, and this is never reconciled; (2) no FCF discussion despite FCF being negative; (3) management quality and insider ownership are explicitly skipped. The time-horizon inconsistency (3-year vs 5-year horizon in the same valuation section) is a structural flaw in the argument logic. Tax rate assumptions are implicit throughout but never stated. |

### Score citations

- **Margin of Safety**
  - stressTest[0]: revenue deceleration to 15%/yr → impliedReturnDelta -0.10
  - stressTest[1]: terminal multiple 15x → impliedReturnDelta -0.08
  - stressTest[2]: operating margin 20% sustained → impliedReturnDelta -0.07
  - missingRisks[0]: blocker — 'Reddit NOT profitable, NOT positive FCF per financial snapshot'
  - consistency[5]: concern — 'bull scenario revenue path underperforms priced-in scenario'
  - consistency[3]: concern — '30% revenue CAGR + 35% margin implies $1.7B operating income, not reconcilable with 50% operating income CAGR'
- **Valuation Attractiveness**
  - financialSnapshot: peRatio=47.6x, evSales=36.2x, fcfYield=1.7%
  - financialSnapshot: peRatio10yMedian=null, evEbit10yMedian=null
  - valuation.keyAssumptions: 'Revenue growth required to be priced in' = 30%/yr, 'Operating margin expansion required' = 20% to 35%
  - consistency[3]: internal inconsistency in 'priced in' growth vs operating income growth
  - consistency[5]: bull scenario revenue path slower than 'already priced in' scenario
- **Business Quality**
  - valueChecklist.moatDurability: score 3 — 'anonymous user base, text-centric format, structural inability to build a social graph limit monetization durability'
  - valueChecklist.capitalAllocation: score 2 — '$1B buyback at 76x P/E, SBC ~15% of revenues'
  - risks: 'Difficulty onboarding long-tail SMB advertisers needed for bid density' — severity high, analystAddressedWell true
  - competitiveLandscape: Meta threat level high — '$250+ US ARPU vs Reddit $35'
- **Financial Health**
  - financialSnapshot: isProfitable=false, hasPositiveFcf=false
  - annual[2024]: EBIT -$172M, FCF -$100M, netIncome -$159M
  - annual[2025]: EBIT -$140M, FCF -$85M, netIncome -$91M
  - financialSnapshot.netCash: $2.75B — zero solvency risk
  - missingRisks[0]: 'Actual profitability vs analyst's claimed NOPAT/operating income' — severity blocker
  - valueChecklist.ownerEarningsQuality: score 1
- **Analyst Rigor**
  - missingRisks[0]: blocker — profitability gap not reconciled
  - missingRisks[1]: concern — FCF not discussed
  - missingRisks[4]: concern — management quality and insider ownership skipped
  - consistency[5]: concern — time horizon mismatch creates logical contradiction in bull case
  - risks: 9/10 risks explicitly addressed — strong coverage
  - valuation.method: implied-growth breakeven + peer scenario — appropriate methodology

## Pros / Cons (analyst vs. critic)

| Topic | Analyst view | LLM pushback | Agreement |
|---|---|---|---|
| Claimed Profitability vs. Audited Financials | Reddit is GAAP profitable with $450M operating income and $350M NOPAT on $2.2B TTM revenue, supporting a 76x P/E valuation. | Audited 2024 and 2025 financials show EBIT of -$172M and -$140M respectively, with negative FCF both years; the analyst's figures imply a massive profitability inflection that is either very recent, non-GAAP adjusted, or unverified — this is a blocker that undermines the entire valuation framework. | disagree |
| Valuation Already Priced for Perfection | Current price requires 30% annual revenue growth AND margin expansion from 20% to 35% simultaneously over three years just to break even — leaving no margin of safety. | The analyst's own stress tests confirm this framing; the bull case (12-17% annual return) requires perfect execution on SMB onboarding, margin expansion, and terminal multiple maintenance, all three of which have failed in direct peer comps. | agree |
| Content Moat Quality | Reddit's 100,000+ subreddits of authentic human-generated content are 'the gold standard on the internet' and become more valuable as AI-generated content proliferates. | The content moat is real for search/discovery purposes but structurally constrained for advertising monetization — anonymous users, no social graph, and text-centric format cap monetization potential well below Meta and likely at Snap/Pinterest ceiling levels. | partial |
| SMB Onboarding / Direct-Response Advertising | Reddit is pursuing direct-response advertising with AI targeting tools (Reddit Max) and growing advertiser base (up 75% YoY), but acknowledges it faces the same obstacles that stopped Snapchat, Pinterest, and Twitter. | The analyst correctly identifies this as the central execution risk and the historical failure mode for every comparable platform; the bull case depends entirely on Reddit succeeding where three direct peers have failed, with no structural differentiation clearly articulated. | agree |
| Bull Case Internal Consistency | $6B revenue in 5 years at 40% margins yields ~$1.9B after-tax earnings; at 25-30x multiple, this returns 12-17% annually. | The bull scenario's revenue path (~22% CAGR to $6B in 5 years) is actually slower than what the analyst says is 'already priced in' (30% CAGR for 3 years reaching ~$4.85B), meaning the bull case logically implies below-market returns — an internal contradiction the analyst never addresses. | disagree |
| Data Licensing Revenue Durability | OpenAI and Google data licensing deals (~$130M combined) are included as part of 'Other Revenue' as a relatively stable income stream. | These contracts are novel, potentially short-term, and subject to non-renewal as AI companies build proprietary data pipelines; non-renewal would eliminate ~90% of the 'Other Revenue' segment and approximately 6% of total revenues, which the analyst never stress-tests. | disagree |
| Balance Sheet / Solvency | Not explicitly highlighted but Reddit has $2.75B net cash. | Net cash of $2.75B is a genuine positive that eliminates solvency risk under any scenario, though it doesn't offset the valuation premium at current price. | agree |
| Stock-Based Compensation Dilution | SBC is ~15% of revenues, partially offset by the $1B buyback authorization. | Buying back stock at 76x P/E to offset SBC dilution is deeply value-destructive capital allocation; the buyback offsets share count dilution mathematically but destroys economic value for long-term shareholders at these prices. | partial |

## Things to verify

- Pull Reddit's Q3 and Q4 2025 earnings releases and 10-K (fiscal year ending December 2025) to verify whether the $450M operating income and $350M NOPAT figures are GAAP or adjusted — the audited 2025 annual EBIT of -$140M in the financial snapshot versus the analyst's claimed $450M is a $590M discrepancy that must be resolved before any return calculation is meaningful.
- Check the actual contract terms and expiration dates for the OpenAI and Google data licensing agreements via the most recent 10-K risk factors and revenue footnotes — the analyst treats ~$130M in combined licensing revenue as durable without disclosing contract length or renewal probability.
- Verify insider ownership percentage and post-IPO insider selling activity via SEC Form 4 filings (available at sec.gov) — the company IPO'd in March 2024, lock-up periods have likely expired, and the analyst explicitly did not assess insider alignment for a stock trading at 36x EV/Sales.
- Cross-check the FCF calculation: review the cash flow statement to determine whether the analyst's 'NOPAT' excludes SBC (non-cash) and whether the 1.7% FCF yield in the snapshot reflects GAAP FCF or an adjusted figure — given 2024 and 2025 GAAP FCF were both negative, the claimed positive FCF yield requires reconciliation.
- Verify Reddit's logged-in vs. logged-out user trend from the most recent earnings call (Q1 2026 if available) — the thesis on advertising improvement depends on converting logged-out users to logged-in accounts, and any reversal or stagnation in that trend is a direct leading indicator of monetization ceiling.
- Independently verify the $6B bull-case revenue target against Reddit's disclosed US/international user and revenue split — if a large proportion of user growth is international at a fraction of the $35 US ARPU, the path to $6B may require ARPU expansion in international markets that the analyst does not model.

## Financial snapshot

*As of:* 2026-05-03

| Metric | Value |
|---|---|
| Price | $166 |
| Market cap | $32.04B |
| Enterprise value | $29.13B |
| Net cash | $2.75B |
| P/E (TTM) | 47.6 |
| EV / EBIT | — |
| EV / Sales | 36.24 |
| FCF yield | 1.7% |
| Profitable (last FY) | no |
| Positive FCF (last FY) | no |
| Share count trend (3y) | flat |

## Valuation assumptions (analyst)

*Method:* Implied-growth breakeven and peer-based scenario analysis  •  *Horizon:* 5 yr
*Implied return:* 12.0% – 17.0%

| Assumption | Value | Confidence | Citation |
|---|---|---|---|
| Current market cap | $27 billion | high | [52:02–52:20] |
| Trailing twelve months revenue | $2.2 billion | high | [52:20–52:45] |
| Trailing operating income | $450 million | high | [52:45–53:05] |
| Trailing NOPAT | $350 million | high | [53:05–53:20] |
| Trailing P/E ratio | 76x | high | [53:20–53:45] |
| Revenue growth required to be priced in (next 3 years annually) | 30% per year | medium | [53:45–55:10] |
| Operating margin expansion required to be priced in (3-year target) | 20% to 35% | medium | [54:30–55:10] |
| Operating income growth required to be priced in (next 3 years annually) | 50% per year | medium | [53:57–54:30] |
| Bull scenario target revenue (matching Snapchat scale) | $6 billion | low | [55:30–56:00] |
| Bull scenario operating margin at $6B revenue | 40% | low | [55:50–56:10] |
| Bull scenario implied after-tax earnings at $6B revenue | ~$1.9 billion | low | [56:00–56:20] |
| Time to reach $6B revenue | 5 years | low | [58:40–59:05] |
| Terminal multiple applied at $6B revenue | 25x to 30x | low | [58:30–59:00] |

## Critique findings

### Internal consistency

- **[nit] Trailing P/E math: $27B market cap / $350M NOPAT** (disagree)
  - Analyst: Trailing P/E ratio is 76x, based on a $27B market cap and $350M NOPAT.
  - Pushback: $27B / $350M = ~77x, which rounds acceptably to 76x. However, the analyst also states trailing operating income is $450M and NOPAT is $350M, implying a ~22% tax rate. That's plausible but never stated — the tax rate assumption is missing from the extracted assumptions, making the NOPAT figure unverifiable on its own terms.
  - Evidence: keyAssumptions: 'Current market cap' = $27B, 'Trailing NOPAT' = $350M, 'Trailing P/E ratio' = 76x, 'Trailing operating income' = $450M
- **[nit] Bull scenario after-tax earnings math: $6B revenue × 40% margin** (disagree)
  - Analyst: Bull scenario: $6B revenue × 40% operating margin → ~$1.9B after-tax earnings.
  - Pushback: $6B × 40% = $2.4B operating income. To get to ~$1.9B after-tax implies a ~21% tax rate ($2.4B × 0.79 ≈ $1.9B), which is plausible but not stated. More importantly, the analyst uses the same NOPAT-to-operating-income ratio implicitly (~78%) but never reconciles or discloses the tax rate assumption used in either the trailing or bull-case figures.
  - Evidence: keyAssumptions: 'Bull scenario target revenue' = $6B, 'Bull scenario operating margin at $6B revenue' = 40%, 'Bull scenario implied after-tax earnings at $6B revenue' = ~$1.9B; compare to trailing: operating income $450M, NOPAT $350M (ratio ~77.8%)
- **[nit] Implied return math: bull scenario at 25x–30x multiple** (disagree)
  - Analyst: Applying a 25x–30x multiple to ~$1.9B after-tax earnings in 5 years gives an implied annual return of 12–17%.
  - Pushback: $1.9B × 25x = $47.5B; $1.9B × 30x = $57B. From a $27B starting market cap over 5 years: ($47.5B/$27B)^(1/5) − 1 ≈ 12%, and ($57B/$27B)^(1/5) − 1 ≈ 16%. These roughly match the stated 12–17% range, but the high end requires the 30x multiple and gets only ~16%, not 17%. The 17% figure is slightly overstated unless discounting or buyback accretion assumptions are being folded in without disclosure.
  - Evidence: keyAssumptions: 'Terminal multiple applied at $6B revenue' = 25x–30x, 'Bull scenario implied after-tax earnings' = ~$1.9B, 'Current market cap' = $27B; impliedReturn: low = 0.12, high = 0.17; timeHorizonYears = 5
- **[concern] Revenue growth required to be priced in vs. operating income growth consistency** (disagree)
  - Analyst: 30% annual revenue growth and 50% annual operating income growth are both 'priced in' over 3 years, with margins expanding from 20% to 35%.
  - Pushback: Starting from $2.2B revenue at 20% margins ($440M operating income): 30% revenue CAGR for 3 years → $2.2B × 1.3^3 ≈ $4.85B. At 35% margin that gives $1.7B operating income. $440M growing at 50%/year for 3 years = $440M × 1.5^3 ≈ $1.49B. These two paths ($1.7B vs. $1.49B) don't reconcile — the 50% operating income CAGR is actually conservative relative to what the combined revenue growth + margin expansion implies, creating an internal inconsistency in what is 'priced in.'
  - Evidence: keyAssumptions: 'Revenue growth required to be priced in' = 30%/yr, 'Operating income growth required to be priced in' = 50%/yr, 'Operating margin expansion required' = 20% to 35%; 'Trailing TTM revenue' = $2.2B, 'Trailing operating income' = $450M
- **[nit] Segment revenue sum vs. stated TTM total revenue** (disagree)
  - Analyst: Trailing twelve months revenue is $2.2 billion.
  - Pushback: The two segments sum to $2.05B (advertising) + $0.14B (other) = $2.19B, which rounds to $2.2B. This is consistent, but the advertising segment growth rate of 74% YoY is stated without a corresponding prior-year base being disclosed, making it impossible to verify the $2.05B figure internally against any earlier revenue anchor in the analysis.
  - Evidence: segments: Advertising revenue = $2,050,000,000; Other Revenue = $140,000,000; sum = $2,190,000,000; keyAssumptions: 'Trailing twelve months revenue' = $2.2B
- **[concern] Time horizon mismatch: 'priced in' analysis uses 3 years, bull case uses 5 years** (partial)
  - Analyst: The valuation section uses a 3-year horizon for the implied-growth breakeven analysis and a 5-year horizon for the bull scenario return calculation.
  - Pushback: The analyst never explicitly reconciles why the breakeven analysis uses 3 years while the bull-case return uses 5 years. If the 30%/yr growth is 'priced in' over 3 years, reaching ~$4.85B, but the bull case targets $6B over 5 years (implying ~22% CAGR from today), the bull case revenue trajectory is actually slower than what's 'priced in.' This creates an internal tension: the bull scenario's revenue path underperforms the 'already priced in' scenario, which should logically yield below-market returns, not 12–17%.
  - Evidence: keyAssumptions: 'Revenue growth required to be priced in' = 30%/yr over 3 years; 'Time to reach $6B revenue' = 5 years; 'Trailing TTM revenue' = $2.2B; $2.2B × 1.3^3 = ~$4.85B in 3 yrs vs. $6B in 5 yrs implies ~22% CAGR; impliedReturn: low=0.12, high=0.17

### Comps

- **[nit] Comps critique skipped** (missing)
  - Analyst: N/A
  - Pushback: No peer set is configured for this ticker in packages/pipeline/src/comps.ts. Add peers to enable the comps critique.
  - Evidence: config gap

### Missing risks

- **[blocker] Actual profitability vs. analyst's claimed NOPAT/operating income figures** (missing)
  - Analyst: Analyst states trailing operating income of $450M, NOPAT of $350M, and 20% operating margins, presenting Reddit as 'GAAP profitable'.
  - Pushback: The financial snapshot shows Reddit is NOT profitable and does NOT have positive FCF. 2024 EBIT was -$172M, net income -$159M, FCF -$100M. 2025 EBIT was -$140M, net income -$91M, FCF -$85M. The analyst's figures ($450M operating income, 20% margins) appear to reflect a more recent TTM period that diverges sharply from audited annual data. This discrepancy is large enough to warrant scrutiny — either the business inflected dramatically in late 2025/early 2026, or the analyst is using adjusted/non-GAAP figures without flagging the gap. A 76x P/E and the entire bull case rest on this claimed profitability; if the underlying numbers are still negative or adjusted-only, the thesis changes materially.
  - Evidence: 2024: EBIT -$172M, net income -$159M, FCF -$100M. 2025: EBIT -$140M, net income -$91M, FCF -$85M. Financial snapshot flags isProfitable=false, hasPositiveFcf=false. Analyst claims $350M NOPAT and 20% operating margins.
- **[concern] FCF yield and negative free cash flow reality** (missing)
  - Analyst: Not addressed. Analyst focuses on operating income and NOPAT but does not discuss free cash flow conversion or capital intensity.
  - Pushback: The snapshot shows FCF yield of 1.7% at current prices, and both 2024 and 2025 annual FCF were negative (-$100M and -$85M respectively). If the company is consuming cash, the analyst's per-share return calculations using earnings-based multiples may overstate true owner earnings. For a value investor, the gap between GAAP/adjusted operating income and actual FCF generation is a critical missing discussion — especially if SBC is being excluded from FCF calculations.
  - Evidence: FCF yield = 1.7% (snapshot). 2024 FCF = -$100M; 2025 FCF = -$85M. Both years negative despite analyst claiming ~$350M NOPAT.
- **[concern] Data licensing revenue cliff risk** (missing)
  - Analyst: Analyst mentions OpenAI and Google data licensing deals (~$60-70M each) as part of 'Other Revenue' but does not discuss contract duration, renewal risk, or what happens if these deals are not renewed.
  - Pushback: Data licensing deals with AI companies are novel, potentially one-time or short-term in nature, and subject to non-renewal as AI companies build their own data pipelines or shift strategy. If these ~$130M+ in annual licensing revenues disappear, total revenue drops ~6% and the 'Other Revenue' segment declines ~90%. The analyst frames this as a durable revenue stream without assessing renewal probability or contract terms.
  - Evidence: Other Revenue segment = $140M total; OpenAI + Google deals estimated at ~$60-70M each (~$130M combined). No discussion of contract length, renewal terms, or what happens post-expiration.
- **[nit] Geographic concentration and international monetization gap** (missing)
  - Analyst: Not addressed. Analyst compares Reddit's US ARPU ($35) to Meta and Snapchat but does not discuss what fraction of revenue or users are non-US.
  - Pushback: Reddit's ~$35 US ARPU implies heavy dependence on the US market for revenue even if global DAUs are more spread out. International users are likely monetized at a fraction of US rates. If a large proportion of DAU growth is coming from lower-ARPU international markets, revenue-per-user trends may be flattering on a blended basis while the underlying monetizable user base grows more slowly. This is a known trap for social media platforms (Meta's early international growth phase).
  - Evidence: Analyst cites US ARPU of $35 without disclosing the US/international revenue or user split. Total DAU cited as ~120M (70M logged-out + 50M logged-in) but geographic breakdown not addressed.
- **[concern] Management quality and insider ownership** (missing)
  - Analyst: Analyst explicitly states 'Not directly assessed' and insiderOwnership is null.
  - Pushback: For a stock trading at 36x EV/Sales with no confirmed positive FCF, management execution risk is unusually high. The analyst skips assessment of CEO Steve Huffman's track record, whether insiders are selling into the post-IPO price run-up, and related-party or compensation structure concerns. Given the company only IPO'd in early 2024, lock-up expiration selling and insider behavior deserve mention.
  - Evidence: insiderOwnership = null in extracted analysis. Company IPO'd 2024. Stock at $166, up significantly from IPO price. No insider ownership or selling discussion provided.

### Assumption stress tests

| Assumption | Base | Bear (Δret) | Bull (Δret) | Sensitivity |
|---|---|---|---|---|
| Revenue growth required to be priced in (next 3 years annually) | 30% per year | 15% per year (-10%) | 40% per year (+5%) | high |
| Terminal multiple applied at $6B revenue | 25x to 30x | 15x (-8%) | 40x (+6%) | high |
| Bull scenario operating margin at $6B revenue | 40% | 20% (-7%) | 45% (+3%) | high |
| Time to reach $6B revenue | 5 years | 8 years (-5%) | 4 years (+3%) | medium |
| Operating margin expansion required to be priced in (3-year target) | 20% to 35% | 20% sustained (no expansion) (-6%) | 20% to 40% in 3 years (+3%) | medium |
| Bull scenario target revenue (matching Snapchat scale) | $6 billion | $3.5 billion (-5%) | $8 billion (+4%) | medium |
| Trailing NOPAT | $350 million | $200 million (-3%) | $420 million (+1%) | low |

### Value-investing checklist

| Criterion | Score (1–5) | Rationale |
|---|---|---|
| Moat durability | 3 | Reddit's 100,000+ subreddits of authentic human-generated content create a genuine content moat that grows more valuable as AI-generated content proliferates, but the anonymous user base, text-centric format, and structural inability to build a social graph limit the moat's monetization durability against Meta and Google. |
| Owner earnings quality | 1 | The financial snapshot shows Reddit was still FCF-negative in both 2024 (-$100M) and 2025 (-$85M) with negative net income, while the analyst's extracted analysis references $350M NOPAT and $450M operating income on a TTM basis — a dramatic disconnect suggesting the 'profitability' is recent, thin, and heavily dependent on SBC adjustments (~15% of revenues), not genuine cash generation. |
| Capital allocation | 2 | Reddit only recently turned GAAP profitable and has a history of losses; the $1B buyback authorization at a 76x P/E and $27-32B market cap on ~$2.2B revenue signals buybacks at a rich price, and SBC at ~15% of revenues means shareholders are being diluted faster than capital is being returned with discipline. |
| Insider alignment | 2 | The extracted analysis explicitly notes insider ownership as null/not assessed, and the financial snapshot provides no insider ownership data; with no evidence of meaningful insider ownership or buying activity, this scores low by default. |
| Debt sustainability | 5 | The financial snapshot shows net cash of $2.75B against an enterprise value well below market cap, meaning Reddit carries no net debt and faces zero solvency risk under any reasonable scenario. |
| Cyclicality awareness | 4 | The analyst explicitly stress-tests deceleration risk by examining how Snapchat and Pinterest collapsed from 50-65% growth to single digits in a single year, and builds the valuation around a 30% required growth hurdle that must be sustained — demonstrating conservative through-cycle thinking for an ad-dependent business. |

