---
id: 005
name: app-shell
description: Top bar, tabs, time speed, scenarios and few high-level controls, driving the simulation and a no-AI ghost run
---

# 005 app-shell

## Goal
The frame of the app: small title, date, play/pause, time speed from slow-day to years per second, tabs, scenario presets and a short list of sliders.

## Background
R2, R3, R4, R8. Research: three presets (measured, strong, hyperautomation flagged as speculative), and always a no-AI ghost for comparison.

## Approach
`src/ui/`. Fixed-rate sim clock, with catch-up limit. Ghost sim runs in lockstep with AI off. Controls: AI software efficiency, robots, demand response, new job creation, unemployment support, automation tax, citizen dividend. Rollout timeline with markers. Reset and seed.

## Verification
Browser test: changing speed changes date rate; pause stops the date; presets set sliders; tabs switch; 60 simulated years do not throw.

## Out of scope
Tab contents.

## Result
Built `src/app.ts` (clock, scenarios with staged roll-outs, no-AI ghost economy in lockstep) and `src/ui/shell.ts` (small title, date, play/pause, restart, six time speeds, eight vital signs with comparison to no AI, six scenarios, seven sliders with help, roll-out timeline). `tests/e2e/shell.mjs` passes: speeds change the date rate, pause stops it, presets set sliders, tabs switch, 60 simulated years run with no errors and no network requests.
Decision: moving AI or robot sliders ends the scheduled roll-out, because the user has taken over.
