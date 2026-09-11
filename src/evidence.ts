/**
 * Builds the evidence pack a generation prompt is given.
 *
 * The generator is not asked to recall the Bible. It is handed a block of
 * facts read out of the index and told to work from those, because a claim it
 * copies out of the evidence is a claim the verifier can confirm, and a claim
 * it recalls is a claim that has to be caught afterwards. Neither half is
 * sufficient on its own: grounding cuts the error rate, verification catches
 * what grounding misses, and the report says which claims were checked.
 *
 * Every fact in the pack is derived from the two sources in DATA-LICENSES.md.
 * Nothing here is written by hand, and nothing is an opinion about the text.
 */
import type { BuiltIndex, IndexBook } from './index-types';
import { findBookInProse } from './reference';

/** Caps, so the prompt stays a readable size on a long book like Psalms. */
export const LIMITS = {
  /** Chapters listed with their opening line. */
  chapterAnchors: 60,
  /** Verses ranked by how heavily the source cross-references them. */
  hubVerses: 25,
  /** Cross references shown per hub verse. */
  linksPerHub: 5,
  /** Characters of a verse shown as an anchor before it is cut. */
  anchorChars: 110,
};

export interface HubVerse {
  reference: string;
  text: string;
  /** Total vote weight of every link out of this verse. */
  weight: number;
  links: { reference: string; votes: number }[];
}

export interface EvidencePack {
  goal: string;
  book: IndexBook;
  translation: string;
  /** One line per chapter: number, verse count, and the chapter's opening words. */
  chapters: { chapter: number; verses: number; opening: string }[];
  chaptersTruncated: number;
  hubs: HubVerse[];
}

function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}...`;
}

function refString(index: BuiltIndex, key: string): string {
  const [bookId, chapter, verse] = key.split('.');
  const book = index.books.find((b) => b.id === bookId);
  if (!book) return key;
  return book.singleChapter ? `${book.name} ${verse}` : `${book.name} ${chapter}:${verse}`;
}

/**
 * Resolves the book a goal is about.
 *
 * A goal like "understand Romans in 6 weeks" names its book in prose, so the
 * whole string is handed to the reference parser, which finds the longest book
 * alias in it. When no book is named the error says so plainly instead of
 * quietly defaulting to Genesis, because a pack built for the wrong book
 * produces a plan that verifies clean and answers a question nobody asked.
 */
export function parseGoal(index: BuiltIndex, goal: string): IndexBook {
  const book = findBookInProse(index, goal);
  if (book) return book;
  throw new Error(
    `No book of the Bible is named in the goal "${goal}". This generator plans ` +
      `one book at a time, so the goal has to say which one, for example ` +
      `"understand Romans in 6 weeks".`,
  );
}

export function buildEvidence(index: BuiltIndex, goal: string): EvidencePack {
  const book = parseGoal(index, goal);
  const text = index.text[book.id] ?? [];

  const allChapters = book.verses.map((verses, i) => ({
    chapter: i + 1,
    verses,
    opening: clip(text[i]?.[0] ?? '', LIMITS.anchorChars),
  }));
  const chapters = allChapters.slice(0, LIMITS.chapterAnchors);

  // Which verses of this book the cross-reference source reaches for most.
  // This is the one genuinely interpretive-looking thing in the pack, and it
  // is not interpretation: it is the sum of vote weights on links out of each
  // verse, which is a measure of how often readers of a public dataset have
  // connected that verse to somewhere else.
  const scored: HubVerse[] = [];
  for (let ch = 1; ch <= book.chapters; ch += 1) {
    for (let v = 1; v <= (book.verses[ch - 1] ?? 0); v += 1) {
      const links = index.crossRefs[`${book.id}.${ch}.${v}`];
      if (!links?.length) continue;
      const weight = links.reduce((n, l) => n + Math.max(l.votes, 0), 0);
      if (weight <= 0) continue;
      scored.push({
        reference: book.singleChapter ? `${book.name} ${v}` : `${book.name} ${ch}:${v}`,
        text: clip(text[ch - 1]?.[v - 1] ?? '', LIMITS.anchorChars),
        weight,
        links: links.slice(0, LIMITS.linksPerHub).map((l) => ({
          reference: refString(index, l.to),
          votes: l.votes,
        })),
      });
    }
  }
  scored.sort((a, b) => b.weight - a.weight);

  return {
    goal,
    book,
    translation: index.translation,
    chapters,
    chaptersTruncated: allChapters.length - chapters.length,
    hubs: scored.slice(0, LIMITS.hubVerses),
  };
}

/** The pack as the text the prompt actually carries. */
export function renderEvidence(pack: EvidencePack): string {
  const lines: string[] = [];
  lines.push(`BOOK: ${pack.book.name}`);
  lines.push(`TESTAMENT: ${pack.book.testament}`);
  lines.push(`TRANSLATION: ${pack.translation}`);
  lines.push(`CHAPTERS: ${pack.book.chapters}`);
  lines.push('');

  lines.push('CHAPTERS (chapter, verse count, opening words)');
  for (const c of pack.chapters) {
    lines.push(`  ${pack.book.name} ${c.chapter}  (${c.verses} verses)  ${c.opening}`);
  }
  if (pack.chaptersTruncated > 0) {
    lines.push(`  ... and ${pack.chaptersTruncated} more chapters, not listed here.`);
  }
  lines.push('');

  lines.push('MOST CROSS-REFERENCED VERSES (by vote weight, from the cross-reference source)');
  for (const h of pack.hubs) {
    lines.push(`  ${h.reference}  (weight ${h.weight})  ${h.text}`);
    for (const l of h.links) {
      lines.push(`      links to ${l.reference} (${l.votes} votes)`);
    }
  }
  lines.push('');
  lines.push(
    'A verse count above is exact. A chapter not listed above still exists if its ' +
      'number is at most the CHAPTERS figure. Any cross reference you assert that is ' +
      'not in the list above will be checked against the full graph, not just this ' +
      'excerpt, so a real link you know of is fine; an invented one is not.',
  );
  return lines.join('\n');
}
