import { mkdirSync } from "node:fs";
import { openApp } from "./browser.mjs";

mkdirSync("test-results", { recursive: true });
const fails = [];
const check = (name, ok, info = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name} ${info}`); if (!ok) fails.push(name); };
const { browser, page, errors } = await openApp({ query: "?tab=dashboard&speed=month" });
await page.evaluate(() => { const a = window.__app.app; for (let i = 0; i < 365 * 14; i++) a.stepDay(); });
await page.waitForTimeout(2500);
await page.screenshot({ path: "test-results/dashboard-1.png" });

const ids = await page.$$eval(".dashboard .chart", (cs) => cs.map((c) => c.dataset.chart));
check("charts present", ids.length >= 25, `n=${ids.length}`);
let helpOk = 0;
let dataOk = 0;
for (const id of ids) {
  const card = page.locator(`.dashboard .chart[data-chart="${id}"]`);
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const marks = await card.locator(".marks path").count();
  if (marks > 0) dataOk++; else console.log("no data:", id);
  await card.locator(".help-dot").click();
  const text = await card.locator(".chart-help").innerText();
  if (/What it shows/.test(text) && /How to read it/.test(text) && /Why it matters/.test(text)) helpOk++; else console.log("no help:", id);
  await card.locator(".help-dot").click();
}
check("every chart has data", dataOk === ids.length, `${dataOk}/${ids.length}`);
check("every chart has help that opens", helpOk === ids.length, `${helpOk}/${ids.length}`);

// Shared time cursor: hovering one chart moves the cursor on others in view.
await page.evaluate(() => document.querySelector(".dashboard").scrollTo(0, 0));
await page.waitForTimeout(300);
const box = await page.locator('.chart[data-chart="unemployment"] .chart-plot').boundingBox();
await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2);
await page.waitForTimeout(200);
const cursors = await page.$$eval(".dashboard .chart .cursor", (cs) => cs.filter((c) => c.style.display !== "none").length);
check("time cursor is shared", cursors === ids.length, `visible=${cursors}`);
await page.screenshot({ path: "test-results/dashboard-hover.png" });
const help = page.locator('.chart[data-chart="made-sold"]');
await help.scrollIntoViewIfNeeded();
await help.locator(".help-dot").click();
await help.locator(".chart-help .ghost-btn").click();
const rows = await help.locator(".chart-table tbody tr").count();
check("data table available", rows > 5, `rows=${rows}`);
await page.screenshot({ path: "test-results/dashboard-help.png" });
await page.evaluate(() => document.querySelector(".dashboard").scrollTo(0, 1250));
await page.waitForTimeout(500);
await page.screenshot({ path: "test-results/dashboard-2.png" });
check("no console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
if (fails.length) process.exit(1);
