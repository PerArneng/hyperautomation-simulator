import * as d3 from "d3";
import type { App } from "../app.ts";
import { SECTORS } from "../sim/params.ts";
import type { Firm } from "../sim/types.ts";
import { SECTOR_COLORS } from "./colors.ts";
import { money } from "./dashboard.ts";
import { dateLong, el, escapeHtml, kr, num, pct } from "./format.ts";
import type { Tab } from "./shell.ts";

type SortKey = "revenue" | "profit" | "margin" | "perWorker" | "jobs" | "ai" | "robots";

const COLUMNS: { key: SortKey; label: string; title: string }[] = [
  { key: "jobs", label: "Jobs", title: "People employed now, with the trend over time" },
  { key: "revenue", label: "Income /mo", title: "Sales last month" },
  { key: "profit", label: "Profit /mo", title: "Income minus all costs last month, before tax" },
  { key: "margin", label: "Margin", title: "Profit as a share of income" },
  { key: "perWorker", label: "Profit per worker", title: "Monthly profit divided by staff" },
  { key: "ai", label: "AI staff", title: "Share of knowledge staff with AI software" },
  { key: "robots", label: "Robots", title: "Robots installed" },
];

function value(f: Firm, key: SortKey): number {
  switch (key) {
    case "revenue": return f.lastRevenue;
    case "profit": return f.lastProfit;
    case "margin": return f.lastRevenue > 0 ? f.lastProfit / f.lastRevenue : -9;
    case "perWorker": return f.employees.length ? f.lastProfit / f.employees.length : -1e9;
    case "jobs": return f.employees.length;
    case "ai": return f.aiAdoption;
    case "robots": return f.robots;
  }
}

/** How close a company is to running out of money: 0 calm, 1 critical. */
export function riskOf(f: Firm): { level: number; label: string } {
  if (!f.alive) return { level: 1, label: "Closed" };
  if (f.isPublic) return { level: 0, label: "State funded" };
  const monthlyCost = Math.max(1, f.lastRevenue - f.lastProfit);
  const months = (f.cash - f.loan * 0.1) / monthlyCost;
  const level = Math.max(0, Math.min(1, 1 - months / 2));
  return { level, label: level > 0.75 ? "High" : level > 0.4 ? "Watch" : "Low" };
}

/** A leaderboard that visibly reorders as companies rise and fall. */
export class CompaniesTab implements Tab {
  readonly id = "companies";
  readonly label = "Companies";
  readonly el = el("div", "companies");
  private readonly app: App;
  private readonly rowsEl = el("div", "lb-rows");
  private readonly detail = el("aside", "lb-detail");
  private readonly rows = new Map<number, HTMLElement>();
  private readonly summary = el("div", "lb-summary");
  private sort: SortKey = "revenue";
  private sector = "all";
  private showPublic = true;
  private timer = 0;
  private selected = -1;
  private headerCells = new Map<SortKey, HTMLElement>();
  private lastMonths = -1;

  constructor(app: App) {
    this.app = app;
    const tools = el("div", "lb-tools");
    const select = el("select", "speed-select");
    select.setAttribute("aria-label", "Filter by business");
    select.id = "lb-sector";
    select.innerHTML = `<option value="all">All businesses</option>${SECTORS.map((s) => `<option value="${s.key}">${s.name}</option>`).join("")}`;
    select.addEventListener("change", () => { this.sector = select.value; this.update(true); });
    const pub = el("label", "toggle", `<input type="checkbox" checked> Public employers`);
    pub.querySelector("input")!.addEventListener("change", (e) => { this.showPublic = (e.target as HTMLInputElement).checked; this.update(true); });
    tools.append(select, pub, this.summary);

    const header = el("div", "lb-row lb-header");
    header.innerHTML = `<div class="lb-rank">#</div><div class="lb-name">Company and business</div>`;
    for (const c of COLUMNS) {
      const cell = el("button", `lb-cell lb-sort`, c.label);
      cell.title = c.title;
      cell.dataset.sort = c.key;
      cell.addEventListener("click", () => { this.sort = c.key; this.update(true); });
      header.append(cell);
      this.headerCells.set(c.key, cell);
    }
    header.append(el("div", "lb-cell lb-risk", "Money risk"));
    const table = el("div", "lb-table");
    table.append(header, this.rowsEl);
    const left = el("div", "lb-main");
    left.append(tools, table);
    this.detail.hidden = true;
    this.el.append(left, this.detail);
    app.onReset(() => { this.rowsEl.innerHTML = ""; this.rows.clear(); this.selected = -1; this.detail.hidden = true; this.lastMonths = -1; });
  }

  setActive(active: boolean): void {
    if (active) this.update(true);
  }

  frame(seconds: number): void {
    this.timer -= seconds;
    if (this.timer > 0) return;
    this.timer = 0.45;
    this.update(false);
    if (this.selected >= 0) this.renderDetail();
  }

  private update(force: boolean): void {
    const e = this.app.economy;
    const months = e.history.length;
    if (!force && months === this.lastMonths) return;
    this.lastMonths = months;
    for (const [key, cell] of this.headerCells) cell.classList.toggle("active", key === this.sort);

    const firms = e.firms
      .filter((f) => (this.sector === "all" || SECTORS[f.sector].key === this.sector) && (this.showPublic || !f.isPublic))
      .sort((a, b) => Number(b.alive) - Number(a.alive) || value(b, this.sort) - value(a, this.sort));

    const alive = e.firms.filter((f) => f.alive && !f.isPublic);
    const closed = e.firms.filter((f) => !f.alive).length;
    const topShare = alive.length ? alive.reduce((m, f) => Math.max(m, f.lastRevenue), 0) / Math.max(1, alive.reduce((s, f) => s + f.lastRevenue, 0)) : 0;
    this.summary.textContent = `${alive.length} private companies. ${closed} closed so far. Largest takes ${pct(topShare, 0)} of all income.`;

    // First, record where rows are; then move; then animate from old to new (FLIP).
    const before = new Map<number, number>();
    for (const [id, row] of this.rows) before.set(id, row.offsetTop);
    const seen = new Set<number>();
    const maxJobs = Math.max(1, ...e.firms.map((f) => f.employees.length));
    firms.forEach((f, rank) => {
      seen.add(f.id);
      let row = this.rows.get(f.id);
      if (!row) {
        row = this.createRow(f);
        this.rows.set(f.id, row);
      }
      this.fillRow(row, f, rank, maxJobs);
      this.rowsEl.append(row);
    });
    for (const [id, row] of this.rows) {
      if (!seen.has(id)) { row.remove(); this.rows.delete(id); }
    }
    for (const f of firms) {
      const row = this.rows.get(f.id)!;
      const was = before.get(f.id);
      if (was === undefined) continue;
      const dy = was - row.offsetTop;
      if (Math.abs(dy) < 1) continue;
      row.style.transition = "none";
      row.style.transform = `translateY(${dy}px)`;
      requestAnimationFrame(() => {
        row.style.transition = "transform 0.55s cubic-bezier(0.22, 0.9, 0.3, 1)";
        row.style.transform = "";
      });
    }
  }

  private createRow(f: Firm): HTMLElement {
    const row = el("button", "lb-row");
    row.dataset.firm = String(f.id);
    row.addEventListener("click", () => this.open(f.id));
    const s = SECTORS[f.sector];
    row.innerHTML = `<div class="lb-rank"></div><div class="lb-name"><i class="dot" style="background:${SECTOR_COLORS[s.key]}"></i><div class="lb-names"><b>${escapeHtml(f.name)}</b><span>${s.name}</span></div></div>
      <div class="lb-cell lb-jobs"><span class="v"></span><svg class="mini" width="58" height="18"><path fill="none" stroke-width="1.4"/></svg></div>
      <div class="lb-cell" data-c="revenue"></div><div class="lb-cell" data-c="profit"></div><div class="lb-cell" data-c="margin"></div><div class="lb-cell" data-c="perWorker"></div>
      <div class="lb-cell lb-bar" data-c="ai"><i></i><span></span></div><div class="lb-cell" data-c="robots"></div><div class="lb-cell lb-risk"><span class="risk"></span></div>`;
    return row;
  }

  private fillRow(row: HTMLElement, f: Firm, rank: number, _maxJobs: number): void {
    row.classList.toggle("closed", !f.alive);
    row.classList.toggle("selected", f.id === this.selected);
    const set = (c: string, t: string, negative = false) => {
      const cell = row.querySelector<HTMLElement>(`[data-c="${c}"]`)!;
      cell.textContent = t;
      cell.classList.toggle("neg", negative);
    };
    row.querySelector(".lb-rank")!.textContent = f.alive ? String(rank + 1) : "–";
    row.querySelector(".lb-jobs .v")!.textContent = num(f.employees.length);
    const public_ = f.isPublic;
    if (f.alive && !public_) {
      set("revenue", money(f.lastRevenue));
      set("profit", money(f.lastProfit), f.lastProfit < 0);
      set("margin", f.lastRevenue > 0 ? pct(f.lastProfit / f.lastRevenue, 0) : "–", f.lastProfit < 0);
      set("perWorker", f.employees.length ? money(f.lastProfit / f.employees.length) : "–", f.lastProfit < 0);
    } else {
      for (const c of ["revenue", "profit", "margin", "perWorker"]) set(c, public_ ? "State" : "–");
    }
    const aiCell = row.querySelector<HTMLElement>('[data-c="ai"]')!;
    aiCell.querySelector("i")!.style.width = `${f.aiAdoption * 100}%`;
    aiCell.querySelector("span")!.textContent = pct(f.aiAdoption, 0);
    set("robots", num(f.robots));
    const risk = riskOf(f);
    const riskEl = row.querySelector<HTMLElement>(".risk")!;
    riskEl.textContent = f.alive ? risk.label : `Closed ${new Date(this.app.economy.date - (this.app.economy.day - f.closedDay) * 86400000).getUTCFullYear()}`;
    riskEl.dataset.level = !f.alive ? "closed" : risk.level > 0.75 ? "high" : risk.level > 0.4 ? "watch" : "low";

    const hist = f.history;
    if (hist.length > 1) {
      const x = d3.scaleLinear().domain([0, hist.length - 1]).range([1, 57]);
      const y = d3.scaleLinear().domain([0, d3.max(hist, (h) => h.jobs) ?? 1]).range([17, 1]);
      const path = row.querySelector<SVGPathElement>(".mini path")!;
      path.setAttribute("d", d3.line<(typeof hist)[number]>().x((_h, i) => x(i)).y((h) => y(h.jobs))(hist.filter((_h, i) => i % Math.ceil(hist.length / 40) === 0 || i === hist.length - 1)) ?? "");
      path.setAttribute("stroke", SECTOR_COLORS[SECTORS[f.sector].key]);
    }
  }

  open(id: number): void {
    this.selected = id;
    this.detail.hidden = false;
    this.renderDetail();
    this.update(true);
  }

  private renderDetail(): void {
    const e = this.app.economy;
    const f = e.firms[this.selected];
    if (!f) return;
    const s = SECTORS[f.sector];
    const row = (k: string, v: string) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`;
    const spark = (title: string, get: (h: Firm["history"][number]) => number, fmt: (v: number) => string) => {
      const hist = f.history;
      if (hist.length < 2) return "";
      const w = 300;
      const h = 54;
      const values = hist.map(get);
      const x = d3.scaleLinear().domain([0, hist.length - 1]).range([2, w - 2]);
      const lo = Math.min(0, d3.min(values) ?? 0);
      const hi = Math.max(1, d3.max(values) ?? 1);
      const y = d3.scaleLinear().domain([lo, hi]).range([h - 2, 3]);
      // Three-month mean keeps monthly noise from hiding the trend.
      const smooth = values.map((_v, i) => (values[i] + (values[i - 1] ?? values[i]) + (values[i - 2] ?? values[i])) / 3);
      const path = d3.line<number>().x((_v, i) => x(i)).y((v) => y(v))(smooth) ?? "";
      const zero = lo < 0 ? `<line x1="0" x2="${w}" y1="${y(0)}" y2="${y(0)}" stroke="rgba(148,170,214,0.3)"/>` : "";
      return `<div class="bio-spark"><span>${title}<b>${fmt(values[values.length - 1])}</b></span><svg class="spark" width="${w}" height="${h}">${zero}<path d="${path}" fill="none" stroke="${SECTOR_COLORS[s.key]}" stroke-width="1.8"/></svg></div>`;
    };
    const staff = f.employees.map((id) => e.persons[id]);
    const avgPay = staff.length ? staff.reduce((a, p) => a + p.wage, 0) / staff.length : 0;
    const risk = riskOf(f);
    this.detail.innerHTML = `<button class="card-close" aria-label="Close">×</button>
      <div class="card-title">${escapeHtml(f.name)}</div>
      <div class="card-sub"><span class="pill" style="--c:${SECTOR_COLORS[s.key]}">${s.name}</span>${f.alive ? (f.founded > 0 ? ` Founded ${dateLong(e.date - (e.day - f.founded) * 86400000)}` : "") : " Closed"}</div>
      ${row("Staff", `${f.employees.length}: ${f.countK} knowledge, ${f.countM} manual`)}
      ${row("Average pay", `${kr(avgPay, 0)} /mo`)}
      ${f.isPublic ? row("Funded by", "The state budget") : row("Price level", f.price.toFixed(0)) + row("Cash", kr(f.cash)) + row("Debt", kr(f.loan)) + row("Money risk", risk.label)}
      ${row("AI software", `${pct(f.aiAdoption, 0)} of knowledge staff, saves ${pct(f.aiSaving * s.aiExposure, 0)} of their task time`)}
      ${row("Robots", `${num(f.robots)}, doing ${pct(f.robotSaving, 0)} of manual tasks`)}
      ${spark("Jobs", (h) => h.jobs, num)}
      ${f.isPublic ? "" : spark("Income per month", (h) => h.revenue, (v) => kr(v)) + spark("Profit per month", (h) => h.profit, (v) => kr(v)) + spark("Units made per month", (h) => h.output, money)}`;
    this.detail.querySelector(".card-close")!.addEventListener("click", () => {
      this.selected = -1;
      this.detail.hidden = true;
      this.update(true);
    });
  }
}
