import { mkdirSync } from "node:fs";
import { openApp } from "./browser.mjs";

mkdirSync("test-results", { recursive: true });
const { browser, page, errors, external } = await openApp({ query: "?speed=month" });
const fails = [];
const check = (name, ok, info = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name} ${info}`); if (!ok) fails.push(name); };
const today = () => page.evaluate(() => window.__app.app.economy.day);

// Clock rate, measured directly so it does not depend on how fast headless Chrome renders.
const rate = (id) => page.evaluate((speed) => {
  const a = window.__app.app;
  a.setSpeed(speed);
  a.setPaused(false);
  const before = a.economy.day;
  a.advance(1);
  return a.economy.day - before;
}, id);
const month = await rate("month");
check("month speed advances about 30 days per second", month >= 29 && month <= 32, `days=${month}`);
const week = await rate("week");
check("week speed advances about 7 days per second", week >= 6 && week <= 8, `days=${week}`);
const day = await rate("day");
check("day speed advances about 1 day per second", day >= 0 && day <= 2, `days=${day}`);
await page.selectOption("#time-speed", "day");
check("speed control changes the speed", (await page.evaluate(() => window.__app.app.speed.id)) === "day");

await page.click(".icon-btn.play");
const d5 = await today();
await page.waitForTimeout(500);
check("pause stops the date", (await today()) === d5);
await page.click(".icon-btn.play");

await page.click('.scenario[data-id="hyper-policy"]');
const c = await page.evaluate(() => window.__app.app.controls);
check("preset sets sliders", c.automationTax === 0.4 && c.citizenDividend === 3000);
check("preset restarts the clock", (await today()) < 40);

for (const id of ["dashboard", "people", "companies", "government", "town"]) {
  await page.click(`.tab[data-tab="${id}"]`);
  check(`tab ${id} shows`, await page.evaluate((t) => window.__app.shell.activeTab === t, id));
}

// Regression: hand-set policy survives a restart, and goes when a scenario is picked.
await page.evaluate(() => window.__app.app.setControl("automationTax", 0.33));
await page.click('.icon-btn[title="Start again"]');
check("restart keeps hand-set sliders", (await page.evaluate(() => window.__app.app.controls.automationTax)) === 0.33);
await page.click('.scenario[data-id="none"]');
check("picking a scenario clears hand-set sliders", (await page.evaluate(() => window.__app.app.controls.automationTax)) === 0);
await page.evaluate(() => { const a = window.__app.app; a.chooseScenario("hyper"); for (let i = 0; i < 365 * 60; i++) a.stepDay(); });
check("60 simulated years run without errors", (await page.evaluate(() => window.__app.app.economy.history.length)) > 700);
await page.waitForTimeout(300);
await page.screenshot({ path: "test-results/shell.png" });
check("no console errors", errors.length === 0, errors.join(" | "));
check("no network requests", external.length === 0, external.join(" "));
await browser.close();
if (fails.length) process.exit(1);
