---
id: 006
name: town-3d
description: Animated 3D town with commuting people, blue boxes flowing to stores and homes, robots, day cycle and inspection
---

# 006 town-3d

## Goal
The impressive part: a miniature 3D town where the economy is visible at a glance.

## Background
R9, R10, R14, R17. One figure per person, green employed, red unemployed. Knowledge workers and manual workers are distinct. Boxes for goods and services.

## Approach
Three.js with instancing. Road grid and routing with rounded corners; figures with walking legs; hard hats for manual workers. Offices, factories, stores, homes, town hall, bank. Boxes arc from firms to stores, pile up when unsold, carried home by shoppers. Robots appear at factories and AI glow on offices. Payday coins and tax sparks. Dawn to night lighting at slow speeds, steady dusk at high speeds so there is no strobing. Bloom, shadows, orbit camera, hover labels, click for details, follow a person. Visual rate is capped so motion stays smooth at any speed.

## Verification
Browser test screenshots at start and after unemployment rises, frame time recorded under software rendering, clicking a figure opens a person card, unemployed stop commuting (checked through a debug hook).

## Out of scope
Pathfinding around traffic, realistic crowds.

## Result
Built `src/town/` with Three.js instancing: 800 walking figures with legs and hard hats for manual workers, homes that show arrears and foreclosure, company towers and factories that grow and shrink with staff, windows that shift to violet as AI spreads, robots that appear at companies, shops with unsold stock piles, a job centre with a queue, a port, money arcs on payday (wages, taxes, support), pulses for hires, layoffs and bankruptcies, day-night cycle, bloom and shadows, hover labels, click cards and follow mode.
Decision: figures live through one typical 45-second day whatever the calendar speed. A literal 1 s day would make people teleport and the lighting strobe, which is a photosensitivity risk. The slowest speed locks calendar and visual day together.
Verified: `tests/e2e/town.mjs` passes, screenshots reviewed by day and night. Software rendering in headless Chrome is about 4 fps, so real frame rate is measured in spec 012. Effects fall back automatically below 26 fps.
