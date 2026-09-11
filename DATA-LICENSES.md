# Data licenses

This project ships no scripture text of its own. It builds an index from two
outside sources, both checked before a line of code was written. Their terms
are reproduced here verbatim, with the URL and the date they were read, so
anyone auditing this repo can confirm them without taking my word for it.

The code in this repository is MIT licensed. See `LICENSE`. The data terms
below are separate from the code license and travel with the built index.

## 1. Scripture text: Berean Standard Bible (BSB)

- Read from: `https://berean.bible/terms.htm`
- Date read: 2026-09-10
- Status: **public domain** since 2023-04-30

Verbatim, from that page:

> The Berean Bible and Majority Bible texts are officially dedicated to the
> public domain as of April 30, 2023.
>
> All uses are freely permitted.
>
> Attribution Notice (appreciated but not required):
>
> The Holy Bible, Berean Standard Bible, BSB is produced in cooperation with
> Bible Hub, Discovery Bible, OpenBible.com, and the Berean Bible Translation
> Committee. This text of God's Word has been dedicated to the public domain.
>
> Derivatives and Adaptations
>
> By definition all public domain materials may be freely reproduced,
> integrated, and adapted for both free and commercial resources.

Attribution is not required, and this project gives it anyway: the report page
and the built index both name the BSB as the translation every quote is
checked against.

The page also asks that derivative works which alter the official text not use
the Berean name. This project does not alter the text. It reads verses and
compares them character for character against what a plan claims they say,
which is the opposite of altering them.

### Where the file comes from

The JSON build of the BSB used here is packaged by
[`scrollmapper/bible_databases`](https://github.com/scrollmapper/bible_databases),
which is MIT licensed. That MIT license covers scrollmapper's packaging work.
The underlying text is public domain on its own terms, quoted above, which is
why this project did not rely on the packaging license alone.

- File: `formats/json/BSB.json`
- Date read: 2026-09-10

## 2. Cross references: OpenBible.info

- Read from: `https://www.openbible.info/labs/cross-references/`
- Date read: 2026-09-10
- Status: **CC BY** (Creative Commons Attribution)

Verbatim, from that page:

> This data draws primarily from public-domain sources, especially the Treasury
> of Scripture Knowledge, which provides most of the data. It also includes
> data (to seed the initial votes) from my Topical Bible and Twitter Bible
> Search.
>
> Unless otherwise indicated, all content is licensed under a Creative Commons
> Attribution License.

The downloaded file carries the same marker in its own header row:

```
From Verse	To Verse	Votes	#www.openbible.info CC-BY 2026-09-07
```

CC BY requires attribution in the work itself, not only in a README that a
reader may never open. So the attribution is carried in three places:

1. `out/index.json` records it under `sources`, so anything built on the index
   inherits it.
2. Every generated HTML report prints it in the footer.
3. This file.

Required attribution line:

> Cross-reference data from OpenBible.info, licensed CC BY.

## Reproducing the sources

`scripts/fetch-sources.sh` downloads both files and prints their sizes and
SHA-256 digests. The digests recorded at build time are written into
`out/index.json` so a report can be traced back to exactly the bytes it was
built from.
