// LENS SPIKE (CHAIN_CONSOLIDATION.md prototype) — prove that the standalone
// baked chains are derivable as PREDICATE LENSES over the route-grand spine,
// using only fields the spine's steps already carry (id, checkpoint,
// completionConditions). No new labeling, no fixture edits — read-only.
//
// Usage: node tools/guide-export/spikes/lens-spike.mjs [fixturesDir]
//   fixturesDir defaults to the runelite-guide-chain baked fixtures.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_FIXTURES =
  "/home/lemon/runelite-guide-chain/src/main/resources/fixtures";

// ── Lens predicates (pure, over one spine step) ──────────────────────────────
const hasSkillCondition = (s) =>
  (s.completionConditions || []).some((c) => c.type === "SKILL");

export const LENSES = {
  // Quest-progression view: quest steps + RFD subquests already on the spine.
  quests: (s) => /^(quest|rfd)-/.test(s.id),
  // Step0→Lumbridge origin view: Tutorial Island atoms + origin checkpoints.
  origin: (s) => /^(ori|chkpt-origin)-/.test(s.id),
  // Skeleton view: goal milestones + every checkpoint-bearing step.
  milestones: (s) => /^milestone-/.test(s.id) || s.checkpoint != null,
  // Training view: every step whose completion is a SKILL level gate.
  training: hasSkillCondition,
};

export const applyLens = (steps, lens) => steps.filter(LENSES[lens]);

// ── Spike runner: measure each lens + verify against the baked views ────────
const dir = process.argv[2] || DEFAULT_FIXTURES;
const load = (name) =>
  JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8")).steps;

const sample = (steps) => {
  const ids = steps.map((s) => s.id);
  return `${ids.slice(0, 3).join(", ")} … ${ids.slice(-2).join(", ")}`;
};

// Order agreement: the lens ids restricted to the baked chain must appear in
// the SAME relative order the baked chain uses (subset + sequence, not bag).
const orderAgrees = (lensSteps, bakedSteps) => {
  const baked = new Set(bakedSteps.map((s) => s.id));
  const shared = lensSteps.map((s) => s.id).filter((id) => baked.has(id));
  const lensSet = new Set(shared);
  const expect = bakedSteps.map((s) => s.id).filter((id) => lensSet.has(id));
  return JSON.stringify(shared) === JSON.stringify(expect);
};

const grand = load("route-grand");
console.log(`spine: route-grand — ${grand.length} steps\n`);
for (const name of Object.keys(LENSES)) {
  const view = applyLens(grand, name);
  console.log(`lens ${name.padEnd(10)} → ${String(view.length).padStart(3)} steps  [${sample(view)}]`);
}

console.log("\n— verification against the baked standalone chains —");
const questsView = applyLens(grand, "quests");
const bakedQuests = load("route-quests");
const bakedQuestIds = new Set(bakedQuests.map((s) => s.id));
const covered = questsView.filter((s) => bakedQuestIds.has(s.id)).length;
console.log(
  `quests lens ⊆ route-quests: ${covered}/${questsView.length} ids present,` +
    ` order-preserving: ${orderAgrees(questsView, bakedQuests)}`
);

const originView = applyLens(grand, "origin");
const bakedOrigin = load("route-origin");
const originIds = new Set(bakedOrigin.map((s) => s.id));
const oCovered = originView.filter((s) => originIds.has(s.id)).length;
const missing = bakedOrigin.filter(
  (s) => !originView.some((v) => v.id === s.id)
);
console.log(
  `origin lens ⊆ route-origin: ${oCovered}/${originView.length} ids present,` +
    ` order-preserving: ${orderAgrees(originView, bakedOrigin)}`
);
console.log(
  `route-origin steps NOT in origin lens (${missing.length}):` +
    ` ${missing.map((s) => s.id).join(", ")}`
);
