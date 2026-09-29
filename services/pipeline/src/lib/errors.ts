export type AdapterErrorKind =
  'timeout' | 'network' | 'http' | 'rate-limited' | 'invalid-response' | 'conflict';

export interface AdapterErrorDetails {
  retryable: boolean;
  status?: number;
  retryAfterMs?: number;
  cause?: unknown;
}

// the one error type every external adapter throws, so callers decide on `kind` and
// `retryable` instead of parsing messages
export class AdapterError extends Error {
  readonly adapter: string;
  readonly kind: AdapterErrorKind;
  readonly retryable: boolean;
  readonly status: number | undefined;
  readonly retryAfterMs: number | undefined;

  constructor(
    adapter: string,
    kind: AdapterErrorKind,
    message: string,
    details: AdapterErrorDetails,
  ) {
    super(
      `${adapter}: ${message}`,
      details.cause === undefined ? undefined : { cause: details.cause },
    );
    this.name = 'AdapterError';
    this.adapter = adapter;
    this.kind = kind;
    this.retryable = details.retryable;
    this.status = details.status;
    this.retryAfterMs = details.retryAfterMs;
  }
}

export function isAdapterError(error: unknown): error is AdapterError {
  return error instanceof AdapterError;
}
