import test from "node:test";
import assert from "node:assert/strict";
import { Economy } from "../../src/sim/economy.ts";
import { SECTORS } from "../../src/sim/params.ts";
import { EMPLOYED, RETIRED, UNEMPLOYED, FLOW_CATEGORIES } from "../../src/sim/types.ts";

function run(e: Economy, years: number) {
  const days = Math.round(years * 365.25);
  for (let i = 0; i < days; i++) e.step();
}

test("same seed gives identical results, different seed differs", () => {
  const a = new Economy(7, { aiLevel: 0.5 });
  const b = new Economy(7, { aiLevel: 0.5 });
  const c = new Economy(8, { aiLevel: 0.5 });
  run(a, 3); run(b, 3); run(c, 3);
  assert.deepEqual(a.history.at(-1), b.history.at(-1));
  assert.notEqual(a.history.at(-1)!.savingsTotal, c.history.at(-1)!.savingsTotal);
});

test("every krona is accounted for over 20 years, even in the harshest scenario", () => {
  const e = new Economy(3, { aiLevel: 0.9, robotLevel: 0.9, demandResponse: 0, newJobs: 0, support: 0.5 });
  run(e, 20);
  const scale = e.history.at(-1)!.savingsTotal + 1;
  for (const h of e.history) assert.ok(Math.abs(h.moneyError) < scale * 1e-6, `money error ${h.moneyError}`);
});

test("every row of the flow matrix sums to zero", () => {
  const e = new Economy(4, { aiLevel: 0.7, robotLevel: 0.6, citizenDividend: 4000, automationTax: 0.3 });
  run(e, 6);
  const size = 5;
  FLOW_CATEGORIES.forEach((name, row) => {
    let sum = 0;
    let scale = 1;
    for (let c = 0; c < size; c++) { sum += e.lastFlows[row * size + c]; scale += Math.abs(e.lastFlows[row * size + c]); }
    assert.ok(Math.abs(sum) < scale * 1e-6, `${name} sums to ${sum}`);
  });
});

test("population stays fixed, with retirements and new entrants each decade", () => {
  const e = new Economy(5);
  run(e, 10);
  assert.equal(e.persons.length, 800);
  const retirements = e.history.reduce((a, h) => a + h.retirements, 0);
  const entrants = e.history.reduce((a, h) => a + h.entrants, 0);
  assert.ok(retirements > 40, `retirements ${retirements}`);
  assert.ok(entrants > 40, `entrants ${entrants}`);
  e.persons.forEach((p, i) => assert.equal(p.id, i));
});

test("staff lists agree with each person's employer", () => {
  const e = new Economy(6, { aiLevel: 0.6, robotLevel: 0.6 });
  run(e, 8);
  for (const f of e.firms) {
    for (const id of f.employees) assert.equal(e.persons[id].firmId, f.id);
    assert.equal(f.countK + f.countM, f.employees.length);
  }
  for (const p of e.persons) {
    if (p.status === EMPLOYED) assert.ok(e.firms[p.firmId].employees.includes(p.id));
    else assert.equal(p.firmId, -1);
  }
});

test("about half the workforce are knowledge workers", () => {
  const e = new Economy(2);
  const count = () => {
    const w = e.persons.filter((p) => p.status !== RETIRED);
    return w.filter((p) => p.knowledge).length / w.length;
  };
  assert.ok(Math.abs(count() - 0.5) < 0.02);
  run(e, 15);
  assert.ok(Math.abs(count() - 0.5) < 0.07, `share ${count()}`);
});

test("AI software saves knowledge labour only, robots save manual labour only", () => {
  const ai = new Economy(9, { aiLevel: 0.8 });
  const robots = new Economy(9, { robotLevel: 0.8 });
  run(ai, 6); run(robots, 6);
  const a = ai.history.at(-1)!;
  const r = robots.history.at(-1)!;
  assert.ok(a.aiSaving > 0.2 && a.robotSaving === 0 && a.robots === 0);
  assert.ok(r.robotSaving > 0.05 && r.aiSaving === 0 && r.robots > 0 && r.aiSeats === 0);
});

test("the unemployed receive support and spend much less", () => {
  const e = new Economy(10);
  run(e, 4);
  const recent = e.history.slice(-24);
  const mean = (f: (h: (typeof recent)[number]) => number) => recent.reduce((a, h) => a + f(h), 0) / recent.length;
  assert.ok(mean((h) => h.onInsurance + h.onAssistance) > 0);
  const unemployed = mean((h) => h.consumptionPerUnemployed);
  const employed = mean((h) => h.consumptionPerEmployed);
  assert.ok(unemployed < employed * 0.8, `${unemployed} vs ${employed}`);
  assert.ok(e.persons.some((p) => p.status === UNEMPLOYED && p.support !== "none"));
});

test("sectors are all represented with firms and jobs", () => {
  const e = new Economy(1);
  SECTORS.forEach((s, i) => {
    if (s.firms > 0) assert.ok(e.firms.some((f) => f.sector === i && f.employees.length > 0), s.key);
  });
});

test("unemployment insurance lasts about 14 months for those who qualify", () => {
  const e = new Economy(12, { aiLevel: 0.9, robotLevel: 0.9, demandResponse: 0, newJobs: 0 });
  const longest = new Map<number, number>();
  for (let d = 0; d < 365 * 15; d++) {
    e.step();
    if (d % 30 === 0) {
      for (const p of e.persons) {
        if (p.support === "insurance") longest.set(p.id, Math.max(longest.get(p.id) ?? 0, p.monthsUnemployed));
      }
    }
  }
  const max = Math.max(...longest.values());
  assert.ok(max >= 12 && max <= 15, `longest insurance spell ${max} months`);
});

test("the GDP index starts at exactly 100", () => {
  const e = new Economy(1);
  run(e, 1);
  assert.equal(e.history[0].gdpReal, 1);
});

test("monthly margins do not depend on the length of the month", () => {
  const e = new Economy(13);
  run(e, 12);
  const margins = (month: number) => {
    const list = e.history.filter((h) => new Date(h.date).getUTCMonth() === month).map((h) => h.profitMargin);
    return list.reduce((a, b) => a + b, 0) / list.length;
  };
  // History dates are the first day of the following month, so month 2 closes February.
  assert.ok(Math.abs(margins(2) - margins(3)) < 0.015, `${margins(2)} vs ${margins(3)}`);
});

test("household income includes dividends and interest", () => {
  const e = new Economy(14);
  run(e, 6);
  const h = e.history.at(-1)!;
  const wagesAndTransfers = e.persons.reduce((a, p) => a + p.netIncome, 0);
  assert.ok(h.householdIncome > wagesAndTransfers);
});

test("AI fees exceed what goes abroad, because part stays with local vendors", () => {
  const e = new Economy(15, { aiLevel: 0.8 });
  run(e, 8);
  const h = e.history.at(-1)!;
  assert.ok(h.aiFees > h.aiFeesAbroad * 1.2, `${h.aiFees} vs ${h.aiFeesAbroad}`);
});
