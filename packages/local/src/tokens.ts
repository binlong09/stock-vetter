// Token estimation for chunk sizing.
//
// We need token counts to size chunks against the local model's context
// window, but we deliberately do NOT ship a tokenizer. Qwen's vocabulary is
// not GPT's, `tiktoken` would give confidently wrong answers for it, and
// bundling the real one costs a native dependency and a model download to
// answer a question where being roughly right is sufficient.
//
// What matters is the direction of the error. Under-estimating truncates a
// chunk mid-table inside the model's context — a silent, plausible-looking
// wrong answer. Over-estimating just makes chunks slightly smaller than
// necessary. So this estimator is tuned to over-estimate.
//
// Financial filings tokenize much worse than prose because BPE vocabularies
// contain whole English words but not "6,203.2" — that is roughly five tokens
// for seven characters. Treating a filing as ~4 chars/token (the usual rule of
// thumb for English) under-counts a financial table by 40-60%, which is
// exactly the failure mode above. Hence separate coefficients per character
// class.
//
// To check the coefficients against your actual model, run:
//   pnpm tsx scripts/calibrate-tokens.ts
// which compares these estimates against the `prompt_eval_count` Ollama
// reports for real chunk text, and prints the ratio to set
// LOCAL_CHARS_PER_TOKEN_* with.

const LETTERS_PER_TOKEN = Number(process.env.LOCAL_CHARS_PER_TOKEN_TEXT ?? 3.6);
const DIGITS_PER_TOKEN = Number(process.env.LOCAL_CHARS_PER_TOKEN_DIGIT ?? 2.0);
// Punctuation and symbols mostly become their own token; markdown pipes
// certainly do. 0.8 rather than 1.0 because runs like ", " often merge.
const TOKENS_PER_SYMBOL = Number(process.env.LOCAL_TOKENS_PER_SYMBOL ?? 0.8);

export function estimateTokens(s: string): number {
  let letters = 0;
  let digits = 0;
  let symbols = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) letters++;
    else if (c >= 48 && c <= 57) digits++;
    else if (c === 32 || c === 9) continue; // spaces ride along with a word
    else if (c === 10) symbols++; // newline is its own token
    else if (c > 127) letters++; // non-ASCII letters (accents, CJK) — treat as text
    else symbols++;
  }
  return Math.ceil(letters / LETTERS_PER_TOKEN + digits / DIGITS_PER_TOKEN + symbols * TOKENS_PER_SYMBOL);
}

/**
 * Trim text to approximately `maxTokens`, cutting at a whitespace boundary.
 * Used for overlap windows and for clamping retrieved snippets.
 */
export function truncateToTokens(s: string, maxTokens: number): string {
  if (estimateTokens(s) <= maxTokens) return s;
  // Binary search the character length whose estimate fits. The estimator is
  // monotonic in length, so this converges.
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (estimateTokens(s.slice(0, mid)) <= maxTokens) lo = mid;
    else hi = mid - 1;
  }
  const cut = s.slice(0, lo);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > lo * 0.8 ? cut.slice(0, lastSpace) : cut).trimEnd();
}

/** Same, but keeps the END of the string — for building overlap windows. */
export function tailToTokens(s: string, maxTokens: number): string {
  if (estimateTokens(s) <= maxTokens) return s;
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (estimateTokens(s.slice(s.length - mid)) <= maxTokens) lo = mid;
    else hi = mid - 1;
  }
  const cut = s.slice(s.length - lo);
  const firstSpace = cut.indexOf(' ');
  return (firstSpace >= 0 && firstSpace < cut.length * 0.2 ? cut.slice(firstSpace + 1) : cut).trimStart();
}
