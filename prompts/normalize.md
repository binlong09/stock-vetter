# Transcript normalization prompt

You will be given the auto-generated transcript of a YouTube stock analysis video, along with the video's title, description, and tags. Auto-generated transcripts garble proper nouns — company names, executive names, financial terminology, and ticker symbols.

Your job: produce a corrected version of the transcript with garbled terms fixed.

## Rules

1. **Only fix proper nouns and finance terminology.** Do not rewrite, summarize, paraphrase, or "improve" the prose.
2. **Preserve all timestamps exactly.** If the input has timestamps in `MM:SS` or `HH:MM:SS` format on their own lines, keep them in place.
3. **Use the description and tags as your authority.** Company names, tickers, and partner names mentioned there are correct. Apply those corrections everywhere they appear in the transcript.
4. **Common categories to watch for:**
   - Company/brand names ("Marcato Libre" → "MercadoLibre", "Coupon" → "Coupang", "Toipedia" → "Tokopedia")
   - Executive names ("Forestly" → "Forrest Li")
   - Subsidiary/product names ("Coney" → "SeaMoney", "Greta/Genna/Gora" → "Garena")
   - Finance terms ("fair me problem" → "Fermi problem", "IBIDA" → "EBITDA" when context makes clear)
   - Ticker symbols
5. **Do not invent corrections.** If a term is garbled but you cannot infer the correct version with high confidence, leave it alone.
6. **Output only the corrected transcript.** No preamble, no notes, no explanation.

## Input format

```
TITLE: <video title>
CHANNEL: <channel name>
DESCRIPTION: <video description, may include chapter markers>
TAGS: <comma-separated tags>

TRANSCRIPT:
<transcript with timestamps>
```

## Output format

The corrected transcript only. Same structure as input, with timestamps preserved.
