/**
 * Command line front end for the review deck and the one-verse-a-day plan.
 *
 * Separate from schedule.ts and daily.ts for the reason every CLI in this repo
 * is a separate file: the libraries are imported by the tests and by anything
 * that builds a morning brief, and must not run a command when they are.
 *
 *   npm run reading -- add "Romans 8:28"       put a verse in the review deck
 *   npm run reading -- due                     what is due today, with the text
 *   npm run reading -- grade "Romans 8:28" 4   record a recall, 0 to 5
 *   npm run reading -- remove "Romans 8:28"
 *   npm run reading -- list                    the whole deck, with next due dates
 *   npm run reading -- start Romans            begin walking a passage, one verse a day
 *   npm run reading -- today                   today's verse
 *   npm run reading -- brief                   today's verse and the due list together
 *
 * `--json` on any command prints the result as JSON instead of text, which is
 * what a brief that runs on a schedule wants. `--date YYYY-MM-DD` runs the
 * command as if it were that day. `npm run daily` is `today`.
 */
import { todaysVerse, startDailyPlan, type DailyVerse } from './daily';
import type { BuiltIndex } from './index-types';
import { parseReference, textFor } from './reference';
import { isDateString, loadIndex, loadState, localDate, saveState, statePath } from './reading-store';
import {
  addCard,
  canonicalReference,
  dueCards,
  findCard,
  gradeCard,
  isGrade,
  removeCard,
  replaceCard,
  upcomingCards,
  type ReviewCard,
} from './schedule';

interface Args {
  command: string;
  rest: string[];
  json: boolean;
  date: string;
}

function parseArgs(argv: string[]): Args {
  let json = false;
  let date = localDate();
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') json = true;
    else if (a === '--date') {
      const d = argv[i + 1] ?? '';
      if (!isDateString(d)) throw new Error(`--date wants YYYY-MM-DD, not "${d}".`);
      date = d;
      i += 1;
    } else rest.push(a);
  }
  const [command = 'brief', ...tail] = rest;
  return { command, rest: tail, json, date };
}

function verseText(index: BuiltIndex, reference: string): string {
  const parsed = parseReference(index, reference);
  return parsed.ok ? textFor(index, parsed.ref) : '';
}

function printDaily(v: DailyVerse): void {
  switch (v.status) {
    case 'no-plan':
      console.log('No daily plan. Start one with:  npm run reading -- start Romans');
      return;
    case 'not-started':
      console.log(`${v.plan.reference} starts in ${v.startsIn} day${v.startsIn === 1 ? '' : 's'}, on ${v.plan.start}.`);
      return;
    case 'finished':
      console.log(
        `${v.plan.reference} finished on ${v.finishedOn}, ${v.of} verses. ` +
          'Start another with:  npm run reading -- start <passage>',
      );
      return;
    case 'reading':
      console.log(`${v.reference}   (day ${v.day} of ${v.of} through ${v.plan.reference})`);
      console.log(`  ${v.text}`);
  }
}

function printDue(index: BuiltIndex, cards: ReviewCard[], today: string): void {
  const due = dueCards(cards, today);
  const next = upcomingCards(cards, today)[0];
  if (!due.length) {
    console.log(
      cards.length
        ? `Nothing due. Next is ${next!.reference} on ${next!.due}.`
        : 'The deck is empty. Add a verse with:  npm run reading -- add "Romans 8:28"',
    );
    return;
  }
  console.log(`${due.length} due:`);
  for (const c of due) {
    const late = c.due < today ? `  (due ${c.due})` : '';
    const first = c.history.length === 0 ? '  (new)' : '';
    console.log(`  ${c.reference}${first}${late}`);
    console.log(`    ${verseText(index, c.reference)}`);
  }
  console.log('\nRecord each one with:  npm run reading -- grade "<reference>" <0-5>');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const index = loadIndex();
  const state = loadState();
  const today = args.date;
  const out = (value: unknown) => console.log(JSON.stringify(value, null, 2));

  switch (args.command) {
    case 'add': {
      const raw = args.rest.join(' ').trim();
      if (!raw) throw new Error('add wants a reference, for example:  add "Romans 8:28"');
      const reference = canonicalReference(index, raw);
      const already = Boolean(findCard(state.cards, reference));
      state.cards = addCard(state.cards, reference, today);
      saveState(state);
      if (args.json) out(findCard(state.cards, reference));
      else if (already) console.log(`${reference} is already in the deck.`);
      else console.log(`Added ${reference}. It is due today.`);
      return;
    }

    case 'remove': {
      const raw = args.rest.join(' ').trim();
      const reference = canonicalReference(index, raw);
      if (!findCard(state.cards, reference)) throw new Error(`${reference} is not in the deck.`);
      state.cards = removeCard(state.cards, reference);
      saveState(state);
      if (args.json) out({ removed: reference });
      else console.log(`Removed ${reference}.`);
      return;
    }

    case 'grade': {
      const gradeRaw = args.rest[args.rest.length - 1];
      const raw = args.rest.slice(0, -1).join(' ').trim();
      const grade = Number(gradeRaw);
      if (!raw || !isGrade(grade)) {
        throw new Error('grade wants a reference and a whole number from 0 to 5:  grade "Romans 8:28" 4');
      }
      const reference = canonicalReference(index, raw);
      const card = findCard(state.cards, reference);
      if (!card) throw new Error(`${reference} is not in the deck. Add it first.`);
      const updated = gradeCard(card, grade, today);
      state.cards = replaceCard(state.cards, updated);
      saveState(state);
      if (args.json) out(updated);
      else {
        const days = updated.interval;
        console.log(
          `${reference}: grade ${grade}, next review ${updated.due} ` +
            `(in ${days} day${days === 1 ? '' : 's'}, ease ${updated.ease}).`,
        );
      }
      return;
    }

    case 'due': {
      if (args.json) out(dueCards(state.cards, today));
      else printDue(index, state.cards, today);
      return;
    }

    case 'list': {
      if (args.json) {
        out(state.cards);
        return;
      }
      if (!state.cards.length) {
        console.log('The deck is empty.');
        return;
      }
      const sorted = [...state.cards].sort((a, b) => a.due.localeCompare(b.due));
      for (const c of sorted) {
        const when = c.due <= today ? 'due now' : `due ${c.due}`;
        console.log(`  ${c.reference.padEnd(24)} ${when.padEnd(16)} ${c.repetitions} in a row, ease ${c.ease}`);
      }
      console.log(`\n${state.cards.length} card${state.cards.length === 1 ? '' : 's'} in ${statePath()}`);
      return;
    }

    case 'start': {
      const raw = args.rest.join(' ').trim();
      if (!raw) throw new Error('start wants a passage, for example:  start Romans');
      state.daily = startDailyPlan(index, raw, today);
      saveState(state);
      const v = todaysVerse(today, index, state.daily);
      if (args.json) out(v);
      else {
        console.log(`Started ${state.daily.reference} on ${today}.`);
        printDaily(v);
      }
      return;
    }

    case 'today': {
      const v = todaysVerse(today, index, state.daily);
      if (args.json) out(v);
      else printDaily(v);
      return;
    }

    case 'brief': {
      const verse = todaysVerse(today, index, state.daily);
      const due = dueCards(state.cards, today).map((c) => ({
        ...c,
        text: verseText(index, c.reference),
      }));
      if (args.json) {
        out({ date: today, verse, due });
        return;
      }
      console.log(`Reading for ${today}\n`);
      printDaily(verse);
      console.log('');
      printDue(index, state.cards, today);
      return;
    }

    default:
      throw new Error(
        `Unknown command "${args.command}". One of: add, remove, grade, due, list, start, today, brief.`,
      );
  }
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
