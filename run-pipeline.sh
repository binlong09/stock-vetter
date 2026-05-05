TICKER=RDDT  # whatever the stock is
mkdir -p fixtures/$TICKER
pnpm tsx scripts/run-pipeline.ts "https://www.youtube.com/watch?v=mZ-XavKNBMw" --json > fixtures/$TICKER/card.json
cat fixtures/$TICKER/card.json | jq -r '.scored.verdict, .scored.weightedScore'
# Eyeball the verdict, then if interesting:
pnpm tsx scripts/run-pipeline.ts "https://www.youtube.com/watch?v=mZ-XavKNBMw" > fixtures/$TICKER/card.md
open fixtures/$TICKER/card.md