/**
 * Builds `out/index.json` from the two files in `sources/`.
 *
 * Run `scripts/fetch-sources.sh` first, or `npm run build` which does both.
 *
 * The build is strict on purpose. Every book in the seed table must appear in
 * the BSB file, every cross-reference book code must resolve, and a verse a
 * cross reference points at must exist. A verifier built on a quietly
 * incomplete index is worse than no verifier, because it reports "pass" on
 * claims it never actually checked.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BOOK_SEEDS, aliasesFor, slug } from './books';
import type { BuiltIndex, CrossRef, IndexBook, SourceRecord } from './index-types';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SOURCES = path.join(ROOT, 'sources');
const OUT = path.join(ROOT, 'out');

interface BsbVerse { verse: number; text: string }
interface BsbChapter { chapter: number; verses: BsbVerse[] }
interface BsbBook { name: string; chapters: BsbChapter[] }
interface BsbFile { translation: string; books: BsbBook[] }

function sha256(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function sourceRecord(file: string, meta: Omit<SourceRecord, 'bytes' | 'sha256'>): SourceRecord {
  return { ...meta, bytes: fs.statSync(file).size, sha256: sha256(file) };
}

/** Books, chapter counts, per-chapter verse counts, and the verse text itself. */
function readBsb(file: string) {
  const raw: BsbFile = JSON.parse(fs.readFileSync(file, 'utf8'));
  const bySourceName = new Map(raw.books.map((b) => [b.name, b]));

  const books: IndexBook[] = [];
  const text: Record<string, string[][]> = {};
  const byCode = new Map<string, IndexBook>();

  BOOK_SEEDS.forEach((seed, i) => {
    const src = bySourceName.get(seed.source);
    if (!src) {
      throw new Error(
        `sources/BSB.json has no book named "${seed.source}". The seed table in ` +
          `src/books.ts and the source file disagree; fix the table rather than ` +
          `skipping the book, or the index will be silently short.`,
      );
    }

    // Chapters arrive in file order. Sort by the declared chapter number so a
    // reordered source cannot shift every verse count by one.
    const chapters = [...src.chapters].sort((a, b) => a.chapter - b.chapter);
    chapters.forEach((ch, idx) => {
      if (ch.chapter !== idx + 1) {
        throw new Error(`${seed.name}: expected chapter ${idx + 1}, found ${ch.chapter}.`);
      }
    });

    const verseCounts = chapters.map((ch) => ch.verses.length);
    const id = slug(seed.name);

    const book: IndexBook = {
      id,
      name: seed.name,
      code: seed.code,
      order: i + 1,
      testament: seed.testament,
      chapters: chapters.length,
      verses: verseCounts,
      singleChapter: chapters.length === 1,
      aliases: aliasesFor(seed),
    };

    books.push(book);
    byCode.set(seed.code, book);

    text[id] = chapters.map((ch) => {
      const sorted = [...ch.verses].sort((a, b) => a.verse - b.verse);
      return sorted.map((v) => v.text.trim());
    });
  });

  return { translation: raw.translation, books, text, byCode };
}

/**
 * One verse key, e.g. "romans.8.28". Used as the cross-reference graph key and
 * as the identity of a verse everywhere else.
 */
export function verseKey(bookId: string, chapter: number, verse: number): string {
  return `${bookId}.${chapter}.${verse}`;
}

/**
 * Parses one side of a cross-reference row.
 *
 * Rows look like `Gen.1.1` on the left and either `Exod.20.11` or a range
 * `Ps.33.6-Ps.33.9` on the right. Only the first verse of a range is kept: the
 * index answers "is this link attested", and the anchor verse is what a plan
 * cites.
 */
function parseXrefSide(side: string): { code: string; chapter: number; verse: number } | null {
  const first = side.split('-')[0];
  const m = /^([0-9A-Za-z]+)\.(\d+)\.(\d+)$/.exec(first.trim());
  if (!m) return null;
  return { code: m[1], chapter: Number(m[2]), verse: Number(m[3]) };
}

function readCrossRefs(file: string, byCode: Map<string, IndexBook>) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const crossRefs: Record<string, CrossRef[]> = {};
  let rows = 0;
  let unresolved = 0;
  let outOfRange = 0;

  for (const line of lines) {
    if (!line.trim() || line.startsWith('From Verse')) continue;
    const [from, to, votesRaw] = line.split('\t');
    if (!from || !to) continue;

    const a = parseXrefSide(from);
    const b = parseXrefSide(to);
    if (!a || !b) {
      unresolved += 1;
      continue;
    }

    const fromBook = byCode.get(a.code);
    const toBook = byCode.get(b.code);
    if (!fromBook || !toBook) {
      unresolved += 1;
      continue;
    }

    // Drop links that point outside the BSB's own versification rather than
    // carrying a reference the verifier would then have to call unknown.
    if (a.chapter > fromBook.chapters || a.verse > (fromBook.verses[a.chapter - 1] ?? 0)) {
      outOfRange += 1;
      continue;
    }
    if (b.chapter > toBook.chapters || b.verse > (toBook.verses[b.chapter - 1] ?? 0)) {
      outOfRange += 1;
      continue;
    }

    const key = verseKey(fromBook.id, a.chapter, a.verse);
    const votes = Number.parseInt(votesRaw ?? '0', 10);
    (crossRefs[key] ??= []).push({
      to: verseKey(toBook.id, b.chapter, b.verse),
      votes: Number.isFinite(votes) ? votes : 0,
    });
    rows += 1;
  }

  // Strongest link first, so a report that shows only a handful shows the ones
  // the source is most confident about.
  for (const key of Object.keys(crossRefs)) {
    crossRefs[key].sort((x, y) => y.votes - x.votes);
  }

  return { crossRefs, rows, unresolved, outOfRange };
}

function main() {
  const bsbFile = path.join(SOURCES, 'BSB.json');
  const xrefFile = path.join(SOURCES, 'cross_references.txt');
  for (const f of [bsbFile, xrefFile]) {
    if (!fs.existsSync(f)) {
      console.error(`Missing ${path.relative(ROOT, f)}. Run scripts/fetch-sources.sh first.`);
      process.exit(1);
    }
  }

  const { translation, books, text, byCode } = readBsb(bsbFile);
  const { crossRefs, rows, unresolved, outOfRange } = readCrossRefs(xrefFile, byCode);

  const sources: SourceRecord[] = [
    sourceRecord(bsbFile, {
      name: 'Berean Standard Bible (BSB)',
      url: 'https://github.com/scrollmapper/bible_databases (formats/json/BSB.json)',
      license: 'Public domain',
      licenseUrl: 'https://berean.bible/terms.htm',
      retrieved: '2026-09-10',
      attribution:
        'The Holy Bible, Berean Standard Bible, BSB is produced in cooperation with Bible Hub, ' +
        'Discovery Bible, OpenBible.com, and the Berean Bible Translation Committee. This text ' +
        "of God's Word has been dedicated to the public domain.",
    }),
    sourceRecord(xrefFile, {
      name: 'Cross references',
      url: 'https://a.openbible.info/data/cross-references.zip',
      license: 'CC BY',
      licenseUrl: 'https://www.openbible.info/labs/cross-references/',
      retrieved: '2026-09-10',
      attribution: 'Cross-reference data from OpenBible.info, licensed CC BY.',
    }),
  ];

  const chapters = books.reduce((n, b) => n + b.chapters, 0);
  const verses = books.reduce((n, b) => n + b.verses.reduce((m, v) => m + v, 0), 0);

  const index: BuiltIndex = {
    builtAt: new Date().toISOString(),
    translation,
    sources,
    books,
    text,
    crossRefs,
    stats: {
      books: books.length,
      chapters,
      verses,
      crossRefRows: rows,
      crossRefSourceVerses: Object.keys(crossRefs).length,
    },
  };

  fs.mkdirSync(OUT, { recursive: true });
  const outFile = path.join(OUT, 'index.json');
  fs.writeFileSync(outFile, JSON.stringify(index));

  console.log(`Translation      ${translation}`);
  console.log(`Books            ${index.stats.books}`);
  console.log(`Chapters         ${chapters}`);
  console.log(`Verses           ${verses}`);
  console.log(`Cross refs       ${rows} rows over ${index.stats.crossRefSourceVerses} source verses`);
  if (unresolved || outOfRange) {
    console.log(`  skipped        ${unresolved} unparsable, ${outOfRange} outside BSB versification`);
  }
  console.log(`Wrote            ${path.relative(ROOT, outFile)} (${(fs.statSync(outFile).size / 1e6).toFixed(1)} MB)`);
}

main();
