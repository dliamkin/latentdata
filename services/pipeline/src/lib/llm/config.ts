import { readParameter } from '../secrets.ts';
import { parsePricing, type Pricing } from './pricing.ts';

export interface LlmConfig {
  apiKey: string;
  triageModel: string;
  verifyModel: string;
  pricing: Pricing;
  dailyCapUsd: number;
}

// everything about the models comes from SSM so a price or model change is a parameter edit,
// not a deploy; Powertools caches the reads for a few minutes
export async function readLlmConfig(ssmPrefix: string): Promise<LlmConfig> {
  const [apiKey, triageModel, verifyModel, pricing, cap] = await Promise.all([
    readParameter(`${ssmPrefix}/anthropic/apiKey`),
    readParameter(`${ssmPrefix}/llm/triageModel`),
    readParameter(`${ssmPrefix}/llm/verifyModel`),
    readParameter(`${ssmPrefix}/llm/pricing`),
    readParameter(`${ssmPrefix}/llm/dailyCapUsd`),
  ]);
  const dailyCapUsd = Number(cap);
  if (!Number.isFinite(dailyCapUsd) || dailyCapUsd <= 0) {
    throw new Error(`${ssmPrefix}/llm/dailyCapUsd must be a positive number`);
  }
  return { apiKey, triageModel, verifyModel, pricing: parsePricing(pricing), dailyCapUsd };
}
