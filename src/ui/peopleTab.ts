import * as d3 from "d3";
import type { App } from "../app.ts";
import { SECTORS } from "../sim/params.ts";
import { EMPLOYED, RETIRED, UNEMPLOYED } from "../sim/types.ts";
import type { Person } from "../sim/types.ts";
import { STATUS } from "./colors.ts";
import { dateLong, el, escapeHtml, kr, num, pct } from "./format.ts";
import type { Tab } from "./shell.ts";

type GroupBy = "status" | "occupation" | "sector" | "savings" | "age";

const GROUPINGS: { id: GroupBy; label: string }[] = [
  { id: "status", label: "Status" },
  { id: "occupation", label: "Occupation" },
  { id: "sector", label: "Employer" },
  { id: "savings", label: "Savings" },
  { id: "age", label: "Age" },
];

const SAVINGS_BINS = [
  { max: 25000, label: "Under 25 k" }, { max: 100000, label: "25–100 k" }, { max: 250000, label: "100–250 k" },
  { max: 500000, label: "250–500 k" }, { max: 1000000, label: "500 k–1 M" }, { max: 2500000, label: "1–2.5 M" }, { max: Infinity, label: "Over 2.5 M" },
];

const DOT = 3.1;
const GAP = 8.4;

/** Everyone as a dot that flows between groups, plus any person's story. */
export class PeopleTab implements Tab {
  readonly id = "people";
  readonly label = "People";
  readonly el = el("div", "people");
  private readonly app: App;
  private readonly canvas = el("canvas", "people-canvas");
  private readonly stage = el("div", "people-stage");
  private readonly labels = el("div", "people-labels");
  private readonly side = el("aside", "people-side");
  private readonly tip = el("div", "town-tip");
  private readonly histogram = el("div", "people-hist");
  private readonly bio = el("div", "bio");
  private readonly stories = el("div", "stories");
  private group: GroupBy = "status";
  private x = new Float32Array(0);
  private y = new Float32Array(0);
  private tx = new Float32Array(0);
  private ty = new Float32Array(0);
  private width = 800;
  private height = 600;
  private layoutTimer = 0;
  private selected = -1;
  private bioTimer = 0;
  private characters: { id: number; role: string; name: string }[] = [];
  private casting: { role: string; test: (p: Person) => boolean }[] = [];
  private visible = false;
  private selectedName = "";
  private dotSize = DOT;
  /** Set by the app: show this person in the town. */
  showInTown: (id: number) => void = () => {};

  constructor(app: App) {
    this.app = app;
    const bar = el("div", "seg");
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "Group people by");
    bar.append(el("span", "seg-label", "Group by"));
    for (const g of GROUPINGS) {
      const b = el("button", "seg-btn", g.label);
      b.dataset.group = g.id;
      b.classList.toggle("active", g.id === this.group);
      b.addEventListener("click", () => {
        this.group = g.id;
        bar.querySelectorAll(".seg-btn").forEach((x) => x.classList.toggle("active", x === b));
        this.relayout();
      });
      bar.append(b);
    }
    const legend = el("div", "people-legend", `<span><i class="dot" style="background:${STATUS.employed}"></i>Employed</span><span><i class="dot" style="background:${STATUS.unemployed}"></i>Unemployed</span><span><i class="dot" style="background:${STATUS.retired}"></i>Retired</span>`);
    const head = el("div", "people-head");
    head.append(bar, legend);
    this.tip.hidden = true;
    this.stage.append(this.canvas, this.labels, this.tip);
    const left = el("div", "people-main");
    left.append(head, this.stage);
    const histTitle = el("h2", "", "Savings of all people");
    const storyTitle = el("h2", "", "Follow someone");
    this.side.append(histTitle, this.histogram, storyTitle, this.stories, this.bio);
    this.el.append(left, this.side);

    new ResizeObserver(() => this.resize()).observe(this.stage);
    this.canvas.addEventListener("pointermove", (e) => this.onMove(e));
    this.canvas.addEventListener("pointerleave", () => { this.tip.hidden = true; });
    this.canvas.addEventListener("click", (e) => {
      const id = this.personAt(e);
      if (id >= 0) this.select(id);
    });
    app.onReset(() => this.rebind());
    app.onMonth(() => { if (this.visible) { this.drawHistogram(); this.layoutTimer = 0; } });
    this.rebind();
  }

  private rebind(): void {
    const n = this.app.economy.persons.length;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.tx = new Float32Array(n);
    this.ty = new Float32Array(n);
    this.selected = -1;
    this.bio.innerHTML = `<p class="bio-empty">Click any dot, or a person above, to read their story.</p>`;
    this.pickCharacters();
    this.relayout(true);
    if (this.visible) { this.drawHistogram(); this.updateStoryButtons(); }
  }

  /** A cast of typical people, chosen from the run so their stories are real. */
  private pickCharacters(): void {
    const firmSector = (p: Person) => (p.firmId >= 0 ? SECTORS[this.app.economy.firms[p.firmId].sector].key : "");
    this.casting = [
      { role: "Office clerk", test: (p) => p.status === EMPLOYED && p.knowledge && p.age < 40 && ["services", "finance"].includes(firmSector(p)) },
      { role: "Developer", test: (p) => p.status === EMPLOYED && p.age > 35 && p.age < 52 && firmSector(p) === "software" },
      { role: "Factory worker", test: (p) => p.status === EMPLOYED && !p.knowledge && firmSector(p) === "goods" },
      { role: "Care worker", test: (p) => p.status === EMPLOYED && !p.knowledge && firmSector(p) === "health" },
      { role: "Shareholder", test: (p) => p.shares > 2 },
      { role: "Young jobseeker", test: (p) => p.status === UNEMPLOYED && p.age < 30 },
    ];
    this.characters = [];
    this.stories.innerHTML = "";
    for (const entry of this.casting) {
      const p = this.findCharacter(entry.test);
      if (!p) continue;
      const c = { id: p.id, role: entry.role, name: p.name };
      this.characters.push(c);
      const b = el("button", "story-btn");
      b.addEventListener("click", () => this.select(c.id));
      b.dataset.role = entry.role;
      this.stories.append(b);
    }
  }

  private findCharacter(test: (p: Person) => boolean): Person | undefined {
    const used = new Set(this.characters.map((c) => c.id));
    return this.app.economy.persons.find((p) => !used.has(p.id) && test(p));
  }

  private groupOf(p: Person): string {
    switch (this.group) {
      case "status":
        return p.status === EMPLOYED ? "Employed" : p.status === RETIRED ? "Retired" : p.support === "assistance" ? "Unemployed, on social assistance" : p.support === "insurance" ? "Unemployed, on insurance" : "Unemployed, no support";
      case "occupation":
        return p.status === RETIRED ? "Retired" : p.knowledge ? (p.status === EMPLOYED ? "Knowledge, employed" : "Knowledge, unemployed") : (p.status === EMPLOYED ? "Manual, employed" : "Manual, unemployed");
      case "sector":
        if (p.status === RETIRED) return "Retired";
        if (p.status === UNEMPLOYED) return "No employer";
        return SECTORS[this.app.economy.firms[p.firmId].sector].name;
      case "savings":
        return SAVINGS_BINS.find((b) => p.cash < b.max)!.label;
      case "age": {
        const a = Math.floor(p.age / 10) * 10;
        return a >= 80 ? "80+" : `${a}–${a + 9}`;
      }
    }
  }

  private orderOf(names: string[]): string[] {
    if (this.group === "savings") return SAVINGS_BINS.map((b) => b.label).filter((l) => names.includes(l));
    if (this.group === "age") return [...names].sort();
    if (this.group === "status") return ["Employed", "Unemployed, on insurance", "Unemployed, on social assistance", "Unemployed, no support", "Retired"].filter((l) => names.includes(l));
    return [...names].sort((a, b) => {
      const rank = (n: string) => (n === "Retired" ? 2 : n === "No employer" ? 1 : 0);
      return rank(a) - rank(b) || a.localeCompare(b);
    });
  }

  /** Lay groups out left to right, each as a packed block, with a label above it. */
  private relayout(snap = false): void {
    const people = this.app.economy.persons;
    const groups = new Map<string, Person[]>();
    for (const p of people) {
      const key = this.groupOf(p);
      const list = groups.get(key);
      if (list) list.push(p);
      else groups.set(key, [p]);
    }
    const names = this.orderOf([...groups.keys()]);
    const padX = 16;
    const padTop = 34;
    const labelSpace = 36;
    let cx = padX;
    let cy = padTop;
    let rowHeight = 0;
    const usable = this.width - padX * 2;
    const total = people.length;
    const area = Math.max(1, usable * (this.height - padTop - 40));
    // Blocks sized so everything fits; columns proportional to the group's share.
    const density = Math.min(1.5, Math.sqrt(area / (total * GAP * GAP * 2.6)));
    const gap = Math.max(6, GAP * density);
    this.dotSize = Math.max(2.4, DOT * Math.min(1.35, density));
    const html: string[] = [];
    for (const name of names) {
      const list = groups.get(name)!;
      list.sort((a, b) => a.id - b.id);
      const aspect = 1.45;
      let cols = Math.max(9, Math.ceil(Math.sqrt(list.length * aspect)));
      cols = Math.min(cols, Math.floor(usable / gap));
      const rows = Math.ceil(list.length / cols);
      const blockW = cols * gap;
      const blockH = rows * gap;
      // A block is as wide as its dots or its label, whichever is wider, so labels never collide.
      const labelWidth = Math.max(blockW, name.length * 6.3 + 34);
      if (cx + labelWidth > padX + usable && cx > padX) {
        cx = padX;
        cy += rowHeight + labelSpace;
        rowHeight = 0;
      }
      list.forEach((p, k) => {
        this.tx[p.id] = cx + (k % cols) * gap + gap / 2;
        this.ty[p.id] = cy + Math.floor(k / cols) * gap + gap / 2;
      });
      html.push(`<div class="group-label" style="left:${cx}px;top:${cy - 24}px"><b>${num(list.length)}</b> ${name}</div>`);
      cx += labelWidth + 22;
      rowHeight = Math.max(rowHeight, blockH);
    }
    this.labels.innerHTML = html.join("");
    if (snap) {
      this.x.set(this.tx);
      this.y.set(this.ty);
    }
  }

  private resize(): void {
    const r = this.stage.getBoundingClientRect();
    if (r.width < 10) return;
    this.width = r.width;
    this.height = r.height;
    const dpr = Math.min(2, window.devicePixelRatio);
    this.canvas.width = r.width * dpr;
    this.canvas.height = r.height * dpr;
    this.canvas.style.width = `${r.width}px`;
    this.canvas.style.height = `${r.height}px`;
    this.relayout(true);
  }

  setActive(active: boolean): void {
    this.visible = active;
    if (active) {
      this.resize();
      this.relayout(true);
      this.drawHistogram();
      this.updateStoryButtons();
    }
  }

  frame(seconds: number): void {
    this.layoutTimer -= seconds;
    if (this.layoutTimer <= 0) {
      this.layoutTimer = 0.4;
      this.relayout();
      this.updateStoryButtons();
    }
    const n = this.x.length;
    const follow = 1 - Math.exp(-seconds * 4.5);
    for (let i = 0; i < n; i++) {
      this.x[i] += (this.tx[i] - this.x[i]) * follow;
      this.y[i] += (this.ty[i] - this.y[i]) * follow;
    }
    this.draw();
    this.bioTimer -= seconds;
    if (this.bioTimer <= 0 && this.selected >= 0) {
      this.bioTimer = 0.5;
      this.renderBio();
    }
  }

  private draw(): void {
    const c = this.canvas.getContext("2d")!;
    const dpr = this.canvas.width / Math.max(1, this.width);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, this.width, this.height);
    const people = this.app.economy.persons;
    const colors = [STATUS.employed, STATUS.unemployed, STATUS.retired];
    for (let status = 0; status < 3; status++) {
      c.fillStyle = colors[status];
      c.beginPath();
      for (const p of people) {
        if (p.status !== status) continue;
        c.moveTo(this.x[p.id] + this.dotSize, this.y[p.id]);
        c.arc(this.x[p.id], this.y[p.id], this.dotSize, 0, Math.PI * 2);
      }
      c.fill();
    }
    // People behind on housing get a warning ring.
    c.strokeStyle = "#ffd166";
    c.lineWidth = 1.2;
    c.beginPath();
    for (const p of people) {
      if (p.arrears >= 1) {
        c.moveTo(this.x[p.id] + this.dotSize + 1.2, this.y[p.id]);
        c.arc(this.x[p.id], this.y[p.id], this.dotSize + 1.2, 0, Math.PI * 2);
      }
    }
    c.stroke();
    if (this.selected >= 0) {
      c.strokeStyle = "#ffffff";
      c.lineWidth = 2;
      c.beginPath();
      c.arc(this.x[this.selected], this.y[this.selected], this.dotSize + 3, 0, Math.PI * 2);
      c.stroke();
    }
  }

  private personAt(e: MouseEvent): number {
    const r = this.canvas.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    let best = -1;
    let bestD = 64;
    for (let i = 0; i < this.x.length; i++) {
      const d = (this.x[i] - mx) ** 2 + (this.y[i] - my) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  private onMove(e: PointerEvent): void {
    const id = this.personAt(e);
    this.canvas.style.cursor = id >= 0 ? "pointer" : "";
    if (id < 0) { this.tip.hidden = true; return; }
    const p = this.app.economy.persons[id];
    const r = this.stage.getBoundingClientRect();
    this.tip.hidden = false;
    this.tip.innerHTML = `<b>${escapeHtml(p.name)}</b>, ${Math.floor(p.age)}<br>${this.line(p)}<br>Savings ${kr(p.cash, 0)}`;
    this.tip.style.left = `${Math.min(r.width - 240, e.clientX - r.left + 12)}px`;
    this.tip.style.top = `${e.clientY - r.top + 12}px`;
  }

  private line(p: Person): string {
    const e = this.app.economy;
    if (p.status === EMPLOYED) return `${p.knowledge ? "Knowledge" : "Manual"} worker at ${escapeHtml(e.firms[p.firmId].name)}`;
    if (p.status === RETIRED) return "Retired";
    return `Unemployed for ${p.monthsUnemployed} months. ${escapeHtml(p.incomeLabel)}`;
  }

  private updateStoryButtons(): void {
    const people = this.app.economy.persons;
    const buttons = this.stories.querySelectorAll<HTMLButtonElement>(".story-btn");
    this.characters.forEach((c, i) => {
      // When someone dies their place in the population goes to a newcomer, so recast the role.
      if (people[c.id].name !== c.name) {
        const test = this.casting.find((x) => x.role === c.role)?.test;
        const next = test && this.findCharacter(test);
        if (next) { c.id = next.id; c.name = next.name; }
        else c.name = people[c.id].name;
      }
      const p = people[c.id];
      const color = p.status === EMPLOYED ? STATUS.employed : p.status === RETIRED ? STATUS.retired : STATUS.unemployed;
      const b = buttons[i];
      if (!b) return;
      b.innerHTML = `<i class="dot" style="background:${color}"></i><span class="story-role">${c.role}</span><span class="story-name">${escapeHtml(p.name)}, ${Math.floor(p.age)}</span>`;
      b.classList.toggle("active", p.id === this.selected);
    });
  }

  select(id: number): void {
    this.selected = id;
    this.selectedName = this.app.economy.persons[id]?.name ?? "";
    this.renderBio();
    this.updateStoryButtons();
  }

  // ------------------------------------------------------------------ savings histogram

  private drawHistogram(): void {
    const people = this.app.economy.persons;
    const counts = SAVINGS_BINS.map(() => 0);
    let empty = 0;
    for (const p of people) {
      counts[SAVINGS_BINS.findIndex((b) => p.cash < b.max)]++;
      if (p.cash < 2 * (p.housingCost + 6000)) empty++;
    }
    const w = 276;
    const rowH = 19;
    const max = Math.max(...counts, 1);
    const scale = d3.scaleLinear().domain([0, max]).range([0, w - 118]);
    this.histogram.innerHTML = `<svg width="${w}" height="${SAVINGS_BINS.length * rowH}" role="img" aria-label="Number of people by savings">${SAVINGS_BINS.map((b, i) =>
      `<g transform="translate(0,${i * rowH})"><text x="66" y="12.5" text-anchor="end" class="hist-label">${b.label}</text><rect x="72" y="3" height="12" rx="2" width="${Math.max(1, scale(counts[i]))}" fill="#3987e5"/><text x="${76 + scale(counts[i])}" y="12.5" class="hist-value">${counts[i]}</text></g>`).join("")}</svg><p class="hist-note">${pct(empty / people.length, 0)} have less than two months of basic costs saved.</p>`;
  }

  // ------------------------------------------------------------------ biography

  private renderBio(): void {
    const p = this.app.economy.persons[this.selected];
    if (!p) return;
    const e = this.app.economy;
    // Their place in the population has gone to a newcomer: say so rather than switch silently.
    if (p.name !== this.selectedName) {
      this.bio.innerHTML = `<p class="bio-empty">${escapeHtml(this.selectedName)} has passed away. Pick someone else to follow.</p>`;
      this.selected = -1;
      this.updateStoryButtons();
      return;
    }
    const status = p.status === EMPLOYED ? "Employed" : p.status === RETIRED ? "Retired" : "Unemployed";
    const color = p.status === EMPLOYED ? STATUS.employed : p.status === RETIRED ? STATUS.retired : STATUS.unemployed;
    const row = (k: string, v: string) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`;
    const events = [...p.log].reverse().slice(0, 7).map((l) => `<li><time>${dateLong(e.date - (e.day - l.day) * 86400000)}</time>${escapeHtml(l.text)}</li>`).join("");
    this.bio.innerHTML = `
      <div class="card-title">${escapeHtml(p.name)}</div>
      <div class="card-sub"><span class="pill" style="--c:${color}">${status}</span> Age ${Math.floor(p.age)}, ${p.knowledge ? "knowledge" : "manual"} worker</div>
      ${p.status === EMPLOYED ? row("Works at", escapeHtml(e.firms[p.firmId].name)) + row("Pay before tax", `${kr(p.wage, 0)} /mo`) : ""}
      ${row("Income source", escapeHtml(p.incomeLabel || "–"))}
      ${row("Income after tax", `${kr(p.netIncome, 0)} /mo`)}
      ${row("Spends", `${kr(p.lastSpend, 0)} /mo`)}
      ${row("Savings", kr(p.cash, 0))}
      ${row("Home", p.housing === "rent" ? `Rents, ${kr(p.housingCost, 0)} /mo` : p.housing === "mortgage" ? `Mortgage ${kr(p.mortgage)}` : "Owns outright")}
      ${p.arrears >= 1 ? row("Behind on housing", `${Math.ceil(p.arrears)} months`) : ""}
      <div class="bio-spark"><span>Savings over time</span>${this.spark(p.savingsHistory, "#3987e5")}</div>
      <div class="bio-spark"><span>Income after tax</span>${this.spark(p.incomeHistory, "#199e70")}</div>
      <ol class="bio-log">${events || "<li>Nothing has happened yet.</li>"}</ol>
      <button class="ghost-btn" data-town>See in the town</button>`;
    this.bio.querySelector("[data-town]")?.addEventListener("click", () => this.showInTown(this.selected));
  }

  private spark(values: number[], color: string): string {
    if (values.length < 2) return `<svg class="spark" width="276" height="34"></svg>`;
    const w = 276;
    const h = 34;
    const x = d3.scaleLinear().domain([0, values.length - 1]).range([1, w - 1]);
    const y = d3.scaleLinear().domain([0, Math.max(1, d3.max(values) ?? 1)]).range([h - 2, 2]);
    const path = d3.line<number>().x((_v, i) => x(i)).y((v) => y(Math.max(0, v)))(values) ?? "";
    return `<svg class="spark" width="${w}" height="${h}"><path d="${path}" fill="none" stroke="${color}" stroke-width="1.6"/></svg>`;
  }
}
