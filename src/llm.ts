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
 * Nebius Token Factory, which serves NVIDIA's open-weight models behind an
 * OpenAI-compatible API.
 *
 * Written with raw fetch rather than the `openai` package. It is one POST,
 * the replay path is meant to need no SDK at all, and adding a second
 * dynamic-import dance to save fifteen lines is not a trade worth making.
 *
 * Nothing in this class has been run against a live endpoint. The base URL
 * was confirmed to exist (it answers 401 without a token) and the model id
 * is the one Nebius publishes in its own Nemotron sample, but the response
 * handling below is written from the OpenAI-compatible contract and the
 * behaviour of vLLM-style reasoning servers, not from a response anyone has
 * seen. The two places that are most likely to need a correction on the
 * first real run are marked.
 */
export const NEBIUS_MODEL = 'nvidia/nemotron-3-super-120b-a12b';

/**
 * Nebius publishes two spellings of this host: the plain one, and a
 * region-qualified `api.tokenfactory.us-central1.nebius.com`. The plain one
 * is used here because it is the one that answered. Override with
 * NEBIUS_BASE_URL if an account is pinned to a region.
 */
export const NEBIUS_BASE_URL = 'https://api.tokenfactory.nebius.com/v1';

/**
 * Strips a reasoning preamble out of a completion.
 *
 * Reasoning models on OpenAI-compatible servers put their thinking in one of
 * two places depending on how the server is configured: a separate
 * `reasoning_content` field, leaving `content` clean, or an inline
 * `<think>...</think>` block at the front of `content`. Which one Nebius does
 * cannot be settled from the documentation, so both are handled. If a first
 * live run shows only one is real, delete the other rather than leaving a
 * branch nothing exercises.
 */
export function stripReasoning(text: string): string {
  return text.replace(/^\s*<think>[\s\S]*?<\/think>\s*/, '').trim();
}

export class NebiusLlm implements Llm {
  readonly mode = 'live' as const;
  readonly model: string;
  readonly baseUrl: string;

  constructor(model = process.env.NEBIUS_MODEL || NEBIUS_MODEL, baseUrl?: string) {
    this.model = model;
    this.baseUrl = (baseUrl || process.env.NEBIUS_BASE_URL || NEBIUS_BASE_URL).replace(/\/+$/, '');
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const key = process.env.NEBIUS_API_KEY;
    if (!key) {
      throw new Error(
        'NEBIUS_API_KEY is not set. Get a key from the Nebius Token Factory console, ' +
          'export it, and run again. Or stay in replay mode, which needs no key.',
      );
    }

    // A long plan on a 120B reasoning model is not a fast request. Ten
    // minutes, and an abort rather than a socket that hangs until the
    // process is killed.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 10 * 60 * 1000);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: abort.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 16000,
          messages: [{ role: 'system', content: req.system }, ...req.messages],
          // No `strict: true`. Strict schema mode requires every declared
          // property to be present, and the system prompt tells the model to
          // leave a field out rather than guess at it. Turning strict on
          // would make that instruction impossible to follow and quietly
          // undo the design: fewer claims that are all true beats a rich
          // item with one invented detail.
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'study_plan', schema: req.schema },
          },
        }),
      });
    } catch (err) {
      clearTimeout(timer);
      if (abort.signal.aborted) throw new Error(`${this.model} did not answer within 10 minutes.`);
      throw err;
    }
    clearTimeout(timer);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `Nebius returned ${res.status} ${res.statusText}. ${body.slice(0, 300)}`.trim(),
      );
    }

    const payload: any = await res.json();
    const choice = payload?.choices?.[0];
    if (!choice) {
      throw new Error(`Nebius returned no choices. First 200 chars: ${JSON.stringify(payload).slice(0, 200)}`);
    }
    if (choice.finish_reason === 'length') {
      throw new Error(
        `${this.model} hit the 16000 token output cap before finishing the plan. ` +
          'Ask for fewer items, or raise max_tokens.',
      );
    }

    const text = stripReasoning(String(choice.message?.content ?? ''));
    let output: unknown;
    try {
      output = JSON.parse(text);
    } catch {
      throw new Error(`Model returned text that is not JSON, first 200 chars: ${text.slice(0, 200)}`);
    }

    // Record it, so the next run needs no key. Same fixture shape as the
    // Anthropic client, with the provider written down: two clients can put
    // recordings in the same directory without either one being able to
    // serve the other's, because the model is in the key.
    fs.mkdirSync(FIXTURE_DIR, { recursive: true });
    const fixtureKey = requestKey(this.model, req);
    fs.writeFileSync(
      fixturePath(fixtureKey),
      `${JSON.stringify(
        {
          key: fixtureKey,
          label: req.label,
          provider: 'nebius',
          model: this.model,
          recordedAt: new Date().toISOString(),
          usage: payload.usage,
          output,
        },
        null,
        2,
      )}\n`,
    );

    return {
      output,
      source: 'live',
      usage: payload.usage
        ? {
            input_tokens: payload.usage.prompt_tokens ?? 0,
            output_tokens: payload.usage.completion_tokens ?? 0,
          }
        : undefined,
    };
  }
}

/**
 * Picks a client.
 *
 * Two axes, and they are independent. LLM_PROVIDER says which model the run
 * is about; LLM_MODE says whether to actually call it.
 *
 *   LLM_PROVIDER=nebius     (default) NVIDIA Nemotron on Nebius Token Factory
 *   LLM_PROVIDER=anthropic  Claude
 *
 *   LLM_MODE=replay         (default) serve recordings, no key, no network
 *   LLM_MODE=live           call the provider, and record what comes back
 *
 * Replay is the default because a demo runs on conference wifi and should
 * not depend on the room's network or on a key being present. With no
 * environment set at all, a live call happens only when that provider's
 * credentials are actually there.
 *
 * Nebius is the default provider rather than Anthropic because replay needs
 * a model string to compute its keys, and the recordings this repo will
 * carry are Nemotron's. Defaulting to Claude would make a bare
 * `npm run generate` miss every recording on disk and fail with a replay
 * miss, which is an honest error about a situation nobody is in.
 */
export function selectLlm(): Llm {
  const provider = (process.env.LLM_PROVIDER || 'nebius').toLowerCase();
  if (provider !== 'nebius' && provider !== 'anthropic') {
    throw new Error(`LLM_PROVIDER must be "nebius" or "anthropic", not "${provider}".`);
  }

  const live = () => (provider === 'nebius' ? new NebiusLlm() : new AnthropicLlm());
  const replayModel = () =>
    provider === 'nebius' ? process.env.NEBIUS_MODEL || NEBIUS_MODEL : ANTHROPIC_MODEL;

  const mode = process.env.LLM_MODE;
  if (mode === 'live') return live();
  if (mode === 'replay') return new ReplayLlm(replayModel());

  const hasCreds =
    provider === 'nebius'
      ? Boolean(process.env.NEBIUS_API_KEY)
      : Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  return hasCreds ? live() : new ReplayLlm(replayModel());
}
