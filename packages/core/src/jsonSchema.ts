import { z } from 'zod';

import { OfferSchema, SnapshotSchema } from './schemas.ts';

// refinements (cost iff partial, date order) are not expressible in JSON Schema; the
// generated files are documentation and editor tooling, zod remains the validator
export function generateJsonSchemas(): Record<'offer' | 'snapshot', Record<string, unknown>> {
  const options = { target: 'draft-2020-12' } as const;
  return {
    offer: z.toJSONSchema(OfferSchema, options),
    snapshot: z.toJSONSchema(SnapshotSchema, options),
  };
}
