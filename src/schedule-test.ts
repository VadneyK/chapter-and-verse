/**
 * Tests for the review scheduler and the one-verse-a-day plan.
 *
 * Same shape as selftest.ts: plain assertions, a pass or FAIL line each, exit
 * code 1 if any fail. No framework, because the repo has none and these are
 * checks on arithmetic, not on a UI.
 *
 * Every verse count below was read out of the built index, not recalled, and
 * the daily-plan tests need out/index.json, so run `npm run build-index`
 * first. Nothing here touches the real state file: the round trip test writes
 * to a temporary directory.
 *
 * Run: npm test
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { startDailyPlan, verseForDate } from './daily';
import {
  addDays,
  daysBetween,
  emptyState,
  isDateString,
  loadIndex,
  loadState,
  saveState,
} from './reading-store';
import {
  INITIAL_EASE,
  MIN_EASE,
  addCard,
  canonicalReference,
  dueCards,
  findCard,
  gradeCard,
  newCard,
  removeCard,
  replaceCard,
  upcomingCards,
  type Grade,
  type ReviewCard,
} from './schedule';

let failures = 0;

function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'pass' : 'FAIL'}  ${label}${ok ? '' : `  (${detail})`}`);
  if (!ok) failures += 1;
}

function throws(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  return '';
}

function section(title: string): void {
  console.log(`\n${title}`);
}

const index = loadIndex();
const T0 = '2026-01-01';

// Dates --------------------------------------------------------------------

section('dates');
check('addDays crosses a month end', addDays('2026-02-28', 1) === '2026-03-01', addDays('2026-02-28', 1));
check('addDays knows a leap year', addDays('2028-02-28', 1) === '2028-02-29', addDays('2028-02-28', 1));
check('addDays crosses a year end', addDays('2026-12-31', 1) === '2027-01-01', addDays('2026-12-31', 1));
check('addDays goes backwards', addDays('2026-03-01', -1) === '2026-02-28', addDays('2026-03-01', -1));
check('daysBetween is signed', daysBetween('2026-01-01', '2026-01-11') === 10 && daysBetween('2026-01-11', '2026-01-01') === -10);
check(
  'daysBetween is whole days across a daylight-saving change',
  daysBetween('2026-03-07', '2026-03-09') === 2 && daysBetween('2026-10-31', '2026-11-02') === 2,
);
check('isDateString rejects a day that does not exist', !isDateString('2026-02-30') && !isDateString('2026-13-01'));
check('isDateString rejects other shapes', !isDateString('1/1/2026') && !isDateString('2026-1-1') && isDateString(T0));

// SM-2 ---------------------------------------------------------------------

section('scheduler');

const fresh = newCard('Romans 8:28', T0);
check('a new card is due the day it is added', fresh.due === T0 && fresh.interval === 0 && fresh.repetitions === 0);
check('a new card starts at the SM-2 default ease', fresh.ease === INITIAL_EASE, String(fresh.ease));

const r1 = gradeCard(fresh, 5, T0);
check('first pass: interval 1, due tomorrow', r1.interval === 1 && r1.due === '2026-01-02' && r1.repetitions === 1, JSON.stringify(r1));
check('a perfect grade raises the ease by 0.1', r1.ease === 2.6, String(r1.ease));

const r2 = gradeCard(r1, 4, r1.due);
check('second pass: interval 6', r2.interval === 6 && r2.due === '2026-01-08' && r2.repetitions === 2, JSON.stringify(r2));
check('a grade of 4 leaves the ease where it was', r2.ease === 2.6, String(r2.ease));

const r3 = gradeCard(r2, 4, r2.due);
check(
  'third pass: interval is the previous interval times the ease, rounded',
  r3.interval === Math.round(6 * 2.6) && r3.interval === 16 && r3.due === '2026-01-24',
  `interval=${r3.interval} due=${r3.due}`,
);

const r3hard = gradeCard(r2, 3, r2.due);
check('a grade of 3 passes but lowers the ease by 0.14', r3hard.repetitions === 3 && r3hard.ease === 2.46, String(r3hard.ease));

const lapse = gradeCard(r3, 1, r3.due);
check(
  'a lapse resets repetitions and the interval, and is due tomorrow',
  lapse.repetitions === 0 && lapse.interval === 1 && lapse.due === addDays(r3.due, 1),
  JSON.stringify(lapse),
);
check('a lapse leaves the ease unchanged, as SM-2 specifies', lapse.ease === r3.ease, `${lapse.ease} vs ${r3.ease}`);

const relearn = gradeCard(lapse, 5, lapse.due);
check('after a lapse the ladder starts again at 1 then 6', relearn.interval === 1 && gradeCard(relearn, 5, relearn.due).interval === 6);

let worn: ReviewCard = newCard('Psalm 23:1', T0);
for (let i = 0; i < 30; i += 1) worn = gradeCard(worn, 3, worn.due);
check('ease never drops below the SM-2 floor of 1.3', worn.ease === MIN_EASE, String(worn.ease));
check('intervals keep growing even at the floor', worn.interval > 1 && worn.repetitions === 30, `interval=${worn.interval}`);

check('history records every review with the interval it set', r3.history.length === 3 && r3.history[2].interval === 16 && r3.history[0].grade === 5);
check('grading does not mutate the card it was given', fresh.repetitions === 0 && fresh.due === T0);
check('an out-of-range grade is refused', throws(() => gradeCard(fresh, 6 as Grade, T0)).includes('0 to 5'));
check('a fractional grade is refused', throws(() => gradeCard(fresh, 2.5 as Grade, T0)).includes('0 to 5'));

// Due list -----------------------------------------------------------------

section('due list');

const deck: ReviewCard[] = [
  { ...newCard('John 3:16', '2025-12-01'), due: '2026-01-05' },
  { ...newCard('Romans 8:28', '2025-12-20'), due: '2025-12-30' },
  { ...newCard('Psalm 23:1', '2025-11-01'), due: '2025-12-30' },
  { ...newCard('Jude 3', T0), due: T0 },
];
const due = dueCards(deck, T0);
check(
  'due lists only cards due on or before today, most overdue first, oldest card breaking ties',
  due.map((c) => c.reference).join(', ') === 'Psalm 23:1, Romans 8:28, Jude 3',
  due.map((c) => c.reference).join(', '),
);
check('upcoming lists the rest, soonest first', upcomingCards(deck, T0).map((c) => c.reference).join() === 'John 3:16');
check('a card graded today is no longer due today', dueCards([gradeCard(deck[3], 4, T0)], T0).length === 0);

// Deck operations ----------------------------------------------------------

section('deck');

let cards = addCard([], 'Romans 8:28', T0);
cards = addCard(cards, 'Romans 8:28', '2026-02-01');
check('adding the same reference twice keeps one card with its original date', cards.length === 1 && cards[0].added === T0);
check('findCard ignores case', findCard(cards, 'romans 8:28')?.reference === 'Romans 8:28');
cards = replaceCard(cards, gradeCard(cards[0], 5, T0));
check('replaceCard swaps in the graded card', cards[0].repetitions === 1 && cards.length === 1);
check('replaceCard refuses a card that is not in the deck', throws(() => replaceCard(cards, newCard('John 1:1', T0))).includes('not in the deck'));
check('removeCard drops it', removeCard(cards, 'ROMANS 8:28').length === 0);

// Reference canonicalisation, via the verifier ------------------------------

section('references');

check('"rom 8.28" and "Romans 8:28" are the same card', canonicalReference(index, 'rom 8.28') === canonicalReference(index, 'Romans 8:28'));
check('a one-chapter book is cited by verse', canonicalReference(index, 'Jude 1:3') === 'Jude 3');
check('a verse past the end of the chapter is refused', throws(() => canonicalReference(index, 'Romans 8:999')).includes('39 verses'));
check('a chapter past the end of the book is refused', throws(() => canonicalReference(index, 'Romans 17')).includes('16 chapters'));
check('a comma list is refused rather than half-added', throws(() => canonicalReference(index, 'Romans 8:28, 12:2')).includes('one passage'));
check('nonsense is refused', throws(() => canonicalReference(index, 'Hezekiah 3:1')).includes('no book'));

// One verse a day ----------------------------------------------------------

section('daily plan');

const romans = startDailyPlan(index, 'romans', T0);
check('the plan stores the canonical reference', romans.reference === 'Romans' && romans.start === T0);

const d1 = verseForDate(index, romans, T0);
check('day 1 is the first verse', d1.status === 'reading' && d1.reference === 'Romans 1:1' && d1.day === 1, JSON.stringify(d1));
check('the plan knows how long it is: Romans has 433 verses', d1.status === 'reading' && d1.of === 433 && d1.ends === addDays(T0, 432));
check('the text comes from the index', d1.status === 'reading' && d1.text.startsWith('Paul, a servant of Christ Jesus'), d1.status === 'reading' ? d1.text : d1.status);

const d33 = verseForDate(index, romans, addDays(T0, 32));
check('Romans 1 has 32 verses, so day 33 is Romans 2:1', d33.status === 'reading' && d33.reference === 'Romans 2:1', JSON.stringify(d33));

const last = verseForDate(index, romans, addDays(T0, 432));
check('the last day is Romans 16:27', last.status === 'reading' && last.reference === 'Romans 16:27' && last.day === 433, JSON.stringify(last));

const after = verseForDate(index, romans, addDays(T0, 433));
check('the day after is finished, and says when', after.status === 'finished' && after.finishedOn === addDays(T0, 432), JSON.stringify(after));

const before = verseForDate(index, romans, '2025-12-30');
check('before the start date, the plan says how long until it begins', before.status === 'not-started' && before.startsIn === 2, JSON.stringify(before));

check('no plan is a stated outcome, not an error', verseForDate(index, null, T0).status === 'no-plan');

const jude = startDailyPlan(index, 'Jude', T0);
const j = verseForDate(index, jude, T0);
check('a one-chapter book is walked by verse', j.status === 'reading' && j.reference === 'Jude 1' && j.of === 25, JSON.stringify(j));

const chapter = startDailyPlan(index, 'Psalm 23', T0);
const c6 = verseForDate(index, chapter, addDays(T0, 5));
check('a chapter can be walked on its own: Psalm 23 has 6 verses', c6.status === 'reading' && c6.reference === 'Psalms 23:6' && c6.of === 6, JSON.stringify(c6));
check('and the day after a chapter it is finished', verseForDate(index, chapter, addDays(T0, 6)).status === 'finished');

const range = startDailyPlan(index, 'Romans 8:28-30', T0);
check('a verse range is walked verse by verse', verseForDate(index, range, addDays(T0, 2)).status === 'reading' && (verseForDate(index, range, addDays(T0, 2)) as { reference: string }).reference === 'Romans 8:30');

check('a plan cannot start past the end of a book', throws(() => startDailyPlan(index, 'Romans 17', T0)).includes('16 chapters'));

// Round trip through the state file ----------------------------------------

section('state file');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reading-'));
const file = path.join(dir, 'nested', 'reading.json');
try {
  const state = emptyState();
  state.cards = addCard(state.cards, 'Romans 8:28', T0);
  state.cards = replaceCard(state.cards, gradeCard(state.cards[0], 4, T0));
  state.daily = romans;
  saveState(state, file);
  const back = loadState(file);
  check('a saved state loads back identical', JSON.stringify(back) === JSON.stringify(state));
  check('a missing file is an empty state, not an error', loadState(path.join(dir, 'none.json')).cards.length === 0);
  fs.writeFileSync(file, JSON.stringify({ version: 2, cards: [] }));
  check('a future version is refused rather than misread', throws(() => loadState(file)).includes('version'));
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('');
if (failures) {
  console.error(`${failures} check${failures === 1 ? '' : 's'} failed`);
  process.exit(1);
}
console.log('scheduler tests passed');
