/**
 * Where the daily reading state lives, and the calendar arithmetic it needs.
 *
 * The rest of this repo keeps everything as JSON on disk under `out/`, read
 * and written with `fs`, and the reading features follow that rather than
 * adding a database for two small records. One file holds both the review
 * deck and the one-verse-a-day plan, so a morning brief reads one path.
 *
 * `out/` is gitignored, which is the right default for a personal record of
 * what someone has memorised. Set READING_STATE_FILE to keep it elsewhere,
 * for example in a synced folder.
 *
 * Dates are plain `YYYY-MM-DD` strings, compared as strings and advanced with
 * UTC arithmetic. A review due on a calendar day is due on that day wherever
 * the laptop happens to be, and a daylight-saving change must not make a verse
 * due an hour early or late, so no timestamps and no local midnight maths.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BuiltIndex } from './index-types';
import type { ReviewCard } from './schedule';
import type { DailyPlan } from './daily';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'out');

export const INDEX_PATH = path.join(OUT, 'index.json');
export const DEFAULT_STATE_PATH = path.join(OUT, 'reading.json');

/** A calendar date, `YYYY-MM-DD`. */
export type DateString = string;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateString(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

function assertDate(s: string): void {
  if (!isDateString(s)) throw new Error(`"${s}" is not a date of the form YYYY-MM-DD.`);
}

/** Today, on the local calendar. The one place the wall clock is read. */
export function localDate(now: Date = new Date()): DateString {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(date: DateString, days: number): DateString {
  assertDate(date);
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Whole days from `a` to `b`. Negative when `b` is earlier. */
export function daysBetween(a: DateString, b: DateString): number {
  assertDate(a);
  assertDate(b);
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export interface ReadingState {
  version: 1;
  cards: ReviewCard[];
  daily: DailyPlan | null;
}

export function emptyState(): ReadingState {
  return { version: 1, cards: [], daily: null };
}

export function statePath(): string {
  return process.env.READING_STATE_FILE
    ? path.resolve(process.env.READING_STATE_FILE)
    : DEFAULT_STATE_PATH;
}

export function loadState(file: string = statePath()): ReadingState {
  if (!fs.existsSync(file)) return emptyState();
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<ReadingState>;
  if (raw.version !== 1) {
    throw new Error(`${file} has version ${String(raw.version)}, and this code reads version 1.`);
  }
  return {
    version: 1,
    cards: Array.isArray(raw.cards) ? raw.cards : [],
    daily: raw.daily ?? null,
  };
}

export function saveState(state: ReadingState, file: string = statePath()): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
}

export function loadIndex(file: string = INDEX_PATH): BuiltIndex {
  if (!fs.existsSync(file)) {
    throw new Error(`No index at ${path.relative(ROOT, file)}. Run "npm run build-index" first.`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8')) as BuiltIndex;
}
