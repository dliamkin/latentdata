import searchText from '../../prompts/search.md';
import triageText from '../../prompts/triage.md';
import verifyText from '../../prompts/verify.md';

export interface Prompt {
  version: string;
  modelClass: 'haiku' | 'sonnet';
  system: string;
}

// markdown with a small YAML front-matter block: version and model class, then the prompt
export function parsePrompt(text: string): Prompt {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
  if (match === null) throw new Error('prompt file has no front-matter');
  const header = Object.fromEntries(
    (match[1] ?? '')
      .split(/\r?\n/)
      .map((line) => line.split(':'))
      .filter((parts) => parts.length >= 2)
      .map(([key, ...rest]) => [key?.trim() ?? '', rest.join(':').trim()]),
  );
  const version = header.version;
  const modelClass = header.modelClass;
  if (version === undefined || version === '') throw new Error('prompt front-matter needs version');
  if (modelClass !== 'haiku' && modelClass !== 'sonnet') {
    throw new Error('prompt front-matter needs modelClass haiku|sonnet');
  }
  return { version, modelClass, system: (match[2] ?? '').trim() };
}

export const PROMPTS = {
  triage: parsePrompt(triageText),
  verify: parsePrompt(verifyText),
  search: parsePrompt(searchText),
} as const;
