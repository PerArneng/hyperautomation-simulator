// Prints a month's full accounts for calibration. Usage: node scripts/detail.ts [months] [controlsJson]
import { Economy } from "../src/sim/economy.ts";
import { SECTORS } from "../src/sim/params.ts";
import { FLOW_CATEGORIES, BOOK_NAMES } from "../src/sim/types.ts";

const months = Number(process.argv[2] ?? 36);
const controls = JSON.parse(process.argv[3] ?? "{}");
const e = new Economy(11, controls);
while (e.history.length < months) e.step();
const h = e.history.at(-1)!;
console.log(`GDP/mo ${(h.gdpNominal / 1e6).toFixed(1)}M employed ${h.employed} u ${(h.unemploymentRate * 100).toFixed(1)}% avg wage ${h.averageWage.toFixed(0)} price ${h.priceIndex.toFixed(3)} wage idx ${(h.wageIndexReal).toFixed(3)} mpcScale ${e.mpcScale.toFixed(2)} spendFactor ${e.spendFactor.toFixed(2)}`);
console.log(`gov income ${(h.govIncome / 1e6).toFixed(1)} (inc ${(h.taxIncome / 1e6).toFixed(1)} pay ${(h.taxPayroll / 1e6).toFixed(1)} vat ${(h.taxVat / 1e6).toFixed(1)} corp ${(h.taxCorporate / 1e6).toFixed(1)}) spend ${(h.govSpending / 1e6).toFixed(1)} (wages ${(h.spendPublicWages / 1e6).toFixed(1)} pens ${(h.spendPensions / 1e6).toFixed(1)} ui ${(h.spendInsurance / 1e6).toFixed(1)} sa ${(h.spendAssistance / 1e6).toFixed(1)} buy ${(h.spendPurchases / 1e6).toFixed(1)} int ${(h.spendInterest / 1e6).toFixed(1)})`);
console.log(`households: income ${(h.householdIncome / 1e6).toFixed(1)} cons ${(h.consumption / 1e6).toFixed(1)} savings ${(h.savingsTotal / 1e6).toFixed(0)} debt ${(h.mortgageDebt / 1e6).toFixed(0)} top10 ${(h.savingsTop10Share * 100).toFixed(0)}% arrears ${h.arrears} ins ${h.onInsurance} sa ${h.onAssistance}`);
console.log("firm                     sector          jobs  rev(M)  prof(M) margin  price  mkup  invDays  fcst/sold cash(M) loan(M)");
for (const f of e.firms) {
  if (!f.alive) continue;
  const s = SECTORS[f.sector];
  const r = f.lastRevenue || 1;
  console.log(f.name.padEnd(24), s.key.padEnd(12), String(f.employees.length).padStart(5), (r / 1e6).toFixed(2).padStart(7), (f.lastProfit / 1e6).toFixed(2).padStart(7), ((f.lastProfit / r) * 100).toFixed(0).padStart(6), f.price.toFixed(0).padStart(6), f.markup.toFixed(2).padStart(6), (f.inventory / Math.max(0.01, f.lastSold / 30.4)).toFixed(0).padStart(7), (f.forecast * 30.4 / Math.max(0.01, f.lastSold)).toFixed(2).padStart(8), (f.cash / 1e6).toFixed(1).padStart(7), (f.loan / 1e6).toFixed(1).padStart(6));
}
console.log("\nflow matrix (M kr, last month)");
console.log("".padEnd(26), BOOK_NAMES.map((b) => b.slice(0, 9).padStart(10)).join(""));
FLOW_CATEGORIES.forEach((c, row) => {
  const vals = BOOK_NAMES.map((_b, i) => e.lastFlows[row * 5 + i] / 1e6);
  if (vals.some((v) => Math.abs(v) > 0.001)) console.log(c.padEnd(26), vals.map((v) => v.toFixed(2).padStart(10)).join(""));
});
const workers = e.persons.filter((p) => p.status !== 2);
console.log(`\nknowledge share ${(workers.filter((p) => p.knowledge).length / workers.length).toFixed(2)} retired ${h.retired}`);
