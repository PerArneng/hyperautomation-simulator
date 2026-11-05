---
id: 010
name: government-tab
description: Government income and spending, debt, support recipients, animated money-flow Sankey and accounting check
---

# 010 government-tab

## Goal
Show where taxes come from and where the money goes, and prove the money adds up.

## Background
R13, R14. Research: Sankey of flows with visible leakages; SFC badge with expandable flow matrix.

## Approach
Sankey (d3-sankey) over the last 12 months, income and spending stacks, budget balance and debt, support-recipient breakdown, policy rate, transaction-flow matrix with rows summing to zero.

## Verification
Browser test: Sankey renders, matrix columns and rows sum to zero, tax totals agree with the engine.

## Out of scope
Detailed tax code.

## Result
Built `src/ui/governmentTab.ts`: tax income and spending stacks, budget balance, debt, policy rate, support per person, an animated three-column money-flow Sankey over the last 12 months, and the full transaction-flow matrix with row sums and a live "the money adds up" check. Verified: all rows sum to zero, Sankey renders, chart values agree with the engine.
Review of the Sankey exposed two engine flaws, both fixed: exports grew unrealistically large (now lower price elasticity, export market growth limited) and state purchases were fixed in quantity, so their money value collapsed under deflation (now budget-based, following pay).
