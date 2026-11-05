import { mkdirSync } from "node:fs";
import { openApp } from "./browser.mjs";

mkdirSync("test-results", { recursive: true });
const fails = [];
const check = (name, ok, info = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name} ${info}`); if (!ok) fails.push(name); };

// First visit shows the welcome and stays paused.
const { browser, page, errors } = await openApp();
await page.waitForTimeout(1200);
check("welcome shows on first visit", await page.locator(".intro-card").isVisible());
const d0 = await page.evaluate(() => window.__app.app.economy.day);
await page.waitForTimeout(600);
check("paused behind the welcome", (await page.evaluate(() => window.__app.app.economy.day)) === d0);
await page.screenshot({ path: "test-results/intro.png" });
await page.click("[data-go]");
await page.waitForTimeout(800);
const steps = await page.evaluate(() => window.__app.story.stepCount);
for (let i = 0; i < steps; i++) {
  await page.waitForTimeout(1400);
  const current = await page.evaluate(() => window.__app.story.currentStep);
  check(`story step ${i + 1} shows`, current === i && (await page.locator(".story").isVisible()));
  await page.screenshot({ path: `test-results/story-${i + 1}.png` });
  await page.click("[data-next]");
}
await page.waitForTimeout(500);
// Regression: going back restores that step's world, and the pause icon tells the truth.
await page.evaluate(() => window.__app.story.go(3));
await page.waitForTimeout(300);
await page.evaluate(() => window.__app.story.go(2));
await page.waitForTimeout(300);
const back = await page.evaluate(() => ({ s: window.__app.app.scenario.id, paused: window.__app.app.paused, icon: document.querySelector(".icon-btn.play").classList.contains("is-paused") }));
check("story Back restores the step's scenario", back.s === "none", JSON.stringify(back));
check("pause icon matches state", back.paused === back.icon);
await page.evaluate(() => window.__app.story.close());
check("story ends in the sandbox", !(await page.locator(".story").isVisible()));

// News updates during a run.
await page.selectOption("#time-speed", "month");
await page.evaluate(() => { const a = window.__app.app; for (let i = 0; i < 365 * 12; i++) a.stepDay(); });
await page.waitForTimeout(9000);
const line = await page.locator(".news-line").innerText();
check("news feed updates", line.length > 5 && !/Welcome/.test(line), line.replace(/\s+/g, " ").slice(0, 80));
await page.click(".news-line");
await page.waitForTimeout(300);
const rows = await page.locator(".news-row").count();
check("news history opens", rows > 5, `rows=${rows}`);
await page.screenshot({ path: "test-results/news.png" });
check("no console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close();
if (fails.length) process.exit(1);
