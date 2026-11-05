---
id: 008
name: people-tab
description: Individuals tab with animated population dots, savings distribution and a biography for each person
---

# 008 people-tab

## Goal
See individuals in real time beyond the 3D view: everyone as a dot that flows between groups, and any person's story.

## Background
R8, R11, R14, R16. Research: clickable biography and pinned story characters.

## Approach
Canvas dots animated toward group layouts (status, occupation, sector, savings). Savings histogram, life-event timeline, sparkline of savings, pinned characters.

## Verification
Browser test: regrouping moves dots, clicking opens a biography with real data.

## Out of scope
Editing individuals.

## Result
Built `src/ui/peopleTab.ts`: all 800 people as dots that flow between groupings (status, occupation, employer, savings, age), savings histogram, six recurring characters recast if they die, and a biography with income, savings, spending, housing, sparklines and life events. Link to and from the town. `tests/e2e/tabs.mjs` passes.
