# NVDA — Decision Card

**Verdict:** 🔴 Pass  •  **Weighted score:** 6.5 / 10

*Generated:* 2026-06-25  •  *10-K:* `0001045810-26-000021`  •  *Analyst videos:* 0

> *No analyst content configured for this ticker — verdict based on primary sources only.*

## Summary

NVDA is a Pass despite an undeniably exceptional business. The moat is real and deep — CUDA's 20-year ecosystem lead, full-stack silicon-to-software integration, and network effects among developers create genuine durability — and the balance sheet is fortress-like with $54B in net cash. But two dimensions pull the verdict down decisively. Cyclicality is the critical flaw: NVIDIA's own filings warn of demand spikes and crashes, and prior cycles produced severe inventory write-downs that remind investors how quickly the picture can reverse. The valuation compounds the problem — at 30.5× earnings versus a 10-year median of 4.0× and a FCF yield under 1%, the reverse DCF demands 16% annual FCF growth for a decade, which is heroic even for a company that grew FCF at 77% and 163% over the past 5 and 3 years respectively, because those rates are peak-cycle prints unlikely to persist into a normalized environment. A great business at a price that leaves almost no margin of safety in a highly cyclical industry is precisely the setup value investors are trained to avoid.

*Total LLM cost for this analysis:* $0.92 *(re-runs hit cache and cost $0).*

## Dimension scores

| Dimension | Score | Range | Uncertainty | Effective weight |
|---|---|---|---|---|
| Moat durability | **8.0** | 0.0 | tight | 0.20 |
| Owner earnings quality | **6.5** | 0.0 | tight | 0.20 |
| Capital allocation | **5.0** | 0.0 | tight | 0.20 |
| Debt sustainability | **9.5** | 0.0 | tight | 0.15 |
| Insider alignment | **9.0** | 0.0 | tight | 0.10 |
| Cyclicality awareness | **2.0** | 0.0 | tight | 0.15 |

### Dimension reasoning

**Moat durability (8.0):** Pass 2 explicitly recommends zero adjustment and concurs that Pass 1's 8 is well-calibrated. The only new evidence surfaced — the Groq IP license risk — is acknowledged by Pass 2 itself as a single discrete arrangement that does not materially alter the moat characterization. Pass 1 already weighted the principal erosion vectors (China foreclosure, hyperscaler custom silicon, export control competitive benefits) appropriately, and Pass 2 found no decisive counter-evidence to shift the score.

**Owner earnings quality (6.5):** Pass 2 recommended zero adjustment and its rebuttal actually reinforces Pass 1's framework rather than challenging it — both analysts agree that OCF correctly strips out the $8.9B investment gains and that SBC is a real cost. Pass 2's observation that OCF is not inflated by investment gains was already implicit in Pass 1's citation [0] noting the gains are 'added back in operating cash flow.' The 6.5 score appropriately reflects strong cash generation offset by large SBC (~6% of revenue), the investment gain distortion to GAAP net income, and the working capital surge — all well-supported by the primary sources.

**Capital allocation (5.0):** Pass 2 explicitly recommended 0 adjustment and found no material new evidence to shift the score. The two items Pass 2 surfaced — aggregate forward commitments and the lease guarantee structure — were either already captured in Pass 1's analysis of the $95.2B manufacturing commitments or are immaterial in magnitude relative to NVIDIA's $102.7B OCF and $157B equity base. Pass 1's score of 5 accurately reflects the tension between explosive cash generation and aggressive capital deployment at elevated valuations with uncertain ecosystem returns.

**Debt sustainability (9.5):** Pass 2 fully corroborates Pass 1's analysis with no new concerns raised. Both analysts agree on the key metrics: $62.6B in liquid assets against $8.5B gross debt, 500× interest coverage, well-laddered non-financial covenant debt maturing through 2060, and $102.7B annual operating cash flow. The off-balance-sheet commitment risk was already acknowledged and correctly assessed as immaterial given the cash generation capacity.

**Insider alignment (9.0):** Pass 2 independently reviewed the primary sources and found no material concerns beyond what Pass 1 already identified and weighed. The skeptic confirmed the core alignment indicators: 3.58% founder ownership, 96% at-risk CEO pay, 100% PSU equity structure, anti-hedging/pledging policy, and robust governance mechanisms. Pass 2 flagged the Huang Foundation/CoreWeave arrangement as a related-party adjacency but correctly assessed it as immaterial given full disclosure and no direct NVIDIA cost. With a recommended adjustment of 0 and no new evidence surfaced, the original score of 9 stands.

**Cyclicality awareness (2.0):** Pass 2 correctly identifies that NVIDIA's disclosures are extensive and detailed about cyclical risks, but ultimately concedes that Pass 1's score reflects behavioral cyclicality risk rather than disclosure quality — and recommends no adjustment. The dimension being scored is whether management demonstrates awareness and prudent through-cycle planning behavior, not merely whether risks are disclosed. Pass 1's citations robustly support a low score: the $4.5B H20 charge, aggressive expansion of non-cancellable purchase commitments during a boom, and management's own 'mercurial' demand language all indicate a pattern of reactive rather than cycle-aware capital deployment. Pass 2 found no new material evidence that changes this assessment.

## Valuation context

- Reverse DCF (10% discount, 20× terminal): market is pricing in **16.0%** annual FCF growth for 10 years.
- Actual delivered 5-year FCF CAGR: **77.5%**
- Gap: -61.6pp *(price embeds growth below the historical track record)*

See `reverse-dcf.md` for full sensitivity grid.

## Things to verify before acting

- Track datacenter revenue concentration quarter by quarter — NVIDIA's top customers (hyperscalers) represent a massive share of revenue. If any one or two reduce capex guidance, model the revenue impact before the next earnings call; the stock's implied 16% FCF CAGR has zero tolerance for a demand air pocket.
- Monitor the U.S. export control situation closely: read the most recent 10-K risk factor section on export restrictions (China, H20 chip rules). Any tightening of restrictions on the H20 or successor chips to China is a direct revenue hit that would widen the gap between current FCF and the reverse DCF's required 16% CAGR.
- Pull NVIDIA's historical gross margin trend across the 2018-2019 crypto bust and the 2022-2023 gaming downturn to calibrate how fast margins compressed. Then ask whether current 73%+ gross margins are a cycle peak — if margins revert even to 60%, the FCF math deteriorates sharply.
- Check the SBC trajectory: $6.4B in SBC is ~6.2% of FCF, which is dilutive. Verify in each quarterly 10-Q whether SBC is growing faster than revenue as headcount scales; if it is, owner earnings quality will erode from the already-middling 6.5 score.
- Evaluate capital allocation discipline on the buyback program: NVIDIA repurchased $40.4B of stock primarily at elevated valuations (P/E 30–50×). Look at the per-share buyback prices disclosed in the 10-K and compare to intrinsic value estimates to determine whether repurchases are creating or destroying value for remaining shareholders.
- Watch for inventory build signals in the supply chain: check NVIDIA's days inventory outstanding and any commentary from TSMC, SK Hynix, or major ODMs about order patterns. Prior cycles saw inventory corrections that hit revenue 2-3 quarters after the supply chain signal appeared.

---

*This card is a synthesis of the primary-source value-investing checklist (3 LLM passes per dimension, triple-sampled), reverse DCF, historical valuation context, and no analyst content. Citations and full reasoning live in `primary-source-checklist.md` and `reverse-dcf.md`. The tool produces this card to inform your judgment, not to substitute for it.*