import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Prompts live at the repo root (../../prompts/ relative to the package),
// per README's resolution. Resolved from this source file:
//   packages/pipeline/src/prompts.ts → ../../../prompts/
const HERE = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = resolve(HERE, '../../../prompts');

export type PromptName =
  | 'normalize'
  | 'extract'
  | 'critique-consistency'
  | 'critique-stress-test'
  | 'critique-comps'
  | 'critique-missing-risks'
  | 'critique-value-checklist'
  | 'score'
  | 'primary-source-checklist'
  | 'primary-source-skeptic'
  | 'primary-source-judge'
  | 'meta-card';

const cache = new Map<PromptName, string>();

export async function loadPrompt(name: PromptName): Promise<string> {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;
  const path = resolve(PROMPTS_DIR, `${name}.md`);
  const content = await readFile(path, 'utf-8');
  cache.set(name, content);
  return content;
}
