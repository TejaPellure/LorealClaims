// Central configuration. Every environment variable the API reads is parsed here, once.
import { join } from 'path';

export function loadConfig() {
  const env = process.env;
  return {
    port: Number(env.PORT ?? 3000),
    uploadDir: env.UPLOAD_DIR ?? join(process.cwd(), 'uploads'),
    maxUploadBytes: Number(env.MAX_UPLOAD_MB ?? 10) * 1024 * 1024,
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
