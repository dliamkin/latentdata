import type { Source } from '@cert-tracker/core';

export interface SignalItem {
  url: string;
  title: string;
  // capped at 2000 chars by every adapter; the signal item has to stay small
  excerpt: string;
  publishedAt: string | null;
}

export interface FetchOptions {
  headers?: Record<string, string>;
  etag?: string;
  lastModified?: string;
  maxBytes?: number;
}

export interface FetchResponse {
  status: number;
  headers: Headers;
  text: string;
  notModified: boolean;
}

// the shape of the pipeline's HTTP adapter, declared here so this package depends on nothing
export interface Fetcher {
  get: (url: string, options?: FetchOptions) => Promise<FetchResponse>;
}

export interface AdapterContext {
  http: Fetcher;
  now: Date;
  githubToken?: string;
}

export type SourceState = Source['state'];

export interface AdapterResult {
  items: SignalItem[];
  // merged over the stored state by the caller; adapters only return what changed
  state: Partial<SourceState>;
}

export interface SourceAdapter {
  readonly kind: Source['kind'];
  fetch: (source: Source, context: AdapterContext) => Promise<AdapterResult>;
}

export type SourceErrorKind = 'blocked' | 'http' | 'parse' | 'unsupported';

export class SourceError extends Error {
  readonly kind: SourceErrorKind;
  readonly status: number | undefined;

  constructor(kind: SourceErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'SourceError';
    this.kind = kind;
    this.status = status;
  }
}

export const EXCERPT_MAX = 2000;

export function clip(text: string, max = EXCERPT_MAX): string {
  return text.length > max ? text.slice(0, max) : text;
}
