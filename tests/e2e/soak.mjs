// Long run at top speed through every tab, every scenario, and several screen sizes.
import { mkdirSync } from "node:fs";
import { openApp } from "./browser.mjs";

mkdirSync("test-results", { recursive: true });
const fails = [];
const check = (name, ok, info = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name} ${info}`); if (!ok) fails.push(name); };
const { browser, page, errors, external } = await openApp({ query: "?speed=year&quality=0" });
for (const id of ["none", "measured", "strong", "hyper", "hyper-policy", "hyper-open"]) {
  await page.click(`.scenario[data-id="${id}"]`);
  for (const tab of ["town", "dashboard", "people", "companies", "government"]) {
    await page.click(`.tab[data-tab="${tab}"]`);
    await page.evaluate(() => { const a = window.__app.app; for (let i = 0; i < 365 * 12; i++) a.stepDay(); });
    await page.waitForTimeout(350);
  }
  const s = await page.evaluate(() => {
    const a = window.__app.app;
    const bad = [];
    for (const [k, v] of Object.entries(a.stats)) if (typeof v === "number" && !Number.isFinite(v)) bad.push(k);
    return { years: (a.economy.day / 365).toFixed(0), u: a.stats.unemploymentRate, err: a.stats.moneyError, bad, firms: a.economy.firms.length };
  });
  check(`scenario ${id}: 60 years, all numbers finite, money balances`, s.bad.length === 0 && Math.abs(s.err) < 100, JSON.stringify(s));
}
// Extreme sliders, including moving them mid-run.
await page.evaluate(() => {
  const a = window.__app.app;
  a.setControl("aiLevel", 0.9375); a.setControl("robotLevel", 0.95); a.setControl("demandResponse", 0); a.setControl("newJobs", 0); a.setControl("support", 0.5);
  for (let i = 0; i < 365 * 30; i++) a.stepDay();
  a.setControl("automationTax", 0.6); a.setControl("citizenDividend", 15000); a.setControl("demandResponse", 1); a.setControl("newJobs", 1);
  for (let i = 0; i < 365 * 15; i++) a.stepDay();
});
await page.waitForTimeout(500);
const ext = await page.evaluate(() => { const h = window.__app.app.stats; return { u: h.unemploymentRate, infl: h.inflation, err: h.moneyError, ok: Object.values(h).every((v) => typeof v !== "number" || Number.isFinite(v)) }; });
check("extreme sliders stay finite and balanced", ext.ok && Math.abs(ext.err) < 100, JSON.stringify(ext));
check("no console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
check("no network requests", external.length === 0);

for (const [w, h] of [[1280, 720], [1920, 1080], [1024, 768]]) {
  await page.setViewportSize({ width: w, height: h });
  for (const tab of ["town", "dashboard", "companies"]) {
    await page.click(`.tab[data-tab="${tab}"]`);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `test-results/size-${w}-${tab}.png` });
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.body.scrollHeight > innerHeight);
  check(`no page overflow at ${w}x${h}`, !overflow);
}
await browser.close();
if (fails.length) process.exit(1);
