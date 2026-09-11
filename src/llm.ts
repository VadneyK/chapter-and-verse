/**
 * The model client the generator agent talks to, with a recorded-response
 * mode so the demo runs with no API key and gives the same answer twice.
 *
 * Two implementations behind one interface:
 *
 *   AnthropicLlm  real calls to the Claude API. Every response is written to
 *                 `hackathon/fixtures/llm/<hash>.json`, keyed by a hash of the
 *                 request, so a live run doubles as a recording session.
 *   ReplayLlm     serves those recordings back. No key, no network, no cost,
 *                 and deterministic, which is what you want when a demo is
 *                 being run in front of a room on conference wifi.
 *
 * `selectLlm()` picks replay unless credentials are present, so
 * `npm run generate` works on a laptop that has never seen an Anthropic key.
 * Set LLM_MODE=live to force the real client (it will fail loudly if there
 * are no credentials) or LLM_MODE=replay to force replay.
 *
 * The SDK import stays dynamic even though this repo depends on the package.
 * Replay is the default path and needs no SDK at all, so a checkout where the
 * install was skipped or partial still runs the demo, and the failure when it
 * cannot is a sentence telling you what to install rather than a module
 * resolution error at import time.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(HERE, '..', 'fixtures', 'llm');

/** Claude Opus 5. Thinking is on by default on this model; we do not disable it. */
export const ANTHROPIC_MODEL = 'claude-opus-5';

export interface LlmRequest {
  /** Operator instructions. Stable across a run so it caches well. */
  system: string;
  /** The turns so far, user and assistant alternating. */
  messages: { role: 'user' | 'assistant'; content: string }[];
  /** JSON Schema the reply must satisfy. Shape is enforced by the API. */
  schema: Record<string, unknown>;
  /** Label used in the trace, e.g. "round-1" or "repair-2". */
  label: string;
}

export interface LlmResponse {
  /** The parsed JSON object the model returned. */
  output: unknown;
  /** Where it came from, for the trace: "live" or "replay". */
  source: 'live' | 'replay';
  /** Token usage when known. Replay has none. */
  usage?: { input_tokens: number; output_tokens: number };
}

export interface Llm {
  readonly mode: 'live' | 'replay';
  /**
   * The model identifier this client speaks to.
   *
   * On the interface rather than a module constant because the model is no
   * longer a property of the project. It is a property of which client is
   * wired up, it changes the answer, and it has to reach the trace and the
   * report header so a reader can see which model produced the plan the
   * verifier then tore apart. It is also part of the replay key: a recording
   * made against one model must not be served for a request to another.
   */
  readonly model: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
}

/**
 * Key a request by its full content, not by its label. Two rounds that ask
 * the same thing share a recording; changing a single character of the
 * prompt gives a different key and a replay miss, which is the honest
 * behaviour: a changed prompt has no recorded answer.
 */
export function requestKey(model: string, req: LlmRequest): string {
  const canonical = JSON.stringify({
    model,
    system: req.system,
    messages: req.messages,
    schema: req.schema,
  });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

function fixturePath(key: string): string {
  return path.join(FIXTURE_DIR, `${key}.json`);
}

export class ReplayLlm implements Llm {
  readonly mode = 'replay' as const;

  /**
   * Which model's recordings to serve. It has to match the model that made
   * them, because the model is part of the key.
   */
  constructor(readonly model: string) {}

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const key = requestKey(this.model, req);
    const file = fixturePath(key);
    if (!fs.existsSync(file)) {
      throw new Error(
        `No recorded response for ${req.label} from ${this.model} (key ${key}).\n` +
          `Replay mode only serves prompts that have been recorded. Either:\n` +
          `  - run once with credentials and LLM_MODE=live to record it, or\n` +
          `  - revert the prompt change that invalidated the recording.\n` +
          `Recordings live in fixtures/llm/.`,
      );
    }
    const recorded = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { output: recorded.output, source: 'replay' };
  }
}

export class AnthropicLlm implements Llm {
  readonly mode = 'live' as const;
  readonly model = ANTHROPIC_MODEL;

  async complete(req: LlmRequest): Promise<LlmResponse> {
    // Resolved through a variable so the specifier is a runtime value. A
    // literal import would make this file fail to type-check on a checkout
    // that has not installed the SDK, which is every checkout by default.
    const sdk = '@anthropic-ai/sdk';
    let Anthropic: any;
    try {
      ({ default: Anthropic } = await import(/* @vite-ignore */ sdk));
    } catch {
      throw new Error(
        'Live mode needs @anthropic-ai/sdk and it is not resolvable.\n' +
          'Run:  npm install\n' +
          'Or stay in replay mode (the default) and use the recorded responses.',
      );
    }

    // Zero-arg constructor on purpose: it resolves ANTHROPIC_API_KEY, then
    // ANTHROPIC_AUTH_TOKEN, then an `ant auth login` profile, so a machine
    // with a logged-in profile and no env var still works.
    const client = new Anthropic();

    // Streaming because a full study plan can be long and a non-streaming
    // request with a large max_tokens can hit the SDK's HTTP timeout.
    const stream = client.messages.stream({
      model: this.model,
      max_tokens: 32000,
      system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
      messages: req.messages,
      output_config: {
        effort: 'high',
        format: { type: 'json_schema', schema: req.schema },
      },
    });
    const message = await stream.finalMessage();

    // A safety decline arrives as HTTP 200 with stop_reason "refusal", so
    // check it before reading content.
    if (message.stop_reason === 'refusal') {
      throw new Error(
        `The model declined this request (${message.stop_details?.category ?? 'no category'}). ` +
          'Nothing was generated.',
      );
    }

    const text = message.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');
    let output: unknown;
    try {
      output = JSON.parse(text);
    } catch {
      throw new Error(`Model returned text that is not JSON, first 200 chars: ${text.slice(0, 200)}`);
    }

    // Record it, so the next run needs no key.
    fs.mkdirSync(FIXTURE_DIR, { recursive: true });
    const key = requestKey(this.model, req);
    fs.writeFileSync(
      fixturePath(key),
      `${JSON.stringify(
        {
          key,
          label: req.label,
          model: this.model,
          recordedAt: new Date().toISOString(),
          usage: message.usage,
          output,
        },
        null,
        2,
      )}\n`,
    );

    return {
      output,
      source: 'live',
      usage: { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens },
    };
  }
}

/**
 * Replay unless told otherwise, and live only when credentials actually
 * exist. Defaulting the other way would make the demo depend on the room's
 * network and on a key being present, which is exactly the failure you do
 * not want on stage.
 */
export function selectLlm(): Llm {
  const mode = process.env.LLM_MODE;
  if (mode === 'live') return new AnthropicLlm();
  if (mode === 'replay') return new ReplayLlm(ANTHROPIC_MODEL);
  const hasCreds = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  return hasCreds ? new AnthropicLlm() : new ReplayLlm(ANTHROPIC_MODEL);
}
