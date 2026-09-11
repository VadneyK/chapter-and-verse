/**
 * Shape of `out/index.json`.
 *
 * Everything in here is derived from the two files named in DATA-LICENSES.md
 * and nothing else. There is no curated content, no hand-written commentary,
 * and no third-party dataset that would need a license check beyond those two.
 * That is deliberate: a verifier is only as trustworthy as the provenance of
 * what it verifies against, so the index carries its own provenance.
 */

export interface SourceRecord {
  name: string;
  url: string;
  license: string;
  licenseUrl: string;
  /** ISO date the file was downloaded. */
  retrieved: string;
  bytes: number;
  sha256: string;
  /** Printed verbatim wherever the index or a report built on it is shown. */
  attribution: string;
}

export interface IndexBook {
  /** Slug, e.g. "romans", "1-corinthians". Stable key everywhere else. */
  id: string;
  /** Display name, e.g. "Romans", "1 Corinthians". */
  name: string;
  /** OSIS-style code used by the cross-reference file, e.g. "Rom", "1Cor". */
  code: string;
  /** 1-66, canonical order. */
  order: number;
  testament: 'OT' | 'NT';
  chapters: number;
  /**
   * Verse count per chapter. `verses[0]` is chapter 1. This is the field the
   * whole project exists for: without it, "Romans 8:999" cannot be told apart
   * from "Romans 8:28" by anything except a human who knows the chapter.
   */
  verses: number[];
  /**
   * True for Obadiah, Philemon, 2 John, 3 John and Jude. In these books a
   * bare number means a verse, not a chapter: "Jude 3" is verse 3. Reference
   * parsers that miss this report a false chapter-out-of-range on every
   * correct citation of those five books.
   */
  singleChapter: boolean;
  /** Lowercased forms accepted when matching a reference string. */
  aliases: string[];
}

/** One cross reference, as `toKey` plus the vote weight the source assigns it. */
export interface CrossRef {
  /** Verse key, e.g. "romans.8.29". */
  to: string;
  /**
   * Vote weight from OpenBible.info. Higher means more strongly attested.
   * Can be negative: the source lets readers vote a link down.
   */
  votes: number;
}

export interface BuiltIndex {
  /** ISO timestamp of the build. */
  builtAt: string;
  /** Translation label, from the source file. Every quote check is against this. */
  translation: string;
  sources: SourceRecord[];
  books: IndexBook[];
  /**
   * Verse text, `text[bookId][chapterIndex][verseIndex]`. Chapter and verse
   * indexes are zero-based here and one-based everywhere a human sees them.
   */
  text: Record<string, string[][]>;
  /** Verse key ("genesis.1.1") to the verses the source links it to. */
  crossRefs: Record<string, CrossRef[]>;
  stats: {
    books: number;
    chapters: number;
    verses: number;
    crossRefRows: number;
    crossRefSourceVerses: number;
  };
}
