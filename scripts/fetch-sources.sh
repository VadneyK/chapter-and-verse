#!/usr/bin/env bash
# Downloads the two public-domain / CC-BY data files this index is built from.
# See DATA-LICENSES.md for the terms of each, quoted from the source.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$HERE/sources"
mkdir -p "$SRC"

BSB_URL="https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/BSB.json"
XREF_URL="https://a.openbible.info/data/cross-references.zip"

if [ ! -f "$SRC/BSB.json" ]; then
  echo "Fetching BSB.json ..."
  curl -fsSL "$BSB_URL" -o "$SRC/BSB.json"
else
  echo "sources/BSB.json already present, skipping."
fi

if [ ! -f "$SRC/cross_references.txt" ]; then
  echo "Fetching cross-references.zip ..."
  curl -fsSL "$XREF_URL" -o "$SRC/cross-references.zip"
  unzip -oq "$SRC/cross-references.zip" -d "$SRC"
  rm -f "$SRC/cross-references.zip"
else
  echo "sources/cross_references.txt already present, skipping."
fi

echo
for f in "$SRC/BSB.json" "$SRC/cross_references.txt"; do
  printf '%-28s %10s bytes  sha256 %s\n' \
    "$(basename "$f")" \
    "$(wc -c < "$f" | tr -d ' ')" \
    "$(shasum -a 256 "$f" | cut -d' ' -f1)"
done
