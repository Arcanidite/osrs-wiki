# osrs-wiki — guide-chain + progression router

Jekyll site + the progression-router planner (`assets/js/router/`) + the guide-export
pipeline (`tools/guide-export/`) that compiles routes for the RuneLite guide-chain plugin
(`/home/lemon/runelite-guide-chain`, branch `feat/burndown-web-lane1`).

## Hard rules (non-negotiable)

- **Wiki = single source of truth.** Guide content is researched on the OSRS wiki via
  `tools/wiki-kb/wikicli` (cached MediaWiki API, never HTML scraping) and cited via
  `refs[]`. No assertions from memory; no fabricated rates/quantities — `"??"` or a named
  tuning placeholder beats a guess.
- **Own words only** — never copy wiki/guide prose or game dialogue.
- **Gather/produce, never Grand-Exchange-buying**, for item sourcing in routes.
- **Unified progression** — no F2P/P2P split.
- **Overlay/highlight only** in anything client-facing — never automate game input.

## Architecture map

- Planner: `assets/js/router/planner/` (greedy routeMulti + burndown.js supply resolution +
  overlay.js background weaving + tuning.js). Pipeline order is the header comment in
  greedy.js / enrich.py.
- Export: `tools/guide-export/plan-multi.mjs | enrich.py > fixtures/route-*.json`.
- Design docs (read before touching the model): `tools/guide-export/design/SYNTHESIS.md`
  (requisite-burndown model, 6-lane plan), `design/granularity/GRANULARITY.md`
  (atom{}/hints[]/checkpoints[]/branch{} + unwind rules U1–U10).
- Wiki KB: `tools/wiki-kb/` (wikicli, blobs/, manifest.jsonl, contrib.jsonl idempotent
  ledger, queue.jsonl, NOISEBENCH.md).

## Conventions

Max one indent level (guard clauses, small named helpers), succinct one-task pure
functions, named constants over magic numbers, lookup tables over if-else ladders, terse
files + rigorous docs, one source of truth per concern.

## Fan-out discipline (multi-agent work)

Self-contained brief files (no stdin); **Bash is write-only for subagents — they never
receive stdout: every command redirects to a file (`cmd > out 2>&1`) which they Read
back; missing output is the design, not a stall**; shared append-only ledgers (contribute
idempotent on key, queue add/claim/done); agents return one-line receipts — data lives in files;
prefer SHORT SYNCHRONOUS BURSTS over monolith workflows — concise prompts, explicit
left/right scope limits per agent, parallel cached-KB fetches, each burst's rows feeding
the next burst downstream;
**agents read the relevant gotchas.log + existing contrib keys BEFORE starting** (inherit
lessons, skip claimed work) and append their own on completion — append + annotate, never
delete (acraflow P-B); retros also **mint the canonical trigger**: name what the brief
should have said so the next wave's directives are corrected, not re-guessed (P-C); tier map:
haiku = probes (~2.2k-token directives), sonnet = domain workers/builders, fable = final
synthesis. Tests: `npm test` (planner suite must stay green; baseline re-pins are
intentional acts, note them in the commit).
