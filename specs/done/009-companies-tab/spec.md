---
id: 009
name: companies-tab
description: Animated company leaderboard showing business, jobs, automation and profit, with company detail
---

# 009 companies-tab

## Goal
A leaderboard that visibly reorders as companies rise and fall, showing what business each is in.

## Background
R8, R11. Research: card per firm ordered by automatability, bankruptcy risk.

## Approach
Rows animate with FLIP. Sort by revenue, profit, profit per worker, jobs. Sector filter. Headcount versus output sparkline, AI seats, robots, risk. Detail panel.

## Verification
Browser test: sort changes order, company detail opens, bankrupt companies are shown.

## Out of scope
Trading, individual owners.

## Result
Built `src/ui/companiesTab.ts`: animated leaderboard (rows glide with FLIP) with business type, jobs with trend, income, profit, margin, profit per worker, AI share, robots and money risk. Sort by any column, filter by business, closed companies stay listed. Detail panel with history. `tests/e2e/tabs.mjs` passes, including that closed rows match the engine.
