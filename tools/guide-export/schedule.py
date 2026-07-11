#!/usr/bin/env python3
"""Anti-monotony scheduler for a progression-router plan.

Philosophy (memory: progression-philosophy): streamline a grind while it's fast,
then — once a level takes longer than ABYSMAL_HOURS_PER_LEVEL — stop grinding one
skill to completion and ROUND-ROBIN the remaining skills in ~MONOTONY_HOURS blocks
to break monotony. Emits an ordered list of blocks the enrich layer renders.

Pure functions, one task each; rates + xp curve are the only data.
"""
import json
import sys
from pathlib import Path

MONOTONY_HOURS = 1.0            # size of one round-robin block
ABYSMAL_HOURS_PER_LEVEL = 1.0   # a level slower than this -> rotate instead of streamline
DEFAULT_RATE = 30000            # xp/hr when a skill has no rate row
MAX_LEVEL = 99

RATES = json.loads((Path(__file__).parents[2] / "assets" / "data" / "tools" / "rates.json").read_text())


def _xp_table():
    table, total = [0, 0], 0.0
    for level in range(1, MAX_LEVEL):
        total += int(level + 300 * (2 ** (level / 7.0)))
        table.append(int(total // 4))
    return table                # table[L] = cumulative xp to reach level L


XP = _xp_table()


def xp_at(level):
    return XP[max(1, min(MAX_LEVEL, level))]


def level_at_xp(xp):
    level = 1
    while level < MAX_LEVEL and XP[level + 1] <= xp:
        level += 1
    return level


def rate_at(skill, level):
    for band in RATES.get(skill, []):
        if level < band["upto"]:
            return band["xp_hr"]
    return DEFAULT_RATE


def hours_for_level(skill, level):
    return (xp_at(level + 1) - xp_at(level)) / rate_at(skill, level)


def block(skill, frm, to, mode):
    hours = (xp_at(to) - xp_at(frm)) / rate_at(skill, (frm + to) // 2)
    return {"skill": skill, "from": frm, "to": to, "hours": round(hours, 2), "mode": mode}


def abysmal_level(skill, frm, to):
    """First level in [frm,to) whose single-level time is abysmal; else `to`."""
    level = frm
    while level < to and hours_for_level(skill, level) < ABYSMAL_HOURS_PER_LEVEL:
        level += 1
    return level


def rotate_blocks(skill, frm, to):
    """Split [frm,to) into ~MONOTONY_HOURS blocks (the round-robin units)."""
    blocks, level = [], frm
    while level < to:
        budget = rate_at(skill, level) * MONOTONY_HOURS
        nxt = max(level + 1, min(to, level_at_xp(xp_at(level) + budget)))
        blocks.append(block(skill, level, nxt, "rotate"))
        level = nxt
    return blocks


def skill_blocks(skill, frm, to):
    """One streamlined block up to the abysmal point, then rotate blocks after."""
    if to <= frm:
        return {"streamline": None, "rotate": []}
    cut = abysmal_level(skill, frm, to)
    streamline = block(skill, frm, cut, "streamline") if cut > frm else None
    return {"streamline": streamline, "rotate": rotate_blocks(skill, cut, to)}


def interleave(rotate_lists):
    """Round-robin: one block from each skill per round until all are drained."""
    out, i = [], 0
    while any(i < len(lst) for lst in rotate_lists):
        out += [lst[i] for lst in rotate_lists if i < len(lst)]
        i += 1
    return out


def targets_from_plan(plan):
    targets = {}
    for step in plan["path"]:
        for skill, level in (step.get("grants") or {}).items():
            if isinstance(level, (int, float)):
                targets[skill] = max(targets.get(skill, 1), int(level))
    return targets


def schedule(plan, profile=None):
    profile = profile or {}
    plans = {sk: skill_blocks(sk, profile.get(sk, 1), lv)
             for sk, lv in targets_from_plan(plan).items()}
    streamlined = [p["streamline"] for p in plans.values() if p["streamline"]]
    rotated = interleave([p["rotate"] for p in plans.values() if p["rotate"]])
    return streamlined + rotated


def main():
    plan = json.load(sys.stdin)
    json.dump({"goal": plan["goal"], "blocks": schedule(plan)}, sys.stdout, indent=2)


if __name__ == "__main__":
    main()
