import { mkdirSync } from "node:fs";
import { openApp } from "./browser.mjs";

mkdirSync("test-results", { recursive: true });
const { browser, page, errors, external } = await openApp();
await page.waitForTimeout(800);
await page.screenshot({ path: "test-results/smoke.png" });
const ok = await page.evaluate(() => !!document.querySelector("canvas"));
await browser.close();
console.log(JSON.stringify({ ok, errors, external }));
if (!ok || errors.length || external.length) process.exit(1);
