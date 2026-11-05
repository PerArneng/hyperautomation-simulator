import * as d3 from "d3";
import type { App } from "../app.ts";
import { SIM_START } from "../sim/params.ts";
import type { MonthStats } from "../sim/types.ts";
import { el, monthYear } from "./format.ts";

export const SERIES = {
  blue: "#3987e5",
  orange: "#d95926",
  aqua: "#199e70",
  yellow: "#c98500",
  magenta: "#d55181",
  green: "#008300",
  violet: "#9085e9",
  red: "#e66767",
  ghost: "#b4bccd",
};
/** Fixed order, validated on the panel surface. */
export const CATEGORICAL = [SERIES.blue, SERIES.orange, SERIES.aqua, SERIES.yellow, SERIES.magenta, SERIES.green, SERIES.violet, SERIES.red];

export interface Series {
  label: string;
  color: string;
  get: (h: MonthStats) => number;
  /** Rolling mean over this many months, to read through monthly noise. */
  window?: number;
  /** Plot the running total. */
  cumulative?: boolean;
}

export interface ChartHelp {
  what: string;
  read: string;
  why: string;
}

export interface ChartDef {
  id: string;
  title: string;
  series: Series[];
  format: (v: number) => string;
  help: ChartHelp;
  /** Stack series as areas. */
  stacked?: boolean;
  /** Draw the same series from the no-AI run as a thin grey line. Only for single-series or first-series comparison. */
  ghost?: boolean;
  /** Force the axis to include this value (default 0). Null: let the data decide. */
  baseline?: number | null;
  wide?: boolean;
}

/** One time cursor shared by all charts. */
export class ChartHub {
  hoverDate: number | null = null;
  readonly charts = new Set<Chart>();
  setHover(date: number | null): void {
    if (date === this.hoverDate) return;
    this.hoverDate = date;
    for (const c of this.charts) c.drawCursor();
  }
}

const MARGIN = { top: 8, right: 12, bottom: 20, left: 46 };
const MAX_POINTS = 360;

interface Computed { dates: number[]; lines: { series: Series; values: number[] }[]; ghost: number[] | null; }

function transform(hist: MonthStats[], s: Series): number[] {
  const out = new Array<number>(hist.length);
  if (s.cumulative) {
    let sum = 0;
    for (let i = 0; i < hist.length; i++) { sum += s.get(hist[i]); out[i] = sum; }
    return out;
  }
  if (s.window && s.window > 1) {
    let sum = 0;
    for (let i = 0; i < hist.length; i++) {
      sum += s.get(hist[i]);
      if (i >= s.window) sum -= s.get(hist[i - s.window]);
      out[i] = sum / Math.min(i + 1, s.window);
    }
    return out;
  }
  for (let i = 0; i < hist.length; i++) out[i] = s.get(hist[i]);
  return out;
}

/** A small live time-series card: title, legend with current values, plot, tooltip and help. */
export class Chart {
  readonly el: HTMLElement;
  readonly def: ChartDef;
  private readonly app: App;
  private readonly hub: ChartHub;
  private readonly svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private readonly plot: HTMLElement;
  private readonly legend: HTMLElement;
  private readonly tooltip: HTMLElement;
  private readonly helpBox: HTMLElement;
  private readonly gGrid: d3.Selection<SVGGElement, unknown, null, undefined>;
  private readonly gX: d3.Selection<SVGGElement, unknown, null, undefined>;
  private readonly gY: d3.Selection<SVGGElement, unknown, null, undefined>;
  private readonly gStages: d3.Selection<SVGGElement, unknown, null, undefined>;
  private readonly gMarks: d3.Selection<SVGGElement, unknown, null, undefined>;
  private readonly cursor: d3.Selection<SVGLineElement, unknown, null, undefined>;
  private width = 300;
  private height = 150;
  private x = d3.scaleUtc();
  private y = d3.scaleLinear();
  private computed: Computed = { dates: [], lines: [], ghost: null };
  private inView = true;
  private lastLength = -1;
  private lastDomainEnd = 0;
  private legendValues: HTMLElement[] = [];
  private ghostValue: HTMLElement | null = null;
  private tableHolder: HTMLElement | null = null;

  constructor(app: App, hub: ChartHub, def: ChartDef) {
    this.app = app;
    this.hub = hub;
    this.def = def;
    hub.charts.add(this);
    this.el = el("article", "chart");
    this.el.dataset.chart = def.id;
    if (def.wide) this.el.classList.add("wide");
    const head = el("header", "chart-head");
    const title = el("h3", "chart-title", def.title);
    const help = el("button", "help-dot", "?");
    help.setAttribute("aria-label", `Help for ${def.title}`);
    help.setAttribute("aria-expanded", "false");
    head.append(title, help);
    this.legend = el("div", "chart-legend");
    this.plot = el("div", "chart-plot");
    this.tooltip = el("div", "chart-tip");
    this.tooltip.hidden = true;
    this.helpBox = el("div", "chart-help");
    this.helpBox.hidden = true;
    this.buildHelp();
    help.addEventListener("click", () => {
      const open = this.helpBox.hidden;
      this.helpBox.hidden = !open;
      help.setAttribute("aria-expanded", String(open));
    });
    this.el.append(head, this.legend, this.plot, this.helpBox);

    this.svg = d3.select(this.plot).append("svg").attr("role", "img").attr("aria-label", def.title);
    this.gGrid = this.svg.append("g").attr("class", "grid");
    this.gStages = this.svg.append("g").attr("class", "stages");
    this.gMarks = this.svg.append("g").attr("class", "marks");
    this.gX = this.svg.append("g").attr("class", "axis");
    this.gY = this.svg.append("g").attr("class", "axis");
    this.cursor = this.svg.append("line").attr("class", "cursor").style("display", "none");
    this.plot.append(this.tooltip);

    this.buildLegend();
    this.plot.addEventListener("pointermove", (e) => this.onPointer(e));
    this.plot.addEventListener("pointerleave", () => { this.hub.setHover(null); this.tooltip.hidden = true; });
    new ResizeObserver(() => this.resize()).observe(this.plot);
    new IntersectionObserver((entries) => { this.inView = entries[entries.length - 1].isIntersecting; }, { rootMargin: "120px" }).observe(this.el);
  }

  private buildHelp(): void {
    const { what, read, why } = this.def.help;
    this.helpBox.innerHTML = `<p><b>What it shows.</b> ${what}</p><p><b>How to read it.</b> ${read}</p><p><b>Why it matters.</b> ${why}</p>`;
    const tableBtn = el("button", "ghost-btn", "Show data table");
    const holder = el("div", "chart-table");
    this.tableHolder = holder;
    holder.hidden = true;
    tableBtn.addEventListener("click", () => {
      holder.hidden = !holder.hidden;
      tableBtn.textContent = holder.hidden ? "Show data table" : "Hide data table";
      if (!holder.hidden) this.renderTable(holder);
    });
    this.helpBox.append(tableBtn, holder);
  }

  private renderTable(holder: HTMLElement): void {
    const c = this.computed;
    const headers = c.lines.map((l) => `<th>${l.series.label}</th>`).join("") + (c.ghost ? "<th>No AI</th>" : "");
    const rows: string[] = [];
    // One row a year keeps it readable, newest first.
    for (let i = c.dates.length - 1; i >= 0; i -= 12) {
      const values = c.lines.map((l) => `<td>${this.def.format(l.values[i])}</td>`).join("") + (c.ghost ? `<td>${this.def.format(c.ghost[i] ?? 0)}</td>` : "");
      rows.push(`<tr><th scope="row">${monthYear(c.dates[i])}</th>${values}</tr>`);
    }
    holder.innerHTML = `<table><thead><tr><th>Date</th>${headers}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
  }

  private buildLegend(): void {
    this.legend.innerHTML = "";
    this.legendValues = [];
    const multi = this.def.series.length > 1 || this.def.ghost;
    for (const s of this.def.series) {
      const item = el("div", "legend-item");
      if (multi) item.append(el("i", "swatch"));
      if (multi) (item.firstChild as HTMLElement).style.background = s.color;
      if (multi) item.append(el("span", "legend-label", s.label));
      const v = el("b", "legend-value", "–");
      item.append(v);
      this.legendValues.push(v);
      this.legend.append(item);
    }
    if (this.def.ghost) {
      const item = el("div", "legend-item");
      const sw = el("i", "swatch thin");
      sw.style.background = SERIES.ghost;
      this.ghostValue = el("b", "legend-value", "–");
      item.append(sw, el("span", "legend-label", "No AI"), this.ghostValue);
      this.legend.append(item);
    }
  }

  private resize(): void {
    const r = this.plot.getBoundingClientRect();
    if (r.width < 10) return;
    this.width = r.width;
    this.height = Math.max(90, r.height);
    this.svg.attr("width", this.width).attr("height", this.height);
    this.lastLength = -1;
    this.render(true);
  }

  private compute(): void {
    const hist = this.app.economy.history;
    const ghostHist = this.app.ghost.history;
    const lines = this.def.series.map((series) => ({ series, values: transform(hist, series) }));
    this.computed = {
      dates: hist.map((h) => h.date),
      lines,
      ghost: this.def.ghost ? transform(ghostHist, this.def.series[0]) : null,
    };
  }

  private thin<T>(values: T[]): T[] {
    if (values.length <= MAX_POINTS) return values;
    const step = values.length / MAX_POINTS;
    const out: T[] = [];
    for (let i = 0; i < MAX_POINTS - 1; i++) out.push(values[Math.floor(i * step)]);
    out.push(values[values.length - 1]);
    return out;
  }

  /** Redraw if there is new data or the time axis needs to slide. */
  render(force = false): void {
    if (!this.inView && !force) return;
    if (this.el.offsetParent === null) return;
    const hist = this.app.economy.history;
    const now = this.app.date;
    const domainEnd = Math.max(now, SIM_START + 5 * 365.25 * 86400000);
    if (!force && hist.length === this.lastLength && Math.abs(domainEnd - this.lastDomainEnd) < 86400000 * 3) return;
    const changed = hist.length !== this.lastLength;
    this.lastLength = hist.length;
    this.lastDomainEnd = domainEnd;
    if (changed || force) {
      this.compute();
      if (this.tableHolder && !this.tableHolder.hidden && !this.helpBox.hidden) this.renderTable(this.tableHolder);
    }
    const c = this.computed;
    if (!c.dates.length) return;

    const w = this.width;
    const h = this.height;
    const x = this.x.domain([new Date(hist[0].date), new Date(domainEnd)]).range([MARGIN.left, w - MARGIN.right]);
    const def = this.def;

    let lo = Infinity;
    let hi = -Infinity;
    if (def.stacked) {
      lo = 0;
      for (let i = 0; i < c.dates.length; i++) {
        let sum = 0;
        for (const l of c.lines) sum += l.values[i];
        if (sum > hi) hi = sum;
      }
    } else {
      for (const l of c.lines) for (const v of l.values) { if (v < lo) lo = v; if (v > hi) hi = v; }
      if (c.ghost) for (const v of c.ghost) { if (v < lo) lo = v; if (v > hi) hi = v; }
    }
    if (def.baseline !== null) {
      const base = def.baseline ?? 0;
      lo = Math.min(lo, base);
      hi = Math.max(hi, base);
    }
    if (hi - lo < 1e-9) hi = lo + 1;
    const y = this.y.domain([lo, hi]).nice(4).range([h - MARGIN.bottom, MARGIN.top]);

    const yTicks = y.ticks(4);
    this.gGrid.selectAll<SVGLineElement, number>("line").data(yTicks).join("line")
      .attr("x1", MARGIN.left).attr("x2", w - MARGIN.right)
      .attr("y1", (d) => y(d) + 0.5).attr("y2", (d) => y(d) + 0.5);
    this.gY.selectAll<SVGTextElement, number>("text").data(yTicks).join("text")
      .attr("x", MARGIN.left - 6).attr("y", (d) => y(d)).attr("dy", "0.32em").attr("text-anchor", "end")
      .text((d) => def.format(d));
    const years = Math.max(1, (domainEnd - hist[0].date) / (365.25 * 86400000));
    const every = years <= 6 ? 1 : years <= 12 ? 2 : years <= 30 ? 5 : 10;
    const xTicks = d3.utcYear.every(every)!.range(new Date(hist[0].date), new Date(domainEnd));
    this.gX.selectAll<SVGTextElement, Date>("text").data(xTicks).join("text")
      .attr("x", (d) => x(d)).attr("y", h - 5).attr("text-anchor", "middle")
      .text((d) => String(d.getUTCFullYear()));

    // Roll-out stages: where AI or robot levels stepped up.
    this.gStages.selectAll<SVGLineElement, { year: number; label: string }>("line").data(this.app.stages).join("line")
      .attr("x1", (d) => x(new Date(SIM_START + d.year * 365.25 * 86400000)))
      .attr("x2", (d) => x(new Date(SIM_START + d.year * 365.25 * 86400000)))
      .attr("y1", MARGIN.top).attr("y2", h - MARGIN.bottom)
      .attr("stroke", (d) => (d.label.startsWith("Robots") ? SERIES.orange : SERIES.violet));

    const dates = this.thin(c.dates.map((_d, i) => i));
    if (def.stacked) {
      const rows = dates.map((i) => ({ date: c.dates[i], ...Object.fromEntries(c.lines.map((l, k) => [k, l.values[i]])) })) as unknown as Record<string, number>[];
      const keys = c.lines.map((_l, k) => String(k));
      const stack = d3.stack<Record<string, number>>().keys(keys)(rows);
      const area = d3.area<d3.SeriesPoint<Record<string, number>>>()
        .x((d) => x(new Date(d.data.date))).y0((d) => y(d[0])).y1((d) => y(d[1]));
      this.gMarks.selectAll<SVGPathElement, d3.Series<Record<string, number>, string>>("path.stack").data(stack).join("path")
        .attr("class", "stack").attr("fill", (_d, k) => c.lines[k].series.color).attr("d", (d) => area(d) ?? "");
    } else {
      const line = d3.line<number>().x((i) => x(new Date(c.dates[i]))).curve(d3.curveMonotoneX);
      const draw = (values: number[]) => line.y((i) => y(values[i]))(dates) ?? "";
      type Mark = { color: string; path: string; ghost: boolean };
      const marks: Mark[] = [];
      if (c.ghost) marks.push({ color: SERIES.ghost, path: draw(c.ghost), ghost: true });
      for (const l of c.lines) marks.push({ color: l.series.color, path: draw(l.values), ghost: false });
      this.gMarks.selectAll<SVGPathElement, Mark>("path.line").data(marks).join("path")
        .attr("class", (d) => (d.ghost ? "line ghost" : "line")).attr("stroke", (d) => d.color).attr("d", (d) => d.path);
    }
    this.updateLegend();
    this.drawCursor();
  }

  private indexAt(date: number): number {
    const dates = this.computed.dates;
    const i = d3.bisectCenter(dates, date);
    return Math.max(0, Math.min(dates.length - 1, i));
  }

  private updateLegend(): void {
    const c = this.computed;
    if (!c.dates.length) return;
    const hover = this.hub.hoverDate;
    const i = hover === null ? c.dates.length - 1 : this.indexAt(hover);
    c.lines.forEach((l, k) => { this.legendValues[k].textContent = this.def.format(l.values[i]); });
    if (c.ghost && this.ghostValue) this.ghostValue.textContent = this.def.format(c.ghost[Math.min(i, c.ghost.length - 1)]);
  }

  drawCursor(): void {
    const hover = this.hub.hoverDate;
    if (hover === null) {
      this.cursor.style("display", "none");
    } else {
      const px = this.x(new Date(hover));
      this.cursor.style("display", null).attr("x1", px).attr("x2", px).attr("y1", MARGIN.top).attr("y2", this.height - MARGIN.bottom);
    }
    this.updateLegend();
  }

  private onPointer(e: PointerEvent): void {
    const c = this.computed;
    if (!c.dates.length) return;
    const r = this.plot.getBoundingClientRect();
    const px = e.clientX - r.left;
    const date = +this.x.invert(px);
    const i = this.indexAt(date);
    this.hub.setHover(c.dates[i]);
    const rows = c.lines.map((l) => `<div class="tip-row"><i class="swatch" style="background:${l.series.color}"></i>${l.series.label}<b>${this.def.format(l.values[i])}</b></div>`);
    if (c.ghost) rows.push(`<div class="tip-row"><i class="swatch thin" style="background:${SERIES.ghost}"></i>No AI<b>${this.def.format(c.ghost[Math.min(i, c.ghost.length - 1)])}</b></div>`);
    this.tooltip.innerHTML = `<div class="tip-date">${monthYear(c.dates[i])}</div>${rows.join("")}`;
    this.tooltip.hidden = false;
    const tw = this.tooltip.offsetWidth;
    const left = px + 12 + tw > r.width ? px - tw - 10 : px + 12;
    this.tooltip.style.left = `${Math.max(2, left)}px`;
    this.tooltip.style.top = `${Math.max(2, e.clientY - r.top - 20)}px`;
  }

  /** Force a rebuild after the run restarts. */
  reset(): void {
    this.lastLength = -1;
    this.lastDomainEnd = 0;
  }

  hasData(): boolean {
    return this.computed.dates.length > 0 && this.gMarks.selectAll("path").size() > 0;
  }
}
