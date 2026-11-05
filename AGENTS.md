# Hyperautomation simulator

An animated macroeconomic simulation of Novaria, a fictive small country, for exploring what happens when task-level efficiency multiplies. It's a single offline web page. `README.md` covers what the app shows and how the model works.

## Commands

```bash
npm install
npm run build       # writes dist/index.html
npm run dev         # rebuilds on change, serves http://localhost:5173
npm test            # engine and calibration tests
npm run typecheck
npm run e2e         # builds, then runs the browser tests in the installed Chrome
node scripts/scenarios.ts 30 4    # compare scenarios in a table
node scripts/detail.ts 36         # one month's full accounts
```

`dist/` is git-ignored, so rebuild after a fresh clone.

## Layout

| Path | Contents |
|---|---|
| `src/sim/` | The economy engine, with no browser code |
| `src/app.ts` | Clock, scenarios, and the no-AI comparison run |
| `src/town/` | The 3D town (Three.js) |
| `src/ui/` | Shell and tabs (D3) |
| `tests/sim/`, `tests/e2e/` | Engine tests, and browser tests driven by Playwright |
| `research/` | Source reports as Markdown, converted with `scripts/pdf_to_markdown.py` |
| `specs/` | The work log: what was built, why, and how it was checked |

## Things to keep true

- **Offline single file:** `dist/index.html` must open from `file://` with no server and no network requests.
- **Engine separate from the page:** nothing in `src/sim/` may depend on the browser.
- **Money adds up:** every payment has a payer and a receiver, and deposits equal loans plus bonds. `Economy.moneyError()` must stay near zero.
- **Reproducible runs:** the same seed and controls must give identical results.
- **Outcomes aren't hard-coded:** results should come from the mechanisms and the user's settings.
- **Exploration, not forecast:** scenarios beyond measured effects stay labelled speculative. Known model limits are in `specs/done/004-calibration/spec.md`.
- **A small set of controls:** new tuning values go in `src/sim/params.ts` as constants unless a user really needs them as a slider.

## Spec-driven development

All non-trivial work is done from a spec. That covers changes to the model, calibration, scenarios, controls, tabs, graphs, the 3D town, the build and the tests. Fixing a typo or a small note doesn't need a spec. The `spec-driven` skill (`.claude/skills/spec-driven/SKILL.md`) has the full workflow. Its script `.claude/skills/spec-driven/scripts/spec-manager.py` is the only way to create and move specs, and it finds `<repo>/specs` from any directory.

- Layout:
  - `specs/{todo,working,hold,done,dropped}/NNN-kebab-name/spec.md`, where the folder is the status.
  - Each spec.md has a YAML header (`id`, `name`, `description`) and the sections Goal, Background, Approach, Verification, Out of scope, Result.
  - `specs/ideas/` holds one file per future idea and isn't tracked by the script.
- Commands: `init NAME "DESCRIPTION"`, `working ID`, `done ID`, `hold ID "REASON"`, `resume ID` (only with the user's OK), `drop ID "REASON"`, `list [--json]` and `check`. `--dry-run` shows what a move would do.
- Rules:
  - One spec in working at a time. Pick from todo in id order unless the user says otherwise.
  - New work and follow-ups become specs via `init`. Work done without a spec is recorded afterwards with `init` → `working` → `done`.
  - A spec goes to `hold` with its reason when it needs something only the user can decide or do, such as spending money or a choice about what the product should be.
  - `done` only after Verification passed and Result is written. Verification here usually means `npm test`, `npm run typecheck` and `npm run e2e` pass. Model changes also need `node scripts/scenarios.ts` compared against the earlier results, and visual changes need looking at the running page. Write down what was measured, not just that it was done.
  - The e2e tests use software WebGL, so they don't show real frame rates. Measure performance on a real GPU.
  - Use `drop` with a one-line reason when the idea didn't help. Partial wins are `done`, and dropped specs aren't reopened.
  - Commit messages name the spec (`spec 001: ...`). Run `check` before committing spec changes.
