import { AdapterError } from './errors.ts';
import { withRetry, type RetryOptions } from './retry.ts';

export interface HttpResponse {
  status: number;
  headers: Headers;
  text: string;
  notModified: boolean;
}

export interface HttpGetOptions {
  headers?: Record<string, string>;
  etag?: string;
  lastModified?: string;
  // body is cut here so a huge page can't fill the function's memory
  maxBytes?: number;
}

export interface HttpClient {
  get: (url: string, options?: HttpGetOptions) => Promise<HttpResponse>;
}

export interface HttpClientConfig {
  userAgent: string;
  timeoutMs?: number;
  retry?: Partial<RetryOptions>;
  fetchImpl?: typeof fetch;
}

const ADAPTER = 'http';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 2_000_000;

function retryAfterMs(headers: Headers): number | undefined {
  const value = headers.get('retry-after');
  if (value === null) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

export function createHttpClient(config: HttpClientConfig): HttpClient {
  const fetchImpl = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retry: RetryOptions = { attempts: 3, baseDelayMs: 500, maxDelayMs: 5000, ...config.retry };

  const once = async (url: string, options: HttpGetOptions): Promise<HttpResponse> => {
    const headers: Record<string, string> = { 'user-agent': config.userAgent, ...options.headers };
    if (options.etag !== undefined) headers['if-none-match'] = options.etag;
    if (options.lastModified !== undefined) headers['if-modified-since'] = options.lastModified;

    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      throw new AdapterError(ADAPTER, timedOut ? 'timeout' : 'network', `GET ${url} failed`, {
        retryable: true,
        cause: error,
      });
    }

    if (response.status === 304) {
      return { status: 304, headers: response.headers, text: '', notModified: true };
    }
    if (response.status === 429) {
      const wait = retryAfterMs(response.headers);
      throw new AdapterError(ADAPTER, 'rate-limited', `GET ${url} was rate limited`, {
        // the caller cools the source down; hammering again from here would be rude
        retryable: false,
        status: 429,
        ...(wait === undefined ? {} : { retryAfterMs: wait }),
      });
    }
    if (response.status >= 500) {
      throw new AdapterError(ADAPTER, 'http', `GET ${url} returned ${String(response.status)}`, {
        retryable: true,
        status: response.status,
      });
    }

    const body = await response.text();
    const limit = options.maxBytes ?? DEFAULT_MAX_BYTES;
    return {
      status: response.status,
      headers: response.headers,
      text: body.length > limit ? body.slice(0, limit) : body,
      notModified: false,
    };
  };

  return {
    get: (url, options = {}) => withRetry(() => once(url, options), retry),
  };
}
