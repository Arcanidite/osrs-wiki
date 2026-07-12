// backprop-spike.mjs — RUN-PROVEN spike for planner/backprop.js.
//
// Joins route-grand's ordered step ids with the steps.jsonl bank (the planner's
// pre-emission view: location/reqs/grants/produces/consumes live in the bank,
// not the emitted fixture), derives the real demand set (route consumes{} +
// barrows goal reqs.items), and prints where backward demand propagation says
// each requisite is collectable EARLIEST vs where it is consumed today.
//
// Run:  node tools/guide-export/spikes/backprop-spike.mjs [route.json]
// This is analysis-only — it writes nothing and changes no fixture.

import { readFileSync } from "node:fs";
import {
  buildSourceIndex, collectDemands, accumulateSkills, backpropCollectionPlan,
} from "../../../assets/js/router/planner/backprop.js";

const ROUTE_PATH = process.argv[2] ??
  "/home/lemon/runelite-guide-chain/src/main/resources/fixtures/route-grand.json";
const STEPS_PATH = new URL("../../../assets/data/tools/steps.jsonl", import.meta.url);
const GOALS_PATH = new URL("../../../assets/data/tools/goals.jsonl", import.meta.url);

const readJsonl = (path) =>
  readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

const bank = readJsonl(STEPS_PATH);
const bankById = new Map(bank.map((s) => [s.id, s]));
const goals = readJsonl(GOALS_PATH).filter((g) => g.id === "barrows");
const routeIds = JSON.parse(readFileSync(ROUTE_PATH, "utf8")).steps.map((s) => s.id);

// Planner view of the route: bank row where one exists, id-only stub otherwise
// (fixture-only steps carry no produces/consumes/location — honest empties).
const route = routeIds.map((id) => bankById.get(id) ?? { id });

const sourceIndex = buildSourceIndex(bank);
const demands = collectDemands(route, goals);
const plans = backpropCollectionPlan(route, demands, sourceIndex, accumulateSkills(route));

const fmtIdx = (i) => (i == null ? "—" : i === Number.MAX_SAFE_INTEGER ? "horizon" : `[${i}]`);
console.log(`route-grand: ${route.length} steps | demands: ${plans.length} | sources indexed: ${sourceIndex.size} items\n`);
for (const p of plans) {
  const move = p.verdict === "earliest-window"
    ? ` -> collect at ${fmtIdx(p.collectAtIdx)} ${p.collectAtId} (source now at ${fmtIdx(p.sourceIdx)})`
    : p.verdict === "already-earliest" ? ` (source at ${fmtIdx(p.sourceIdx)} is the window)` : "";
  const flag = p.sourceAfterConsumer ? "  !! source scheduled AFTER consumer" : "";
  console.log(`${p.item.padEnd(16)} needed by ${fmtIdx(p.consumerIdx)} ${p.consumerId}`);
  console.log(`  ${p.verdict}${move}${flag}\n`);
}
