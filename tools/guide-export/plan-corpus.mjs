// Emit the ENTIRE step corpus as a plan (not a routed subset) so the export can
// build a "full corpus" appendix guide. enrich.py topo-orders it and classifies
// coverage; the web index then shows every step we know about — routed or not —
// citing id + label, with a have-detail vs stub ledger.
//
// Usage: node tools/guide-export/plan-corpus.mjs
import { loadFixtures } from "../../tests/helpers.js";

const data = loadFixtures();
// train_methods:true — the appendix carries every train-* step (121 of them),
// so it's the widest surface for the skill-method picker; enrich.py attaches
// train_methods.jsonl methods[] by id (opt-in, byte-safe elsewhere).
const goal = { id: "corpus", label: "Full Corpus Appendix", goals: [], train_methods: true };
process.stdout.write(JSON.stringify({ goal, path: data.steps }, null, 1));
