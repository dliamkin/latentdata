import type { HttpClient } from './http.ts';

const MIN_INTERVAL_MS = 1000;

// at most one request a second per host, however many sources or pages share it; requests
// to different hosts still run side by side
export function politeHttp(
  http: HttpClient,
  sleep: (ms: number) => Promise<void>,
  clock: () => number = Date.now,
): HttpClient {
  const lastByHost = new Map<string, number>();
  const chains = new Map<string, Promise<void>>();

  const turn = (host: string): Promise<void> => {
    const previous = chains.get(host) ?? Promise.resolve();
    const next = previous.then(async () => {
      const last = lastByHost.get(host);
      if (last !== undefined) {
        const wait = MIN_INTERVAL_MS - (clock() - last);
        if (wait > 0) await sleep(wait);
      }
      lastByHost.set(host, clock());
    });
    chains.set(host, next);
    return next;
  };

  return {
    get: async (url, options) => {
      let host: string;
      try {
        host = new URL(url).hostname;
      } catch {
        host = url;
      }
      await turn(host);
      return http.get(url, options);
    },
  };
}
