import { z } from 'zod';

import { CandidateSchema, type Candidate } from '@cert-tracker/core';

import type { AdminConfig } from './auth.ts';

export class AdminApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
  }

  // the token was refused: expired, revoked, or no longer an admin's
  get signedOut(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

const CandidateListSchema = z.object({ candidates: z.array(CandidateSchema) });

export type Decision = 'approve' | 'dismiss';

export interface AdminApi {
  listCandidates: () => Promise<Candidate[]>;
  decide: (candidateId: string, decision: Decision) => Promise<void>;
}

export function createAdminApi(
  config: AdminConfig,
  token: string,
  fetcher: typeof fetch = fetch,
): AdminApi {
  const call = async (path: string, method: 'GET' | 'POST'): Promise<unknown> => {
    let response: Response;
    try {
      response = await fetcher(`${config.apiBaseUrl}${path}`, {
        method,
        headers: { authorization: `Bearer ${token}` },
      });
    } catch {
      throw new AdminApiError(0, 'The admin API could not be reached.');
    }
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      // API Gateway says `message`, the handler says `error`
      const detail = body as { error?: unknown; message?: unknown } | null;
      const reason = typeof detail?.error === 'string' ? detail.error : detail?.message;
      throw new AdminApiError(
        response.status,
        typeof reason === 'string' ? reason : `The admin API answered ${String(response.status)}.`,
      );
    }
    return body;
  };

  return {
    listCandidates: async () =>
      // parsed, not trusted: the same schema the pipeline wrote these with
      CandidateListSchema.parse(await call('/admin/candidates?stage=verified', 'GET')).candidates,
    decide: async (candidateId, decision) => {
      await call(`/admin/candidates/${encodeURIComponent(candidateId)}/${decision}`, 'POST');
    },
  };
}
