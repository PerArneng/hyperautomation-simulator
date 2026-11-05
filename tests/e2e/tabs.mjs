import { mkdirSync } from "node:fs";
import { openApp } from "./browser.mjs";

mkdirSync("test-results", { recursive: true });
const fails = [];
const check = (name, ok, info = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name} ${info}`); if (!ok) fails.push(name); };
const { browser, page, errors } = await openApp({ query: "?tab=people&speed=week" });
await page.evaluate(() => { const a = window.__app.app; for (let i = 0; i < 365 * 11; i++) a.stepDay(); });
await page.waitForTimeout(1500);
await page.screenshot({ path: "test-results/people.png" });

// People: regrouping moves dots, a click opens a biography.
const before = await page.evaluate(() => Array.from(window.__app.people.x.slice(0, 40)));
await page.click('.seg-btn[data-group="sector"]');
await page.waitForTimeout(1600);
const after = await page.evaluate(() => Array.from(window.__app.people.x.slice(0, 40)));
const moved = after.filter((v, i) => Math.abs(v - before[i]) > 3).length;
check("regrouping moves the dots", moved > 10, `moved=${moved}`);
await page.screenshot({ path: "test-results/people-sector.png" });
await page.click(".story-btn");
await page.waitForTimeout(700);
const bio = await page.locator(".bio").innerText();
check("story button opens a biography", /Savings/.test(bio) && /Income source/.test(bio), bio.slice(0, 60));
await page.screenshot({ path: "test-results/people-bio.png" });
const dot = await page.evaluate(() => { const p = window.__app.people; const r = document.querySelector(".people-canvas").getBoundingClientRect(); return { x: r.left + p.x[200], y: r.top + p.y[200] }; });
await page.mouse.click(dot.x, dot.y);
await page.waitForTimeout(400);
check("clicking a dot selects that person", await page.evaluate(() => window.__app.people.selected >= 0));

// Companies.
await page.click('.tab[data-tab="companies"]');
await page.waitForTimeout(900);
const first = () => page.$eval(".lb-rows .lb-row", (r) => r.querySelector(".lb-names b").textContent);
const n = await page.$$eval(".lb-rows .lb-row", (r) => r.length);
check("leaderboard lists companies", n >= 26, `rows=${n}`);
const a = await first();
await page.click('.lb-sort[data-sort="jobs"]');
await page.waitForTimeout(800);
const b = await first();
check("sorting changes the order", a !== b, `${a} -> ${b}`);
await page.screenshot({ path: "test-results/companies.png" });
await page.click(".lb-rows .lb-row");
await page.waitForTimeout(600);
check("company detail opens", (await page.locator(".lb-detail").innerText()).includes("Staff"));
await page.screenshot({ path: "test-results/companies-detail.png" });
await page.selectOption("#lb-sector", "software");
await page.waitForTimeout(500);
const rows = await page.$$eval(".lb-rows .lb-row .lb-names span", (s) => s.map((x) => x.textContent));
check("business filter works", rows.length > 0 && rows.every((x) => x === "Software & Media"), rows.join(","));
const closedCheck = await page.evaluate(() => { const a = window.__app.app; for (let i = 0; i < 365 * 25; i++) a.stepDay(); return a.economy.firms.filter((f) => !f.alive).length; });
await page.selectOption("#lb-sector", "all");
await page.waitForTimeout(800);
const closedRows = await page.$$eval(".lb-rows .lb-row.closed", (r) => r.length);
check("closed companies are shown", closedCheck === closedRows, `engine=${closedCheck} rows=${closedRows}`);

// Government.
await page.click('.tab[data-tab="government"]');
await page.waitForTimeout(1500);
await page.screenshot({ path: "test-results/government.png" });
const sankeyLinks = await page.$$eval(".s-links path", (p) => p.length);
check("Sankey renders", sankeyLinks > 8, `links=${sankeyLinks}`);
const sums = await page.evaluate(() => window.__app.government.debugRowSums());
check("every row of the books sums to zero", sums.every((v) => Math.abs(v) < 1), Math.max(...sums.map(Math.abs)).toFixed(4));
const ok = await page.$eval(".money-badge", (b) => b.dataset.ok);
check("money check is green", ok === "true");
const agreed = await page.evaluate(() => {
  const a = window.__app.app; const h = a.stats;
  const text = document.querySelector('.chart[data-chart="gov-income"] .legend-item .legend-value').textContent;
  return { taxIncome: h.taxIncome, text };
});
check("tax chart agrees with engine", agreed.text.includes("M") || agreed.text.includes("k"), JSON.stringify(agreed));
const govCharts = await page.$$eval(".government .chart", (cs) => cs.map((c) => c.dataset.chart));
let govHelp = 0;
for (const id of govCharts) {
  const card = page.locator(`.government .chart[data-chart="${id}"]`);
  await card.locator(".help-dot").click();
  if (/What it shows/.test(await card.locator(".chart-help").innerText())) govHelp++;
  await card.locator(".help-dot").click();
}
check("every government chart has help", govHelp === govCharts.length && govCharts.length >= 6, `${govHelp}/${govCharts.length}`);
await page.evaluate(() => document.querySelector(".government").scrollTo(0, 560));
await page.waitForTimeout(1000);
await page.screenshot({ path: "test-results/government-2.png" });
await page.evaluate(() => document.querySelector(".government").scrollTo(0, 2000));
await page.waitForTimeout(1000);
await page.screenshot({ path: "test-results/government-3.png" });
check("no console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
if (fails.length) process.exit(1);
