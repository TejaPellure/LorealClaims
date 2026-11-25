// The assessment provider: Claude, reached through the local Claude bridge (apps/claude-bridge).
// It returns an UNVALIDATED payload; the pipeline validates it before anything is saved or returned.
import { AI_JSON_SCHEMA } from '../ai-schema';
import { buildUserPrompt, SYSTEM_PROMPT } from '../prompt';
import { EvidencePackage, ScoreResult } from '../types';

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

/** Anything that can turn an evidence package into a structured assessment (Claude today). */
export interface AssessmentProvider {
  generate(input: ProviderInput): Promise<ProviderOutput>;
}

/** Failure categories mapped to HTTP statuses by the pipeline. */
export type ProviderErrorKind = 'UNAVAILABLE' | 'TIMEOUT' | 'REFUSAL' | 'BAD_RESPONSE';

export class ProviderError extends Error {
  constructor(public readonly kind: ProviderErrorKind, message: string) {
    super(message);
  }
}

export interface ClaudeProviderConfig {
  bridgeUrl: string;
  bridgeToken: string;
  model: string;
  timeoutMs: number;
}

/**
 * Calls the local Claude bridge, which runs `claude -p` on the host.
 * The bridge token and URL stay on the server; the browser never sees them.
 */
export class ClaudeProvider implements AssessmentProvider {
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
      if (!res.ok) {
        // The bridge puts the CLI's own message in { error } (for example "not logged in"): surface it.
        const detail = ((await res.json().catch(() => null)) as { error?: string } | null)?.error;
        throw new ProviderError('UNAVAILABLE', `Claude could not complete the request: ${detail ?? `bridge returned HTTP ${res.status}`}`);
      }
      return (await res.json()) as BridgeResponse;
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if ((error as Error).name === 'AbortError') throw new ProviderError('TIMEOUT', `Claude did not answer within ${Math.round(this.config.timeoutMs / 1000)} seconds.`);
      throw new ProviderError('UNAVAILABLE', `Cannot reach the Claude bridge at ${this.config.bridgeUrl}. Start it on the host with "npm run bridge".`);
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
