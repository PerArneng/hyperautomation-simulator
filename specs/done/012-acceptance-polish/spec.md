---
id: 012
name: acceptance-polish
description: Performance and visual polish, and verification of every requirement from the brief in a real browser
---

# 012 acceptance-polish

## Goal
Finish quality and prove every R1 to R18 from spec 001.

## Background
Spec 001.

## Approach
Run the full app in Chrome. Look at screenshots of every tab at several stages. Fix defects. Add README with how to open. Independent review of the economics and code. Write a morning report.

## Verification
Requirement checklist with evidence, all tests green, no console errors over a long run at top speed, frame time recorded.

## Out of scope
New features.

## Result
Requirement check against spec 001, with evidence. Browser tests in `tests/e2e/`, engine tests in `tests/sim/`.

| Req | Status | Evidence |
|---|---|---|
| R1 Web page, D3, opens easily | Met | One 875 KB `dist/index.html`; opened from `file://` with no network requests in `shell.mjs` and `soak.mjs`; charts in D3 |
| R2 Small title | Met | Exact text under the country name in the top bar |
| R3 Fictive, high level, few parameters | Met | Novaria; 6 scenarios, 7 sliders, welcome and guided story |
| R4 Time speed | Met | Six speeds from 1 day = 45 s to 1 year/s, tested; see decision below for 1 day/s |
| R5 Half are knowledge workers | Met | Test: within 2 points at start, within 7 after 15 years |
| R6 AI and robots are separate | Met | Separate sliders, costs, speed, code; test shows each saves only its own kind of labour |
| R7 Task-level efficiency | Met | Task model with exposure per sector; achieved efficiency chart |
| R8 Tabs | Met | Town and People (individuals), Dashboard, Companies, Government |
| R9 3D people commute, green and red | Met | Test: no unemployed person commutes to work; screenshots reviewed |
| R10 Blue boxes to shops and homes; unemployed buy less | Met | Arcs, piles, carried boxes; test: unemployed spend under 80% of employed |
| R11 Savings, company income, margin per worker, unemployment | Met | Vital signs and charts |
| R12 Help on every graph | Met | Tests open help on all 29 dashboard and 6 government charts |
| R13 Taxes and government | Met | Government tab; money check green |
| R14 Lower income and visible support | Met | 80/70/65% then assistance; test: insurance lasts 12 to 15 months; support charts, turquoise coins |
| R15 Jobs early, scarce later | Met | Starts at 10% unemployment, hiring to about 6%; open-jobs-per-seeker chart falls |
| R16 Retirement and entrants | Met | Test: both occur, population fixed |
| R17 Professional, smooth, cool | Met, judged by me only | 60 fps on real GPU (M1 Max) in all tabs at 1 year/s, p95 about 18 ms; screenshots reviewed; the user has not yet seen it |
| R18 Grounded in research | Met | Mechanisms and parameters from `research/`, cited in help text |

Other results: 20 engine tests and 73 browser checks pass. Soak: 60 years in each of 6 scenarios through all tabs plus extreme sliders, no errors, all values finite, money error under 1 kr. No page overflow at 1024x768, 1280x720 or 1920x1080. No test on a slower GPU; effects drop automatically below 26 fps but this path was exercised only by code review.

Independent review found 13 defects and 7 minor issues, including insurance ending at month 8, sliders lost on restart, overstated trade balance and a month-length zigzag in margins. All were fixed and the important ones have regression tests.

Decision for the user to check: the calendar and the figures run on separate clocks. Figures always live one typical 45-second day, so at 1 day/s the calendar does not match their commute. A literal 1 s day would make them teleport and strobe the lighting.

Not done: nothing is committed, because the user did not ask for commits. `AGENTS.md` still describes a different project and was left alone. Ensemble runs with uncertainty bands, recommended by the research, are not built (see `specs/ideas/ensemble-bands.md`).
