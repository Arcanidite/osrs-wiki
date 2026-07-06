// Data loading — JSONL fetch + parse. parseJsonl is pure (tests feed it
// file contents directly); loadJsonl/loadAll wrap fetch for the browser.

export function parseJsonl(text) {
  return text.trim().split("\n").map((l) => JSON.parse(l));
}

export async function loadJsonl(url) {
  const text = await fetch(url).then((r) => r.text());
  return parseJsonl(text);
}

export function dataUrls(base) {
  return {
    steps:       base + "/assets/data/tools/steps.jsonl",
    goals:       base + "/assets/data/tools/goals.jsonl",
    regions:     base + "/assets/data/tools/regions.jsonl",
    constraints: base + "/assets/data/tools/constraints.jsonl",
  };
}

export async function loadAll(base) {
  const u = dataUrls(base);
  const [steps, goals, regions, constraints] = await Promise.all([
    loadJsonl(u.steps), loadJsonl(u.goals), loadJsonl(u.regions), loadJsonl(u.constraints),
  ]);
  return { steps, goals, regions, constraints };
}
