---
id: 002
name: project-scaffold
description: TypeScript and esbuild project that builds one offline HTML file, with unit and real-browser tests
---

# 002 project-scaffold

## Goal
A project that builds to one self-contained `dist/index.html` that opens by double-click and works offline, with fast unit tests and a real-browser smoke test.

## Background
Spec 001 R1. ES modules and workers from CDN or disk are unreliable on `file://`, so the output bundles everything into a classic inline script.

## Approach
- `package.json`: three, d3; dev: esbuild, typescript, playwright-core, @types.
- `build.mjs`: bundles `src/main.ts` and CSS, inlines into `src/index.html` -> `dist/index.html`. `--watch` serves locally.
- Tests: `node --test` for sim (Node strips TS types). `tests/e2e/*.mjs` drives installed Chrome through playwright-core.
- Shell placeholder page to prove the pipeline, including WebGL in headless Chrome.

## Verification
`npm run build` makes one file with no external requests. `npm test` passes. The browser test opens `file://.../dist/index.html`, reports no console errors and writes a screenshot.

## Out of scope
Deployment, CI.

## Result
Built `build.mjs` (one inline `dist/index.html`, or `--serve` for development), strict TypeScript, `node --test` for the engine, and a playwright-core harness driving installed Chrome with software WebGL. Verified: build, `tsc`, unit test and browser test all pass with no console errors and no external requests. Kept.
