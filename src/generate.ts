/**
 * The generator agent: writes a study plan, checks it against the data, and
 * rewrites the parts that fail.
 *
 * Generating a plausible study plan is easy, and every AI scripture tool
 * already does it. The question nobody answers is whether the plan is true.
 * Does that verse exist. Does the chapter go that far. Does the verse say what
 * the plan says it says, or is that a different verse, or a different
 * translation, or nothing at all. A model will produce a confident, well
 * formatted, subtly wrong answer to all of those, and a demo will never show
 * it, because the way you find out is by checking every claim against the
 * text, one at a time, which is not what a demo does.
 *
 * So the loop is:
 *
 *   1. build an evidence pack for the goal, straight out of the index
 *   2. ask the model for a plan, with the schema enforced by the API, so
 *      shape is free and the only open question is truth
 *   3. run the independent verifier over every item
 *   4. hand back the failing items with the exact check that failed, and ask
 *      for a repair, up to MAX_REPAIR_ROUNDS
 *   5. ship only what passes, and drop what never does
 *
 * Step 5 matters as much as step 4. A plan that quietly keeps an unverified
 * item is the thing this is meant to prevent, so items still failing after the
 * last repair are removed and listed in the trace. A short true plan beats a
 * long plausible one.
 *
 * Items that come back "unverifiable" are not sent for repair. Unverifiable is
 * an honest answer, not a defect: a thinly attested cross reference is real,
 * and asking the model to make it go away would teach it to strip the claims
 * this project exists to surface.
 *
 * Run:  npm run generate -- "understand Romans in 6 weeks"
 * Writes out/plan.json and out/generate-trace.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildEvidence, renderEvidence } from './evidence';
import type { BuiltIndex } from './index-types';
import { selectLlm, type Llm } from './llm';
import type { PlanItem, StudyPlan } from './schema';
import { verifyPlan, type ItemReport, type VerifyReport } from './verify';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT_DIR = path.join(ROOT, 'out');
const INDEX_PATH = path.join(OUT_DIR, 'index.json');

/** Two repairs is enough to fix carelessness without papering over a bad plan. */
export const MAX_REPAIR_ROUNDS = 2;

/** Weeks when the goal does not say. */
const DEFAULT_WEEKS = 4;

/**
 * The schema the API enforces on every reply. Shape is guaranteed by this;
 * truth is not, which is the division of labour the whole project rests on.
 */
export const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'type', 'week', 'title', 'reference'],
        properties: {
          id: { type: 'string' },
          type: { type: 'string', enum: ['reading', 'memory', 'question'] },
          week: { type: 'integer', minimum: 1 },
          title: { type: 'string' },
          reference: { type: 'string' },
          quote: { type: 'string' },
          crossReferences: { type: 'array', items: { type: 'string' } },
          note: { type: 'string' },
        },
      },
    },
  },
} as const;

export const SYSTEM = `You write scripture study plans, and every factual claim you make is checked against a public-domain index of the Bible text by a separate verifier before anything reaches a learner. Claims that fail are sent back to you once, and dropped from the plan if they fail again.

You will be given an evidence pack: one book's chapters with their exact verse counts and opening lines, and the verses that a public cross-reference dataset links most heavily, copied verbatim out of that index.

Rules that decide whether an item survives verification:

- A reference names one passage, never a list. "Romans 8", "Romans 8:28", "Romans 8:28-30", "Romans 8:28-9:2" are all fine. "Romans 8:28, 12:2" is not, and will be rejected rather than half-checked.
- The chapter must be within the book's chapter count, and the verse within that chapter's verse count. Both counts are exact numbers in the evidence pack. Do not reason about them from memory.
- One-chapter books (Obadiah, Philemon, 2 John, 3 John, Jude) are cited by verse alone: "Jude 3", not "Jude 1:3".
- Set "quote" only when you are reproducing the text at that reference word for word in the translation named in the evidence pack. The check is character by character after punctuation and case are set aside. A correct quote of the right verse in a different translation fails, and so does the right words at the wrong reference, which is the specific failure the checker was built for.
- Set "crossReferences" only to passages the cross-reference source actually links to yours. The pack lists the strongest links for the most-connected verses; the check runs against the whole graph, so a real link the pack did not show you is fine. An invented connection between two real passages is not, and it is the error that reads most convincingly.
- Leave a field out rather than guessing at it. An item with fewer claims that are all true is worth more than a rich item with one invented detail, because the invented one costs you the whole item.

Write for a learner, not for a database. Titles should read like something a person would put on a study plan. Spread items across the requested number of weeks, roughly evenly, and give each week a mix of reading, memory and question items.`;

interface RoundRecord {
  round: number;
  label: string;
  source: 'live' | 'replay';
  itemsReturned: number;
  passed: number;
  failed: number;
  unverifiable: number;
  failures: { id: string; reference: string; reasons: string[] }[];
}

function readIndex(): BuiltIndex {
  if (!fs.existsSync(INDEX_PATH)) {
    throw new Error(`No index at ${INDEX_PATH}. Run "npm run build" first.`);
  }
  return JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8')) as BuiltIndex;
}

/** "understand Romans in 6 weeks" gives 6. Absent, DEFAULT_WEEKS. */
export function weeksFromGoal(goal: string): number {
  const m = /(\d+)\s*(?:week|wk)/i.exec(goal);
  if (!m) return DEFAULT_WEEKS;
  const n = Number(m[1]);
  return n >= 1 && n <= 52 ? n : DEFAULT_WEEKS;
}

/** The failing checks on one item, as short sentences the model can act on. */
function reasonsFor(report: ItemReport): string[] {
  return report.checks
    .filter((c) => c.status === 'fail')
    .map((c) => `${c.kind} (${c.claim}): ${c.detail}`);
}

function summarize(report: VerifyReport): RoundRecord['failures'] {
  return report.items
    .filter((i) => i.status === 'fail')
    .map((i) => ({ id: i.id, reference: i.reference, reasons: reasonsFor(i) }));
}

/** The repair turn: only the broken items, with the exact reason each broke. */
function repairPrompt(failures: RoundRecord['failures']): string {
  const lines = [
    `The verifier rejected ${failures.length} item(s). Each is listed with the check that failed.`,
    '',
  ];
  for (const f of failures) {
    lines.push(`item ${f.id} (${f.reference}):`);
    for (const r of f.reasons) lines.push(`  - ${r}`);
  }
  lines.push('');
  lines.push(
    'Return a corrected version of ONLY these items, keeping each id. Fix the claim that ' +
      'failed, or drop the field that carried it. Do not add new items and do not restate ' +
      'the items that passed.',
  );
  return lines.join('\n');
}

function asItems(output: unknown): PlanItem[] {
  const items = (output as { items?: unknown })?.items;
  if (!Array.isArray(items)) throw new Error('Model reply had no items array.');
  return items as PlanItem[];
}

export async function generatePlan(goal: string, llm: Llm = selectLlm()) {
  const index = readIndex();
  const pack = buildEvidence(index, goal);
  const weeks = weeksFromGoal(goal);

  const messages: { role: 'user' | 'assistant'; content: string }[] = [
    {
      role: 'user',
      content: `Goal: ${goal}
Weeks: ${weeks}

EVIDENCE PACK
${renderEvidence(pack)}

Write the study plan. Aim for roughly ${weeks * 4} items.`,
    },
  ];

  const rounds: RoundRecord[] = [];
  let accepted: PlanItem[] = [];
  let outstanding: PlanItem[] = [];

  for (let round = 1; round <= MAX_REPAIR_ROUNDS + 1; round += 1) {
    const label = round === 1 ? 'round-1' : `repair-${round - 1}`;
    const reply = await llm.complete({ system: SYSTEM, messages, schema: PLAN_SCHEMA, label });
    const returned = asItems(reply.output);

    // Verify this round's items on their own, then fold the survivors in.
    const trial: StudyPlan = {
      goal,
      weeks,
      generatedBy: `${llm.model} (${llm.mode})`,
      items: returned,
    };
    const report = verifyPlan(index, trial);
    const failures = summarize(report);
    const failedIds = new Set(failures.map((f) => f.id));

    // A repair round replaces the items it was asked to fix, so drop any
    // earlier copy of the same id before folding the new ones in.
    const returnedIds = new Set(returned.map((i) => i.id));
    accepted = accepted.filter((i) => !returnedIds.has(i.id));
    accepted.push(...returned.filter((i) => !failedIds.has(i.id)));
    outstanding = returned.filter((i) => failedIds.has(i.id));

    rounds.push({
      round,
      label,
      source: reply.source,
      itemsReturned: returned.length,
      passed: report.passCount,
      failed: report.failCount,
      unverifiable: report.unverifiableCount,
      failures,
    });

    console.log(
      `${label}: ${returned.length} back, ${report.passCount} verified, ` +
        `${report.failCount} rejected, ${report.unverifiableCount} unverifiable (${reply.source})`,
    );

    if (failures.length === 0) break;
    if (round === MAX_REPAIR_ROUNDS + 1) break;

    messages.push({ role: 'assistant', content: JSON.stringify({ items: returned }) });
    messages.push({ role: 'user', content: repairPrompt(failures) });
  }

  // Anything still failing after the last repair is dropped, not shipped.
  const dropped = outstanding.map((i) => ({ id: i.id, reference: i.reference, title: i.title }));

  accepted.sort((a, b) => a.week - b.week || a.id.localeCompare(b.id));
  const plan: StudyPlan = {
    goal,
    weeks,
    generatedBy: `${llm.model} (${llm.mode}), verified against out/index.json`,
    items: accepted,
  };

  const finalReport = verifyPlan(index, plan);
  const trace = {
    goal,
    book: pack.book.name,
    weeks,
    model: llm.model,
    mode: llm.mode,
    generatedAt: new Date().toISOString(),
    rounds,
    shipped: accepted.length,
    dropped,
    finalVerification: {
      itemCount: finalReport.items.length,
      passCount: finalReport.passCount,
      failCount: finalReport.failCount,
      unverifiableCount: finalReport.unverifiableCount,
    },
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
  fs.writeFileSync(
    path.join(OUT_DIR, 'generate-trace.json'),
    `${JSON.stringify(trace, null, 2)}\n`,
  );

  return { plan, trace, finalReport };
}
