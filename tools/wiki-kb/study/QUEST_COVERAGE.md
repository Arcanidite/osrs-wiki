# QUEST_COVERAGE — questdb/diarydb substrate census (coverage3, 2026-07-12)

Substrate: `assets/data/tools/quest_db.jsonl`, rebuilt this pass from all `questdb:`/`diarydb:`
rows in `tools/wiki-kb/contrib.jsonl` (dedup last-wins, sorted by kind then id).
**219 rows = 172 quest-kind + 47 diary-kind.**

## Headline

- **Quests with questdb rows: 147 / 197** (directive denominator). The 172 quest-kind rows
  break down as 147 real quests + 25 miniquests (miniquests were deliberately contributed
  under `questdb:` by the depth bursts; they don't count against the 197).
- **Diary tiers covered: 47 / 48.** Only `ardougne-easy` is missing (excluded from depth:16
  per brief; owned by the claimed-but-stalled `wave3:agility-diary-kandarin` bundle).

## Census reconciliation (honest denominator note)

- The directive fixes total quests at **197**. Our own `classify:*` census has **191** quest
  titles and `quests.jsonl` has **189** (F2P+P2P). Against our classify census the coverage is
  147/191 with 44 named gaps below. The 6-title delta (197−191) is unaccounted-for census
  drift — likely post-classify releases — and cannot be named from current contrib data;
  a future classify refresh should re-run the quest-list DPL pages.

## Honest gaps — the 44 quests with NO questdb row

Every one is absent from quest_db.jsonl even when researched elsewhere (`quests:*` rows and
steps.jsonl do not feed the substrate build).

Researched-elsewhere-but-not-in-questdb (22, the "already excluded" cohort from DEPTH_BACKLOG):
Big Chompy Bird Hunting, Bone Voyage, Cook's Assistant, Desert Treasure I, Druidic Ritual,
Fairytale I - Growing Pains, Family Crest, Lost City, Monkey Madness I, Nature Spirit,
Priest in Peril, Recipe for Disaster, RFD: Another Cook's Quest, RFD: Freeing King Awowogei,
RFD: Freeing the Goblin generals, RFD: Freeing the Mountain Dwarf, Rum Deal,
Shadow of the Storm, Swan Song, Tai Bwo Wannai Trio, Tale of the Righteous, The Feud.

Owned by pending/claimed wave3 bundles (21):
Temple of Ikov, Death Plateau, Troll Stronghold, Waterfall Quest (wave3:dt-gwd-gates);
The Restless Ghost, One Small Favour, Jungle Potion, Shilo Village, Garden of Tranquillity,
Creature of Fenkenstrain (wave3:qp-spine-swansong); Tree Gnome Village, The Grand Tree
(wave3:gnome-mm1-gear); RFD: Freeing Pirate Pete, RFD: Freeing the Lumbridge Guide,
RFD: Freeing Evil Dave, RFD: Freeing Skrach Uglogwee, RFD: Freeing Sir Amik Varze,
RFD: Defeating the Culinaromancer (wave3:rfd-completion); Biohazard
(wave3:agility-diary-kandarin); X Marks the Spot, Client of Kourend (wave3:cox-zeah-readiness).

Owned by nobody (1): Fishing Contest (only a PROPOSED-ID mint in EXTRAPOLATION G5).

Diary gap (1): ardougne-easy.

## Top 10 highest-value uncovered — next burst targets

Ranked by how many quest_db.jsonl rows list the quest in `reqs.quests` (prerequisite fan-in —
the planner cannot order any dependent until these exist as rows):

| # | Quest | fan-in |
|---|-------|--------|
| 1 | Priest in Peril | 27 |
| 2 | Druidic Ritual | 21 |
| 3 | The Restless Ghost | 21 |
| 4 | Desert Treasure I | 14 |
| 5 | Death Plateau | 14 |
| 6 | Jungle Potion | 14 |
| 7 | Troll Stronghold | 12 |
| 8 | Waterfall Quest | 11 |
| 9 | Shilo Village | 11 |
| 10 | Nature Spirit | 10 |

(Lost City ties Nature Spirit at 10; Garden of Tranquillity 9, Big Chompy Bird Hunting /
Creature of Fenkenstrain / Biohazard 8 are next.)

## Queue action

Uncovered remainder (44 quests + ardougne-easy) enqueued as `depth:next` in queue.jsonl.
If wave3 bundles complete first, dedupe against contrib before burning fetches — per the
standing grep-before-contribute discipline.
