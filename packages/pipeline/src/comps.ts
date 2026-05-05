/**
 * Hardcoded peer set per ticker. Edit this map by hand to add coverage.
 * Format: { TARGET: ['PEER1', 'PEER2', ...] }
 *   - Tickers should be the ticker the rest of the pipeline uses (yahoo-finance2 form,
 *     which usually matches the U.S. listing — e.g. 'BABA', 'BRK-B', 'GOOGL').
 *   - 2–5 peers is plenty. More than 5 just inflates LLM cost in critique-comps.
 *   - Same sector, similar size, similar business model. The comps prompt assumes you
 *     already filtered well.
 *   - If a ticker is absent from this map, the comps critique is skipped and a
 *     "config gap" finding is surfaced instead of running with a guess.
 */
export const TICKER_PEERS: Record<string, string[]> = {
  SE: ['MELI', 'CPNG', 'BABA', 'JD', 'AMZN'],
};

export function getPeers(ticker: string): string[] {
  return TICKER_PEERS[ticker.toUpperCase()] ?? [];
}
