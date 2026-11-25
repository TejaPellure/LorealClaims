// Central configuration. Every environment variable the API reads is parsed here, once.
import { join } from 'path';

export type ProviderName = 'mock' | 'claude';

/** Scoring rubric weights; must add up to 100. See docs/AI_ASSESSMENT_ENGINE.md. */
export interface ScoringWeights {
  methodologicalQuality: number;
  directRelevance: number;
  concentrationSimilarity: number;
  endpointMatch: number;
  durationMatch: number;
  populationSimilarity: number;
  finishedProductTesting: number;
  consistency: number;
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  methodologicalQuality: 15,
  directRelevance: 15,
  concentrationSimilarity: 12,
  endpointMatch: 15,
  durationMatch: 10,
  populationSimilarity: 8,
  finishedProductTesting: 15,
  consistency: 10,
};

function parseWeights(raw: string | undefined): ScoringWeights {
  if (!raw) return DEFAULT_SCORING_WEIGHTS;
  try {
    const parsed = { ...DEFAULT_SCORING_WEIGHTS, ...JSON.parse(raw) } as ScoringWeights;
    const total = Object.values(parsed).reduce((sum, w) => sum + Number(w), 0);
    if (Math.abs(total - 100) > 0.001) throw new Error(`weights sum to ${total}, expected 100`);
    return parsed;
  } catch (error) {
    // A bad override must never silently change scoring: fall back to the documented defaults.
    console.warn(`Invalid SCORING_WEIGHTS ignored (${(error as Error).message}); using defaults.`);
    return DEFAULT_SCORING_WEIGHTS;
  }
}

export function loadConfig() {
  const env = process.env;
  const provider = (env.ASSESSMENT_PROVIDER ?? 'mock').toLowerCase() === 'claude' ? 'claude' : 'mock';
  return {
    port: Number(env.PORT ?? 3000),
    uploadDir: env.UPLOAD_DIR ?? join(process.cwd(), 'uploads'),
    maxUploadBytes: Number(env.MAX_UPLOAD_MB ?? 10) * 1024 * 1024,
    assessment: {
      provider: provider as ProviderName,
      weights: parseWeights(env.SCORING_WEIGHTS),
      /** Minimum score before the backend lets a SUPPORTED verdict stand. */
      supportedMinScore: Number(env.SUPPORTED_MIN_SCORE ?? 60),
    },
    claude: {
      bridgeUrl: env.CLAUDE_BRIDGE_URL ?? 'http://host.docker.internal:8787',
      bridgeToken: env.CLAUDE_BRIDGE_TOKEN ?? '',
      model: env.CLAUDE_MODEL ?? 'sonnet',
      timeoutMs: Number(env.CLAUDE_TIMEOUT_MS ?? 120000),
    },
  };
}

export type AppConfig = ReturnType<typeof loadConfig>;

/** Injection token so services can receive the config object. */
export const APP_CONFIG = 'APP_CONFIG';
