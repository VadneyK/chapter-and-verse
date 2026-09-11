# chapter-and-verse

An agent that writes a scripture study plan, and a verifier that checks every
factual claim in it against the Bible text before anything is shown to anyone.

Writing a plausible study plan is easy. Every AI scripture tool already does
it, and the output always looks right. The question none of them answer is
whether it is true. Does that verse exist. Does the chapter go that far. Does
the verse say what the plan says it says, or is that a different verse, or a
different translation, or nothing anyone ever wrote. A model produces a
confident, well formatted, subtly wrong answer to all of those, and a demo
never shows it, because the only way to find out is to check every claim
against the text one at a time, which is not what a demo does.

That check is the whole project. The generator is a few hundred lines. The
interesting part is what happens after it produces something.

## Quick start

```bash
npm install
npm run build-index  # builds out/index.json from the files in sources/
npm run verify       # checks the adversarial fixture
npm run report     # renders out/report.html
open out/report.html
```

Nothing there needs a network. Both data files are committed, because the
whole point of the license work was that they can be redistributed, and a
build that reaches out to a moving `master` branch and a zip the source
regenerates on a schedule is a build that gives a different answer next month.
`npm run fetch` refreshes them deliberately, and prints a SHA-256 for each so
a change is visible rather than silent.

The generator needs no network either. It runs in replay mode by default,
because a demo runs on conference wifi.

```bash
npm run selftest                                  # the loop, with a scripted model, no API key
npm run generate -- "understand Romans in 6 weeks"
```

## Which model

The generator talks to a model through a two-method interface, so which model
is a wiring decision rather than a rewrite. Three implementations ship:

| `LLM_PROVIDER` | Client | Model |
| --- | --- | --- |
| `nebius` (default) | Nebius Token Factory | `nvidia/nemotron-3-super-120b-a12b` |
| `anthropic` | Anthropic API | `claude-opus-5` |
| (either) with `LLM_MODE=replay` | recordings on disk | whichever made them |

Replay is the default, and a live call happens only when that provider's
credentials are actually present. Set `LLM_MODE=live` to force one, and every
response it gets is written to `fixtures/llm/` keyed by a hash of the model,
the system prompt, the messages and the schema. So a live run doubles as a
recording session, and changing one character of a prompt gives an honest
replay miss rather than a stale answer from the old wording.

The model is part of that key on purpose. A recording made by Claude is never
served for a request to Nemotron.

```bash
export NEBIUS_API_KEY=...          # from the Nebius Token Factory console
LLM_MODE=live npm run generate -- "understand Romans in 6 weeks"
npm run verify -- out/plan.json && npm run report
```

`NEBIUS_MODEL` and `NEBIUS_BASE_URL` override the defaults. Nebius publishes
two spellings of the host, plain and region-qualified; the plain one is the
default because it is the one that answered.

**The Nebius client has never been run against a live endpoint.** The base URL
was confirmed to exist, the model id is the one Nebius publishes in its own
Nemotron sample, and the rest is written from the OpenAI-compatible contract.
Two places are most likely to need a correction on a first real run, and both
say so in a comment: whether reasoning arrives in a separate field or as an
inline `<think>` block, and whether the schema is accepted in the shape sent.
The self-test covers every path that works without a key and deliberately does
not fake a response, because asserting against a reply nobody has seen is the
unearned confidence the rest of this repo exists to catch.

An open-weight model is the more interesting subject anyway. Open models
misattribute citations more often than frontier ones, so the verifier has more
to catch and the demo shows more of it working.

## Why the index is built from scratch

An earlier prototype of this checked plans against a structured index that
belonged to a friend's scripture app, used with permission. That still left
two problems.

The first is that data shared with you is not data you can redistribute. That
index was built for one app, not to be handed onward, and every time somebody
wanted to run the verifier the answer would have been "ask him first". A tool
whose entire authority rests on the data it checks against should be able to
ship that data without anyone's permission being the load-bearing part.

The second is that the data could not answer the question. It carried chapter
counts and no verse counts, so `Romans 8:999` and `Romans 8:28` were
indistinguishable to it. The honest thing to report was "cannot be checked",
and an adversarial audit of that prototype had six invented claims passing out
of six.

So the index is rebuilt here from two sources anyone can redistribute, and the
rebuild bought three checks the old one could not make at all. The
redistribution problem and the capability problem had the same fix.

## What it checks

All ten checks run against `out/index.json`, which is built from the Bible
text itself and a public cross-reference dataset. Nothing is hand-curated.

| Check | Fails when |
| --- | --- |
| `book-not-found` | The reference names no book of the Bible. |
| `reference-unparsable` | A book is named but the rest is not a chapter or verse reference. Comma-separated lists are rejected rather than half-checked. |
| `chapter-out-of-range` | The chapter is past the end of the book. |
| `verse-out-of-range` | The verse is past the end of that chapter. Both ends of a range are bounded, so `Romans 3:23-400` fails on the 400. |
| `quote-mismatch` | The quoted text appears nowhere in the translation the index was built from. |
| `quote-misattributed` | The quoted text is real, and belongs to a different passage. |
| `cross-reference-unparsable` | A claimed related passage is not a resolvable reference. |
| `cross-reference-unknown` | Two real passages, and the source attests no link between them. |
| `cross-reference-weak` | The link is real but thinly attested. Reported as unverifiable, never as a pass. |
| `prose-unchecked` | Always. See below. |

Three of those are new capability rather than a stricter version of something
that already existed.

**`verse-out-of-range`** is the one the rebuild was for. Verse counts come
from counting the verses.

**`quote-misattributed`** is the check a reference checker structurally cannot
make. `Romans 8:28` is a real reference. `For God so loved the world...` is a
real verse. The pairing is false, and a checker that validates the reference
and the quote separately passes it. This one compares the quote to the text at
the cited reference, and when it does not match, searches the rest of the
translation before deciding what to say. A quote found elsewhere is reported
as a misattribution and named. A quote found nowhere is reported as not being
in this translation, which usually means another translation or an invention,
and the report says that rather than deciding which.

**`cross-reference-weak`** exists because the cross-reference source carries a
vote weight per link and lets readers vote links down. A link sitting at two
votes is a suggestion. Reporting it as verified would be the same overclaim
the project exists to catch, so it is reported as attested and weak.

## What it does not check

Titles and notes are free text and are not checked against anything. An item
whose every structured claim is true will show as verified even if its title
says Paul was shipwrecked in Romans 9.

This limit is printed on every item in every report, not filed in a README.
A green row that quietly means less than it looks like is the exact failure
mode this project is about, and a verifier that hides its own blind spot is
worse than no verifier, because it converts an unchecked claim into a claim
the reader now believes was checked.

`fixtures/plan-that-slips-through.json` includes that title-only lie as an
item, so every run of the demo displays the limit rather than describing it.

## The adversarial fixture

Ten items. Seven make a false claim, each false in a different way, and each
one grounded in a value read out of the built index rather than recalled.

```
$ npm run verify

FAIL adv-verse-out-of-range    Romans 8:999      Romans 8 has 39 verses.
FAIL adv-verse-range-off-end   Romans 3:23-400   Romans 3 has 31 verses.
FAIL adv-chapter-out-of-range  Romans 17         Romans has 16 chapters.
FAIL adv-quote-misattributed   Romans 8:28       That text is in John 3.
FAIL adv-quote-other-translat  Romans 8:28       No passage carries that wording (ESV).
FAIL adv-crossref-invented     Romans 12         No attested link to Leviticus 11.
?    adv-crossref-weak         Romans 12:3       Titus 2:6, 2 votes, under the threshold.
ok   adv-single-chapter-trap   Jude 3
ok   adv-title-lie             Romans 9
ok   adv-control-clean         Romans 8:28

6 failed, 1 unverifiable, 3 passed.
```

The three that pass are the two controls and the title-only lie, which is the
stated limit. The single-chapter control is there because it is the most
common way a reference parser is quietly wrong: `Jude 3` means verse 3, not
chapter 3, and a parser that misses it reports a false failure on every
correct citation of Obadiah, Philemon, 2 John, 3 John and Jude.

## The loop, and the self-test

The generator gets an evidence pack read out of the index: the book's chapters
with exact verse counts and opening lines, and the verses the cross-reference
source links most heavily. It is asked to work from that rather than from
memory, because a claim copied out of the evidence is a claim the verifier can
confirm.

Grounding is not enough on its own, which is why the loop exists:

1. Generate.
2. Verify every item independently.
3. Send the failures back with the exact check that failed.
4. Repeat up to twice.
5. Ship what passes. Drop what never does, and record it in the trace.

Step 5 is the part that matters. A plan that quietly keeps an unverified item
is the thing this prevents. A short true plan beats a long plausible one.

Items that come back **unverifiable** are not sent for repair. Unverifiable is
an honest answer, not a defect, and prompting the model until it disappears
would train it to strip exactly the claims worth surfacing.

`npm run selftest` runs that loop against a scripted stand-in model, with no
API key and no network, and asserts ten things about it, including that round
one catches the out-of-range verse, the invented cross reference and the
misattributed quote, that the unverifiable item never appears in the repair
prompt, and that the item which never verifies is dropped rather than shipped.

## Data

Two sources, and nothing else. Both are quoted verbatim with the URL and the
date read in [DATA-LICENSES.md](DATA-LICENSES.md).

| Source | License | What it gives |
| --- | --- | --- |
| Berean Standard Bible, via [scrollmapper/bible_databases](https://github.com/scrollmapper/bible_databases) | Public domain since 2023-04-30 | 66 books, 1,189 chapters, 31,102 verses, and the verse text |
| Cross references, [OpenBible.info](https://www.openbible.info/labs/cross-references/) | CC BY | 344,755 usable links over 29,362 source verses, with vote weights |

Cross-reference data from OpenBible.info, licensed CC BY.

`scripts/fetch-sources.sh` prints a SHA-256 for each file, and the build
records both digests into `out/index.json`, so any report can be traced back
to the exact bytes it was checked against.

## Layout

```
src/books.ts         the 66-book table: source name, cross-reference code, aliases
src/build-index.ts   builds out/index.json from sources/
src/reference.ts     reference parsing, kept separate because this is where false passes start
src/verify.ts        the ten checks, a library with no side effects on import
src/evidence.ts      the evidence pack handed to the generator
src/llm.ts           model client, replay by default, recording in live mode
src/generate.ts      the generate, verify, repair loop
src/report.ts        renders a self-contained HTML report
src/selftest.ts      the loop against a scripted model, no key needed
```

The CLIs are separate files from the libraries they wrap. Under vite-node,
`process.argv[1]` is the vite-node binary, so the usual "was I invoked
directly" guard never fires and every import of the library re-runs the demo.

## License

MIT, see [LICENSE](LICENSE). The data terms are separate and travel with the
built index; see [DATA-LICENSES.md](DATA-LICENSES.md).
