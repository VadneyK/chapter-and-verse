# Nebius x NVIDIA Global AI Hackathon

Everything the submission needs, in one file. Draft. Kentaro submits; I do not.

- Deadline: **2026-10-30, 10:00 PDT**
- Track: **Best Apps and Agents**
- Repo: https://github.com/VadneyK/chapter-and-verse (public, MIT)
- Demo: https://vadneyk.github.io/chapter-and-verse/
- Video: not filmed. Under three minutes, public on YouTube.

## Which requirements are met, and which are not

| Requirement | State |
| --- | --- |
| Public repo with an open source license file | Done. MIT, detected by GitHub. |
| README with setup instructions and clear guidance for running it | Done. Three commands, no network, no key. |
| A URL to a working demo | Done. The Pages deploy is built by the same commands the README gives. |
| A text description of features and functionality | Drafted below. |
| Runs on Nebius Token Factory or Nebius AI Cloud | Client written, **never run against a live endpoint**. Needs the key. |
| Uses at least one NVIDIA open source model | `nvidia/nemotron-3-super-120b-a12b` is the default model. Same blocker. |
| Documentation of how Nemotron and Token Factory were used | Below, and honest about what is unproven. |
| Video under three minutes on YouTube | Not filmed. |

The one blocker is a Nebius API key. Account creation is Kentaro's.

## How NVIDIA Nemotron is used

Nemotron is the generator. It is given a goal ("understand Romans in 6 weeks")
and an evidence pack read out of a public-domain index, and it writes a study
plan: readings, memory verses, questions, the verses each one quotes, and the
passages it claims are connected.

Then every factual claim it made is checked against the Bible text, one at a
time, by code that never asks the model anything. Claims that fail go back to
Nemotron with the exact check that failed. Claims that fail twice are dropped
from the plan rather than shipped.

The point of using an open-weight model here is not that it is cheaper. It is
that open-weight models misattribute citations more often than frontier models
do, which makes the verifier's job visible instead of theoretical. A checker
that never catches anything is indistinguishable from a checker that does not
work.

Model id: `nvidia/nemotron-3-super-120b-a12b`, the 120B hybrid MoE, chosen
because the task is long-form structured generation under a schema and a
reasoning model handles the "leave the field out rather than guess" rule
better than a small one. `NEBIUS_MODEL` overrides it.

## Where Token Factory carried the work

- **OpenAI-compatible chat completions** at `https://api.tokenfactory.nebius.com/v1`,
  reached with raw `fetch`. One POST per round, at most three rounds per plan.
- **Structured output** via `response_format: {type: 'json_schema'}`, which is
  what lets the project separate the two questions it cares about. Shape is
  guaranteed by the API; truth is not, and truth is the whole project. Strict
  mode is deliberately **off**: strict requires every declared property to be
  present, and the system prompt tells the model to leave a field out rather
  than guess at it.

No other Nebius service is used. There is no vector store, no fine-tune, no
hosted inference beyond the one endpoint, and the project says so rather than
padding the list.

## What is not yet true, stated plainly

The Nebius client has never seen a live response. The base URL was confirmed to
exist (it answers 401 without a token), the model id is the one Nebius
publishes in its own Nemotron sample, and the response handling is written from
the OpenAI-compatible contract. Two branches are marked in `src/llm.ts` as
unverified: whether reasoning arrives in a `reasoning_content` field or as an
inline `<think>` block, and whether the schema envelope is accepted as sent.

The self-test covers every path that works without a key, and deliberately does
not fake a model response, because asserting against a reply nobody has seen is
the unearned confidence this project exists to catch.

## The description, for the submission form

Draft, 238 words.

> Ask any model for a Bible study plan and you get one. It looks right. Some of
> it is not.
>
> chapter-and-verse generates a study plan with NVIDIA Nemotron on Nebius Token
> Factory, then checks every factual claim in it against the Bible text before
> anyone sees it. Ten checks, all grounded in two public-domain sources and
> nothing else: does the chapter exist, does the verse exist, does the verse say
> what the plan says it says, and is that connection between two passages real
> or invented.
>
> The check that matters most is the one a reference checker structurally cannot
> make. "Romans 8:28" is a real reference. "For God so loved the world" is a real
> verse. The pairing is false, and validating the reference and the quote
> separately passes it. This compares the quote to the text at the cited
> reference, and when it does not match, searches the rest of the translation
> before deciding what to say.
>
> Failed claims go back to Nemotron with the exact check that failed. Claims that
> fail twice are dropped rather than shipped. A claim the data cannot settle is
> reported as unverifiable, never rounded up to a pass, and the report states on
> every item that prose is not checked, because a green row that quietly means
> less than it looks like is the failure this exists to catch.
>
> The adversarial fixture holds ten items. Seven lie, in seven different ways.

## Things still to do

1. Get the key (Kentaro), then run live and commit the recorded fixtures.
2. Film the video. Open on the adversarial report, not on the generator.
3. Register on Devpost and submit (Kentaro).

Related: [docs/gloo-agent-build-doc.md](gloo-agent-build-doc.md), which covers
the same system for a different event and shares the prompts section.
