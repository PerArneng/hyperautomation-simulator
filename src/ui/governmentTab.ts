import * as d3 from "d3";
import { sankey, sankeyLinkHorizontal } from "d3-sankey";
import type { App } from "../app.ts";
import { BOOK_NAMES, FLOW_CATEGORIES } from "../sim/types.ts";
import type { FlowCategory } from "../sim/types.ts";
import { Chart, ChartHub, SERIES } from "./chart.ts";
import type { ChartDef } from "./chart.ts";
import { money } from "./dashboard.ts";
import { el, kr, pct } from "./format.ts";
import type { Tab } from "./shell.ts";

const pct1 = (v: number) => `${(v * 100).toFixed(Math.abs(v) < 0.1 ? 1 : 0).replace("-", "−")}%`;

const CHARTS: ChartDef[] = [
  {
    id: "gov-income", title: "Where tax income comes from, per month", stacked: true, format: money,
    series: [
      { label: "Income tax", color: SERIES.blue, get: (h) => h.taxIncome },
      { label: "Payroll tax", color: SERIES.orange, get: (h) => h.taxPayroll },
      { label: "VAT", color: SERIES.aqua, get: (h) => h.taxVat },
      { label: "Corporate tax", color: SERIES.yellow, get: (h) => h.taxCorporate },
      { label: "Automation tax", color: SERIES.magenta, get: (h) => h.taxAutomation },
    ],
    help: {
      what: "Government income by tax. Income and payroll tax are paid on wages, VAT on purchases, corporate tax on profit, and automation tax on wage costs saved by automation.",
      read: "Most of the state's money rests on wages and spending. Watch the shares when jobs move to machines: profit taxes rarely make up the difference at today's rates.",
      why: "A tax system built around work loses its base when work disappears. Automation tax is paid straight back to citizens, so it does not fund other spending.",
    },
  },
  {
    id: "gov-spending", title: "What the state spends, per month", stacked: true, format: money,
    series: [
      { label: "Public wages", color: SERIES.blue, get: (h) => h.spendPublicWages },
      { label: "Pensions", color: SERIES.orange, get: (h) => h.spendPensions },
      { label: "Purchases", color: SERIES.aqua, get: (h) => h.spendPurchases },
      { label: "Unemployment insurance", color: SERIES.yellow, get: (h) => h.spendInsurance },
      { label: "Social assistance", color: SERIES.magenta, get: (h) => h.spendAssistance },
      { label: "Citizen dividend", color: SERIES.green, get: (h) => h.spendDividend },
      { label: "Debt interest", color: SERIES.violet, get: (h) => h.spendInterest },
    ],
    help: {
      what: "All public spending: staff in health, schools and administration, pensions, purchases from companies (including software and robot upkeep), support for the unemployed, any citizen dividend and interest on the debt.",
      read: "Support costs rise when unemployment does. Those are automatic stabilisers: money that flows without any new decision.",
      why: "Support keeps people spending, and so protects other people's jobs.",
    },
  },
  {
    id: "gov-balance", title: "State budget balance, share of GDP", ghost: true, format: pct1,
    series: [{ label: "Balance", color: SERIES.blue, get: (h) => h.budgetBalance / Math.max(1, h.gdpNominal), window: 12 }],
    help: {
      what: "Income minus spending as a share of GDP, averaged over 12 months. Above zero is a surplus, below is a deficit.",
      read: "Compare with the no-AI line to see what automation costs or gives the state.",
      why: "A deficit in a slump supports demand. Persistent ones add to debt and later interest bills.",
    },
  },
  {
    id: "gov-debt", title: "Public debt, share of GDP", ghost: true, format: pct1,
    series: [{ label: "Debt", color: SERIES.blue, get: (h) => h.debtToGdp }],
    help: {
      what: "Total state borrowing as a share of a year's GDP.",
      read: "The parliament rule slowly changes income tax to steer towards 35%, so sharp moves here feed into tax over the following years.",
      why: "Debt is what households and foreign lenders hold as savings on the other side, so it is not simply a burden. The flow matrix below shows the mirror image.",
    },
  },
  {
    id: "gov-rate", title: "Central bank policy rate", ghost: true, format: pct1,
    series: [{ label: "Policy rate", color: SERIES.blue, get: (h) => h.policyRate }],
    help: {
      what: "The central bank's rate, starting at 2.00% like the Riksbank's November 2026 decision. It follows a Taylor rule on inflation and unemployment.",
      read: "It cannot go below zero. Once it is there, monetary policy has run out of room and fiscal policy has to do the work.",
      why: "Around 80% of Swedish mortgages have variable rates, so rate cuts quickly help indebted households.",
    },
  },
  {
    id: "gov-support", title: "Support per person on it, per month", format: money,
    series: [{ label: "Average payment", color: SERIES.blue, get: (h) => h.supportPaid / Math.max(1, h.onInsurance + h.onAssistance), window: 6 }],
    help: {
      what: "Average monthly support, before tax, per person receiving it.",
      read: "Falls as more people run out of insurance and move to the lower social assistance level.",
      why: "Unemployed people get less income than they did at work, and it steps down over time: 80, then 70, then 65% of pay up to a ceiling, then a means-tested minimum.",
    },
  },
];

interface NodeDatum { name: string; kind: "book" | "flow" }
interface LinkDatum { source: number; target: number; value: number; color: string; label: string }

const GROUPS: { label: string; categories: FlowCategory[]; color: string }[] = [
  { label: "Wages", categories: ["Wages"], color: "#3ddc84" },
  { label: "Taxes", categories: ["Income tax", "Payroll tax", "VAT", "Corporate tax", "Automation tax"], color: "#ff9a4d" },
  { label: "Pensions", categories: ["Pensions"], color: "#aeb8d2" },
  { label: "Support and dividend", categories: ["Unemployment insurance", "Social assistance", "Citizen dividend"], color: "#38d6e0" },
  { label: "Goods and services", categories: ["Household purchases", "Government purchases"], color: "#3f9dff" },
  { label: "Rent and fees", categories: ["Rent & housing fees"], color: "#c9a26d" },
  { label: "Exports", categories: ["Exports"], color: "#6c7ee6" },
  { label: "Imports", categories: ["Imports"], color: "#d97b52" },
  { label: "AI software and robots", categories: ["AI software fees", "Robot sales", "Robot maintenance"], color: "#a78bfa" },
  { label: "Dividends", categories: ["Dividends"], color: "#f4b740" },
  { label: "Interest", categories: ["Deposit interest", "Loan interest", "Bond interest"], color: "#8c98b3" },
];

/** Taxes, spending, debt, and the proof that the money adds up. */
export class GovernmentTab implements Tab {
  readonly id = "government";
  readonly label = "Government";
  readonly el = el("div", "government scroll-page");
  readonly charts: Chart[] = [];
  private readonly app: App;
  private readonly hub = new ChartHub();
  private readonly sankeyHost = el("div", "sankey");
  private readonly matrixHost = el("div", "matrix");
  private readonly badge = el("div", "money-badge");
  private timer = 0;
  private flowTimer = 0;
  private force = false;
  private width = 900;

  constructor(app: App) {
    this.app = app;
    const grid = el("div", "chart-grid");
    for (const def of CHARTS) {
      const chart = new Chart(app, this.hub, def);
      this.charts.push(chart);
      grid.append(chart.el);
    }
    const flowHead = el("div", "dash-head", `<h2>Where the money goes</h2><p>All payments between the parts of the economy over the last 12 months, in kr. Borrowing and repayment are in the table below.</p>`);
    const accHead = el("div", "dash-head", `<h2>The books</h2><p>Every payment has a payer and a receiver, so every row sums to zero. This is the stock-flow-consistent check the research calls for.</p>`);
    const head = el("div", "dash-head", `<h2>State finances</h2><p>Taxes in, spending out, and what happens to the debt.</p>`);
    this.sankeyHost.setAttribute("role", "img");
    this.sankeyHost.setAttribute("aria-label", "Money flows between households, companies, government, bank and rest of world");
    const accBlock = el("div", "matrix-block");
    accBlock.append(this.badge, this.matrixHost);
    this.el.append(head, grid, flowHead, this.sankeyHost, accHead, accBlock);
    new ResizeObserver(() => { this.width = this.sankeyHost.clientWidth || 900; this.force = true; }).observe(this.sankeyHost);
    app.onReset(() => { this.charts.forEach((c) => c.reset()); this.force = true; });
  }

  setActive(active: boolean): void {
    if (active) {
      this.width = this.sankeyHost.clientWidth || 900;
      this.charts.forEach((c) => c.reset());
      this.force = true;
    }
  }

  frame(seconds: number): void {
    this.timer -= seconds;
    this.flowTimer -= seconds;
    if (this.timer <= 0 || this.force) {
      this.timer = 1 / 10;
      for (const c of this.charts) c.render(this.force);
    }
    if (this.flowTimer <= 0 || this.force) {
      this.flowTimer = 0.8;
      this.drawSankey();
      this.drawMatrix();
    }
    this.force = false;
  }

  /** Sum the last year of the flow matrix. */
  private yearly(): Float64Array {
    const total = new Float64Array(FLOW_CATEGORIES.length * 5);
    for (const m of this.app.economy.yearFlows) for (let i = 0; i < total.length; i++) total[i] += m[i];
    return total;
  }

  private drawSankey(): void {
    if (this.el.offsetParent === null) return;
    const flows = this.yearly();
    const nodes: NodeDatum[] = [];
    const links: LinkDatum[] = [];
    // Payers on the left, kinds of payment in the middle, receivers on the right.
    BOOK_NAMES.forEach((name) => nodes.push({ name, kind: "book" }));
    BOOK_NAMES.forEach((name) => nodes.push({ name, kind: "book" }));
    const receiverOffset = BOOK_NAMES.length;
    GROUPS.forEach((group) => {
      const index = nodes.length;
      const paid = new Float64Array(5);
      const got = new Float64Array(5);
      for (const c of group.categories) {
        const row = FLOW_CATEGORIES.indexOf(c);
        for (let b = 0; b < 5; b++) {
          const v = flows[row * 5 + b];
          if (v < 0) paid[b] -= v;
          else got[b] += v;
        }
      }
      if (d3.sum(paid) < 1) return;
      nodes.push({ name: group.label, kind: "flow" });
      for (let b = 0; b < 5; b++) {
        if (paid[b] > 1) links.push({ source: b, target: index, value: paid[b], color: group.color, label: `${BOOK_NAMES[b]} pay ${group.label.toLowerCase()}` });
        if (got[b] > 1) links.push({ source: index, target: receiverOffset + b, value: got[b], color: group.color, label: `${group.label} to ${BOOK_NAMES[b].toLowerCase()}` });
      }
    });
    const used = new Set<number>();
    for (const l of links) { used.add(l.source); used.add(l.target); }
    const remap = new Map<number, number>();
    const finalNodes: NodeDatum[] = [];
    nodes.forEach((n, i) => { if (used.has(i)) { remap.set(i, finalNodes.length); finalNodes.push(n); } });
    const finalLinks = links.map((l) => ({ ...l, source: remap.get(l.source)!, target: remap.get(l.target)! }));
    if (!finalLinks.length) return;

    const width = Math.max(640, this.width);
    const height = 430;
    const layout = sankey<NodeDatum, LinkDatum>().nodeWidth(11).nodePadding(9).nodeSort(null).extent([[120, 8], [width - 120, height - 8]]);
    const graph = layout({ nodes: finalNodes.map((n) => ({ ...n })), links: finalLinks.map((l) => ({ ...l })) });
    let svg = d3.select(this.sankeyHost).select<SVGSVGElement>("svg");
    if (svg.empty()) {
      svg = d3.select(this.sankeyHost).append("svg");
      svg.append("g").attr("class", "s-links");
      svg.append("g").attr("class", "s-pulses");
      svg.append("g").attr("class", "s-nodes");
    }
    svg.attr("width", width).attr("height", height);
    const path = sankeyLinkHorizontal();
    const linkKey = (d: (typeof graph.links)[number]) => d.label;
    svg.select(".s-links").selectAll<SVGPathElement, (typeof graph.links)[number]>("path").data(graph.links, linkKey).join("path")
      .attr("fill", "none").attr("stroke", (d) => d.color).attr("stroke-opacity", 0.32)
      .attr("stroke-width", (d) => Math.max(1, d.width ?? 1))
      .attr("d", (d) => path(d as never) ?? "")
      .each(function (d) {
        d3.select(this).selectAll("title").data([0]).join("title").text(`${d.label}: ${kr(d.value)} a year`);
      });
    // Moving highlights show direction of flow.
    svg.select(".s-pulses").selectAll<SVGPathElement, (typeof graph.links)[number]>("path").data(graph.links, linkKey).join("path")
      .attr("class", "pulse").attr("fill", "none").attr("stroke", (d) => d.color).attr("stroke-opacity", 0.42)
      .attr("stroke-width", (d) => Math.max(1, (d.width ?? 1) * 0.5))
      .attr("d", (d) => path(d as never) ?? "");

    const nodeSel = svg.select(".s-nodes").selectAll<SVGGElement, (typeof graph.nodes)[number]>("g").data(graph.nodes, (d) => `${d.name}-${(d.x0 ?? 0) < width / 2 ? "l" : "r"}`).join((enter) => {
      const g = enter.append("g");
      g.append("rect");
      g.append("text");
      return g;
    });
    nodeSel.select("rect").attr("x", (d) => d.x0 ?? 0).attr("y", (d) => d.y0 ?? 0).attr("width", (d) => (d.x1 ?? 0) - (d.x0 ?? 0)).attr("height", (d) => Math.max(1, (d.y1 ?? 0) - (d.y0 ?? 0))).attr("rx", 2).attr("fill", (d) => (d.kind === "book" ? "#d7deed" : "#7f8ba6"));
    nodeSel.select("text")
      .attr("x", (d) => {
        if (d.kind === "flow") return (d.x1 ?? 0) + 5;
        return (d.x0 ?? 0) < width / 2 ? (d.x0 ?? 0) - 7 : (d.x1 ?? 0) + 7;
      })
      .attr("y", (d) => ((d.y0 ?? 0) + (d.y1 ?? 0)) / 2).attr("dy", "0.33em")
      .attr("text-anchor", (d) => (d.kind === "book" && (d.x0 ?? 0) < width / 2 ? "end" : "start"))
      .attr("class", (d) => (d.kind === "book" ? "s-book" : "s-flow"))
      .text((d) => (d.kind === "flow" ? `${d.name}  ${money(d.value ?? 0)}` : d.name));
  }

  private drawMatrix(): void {
    if (this.el.offsetParent === null) return;
    const e = this.app.economy;
    const flows = e.lastFlows;
    const m = (v: number) => (Math.abs(v) < 500 ? `<td class="zero">·</td>` : `<td class="${v < 0 ? "neg" : ""}">${(v / 1e6).toFixed(2).replace("-", "−")}</td>`);
    const rows: string[] = [];
    const totals = new Float64Array(5);
    let worst = 0;
    FLOW_CATEGORIES.forEach((name, r) => {
      let sum = 0;
      let any = false;
      const cells: string[] = [];
      // Borrowing and repaying change who owes what, not what anyone earned or spent.
      const financing = name.startsWith("Loan") || name === "Bond issue";
      for (let b = 0; b < 5; b++) {
        const v = flows[r * 5 + b];
        sum += v;
        if (!financing) totals[b] += v;
        if (Math.abs(v) > 500) any = true;
        cells.push(m(v));
      }
      worst = Math.max(worst, Math.abs(sum));
      if (any) rows.push(`<tr><th scope="row">${name}</th>${cells.join("")}<td class="sum">${Math.abs(sum) < 1 ? "0" : (sum / 1e6).toFixed(2)}</td></tr>`);
    });
    const net = Array.from(totals).map((v) => `<td class="${v < 0 ? "neg" : ""}">${(v / 1e6).toFixed(2).replace("-", "−")}</td>`).join("");
    this.matrixHost.innerHTML = `<table><thead><tr><th scope="col">Last month, M kr</th>${BOOK_NAMES.map((b) => `<th scope="col">${b}</th>`).join("")}<th scope="col">Row sum</th></tr></thead><tbody>${rows.join("")}</tbody><tfoot><tr><th scope="row">Earned minus spent, before borrowing</th>${net}<td></td></tr></tfoot></table>`;
    const h = this.app.stats;
    const moneyError = Math.abs(h?.moneyError ?? 0);
    const ok = moneyError < 1 && worst < 1;
    this.badge.dataset.ok = String(ok);
    this.badge.innerHTML = ok
      ? `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M3 8.5l3.2 3L13 4.5"/></svg><div><b>The money adds up</b><span>Deposits match loans plus bonds, to within ${kr(moneyError)}. All rows sum to zero.</span></div>`
      : `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M8 1l7 13H1zM7.2 6v4h1.6V6zm0 5v1.6h1.6V11z"/></svg><div><b>Accounting mismatch</b><span>Error of ${kr(moneyError)}, worst row ${kr(worst)}. Please report this.</span></div>`;
    void pct;
  }

  /** Test hook: row sums of the last month. */
  debugRowSums(): number[] {
    const flows = this.app.economy.lastFlows;
    return FLOW_CATEGORIES.map((_n, r) => { let s = 0; for (let b = 0; b < 5; b++) s += flows[r * 5 + b]; return s; });
  }
}
