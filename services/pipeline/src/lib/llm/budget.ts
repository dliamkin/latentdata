import { utcIsoDate } from '@cert-tracker/core';

import { addDailyUsage, getDailyBudget, type DocClient } from '../repo/index.ts';
import { count } from '../telemetry.ts';
import { costMicroUsd, type Pricing, type TokenUsage } from './pricing.ts';

export interface BudgetDecision {
  date: string;
  allowed: boolean;
  spentMicroUsd: number;
  capMicroUsd: number;
}

// the second line of defence after the provider's own spend limit: once today's recorded cost
// reaches the cap, callers park their signals instead of calling
export interface BudgetGuard {
  check: (now: Date) => Promise<BudgetDecision>;
  record: (now: Date, model: string, usage: TokenUsage) => Promise<number>;
}

export interface BudgetGuardConfig {
  doc: DocClient;
  table: string;
  dailyCapUsd: number;
  pricing: Pricing;
}

export function createBudgetGuard(config: BudgetGuardConfig): BudgetGuard {
  const capMicroUsd = Math.round(config.dailyCapUsd * 1_000_000);
  return {
    check: async (now) => {
      const date = utcIsoDate(now);
      const today = await getDailyBudget(config.doc, config.table, date);
      return {
        date,
        allowed: today.costMicroUsd < capMicroUsd,
        spentMicroUsd: today.costMicroUsd,
        capMicroUsd,
      };
    },
    record: async (now, model, usage) => {
      const micro = costMicroUsd(config.pricing, model, usage);
      await addDailyUsage(
        config.doc,
        config.table,
        utcIsoDate(now),
        {
          tokensIn: usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens,
          tokensOut: usage.outputTokens,
          costMicroUsd: micro,
        },
        now,
      );
      count('LlmCostUsd', micro / 1_000_000);
      return micro;
    },
  };
}
