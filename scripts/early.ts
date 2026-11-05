// Prints the first years of the no-AI run for several seeds. Usage: node scripts/early.ts
import { Economy } from "../src/sim/economy.ts";
for (const seed of [2026, 11, 22, 33]) {
  const e = new Economy(seed);
  while (e.history.length < 72) e.step();
  const rows = [3, 6, 9, 12, 18, 24, 30, 36, 48, 60, 72].map((m) => {
    const h = e.history[m - 1];
    return `${m}m u=${(h.unemploymentRate * 100).toFixed(1)} inf=${(h.inflation * 100).toFixed(1)} vac=${h.vacancies} emp=${h.employed} r=${(h.policyRate * 100).toFixed(1)}`;
  });
  console.log(seed, "\n ", rows.join("\n  "));
}
