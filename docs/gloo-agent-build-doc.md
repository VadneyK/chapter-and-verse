# Agent Build Document

**chapter-and-verse**, for the Gloo AI Hackathon 2026, Track 1: Agents of Flourishing.

Draft. Kentaro submits; I do not. Sections marked **NEEDS KENTARO** cannot be
written from this machine.

- Repo: https://github.com/VadneyK/chapter-and-verse (public, MIT)
- Live report: https://vadneyk.github.io/chapter-and-verse/
- Data terms: [DATA-LICENSES.md](../DATA-LICENSES.md)

---

## 1. The user and the burden

**NEEDS KENTARO.** This section has to be written from one real conversation,
and the brief says so in as many words: "'Pastors' is not a user. 'A solo pastor
preparing for hospital visits on Monday morning' is."

The honest current state is a hypothesis, not a validated user: the volunteer
who writes the small-group discussion guide on a Wednesday night, who is not a
scholar, who now has a model that will write it in ten seconds and no way to
tell which parts of it are true.

Three questions, asked of one such person, turn this into a real section:

1. What do you actually do on Wednesday night to get that guide written?
2. What is the worst part of it?
3. Has anything you got from an AI tool ever turned out to be wrong?

Question 3 decides whether the premise holds. If nobody has been burned by a
confident wrong citation, that is worth knowing before October, not after.

Do not write hours saved into this section until somebody has said a number out
loud.

## 2. Architecture

A pipeline with a loop in the middle. One agent, no subagents. Decisions are
made in exactly two places, and only one of them is the model.

```
goal ──> build evidence pack        (code, reads the index)
             │
             v
         generate plan              (MODEL decides: what to include)
             │
             v
         verify every item          (CODE decides: what is true)
             │
      ┌──────┴───────┐
   all pass      some fail
      │              │
      │        send back the exact check that failed
      │              │            (up to 2 rounds)
      │              v
      │        still failing after round 3 ──> DROPPED, logged in the trace
      v
   ship what verified
```

The split is the whole design. The model decides what a study plan should
contain, which is a judgement. Code decides whether each claim is true, which is
not. Nothing the model says about its own accuracy is used anywhere.

Three outcomes, never two: `pass`, `fail`, and `unverifiable`. An item the data
cannot settle is reported as unverifiable and is **not** sent back for repair.
Prompting a model until an uncomfortable claim disappears teaches it to strip
the claims worth surfacing.

Control flow lives in `src/generate.ts`. The checks live in `src/verify.ts`,
which is a library with no side effects on import, so the verifier cannot be
influenced by the generator that calls it.

## 3. Prompts, verbatim

### Current system prompt

`src/generate.ts`, exported as `SYSTEM`:

```
You write scripture study plans, and every factual claim you make is checked against a public-domain index of the Bible text by a separate verifier before anything reaches a learner. Claims that fail are sent back to you once, and dropped from the plan if they fail again.

You will be given an evidence pack: one book's chapters with their exact verse counts and opening lines, and the verses that a public cross-reference dataset links most heavily, copied verbatim out of that index.

Rules that decide whether an item survives verification:

- A reference names one passage, never a list. "Romans 8", "Romans 8:28", "Romans 8:28-30", "Romans 8:28-9:2" are all fine. "Romans 8:28, 12:2" is not, and will be rejected rather than half-checked.
- The chapter must be within the book's chapter count, and the verse within that chapter's verse count. Both counts are exact numbers in the evidence pack. Do not reason about them from memory.
- One-chapter books (Obadiah, Philemon, 2 John, 3 John, Jude) are cited by verse alone: "Jude 3", not "Jude 1:3".
- Set "quote" only when you are reproducing the text at that reference word for word in the translation named in the evidence pack. The check is character by character after punctuation and case are set aside. A correct quote of the right verse in a different translation fails, and so does the right words at the wrong reference, which is the specific failure the checker was built for.
- Set "crossReferences" only to passages the cross-reference source actually links to yours. The pack lists the strongest links for the most-connected verses; the check runs against the whole graph, so a real link the pack did not show you is fine. An invented connection between two real passages is not, and it is the error that reads most convincingly.
- Leave a field out rather than guessing at it. An item with fewer claims that are all true is worth more than a rich item with one invented detail, because the invented one costs you the whole item.

Write for a learner, not for a database. Titles should read like something a person would put on a study plan. Spread items across the requested number of weeks, roughly evenly, and give each week a mix of reading, memory and question items.
```

### The repair turn

Only the failing items go back, each with the check that broke it. Built by
`repairPrompt`:

```ts
function repairPrompt(failures: RoundRecord['failures']): string {
  const lines = [
    `The verifier rejected ${failures.length} item(s). Each is listed with the check that failed.`,
    '',
  ];
  for (const f of failures) {
    lines.push(`item ${f.id} (${f.reference}):`);
    for (const r of f.reasons) lines.push(`  - ${r}`);
  }
  lines.push('');
  lines.push(
    'Return a corrected version of ONLY these items, keeping each id. Fix the claim that ' +
      'failed, or drop the field that carried it. Do not add new items and do not restate ' +
      'the items that passed.',
  );
  return lines.join('\n');
}
```

### An earlier version, and what was wrong with it

This is the system prompt from the first prototype, which checked plans against
a structured index borrowed from a friend's scripture app:

```
You write study plans for a scripture study app, and every factual claim you make is checked against the app's own structured data by a separate verifier before anything reaches a learner.

You will be given an evidence pack: one book's chapters, landmark verses, narrative episodes, key terms, people and eras, copied verbatim from that data.

Rules that decide whether an item survives verification:

- A reference must name the book in the evidence pack and a chapter within its chapter count. Verse references must be ones the pack lists.
- Every name in "people" must appear verbatim in the pack's people list.
- Every name in "events" must be an episode name or a dated event label from the pack, spelled the same way.
- Every name in "terms" must appear in the pack's key terms list.
- Set "era" only when you also name an event, and only to an era the pack lists for this book.
- Leave a field out rather than guessing at it. An item with fewer claims that are all true is worth more than a rich item with one invented detail, because the invented one gets the whole item dropped.

Write for a learner, not a database: titles should read like something a person would put on a study plan. Spread the items across the requested number of weeks, roughly evenly, and give each week a mix of reading, memory and question items.
```

Two things were wrong with it.

**It asked the model for claims the data could not actually check.** "people",
"events", "terms" and "era" were curated fields. The verifier could confirm that
a name appeared in the index, and could not confirm that the person appeared in
the chapter cited, because book-level was the finest grain the index had. So the
prompt was soliciting four kinds of claim while the checks behind three of them
were weaker than the prompt implied.

**It never mentioned quoting.** There was no quote field, so the single most
common way a scripture tool is wrong, putting real words at the wrong reference,
was not in the prompt and not in the checks. An adversarial audit of that
prototype passed six invented claims out of six.

The current prompt drops all four curated fields and adds two the index can
actually settle: `quote`, checked character for character against the text at the
cited reference, and `crossReferences`, checked against a 344,755-link graph with
vote weights. It also spells out the one-chapter-book rule, because "Jude 1:3"
is not how anyone cites Jude and the parser now says so.

## 4. Platform and stack

| | |
| --- | --- |
| Model | `nvidia/nemotron-3-super-120b-a12b` on Nebius Token Factory, with `claude-opus-5` as a second implementation |
| Why | The task is long-form structured generation under a schema. An open-weight model also misattributes citations more often than a frontier one, which makes the verifier's work visible rather than theoretical |
| Framework | None. TypeScript, `vite-node`, raw `fetch`. A two-method `Llm` interface with three implementations: Nebius, Anthropic, and a replay client |
| Orchestration | A `for` loop in `src/generate.ts`, at most three rounds |
| Memory | None between runs, by design. The message array within one run is the only state |
| Retrieval | No vector store. An evidence pack read directly out of a 15.7 MB local index |
| Data layer | `out/index.json`, built from two committed public-domain files. 66 books, 1,189 chapters, 31,102 verses with text, 344,755 cross references |
| Hosting | A CLI. The report is static HTML deployed to GitHub Pages by the same commands the README gives |
| Cost per run | **NEEDS A LIVE RUN.** Three rounds at roughly 6k input and 8k output each. The real figure goes here after the first recorded run, not an estimate |

Replay is the default mode, so the demo runs with no key and no network. That is
a deliberate choice about conference wifi, not a limitation.

## 5. Tools and permissions

The agent reaches exactly two things.

| Tool | Allowed to | Explicitly cannot |
| --- | --- | --- |
| The model endpoint | Send a system prompt, a message array and a JSON schema; receive one JSON object | Call any tool, browse, or read the filesystem. It gets text in and gives text back |
| The local index | Be read | Be written. The generator never writes to it, and the verifier opens it read-only |

It has no email, no calendar, no database, no payment path and no ability to
contact anyone. It writes two files, `out/plan.json` and
`out/generate-trace.json`, and nothing else. That is not a gap to be filled
later: an agent that decides what is true about Scripture should not also be
able to send it to anyone.

**Data provenance, as the brief requires it be stated:** no congregational,
donor, counselling or minor data of any kind. Two public sources, quoted verbatim
with the date read in `DATA-LICENSES.md`: the Berean Standard Bible, dedicated to
the public domain in April 2023, and OpenBible.info cross references under CC BY.

## 6. Evaluation

### The adversarial fixture

Ten hand-authored items in `fixtures/plan-that-slips-through.json`. Seven make a
false claim, each false in a different way, and every one is grounded in a number
read out of the built index rather than recalled. Ten hand-built cases, and
saying so is the point.

| Item | Claim | Expected |
| --- | --- | --- |
| verse out of range | Romans 8:999 | fail, Romans 8 has 39 verses |
| range off the end | Romans 3:23-400 | fail, Romans 3 has 31 verses |
| chapter out of range | Romans 17 | fail, Romans has 16 |
| misattributed quote | John 3:16's text, cited as Romans 8:28 | fail, and name John 3 |
| another translation | the ESV wording of Romans 8:28 | fail, no BSB passage carries it |
| invented connection | Romans 12 linked to Leviticus 11 | fail, nothing attests it |
| weak connection | Romans 12:3 linked to Titus 2:6, 2 votes | **unverifiable**, not fail |
| one-chapter book | Jude 3 | **pass**, control |
| a lie in the title only | "Romans 9 is where Paul is shipwrecked" | **pass**, the stated limit |
| everything true | Romans 8:28, real quote, 573-vote link | **pass**, control |

Result: 6 fail, 1 unverifiable, 3 pass. CI asserts on those three counts rather
than on an exit code, because an exit code goes green both when a tightening
breaks a control and when a loosening lets a lie through.

### The loop self-test

`npm run selftest` drives the full generate-verify-repair loop against a scripted
stand-in model, with no API key. Fifteen assertions. It proves that round one
catches the out-of-range verse, the invented link and the misattributed quote;
that the unverifiable item never appears in the repair prompt; that a repaired
item replaces its failed version rather than duplicating it; and that the item
which never verifies is dropped rather than shipped.

It deliberately does not fake a real model response. Asserting against a reply
nobody has seen is the unearned confidence this project exists to catch.

### Failure modes found, and what changed

- **Six of six invented claims passed the first verifier.** The index had chapter
  counts and no verse counts. Fixed by rebuilding the index from the Bible text,
  which also resolved a redistribution problem. Both problems had the same fix.
- **A real verse at the wrong reference passed everything.** Validating the
  reference and the quote separately cannot catch it. Added `quote-misattributed`.
- **`Jude 3` reported a false chapter-out-of-range.** A bare number in a
  one-chapter book is a verse. Without the fix, every correct citation of
  Obadiah, Philemon, 2 John, 3 John and Jude fails.
- **One error was reported twice** when a range's start and end were the same
  verse. Cosmetic, and it made one mistake look like two.
- **The report showed real text under an out-of-range reference** because the
  renderer clamps to what exists. It now says so on the citation.

### Session log

**NEEDS A LIVE RUN.** `out/generate-trace.json` records every round: the label,
whether it was live or replayed, how many items came back, how many verified, the
exact failures with their reasons, and what was dropped. It is written on every
run and is the auditable log this section wants. There is no recorded live trace
yet because there is no API key on this machine, and a fabricated one would be
the exact dishonesty the rest of this document is about.

## 7. Guardrails and human handoff

**What it will not do.** It takes no action in the world. It sends nothing,
publishes nothing, contacts nobody, changes no record and moves no money. There
is no path in the code for any of that, so there is no confirmation prompt to
bypass.

**It does not counsel, interpret or teach.** It assembles readings and questions
and checks them for factual truth. Whether a passage means what a person hopes it
means is not a question this system has, or should have, an opinion about.

**How it detects its limits.** By reporting three outcomes rather than two. A
claim the data cannot settle is `unverifiable` and says why, and it never rounds
up to a pass. A cross reference that is real but thinly attested is reported as
real and thin, with the vote count.

**The limit it states on every single item.** Titles and notes are free text and
are not checked. An item whose every structured claim is true will show as
verified even if its title says something false. Every report prints this on
every item, not in a footnote, because a green row that quietly means less than
it looks like is the failure this whole project is about. The adversarial fixture
includes exactly that lie so every run of the demo displays the limit rather than
describing it.

**Where control returns to a person.** At the end. The output is a plan and a
report, for a human to read and use or discard. Nothing ships past them.

**On the Scripture guardrail specifically:** the brief says do not fabricate
Scripture, do not misattribute it, cite translation and reference, and mark
interpretive framing as interpretation. The first three are the product. Every
report names the translation in its header and on every passage, and
`quote-misattributed` exists for the second one. The fourth is honoured by
omission: this system produces no interpretation to mark.

## 8. Reproduction

```bash
git clone https://github.com/VadneyK/chapter-and-verse
cd chapter-and-verse
npm install
npm run build-index   # from the two files committed in sources/
npm run verify        # the adversarial fixture
npm run report        # renders out/report.html
npm run selftest      # the full loop, scripted model, 15 assertions
```

No network and no credentials for any of that. To run the real generator:

```bash
export NEBIUS_API_KEY=...
LLM_MODE=live npm run generate -- "understand Romans in 6 weeks"
```

**Known gaps, stated rather than discovered by a judge.**

1. The Nebius client has never run against a live endpoint. Two branches in
   `src/llm.ts` are marked unverified: whether reasoning comes back in a separate
   field or an inline `<think>` block, and whether the schema envelope is accepted
   as sent.
2. No validated user. See section 1.
3. No cost figure. See section 4.
4. Prose is not checked. See section 7, and every report.
5. The index is a local file, not a live platform. The Bible track names
   YouVersion's platform as the expected Scripture layer; reading from it would
   close this and is the obvious next tool.
