# AMD — Decision Card

**Verdict:** 🔴 Pass  •  **Weighted score:** 5.3 / 10

*Generated:* 2026-05-10  •  *10-K:* `0000002488-26-000018`  •  *Analyst videos:* 1

## Summary

AMD is a Pass at current prices. The two dimensions that drag the score most are cyclicality (3.0) and owner earnings quality (4.0): AMD operates in a deeply cyclical semiconductor industry where revenue and operating income have historically collapsed 70–90% in down-cycles, and reported earnings are heavily obscured by stock-based compensation and amortization charges that make GAAP net income a poor proxy for true owner earnings. The business has genuine strengths — a net-cash balance sheet and real competitive traction in EPYC server CPUs — but the valuation leaves almost no margin for error. At a P/E of 151.7x, an EV/EBIT of over 1,800x, and an FCF yield under 1%, the market is pricing in flawless multi-year execution of an AI growth story that AMD's own history and the CUDA ecosystem disadvantage make extremely uncertain. The analyst's own bull case target is already below the current market cap, which is the most concise summary of the valuation problem.

## Dimension scores

| Dimension | Score | Range | Uncertainty | Effective weight |
|---|---|---|---|---|
| Moat durability | **5.5** | 0.0 | tight | 0.20 |
| Owner earnings quality | **4.0** | 0.5 | tight | 0.20 |
| Capital allocation | **5.0** | 0.5 | tight | 0.20 |
| Debt sustainability | **8.5** | 0.0 | tight | 0.15 |
| Insider alignment | **6.5** | 0.0 | tight | 0.10 |
| Cyclicality awareness | **3.0** | 0.0 | tight | 0.15 |

### Dimension reasoning

**Moat durability (5.5):** Pass 2 explicitly agrees with Pass 1's score of 5.5 and recommends zero adjustment, finding no material new evidence beyond what Pass 1 already weighed. Pass 2's citations — the competition-driven-by-rapid-technological-change language and the ROCm/OpenAI/EPYC moat-adjacent strengths — are all already captured in Pass 1's analysis. The score of 5.5 correctly reflects genuine but execution-dependent, structurally thin competitive advantages across multiple contested segments.

**Owner earnings quality (4.0):** Pass 2 surfaces one genuinely valid incremental concern Pass 1 missed: the $341M non-recurring investment gain flowing through GAAP net income but backed out in operating cash flow, confirmed directly in the cash flow statement as '(Gains) losses on long-term investments, net (341)'. This modestly overstates sustainable GAAP earnings (~8% of net income). However, Pass 2's other point — that the $440M export control charge is actually a mild positive for normalized earnings quality — was already cited by Pass 1 as a distortion, and framing it as an incremental positive is a minor recharacterization rather than new evidence. The investment gain concern is real but small, justifying a partial adjustment of roughly half Pass 2's recommended -0.5, yielding a final score of 4.25, rounded to 4.0 given the cumulative weight of SBC, amortization complexity, thin FCF yield, and now the non-recurring gain all working against earnings quality.

**Capital allocation (5.0):** Pass 2 recommended no adjustment and explicitly acknowledged that its two cited concerns — the OpenAI warrant and the $12.2B purchase commitments — were already captured within Pass 1's framing or were consistent with AMD's fabless model. Pass 2's rebuttal adds no material new evidence that Pass 1 missed or under-weighted; it largely validates Pass 1's balanced assessment of strategic deal-making sophistication against valuation-insensitive buybacks and unconventional equity use. The score of 5 appropriately reflects the mixed capital allocation picture documented in the primary sources.

**Debt sustainability (8.5):** Pass 2 found no additional material concerns beyond what Pass 1 already identified and properly weighted. Both analysts agree on the core facts: net cash of ~$8.5B, $3.25B in well-laddered debt, ~28x interest coverage, undrawn $3B revolver, and covenant compliance. Pass 2 explicitly confirmed that Pass 1's counter-evidence section already captured the $12.2B in purchase commitments, new debt issuance, uncommenced leases, and 2026 maturity coincidence. The 8.5 score appropriately reflects strong formal debt metrics offset by the large off-balance-sheet purchase commitment load, and Pass 2 recommended zero adjustment.

**Insider alignment (6.5):** Pass 2's rebuttal is substantively in agreement with Pass 1 and recommends zero adjustment. Pass 2 confirms the same positive structural elements (96% variable pay, equity dominance, anti-hedging/pledging policies, double-trigger CIC, clawback) and acknowledges the same limitations (no disclosed insider ownership percentages for NEOs, professional rather than founder-led management). Pass 2's additional observations — the revised TSR percentile-ranking metric for 2025 PRSUs and the trivial Guido Form 4 administrative error — do not materially alter the alignment picture in either direction. The 6.5 score appropriately reflects strong compensation-structure alignment without founder-level ownership concentration.

**Cyclicality awareness (3.0):** Pass 2 explicitly recommended 0 adjustment and agreed that Pass 1's score of 3 appropriately reflects AMD's high inherent cyclicality. Pass 2's additional evidence about the $800M MI308 export control charge, while materially documented in the primary sources, was correctly characterized as a one-time policy-driven shock already partially reversed at $360M rather than a structural cyclical amplifier that would change the score calibration. Both analysts converge on the same assessment, and the primary sources robustly support the multi-vector cyclical risk characterization underlying the score of 3.

## Valuation context


See `reverse-dcf.md` for full sensitivity grid.

## Cross-source findings (analyst vs. primary-source)

| Topic | Analyst view | Primary-source view | Agreement |
|---|---|---|---|
| CUDA ecosystem moat vs. AMD's ROCm | Nvidia's CUDA is deeply entrenched due to architectural differences; AMD's ROCm is a weak substitute and cannot effectively port CUDA code, meaning AMD's GPU moat is very weak. | AMD's Instinct GPU segment is a genuine revenue contributor but the moat durability score (5.5) reflects that the CUDA software lock-in is a real ceiling on AMD's AI GPU addressable market share. | ✓ agree |
| AI capex cycle and down-cycle risk | Hyperscalers are explicitly overshooting on capex at $130–150B annually, creating severe down-cycle risk when spending normalizes; AMD's embedded segment already showed a 90%+ operating income collapse in 2021–2023 as precedent. | Cyclicality is scored 3.0 with AMD's own SEC filings explicitly disclosing exposure to semiconductor downturns, consumer PC swings, gaming console cycles, and cryptocurrency volatility. | ✓ agree |
| Valuation vs. bull case upside | The analyst's bull case of 15x P/E on $43B in 2030 earnings implies roughly 100% upside from the analyst's assumed entry price. | At AMD's current market cap, the analyst's own bull case target is below the current price — meaning the stock has already traded through its best-case scenario. EV/EBIT of 1,829x and FCF yield of 0.97% confirm extreme valuation stretch. | ✗ disagree |
| Revenue growth sustainability (35% CAGR assumption) | AMD can sustain 35% annual revenue growth for 3–5 years based on company guidance and the AI data center opportunity; the analyst himself assigns low confidence to this. | AMD's 20-year history does not include a sustained period of 35% revenue growth; capital allocation score (5.0) and owner earnings quality (4.0) reflect execution uncertainty at this growth rate. | ~ partial |
| EPYC CPU competitive position | AMD has a strong and widening data center CPU moat via chiplet architecture and TSMC partnership, taking consistent share from Intel. | Moat score (5.5) agrees on the EPYC CPU advantage but flags Nvidia's Vera ARM-based CPU entry into data center as an underappreciated risk not present in the analyst's framing. | ~ partial |
| Operating margin path to 35% | AMD can reach 35% operating margins consistent with company guidance. | AMD's 2023 GAAP EBIT margin was 1.8%; even peak-cycle GAAP margins have been far below 35%. Owner earnings quality (4.0) is partly scored down because non-GAAP adjustments systematically flatter margins, making the 35% target appear more plausible th | ~ partial |

### What the disagreements mean

The most important disagreement is on valuation: the analyst constructed a bull case that, at the time of analysis, implied meaningful upside, but AMD's share price has since traded through that bull case target, inverting the return math entirely. The primary-source data (EV/EBIT of 1,829x, FCF yield of 0.97%) corroborates this — when an analyst's own optimistic scenario no longer clears the current price, that is a hard valuation signal, not a judgment call. On operating margins, both sources flag uncertainty, but the primary-source GAAP filings make the 35% target appear far more distant than non-GAAP framing implies; when sources disagree on a margin fact, the GAAP income statement is the authoritative source.

## Things to verify before acting

- Check AMD's actual GAAP operating income margin each quarter against the 35% non-GAAP target in management guidance. The gap between non-GAAP (~25–27%) and GAAP (~2–5%) margins is driven primarily by stock-based compensation and Xilinx amortization — model out when amortization rolls off and whether SBC as a percent of revenue is shrinking before crediting any margin expansion.
- Cyclicality is the highest-risk dimension (score 3.0). Before any position, review the Embedded segment revenue history from 2021 to 2024: it peaked around $1.3B/quarter and collapsed below $200M — a real-world stress test of what happens to AMD revenue in a down-cycle. Decide whether your holding period can survive a similar reset in the Data Center segment.
- Run a simple reverse DCF at current price using AMD's trailing twelve-month owner earnings (operating cash flow minus capex, minus a realistic SBC haircut). With FCF yield under 1%, compute what FCF CAGR is required at a 10% discount rate to justify the price and compare that to AMD's realized FCF growth over any 5-year rolling period in its history.
- Pull AMD's Q1 2025 10-Q and verify whether the MI300 series GPU revenue is being converted into free cash flow or being consumed by R&D and SBC. Specifically, check whether operating cash flow as a percent of non-GAAP operating income is improving or deteriorating — a widening gap would confirm the owner earnings quality concern.
- Assess the ZT Systems integration: AMD acquired ZT Systems for $4.4B and sold the manufacturing arm to Sanmina within months. Read the 8-K disclosures and Q4 2024 earnings call commentary on what intellectual property AMD retained, what the ongoing service obligations to Sanmina are, and whether the $2.4B sale proceeds are being redeployed with return discipline.
- Monitor Nvidia's Vera CPU product timeline and hyperscaler adoption. If major cloud providers begin substituting Vera (Arm-based, Nvidia-designed) for EPYC in new rack designs, AMD's best-quality moat dimension deteriorates. Check AWS, Google, and Azure infrastructure announcements quarterly for Vera deployment references.
- Verify insider transaction activity on SEC Form 4 filings over the past 12 months. Lisa Su's compensation is ~96% performance equity, which is structurally positive, but check whether executives are selling shares on a pre-planned 10b5-1 schedule at a pace that exceeds vesting — large systematic selling at current valuations would signal that insiders do not share the market's growth assumptions.

---

*This card is a synthesis of the primary-source value-investing checklist (3 LLM passes per dimension, triple-sampled), reverse DCF, historical valuation context, and analyst-video DecisionCards. Citations and full reasoning live in `primary-source-checklist.md` and `reverse-dcf.md`. The tool produces this card to inform your judgment, not to substitute for it.*