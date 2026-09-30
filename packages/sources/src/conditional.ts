import type { FetchOptions, FetchResponse, SourceState } from './types.ts';

// If-None-Match / If-Modified-Since from the stored state, and the new validators back out
export function conditionalHeaders(
  state: SourceState,
): Pick<FetchOptions, 'etag' | 'lastModified'> {
  return {
    ...(state.etag === undefined ? {} : { etag: state.etag }),
    ...(state.lastModified === undefined ? {} : { lastModified: state.lastModified }),
  };
}

export function validators(response: FetchResponse): Partial<SourceState> {
  const etag = response.headers.get('etag');
  const lastModified = response.headers.get('last-modified');
  return {
    ...(etag === null ? {} : { etag }),
    ...(lastModified === null ? {} : { lastModified }),
  };
}
