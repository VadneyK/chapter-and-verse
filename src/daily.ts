/**
 * One verse a day, in order, through a chosen passage.
 *
 * The plan is two fields: a canonical reference and a start date. Which verse
 * is today's is arithmetic over the index, not a counter that has to be
 * advanced, so a missed morning does not stall the plan and a brief run twice
 * in one day gives the same verse twice. Day 1 is the start date.
 *
 * "A chosen book" is the usual case, but anything the reference parser
 * accepts works: "Romans" walks the book, "Psalms 119" walks the chapter,
 * "Romans 8:28-39" walks the range. Same parser, same bounds check, so a plan
 * cannot start past the end of anything.
 *
 * `todaysVerse()` is the function a morning brief calls. It reads the index
 * and the state file off disk, takes the date from the clock unless told
 * otherwise, and returns a plain object with the reference and the text.
 */
import type { BuiltIndex } from './index-types';
import { formatRef, parseReference, versesIn } from './reference';
import { canonicalReference } from './schedule';
import {
  addDays,
  daysBetween,
  loadIndex,
  loadState,
  localDate,
  type DateString,
} from './reading-store';

export interface DailyPlan {
  /** Canonical reference of the passage being walked, e.g. "Romans". */
  reference: string;
  /** The day verse 1 of the passage is read. */
  start: DateString;
}

export type DailyVerse =
  | {
      status: 'reading';
      plan: DailyPlan;
      /** 1-based position in the passage. */
      day: number;
      /** How many verses the passage has in total. */
      of: number;
      reference: string;
      text: string;
      /** The day the last verse falls on. */
      ends: DateString;
    }
  | { status: 'not-started'; plan: DailyPlan; startsIn: number }
  | { status: 'finished'; plan: DailyPlan; of: number; finishedOn: DateString }
  | { status: 'no-plan' };

export function startDailyPlan(index: BuiltIndex, passage: string, start: DateString): DailyPlan {
  return { reference: canonicalReference(index, passage), start };
}

/** Every verse the plan walks, in reading order. */
function versesOf(index: BuiltIndex, plan: DailyPlan) {
  const parsed = parseReference(index, plan.reference);
  if (!parsed.ok) {
    throw new Error(`The daily plan's reference "${plan.reference}" no longer parses: ${parsed.reason}.`);
  }
  return { ref: parsed.ref, verses: versesIn(index, parsed.ref) };
}

export function verseForDate(index: BuiltIndex, plan: DailyPlan | null, date: DateString): DailyVerse {
  if (!plan) return { status: 'no-plan' };
  const { ref, verses } = versesOf(index, plan);
  const offset = daysBetween(plan.start, date);

  if (offset < 0) return { status: 'not-started', plan, startsIn: -offset };
  if (offset >= verses.length) {
    const finishedOn = addDays(plan.start, verses.length - 1);
    return { status: 'finished', plan, of: verses.length, finishedOn };
  }

  const { chapter, verse } = verses[offset];
  const text = index.text[ref.book.id]?.[chapter - 1]?.[verse - 1] ?? '';
  const reference = formatRef({
    raw: '',
    book: ref.book,
    chapter,
    verse,
    verseEnd: verse,
    verseEndChapter: chapter,
    hasVerse: true,
  });
  return {
    status: 'reading',
    plan,
    day: offset + 1,
    of: verses.length,
    reference,
    text,
    ends: addDays(plan.start, verses.length - 1),
  };
}

/**
 * Today's verse, for a morning brief.
 *
 *   import { todaysVerse } from './src/daily';
 *   const v = todaysVerse();
 *   if (v.status === 'reading') console.log(v.reference, v.text);
 *
 * Or from a shell: `npm run daily -- --json`.
 */
export function todaysVerse(
  today: DateString = localDate(),
  index: BuiltIndex = loadIndex(),
  plan: DailyPlan | null = loadState().daily,
): DailyVerse {
  return verseForDate(index, plan, today);
}
