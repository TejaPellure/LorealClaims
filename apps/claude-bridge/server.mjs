// Claude bridge: a tiny HTTP server that turns `claude -p "<prompt>"` (Claude Code CLI) into an API.
//
// Why it exists: the CLI uses the host user's own Claude login, which a Docker container cannot reach.
// So this runs ON THE HOST (`npm run bridge`) and the NestJS container calls it over
// host.docker.internal. It has no npm dependencies; it only uses Node built-ins.
//
// Security: every request needs `Authorization: Bearer <CLAUDE_BRIDGE_TOKEN>` (treat the token like an API key:
// it lives in the git-ignored .env). The bridge listens on 127.0.0.1 by default, runs the CLI with all tools
// disabled (pure text-in / JSON-out) and never logs prompts.
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load ../../.env without a dependency (only fills variables that are not already set).
const envFile = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
}

const PORT = Number(process.env.BRIDGE_PORT ?? new URL(process.env.CLAUDE_BRIDGE_URL ?? 'http://x:8787').port ?? 8787) || 8787;
const HOST = process.env.BRIDGE_HOST ?? '127.0.0.1';
const TOKEN = process.env.CLAUDE_BRIDGE_TOKEN ?? '';
// On Windows the npm shim (claude.cmd) cannot be spawned without a shell, so use the bundled native binary.
function resolveClaudeBin() {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  if (process.platform === 'win32' && process.env.APPDATA) {
    const native = join(process.env.APPDATA, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
    if (existsSync(native)) return native;
  }
  return 'claude';
}
const CLAUDE_BIN = resolveClaudeBin();
const MAX_BODY_BYTES = 512 * 1024;
const RUN_TIMEOUT_MS = Number(process.env.CLAUDE_TIMEOUT_MS ?? 120000);

if (!TOKEN) {
  console.error('CLAUDE_BRIDGE_TOKEN is not set. Add it to .env (see .env.example) and restart.');
  process.exit(1);
}

const tokenMatches = (header = '') => {
  const given = Buffer.from(header.replace(/^Bearer\s+/i, ''));
  const expected = Buffer.from(TOKEN);
  return given.length === expected.length && timingSafeEqual(given, expected);
};

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

/** Runs `claude -p` once and returns the parsed CLI JSON envelope. */
function runClaude({ prompt, systemPrompt, jsonSchema, model }) {
  const args = ['-p', prompt, '--output-format', 'json', '--no-session-persistence', '--tools', ''];
  if (systemPrompt) args.push('--append-system-prompt', systemPrompt);
  if (jsonSchema) args.push('--json-schema', JSON.stringify(jsonSchema));
  if (model) args.push('--model', model);

  return new Promise((resolve, reject) => {
    // shell:false + argument array => no shell injection through prompt text.
    const child = spawn(CLAUDE_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(Object.assign(new Error('claude CLI timed out'), { code: 'TIMEOUT' }));
    }, RUN_TIMEOUT_MS);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`claude CLI exited with code ${code}: ${stderr.slice(0, 300) || 'no output'}`));
      }
    });
  });
}

createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { status: 'ok' });
    if (req.method !== 'POST' || req.url !== '/v1/complete') return send(res, 404, { error: 'Not found' });
    if (!tokenMatches(req.headers.authorization)) return send(res, 401, { error: 'Invalid bridge token' });

    const body = JSON.parse((await readBody(req)) || '{}');
    if (typeof body.prompt !== 'string' || !body.prompt) return send(res, 400, { error: '"prompt" is required' });

    const envelope = await runClaude(body);
    if (envelope.is_error) return send(res, 502, { error: String(envelope.result ?? 'claude reported an error').slice(0, 300) });

    send(res, 200, {
      structured: envelope.structured_output ?? null,
      text: typeof envelope.result === 'string' ? envelope.result : '',
      model: body.model ?? null,
      refusal: envelope.stop_reason === 'refusal',
    });
  } catch (error) {
    const timeout = error.code === 'TIMEOUT';
    console.error(`Bridge error: ${error.message}`); // message only: never the prompt
    send(res, timeout ? 504 : 500, { error: error.message });
  }
}).listen(PORT, HOST, () => console.log(`Claude bridge listening on http://${HOST}:${PORT} (token required)`));
