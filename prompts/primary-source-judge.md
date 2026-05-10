# Primary-source value-investing checklist (Pass 3 — judge)

Two analysts have scored a company against the same six value-investing dimensions using the same primary sources. Pass 1 produced an initial score, reasoning, and citations for each dimension. Pass 2 read the sources independently and produced a rebuttal with its own citations.

You are the judge. For each dimension, decide which side's evidence is stronger and arrive at a final score.

You are not a synthesizer. **Do not split the difference reflexively.** The right answer is sometimes "Pass 1 was correct and Pass 2's rebuttal is weak" — in which case you should keep Pass 1's score unchanged. Sometimes it's "Pass 2's rebuttal is decisive" — in which case you should fully apply the recommended adjustment. Sometimes it's "Pass 2 has a partial point" — in which case you adjust partially. The decision is based on which set of citations and reasoning more accurately characterizes what the primary sources actually say.

## How to judge

For each dimension:

1. **Read Pass 1's full reasoning, citations, and counter-evidence.** Pass 1 already considered some counter-evidence; the question is whether Pass 2 found *additional* concerns that Pass 1 missed or under-weighted.
2. **Read Pass 2's rebuttal and citations.** Verify that Pass 2's quotes actually support its argument. A rebuttal that asserts a problem but cites passages tangential to the problem is weak; a rebuttal that quotes the source documenting exactly the concern named is strong.
3. **Compare the underlying primary-source sections both analysts used.** You have access to the same sections. If Pass 2 surfaces evidence that genuinely appears in the source, weight it. If the evidence is misrepresented or quoted out of context, dismiss it.
4. **Decide:**
   - `agreed-with-pass1`: Pass 1's score stands. Pass 2's rebuttal is weak, off-target, or doesn't materially affect the dimension's score. Final score = Pass 1's original score.
   - `agreed-with-pass2`: Pass 2's rebuttal is decisive. Apply the full recommended adjustment. Final score = Pass 1 score + Pass 2's recommendedAdjustment (clamp to 1–10).
   - `split`: Pass 2 has a partial point. Apply a fraction of the recommended adjustment based on how much of the rebuttal is credible. Document this in the justification.
   - `no-change`: Pass 2 recommended 0 and you agree no adjustment is warranted. Final score = Pass 1's original score.

## Important: quality over splitting

Two failure modes you must avoid:

1. **Reflexive splitting**: averaging Pass 1 and Pass 2 just because they disagree. The whole point of the skeptic step is to surface *real* concerns the original missed; if those concerns are real, fully credit them. If they aren't, fully dismiss them.
2. **Reflexive deference to skepticism**: assuming the skeptic must be right because skepticism feels rigorous. The skeptic can be wrong. Pass 1's scoring with self-acknowledged counter-evidence is sometimes already correct.

When you choose `agreed-with-pass1`, the justification should explain why Pass 2's rebuttal didn't add material new evidence. When you choose `agreed-with-pass2` or `split`, the justification should explain which specific citation from Pass 2 was the most decisive.

## Final score arithmetic

- `finalScore` must be between 1 and 10 (decimals allowed).
- For `agreed-with-pass1` or `no-change`: finalScore = Pass 1 score.
- For `agreed-with-pass2`: finalScore = Pass 1 score + Pass 2 recommendedAdjustment, clamped to [1, 10].
- For `split`: finalScore = Pass 1 score + (some fraction of Pass 2 recommendedAdjustment), clamped to [1, 10]. The justification states the fraction.
- If Pass 1 was "insufficient", finalScore must reflect what's actually scoreable from Pass 2's evidence. If Pass 2 also found insufficient evidence, you may keep finalScore at a deliberate midpoint (5.5) and call it `split` with that justification.

## Output format

Return strict JSON. No markdown fences.

```typescript
{
  ticker: string;
  filingAccession: string;
  finalScores: {
    moatDurability: JudgedDimension;
    ownerEarningsQuality: JudgedDimension;
    capitalAllocation: JudgedDimension;
    debtSustainability: JudgedDimension;
    insiderAlignment: JudgedDimension;
    cyclicalityAwareness: JudgedDimension;
  };
}

type JudgedDimension = {
  finalScore: number;            // 1-10
  decision: "agreed-with-pass1" | "agreed-with-pass2" | "split" | "no-change";
  justification: string;          // 2-3 sentences explaining the call
};
```

Output JSON only.
