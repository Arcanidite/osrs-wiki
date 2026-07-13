// CONSOLIDATION SCOPING SPIKE — refreshes CHAIN_CONSOLIDATION.md's §1 overlap
// numbers against TODAY's baked fixtures (route-grand grew 205→213 steps
// since that doc; route-quests/p2p/corpus/origin/f2p-early-game unchanged
// counts but re-measured here for a trustworthy current snapshot). Read-only:
// loads the canonical plugin fixtures (/home/lemon/runelite-guide-chain, the
// CLAUDE.md-designated plugin repo — NOT the nested untracked copy under
// osrs-wiki/runelite-guide-chain), writes nothing.
//
// Usage: node tools/guide-export/spikes/consolidation-overlap.mjs
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FIXTURES = "/home/lemon/runelite-guide-chain/src/main/resources/fixtures";
const load = (name) => JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), "utf8")).steps;

const grand = load("route-grand");
const grandById = new Map(grand.map((s) => [s.id, s]));
console.log(`route-grand |steps| = ${grand.length}\n`);

// Divergent = same id, different content signature (instruction or condition set).
const sig = (s) => JSON.stringify({
  i: s.instruction,
  c: (s.completionConditions || []).map((c) => `${c.type}:${c.skill || c.varbit || ""}:${c.value ?? ""}`).sort(),
});

function compare(name) {
  const steps = load(name);
  let uniq = 0, divergent = 0;
  const uniqueIds = [];
  const divergentIds = [];
  for (const s of steps) {
    const g = grandById.get(s.id);
    if (!g) { uniq++; uniqueIds.push(s.id); continue; }
    if (sig(g) !== sig(s)) { divergent++; divergentIds.push(s.id); }
  }
  const inter = steps.length - uniq;
  console.log(
    `${name.padEnd(16)} |steps|=${String(steps.length).padStart(4)}  ∩grand=${String(inter).padStart(4)}` +
    `  unique=${String(uniq).padStart(4)}  divergent=${String(divergent).padStart(3)}` +
    `  subset%=${((inter / steps.length) * 100).toFixed(1)}`
  );
  return { name, steps, uniq, divergent, uniqueIds, divergentIds, inter };
}

const results = ["route-quests", "route-p2p", "route-corpus", "route-origin", "f2p-early-game"].map(compare);

console.log("\n— grand coverage (of grand's own steps, how many appear in each fixture) —");
for (const r of results) {
  const otherIds = new Set(r.steps.map((s) => s.id));
  const covered = grand.filter((s) => otherIds.has(s.id)).length;
  console.log(`grand ∩ ${r.name.padEnd(16)}: ${covered} of ${grand.length} grand steps (${((covered / grand.length) * 100).toFixed(1)}%)`);
}

console.log("\n— unique-step id samples (first 15) —");
for (const r of results) {
  if (r.uniq === 0) { console.log(`${r.name}: 0 unique (fully absorbed)`); continue; }
  console.log(`${r.name} unique (${r.uniq}): ${r.uniqueIds.slice(0, 15).join(", ")}${r.uniq > 15 ? " …" : ""}`);
}

console.log("\n— divergent step ids (content differs from grand's copy) —");
for (const r of results) {
  if (r.divergent === 0) continue;
  console.log(`${r.name} divergent (${r.divergent}): ${r.divergentIds.slice(0, 10).join(", ")}${r.divergent > 10 ? " …" : ""}`);
}

// p2p-unique kind breakdown (mirrors CHAIN_CONSOLIDATION.md §1's band-drift check).
const p2p = results.find((r) => r.name === "route-p2p");
if (p2p) {
  const kindOf = (id) => id.split("-")[0];
  const counts = {};
  for (const id of p2p.uniqueIds) counts[kindOf(id)] = (counts[kindOf(id)] || 0) + 1;
  console.log(`\nroute-p2p unique-step kind breakdown: ${JSON.stringify(counts)}`);
}
