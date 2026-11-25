// Assessment providers: a mock (deterministic, rule-based) and Claude (through the local CLI bridge).
// Both return an UNVALIDATED payload; the pipeline validates it before anything is saved or returned.
import { AssessmentProviderKind } from '@prisma/client';
import { AI_JSON_SCHEMA } from '../ai-schema';
import { evidenceFacts } from '../guardrails';
import { buildUserPrompt, SYSTEM_PROMPT } from '../prompt';
import { labelRelation } from '../scoring';
import { AiAssessment, EvidenceCandidate, EvidencePackage, ScoreResult } from '../types';

export interface ProviderInput {
  package: EvidencePackage;
  score: ScoreResult;
  /** Validation problems from a previous attempt, passed back so the model can correct itself. */
  feedback?: string[];
}

export interface ProviderOutput {
  payload: unknown;
  model: string;
  raw: unknown;
}

export interface AssessmentProvider {
  readonly kind: AssessmentProviderKind;
  generate(input: ProviderInput): Promise<ProviderOutput>;
}

/** Failure categories mapped to HTTP statuses by the service layer. */
export type ProviderErrorKind = 'UNAVAILABLE' | 'TIMEOUT' | 'REFUSAL' | 'BAD_RESPONSE';

export class ProviderError extends Error {
  constructor(public readonly kind: ProviderErrorKind, message: string) {
    super(message);
  }
}

// ───────────────────────────── Mock provider ─────────────────────────────

export const MOCK_MODEL = 'mock-rules-v1';

/**
 * Deterministic, evidence-aware stand-in for the LLM. It applies the same scientific rules in plain code
 * and is always labelled MOCK in the UI. It is NOT Claude and must never be presented as such.
 */
export class MockProvider implements AssessmentProvider {
  readonly kind = 'MOCK' as const;

  constructor(private readonly supportedMinScore: number) {}

  async generate({ package: pkg, score }: ProviderInput): Promise<ProviderOutput> {
    const { claim, formulation, evidence } = pkg;
    const facts = evidenceFacts(evidence);
    const cite = (e: EvidenceCandidate) => `"${e.title}"`;

    let verdict: AiAssessment['verdict'] = 'INCONCLUSIVE';
    if (facts.exactSupport.length && !facts.exactContradiction.length && score.total >= this.supportedMinScore) verdict = 'SUPPORTED';
    else if (facts.exactContradiction.length || (facts.exactShortfall.length && !facts.exactSupport.length)) verdict = 'NOT_SUPPORTED';

    const ingredientLevel = evidence.filter((e) => e.relation === 'INGREDIENT');
    const finished = evidence.filter((e) => e.relation !== 'INGREDIENT');
    const contradictory = evidence.filter((e) => e.role === 'CONTRADICTORY');
    const anchor = evidence.find((e) => e.id === score.anchorEvidenceId);

    const describe = (e: EvidenceCandidate) => {
      const conc = e.testedConcentration != null ? ` Tested at ${e.testedConcentration}% vs ${e.formulatedConcentration ?? 'n/a'}% in this formulation.` : '';
      return `${e.studyDesign}${e.sampleSize ? `, n=${e.sampleSize}` : ''}, ${e.durationWeeks ?? '?'} weeks, population: ${e.population}.${conc} ${labelRelation(e.relation)}.`;
    };

    const missing: string[] = [];
    const tests: string[] = [];
    if (!facts.exactSupport.length && !facts.exactContradiction.length) {
      missing.push(`No finished-product study of ${formulation.productName} v${formulation.version} measuring "${claim.measurementEndpoint}".`);
      tests.push(`Run a vehicle-controlled ${claim.durationWeeks}-week clinical study of ${formulation.productName} v${formulation.version} measuring ${claim.measurementEndpoint} in ${claim.targetPopulation}.`);
    }
    if (anchor && anchor.factors.duration < 1) {
      missing.push(`No evidence measured at the claimed ${claim.durationWeeks}-week timepoint (closest study: ${anchor.durationWeeks ?? 'unknown'} weeks).`);
    }
    if (anchor && anchor.factors.concentration < 1) {
      missing.push('Tested ingredient concentration does not match the formulated concentration.');
      tests.push('Confirm efficacy at the formulated ingredient concentration (dose-matched study).');
    }
    if (anchor && anchor.factors.population < 0.6) {
      missing.push(`Study population differs from the claimed population (${claim.targetPopulation}).`);
    }
    if (facts.exactShortfall.length) {
      missing.push(`Reported finished-product effect is smaller than the claimed ${claim.targetValue}${claim.measurementUnit}.`);
      tests.push('Re-test with an adequately powered study, or revise the claim magnitude to what the data support.');
    }
    if (contradictory.length) tests.push('Investigate the neutral/negative results (power, population, formulation differences) before relying on this claim.');

    const result: AiAssessment = {
      verdict,
      summary: summaryFor(verdict, claim.title, formulation.productName, formulation.version),
      strengths: [
        ...facts.exactSupport.map((e) => `Directly applicable finished-product evidence: ${cite(e)}.`),
        ...(anchor && !facts.exactSupport.length ? [`Best available support is ${labelRelation(anchor.relation)}: ${cite(anchor)}.`] : []),
      ],
      limitations: [
        ...(ingredientLevel.length && !facts.exactSupport.length ? ['Ingredient-level evidence does not by itself prove the finished formulation delivers the benefit.'] : []),
        ...evidence.filter((e) => e.role !== 'CONTEXT').slice(0, 4).map((e) => `${cite(e)}: ${e.limitations}`),
      ],
      ingredientEvidenceAnalysis: ingredientLevel.map((e) => ({ evidenceId: e.id, note: `${e.effectDirection === 'POSITIVE' ? 'Supportive' : 'Neutral/negative'} ingredient-level result. ${describe(e)}` })),
      formulationEvidenceAnalysis: finished.map((e) => ({ evidenceId: e.id, note: `${e.categoryMatch ? '' : 'Context only (different endpoint). '}${describe(e)}` })),
      contradictoryEvidence: contradictory.map((e) => ({ evidenceId: e.id, note: `Result: ${e.resultsSummary}` })),
      missingEvidence: missing,
      recommendedTests: tests,
      evidenceReferences: evidence.map((e) => e.id),
      reasoning: reasoningFor(pkg, score, verdict, facts.exactSupport.length, ingredientLevel.length, finished.length, contradictory.length),
    };
    return { payload: result, model: MOCK_MODEL, raw: { note: 'Generated by deterministic mock rules; no LLM was called.' } };
  }
}

function summaryFor(verdict: string, claimTitle: string, product: string, version: number): string {
  const subject = `"${claimTitle}" for ${product} v${version}`;
  if (verdict === 'SUPPORTED') return `[Mock] The available finished-product evidence supports ${subject} within the assessed criteria.`;
  if (verdict === 'NOT_SUPPORTED') return `[Mock] The available evidence contradicts or does not reach the magnitude of ${subject}.`;
  return `[Mock] The available evidence is insufficient to decide whether ${subject} is justified.`;
}

function reasoningFor(pkg: EvidencePackage, score: ScoreResult, verdict: string, exact: number, ingredient: number, finished: number, contradictory: number) {
  return [
    `[Mock provider - deterministic rules, not an LLM] ${evidenceCounts(ingredient, finished, contradictory)}`,
    exact
      ? `${exact} finished-product record(s) for this exact formulation version support the claim endpoint.`
      : 'No supporting finished-product study of this exact formulation version was found, so ingredient or other-formulation evidence cannot establish the finished-product benefit.',
    `Deterministic evidence sufficiency score: ${score.total}/100 (${score.rubricVersion}). Verdict: ${verdict}.`,
  ].join(' ');
}

const evidenceCounts = (ingredient: number, finished: number, contradictory: number) =>
  `Reviewed ${ingredient} ingredient-level and ${finished} finished-product record(s); ${contradictory} neutral/contradictory.`;

// ───────────────────────────── Claude provider ─────────────────────────────

export interface ClaudeProviderConfig {
  bridgeUrl: string;
  bridgeToken: string;
  model: string;
  timeoutMs: number;
}

/**
 * Calls the local Claude bridge (apps/claude-bridge), which runs `claude -p` on the host.
 * The bridge token and URL stay on the server; the browser never sees them.
 */
export class ClaudeProvider implements AssessmentProvider {
  readonly kind = 'CLAUDE' as const;

  constructor(private readonly config: ClaudeProviderConfig) {}

  async generate({ package: pkg, feedback }: ProviderInput): Promise<ProviderOutput> {
    if (!this.config.bridgeToken) throw new ProviderError('UNAVAILABLE', 'CLAUDE_BRIDGE_TOKEN is not configured.');

    const prompt = feedback?.length
      ? `${buildUserPrompt(pkg)}\n\nYour previous answer failed validation. Fix these problems:\n- ${feedback.join('\n- ')}`
      : buildUserPrompt(pkg);

    const response = await this.callBridge({ systemPrompt: SYSTEM_PROMPT, prompt, jsonSchema: AI_JSON_SCHEMA, model: this.config.model });
    if (response.refusal) throw new ProviderError('REFUSAL', 'Claude declined to assess this request.');
    return { payload: response.structured ?? parseJsonText(response.text), model: response.model ?? this.config.model, raw: response };
  }

  private async callBridge(body: object): Promise<BridgeResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const res = await fetch(`${this.config.bridgeUrl}/v1/complete`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.config.bridgeToken}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (res.status === 401 || res.status === 403) throw new ProviderError('UNAVAILABLE', 'The Claude bridge rejected the configured token.');
      if (!res.ok) throw new ProviderError('UNAVAILABLE', `The Claude bridge returned HTTP ${res.status}.`);
      return (await res.json()) as BridgeResponse;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if ((error as Error).name === 'AbortError') throw new ProviderError('TIMEOUT', `Claude did not answer within ${this.config.timeoutMs} ms.`);
      throw new ProviderError('UNAVAILABLE', `Cannot reach the Claude bridge at ${this.config.bridgeUrl}. Is it running on the host?`);
    } finally {
      clearTimeout(timer);
    }
  }
}

interface BridgeResponse {
  structured?: unknown;
  text?: string;
  model?: string;
  refusal?: boolean;
}

/** Fallback when the CLI returns text instead of structured output: extract the JSON object. */
export function parseJsonText(text: string | undefined): unknown {
  if (!text) throw new ProviderError('BAD_RESPONSE', 'Claude returned an empty response.');
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    throw new ProviderError('BAD_RESPONSE', 'Claude did not return valid JSON.');
  }
}
