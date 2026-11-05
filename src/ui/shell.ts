import { App, SCENARIOS, SPEEDS } from "../app.ts";
import type { Controls } from "../sim/params.ts";
import { dateLong, efficiency, el, kr, num, pct } from "./format.ts";

export interface Tab {
  id: string;
  label: string;
  el: HTMLElement;
  /** Called when the tab becomes visible or hidden. */
  setActive(active: boolean): void;
  /** Called each animation frame while visible, with real seconds elapsed. */
  frame(seconds: number): void;
}

interface Slider {
  key: keyof Controls;
  label: string;
  help: string;
  group: string;
  min: number;
  max: number;
  step: number;
  /** Value on the slider to the engine's value, and back. */
  toValue(position: number): number;
  fromValue(value: number): number;
  show(value: number): string;
}

const identity = (x: number) => x;
const logMultiple = {
  // Position is log2 of the task-efficiency multiple, from ×1 to ×16.
  toValue: (position: number) => 1 - 1 / Math.pow(2, position),
  fromValue: (value: number) => Math.log2(1 / Math.max(0.0001, 1 - value)),
};

const SLIDERS: Slider[] = [
  {
    key: "aiLevel", group: "Automation", label: "AI software", min: 0, max: 4, step: 0.05, ...logMultiple,
    help: "Task efficiency for knowledge workers. ×2 means a fully exposed knowledge task takes half the time. Companies pay per seat, and it spreads over a few years. Some jobs are more exposed than others.",
    show: (v) => efficiency(v),
  },
  {
    key: "robotLevel", group: "Automation", label: "Robots", min: 0, max: 0.95, step: 0.01, toValue: identity, fromValue: identity,
    help: "Share of exposed manual tasks done by machines, for non-knowledge workers. Robots are bought on credit, installed slowly and need maintenance, so this moves more slowly than software.",
    show: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: "demandResponse", group: "Economy", label: "Appetite for more", min: 0, max: 1, step: 0.01, toValue: identity, fromValue: identity,
    help: "How far people's wants grow as things get cheaper, and how hard competition pushes savings into prices. High: cheaper output sells more and protects jobs. Low: people have enough, so efficiency mainly means fewer jobs.",
    show: (v) => (v < 0.25 ? "Low" : v < 0.6 ? "Medium" : v < 0.85 ? "High" : "Very high"),
  },
  {
    key: "newJobs", group: "Economy", label: "New kinds of work", min: 0, max: 1, step: 0.01, toValue: identity, fromValue: identity,
    help: "How readily new industries and tasks appear as old ones are automated. Historically this absorbed displaced workers, but nobody knows if it will again or how quickly.",
    show: (v) => (v < 0.15 ? "None" : v < 0.45 ? "Some" : v < 0.8 ? "Many" : "Plenty"),
  },
  {
    key: "support", group: "Policy", label: "Unemployment support", min: 0.5, max: 1.5, step: 0.01, toValue: identity, fromValue: identity,
    help: "Scales unemployment insurance and social assistance. 100% follows the Swedish rules: 80, then 70, then 65% of prior pay up to a ceiling, for about 14 months, then means-tested assistance.",
    show: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: "automationTax", group: "Policy", label: "Automation tax", min: 0, max: 0.6, step: 0.01, toValue: identity, fromValue: identity,
    help: "Tax on the wage cost companies save through automation. All of it is paid back equally to every adult as a citizen dividend.",
    show: (v) => `${Math.round(v * 100)}%`,
  },
  {
    key: "citizenDividend", group: "Policy", label: "Extra citizen dividend", min: 0, max: 15000, step: 250, toValue: identity, fromValue: identity,
    help: "A monthly payment to every adult from the state budget, in today's money. Set too high against what the economy can produce, it causes inflation.",
    show: (v) => (v === 0 ? "Off" : `${(v / 1000).toFixed(1)} k kr/mo`),
  },
];

const ICON_PLAY = `<svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M4 2.5v11l9-5.5z"/></svg>`;
const ICON_PAUSE = `<svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/></svg>`;
const ICON_RESET = `<svg viewBox="0 0 16 16" width="14" height="14"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="M3 8a5 5 0 1 0 1.6-3.7M3 2.5v2.7h2.7"/></svg>`;

/** Page frame: title, clock, vital signs, scenario and sliders, tabs. */
export class Shell {
  readonly root: HTMLElement;
  readonly body: HTMLElement;
  readonly footer: HTMLElement;
  private readonly app: App;
  private readonly tabs: Tab[] = [];
  private active: Tab | null = null;
  private readonly tabButtons = new Map<string, HTMLButtonElement>();
  private readonly tabBar: HTMLElement;
  private readonly dateEl: HTMLElement;
  private readonly elapsedEl: HTMLElement;
  private readonly playBtn: HTMLButtonElement;
  private readonly speedEl: HTMLSelectElement;
  private readonly vitals = new Map<string, { value: HTMLElement; delta: HTMLElement }>();
  private readonly sliderEls = new Map<string, { input: HTMLInputElement; value: HTMLElement; def: Slider }>();
  private readonly scenarioButtons = new Map<string, HTMLButtonElement>();
  private readonly scenarioBlurb: HTMLElement;
  private readonly timeline: HTMLElement;
  private readonly panel: HTMLElement;

  constructor(app: App, mount: HTMLElement) {
    this.app = app;
    this.root = el("div", "shell");
    mount.append(this.root);

    const top = el("header", "topbar");
    const brand = el("div", "brand");
    brand.innerHTML = `<div class="brand-mark" aria-hidden="true"></div><div class="brand-text"><div class="brand-country">Novaria</div><div class="brand-title">Effects of AI Hyperautomation on Macro Economy</div></div>`;
    this.tabBar = el("nav", "tabs");
    this.tabBar.setAttribute("role", "tablist");

    const clock = el("div", "clock");
    this.dateEl = el("div", "clock-date");
    this.elapsedEl = el("div", "clock-elapsed");
    const dateWrap = el("div", "clock-text");
    dateWrap.append(this.dateEl, this.elapsedEl);
    this.playBtn = el("button", "icon-btn play");
    this.playBtn.title = "Play or pause (space)";
    this.playBtn.setAttribute("aria-label", "Play or pause");
    this.playBtn.addEventListener("click", () => app.togglePause());
    const resetBtn = el("button", "icon-btn", ICON_RESET);
    resetBtn.title = "Start again";
    resetBtn.setAttribute("aria-label", "Start again");
    resetBtn.addEventListener("click", () => app.reset());
    const speedLabel = el("label", "speed");
    speedLabel.innerHTML = `<span>Time speed</span>`;
    this.speedEl = el("select", "speed-select");
    this.speedEl.id = "time-speed";
    for (const s of SPEEDS) {
      const o = el("option");
      o.value = s.id;
      o.textContent = s.label;
      o.title = s.hint;
      this.speedEl.append(o);
    }
    this.speedEl.addEventListener("change", () => app.setSpeed(this.speedEl.value));
    speedLabel.append(this.speedEl);
    clock.append(dateWrap, this.playBtn, resetBtn, speedLabel);
    top.append(brand, this.tabBar, clock);

    const vitals = el("section", "vitals");
    vitals.setAttribute("aria-label", "Vital signs of the economy");
    const defs: [string, string, string][] = [
      ["unemployment", "Unemployment", "Share of people in the workforce without a job. The figure below compares with the same country without new automation."],
      ["jobs", "People in work", "Everyone with a job, public and private."],
      ["savings", "Median savings", "What the person in the middle has saved. Half have less."],
      ["revenue", "Company income", "Total sales of all private companies last month."],
      ["margin", "Profit margin", "Company profit as a share of company income last month."],
      ["profitworker", "Profit per worker", "Monthly company profit divided by private-sector jobs."],
      ["support", "On support", "People receiving unemployment insurance or social assistance."],
      ["balance", "State budget", "Government income minus spending last month."],
    ];
    for (const [id, label, title] of defs) {
      const item = el("div", "vital");
      item.title = title;
      item.dataset.id = id;
      const l = el("div", "vital-label", label);
      const value = el("div", "vital-value", "–");
      const delta = el("div", "vital-delta", "&nbsp;");
      item.append(l, value, delta);
      vitals.append(item);
      this.vitals.set(id, { value, delta });
    }

    const main = el("div", "main");
    this.panel = el("aside", "panel");
    this.buildPanel();
    this.scenarioBlurb = this.panel.querySelector(".scenario-blurb") as HTMLElement;
    this.body = el("main", "tab-host");
    main.append(this.panel, this.body);

    this.footer = el("footer", "footer");
    this.timeline = el("div", "timeline");
    this.footer.append(this.timeline);
    this.root.append(top, vitals, main, this.footer);

    app.onControls(() => this.syncControls());
    app.onMonth(() => this.syncVitals());
    app.onReset(() => { this.timelineSpan = 20; this.syncVitals(); this.buildTimeline(); });
    this.syncControls();
    this.syncVitals();
    this.buildTimeline();
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        app.togglePause();
      }
    });
  }

  private buildPanel(): void {
    const app = this.app;
    const scen = el("section", "panel-section");
    scen.innerHTML = `<h2>Scenario</h2>`;
    const list = el("div", "scenario-list");
    for (const s of SCENARIOS) {
      const b = el("button", "scenario");
      b.dataset.id = s.id;
      b.innerHTML = `<span>${s.name}</span>${s.speculative ? `<em title="Far beyond any effect measured so far: an exploration, not a forecast">speculative</em>` : ""}`;
      b.addEventListener("click", () => app.chooseScenario(s.id));
      this.scenarioButtons.set(s.id, b);
      list.append(b);
    }
    scen.append(list, el("p", "scenario-blurb"));
    this.panel.append(scen);

    for (const group of ["Automation", "Economy", "Policy"]) {
      const section = el("section", "panel-section");
      section.innerHTML = `<h2>${group}</h2>`;
      for (const def of SLIDERS.filter((s) => s.group === group)) {
        const row = el("div", "slider");
        row.dataset.key = def.key;
        const head = el("div", "slider-head");
        const name = el("label", "slider-name", def.label);
        name.htmlFor = `ctl-${def.key}`;
        const q = el("button", "help-dot", "?");
        q.setAttribute("aria-label", `About ${def.label}`);
        const tip = el("div", "slider-help", def.help);
        tip.hidden = true;
        q.addEventListener("click", () => { tip.hidden = !tip.hidden; });
        const value = el("div", "slider-value");
        head.append(name, q, value);
        const input = el("input");
        input.type = "range";
        input.id = `ctl-${def.key}`;
        input.min = String(def.min);
        input.max = String(def.max);
        input.step = String(def.step);
        input.addEventListener("input", () => {
          const v = def.toValue(Number(input.value));
          app.setControl(def.key, v);
        });
        row.append(head, input, tip);
        section.append(row);
        this.sliderEls.set(def.key, { input, value, def });
      }
      this.panel.append(section);
    }
  }

  private syncControls(): void {
    const app = this.app;
    this.playBtn.innerHTML = app.paused ? ICON_PLAY : ICON_PAUSE;
    this.playBtn.classList.toggle("is-paused", app.paused);
    this.speedEl.value = app.speed.id;
    for (const [id, b] of this.scenarioButtons) b.classList.toggle("active", !app.custom && app.scenario.id === id);
    this.scenarioBlurb.textContent = app.custom ? "Your own settings. Sliders take effect at once. Restart keeps them and runs from the beginning." : app.scenario.blurb;
    for (const { input, value, def } of this.sliderEls.values()) {
      const v = app.controls[def.key];
      input.value = String(def.fromValue(v));
      value.textContent = def.show(v);
      const percent = ((Number(input.value) - def.min) / (def.max - def.min)) * 100;
      input.style.setProperty("--fill", `${percent}%`);
    }
    if (app.custom !== this.timelineCustom) {
      this.timelineCustom = app.custom;
      this.buildTimeline();
    }
    this.markTimeline();
  }

  private syncVitals(): void {
    const h = this.app.stats;
    const g = this.app.ghost.history.at(-1);
    const set = (id: string, value: string, delta = "", tone = "") => {
      const v = this.vitals.get(id)!;
      v.value.textContent = value;
      v.delta.textContent = delta;
      v.delta.dataset.tone = tone;
    };
    if (!h || !g) {
      for (const id of this.vitals.keys()) set(id, "–", " ");
      return;
    }
    const points = (a: number, b: number) => {
      const d = (a - b) * 100;
      return `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} pts vs no AI`;
    };
    const relative = (a: number, b: number) => {
      const d = b !== 0 ? (a / b - 1) * 100 : 0;
      return `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(0)}% vs no AI`;
    };
    const toneUp = (a: number, b: number, bad = true) => (Math.abs(a - b) < 1e-3 * Math.abs(b) ? "" : (a > b) === bad ? "bad" : "good");
    set("unemployment", pct(h.unemploymentRate), points(h.unemploymentRate, g.unemploymentRate), toneUp(h.unemploymentRate, g.unemploymentRate));
    set("jobs", num(h.employed), `of ${num(h.workforce)} in workforce`);
    set("savings", kr(h.savingsMedian, 0), relative(h.savingsMedian, g.savingsMedian), toneUp(h.savingsMedian, g.savingsMedian, false));
    set("revenue", `${kr(h.revenue)} /mo`, relative(h.revenue, g.revenue), toneUp(h.revenue, g.revenue, false));
    set("margin", pct(h.profitMargin), points(h.profitMargin, g.profitMargin));
    set("profitworker", `${kr(h.profitPerWorker, 0)} /mo`, relative(h.profitPerWorker, g.profitPerWorker));
    set("support", num(h.onInsurance + h.onAssistance), `${h.onInsurance} insurance, ${h.onAssistance} assistance`);
    set("balance", `${kr(h.budgetBalance)} /mo`, `${pct(h.budgetBalance / Math.max(1, h.gdpNominal))} of GDP`, h.budgetBalance < 0 ? "bad" : "good");
  }

  addTab(tab: Tab): void {
    this.tabs.push(tab);
    const b = el("button", "tab", tab.label);
    b.setAttribute("role", "tab");
    b.dataset.tab = tab.id;
    b.addEventListener("click", () => this.showTab(tab.id));
    this.tabBar.append(b);
    this.tabButtons.set(tab.id, b);
    tab.el.classList.add("tab-page");
    tab.el.hidden = true;
    this.body.append(tab.el);
  }

  showTab(id: string): void {
    const next = this.tabs.find((t) => t.id === id);
    if (!next || next === this.active) return;
    if (this.active) {
      this.active.setActive(false);
      this.active.el.hidden = true;
    }
    this.active = next;
    next.el.hidden = false;
    next.setActive(true);
    for (const [tid, b] of this.tabButtons) {
      b.classList.toggle("active", tid === id);
      b.setAttribute("aria-selected", String(tid === id));
    }
  }

  get activeTab(): string {
    return this.active?.id ?? "";
  }

  frame(seconds: number): void {
    const app = this.app;
    this.dateEl.textContent = dateLong(app.date);
    const years = app.economy.day / 365.25;
    this.elapsedEl.textContent = years < 1 ? `Month ${Math.floor(app.economy.day / 30.4) + 1}` : `Year ${Math.floor(years) + 1}`;
    this.moveTimeline();
    this.active?.frame(seconds);
  }

  // ------------------------------------------------------------------ timeline

  private timelineSpan = 20;
  private timelineCustom = false;

  private buildTimeline(): void {
    this.timeline.innerHTML = "";
    const track = el("div", "timeline-track");
    const progress = el("div", "timeline-progress");
    const head = el("div", "timeline-head");
    track.append(progress, head);
    const tickStep = this.timelineSpan <= 30 ? 5 : this.timelineSpan <= 60 ? 10 : this.timelineSpan <= 120 ? 20 : 50;
    for (let y = 0; y <= this.timelineSpan; y += tickStep) {
      const tick = el("div", "timeline-tick", y === 0 ? "Start" : `${y} y`);
      tick.style.left = `${(y / this.timelineSpan) * 100}%`;
      track.append(tick);
    }
    for (const stage of this.app.stages) {
      if (stage.year > this.timelineSpan) continue;
      const m = el("div", "timeline-stage");
      m.dataset.year = String(stage.year);
      m.classList.toggle("is-robot", stage.label.startsWith("Robots"));
      m.style.left = `${(stage.year / this.timelineSpan) * 100}%`;
      m.innerHTML = this.timelineSpan > 30 ? `<i title="${stage.label}"></i>` : `<i title="${stage.label}"></i><span>${stage.label}</span>`;
      track.append(m);
    }
    this.timeline.append(track);
    this.markTimeline();
  }

  private markTimeline(): void {
    const year = this.app.economy?.day / 365.25;
    this.timeline?.querySelectorAll<HTMLElement>(".timeline-stage").forEach((m) => {
      m.classList.toggle("done", Number(m.dataset.year) <= year);
    });
  }

  private moveTimeline(): void {
    const year = this.app.economy.day / 365.25;
    if (year > this.timelineSpan) {
      this.timelineSpan = Math.ceil(year / 10) * 10 + 10;
      this.buildTimeline();
    }
    const p = Math.min(100, (year / this.timelineSpan) * 100);
    const progress = this.timeline.querySelector<HTMLElement>(".timeline-progress");
    const head = this.timeline.querySelector<HTMLElement>(".timeline-head");
    if (progress) progress.style.width = `${p}%`;
    if (head) head.style.left = `${p}%`;
    this.markTimeline();
  }
}
