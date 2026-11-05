import test from "node:test";
import assert from "node:assert/strict";
import { Economy } from "../../src/sim/economy.ts";
import type { Controls } from "../../src/sim/params.ts";
import type { MonthStats } from "../../src/sim/types.ts";

const cache = new Map<string, MonthStats[][]>();
function scenario(controls: Partial<Controls>, years = 20): MonthStats[][] {
  const key = JSON.stringify([controls, years]);
  if (!cache.has(key)) {
    const runs = [11, 22, 33].map((seed) => {
      const e = new Economy(seed, controls);
      for (let d = 0; d < years * 365.25; d++) e.step();
      return e.history;
    });
    cache.set(key, runs);
  }
  return cache.get(key)!;
}
const mean = (runs: MonthStats[][], from: number, to: number, f: (h: MonthStats) => number) => {
  const items = runs.flatMap((r) => r.slice(from * 12, to * 12));
  return items.reduce((a, h) => a + f(h), 0) / items.length;
};

test("no-AI baseline looks like a healthy small Nordic economy for 30 years", () => {
  const b = scenario({}, 30);
  const u = mean(b, 3, 30, (h) => h.unemploymentRate);
  const inflation = mean(b, 3, 30, (h) => h.inflation);
  const balance = mean(b, 3, 30, (h) => h.budgetBalance / h.gdpNominal);
  assert.ok(u > 0.04 && u < 0.09, `unemployment ${u}`);
  assert.ok(inflation > 0.01 && inflation < 0.04, `inflation ${inflation}`);
  assert.ok(Math.abs(balance) < 0.05, `budget balance ${balance}`);
  const failures = b.reduce((a, r) => a + r.reduce((x, h) => x + h.bankruptcies, 0), 0) / b.length;
  assert.ok(failures < 4, `failures ${failures}`);
  const publicShare = mean(b, 1, 5, (h) => h.publicJobs / h.employed);
  assert.ok(publicShare > 0.26 && publicShare < 0.34, `public share ${publicShare}`);
  const debtRatio = mean(b, 0, 2, (h) => (h.mortgageDebt * 1) / (h.householdIncome * 12));
  assert.ok(debtRatio > 1.2 && debtRatio < 2.4, `debt to income ${debtRatio}`);
});

test("measured AI adds a modest GDP gain and barely moves unemployment", () => {
  const b = scenario({});
  const m = scenario({ aiLevel: 0.07, robotLevel: 0.03 });
  const gain = mean(m, 9, 11, (h) => h.gdpReal) / mean(b, 9, 11, (h) => h.gdpReal) - 1;
  assert.ok(gain > 0.005 && gain < 0.05, `gain ${gain}`);
  const du = mean(m, 5, 20, (h) => h.unemploymentRate) - mean(b, 5, 20, (h) => h.unemploymentRate);
  assert.ok(Math.abs(du) < 0.015, `unemployment gap ${du}`);
});

test("hyperautomation raises unemployment and each tool hits its own kind of worker", () => {
  const b = scenario({});
  const hyper = scenario({ aiLevel: 0.8, robotLevel: 0.7 });
  const ai = scenario({ aiLevel: 0.8 });
  const robots = scenario({ robotLevel: 0.7 });
  assert.ok(mean(hyper, 8, 20, (h) => h.unemploymentRate) > mean(b, 8, 20, (h) => h.unemploymentRate) + 0.1);
  assert.ok(mean(ai, 8, 20, (h) => h.unemploymentKnowledge) > mean(ai, 8, 20, (h) => h.unemploymentManual) + 0.08);
  assert.ok(mean(robots, 10, 20, (h) => h.unemploymentManual) > mean(robots, 10, 20, (h) => h.unemploymentKnowledge) + 0.05);
  assert.ok(mean(hyper, 8, 20, (h) => h.profitMargin) > mean(b, 8, 20, (h) => h.profitMargin) + 0.08, "profits rise");
});

test("the outcome is not hard-coded: elastic demand and new industries can protect jobs", () => {
  const hyper = scenario({ aiLevel: 0.8, robotLevel: 0.7 });
  const open = scenario({ aiLevel: 0.8, robotLevel: 0.7, demandResponse: 1, newJobs: 1 });
  assert.ok(mean(open, 8, 20, (h) => h.unemploymentRate) < mean(hyper, 8, 20, (h) => h.unemploymentRate) - 0.1);
});

test("a citizen dividend funded by automation tax lifts consumption", () => {
  const hyper = scenario({ aiLevel: 0.8, robotLevel: 0.7 });
  const policy = scenario({ aiLevel: 0.8, robotLevel: 0.7, automationTax: 0.4, citizenDividend: 5000 });
  assert.ok(mean(policy, 8, 20, (h) => h.consumption) > mean(hyper, 8, 20, (h) => h.consumption) * 1.15);
  assert.ok(mean(policy, 8, 20, (h) => h.unemploymentRate) < mean(hyper, 8, 20, (h) => h.unemploymentRate));
});

test("a weak safety net hurts people more", () => {
  const strong = scenario({ aiLevel: 0.8, robotLevel: 0.7, support: 1.4 });
  const weak = scenario({ aiLevel: 0.8, robotLevel: 0.7, support: 0.6 });
  assert.ok(mean(weak, 8, 20, (h) => h.noBuffer) >= mean(strong, 8, 20, (h) => h.noBuffer) * 0.98);
});
