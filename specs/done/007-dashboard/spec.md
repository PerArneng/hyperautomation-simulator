---
id: 007
name: dashboard
description: D3 macro dashboard of live time graphs with help on each graph, no-AI ghost lines and rollout markers
---

# 007 dashboard

## Goal
Dashboard of KPI tiles and small-multiple time graphs showing the state of the macro economy, each with help.

## Background
R8, R11, R12, R13, R14. Follow the `dataviz` skill. Research: linked aggregates with one time cursor, ghost baseline, Kalecki profit identity.

## Approach
Reusable chart component. Groups: Jobs, Output and demand, Households, Companies, Government, Automation. Shared crosshair. Help popover per graph with what it is, how to read it and why it matters.

## Verification
Browser test: every graph has data and its help opens. Palette validated. Screenshot review.

## Out of scope
Government deep dive (spec 010).

## Result
Built `src/ui/chart.ts` and `src/ui/dashboard.ts`: 29 live charts in six groups, each with plain-language help (what it shows, how to read it, why it matters) and a data table. One shared time cursor, grey no-AI comparison line, roll-out stage markers. `tests/e2e/dashboard.mjs` passes: every chart has data and help that opens; cursor is shared; no console errors.
Palette: the dataviz validator passes on the actual dark panel surface. It rejected blue with violet, orange with yellow and magenta with aqua in the same chart, so those combinations were replaced.
While reviewing screenshots: unemployment fell to about 1% early in some runs because workforce size varied by seed. Fixed in the engine with stratified starting ages; tests re-run and pass. The first years now go from about 10% to about 6.5%.
