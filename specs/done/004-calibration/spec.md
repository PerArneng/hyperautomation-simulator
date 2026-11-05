---
id: 004
name: calibration
description: Tune the engine so the baseline is stable and scenarios give plausible results matching research benchmarks
---

# 004 calibration

## Goal
Baseline that looks like a healthy small Nordic economy for decades, and scenarios that respond for understandable reasons.

## Background
Research targets: public-sector share about 30%, household debt/income about 175%, housing costs 18 to 27% of income, measured AI should add about 0.5 to 1.5% GDP in 10 years. The conclusion must not be hard-coded: high demand elasticity or new-task creation must be able to avoid mass unemployment.

## Approach
`scripts/scenarios.ts` headless runner prints scenario tables. Tune constants in `src/sim/params.ts`.

## Verification
Numeric checks in tests, averaged across seeds:
- No-AI, 30 years: unemployment 4 to 9%; inflation 1 to 4%; government deficit below 5% of GDP on average; no firm-failure wave.
- Measured AI (5 to 7% savings): GDP up about 0.5 to 2% against baseline after 10 years; unemployment within 1.5 points of baseline.
- Hyperautomation, no policy: unemployment clearly higher, consumption share falls, knowledge workers hit by software and manual workers only by robots when each is enabled alone.
- Hyperautomation with high elasticity and new tasks: materially lower unemployment.
- Citizen dividend funded by automation tax: consumption recovers.

## Out of scope
UI.

## Result
Tuned with `scripts/scenarios.ts`, `scripts/detail.ts`, `scripts/early.ts`; guarded by `tests/sim/calibration.test.ts` (6 tests, pass). Means across 4 seeds, after all later fixes:
- No AI: unemployment about 6% (4.7 to 6.7% over 20 years), inflation about 2%, policy rate about 2 to 3%, deficit about 1.5 to 2.5% of GDP, debt about 40%, median savings steady at about 300 to 340 k kr, 26 to 34% of jobs public.
- Measured AI: GDP about +1.7% against no AI after 10 years, slightly above the +0.5 to +1.5% research range; unemployment within 1.5 points.
- Hyperautomation, no policy: unemployment about 27 to 30% (knowledge about 36%, manual about 19 to 24%), margin from about 14% to about 34%, deflation about -3.6%, debt over 200% of GDP by year 20.
- AI only hits mainly knowledge workers (about 33% vs 8 to 9%); robots only hit mainly manual workers (about 16 to 18% vs 7 to 8%).
- Elastic demand and new industries: about 11 to 13% at years 10 to 20, about 5% by year 30, so the conclusion is not hard-coded.
- Automation tax plus citizen dividend: unemployment about 6 to 7 points lower at year 20 and median savings over 3 times higher, at the cost of more debt.
Known weaknesses: (1) a slow swing in the no-AI baseline by year 30: unemployment about 3%, inflation about 3.6%, deficit about 9% of GDP, from wealth accumulating faster than income. Read beyond about 25 years with care. (2) Median savings fall sharply in the elastic case, as people spend down when goods are cheap. (3) Demand is partly set by constants tuned to fit, not estimated. (4) It is one small open economy with a simple proxy for automation abroad. Numbers are illustrations of mechanisms, not forecasts.
