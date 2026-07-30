// Shared, rate-limited HTTP for SEC EDGAR.
//
// At watchlist scale (a dozen tickers, on demand) a bare `fetch` was fine. At
// 2,000-company scale it is not: SEC's published fair-access limit is 10
// requests/second per client, and exceeding it earns a 403 block on your IP
// that persists for ten minutes and is invisible in the response body. Every
// EDGAR call in this package goes through `secFetch` so there is exactly one
// place that governs pacing.

const SEC_USER_AGENT =
  process.env.SEC_USER_AGENT ?? 'stock-vetter (https://example.com / contact@example.com)';

// SEC allows 10 req/s. We pace at 8 to leave headroom for clock skew and for
// any other process on the same egress IP.
const MIN_INTERVAL_MS = Number(process.env.SEC_MIN_INTERVAL_MS ?? 125);

let chain: Promise<unknown> = Promise.resolve();
let lastStart = 0;

// Serialize every SEC request through one promise chain, spacing starts by at
// least MIN_INTERVAL_MS. Serialization (rather than a token bucket with
// parallelism) is deliberate: EDGAR is not the bottleneck in this pipeline,
// the GPU is, and a hard serial gate makes the rate limit impossible to
// violate by adding concurrency somewhere upstream.
function schedule<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = lastStart + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastStart = Date.now();
    return fn();
  });
  // Keep the chain alive even when a link rejects, or one failure stalls
  // every subsequent request forever.
  chain = run.catch(() => undefined);
  return run;
}

export class SecHttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`SEC fetch failed: ${status} (${url})`);
    this.name = 'SecHttpError';
  }
}

/**
 * Rate-limited GET against EDGAR with retry on transient failures.
 * Throws `SecHttpError` on a non-retryable HTTP status.
 */
export async function secFetch(url: string, opts: { attempts?: number } = {}): Promise<Response> {
  const attempts = opts.attempts ?? 4;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await schedule(() =>
        fetch(url, { headers: { 'User-Agent': SEC_USER_AGENT, 'Accept-Encoding': 'gzip, deflate' } }),
      );
      // 403 from EDGAR is how a rate-limit block presents. Back off hard
      // rather than hammering, which is what extends the block.
      if (res.status === 403 || res.status === 429 || res.status >= 500) {
        if (i === attempts - 1) throw new SecHttpError(res.status, url);
        const delay = 2000 * Math.pow(2, i);
        process.stderr.write(`[sec] ${res.status} on ${url}; retrying in ${delay / 1000}s\n`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      if (!res.ok) throw new SecHttpError(res.status, url);
      return res;
    } catch (e) {
      lastErr = e;
      // A non-2xx we already decided not to retry.
      if (e instanceof SecHttpError && e.status !== 403 && e.status !== 429 && e.status < 500) throw e;
      if (i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 2000 * Math.pow(2, i)));
    }
  }
  throw lastErr;
}

export async function secFetchText(url: string): Promise<string> {
  return (await secFetch(url)).text();
}

export async function secFetchJson<T>(url: string): Promise<T> {
  return (await secFetch(url)).json() as Promise<T>;
}

/** 404 is a normal answer for "does this optional artifact exist" probes. */
export async function secFetchTextOrNull(url: string): Promise<string | null> {
  try {
    return await secFetchText(url);
  } catch (e) {
    if (e instanceof SecHttpError && e.status === 404) return null;
    throw e;
  }
}

export { SEC_USER_AGENT };
