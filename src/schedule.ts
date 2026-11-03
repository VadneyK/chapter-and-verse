/**
 * Spaced repetition for memorised verses, SM-2 style.
 *
 * SM-2 is the scheduler Anki descends from. Each card carries an ease factor
 * and an interval. A good recall multiplies the interval by the ease; a lapse
 * sends the card back to the start without touching the ease, so a verse that
 * was always hard stays on a short leash after it is relearned. The whole
 * algorithm is a dozen lines, which is the point: a reader can check it
 * against the published description rather than trust it.
 *
 * Grades are the SM-2 scale, 0 to 5:
 *
 *   5  recited perfectly
 *   4  recited, after a hesitation
 *   3  recited, with real difficulty
 *   2  wrong, and the right text looked familiar once seen
 *   1  wrong, and the right text was a surprise
 *   0  nothing came back at all
 *
 * 3 and above count as a pass. Everything below resets the card.
 *
 * A library with no side effects on import and no clock. Every function that
 * needs a date is handed one, so the tests can run any day of the year and
 * the CLI reads the clock exactly once.
 */
import type { BuiltIndex } from './index-types';
import { formatRef, parseReference } from './reference';
import { addDays, type DateString } from './reading-store';
import { verifyItem } from './verify';

export type Grade = 0 | 1 | 2 | 3 | 4 | 5;

/** Grades at or above this count as a successful recall. */
export const PASS_GRADE = 3;

/** SM-2's floor: an ease below this makes intervals shrink on a pass. */
export const MIN_EASE = 1.3;

/** Where a fresh card starts, which is the SM-2 default. */
export const INITIAL_EASE = 2.5;

export interface ReviewRecord {
  date: DateString;
  grade: Grade;
  /** The interval the review set, in days. */
  interval: number;
}

export interface ReviewCard {
  /** Canonical reference, e.g. "Romans 8:28". Unique within the deck. */
  reference: string;
  added: DateString;
  /** Days between the last review and the next. 0 until the first review. */
  interval: number;
  ease: number;
  /** Consecutive successful recalls. Reset by a lapse. */
  repetitions: number;
  due: DateString;
  history: ReviewRecord[];
}

/**
 * Canonical form of a reference, checked against the index.
 *
 * A card for a verse that does not exist would be due forever and recite
 * nothing, so the deck refuses one, and it refuses it with the verifier's own
 * reason rather than a second opinion. "Romans 8:999" gets the same sentence
 * here as it does on a study plan.
 */
export function canonicalReference(index: BuiltIndex, raw: string): string {
  const parsed = parseReference(index, raw);
  if (!parsed.ok) throw new Error(`Cannot add "${raw}": ${parsed.reason}.`);
  const report = verifyItem(index, {
    id: 'card',
    type: 'memory',
    week: 1,
    title: '',
    reference: raw,
  });
  const failed = report.checks.find((c) => c.status === 'fail');
  if (failed) throw new Error(`Cannot add "${raw}": ${failed.detail}`);
  return formatRef(parsed.ref);
}

/** A card due the day it is added, so the first recital happens that day. */
export function newCard(reference: string, today: DateString): ReviewCard {
  return {
    reference,
    added: today,
    interval: 0,
    ease: INITIAL_EASE,
    repetitions: 0,
    due: today,
    history: [],
  };
}

export function isGrade(n: number): n is Grade {
  return Number.isInteger(n) && n >= 0 && n <= 5;
}

/**
 * The SM-2 update. Returns a new card; the old one is not touched.
 *
 *   pass:  interval 1, then 6, then previous x ease, rounded
 *          ease moves by 0.1 - (5 - q)(0.08 + (5 - q)0.02), floored at 1.3
 *   lapse: repetitions and interval back to the start, ease unchanged
 */
export function gradeCard(card: ReviewCard, grade: Grade, today: DateString): ReviewCard {
  if (!isGrade(grade)) throw new Error(`Grade must be a whole number from 0 to 5, not ${grade}.`);

  let { interval, ease, repetitions } = card;

  if (grade < PASS_GRADE) {
    repetitions = 0;
    interval = 1;
  } else {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * ease);
    repetitions += 1;

    const miss = 5 - grade;
    ease = Math.max(MIN_EASE, ease + (0.1 - miss * (0.08 + miss * 0.02)));
    // Two decimals, so the stored file reads as numbers a person would write.
    ease = Math.round(ease * 100) / 100;
  }

  return {
    ...card,
    interval,
    ease,
    repetitions,
    due: addDays(today, interval),
    history: [...card.history, { date: today, grade, interval }],
  };
}

/**
 * Cards due on or before `today`, most overdue first. Ties go to the card
 * that has been in the deck longest, so a neglected old verse is not pushed
 * behind this week's additions.
 */
export function dueCards(cards: ReviewCard[], today: DateString): ReviewCard[] {
  return cards
    .filter((c) => c.due <= today)
    .sort((a, b) => a.due.localeCompare(b.due) || a.added.localeCompare(b.added));
}

/** Cards due after `today`, soonest first. */
export function upcomingCards(cards: ReviewCard[], today: DateString): ReviewCard[] {
  return cards
    .filter((c) => c.due > today)
    .sort((a, b) => a.due.localeCompare(b.due) || a.added.localeCompare(b.added));
}

export function findCard(cards: ReviewCard[], reference: string): ReviewCard | undefined {
  const key = reference.toLowerCase();
  return cards.find((c) => c.reference.toLowerCase() === key);
}

/** Adds a card, or returns the deck unchanged if that reference is already in it. */
export function addCard(cards: ReviewCard[], reference: string, today: DateString): ReviewCard[] {
  if (findCard(cards, reference)) return cards;
  return [...cards, newCard(reference, today)];
}

/** Replaces the card with the same reference. Throws if there is none. */
export function replaceCard(cards: ReviewCard[], card: ReviewCard): ReviewCard[] {
  const key = card.reference.toLowerCase();
  if (!cards.some((c) => c.reference.toLowerCase() === key)) {
    throw new Error(`${card.reference} is not in the deck.`);
  }
  return cards.map((c) => (c.reference.toLowerCase() === key ? card : c));
}

export function removeCard(cards: ReviewCard[], reference: string): ReviewCard[] {
  const key = reference.toLowerCase();
  return cards.filter((c) => c.reference.toLowerCase() !== key);
}
