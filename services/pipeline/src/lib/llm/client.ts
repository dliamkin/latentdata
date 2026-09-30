import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

import { AdapterError } from '../errors.ts';
import type { TokenUsage } from './pricing.ts';
import { PROMPTS } from './prompts.ts';
import {
  ExtractionSchema,
  TriageResultSchema,
  type Extraction,
  type OfferIndexEntry,
  type TriageInput,
  type TriageVerdict,
} from './schemas.ts';

const ADAPTER = 'anthropic';
const TIMEOUT_MS = 90_000;
const TRIAGE_MAX_TOKENS = 2048;
const EXTRACT_MAX_TOKENS = 4096;
const SEARCH_MAX_TOKENS = 2048;
const SEARCH_MAX_USES = 3;

export interface LlmCall<T> {
  result: T;
  usage: TokenUsage;
  promptVersion: string;
  model: string;
}

export interface ExtractInput {
  signal: { url: string; title: string };
  pageText: string;
  offers: OfferIndexEntry[];
  searchNotes?: string;
}

export interface LlmClient {
  triage: (model: string, items: TriageInput[]) => Promise<LlmCall<TriageVerdict[]>>;
  // null when the model's answer failed the schema; the raw text rides along for the log
  extract: (
    model: string,
    input: ExtractInput,
  ) => Promise<LlmCall<Extraction | null> & { rawText: string }>;
  search: (model: string, input: ExtractInput) => Promise<LlmCall<string>>;
}

function usageOf(usage: Anthropic.Usage): TokenUsage {
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
    webSearchRequests: usage.server_tool_use?.web_search_requests ?? 0,
  };
}

function toAdapterError(error: unknown): AdapterError {
  if (error instanceof Anthropic.RateLimitError) {
    return new AdapterError(ADAPTER, 'rate-limited', 'rate limited', {
      retryable: true,
      status: 429,
      cause: error,
    });
  }
  if (error instanceof Anthropic.APIConnectionError) {
    const timedOut = error instanceof Anthropic.APIConnectionTimeoutError;
    return new AdapterError(ADAPTER, timedOut ? 'timeout' : 'network', 'request failed', {
      retryable: true,
      cause: error,
    });
  }
  if (error instanceof Anthropic.APIError) {
    const status = typeof error.status === 'number' ? error.status : undefined;
    return new AdapterError(ADAPTER, 'http', `API error ${String(status ?? '')}`, {
      retryable: status !== undefined && status >= 500,
      ...(status === undefined ? {} : { status }),
      cause: error,
    });
  }
  return new AdapterError(ADAPTER, 'network', 'unexpected failure', {
    retryable: false,
    cause: error,
  });
}

// the stable part of every request goes first and gets the cache marker; whatever varies per
// call sits in the user turn after it
function system(text: string): Anthropic.TextBlockParam[] {
  return [{ type: 'text', text, cache_control: { type: 'ephemeral' } }];
}

function extractionUserTurn(input: ExtractInput): string {
  const index = input.offers
    .map((o) => `${o.id} | ${o.vendor} | ${o.name} | ends ${o.windowEnd ?? 'n/a'}`)
    .join('\n');
  const parts = [
    `Signal: ${input.signal.title}\nSignal URL: ${input.signal.url}`,
    `Known offers (id | vendor | name | window end):\n${index === '' ? '(none)' : index}`,
    `Page text:\n${input.pageText}`,
  ];
  if (input.searchNotes !== undefined) parts.push(`Web search notes:\n${input.searchNotes}`);
  return parts.join('\n\n');
}

export function createLlmClient(apiKey: string): LlmClient {
  const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 2 });

  return {
    triage: async (model, items) => {
      const prompt = PROMPTS.triage;
      try {
        const response = await client.messages.parse({
          model,
          max_tokens: TRIAGE_MAX_TOKENS,
          system: system(prompt.system),
          messages: [{ role: 'user', content: JSON.stringify({ items }) }],
          output_config: { format: zodOutputFormat(TriageResultSchema) },
        });
        if (response.stop_reason === 'refusal' || response.parsed_output === null) {
          throw new AdapterError(ADAPTER, 'invalid-response', 'triage answer unusable', {
            retryable: false,
          });
        }
        return {
          result: response.parsed_output.verdicts,
          usage: usageOf(response.usage),
          promptVersion: prompt.version,
          model,
        };
      } catch (error) {
        throw error instanceof AdapterError ? error : toAdapterError(error);
      }
    },

    extract: async (model, input) => {
      const prompt = PROMPTS.verify;
      try {
        const response = await client.messages.parse({
          model,
          max_tokens: EXTRACT_MAX_TOKENS,
          system: system(prompt.system),
          messages: [{ role: 'user', content: extractionUserTurn(input) }],
          output_config: { format: zodOutputFormat(ExtractionSchema), effort: 'medium' },
        });
        const rawText = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('\n');
        return {
          result: response.stop_reason === 'refusal' ? null : response.parsed_output,
          rawText,
          usage: usageOf(response.usage),
          promptVersion: prompt.version,
          model,
        };
      } catch (error) {
        throw toAdapterError(error);
      }
    },

    // a separate plain-text call: search results carry citations, which a structured-output
    // request refuses, so the findings come back as notes for the extraction call to read
    search: async (model, input) => {
      const prompt = PROMPTS.search;
      try {
        const response = await client.messages.create({
          model,
          max_tokens: SEARCH_MAX_TOKENS,
          system: system(prompt.system),
          tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: SEARCH_MAX_USES }],
          messages: [{ role: 'user', content: extractionUserTurn(input) }],
        });
        const notes = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('\n')
          .trim();
        return {
          result: notes,
          usage: usageOf(response.usage),
          promptVersion: prompt.version,
          model,
        };
      } catch (error) {
        throw toAdapterError(error);
      }
    },
  };
}
