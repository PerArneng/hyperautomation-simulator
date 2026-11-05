// Headless scenario runner for calibration. Usage: node scripts/scenarios.ts [years] [seeds]
import { Economy } from "../src/sim/economy.ts";
import type { Controls } from "../src/sim/params.ts";
import type { MonthStats } from "../src/sim/types.ts";

const years = Number(process.argv[2] ?? 15);
const seeds = Number(process.argv[3] ?? 3);
const only = process.argv[4];

const scenarios: Record<string, Partial<Controls>> = {
  baseline: {},
  measured: { aiLevel: 0.07, robotLevel: 0.03 },
  strong: { aiLevel: 0.2, robotLevel: 0.15 },
  hyper: { aiLevel: 0.8, robotLevel: 0.7 },
  hyperAIonly: { aiLevel: 0.8 },
  hyperRobotOnly: { robotLevel: 0.7 },
  hyperElastic: { aiLevel: 0.8, robotLevel: 0.7, demandResponse: 1, newJobs: 1 },
  hyperTax: { aiLevel: 0.8, robotLevel: 0.7, automationTax: 0.4 },
  hyperUBI: { aiLevel: 0.8, robotLevel: 0.7, automationTax: 0.4, citizenDividend: 5000 },
  extreme: { aiLevel: 0.94, robotLevel: 0.9, demandResponse: 0.1, newJobs: 0 },
};

const fmt = (x: number, d = 1) => x.toFixed(d).padStart(7);
const avg = (hs: MonthStats[], f: (h: MonthStats) => number) => hs.reduce((a, h) => a + f(h), 0) / Math.max(1, hs.length);

const started = Date.now();
console.log("scenario       | yr | u%    uK%   uM%   vac | GDPidx  infl% rate% | save(k) med(k) | margin% prof/w(k) | bal%GDP debt%GDP | firms bankr | AI%  robots | cons(M) unitsold/made | err");
for (const [name, controls] of Object.entries(scenarios)) {
  if (only && !name.includes(only)) continue;
  const runs: Economy[] = [];
  for (let s = 1; s <= seeds; s++) {
    const e = new Economy(s * 11, controls);
    for (let d = 0; d < years * 365.25; d++) e.step();
    runs.push(e);
  }
  const checkpoints = [1, 3, 5, 10, 15, 20, 30].filter((y) => y <= years);
  for (const y of checkpoints) {
    const window = runs.flatMap((e) => e.history.slice(Math.max(0, y * 12 - 12), y * 12));
    const bank = runs.reduce((a, e) => a + e.history.slice(0, y * 12).reduce((b, h) => b + h.bankruptcies, 0), 0) / runs.length;
    console.log(
      name.padEnd(14), "|", String(y).padStart(2), "|",
      fmt(avg(window, (h) => h.unemploymentRate * 100)), fmt(avg(window, (h) => h.unemploymentKnowledge * 100)), fmt(avg(window, (h) => h.unemploymentManual * 100)), fmt(avg(window, (h) => h.vacancies), 0), "|",
      fmt(avg(window, (h) => h.gdpReal * 100), 0), fmt(avg(window, (h) => h.inflation * 100)), fmt(avg(window, (h) => h.policyRate * 100)), "|",
      fmt(avg(window, (h) => h.savingsMean / 1000), 0), fmt(avg(window, (h) => h.savingsMedian / 1000), 0), "|",
      fmt(avg(window, (h) => h.profitMargin * 100)), fmt(avg(window, (h) => h.profitPerWorker / 1000)), "|",
      fmt(avg(window, (h) => (h.budgetBalance / Math.max(1, h.gdpNominal)) * 100)), fmt(avg(window, (h) => h.debtToGdp * 100), 0), "|",
      fmt(avg(window, (h) => h.firmsAlive), 0), fmt(bank, 1), "|",
      fmt(avg(window, (h) => h.aiAdoption * 100), 0), fmt(avg(window, (h) => h.robots), 0), "|",
      fmt(avg(window, (h) => h.consumption / 1e6)), fmt(avg(window, (h) => h.unitsSold / Math.max(1, h.unitsProduced)), 2), "|",
      Math.max(...window.map((h) => Math.abs(h.moneyError))).toFixed(2),
    );
  }
}
console.log(`elapsed_s=${((Date.now() - started) / 1000).toFixed(1)}`);
