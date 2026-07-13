// Regenerate the Lane-D drift-gate snapshot: `node tests/generate-quest-superset.js`.
// Only rerun this when plan-quests.mjs/enrich.py's quest-bake step-id set
// changes INTENTIONALLY — the whole point of the snapshot is to catch
// UNintended drift (a future plan-grand.mjs/enrich.py edit silently
// un-absorbing quest coverage, task #9's failure shape:
// tools/guide-export/design/CONSOLIDATION.md §3, §7 lane D).
//
// Shells out to the real generator pipeline (plan-quests.mjs | enrich.py)
// rather than reading route-quests.json — that shipped fixture is retired by
// Lane C (CONSOLIDATION.md §7 lane C), so the generators are the only
// remaining source of truth for "what does a quest bake actually produce."
// Takes ~45s (the planner's cost-search over the full quest-cape chain) —
// too heavy for the `npm test` hot path (tests/grand-superset.test.js reads
// this committed snapshot instead of re-baking every run).
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAX_BUFFER = 1024 * 1024 * 64;

function bakeQuestStepIds() {
  const raw = execFileSync(
    "node",
    [join(ROOT, "tools/guide-export/plan-quests.mjs")],
    { maxBuffer: MAX_BUFFER, cwd: ROOT }
  );
  const enriched = execFileSync(
    "python3",
    [join(ROOT, "tools/guide-export/enrich.py")],
    { input: raw, maxBuffer: MAX_BUFFER, cwd: ROOT }
  );
  return JSON.parse(enriched).steps.map((s) => s.id).sort();
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const stepIds = bakeQuestStepIds();
  const dest = join(ROOT, "tests", "fixtures", "quest-superset-ids.json");
  const payload = {
    _comment:
      "Lane-D drift-gate snapshot (CONSOLIDATION.md §7). stepIds = every id " +
      "the quest-cape bake (plan-quests.mjs | enrich.py) produced when this " +
      "snapshot was captured, verified unique=0 against route-grand.json " +
      "(consolidation-overlap.mjs shape). tests/grand-superset.test.js " +
      "asserts route-grand.json still contains all of them. Regenerate with " +
      "`node tests/generate-quest-superset.js` only when the quest bake's " +
      "id set changes INTENTIONALLY.",
    source: "node tools/guide-export/plan-quests.mjs | python3 tools/guide-export/enrich.py",
    count: stepIds.length,
    stepIds,
  };
  writeFileSync(dest, JSON.stringify(payload, null, 2) + "\n");
  console.log(`wrote ${dest}: ${stepIds.length} quest-bake step ids`);
}
