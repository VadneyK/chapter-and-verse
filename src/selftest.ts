/**
 * Proves the generate-verify-repair loop does what this project claims, with a
 * scripted stand-in for the model so it needs no API key and no network.
 *
 * A second section at the end covers the model client on every path that
 * works without credentials: which client a bare environment selects, what a
 * missing key says, what a replay miss says, and that a reasoning preamble is
 * stripped before the JSON parse. Not an actual call, because there is no key
 * here and asserting against a response nobody has seen would be the unearned
 * confidence the rest of this repo exists to catch.
 *
 * This is not a recorded model response and is not presented as one. It is a
 * test double returning a fixed script, chosen so one run has to handle every
 * outcome the loop can produce:
 *
 *   round-1    six items: three true (one of them unverifiable), three false
 *              in three different ways
 *   repair-1   two of the three are corrected, one is corrected into a
 *              different wrong answer
 *   repair-2   that one is still wrong
 *
 * The loop passes if it ships exactly the five items that verify, drops the
 * one that never does, never asks for a repair on the unverifiable item, and
 * records every round in the trace. Those are the things a demo audience
 * should not have to take on trust: that the verifier is load-bearing rather
 * than decorative, that nothing unverified ships, and that "cannot be
 * confirmed" is a reported outcome rather than a quiet pass or a bug to be
 * prompted away.
 *
 * Every reference, verse count, quote and cross-reference weight in the script
 * below was read out of the built index, not recalled.
 *
 * Run: npm run selftest
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generatePlan } from './generate';
import { NEBIUS_MODEL, NebiusLlm, selectLlm, stripReasoning } from './llm';
import type { Llm, LlmRequest, LlmResponse } from './llm';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, '..', 'out');

const ROM_8_28 =
  'And we know that God works all things together for the good of those who love Him, ' +
  'who are called according to His purpose.';
const JOHN_3_16 =
  'For God so loved the world that He gave His one and only Son, that everyone who ' +
  'believes in Him shall not perish but have eternal life.';

const SCRIPT: Record<string, unknown>[] = [
  // round-1
  {
    items: [
      {
        id: 'w1-r1',
        type: 'reading',
        week: 1,
        title: "Paul's gospel, stated up front",
        reference: 'Romans 1',
      },
      {
        id: 'w2-m1',
        type: 'memory',
        week: 2,
        title: 'All things work together for good',
        reference: 'Romans 8:28',
        quote: ROM_8_28,
      },
      {
        // False: Romans 8 has 39 verses. The check the old index could not make.
        id: 'w3-m1',
        type: 'memory',
        week: 3,
        title: 'Nothing can separate us',
        reference: 'Romans 8:99',
      },
      {
        // False: both passages are real, the source attests no link between them.
        id: 'w4-q1',
        type: 'question',
        week: 4,
        title: 'What does a living sacrifice have to do with the law',
        reference: 'Romans 12',
        crossReferences: ['Leviticus 11'],
      },
      {
        // True but thinly attested: 2 votes, under the threshold. Ships as
        // unverifiable and must never be sent back for repair.
        id: 'w5-q1',
        type: 'question',
        week: 5,
        title: 'Sober judgement, and who else asks for it',
        reference: 'Romans 12:3',
        crossReferences: ['Titus 2:6'],
      },
      {
        // False: a real verse, quoted at the wrong reference. This is John 3:16.
        id: 'w6-m1',
        type: 'memory',
        week: 6,
        title: 'The verse everyone knows',
        reference: 'Romans 8:28',
        quote: JOHN_3_16,
      },
    ],
  },
  // repair-1: two fixed, one fixed into a different wrong answer.
  {
    items: [
      {
        id: 'w3-m1',
        type: 'memory',
        week: 3,
        title: 'Nothing can separate us',
        reference: 'Romans 8:39',
      },
      {
        id: 'w4-q1',
        type: 'question',
        week: 4,
        title: 'What does a living sacrifice have to do with the law',
        reference: 'Romans 12',
        crossReferences: ['Deuteronomy 14'],
      },
      {
        id: 'w6-m1',
        type: 'memory',
        week: 6,
        title: 'All things work together for good',
        reference: 'Romans 8:28',
        quote: ROM_8_28,
      },
    ],
  },
  // repair-2: still wrong. The loop should give up on it and drop it.
  {
    items: [
      {
        id: 'w4-q1',
        type: 'question',
        week: 4,
        title: 'What does a living sacrifice have to do with the law',
        reference: 'Romans 12',
        crossReferences: ['Deuteronomy 14'],
      },
    ],
  },
];

class ScriptedLlm implements Llm {
  readonly mode = 'replay' as const;
  readonly model = 'scripted-stand-in';
  private calls = 0;
  readonly seen: string[] = [];
  readonly prompts: string[] = [];

  async complete(req: LlmRequest): Promise<LlmResponse> {
    this.seen.push(req.label);
    this.prompts.push(req.messages[req.messages.length - 1]?.content ?? '');
    const output = SCRIPT[Math.min(this.calls, SCRIPT.length - 1)];
    this.calls += 1;
    return { output, source: 'replay' };
  }
}

function check(label: string, ok: boolean, detail: string): boolean {
  console.log(`${ok ? 'pass' : 'FAIL'}  ${label}${ok ? '' : `  (${detail})`}`);
  return ok;
}

async function main() {
  // Keep the real demo outputs intact: save and restore anything overwritten.
  const saved: Record<string, string | null> = {};
  for (const f of ['plan.json', 'generate-trace.json']) {
    const p = path.join(OUT_DIR, f);
    saved[p] = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  }

  const llm = new ScriptedLlm();
  const { plan, trace, finalReport } = await generatePlan('understand Romans in 6 weeks', llm);

  for (const [p, content] of Object.entries(saved)) {
    if (content === null) fs.rmSync(p, { force: true });
    else fs.writeFileSync(p, content);
  }

  const shipped = plan.items.map((i) => i.id).sort().join(',');
  const round1 = trace.rounds[0];
  const repairAsk = llm.prompts[1] ?? '';
  const kinds = round1.failures.flatMap((f) => f.reasons.map((r) => r.split(' ')[0]));

  let ok = true;
  ok = check('three rounds ran', trace.rounds.length === 3, `got ${trace.rounds.length}`) && ok;
  ok =
    check(
      'rounds are labelled round-1, repair-1, repair-2',
      llm.seen.join(',') === 'round-1,repair-1,repair-2',
      llm.seen.join(','),
    ) && ok;
  ok =
    check(
      'round 1 caught all three false items',
      round1.failed === 3,
      `failed=${round1.failed}`,
    ) && ok;
  ok =
    check(
      'round 1 caught the verse, the invented link and the misattributed quote',
      ['verse-out-of-range', 'cross-reference-unknown', 'quote-misattributed'].every((k) =>
        kinds.includes(k),
      ),
      kinds.join(','),
    ) && ok;
  ok =
    check(
      'the unverifiable item was not sent back for repair',
      !repairAsk.includes('w5-q1'),
      'w5-q1 appeared in the repair prompt',
    ) && ok;
  ok =
    check(
      'ships the five items that verify',
      shipped === 'w1-r1,w2-m1,w3-m1,w5-q1,w6-m1',
      shipped,
    ) && ok;
  ok =
    check(
      'drops the item that never verified',
      trace.dropped.length === 1 && trace.dropped[0].id === 'w4-q1',
      JSON.stringify(trace.dropped),
    ) && ok;
  ok =
    check(
      'a repaired item replaces its failed version rather than duplicating it',
      plan.items.filter((i) => i.id === 'w3-m1').length === 1 &&
        plan.items.find((i) => i.id === 'w3-m1')?.reference === 'Romans 8:39',
      JSON.stringify(plan.items.filter((i) => i.id === 'w3-m1')),
    ) && ok;
  ok =
    check(
      'nothing shipped fails final verification',
      finalReport.failCount === 0 && finalReport.items.length === 5,
      `${finalReport.passCount} pass / ${finalReport.failCount} fail of ${finalReport.items.length}`,
    ) && ok;
  ok =
    check(
      'the thinly attested item ships, and ships marked unverifiable',
      finalReport.items.find((i) => i.id === 'w5-q1')?.status === 'unverifiable',
      finalReport.items.find((i) => i.id === 'w5-q1')?.status ?? 'missing',
    ) && ok;

  // The model client, on every path that works without a key. This is all of
  // them except an actual call: the Nebius client has never been run against
  // a live endpoint, and pretending otherwise in a test would be the exact
  // kind of unearned confidence the rest of this repo exists to catch.
  console.log('');
  const probe: LlmRequest = {
    system: 'probe',
    messages: [{ role: 'user', content: 'probe' }],
    schema: {},
    label: 'probe',
  };

  const previousProvider = process.env.LLM_PROVIDER;
  delete process.env.LLM_PROVIDER;
  const fallback = selectLlm();
  ok =
    check(
      'with nothing set, the client is replay and the model is Nemotron',
      fallback.mode === 'replay' && fallback.model === NEBIUS_MODEL,
      `${fallback.mode} / ${fallback.model}`,
    ) && ok;

  let keyError = '';
  try {
    await new NebiusLlm().complete(probe);
  } catch (err) {
    keyError = err instanceof Error ? err.message : String(err);
  }
  ok =
    check(
      'a live Nebius call with no key names the variable it wants',
      keyError.includes('NEBIUS_API_KEY'),
      keyError || 'no error thrown',
    ) && ok;

  let missError = '';
  try {
    await fallback.complete(probe);
  } catch (err) {
    missError = err instanceof Error ? err.message : String(err);
  }
  ok =
    check(
      'a replay miss names the model it has no recording for',
      missError.includes(NEBIUS_MODEL),
      missError.split('\n')[0] || 'no error thrown',
    ) && ok;

  ok =
    check(
      'an inline reasoning block is stripped before the JSON parse',
      stripReasoning('<think>weighing it up</think>\n{"items":[]}') === '{"items":[]}' &&
        stripReasoning('{"items":[]}') === '{"items":[]}',
      JSON.stringify(stripReasoning('<think>x</think> {"items":[]}')),
    ) && ok;

  process.env.LLM_PROVIDER = 'bogus';
  let providerError = '';
  try {
    selectLlm();
  } catch (err) {
    providerError = err instanceof Error ? err.message : String(err);
  }
  if (previousProvider === undefined) delete process.env.LLM_PROVIDER;
  else process.env.LLM_PROVIDER = previousProvider;
  ok =
    check(
      'an unknown LLM_PROVIDER fails loudly rather than falling back',
      providerError.includes('LLM_PROVIDER'),
      providerError || 'no error thrown',
    ) && ok;

  console.log('');
  if (!ok) {
    console.error('self-test failed');
    process.exit(1);
  }
  console.log(
    'self-test passed: the verifier is load-bearing, nothing unverified ships, and ' +
      'a claim that cannot be confirmed is reported rather than prompted away.',
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
