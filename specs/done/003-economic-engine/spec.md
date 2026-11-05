---
id: 003
name: economic-engine
description: Agent-based stock-flow-consistent economy of people, firms, bank, government and rest of world with AI software and robots
---

# 003 economic-engine

## Goal
A pure, deterministic, headless simulation engine for the fictive country, where every krona is accounted for and AI software and robots are separate mechanisms.

## Background
Research: `research/Simulating AI Hyperautomation in a Small Swedish Economy_ Archit.md` (architecture, ranked mechanisms, parameter table), `research/AI Economy Simulation Architecture.md` (SFC matrix, debt deflation, firm heuristics), `research/Hyperautomation_Economy_Simulation_Report-1.md` (rollout, dashboards). Requirements R5, R6, R7, R11, R13 to R16, R18.

## Approach
`src/sim/`, no DOM imports. Daily tick; monthly accounting.
- **People (about 1000):** age, knowledge or manual worker, employer, wage, savings, housing (rent, mortgage or owned), arrears, support status, MPC that falls with liquid assets, shareholdings.
- **Firms (about 24) by sector:** task-based production with automatability scores, adaptive demand forecast, inventory, markup pricing, loans. Bankruptcy and new entry.
- **AI software:** per-seat licence, S-curve adoption, labour saving on knowledge tasks, partly foreign vendors.
- **Robots:** capital purchase (loan financed) from a domestic robot maker, slower adoption, maintenance, replaces manual tasks.
- **Labour market:** vacancies, matching friction, hiring freeze before firing, last-in-first-out, entrants, retirement, deaths.
- **Demand:** sector budget shares, price elasticity and saturation; reinstatement through new tasks and a new-industries sector.
- **Government:** income, payroll, VAT, corporate and automation taxes; public wages, pensions, unemployment insurance (80/70/65%), social assistance, citizen dividend; debt.
- **Bank and central bank:** loans create deposits, write-offs hit equity, Taylor rule.
- **Ledger:** every flow has payer and receiver; invariants are checked every tick.

## Verification
Unit tests: same seed gives identical results; money invariants hold over 20 simulated years under the harshest scenario; insolvent households do not go below zero cash; retirement and entrants keep population fixed; AI affects knowledge workers and robots manual workers.

## Out of scope
Parameter tuning (spec 004), any UI.

## Result
Built `src/sim/` (`economy.ts`, `params.ts`, `types.ts`, `rng.ts`): 800 people, 23 companies plus 3 public employers, bank, government, rest of world. Daily production, hiring and shopping; monthly pay, tax, housing, dividends and accounts.
Every deposit is backed by a loan or bond (`moneyError` stays 0.00), and each flow-matrix row sums to zero. AI software and robots are separate mechanisms with separate costs, speeds and exposures. Tests in `tests/sim/economy.test.ts` pass.
Decisions: public staff and benefits are paid gross and then taxed so the flow matrix is honest. Automation tax is recycled equally to all adults, because a tax that just sat in the treasury was contractionary. A slow fiscal rule moves income tax to hold public debt near 35% of GDP, and the rest of the world's automation lowers export prices too, otherwise a small country could export its way out.
Speed: 0.14 ms per simulated day for main plus ghost run.
