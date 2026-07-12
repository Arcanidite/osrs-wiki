# Sonic Day 1 Demonic Pact - Granularity Analysis

## Guide Overview
Single-section progression with 10 sequential tasks, each yielding 10 league points. Linear storyline tied to Valamore region starting location. No prerequisites beyond leagues tutorial completion.

## Task Breakdown & Atomic Decomposition

### Task 1: Complete Leagues Tutorial
- **Coarse intent:** Finish tutorial sequence
- **Atomic steps:** 
  - Watch/skip tutorial dialogue
  - Click accept/confirm on final screen
- **Single-action:** Yes
- **Navigation required:** No
- **Obstacles:** None noted

### Task 2: Select First Relic
- **Coarse intent:** Choose opening relic from available options
- **Atomic steps:**
  - Open relic selection menu
  - Click desired relic option
  - Confirm selection
- **Single-action:** Effectively yes (one click after menu opens)
- **Navigation required:** No
- **Obstacles:** Choice-driven; difficulty depends on relic knowledge

### Task 3: Open Leagues Menu
- **Coarse intent:** Access progression/stats interface
- **Atomic steps:**
  - Locate leagues menu button/icon
  - Click to open
- **Single-action:** Yes
- **Navigation required:** No
- **Obstacles:** None noted

### Task 4: Pet NPC Renu
- **Coarse intent:** Interact with Renu via pet emote
- **Atomic steps:**
  - Navigate to Renu's location (east of starting point)
  - Click on Renu NPC
  - Select "pet" interaction
- **Single-action:** No (compound: navigate + interact)
- **Navigation required:** Yes, small distance
- **Obstacles:** None noted

### Task 5: Pickpocket Civilian
- **Coarse intent:** Perform pickpocket action on male or female civilian
- **Atomic steps:**
  - Navigate to area south of starting point
  - Locate civilian NPC
  - Click "pickpocket" option
  - Handle success/failure (fail = repeat)
- **Single-action:** No (compound: navigate + action + retry loop)
- **Navigation required:** Yes, moderate distance
- **Obstacles:** Pickpocket can fail; success rate not specified

### Task 6: Perform Emote in Wheat Field
- **Coarse intent:** Execute emote animation in designated location
- **Atomic steps:**
  - Navigate south to wheat field area
  - Open emote menu
  - Select and perform emote
- **Single-action:** No (compound: navigate + menu + action)
- **Navigation required:** Yes, from south area
- **Obstacles:** Emote not specified; may require discovery

### Task 7: Chop Logs
- **Coarse intent:** Gather logs via woodcutting
- **Atomic steps:**
  - Navigate to tree location
  - Click tree to begin chopping
  - Wait for completion
  - Repeat until satisfied
- **Single-action:** No (repeated gathering)
- **Navigation required:** Yes
- **Obstacles:** Quantity threshold not specified
- **Acquisition note:** Gather, not purchase

### Task 8: Burn Logs
- **Coarse intent:** Craft via firemaking
- **Atomic steps:**
  - Gather tinderbox or access fire source
  - Click logs with tinderbox
  - Confirm burn
  - Repeat until satisfied
- **Single-action:** No (repeated crafting)
- **Navigation required:** Depends on fire location
- **Obstacles:** Tinderbox availability; fire proximity
- **Acquisition note:** Produce via crafting

### Task 9: Fletch Arrow Shafts
- **Coarse intent:** Craft arrows via knife-on-logs
- **Atomic steps:**
  - Gather or locate logs
  - Gather knife
  - Click logs with knife
  - Confirm fletch
  - Repeat until satisfied
- **Single-action:** No (repeated crafting)
- **Navigation required:** Depends on tool/material locations
- **Obstacles:** Knife availability; crafting speed
- **Acquisition note:** Produce via crafting

### Task 10: Pick Sweetcorn
- **Coarse intent:** Harvest from farming location
- **Atomic steps:**
  - Navigate to farm area
  - Locate sweetcorn plot
  - Click to harvest
  - Repeat until satisfied
- **Single-action:** No (repeated gathering)
- **Navigation required:** Yes
- **Obstacles:** Quantity threshold not specified; location may vary
- **Acquisition note:** Gather, not purchase

## Granularity Assessment

### Overall Pattern
- **Coarse level:** 10 titled objectives
- **Fine level:** Each task typically 2-4 atomic sub-actions
- **Clustering:** Region-based (hub interactions, then distributed resource gathering)
- **Compound actions:** Most tasks mix navigation + interaction or repeated gather/craft loops

### Atomic Unit Definition
Single-click action on a specific game element with no prior menu/location discovery needed. Excludes retry loops and wait periods.

### Quantification Gaps
- Pickpocket target count: unspecified
- Log burn quantity: unspecified
- Arrow shaft quantity: unspecified
- Sweetcorn pick quantity: unspecified
- Emote type/discovery method: unspecified

### Efficiency Notes
- Navigation acts as implicit checkpoint between tasks
- No explicit inventory management barriers noted
- No time-pressure mechanics noted
- Task ordering allows sequential progression without backtracking

