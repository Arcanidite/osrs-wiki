# noisebench — before/after noise measurement for wikicli output

Noise pruning is validated by MEASUREMENT, not vibes. Every pruning
implementation (a `--strip` flag, template collapsing, section filtering)
is benchmarked by re-running the SAME fixed battery through a fresh haiku
probe (~2.2k-token directive, cache-friendly) and appending rows to
`noise-bench.jsonl` — append-only, one row per (run_label, command):

```json
{"run": "baseline", "cmd": "get quickguide-s2", "bytes": 1339, "useful_pct": 70, "ts": "..."}
{"run": "strip-v1", "cmd": "get quickguide-s2", "bytes": 900,  "useful_pct": 92, "ts": "..."}
```

Compare runs by key; a pruning pass ships only if useful_pct rises without
losing research-load-bearing data (tile coords, NPC names, quantities,
item links — the probe must confirm these survived).

## The fixed battery (v1 — do not change without bumping to v2)

1. `wikicli sections "Barrows"`
2. `wikicli get "Cook's Assistant/Quick guide" --section 2`
3. `wikicli get "Bucket of milk"`
4. `wikicli sections "Guide:Leagues: Faux starting guide"` + first content section via `--section N`
5. `wikicli links "Lumbridge" | head -40`
6. `wikicli members "Free-to-play quests" | head -20`

## Protocol

1. BEFORE: run battery with current flags → haiku probe scores each output
   (bytes via `wc -c`, useful_pct eyeballed against the guide-building need)
   → rows appended with a run label.
2. Implement pruning (driven by `cli-feedback.log` suggestions).
3. AFTER: same battery, same probe shape, new run label → rows appended.
4. Ship/revert on the comparison; probe must explicitly confirm coords,
   NPC names, quantities and item links survived the pruning.
