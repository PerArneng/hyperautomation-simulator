// Bundles the app into one self-contained dist/index.html that opens from disk and works offline.
// Usage: node build.mjs            build once
//        node build.mjs --serve    rebuild on change and serve on http://localhost:5173
import { build } from "esbuild";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, watch, writeFileSync } from "node:fs";

async function bundle() {
  const started = Date.now();
  const result = await build({
    entryPoints: ["src/main.ts"],
    bundle: true,
    write: false,
    format: "iife",
    minify: true,
    target: "es2022",
    logLevel: "warning",
    legalComments: "none",
  });
  const js = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
  const css = readFileSync("src/styles.css", "utf8");
  const page = readFileSync("src/index.html", "utf8")
    .replace("/*__CSS__*/", () => css)
    .replace("/*__JS__*/", () => js);
  mkdirSync("dist", { recursive: true });
  writeFileSync("dist/index.html", page);
  console.log(`built dist/index.html size_kb=${(page.length / 1024).toFixed(0)} elapsed_ms=${Date.now() - started}`);
}

await bundle();
if (process.argv.includes("--serve")) {
  let timer;
  watch("src", { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => bundle().catch((e) => console.error(e.message)), 80);
  });
  createServer((_req, res) => {
    res.setHeader("content-type", "text/html");
    res.end(readFileSync("dist/index.html"));
  }).listen(5173, () => console.log("serving http://localhost:5173"));
}
