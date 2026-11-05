# Effects of AI Hyperautomation on Macro Economy

An animated simulation of **Novaria**, a fictive small country, for exploring what happens when task-level efficiency multiplies: AI software for knowledge workers, and robots for everyone else.

## Open it

Double-click `dist/index.html`. It is one self-contained file: no server, no network.

To rebuild it:

```bash
npm install
npm run build     # writes dist/index.html
npm run dev       # rebuilds on change, serves http://localhost:5173
```

## What is in it

| Tab | Shows |
|---|---|
| **Town** | 800 small 3D people commuting, shopping and queuing at the job centre. Blue boxes flow from companies to shops and the port. Buildings grow and shrink with staff. Click anyone or anything. |
| **Dashboard** | 29 live graphs of jobs, output, households, companies, government and automation. Each has a **?** with help and a data table. The grey line is the same country with no new automation. |
| **People** | Everyone as a dot, grouped how you like, and each person's story. |
| **Companies** | An animated leaderboard with what each company does. |
| **Government** | Taxes, spending, debt, a money-flow chart, and the accounts that prove the money adds up. |

Controls are on the left: six scenarios and seven sliders. Time speed runs from one day per 45 seconds to one year per second. Press **space** to pause.

## How the model works

Agent-based and stock-flow consistent, as recommended by the reports in `research/`:

- **People** have jobs, savings, homes and loans. Those with few savings spend most of what they get, and the unemployed spend far less.
- **Companies** forecast demand, hire and fire, set prices over costs, borrow, and can go bankrupt. Tasks are split into knowledge and manual tasks, each with its own exposure to automation.
- **AI software** is a per-seat licence that spreads quickly, and part of the fee leaves the country. **Robots** are bought on credit, spread slowly and need maintenance. They are separate mechanisms.
- **The state** collects income, payroll, VAT, corporate and automation taxes, and pays public staff, pensions, unemployment insurance (80, 70, 65% of pay, then means-tested assistance) and any citizen dividend.
- **The bank** creates money when it lends. **Every payment has a payer and a receiver**, and deposits always equal loans plus bonds.

Three things decide the outcome, and all are yours to change: how far automation goes, how much more people want when things get cheaper, and how readily new kinds of work appear. The result is not hard-coded: with the same technology, unemployment can stay near 6% or pass 30%.

**This explores mechanisms; it does not forecast.** Measured effects of AI so far are far smaller than the hyperautomation scenarios, which are marked speculative. Known modelling limits are listed in `specs/done/004-calibration/spec.md`.

## Development

```bash
npm test                  # engine and calibration tests
npm run typecheck
npm run e2e               # browser tests, using your installed Chrome
node scripts/scenarios.ts 30 4    # compare scenarios in a table
node scripts/detail.ts 36         # one month's full accounts
```

| Path | Contents |
|---|---|
| `src/sim/` | The economy, with no browser code |
| `src/app.ts` | Clock, scenarios, no-AI comparison run |
| `src/town/` | The 3D town (Three.js) |
| `src/ui/` | Shell and tabs (D3) |
| `research/` | Source reports, converted with `scripts/pdf_to_markdown.py` |
| `specs/` | The work log: what was built, why, and how it was checked |
