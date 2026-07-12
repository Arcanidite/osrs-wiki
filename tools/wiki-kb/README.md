# wiki-kb — the OSRS-wiki knowledge base for guide-chain research

The wiki is the **single source of truth**. Nothing in the guide chain is asserted
from memory — every item/npc/quest/coordinate cites a wiki page that has been
fetched into this KB. `wikicli` is the only sanctioned access path (MediaWiki API
wikitext — never HTML scraping; ~10× less token noise than page HTML).

## Agent quickstart

```bash
CLI=/home/lemon/osrs-wiki/tools/wiki-kb/wikicli
$CLI search cooks assistant             # find the exact page title
$CLI sections "Cook's Assistant/Quick guide"   # ALWAYS before `get` on unknown pages
$CLI get "Cook's Assistant/Quick guide" --section 2   # fetch ONLY what you need
$CLI links "Lumbridge"                  # breadcrumbs: where to go next
$CLI members "Category:Quests"          # breadth traversal
$CLI url "Coins"                        # canonical url for a citation ref
```

Every `get` is cached in `blobs/` and recorded in `manifest.jsonl` — a cache hit
costs nothing and re-fetching is never duplicated. Fetch freely, but fetch
*sections*, not whole mega-pages.

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
