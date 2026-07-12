# wiki-kb — the OSRS-wiki knowledge base for guide-chain research

The wiki is the **single source of truth**. Nothing in the guide chain is asserted
from memory — every item/npc/quest/coordinate cites a wiki page that has been
fetched into this KB. `wikicli` is the only sanctioned access path (MediaWiki API
wikitext — never HTML scraping; ~10× less token noise than page HTML).

## Agent quickstart — Bash is WRITE-ONLY for you

You do NOT get stdout back from Bash — ever. It is not stalling; it is not supposed to
return output. **Redirect every command to a file, then use the Read tool on that file:**

```bash
CLI=/home/lemon/osrs-wiki/tools/wiki-kb/wikicli
OUT=/tmp/$AGENT; mkdir -p $OUT               # your private out dir

$CLI search cooks assistant        > $OUT/search.out   2>&1   # then: Read $OUT/search.out
$CLI sections "Cook's Assistant/Quick guide" > $OUT/sections.out 2>&1
$CLI get "Cook's Assistant/Quick guide" --section 2 > /dev/null 2> $OUT/get.log
#   ^ `get` CACHES the page — do not read stdout; Read the blob file instead:
#     Read tools/wiki-kb/blobs/Cook's_Assistant_Quick_guide.s2.wiki
#     (blob name is in $OUT/get.log and in manifest.jsonl)
$CLI links "Lumbridge"             > $OUT/links.out    2>&1
$CLI members "Category:Quests"     > $OUT/members.out  2>&1
$CLI url "Coins"                   > $OUT/url.out      2>&1
```

Every `get` is cached in `blobs/` and recorded in `manifest.jsonl` — a cache hit
costs nothing and re-fetching is never duplicated. Fetch freely, but fetch
*sections*, not whole mega-pages — and always Read files, never expect stdout.

## Contribution discipline (idempotent — no duplicated work)

```bash
$CLI queue add "<work-key>" '{"note": "..."}'     # no-op if already queued
$CLI queue claim "<work-key>"                     # announce you own it
$CLI contribute '{"key": "<unique-finding-key>", "kind": "...", "step_id": "...",
                  "refs": [{"title": "...", "slug": "...", "url": "..."}], ...}'
$CLI queue done "<work-key>"
```

- `contribute` silently skips keys already in `contrib.jsonl` — never overwrites,
  never invalidates. Findings accumulate.
- Every `refs[].slug` MUST exist in `manifest.jsonl` (i.e. you actually fetched
  and read the page you cite).

## Feedback loop (required)

The CLI evolves from your friction reports:

```bash
$CLI feedback "sections output should include byte sizes so I can budget gets"
```

Also append process gotchas to `gotchas.log` and a finale retro block to
`retro.log` (`## <agent> retro`, ≤12 lines) — same discipline as every fan-out
in this repo.
