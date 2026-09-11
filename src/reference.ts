/**
 * Reference parsing.
 *
 * Separate from the verifier because almost every false pass in a checker like
 * this starts here. A parser that quietly throws away the part of a reference
 * it does not understand turns an unchecked claim into a passing one, which is
 * worse than refusing to parse it. So this module has one rule: anything it
 * cannot account for comes back as a failure with a reason, never as a
 * partially-parsed reference.
 */
import type { BuiltIndex, IndexBook } from './index-types';
import { normalizeName } from './books';

export interface ParsedRef {
  raw: string;
  book: IndexBook;
  /** Absent when the reference names only a book. */
  chapter?: number;
  /** Set for a chapter range, e.g. "Romans 8-9". */
  chapterEnd?: number;
  /** Absent when the reference stops at a chapter. */
  verse?: number;
  verseEnd?: number;
  /** The chapter `verseEnd` sits in, for a range that crosses a chapter. */
  verseEndChapter?: number;
  /** True when the reference names at least one verse. */
  hasVerse: boolean;
}

export type ParseResult =
  | { ok: true; ref: ParsedRef }
  | { ok: false; reason: string };

/**
 * Lowercase, collapse whitespace, and settle the three ways people write the
 * separators: a dot between digits means the same as a colon ("Rom 8.28"), a
 * dot anywhere else is an abbreviation mark, and every dash variant an editor
 * might have smart-substituted becomes a plain hyphen.
 */
export function normalizeRef(raw: string): string {
  return raw
    .replace(/[‐-―−]/g, '-')
    .replace(/(\d)\s*\.\s*(\d)/g, '$1:$2')
    .replace(/\./g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Alias list sorted longest first, so "1 john" wins over "john". */
let aliasCache: { index: BuiltIndex; entries: [string, IndexBook][] } | null = null;

function aliasEntries(index: BuiltIndex): [string, IndexBook][] {
  if (aliasCache && aliasCache.index === index) return aliasCache.entries;
  const entries: [string, IndexBook][] = [];
  for (const book of index.books) {
    for (const alias of book.aliases) entries.push([normalizeName(alias), book]);
  }
  entries.sort((a, b) => b[0].length - a[0].length);
  aliasCache = { index, entries };
  return entries;
}

/**
 * Longest alias that the string starts with, at a word boundary.
 *
 * The boundary matters in both directions. Without it "job" matches the start
 * of nothing useful but "jo" would match "john", and "1 john 2" would resolve
 * to John chapter 1. With it, an alias only matches when the next character is
 * a space, a digit, or the end of the string.
 */
function matchBook(index: BuiltIndex, s: string): { book: IndexBook; rest: string } | null {
  for (const [alias, book] of aliasEntries(index)) {
    if (!s.startsWith(alias)) continue;
    const next = s.charAt(alias.length);
    if (next === '' || next === ' ' || /\d/.test(next)) {
      return { book, rest: s.slice(alias.length).trim() };
    }
  }
  return null;
}

/**
 * Finds a book named anywhere inside a sentence, for goals like "understand
 * Romans in 6 weeks" where the book sits in the middle of prose.
 *
 * Only spellings of four characters or more, plus the three-letter display
 * name Job, are considered. Short abbreviations are fine in a reference, where
 * the string is nothing but a reference, and dangerous in prose: "am" is a
 * valid abbreviation for Amos and also sits in the middle of half the English
 * sentences anyone would write. Longest match wins, so "1 John" beats "John"
 * and "Romans" beats a stray "song".
 */
export function findBookInProse(index: BuiltIndex, text: string): IndexBook | null {
  const s = ` ${normalizeRef(text)} `;
  let best: { book: IndexBook; length: number } | null = null;
  for (const [alias, book] of aliasEntries(index)) {
    if (alias.length < 4 && alias !== 'job') continue;
    if (!s.includes(` ${alias} `) && !s.includes(` ${alias}`)) continue;
    // Word boundary on both sides: the alias must be preceded by a space and
    // followed by a space, a digit, or punctuation, never by another letter.
    const at = s.indexOf(` ${alias}`);
    const after = s.charAt(at + alias.length + 1);
    if (/[a-z]/.test(after)) continue;
    if (!best || alias.length > best.length) best = { book, length: alias.length };
  }
  return best?.book ?? null;
}

export function parseReference(index: BuiltIndex, raw: string): ParseResult {
  const s = normalizeRef(raw);
  if (!s) return { ok: false, reason: 'the reference is empty' };

  if (/[,;]/.test(s)) {
    return {
      ok: false,
      reason:
        'compound references are not supported. Cite one passage per item so ' +
        'each claim can be checked on its own',
    };
  }

  const hit = matchBook(index, s);
  if (!hit) {
    return { ok: false, reason: `no book of the Bible is named in "${raw}"` };
  }
  const { book, rest } = hit;

  if (!rest) {
    return { ok: true, ref: { raw, book, hasVerse: false } };
  }

  // Ranges that cross a chapter: "Romans 8:28-9:2".
  let m = /^(\d+):(\d+)\s*-\s*(\d+):(\d+)$/.exec(rest);
  if (m) {
    return {
      ok: true,
      ref: {
        raw,
        book,
        chapter: Number(m[1]),
        chapterEnd: Number(m[3]),
        verse: Number(m[2]),
        verseEnd: Number(m[4]),
        verseEndChapter: Number(m[3]),
        hasVerse: true,
      },
    };
  }

  // "Romans 8:28-30"
  m = /^(\d+):(\d+)\s*-\s*(\d+)$/.exec(rest);
  if (m) {
    return {
      ok: true,
      ref: {
        raw,
        book,
        chapter: Number(m[1]),
        verse: Number(m[2]),
        verseEnd: Number(m[3]),
        verseEndChapter: Number(m[1]),
        hasVerse: true,
      },
    };
  }

  // "Romans 8:28"
  m = /^(\d+):(\d+)$/.exec(rest);
  if (m) {
    return {
      ok: true,
      ref: {
        raw,
        book,
        chapter: Number(m[1]),
        verse: Number(m[2]),
        verseEnd: Number(m[2]),
        verseEndChapter: Number(m[1]),
        hasVerse: true,
      },
    };
  }

  // A bare number or number range. In a one-chapter book this is a verse, not
  // a chapter: "Jude 3" is verse 3 of the only chapter there is. Reading it as
  // a chapter reports a false chapter-out-of-range on every correct citation
  // of Obadiah, Philemon, 2 John, 3 John and Jude.
  m = /^(\d+)\s*-\s*(\d+)$/.exec(rest);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (book.singleChapter) {
      return {
        ok: true,
        ref: { raw, book, chapter: 1, verse: a, verseEnd: b, verseEndChapter: 1, hasVerse: true },
      };
    }
    return { ok: true, ref: { raw, book, chapter: a, chapterEnd: b, hasVerse: false } };
  }

  m = /^(\d+)$/.exec(rest);
  if (m) {
    const n = Number(m[1]);
    if (book.singleChapter) {
      return {
        ok: true,
        ref: { raw, book, chapter: 1, verse: n, verseEnd: n, verseEndChapter: 1, hasVerse: true },
      };
    }
    return { ok: true, ref: { raw, book, chapter: n, hasVerse: false } };
  }

  return {
    ok: false,
    reason: `"${rest}" after the book name is not a chapter or verse reference`,
  };
}

/** Human-readable form of a parsed reference, for report text. */
export function formatRef(ref: ParsedRef): string {
  const { book, chapter, chapterEnd, verse, verseEnd, verseEndChapter } = ref;
  if (chapter === undefined) return book.name;
  // One-chapter books are cited by verse alone, both by convention and by how
  // they were written. "Jude 1:3" is not wrong so much as not how anyone
  // writes it, and echoing a reference back in a form the reader did not use
  // makes a correct parse look like a misread one.
  if (book.singleChapter && verse !== undefined) {
    return verseEnd !== undefined && verseEnd !== verse
      ? `${book.name} ${verse}-${verseEnd}`
      : `${book.name} ${verse}`;
  }
  if (verse === undefined) {
    return chapterEnd && chapterEnd !== chapter
      ? `${book.name} ${chapter}-${chapterEnd}`
      : `${book.name} ${chapter}`;
  }
  if (verseEnd === undefined || verseEnd === verse) return `${book.name} ${chapter}:${verse}`;
  if (verseEndChapter && verseEndChapter !== chapter) {
    return `${book.name} ${chapter}:${verse}-${verseEndChapter}:${verseEnd}`;
  }
  return `${book.name} ${chapter}:${verse}-${verseEnd}`;
}

/** Every (chapter, verse) pair a parsed reference covers, bounded by the index. */
export function versesIn(index: BuiltIndex, ref: ParsedRef): { chapter: number; verse: number }[] {
  const { book } = ref;
  const out: { chapter: number; verse: number }[] = [];
  const count = (ch: number) => book.verses[ch - 1] ?? 0;

  if (ref.chapter === undefined) {
    for (let ch = 1; ch <= book.chapters; ch += 1) {
      for (let v = 1; v <= count(ch); v += 1) out.push({ chapter: ch, verse: v });
    }
    return out;
  }

  if (ref.verse === undefined) {
    const last = Math.min(ref.chapterEnd ?? ref.chapter, book.chapters);
    for (let ch = ref.chapter; ch <= last; ch += 1) {
      for (let v = 1; v <= count(ch); v += 1) out.push({ chapter: ch, verse: v });
    }
    return out;
  }

  const endChapter = Math.min(ref.verseEndChapter ?? ref.chapter, book.chapters);
  const endVerse = ref.verseEnd ?? ref.verse;
  for (let ch = ref.chapter; ch <= endChapter; ch += 1) {
    const first = ch === ref.chapter ? ref.verse : 1;
    const last = ch === endChapter ? Math.min(endVerse, count(ch)) : count(ch);
    for (let v = first; v <= last; v += 1) out.push({ chapter: ch, verse: v });
  }
  return out;
}

/** Verse text for a reference, joined with single spaces. Empty when out of range. */
export function textFor(index: BuiltIndex, ref: ParsedRef): string {
  const chapters = index.text[ref.book.id] ?? [];
  return versesIn(index, ref)
    .map(({ chapter, verse }) => chapters[chapter - 1]?.[verse - 1] ?? '')
    .filter(Boolean)
    .join(' ');
}
