import { z } from 'zod';

// SSM /llm/pricing: prices per million tokens for each configured model id, so a model change
// never needs a deploy. Web search is billed per request on top of tokens.
export const PricingSchema = z.record(
  z.string(),
  z.object({
    inputPerMTok: z.number().nonnegative(),
    outputPerMTok: z.number().nonnegative(),
    cacheReadPerMTok: z.number().nonnegative().optional(),
    cacheWritePerMTok: z.number().nonnegative().optional(),
    webSearchPerRequest: z.number().nonnegative().optional(),
  }),
);

export type Pricing = z.infer<typeof PricingSchema>;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  webSearchRequests: number;
}

export function parsePricing(json: string): Pricing {
  return PricingSchema.parse(JSON.parse(json));
}

// integer micro-dollars; unknown model is an error because an unpriced call is an unbudgeted one
export function costMicroUsd(pricing: Pricing, model: string, usage: TokenUsage): number {
  const price = pricing[model];
  if (price === undefined) throw new Error(`no pricing for model ${model}`);
  const perToken = (tokens: number, perMTok: number): number => tokens * perMTok;
  const usd =
    (perToken(usage.inputTokens, price.inputPerMTok) +
      perToken(usage.outputTokens, price.outputPerMTok) +
      perToken(usage.cacheReadTokens, price.cacheReadPerMTok ?? price.inputPerMTok / 10) +
      perToken(usage.cacheWriteTokens, price.cacheWritePerMTok ?? price.inputPerMTok * 1.25)) /
      1_000_000 +
    usage.webSearchRequests * (price.webSearchPerRequest ?? 0.01);
  return Math.ceil(usd * 1_000_000);
}
