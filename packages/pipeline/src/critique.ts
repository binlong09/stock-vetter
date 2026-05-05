import { z } from 'zod';
import {
  CritiqueFinding,
  StressTestFinding,
  ValueChecklist,
  type Critiques,
  type ExtractedAnalysis,
  type FinancialSnapshot,
} from '@stock-vetter/schema';
import { llmCallJson, type CostTracker } from './llm.js';
import { loadPrompt, type PromptName } from './prompts.js';

const FindingArray = z.array(CritiqueFinding);
const StressTestArray = z.array(StressTestFinding);

function snapshotJson(snap: FinancialSnapshot | null): string {
  return JSON.stringify(snap, null, 2);
}

async function runFindingCritique(opts: {
  prompt: PromptName;
  stage: string;
  userMessage: string;
  tracker: CostTracker;
}) {
  const system = await loadPrompt(opts.prompt);
  return llmCallJson({
    stage: opts.stage,
    systemPrompt: system,
    userMessage: opts.userMessage,
    schema: FindingArray,
    maxTokens: 4096,
    tracker: opts.tracker,
  });
}

async function consistencyCritique(
  extraction: ExtractedAnalysis,
  tracker: CostTracker,
) {
  return runFindingCritique({
    prompt: 'critique-consistency',
    stage: 'critique-consistency',
    userMessage: `EXTRACTED_ANALYSIS:\n${JSON.stringify(extraction, null, 2)}`,
    tracker,
  });
}

async function stressTestCritique(
  extraction: ExtractedAnalysis,
  snapshot: FinancialSnapshot | null,
  tracker: CostTracker,
) {
  const system = await loadPrompt('critique-stress-test');
  const userMessage = [
    `EXTRACTED_ANALYSIS:\n${JSON.stringify(extraction, null, 2)}`,
    '',
    `FINANCIAL_SNAPSHOT:\n${snapshotJson(snapshot)}`,
  ].join('\n');
  return llmCallJson({
    stage: 'critique-stress-test',
    systemPrompt: system,
    userMessage,
    schema: StressTestArray,
    maxTokens: 4096,
    tracker,
  });
}

async function compsCritique(
  extraction: ExtractedAnalysis,
  snapshot: FinancialSnapshot | null,
  peers: FinancialSnapshot[],
  tracker: CostTracker,
) {
  if (!peers.length) {
    // Per user decision: surface as a config gap instead of running a guess.
    return [
      {
        type: 'missing' as const,
        topic: 'Comps critique skipped',
        analystClaim: 'N/A',
        llmPushback:
          'No peer set is configured for this ticker in packages/pipeline/src/comps.ts. Add peers to enable the comps critique.',
        severity: 'nit' as const,
        evidence: 'config gap',
      },
    ];
  }
  const userMessage = [
    `EXTRACTED_ANALYSIS:\n${JSON.stringify(extraction, null, 2)}`,
    '',
    `TARGET_FINANCIAL_SNAPSHOT:\n${snapshotJson(snapshot)}`,
    '',
    `PEER_FINANCIAL_SNAPSHOTS:\n${JSON.stringify(peers, null, 2)}`,
  ].join('\n');
  return runFindingCritique({
    prompt: 'critique-comps',
    stage: 'critique-comps',
    userMessage,
    tracker,
  });
}

async function missingRisksCritique(
  extraction: ExtractedAnalysis,
  snapshot: FinancialSnapshot | null,
  tracker: CostTracker,
) {
  const userMessage = [
    `EXTRACTED_ANALYSIS:\n${JSON.stringify(extraction, null, 2)}`,
    '',
    `FINANCIAL_SNAPSHOT:\n${snapshotJson(snapshot)}`,
  ].join('\n');
  return runFindingCritique({
    prompt: 'critique-missing-risks',
    stage: 'critique-missing-risks',
    userMessage,
    tracker,
  });
}

async function valueChecklistCritique(
  extraction: ExtractedAnalysis,
  snapshot: FinancialSnapshot | null,
  tracker: CostTracker,
) {
  const system = await loadPrompt('critique-value-checklist');
  const userMessage = [
    `EXTRACTED_ANALYSIS:\n${JSON.stringify(extraction, null, 2)}`,
    '',
    `FINANCIAL_SNAPSHOT:\n${snapshotJson(snapshot)}`,
  ].join('\n');
  return llmCallJson({
    stage: 'critique-value-checklist',
    systemPrompt: system,
    userMessage,
    schema: ValueChecklist,
    maxTokens: 2048,
    tracker,
  });
}

export async function runCritiques(opts: {
  extraction: ExtractedAnalysis;
  snapshot: FinancialSnapshot | null;
  peers: FinancialSnapshot[];
  tracker: CostTracker;
}): Promise<Critiques> {
  const [consistency, stressTest, comps, missingRisks, valueChecklist] = await Promise.all([
    consistencyCritique(opts.extraction, opts.tracker),
    stressTestCritique(opts.extraction, opts.snapshot, opts.tracker),
    compsCritique(opts.extraction, opts.snapshot, opts.peers, opts.tracker),
    missingRisksCritique(opts.extraction, opts.snapshot, opts.tracker),
    valueChecklistCritique(opts.extraction, opts.snapshot, opts.tracker),
  ]);
  return { consistency, stressTest, comps, missingRisks, valueChecklist };
}
