/**
 * Renders out/verify-report.json into a self-contained out/report.html.
 *
 * One file, no network, no fonts to fetch, no script tags loading anything.
 * It opens from a USB stick on a laptop that has never had wifi, which is the
 * environment a demo actually runs in.
 *
 * The page shows the verse text each item was checked against, straight out of
 * the index. That is the part a reader can evaluate without trusting anything:
 * the claim, the text, and whether they match, side by side. A checker that
 * only prints "pass" asks for exactly the trust it is supposed to be replacing.
 *
 * Run: npm run report
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BuiltIndex } from './index-types';
import { formatRef, parseReference, textFor, versesIn } from './reference';
import type { PlanItem, StudyPlan } from './schema';
import type { Check, CheckStatus, ItemReport, VerifyReport } from './verify';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'out');

/** Longest stretch of verse text shown inline before it is cut. */
const MAX_TEXT_CHARS = 900;

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const LABEL: Record<CheckStatus, string> = {
  pass: 'verified',
  fail: 'failed',
  unverifiable: 'cannot be confirmed',
};

function checkRow(check: Check): string {
  return `
      <li class="check check--${check.status}">
        <span class="check__kind">${esc(check.kind)}</span>
        <span class="check__claim">${esc(check.claim)}</span>
        <p class="check__detail">${esc(check.detail)}</p>
      </li>`;
}

/**
 * The passage itself. Verse numbers are rendered, because a report about
 * whether a verse exists that does not show you the verses is asking to be
 * taken at its word.
 */
function passage(index: BuiltIndex, reference: string, partial: boolean): string {
  const parsed = parseReference(index, reference);
  if (!parsed.ok) return '';
  const ref = parsed.ref;
  const verses = versesIn(index, ref);
  if (!verses.length) return '';

  const full = textFor(index, ref);
  const chapters = index.text[ref.book.id] ?? [];
  let used = 0;
  const parts: string[] = [];
  for (const { chapter, verse } of verses) {
    const text = chapters[chapter - 1]?.[verse - 1] ?? '';
    if (!text) continue;
    if (used + text.length > MAX_TEXT_CHARS && parts.length) break;
    used += text.length;
    parts.push(`<sup>${verse}</sup>${esc(text)}`);
  }
  const cut = used < full.length;

  // When the reference ran past the end of the book, versesIn clamps to what
  // exists, so what is rendered is a real passage under a reference that is
  // not. Say so on the citation. Showing the clamped text without the caveat
  // would be the report making the same unstated assumption it is meant to
  // catch.
  const lead = partial
    ? `Only part of "${esc(reference)}" exists. Showing ${esc(formatRef(ref))}`
    : esc(formatRef(ref));

  return `
      <blockquote class="passage">
        <p>${parts.join(' ')}${cut ? ' <span class="passage__cut">...</span>' : ''}</p>
        <cite>${lead}, ${esc(index.translation)}${
          cut ? `, first ${parts.length} of ${verses.length} verses shown` : ''
        }</cite>
      </blockquote>`;
}

function itemBlock(index: BuiltIndex, report: ItemReport, item: PlanItem | undefined): string {
  const title = item?.title ?? report.id;
  const shown = report.checks.filter((c) => c.status !== 'pass' || c.kind !== 'chapter-out-of-range');
  const open = report.status !== 'pass' ? ' open' : '';
  const partial = report.checks.some(
    (c) =>
      c.status === 'fail' && (c.kind === 'chapter-out-of-range' || c.kind === 'verse-out-of-range'),
  );

  const quote = item?.quote
    ? `
      <div class="claimed">
        <span class="claimed__label">Quoted by the plan</span>
        <p>${esc(item.quote)}</p>
      </div>`
    : '';

  return `
    <details class="item item--${report.status}"${open}>
      <summary>
        <span class="item__status" aria-label="${LABEL[report.status]}">${LABEL[report.status]}</span>
        <span class="item__title">${esc(title)}</span>
        <span class="item__ref">${esc(report.resolved ?? report.reference)}</span>
      </summary>
      <div class="item__body">
        ${item?.note ? `<p class="item__note">${esc(item.note)}</p>` : ''}
        ${quote}
        ${passage(index, report.reference, partial)}
        <ul class="checks">${shown.map(checkRow).join('')}</ul>
      </div>
    </details>`;
}

function page(index: BuiltIndex, report: VerifyReport, plan: StudyPlan | null): string {
  const byId = new Map((plan?.items ?? []).map((i) => [i.id, i]));
  const total = report.items.length;

  const sources = report.sources
    .map((s) => `<li><strong>${esc(s.name)}</strong> (${esc(s.license)}). ${esc(s.attribution)}</li>`)
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Verification report</title>
<style>
  :root {
    --ground: #fbfbfc;
    --panel: #ffffff;
    --ink: #16181d;
    --muted: #5d6370;
    --line: #e2e5ea;
    --accent: #2f4b7c;
    --pass: #1b6b45;
    --fail: #a92a1c;
    --unknown: #7d6318;
    --pass-bg: #e9f4ee;
    --fail-bg: #fbeceb;
    --unknown-bg: #f7f1e0;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --ground: #0f1115;
      --panel: #161a21;
      --ink: #e6e9ef;
      --muted: #99a1b0;
      --line: #262c36;
      --accent: #86a8dd;
      --pass: #6dc296;
      --fail: #ef8478;
      --unknown: #d6b866;
      --pass-bg: #14251d;
      --fail-bg: #2a1715;
      --unknown-bg: #262013;
    }
  }
  :root[data-theme="dark"] {
    --ground: #0f1115; --panel: #161a21; --ink: #e6e9ef; --muted: #99a1b0;
    --line: #262c36; --accent: #86a8dd; --pass: #6dc296; --fail: #ef8478;
    --unknown: #d6b866; --pass-bg: #14251d; --fail-bg: #2a1715; --unknown-bg: #262013;
  }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--ground);
    color: var(--ink);
    font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 58rem; margin: 0 auto; padding: 3rem 1.25rem 5rem; }

  header { border-bottom: 2px solid var(--ink); padding-bottom: 1.25rem; }
  .eyebrow {
    font-size: .72rem; letter-spacing: .13em; text-transform: uppercase;
    color: var(--accent); font-weight: 650; margin: 0 0 .6rem;
  }
  h1 { font-size: clamp(1.5rem, 3.4vw, 2.1rem); line-height: 1.2; margin: 0 0 .5rem; text-wrap: balance; }
  .meta { color: var(--muted); font-size: .87rem; margin: 0; }

  .tally { display: flex; flex-wrap: wrap; gap: .5rem; margin: 1.5rem 0 2.25rem; }
  .tally__cell {
    flex: 1 1 9rem; padding: .8rem .95rem; border: 1px solid var(--line);
    border-radius: 3px; background: var(--panel);
  }
  .tally__n { font-size: 1.7rem; font-weight: 660; font-variant-numeric: tabular-nums; line-height: 1; }
  .tally__k { display: block; font-size: .78rem; color: var(--muted); margin-top: .35rem; }
  .tally__cell--pass .tally__n { color: var(--pass); }
  .tally__cell--fail .tally__n { color: var(--fail); }
  .tally__cell--unknown .tally__n { color: var(--unknown); }

  h2 { font-size: .78rem; letter-spacing: .12em; text-transform: uppercase;
       color: var(--muted); font-weight: 650; margin: 2.5rem 0 .75rem; }

  .item { border: 1px solid var(--line); border-radius: 3px; background: var(--panel); margin-bottom: .5rem; }
  .item--fail { border-left: 3px solid var(--fail); }
  .item--unverifiable { border-left: 3px solid var(--unknown); }
  .item--pass { border-left: 3px solid var(--pass); }
  summary {
    display: grid; grid-template-columns: 9.5rem 1fr auto; gap: .75rem; align-items: baseline;
    padding: .8rem .95rem; cursor: pointer; list-style: none;
  }
  summary::-webkit-details-marker { display: none; }
  summary:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .item__status { font-size: .72rem; letter-spacing: .06em; text-transform: uppercase; font-weight: 650; }
  .item--pass .item__status { color: var(--pass); }
  .item--fail .item__status { color: var(--fail); }
  .item--unverifiable .item__status { color: var(--unknown); }
  .item__title { font-weight: 550; }
  .item__ref { color: var(--muted); font-size: .85rem; white-space: nowrap; }
  .item__body { padding: 0 .95rem 1rem; border-top: 1px solid var(--line); }
  .item__note { color: var(--muted); font-size: .87rem; margin: .9rem 0 0; }

  .claimed { margin: 1rem 0 0; padding: .7rem .85rem; border: 1px dashed var(--line); border-radius: 3px; }
  .claimed__label { font-size: .7rem; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
  .claimed p { margin: .35rem 0 0; font-family: Georgia, "Iowan Old Style", Cambria, serif; }

  .passage { margin: 1rem 0 0; padding: 0 0 0 1rem; border-left: 2px solid var(--line); }
  .passage p { margin: 0; font-family: Georgia, "Iowan Old Style", Cambria, serif; font-size: 1rem; }
  .passage sup { color: var(--accent); font-size: .68em; padding-right: .18em; font-family: ui-sans-serif, system-ui, sans-serif; }
  .passage cite { display: block; margin-top: .5rem; font-style: normal; font-size: .78rem; color: var(--muted); }
  .passage__cut { color: var(--muted); }

  .checks { list-style: none; margin: 1.1rem 0 0; padding: 0; display: flex; flex-direction: column; gap: .4rem; }
  .check { padding: .55rem .7rem; border-radius: 3px; font-size: .87rem; }
  .check--pass { background: var(--pass-bg); }
  .check--fail { background: var(--fail-bg); }
  .check--unverifiable { background: var(--unknown-bg); }
  .check__kind {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .76rem;
    padding: .1rem .35rem; border-radius: 2px; background: rgba(128,128,128,.16);
  }
  .check__claim { margin-left: .45rem; }
  .check__detail { margin: .35rem 0 0; color: var(--muted); }

  .limit { margin: 2.5rem 0 0; padding: 1rem 1.15rem; border: 1px solid var(--line);
           border-left: 3px solid var(--accent); border-radius: 3px; background: var(--panel); }
  .limit p { margin: 0; font-size: .89rem; }
  .limit p + p { margin-top: .6rem; }

  footer { margin-top: 3rem; padding-top: 1.25rem; border-top: 1px solid var(--line);
           color: var(--muted); font-size: .82rem; }
  footer ul { margin: .6rem 0 0; padding-left: 1.1rem; display: flex; flex-direction: column; gap: .4rem; }
  footer strong { color: var(--ink); font-weight: 600; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <p class="eyebrow">Verification report</p>
    <h1>${esc(report.goal)}</h1>
    <p class="meta">
      ${esc(report.generatedBy)} &middot; checked against ${esc(report.translation)}
      &middot; ${esc(report.verifiedAt.replace('T', ' ').slice(0, 16))} UTC
    </p>
  </header>

  <div class="tally">
    <div class="tally__cell"><span class="tally__n">${total}</span><span class="tally__k">items checked</span></div>
    <div class="tally__cell tally__cell--pass"><span class="tally__n">${report.passCount}</span><span class="tally__k">every claim verified</span></div>
    <div class="tally__cell tally__cell--fail"><span class="tally__n">${report.failCount}</span><span class="tally__k">a claim the text contradicts</span></div>
    <div class="tally__cell tally__cell--unknown"><span class="tally__n">${report.unverifiableCount}</span><span class="tally__k">a claim that cannot be confirmed</span></div>
  </div>

  <h2>Items</h2>
  ${report.items.map((r) => itemBlock(index, r, byId.get(r.id))).join('')}

  <div class="limit">
    <p><strong>What this report does not cover.</strong> Titles and notes are free text and
    are not checked against anything. An item whose every structured claim is true will show
    as verified even if its title says something false. That limit is listed on each item
    rather than left in a README, because a green row that quietly means less than it looks
    like is the failure this project is about.</p>
    <p>"Cannot be confirmed" is its own outcome and never rounds up to verified. A cross
    reference the source attests weakly is real and is reported as weak.</p>
  </div>

  <footer>
    Built from two outside sources and nothing else. Both are quoted in full, with the date
    read, in DATA-LICENSES.md.
    <ul>${sources}</ul>
  </footer>
</div>
</body>
</html>
`;
}

function main() {
  const reportPath = path.join(OUT, 'verify-report.json');
  if (!fs.existsSync(reportPath)) {
    console.error('No out/verify-report.json. Run "npm run verify" first.');
    process.exit(1);
  }
  const indexPath = path.join(OUT, 'index.json');
  if (!fs.existsSync(indexPath)) {
    console.error('No out/index.json. Run "npm run build" first.');
    process.exit(1);
  }

  const index: BuiltIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const report: VerifyReport = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const planPath = path.join(OUT, 'verified-plan.json');
  const plan: StudyPlan | null = fs.existsSync(planPath)
    ? JSON.parse(fs.readFileSync(planPath, 'utf8'))
    : null;

  const html = page(index, report, plan);
  const outFile = path.join(OUT, 'report.html');
  fs.writeFileSync(outFile, html);
  console.log(`Wrote out/report.html (${(html.length / 1024).toFixed(0)} KB)`);
}

main();
