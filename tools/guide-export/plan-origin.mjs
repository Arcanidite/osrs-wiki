// Drive the STEP-0 ORIGIN chain (Lane M1, MATERIALIZATION.md #1d) -- a separate,
// additive sibling to plan.mjs/plan-multi.mjs/plan-corpus.mjs/plan-quests.mjs.
// Tutorial Island -> Lumbridge arrival is a pure DAG (the island enforces the
// instructor order; there is no routing freedom) so, per MATERIALIZATION.md
// Lane M1 ("origin is linear so a topo/passthrough is fine"), this driver does
// NOT run routeMulti's cost-based greedy chooser at all -- it emits the
// authored steps_origin.jsonl order directly, mirroring plan-corpus.mjs's
// simpler "phase by region" passthrough (goal.goals: []) rather than
// plan-quests.mjs's milestone-episode routing, since Tutorial Island doesn't
// train real skill levels (nothing for a skill-driven milestone phase to
// pull toward -- see design retro for the rejected alternative).
//
// Mapping rule (GRANULARITY "reuse before authoring", MATERIALIZATION.md
// Lane M1): the four quest openers (Cook's Assistant, Sheep Shearer, The
// Restless Ghost, X Marks the Spot) already exist as steps.jsonl/
// steps_quests.jsonl rows -- they are ENRICHED here (origin refs unioned in,
// on an in-memory copy only) rather than duplicated under a new origin-* id.
// This never touches the source files, so route-p2p/route-corpus/
// route-quests (which load those files fresh, pristine) stay byte-identical.
//
// Usage: node tools/guide-export/plan-origin.mjs
import { loadFixtures, readData } from "../../tests/helpers.js";

const data = loadFixtures();
const questSteps = readData("steps_quests");
const originSteps = readData("steps_origin");

const byId = new Map([...data.steps, ...questSteps].map((s) => [s.id, s]));
const originById = new Map(originSteps.map((s) => [s.id, s]));

// Origin-study refs for the four reused quest openers (origin:mainland:03-06,
// tools/wiki-kb/contrib.jsonl) -- unioned onto the existing step's refs[] by
// url (dedup), plus an atom{} for the three that don't already carry one
// (quest-cooks-assistant already has one, from the quest-chain builder).
const OPENER_ENRICH = {
  "quest-cooks-assistant": {
    refs: [
      { title: "Cook's Assistant", slug: "Cook's_Assistant.s1", url: "https://oldschool.runescape.wiki/w/Cook's_Assistant" },
      { title: "Cook's Assistant", slug: "Cook's_Assistant.s9", url: "https://oldschool.runescape.wiki/w/Cook's_Assistant" },
      { title: "Cook's Assistant/Quick guide", slug: "Cook's_Assistant_Quick_guide.s2", url: "https://oldschool.runescape.wiki/w/Cook's_Assistant/Quick_guide" },
    ],
  },
  "quest-sheep-shearer": {
    atom: { verb: "talk-to", target: "fred_the_farmer", count: null, cmp: "eq", until: { state: "quest-varbit:??" } },
    refs: [
      { title: "Sheep Shearer", slug: "Sheep_Shearer.s1", url: "https://oldschool.runescape.wiki/w/Sheep_Shearer" },
      { title: "Sheep Shearer", slug: "Sheep_Shearer.s6", url: "https://oldschool.runescape.wiki/w/Sheep_Shearer" },
      { title: "Sheep Shearer/Quick guide", slug: "Sheep_Shearer_Quick_guide.s2", url: "https://oldschool.runescape.wiki/w/Sheep_Shearer/Quick_guide" },
    ],
  },
  "quest-the-restless-ghost": {
    atom: { verb: "talk-to", target: "restless_ghost_coffin", count: null, cmp: "eq", until: { state: "quest-varbit:??" } },
    refs: [
      { title: "The Restless Ghost", slug: "The_Restless_Ghost.s1", url: "https://oldschool.runescape.wiki/w/The_Restless_Ghost" },
      { title: "The Restless Ghost", slug: "The_Restless_Ghost.s5", url: "https://oldschool.runescape.wiki/w/The_Restless_Ghost" },
      { title: "The Restless Ghost/Quick guide", slug: "The_Restless_Ghost_Quick_guide.s2", url: "https://oldschool.runescape.wiki/w/The_Restless_Ghost/Quick_guide" },
    ],
  },
  "quest-x-marks-the-spot": {
    atom: { verb: "use-on", target: "veos", count: null, cmp: "eq", until: { state: "quest-varbit:??" } },
    refs: [
      { title: "X Marks the Spot", slug: "X_Marks_the_Spot.s1", url: "https://oldschool.runescape.wiki/w/X_Marks_the_Spot" },
      { title: "X Marks the Spot", slug: "X_Marks_the_Spot.s5", url: "https://oldschool.runescape.wiki/w/X_Marks_the_Spot" },
      { title: "X Marks the Spot", slug: "X_Marks_the_Spot.s8", url: "https://oldschool.runescape.wiki/w/X_Marks_the_Spot" },
      { title: "X Marks the Spot/Quick guide", slug: "X_Marks_the_Spot_Quick_guide.s2", url: "https://oldschool.runescape.wiki/w/X_Marks_the_Spot/Quick_guide" },
    ],
  },
};

function enrichedOpener(id) {
  const base = byId.get(id);
  if (!base) return null;
  const extra = OPENER_ENRICH[id] || {};
  const seen = new Set((base.refs || []).map((r) => r.url));
  const refs = [...(base.refs || []), ...(extra.refs || []).filter((r) => !seen.has(r.url))];
  return { ...base, refs, atom: base.atom ?? extra.atom ?? null, coarse_of: "origin-mainland-hour1" };
}

// Strict origin order (MATERIALIZATION.md #1d): Tutorial Island instructor
// sequence, then Lumbridge arrival + gear, then the four opener quests in the
// origin:mainland:08 castle-local -> Restless Ghost -> X Marks the Spot order.
const ORDER = [
  "ori-t-01-claim-character-creation",
  "ori-t-02-claim-gielinor-guide-intro",
  "ori-t-04-toggle-graphics-settings",
  "ori-t-05-toggle-audio-settings",
  "ori-t-06-toggle-controls-dialogue-skip",
  "ori-t-07-walk-to-survival-expert",
  "ori-t-08-gather-raw-shrimps",
  "ori-t-09-produce-light-fire",
  "ori-t-10-produce-cook-shrimps",
  "ori-t-11-produce-bake-bread",
  "ori-t-12-claim-music-player",
  "ori-t-13-talk-to-quest-guide",
  "ori-t-14-produce-bronze-dagger",
  "ori-t-15-kill-giant-rat-melee",
  "ori-t-16-kill-giant-rat-ranged",
  "ori-t-17-use-on-bank-booth",
  "ori-t-18-talk-to-account-guide",
  "ori-t-19-talk-to-prayer-instructor",
  "ori-t-20-claim-ironman-mode",
  "ori-t-21-use-on-wind-strike-chicken",
  "ori-t-22-teleport-lumbridge-home-teleport",
  "ori-t-23-walk-to-lumbridge-arrival",
  "ori-m-01-claim-world-chat-unlock",
  "ori-m-02-buy-spade",
  "quest-cooks-assistant",
  "quest-sheep-shearer",
  "quest-the-restless-ghost",
  "quest-x-marks-the-spot",
];

const OPENER_IDS = new Set(Object.keys(OPENER_ENRICH));
const path = ORDER.map((id) => (originById.get(id) ?? (OPENER_IDS.has(id) ? enrichedOpener(id) : byId.get(id))))
  .filter(Boolean);

if (path.length !== ORDER.length) {
  console.error(`plan-origin: resolved ${path.length}/${ORDER.length} ids -- missing:`,
    ORDER.filter((id) => !originById.has(id) && !OPENER_IDS.has(id) && !byId.has(id)));
  process.exit(1);
}

// goal.goals: [] (corpus-style passthrough, see header) -- enrich.py takes the
// "phase by region" branch instead of the skill-driven milestone-episode one.
const covered = {
  id: "origin", label: "Step 0 → Early Game", goals: [],
  // Scopes enrich.py's coarse_expansions injection/checkpoint scan to just
  // this chain's own two registries — see enrich.py's goal.coarse_ids note.
  coarse_ids: ["origin-tutorial", "origin-mainland-hour1"],
};
process.stdout.write(JSON.stringify({ goal: covered, path }, null, 1));
