#!/usr/bin/env bash
set -euo pipefail

TICKER=MSFT  # whatever the stock is
URL="https://www.youtube.com/watch?v=WtoMBbTkHjU"

mkdir -p "fixtures/$TICKER"
pnpm tsx scripts/run-pipeline.ts "$URL" --json > "fixtures/$TICKER/card.json"
jq -r '.scored.verdict, .scored.weightedScore' "fixtures/$TICKER/card.json"
# Render markdown from the JSON we already have — no second pipeline run.
pnpm tsx scripts/render-card.ts "fixtures/$TICKER/card.json" > "fixtures/$TICKER/card.md"
open "fixtures/$TICKER/card.md"
