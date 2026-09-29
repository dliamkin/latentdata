import { isAdapterError } from './errors.ts';

export interface RetryOptions {
  // total tries, including the first
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  isRetryable?: (error: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const defaultIsRetryable = (error: unknown): boolean => isAdapterError(error) && error.retryable;

// full jitter: a random wait up to the exponential cap, so retries from several Lambdas
// don't line up on the same instant
export function backoffDelay(attempt: number, options: RetryOptions): number {
  const random = options.random ?? Math.random;
  const cap = Math.min(options.maxDelayMs, options.baseDelayMs * 2 ** (attempt - 1));
  return Math.floor(random() * cap);
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const isRetryable = options.isRetryable ?? defaultIsRetryable;
  const sleep = options.sleep ?? defaultSleep;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      if (attempt >= options.attempts || !isRetryable(error)) throw error;
      const hinted = isAdapterError(error) ? error.retryAfterMs : undefined;
      await sleep(Math.min(hinted ?? backoffDelay(attempt, options), options.maxDelayMs));
    }
  }
}
