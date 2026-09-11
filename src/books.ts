/**
 * The 66-book table.
 *
 * Written out by hand rather than derived, because three things have to line
 * up and only one of them is in either source file: the name the BSB JSON
 * uses, the code the cross-reference file uses, and the name a person would
 * actually type. Deriving the second from the first is guesswork ("I Samuel"
 * to "1Sam"), and guessing wrong silently drops a book's cross references.
 *
 * `extra` holds aliases that cannot be generated from the display name:
 * abbreviations, older names, and spellings in common use.
 */

export interface BookSeed {
  /** Exactly as it appears in sources/BSB.json. */
  source: string;
  /** Display name used everywhere else. */
  name: string;
  /** OSIS-style code used by sources/cross_references.txt. */
  code: string;
  testament: 'OT' | 'NT';
  extra: string[];
}

export const BOOK_SEEDS: BookSeed[] = [
  { source: 'Genesis', name: 'Genesis', code: 'Gen', testament: 'OT', extra: ['gen', 'ge', 'gn'] },
  { source: 'Exodus', name: 'Exodus', code: 'Exod', testament: 'OT', extra: ['exod', 'exo', 'ex'] },
  { source: 'Leviticus', name: 'Leviticus', code: 'Lev', testament: 'OT', extra: ['lev', 'lv'] },
  { source: 'Numbers', name: 'Numbers', code: 'Num', testament: 'OT', extra: ['num', 'nm', 'nu'] },
  { source: 'Deuteronomy', name: 'Deuteronomy', code: 'Deut', testament: 'OT', extra: ['deut', 'deu', 'dt'] },
  { source: 'Joshua', name: 'Joshua', code: 'Josh', testament: 'OT', extra: ['josh', 'jos'] },
  { source: 'Judges', name: 'Judges', code: 'Judg', testament: 'OT', extra: ['judg', 'jdg', 'jg'] },
  { source: 'Ruth', name: 'Ruth', code: 'Ruth', testament: 'OT', extra: ['rth', 'ru'] },
  { source: 'I Samuel', name: '1 Samuel', code: '1Sam', testament: 'OT', extra: ['1sam', '1sa', '1sm'] },
  { source: 'II Samuel', name: '2 Samuel', code: '2Sam', testament: 'OT', extra: ['2sam', '2sa', '2sm'] },
  { source: 'I Kings', name: '1 Kings', code: '1Kgs', testament: 'OT', extra: ['1kgs', '1kg', '1ki'] },
  { source: 'II Kings', name: '2 Kings', code: '2Kgs', testament: 'OT', extra: ['2kgs', '2kg', '2ki'] },
  { source: 'I Chronicles', name: '1 Chronicles', code: '1Chr', testament: 'OT', extra: ['1chr', '1ch', '1chron'] },
  { source: 'II Chronicles', name: '2 Chronicles', code: '2Chr', testament: 'OT', extra: ['2chr', '2ch', '2chron'] },
  { source: 'Ezra', name: 'Ezra', code: 'Ezra', testament: 'OT', extra: ['ezr'] },
  { source: 'Nehemiah', name: 'Nehemiah', code: 'Neh', testament: 'OT', extra: ['neh', 'ne'] },
  { source: 'Esther', name: 'Esther', code: 'Esth', testament: 'OT', extra: ['esth', 'est'] },
  { source: 'Job', name: 'Job', code: 'Job', testament: 'OT', extra: ['jb'] },
  { source: 'Psalms', name: 'Psalms', code: 'Ps', testament: 'OT', extra: ['ps', 'psa', 'psalm', 'pss'] },
  { source: 'Proverbs', name: 'Proverbs', code: 'Prov', testament: 'OT', extra: ['prov', 'prv', 'pr'] },
  { source: 'Ecclesiastes', name: 'Ecclesiastes', code: 'Eccl', testament: 'OT', extra: ['eccl', 'ecc', 'qoheleth'] },
  { source: 'Song of Solomon', name: 'Song of Solomon', code: 'Song', testament: 'OT', extra: ['song', 'song of songs', 'sos', 'canticles'] },
  { source: 'Isaiah', name: 'Isaiah', code: 'Isa', testament: 'OT', extra: ['isa', 'is'] },
  { source: 'Jeremiah', name: 'Jeremiah', code: 'Jer', testament: 'OT', extra: ['jer', 'jr'] },
  { source: 'Lamentations', name: 'Lamentations', code: 'Lam', testament: 'OT', extra: ['lam', 'lm'] },
  { source: 'Ezekiel', name: 'Ezekiel', code: 'Ezek', testament: 'OT', extra: ['ezek', 'eze', 'ezk'] },
  { source: 'Daniel', name: 'Daniel', code: 'Dan', testament: 'OT', extra: ['dan', 'dn'] },
  { source: 'Hosea', name: 'Hosea', code: 'Hos', testament: 'OT', extra: ['hos'] },
  { source: 'Joel', name: 'Joel', code: 'Joel', testament: 'OT', extra: ['jl'] },
  { source: 'Amos', name: 'Amos', code: 'Amos', testament: 'OT', extra: ['am'] },
  { source: 'Obadiah', name: 'Obadiah', code: 'Obad', testament: 'OT', extra: ['obad', 'oba', 'ob'] },
  { source: 'Jonah', name: 'Jonah', code: 'Jonah', testament: 'OT', extra: ['jon', 'jnh'] },
  { source: 'Micah', name: 'Micah', code: 'Mic', testament: 'OT', extra: ['mic', 'mc'] },
  { source: 'Nahum', name: 'Nahum', code: 'Nah', testament: 'OT', extra: ['nah', 'na'] },
  { source: 'Habakkuk', name: 'Habakkuk', code: 'Hab', testament: 'OT', extra: ['hab', 'hb'] },
  { source: 'Zephaniah', name: 'Zephaniah', code: 'Zeph', testament: 'OT', extra: ['zeph', 'zep', 'zp'] },
  { source: 'Haggai', name: 'Haggai', code: 'Hag', testament: 'OT', extra: ['hag', 'hg'] },
  { source: 'Zechariah', name: 'Zechariah', code: 'Zech', testament: 'OT', extra: ['zech', 'zec', 'zc'] },
  { source: 'Malachi', name: 'Malachi', code: 'Mal', testament: 'OT', extra: ['mal', 'ml'] },
  { source: 'Matthew', name: 'Matthew', code: 'Matt', testament: 'NT', extra: ['matt', 'mat', 'mt'] },
  { source: 'Mark', name: 'Mark', code: 'Mark', testament: 'NT', extra: ['mk', 'mrk'] },
  { source: 'Luke', name: 'Luke', code: 'Luke', testament: 'NT', extra: ['lk', 'luk'] },
  { source: 'John', name: 'John', code: 'John', testament: 'NT', extra: ['jn', 'jhn'] },
  { source: 'Acts', name: 'Acts', code: 'Acts', testament: 'NT', extra: ['ac', 'acts of the apostles'] },
  { source: 'Romans', name: 'Romans', code: 'Rom', testament: 'NT', extra: ['rom', 'rm'] },
  { source: 'I Corinthians', name: '1 Corinthians', code: '1Cor', testament: 'NT', extra: ['1cor', '1co'] },
  { source: 'II Corinthians', name: '2 Corinthians', code: '2Cor', testament: 'NT', extra: ['2cor', '2co'] },
  { source: 'Galatians', name: 'Galatians', code: 'Gal', testament: 'NT', extra: ['gal', 'ga'] },
  { source: 'Ephesians', name: 'Ephesians', code: 'Eph', testament: 'NT', extra: ['eph', 'ephes'] },
  { source: 'Philippians', name: 'Philippians', code: 'Phil', testament: 'NT', extra: ['phil', 'php', 'philip'] },
  { source: 'Colossians', name: 'Colossians', code: 'Col', testament: 'NT', extra: ['col'] },
  { source: 'I Thessalonians', name: '1 Thessalonians', code: '1Thess', testament: 'NT', extra: ['1thess', '1thes', '1th'] },
  { source: 'II Thessalonians', name: '2 Thessalonians', code: '2Thess', testament: 'NT', extra: ['2thess', '2thes', '2th'] },
  { source: 'I Timothy', name: '1 Timothy', code: '1Tim', testament: 'NT', extra: ['1tim', '1ti'] },
  { source: 'II Timothy', name: '2 Timothy', code: '2Tim', testament: 'NT', extra: ['2tim', '2ti'] },
  { source: 'Titus', name: 'Titus', code: 'Titus', testament: 'NT', extra: ['tit', 'ti'] },
  { source: 'Philemon', name: 'Philemon', code: 'Phlm', testament: 'NT', extra: ['phlm', 'phm', 'philem'] },
  { source: 'Hebrews', name: 'Hebrews', code: 'Heb', testament: 'NT', extra: ['heb'] },
  { source: 'James', name: 'James', code: 'Jas', testament: 'NT', extra: ['jas', 'jm'] },
  { source: 'I Peter', name: '1 Peter', code: '1Pet', testament: 'NT', extra: ['1pet', '1pe', '1pt'] },
  { source: 'II Peter', name: '2 Peter', code: '2Pet', testament: 'NT', extra: ['2pet', '2pe', '2pt'] },
  { source: 'I John', name: '1 John', code: '1John', testament: 'NT', extra: ['1john', '1jn', '1jo'] },
  { source: 'II John', name: '2 John', code: '2John', testament: 'NT', extra: ['2john', '2jn', '2jo'] },
  { source: 'III John', name: '3 John', code: '3John', testament: 'NT', extra: ['3john', '3jn', '3jo'] },
  { source: 'Jude', name: 'Jude', code: 'Jude', testament: 'NT', extra: ['jud', 'jde'] },
  { source: 'Revelation of John', name: 'Revelation', code: 'Rev', testament: 'NT', extra: ['rev', 'revelation of john', 'apocalypse', 'revelations'] },
];

/** Written-out ordinals accepted in place of a leading digit. */
const ORDINAL_PREFIXES: Record<string, string[]> = {
  '1': ['1', 'i', 'first', '1st'],
  '2': ['2', 'ii', 'second', '2nd'],
  '3': ['3', 'iii', 'third', '3rd'],
};

export function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Collapse whitespace and case so "  1   Cor " and "1 cor" match. */
export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Every accepted spelling of one book, lowercased and whitespace-collapsed.
 *
 * For a numbered book the leading digit is expanded across every ordinal form
 * and the separating space is made optional, so "2 Cor", "II Corinthians",
 * "2nd corinthians" and "2cor" all land on the same book.
 */
export function aliasesFor(seed: BookSeed): string[] {
  const out = new Set<string>();
  const add = (s: string) => {
    const n = normalizeName(s);
    if (n) out.add(n);
  };

  const forms = [seed.name, seed.code, ...seed.extra];
  for (const form of forms) {
    add(form);
    const m = /^([123])\s*(.+)$/.exec(normalizeName(form));
    if (!m) continue;
    const [, digit, rest] = m;
    for (const prefix of ORDINAL_PREFIXES[digit]) {
      add(`${prefix} ${rest}`);
      add(`${prefix}${rest}`);
    }
  }
  return [...out].sort();
}
