import { mkdirSync } from "node:fs";
import { openApp } from "./browser.mjs";

mkdirSync("test-results", { recursive: true });
const fails = [];
const check = (name, ok, info = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name} ${info}`); if (!ok) fails.push(name); };
const { browser, page, errors } = await openApp({ query: "?quality=1&speed=week" });
await page.evaluate(() => window.__app.town.setDayTime(0.31));
await page.waitForTimeout(7000);
await page.screenshot({ path: "test-results/town-start.png" });
const start = await page.evaluate(() => window.__app.town.debug());
check("companies placed", start.sites >= 26, JSON.stringify(start));

// Move the world on quickly and look again.
await page.evaluate(() => { const a = window.__app.app; for (let i = 0; i < 365 * 11; i++) a.stepDay(); });
await page.evaluate(() => window.__app.town.setDayTime(0.42));
await page.waitForTimeout(6000);
await page.screenshot({ path: "test-results/town-later.png" });
await page.evaluate(() => { window.__app.town.setCamera(30, 26, 36, 8, 8); });
await page.waitForTimeout(2500);
await page.screenshot({ path: "test-results/town-close.png" });
await page.evaluate(() => { window.__app.town.setCamera(92, 22, 42, 66, 16); });
await page.waitForTimeout(2500);
await page.screenshot({ path: "test-results/town-robots.png" });
await page.evaluate(() => { window.__app.town.setDayTime(0.92); window.__app.town.setCamera(118, 112, 146, 6, 4); });
await page.waitForTimeout(2500);
await page.screenshot({ path: "test-results/town-night.png" });
const later = await page.evaluate(() => { const a = window.__app; return { town: a.town.debug(), h: { u: a.app.stats.unemploymentRate, r: a.app.stats.robots } }; });
check("unemployed never commute to work", later.town.census.unemployedCommuting === 0, JSON.stringify(later));
check("robots exist later", later.h.r > 5);
// Click a figure out on the street.
await page.selectOption("#time-speed", "slow");
await page.evaluate(() => { const t = window.__app.town; t.setDayTime(0.42); t.setCamera(52, 42, 70, 0, 12); });
await page.waitForTimeout(3000);
const target = await page.evaluate(() => {
  const { town, app } = window.__app;
  for (const p of app.economy.persons) {
    const s = town.screenOf(p.id);
    if (p.status === 1 && (s.state === 4 || s.state === 5) && s.x > 320 && s.x < 1500 && s.y > 150 && s.y < 850) return p.id;
  }
  return -1;
});
const spot = await page.evaluate((id) => window.__app.town.screenOf(id), target);
await page.mouse.click(spot.x, spot.y);
await page.waitForTimeout(600);
const card = await page.evaluate(() => { const c = document.querySelector(".inspector"); return c && !c.hidden ? c.textContent : ""; });
check("clicking a figure opens a person card", /Income|Savings|home|House/i.test(card), card.slice(0, 80));
await page.screenshot({ path: "test-results/town-card.png" });
check("no console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
if (fails.length) process.exit(1);
