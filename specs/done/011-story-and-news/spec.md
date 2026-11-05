---
id: 011
name: story-and-news
description: Live news feed of economic events, first-run onboarding and a guided story through the causal chain
---

# 011 story-and-news

## Goal
Make it instantly understandable: what is happening, and why.

## Background
R3, R17. Research: explorable explanation with a story mode before the sandbox.

## Approach
News ticker fed by engine events, short legend and first-run hints, guided story that sets scenario, speed and tab step by step.

## Verification
Browser test: the feed updates and the story moves through every step without errors.

## Out of scope
Voice-over.

## Result
Built `src/ui/news.ts` (headlines from company events and milestones, with history) and `src/ui/story.ts` (first-visit welcome and an 11-step guided story that sets scenario, speed and tab and fast-forwards the run). `tests/e2e/story.mjs` passes: all steps show, Back restores that step's world, news updates and no console errors.
