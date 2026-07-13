// LANE D — drift gate (tools/guide-export/design/CONSOLIDATION.md §7): keeps
// route-grand.json a PROVEN SUPERSET of the quest progression, so a future
// plan-grand.mjs/enrich.py edit can't silently un-absorb quest coverage the
// way task #9 did (§3, 79->62 sub-checklist regression from one flag flip).
//
// Baking a fresh quest bake in-test (plan-quests.mjs | enrich.py) takes ~45s
// — CONSOLIDATION.md §7 lane D's own escape hatch: too heavy for the
// `npm test` hot path (would roughly double total suite time), so this test
// reads a COMMITTED SNAPSHOT of that bake's step-id set instead
// (tests/fixtures/quest-superset-ids.json, captured via
// `node tests/generate-quest-superset.js` when route-grand was verified
// unique=0 against a fresh quest bake — consolidation-overlap.mjs shape).
// The snapshot is frozen; route-grand.json is read fresh every run.
//
// route-quests.json/route-p2p.json are NOT read here — Lane C retires those
// shipped fixtures (CONSOLIDATION.md §7 lane C); the generators
// (plan-quests.mjs et al.) remain the source of truth.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GRAND_FIXTURE =
  "/home/lemon/runelite-guide-chain/src/main/resources/fixtures/route-grand.json";
const SNAPSHOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "quest-superset-ids.json"
);
// B/A2 invariant floor (CONSOLIDATION.md §5/§7): quest_atoms alone covered
// 89/89 route-grand quest steps at the time Lane B shipped (c1d2cdd8). Lane
// A2 then absorbed the quest-cape epilogue on top without regressing those
// 89 (214/215 total quest/rfd steps carry a subChecklist as of 1127574e) —
// this floor is the regression line, not today's exact count, since later
// intentional growth (more quests/atoms) should only ever raise it.
const MIN_QUEST_COVERAGE = 89;

const loadGrandSteps = () =>
  JSON.parse(readFileSync(GRAND_FIXTURE, "utf8")).steps;

test("route-grand is the quest superset: snapshotted quest-bake ids all present in route-grand.json", () => {
  const snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
  const grandIds = new Set(loadGrandSteps().map((s) => s.id));
  const missing = snapshot.stepIds.filter((id) => !grandIds.has(id));
  assert.deepEqual(
    missing,
    [],
    `${missing.length}/${snapshot.stepIds.length} quest-bake ids are missing from route-grand.json — ` +
      "grand stopped being a superset of the quest progression. If this drop was " +
      "intentional, regenerate the snapshot: node tests/generate-quest-superset.js"
  );
});

test("route-grand quest sub-checklist coverage does not regress below the B/A2 floor", () => {
  const questSteps = loadGrandSteps().filter((s) => /^(quest|rfd)-/.test(s.id));
  const covered = questSteps.filter((s) => s.subChecklist);
  assert.ok(
    covered.length >= MIN_QUEST_COVERAGE,
    `only ${covered.length}/${questSteps.length} quest/rfd steps in route-grand.json carry a ` +
      `subChecklist — below the ${MIN_QUEST_COVERAGE}-step floor Lane B/A2 established (task #9's ` +
      "79->62 failure shape)"
  );
});
