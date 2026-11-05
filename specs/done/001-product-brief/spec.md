---
id: 001
name: product-brief
description: "Record the user's overnight brief for the hyperautomation simulator and break it into buildable specs"
---

# 001 product-brief

## Goal
Capture the user's request in one place, turn it into a checkable requirement list, and split it into specs that can be built one by one overnight with no user input.

## Background
The user's words, 2026-11-04, before going to bed (kept verbatim because it is the source of truth):

> ok so i need to go to bed and sleep, its important that you work with this overnight, if its finished earlier its ok ofcourse but you need to do it without my input . look in to ./research ... then you will build the optimal easy to use animated good looking macroeconomic simulation of a fictive country with enough things going on to be able to simulate what happens if you introduce hyperautomation to increase task level efficinency .. but it has to be high level enough not to swamp the user with parameters .. there will also be a time speed parameter to make time go faster ex every day is a second etc.. you figure it out . it should be a web page, ex with d3js  .. .. there might be tabs, ex one for viewing individuals in realtime and one with a overview dashboard with totals and time graphs to see the state of the macro economy .. the title should be "Effects of AI Hyperautomation on Macro Economy" in small text somewhere where it makse sense. smooth animations and cool effects. objects should move in a smooth motion ex things produced .. this is for knowledge work so simulate that half the population is knowlege worker.. also simulate that you can deploy robots for non knowledge workers .. but those are two different concepts ..  AI enabled software for knowledge workers and robots for non knowledge workers, show graphs for unemployment etc .. perhaps people wil be represented by small 3d figures and they go home and back and forth to work. If they are employed they are green and unemployed red etc.. and they stop going to work. prehaps things produced will be represented by blu boxes .. and they end up in stores and people buy the blue boxes and bring them home.. this can be representative of both goods and services .. and when they are unemployed they buy alot less. perhaps every individual have some money saved etc .. so show that in the dashboard as well how much money people have saved.. how much total income companies get.. average profit margin per worker etc .. dont take to much words from me only inspirartion.. look at the ./research ..  but it should look professional and impressive and informative.. and realistic .. it should be possible to get help for each graph in the dashboard .. also perhaps a leaderboard for companies in one tab and what business they are in ..  so its people, companies, goodds and services .. yes also taxes and goverment ,, and government income etc .. that needs to be shown as well ..  .. as people get unemployed they get less income .. also show how people get some kind of financial support as unemployed .. there should also be people getting jobs etc in the beginning .. but as stask efficency increases jobs might not grow on trees anymore .. some people might retire every year, eome come in to the workforce .. etc  save this to spec 001 .. and then just get started creating the specs you need and build the specs one by one but i wont have to be here because im going to sleep . good night and good luck

### Requirements (checked in the final acceptance spec)
- R1 Web page, D3 for charts; opens easily.
- R2 Title "Effects of AI Hyperautomation on Macro Economy" in small text.
- R3 Fictive country; high level; few parameters; easy to use.
- R4 Time speed control (for example one day per second).
- R5 Half the workforce are knowledge workers.
- R6 Two separate automation concepts: AI software for knowledge workers, robots for non-knowledge workers.
- R7 Task-level efficiency is what hyperautomation raises.
- R8 Tabs: individuals in real time; macro dashboard with totals and time graphs; company leaderboard with business type.
- R9 Small 3D people commute between home and work; employed green, unemployed red; unemployed stop commuting.
- R10 Blue boxes (goods and services) move smoothly from producers to stores; people buy them and carry them home; unemployed buy far less.
- R11 Individual savings; dashboard shows savings, company income, profit margin per worker, unemployment.
- R12 Help available on every dashboard graph.
- R13 Taxes, government income and spending shown.
- R14 Unemployed have lower income and visibly receive financial support.
- R15 People get jobs early on; jobs get scarcer as efficiency rises.
- R16 Retirement each year and new workforce entrants.
- R17 Professional, impressive, informative, realistic; smooth animations and cool effects.
- R18 Grounded in ./research.

## Approach
Specs, built in id order:

| Spec | Scope |
|---|---|
| 002 project-scaffold | TypeScript, esbuild, single-file build that opens from disk, tests, browser smoke test |
| 003 economic-engine | Agents, stock-flow-consistent ledger, labour market, firms, government, bank, automation |
| 004 calibration | Stable baseline and plausible scenario outcomes, checked in headless runs |
| 005 app-shell | Top bar, tabs, time speed, scenarios, controls, sim loop, no-AI ghost run |
| 006 town-3d | Animated 3D town: people, homes, firms, stores, boxes, robots, effects, inspection |
| 007 dashboard | D3 time graphs with help on each graph |
| 008 people-tab | Individuals view, savings distribution, personal biography |
| 009 companies-tab | Animated leaderboard by business and company detail |
| 010 government-tab | Budget, taxes, debt, support, money-flow Sankey, accounting check |
| 011 story-and-news | News feed, onboarding, guided story |
| 012 acceptance-polish | Performance, visual polish, check R1 to R18 in a real browser |

Key decisions, made without the user because they are asleep:
- Fictive country **Novaria**, currency kr, calibrated from the Swedish figures in research.
- Agent-based, stock-flow-consistent core with task-based production (the hybrid both architecture reports recommend).
- Three.js for the 3D town and D3 for charts, bundled into one HTML file that works by double-click, offline.

## Verification
This spec is complete when the brief is recorded verbatim and specs 002 to 012 exist with every section filled in. `spec-manager.py check` passes. Requirements are verified in spec 012.

## Out of scope
Building anything; that happens in the later specs. Committing, since the user did not ask for commits.

## Result
Brief recorded verbatim with requirements R1 to R18, and specs 002 to 012 created. R1 to R18 are checked in spec 012.
