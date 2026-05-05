# Extraction prompt

You will be given a normalized transcript of a YouTube stock analysis video. Extract a structured representation of the analyst's thesis.

## Your job

Produce a JSON object matching the `ExtractedAnalysis` schema. Every claim you extract must be traceable to a specific transcript timestamp range.

## Rules

1. **Extract, do not interpret.** If the analyst doesn't address a field, mark it null or omit it. Do not infer.
2. **Cite everything.** Every segment, risk, competitor entry, and assumption must have a `citation: { startSec, endSec }` pointing to the moment in the transcript where the claim is made. Use the timestamps in the transcript.
3. **Preserve the analyst's framing.** If they say "I'm not crazy about this business," capture that as their stated view. Do not soften or strengthen it.
4. **Quantify where possible.** Pull out actual numbers (revenue, margins, growth rates, multiples) rather than vague descriptions.
5. **Distinguish "addressed well" from "mentioned."** A risk is addressed well if the analyst quantifies it, gives a counter-position, or explicitly says how they got comfortable with it. Just naming a risk and moving on is not addressing it well.
6. **For valuation assumptions, capture analyst confidence.** Look for hedging language: "I'm not sure," "I picked this kind of conservatively," "I have no great basis for this" → low. "Conservative based on global comps" or "Drew explicitly cites peer data" → high. Default to medium.
7. **Output strict JSON.** No markdown, no code fences, no commentary. The first character must be `{` and the last `}`.

## Schema

```typescript
{
  ticker: string;              // Best inference from transcript and title
  companyName: string;
  analyst: string;             // Channel/host name
  videoDate: string;           // ISO date from metadata
  thesisOneLiner: string;      // 1-2 sentences capturing the core argument

  segments: Array<{
    name: string;
    revenue?: number;          // USD, in raw units (not millions)
    ebit?: number;
    growthRate?: number;       // As decimal: 0.30 for 30%
    keyDrivers: string[];
    citation: { startSec: number; endSec: number };
  }>;

  competitiveLandscape: Array<{
    competitor: string;
    threatLevel: "low" | "medium" | "high";   // Your inference from analyst's tone
    analystView: string;       // 1-2 sentences
    citation: { startSec: number; endSec: number };
  }>;

  risks: Array<{
    risk: string;
    severity: "low" | "medium" | "high";
    analystAddressedWell: boolean;
    citation: { startSec: number; endSec: number };
  }>;

  valuation: {
    method: string;
    timeHorizonYears: number;
    keyAssumptions: Array<{
      assumption: string;
      value: string;            // String to allow ranges, percentages, etc.
      analystConfidence: "low" | "medium" | "high";
      citation: { startSec: number; endSec: number };
    }>;
    impliedReturn?: { low: number; high: number };  // Decimals: 0.17 for 17%
    impliedPriceTarget?: number;
  };

  qualitativeFactors: {
    managementQuality: string;
    moat: string;
    insiderOwnership: string | null;
    capitalAllocation: string;
  };
}
```

## Input format

```
METADATA:
ticker: <ticker if known>
title: <video title>
channel: <channel name>
publishedAt: <ISO date>
durationSeconds: <number>

TRANSCRIPT:
<normalized transcript with timestamps>
```

## Output

JSON only.
