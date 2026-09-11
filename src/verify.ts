/**
 * The verifier. A library with no side effects on import: the CLI lives in
 * verify-cli.ts, because the generator imports `verifyPlan` on every repair
 * round and must not re-run a demo each time it does.
 *
 * What this checks, and what it does not, is the whole point of the project,
 * so it is stated plainly here and again in the README. Every structured claim
 * an item makes is checked against a public-domain index built from the text
 * itself. Prose is not checked. An item whose title asserts something false
 * while every structured field is true will pass, and the report says so on
 * that item rather than leaving the reader to assume prose was covered.
 */
import type { BuiltIndex } from './index-types';
import type { PlanItem, StudyPlan } from './schema';
import { formatRef, parseReference, textFor, versesIn, type ParsedRef } from './reference';

export type CheckKind =
  | 'book-not-found'
  | 'reference-unparsable'
  | 'chapter-out-of-range'
  | 'verse-out-of-range'
  | 'quote-mismatch'
  | 'quote-misattributed'
  | 'cross-reference-unparsable'
  | 'cross-reference-unknown'
  | 'cross-reference-weak'
  | 'prose-unchecked';

export type CheckStatus = 'pass' | 'fail' | 'unverifiable';

export interface Check {
  kind: CheckKind;
  status: CheckStatus;
  /** What was claimed. */
  claim: string;
  /** What the index says about it. */
  detail: string;
}

export interface ItemReport {
  id: string;
  reference: string;
  /** Canonical form of the reference, when it parsed. */
  resolved?: string;
  checks: Check[];
  status: CheckStatus;
}

export interface VerifyReport {
  goal: string;
  generatedBy: string;
  translation: string;
  verifiedAt: string;
  items: ItemReport[];
  passCount: number;
  failCount: number;
  unverifiableCount: number;
  /** Carried through so any report can be traced to the data it was checked against. */
  sources: { name: string; license: string; attribution: string }[];
}

/**
 * Vote weight below which a real cross reference is reported as attested but
 * weak rather than confirmed. The source lets readers vote links up and down,
 * so a link sitting at one or two votes is a suggestion, not a fact, and
 * saying "verified" about it would be the same overclaim this project exists
 * to catch.
 */
export const WEAK_CROSSREF_VOTES = 5;

/**
 * Strip everything that differs between two honest renderings of the same
 * verse: case, curly versus straight quotes, punctuation, and whitespace. What
 * is left is the words, in order. A quote that fails after this is not a
 * formatting difference.
 */
export function normalizeQuote(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Per-chapter normalized text, built once per index, for locating a quote. */
const corpusCache = new WeakMap<BuiltIndex, { bookId: string; chapter: number; text: string }[]>();

function corpus(index: BuiltIndex) {
  const cached = corpusCache.get(index);
  if (cached) return cached;
  const rows: { bookId: string; chapter: number; text: string }[] = [];
  for (const book of index.books) {
    const chapters = index.text[book.id] ?? [];
    chapters.forEach((verses, i) => {
      rows.push({ bookId: book.id, chapter: i + 1, text: normalizeQuote(verses.join(' ')) });
    });
  }
  corpusCache.set(index, rows);
  return rows;
}

function bookName(index: BuiltIndex, id: string): string {
  return index.books.find((b) => b.id === id)?.name ?? id;
}

/** Chapter and verse bounds. Returns false when the reference points past the end. */
function checkRange(index: BuiltIndex, ref: ParsedRef, checks: Check[]): boolean {
  const { book } = ref;
  let ok = true;

  const chapters = [ref.chapter, ref.chapterEnd, ref.verseEndChapter].filter(
    (c): c is number => typeof c === 'number',
  );
  for (const ch of chapters) {
    if (ch < 1 || ch > book.chapters) {
      checks.push({
        kind: 'chapter-out-of-range',
        status: 'fail',
        claim: `${book.name} ${ch}`,
        detail: `${book.name} has ${book.chapters} chapter${book.chapters === 1 ? '' : 's'}.`,
      });
      ok = false;
    }
  }
  if (!ok) return false;

  // Verse bounds, the check the old index could not make at all. Both ends of
  // a range are checked against the verse count of the chapter that end sits
  // in, so "Romans 3:23-400" fails on the 400 even though 23 is fine.
  const ends: { chapter: number; verse: number }[] = [];
  if (ref.chapter !== undefined && ref.verse !== undefined) {
    ends.push({ chapter: ref.chapter, verse: ref.verse });
    const endChapter = ref.verseEndChapter ?? ref.chapter;
    // Only when it is a different verse. For "Romans 8:999" the start and the
    // end are the same verse, and reporting it twice makes one error look like
    // two.
    if (ref.verseEnd !== undefined && (ref.verseEnd !== ref.verse || endChapter !== ref.chapter)) {
      ends.push({ chapter: endChapter, verse: ref.verseEnd });
    }
  }
  for (const { chapter, verse } of ends) {
    const count = book.verses[chapter - 1] ?? 0;
    if (verse < 1 || verse > count) {
      checks.push({
        kind: 'verse-out-of-range',
        status: 'fail',
        claim: `${book.name} ${chapter}:${verse}`,
        detail: `${book.name} ${chapter} has ${count} verses.`,
      });
      ok = false;
    }
  }

  return ok;
}

/** Compares a claimed quote against the text the reference actually carries. */
function checkQuote(index: BuiltIndex, ref: ParsedRef, quote: string, checks: Check[]): void {
  const wanted = normalizeQuote(quote);
  if (!wanted) return;

  const actual = normalizeQuote(textFor(index, ref));
  if (actual.includes(wanted)) {
    checks.push({
      kind: 'quote-mismatch',
      status: 'pass',
      claim: `quote attributed to ${formatRef(ref)}`,
      detail: `Matches ${index.translation} at that reference.`,
    });
    return;
  }

  // Not there. Is it anywhere? A quote that turns up in a different passage is
  // a misattribution, which reads very differently from a quote that appears
  // nowhere in this translation at all. The second usually means a different
  // translation or an invented line, and the report says which rather than
  // deciding for the reader.
  const found = corpus(index).find((row) => row.text.includes(wanted));
  if (found) {
    checks.push({
      kind: 'quote-misattributed',
      status: 'fail',
      claim: `quote attributed to ${formatRef(ref)}`,
      detail:
        `That text is in ${index.translation}, but in ` +
        `${bookName(index, found.bookId)} ${found.chapter}, not at the cited reference.`,
    });
    return;
  }

  checks.push({
    kind: 'quote-mismatch',
    status: 'fail',
    claim: `quote attributed to ${formatRef(ref)}`,
    detail:
      `No passage in ${index.translation} carries that wording. Either it is ` +
      `another translation or it was not written by anyone. This check holds ` +
      `every quote to ${index.translation}, which is the translation the index ` +
      `was built from.`,
  });
}

/**
 * Best-attested link between any verse of `from` and any verse of `to`.
 * Returns the highest vote weight found, or null when the source attests none.
 */
function bestLink(index: BuiltIndex, from: ParsedRef, to: ParsedRef): number | null {
  const targets = new Set(
    versesIn(index, to).map(({ chapter, verse }) => `${to.book.id}.${chapter}.${verse}`),
  );
  let best: number | null = null;
  for (const { chapter, verse } of versesIn(index, from)) {
    const links = index.crossRefs[`${from.book.id}.${chapter}.${verse}`];
    if (!links) continue;
    for (const link of links) {
      if (!targets.has(link.to)) continue;
      if (best === null || link.votes > best) best = link.votes;
    }
  }
  return best;
}

function checkCrossRefs(
  index: BuiltIndex,
  from: ParsedRef,
  claimed: string[],
  checks: Check[],
): void {
  for (const raw of claimed) {
    const parsed = parseReference(index, raw);
    if (!parsed.ok) {
      checks.push({
        kind: 'cross-reference-unparsable',
        status: 'fail',
        claim: `cross reference "${raw}"`,
        detail: `Cannot be resolved: ${parsed.reason}.`,
      });
      continue;
    }

    const bounded: Check[] = [];
    if (!checkRange(index, parsed.ref, bounded)) {
      checks.push(
        ...bounded.map((c) => ({ ...c, claim: `cross reference "${raw}": ${c.claim}` })),
      );
      continue;
    }

    const votes = bestLink(index, from, parsed.ref);
    if (votes === null) {
      checks.push({
        kind: 'cross-reference-unknown',
        status: 'fail',
        claim: `${formatRef(from)} is connected to ${formatRef(parsed.ref)}`,
        detail: 'The cross-reference source attests no link between these passages.',
      });
      continue;
    }
    if (votes < WEAK_CROSSREF_VOTES) {
      checks.push({
        kind: 'cross-reference-weak',
        status: 'unverifiable',
        claim: `${formatRef(from)} is connected to ${formatRef(parsed.ref)}`,
        detail:
          `The link is attested, but weakly: ${votes} vote${votes === 1 ? '' : 's'}, ` +
          `below the threshold of ${WEAK_CROSSREF_VOTES}. Real, and not strong enough ` +
          `to call verified.`,
      });
      continue;
    }
    checks.push({
      kind: 'cross-reference-unknown',
      status: 'pass',
      claim: `${formatRef(from)} is connected to ${formatRef(parsed.ref)}`,
      detail: `Attested with ${votes} votes.`,
    });
  }
}

export function verifyItem(index: BuiltIndex, item: PlanItem): ItemReport {
  const checks: Check[] = [];
  const parsed = parseReference(index, item.reference);

  if (!parsed.ok) {
    const kind: CheckKind = /no book of the Bible/.test(parsed.reason)
      ? 'book-not-found'
      : 'reference-unparsable';
    checks.push({
      kind,
      status: 'fail',
      claim: `reference "${item.reference}"`,
      detail: `${parsed.reason.charAt(0).toUpperCase()}${parsed.reason.slice(1)}.`,
    });
    return { id: item.id, reference: item.reference, checks, status: 'fail' };
  }

  const ref = parsed.ref;
  const inRange = checkRange(index, ref, checks);

  if (inRange) {
    checks.push({
      kind: 'chapter-out-of-range',
      status: 'pass',
      claim: `reference "${item.reference}"`,
      detail: `Resolves to ${formatRef(ref)}, which exists.`,
    });
    if (item.quote) checkQuote(index, ref, item.quote, checks);
    if (item.crossReferences?.length) checkCrossRefs(index, ref, item.crossReferences, checks);
  }

  // Stated on every item, always. The limit of this approach is that prose is
  // not checked, and a reader who is not told that will read a green item as
  // "everything here is true". It is not: it is "every checkable claim here is
  // true". Burying that in a README would make the report quietly misleading.
  const prose = [item.title, item.note].filter(Boolean).length;
  checks.push({
    kind: 'prose-unchecked',
    status: 'unverifiable',
    claim: `${prose} prose field${prose === 1 ? '' : 's'} on this item`,
    detail:
      'Titles and notes are free text and are not checked against the index. ' +
      'A false statement written only in prose will not be caught here.',
  });

  const status: CheckStatus = checks.some((c) => c.status === 'fail')
    ? 'fail'
    : checks.some((c) => c.status === 'unverifiable' && c.kind !== 'prose-unchecked')
      ? 'unverifiable'
      : 'pass';

  return { id: item.id, reference: item.reference, resolved: formatRef(ref), checks, status };
}

export function verifyPlan(index: BuiltIndex, plan: StudyPlan): VerifyReport {
  const items = plan.items.map((item) => verifyItem(index, item));
  return {
    goal: plan.goal,
    generatedBy: plan.generatedBy,
    translation: index.translation,
    verifiedAt: new Date().toISOString(),
    items,
    passCount: items.filter((i) => i.status === 'pass').length,
    failCount: items.filter((i) => i.status === 'fail').length,
    unverifiableCount: items.filter((i) => i.status === 'unverifiable').length,
    sources: index.sources.map((s) => ({
      name: s.name,
      license: s.license,
      attribution: s.attribution,
    })),
  };
}

const MARK: Record<CheckStatus, string> = { pass: 'ok  ', fail: 'FAIL', unverifiable: '?   ' };

export function printReport(report: VerifyReport): void {
  console.log(`\nGoal        ${report.goal}`);
  console.log(`Generated   ${report.generatedBy}`);
  console.log(`Checked vs  ${report.translation}\n`);

  for (const item of report.items) {
    const head = item.resolved ? `${item.id}  ${item.resolved}` : `${item.id}  ${item.reference}`;
    console.log(`${MARK[item.status]} ${head}`);
    for (const check of item.checks) {
      if (check.status === 'pass') continue;
      console.log(`       ${MARK[check.status].trim()} ${check.kind}: ${check.claim}`);
      console.log(`            ${check.detail}`);
    }
  }

  console.log(
    `\n${report.passCount} passed, ${report.failCount} failed, ` +
      `${report.unverifiableCount} with claims that cannot be checked.`,
  );
  for (const s of report.sources) console.log(`\n${s.attribution}`);
}
