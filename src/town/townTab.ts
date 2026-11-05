import * as THREE from "three";
import type { App } from "../app.ts";
import { SECTORS } from "../sim/params.ts";
import { EMPLOYED, RETIRED } from "../sim/types.ts";
import type { Firm, Person } from "../sim/types.ts";
import { STATUS, SECTOR_COLORS } from "../ui/colors.ts";
import { el, escapeHtml, kr, num, pct } from "../ui/format.ts";
import type { Tab } from "../ui/shell.ts";
import { Crowd } from "./crowd.ts";
import { TownLayout } from "./layout.ts";
import { TownScene } from "./scene.ts";
import { TownWorld } from "./world.ts";

type Picked =
  | { kind: "person"; id: number; name?: string }
  | { kind: "firm"; firm: Firm }
  | { kind: "place"; place: "hall" | "bank" | "jobs" | "port" | "store" }
  | { kind: "home"; homeId: number };

const LEGEND = `
  <div class="legend-title">In the town</div>
  <div class="legend-row"><i class="dot" style="background:${STATUS.employed}"></i>Employed</div>
  <div class="legend-row"><i class="dot" style="background:${STATUS.unemployed}"></i>Unemployed</div>
  <div class="legend-row"><i class="dot" style="background:${STATUS.retired}"></i>Retired</div>
  <div class="legend-row"><i class="dot hat"></i>Yellow hard hat: manual worker</div>
  <div class="legend-row"><i class="sq" style="background:#3f9dff"></i>Goods and services</div>
  <div class="legend-row"><i class="sq" style="background:#ff9a4d"></i>Robot at a company</div>
  <div class="legend-row"><i class="bar" style="background:#a78bfa"></i>Violet glow: AI software in use</div>
  <div class="legend-row"><i class="sq" style="background:#d8434f"></i>Red roof: behind on housing</div>
`;

export class TownTab implements Tab {
  readonly id = "town";
  readonly label = "Town";
  readonly el = el("div", "town");
  private readonly app: App;
  private ts: TownScene | null = null;
  private world: TownWorld | null = null;
  private crowd: Crowd | null = null;
  private layout: TownLayout | null = null;
  private readonly tooltip = el("div", "town-tip");
  private readonly card = el("aside", "inspector");
  private readonly canvasHost = el("div", "town-canvas");
  private readonly clockEl = el("div", "town-time");
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private lastPick = 0;
  private selected: Picked | null = null;
  private following = false;
  private cardTimer = 0;
  private fpsTime = 0;
  private fpsFrames = 0;
  private lowFor = 0;
  /** Set by the app, so a person's card can open their full story. */
  openStory: (id: number) => void = () => {};
  openCompany: (id: number) => void = () => {};
  private lockedQuality = new URLSearchParams(location.search).has("quality");
  lastFps = 0;

  constructor(app: App) {
    this.app = app;
    const legend = el("div", "legend", LEGEND);
    const toggles = el("div", "town-tools");
    const moneyLabel = el("label", "toggle", `<input type="checkbox" checked> Money flows`);
    moneyLabel.title = "Gold: wages. Orange: taxes. Turquoise: unemployment support.";
    moneyLabel.querySelector("input")!.addEventListener("change", (e) => {
      if (this.crowd) this.crowd.showMoney = (e.target as HTMLInputElement).checked;
    });
    const fit = el("button", "ghost-btn", "Reset view");
    fit.addEventListener("click", () => this.resetView());
    toggles.append(moneyLabel, fit);
    this.card.hidden = true;
    this.tooltip.hidden = true;
    this.el.append(this.canvasHost, legend, toggles, this.clockEl, this.tooltip, this.card);

    app.onReset(() => this.rebind());
    app.onMonth(() => {
      if (!this.ts) return;
      this.world!.syncHomes();
      this.world!.syncFirms();
      this.crowd!.syncRobots();
      if (!this.el.hidden) this.crowd!.payday(app.speed.daysPerSecond);
    });
    app.onEvents((events) => { if (this.crowd && !this.el.hidden) this.crowd.onEvents(events); });

    this.canvasHost.addEventListener("pointermove", (e) => this.onPointerMove(e));
    this.canvasHost.addEventListener("pointerleave", () => { this.tooltip.hidden = true; });
    let downX = 0;
    let downY = 0;
    this.canvasHost.addEventListener("pointerdown", (e) => { downX = e.clientX; downY = e.clientY; });
    this.canvasHost.addEventListener("pointerup", (e) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) < 5) this.onClick(e);
    });
  }

  private init(): void {
    if (this.ts) return;
    try {
      this.layout = new TownLayout();
      this.ts = new TownScene(this.canvasHost, this.layout);
      this.world = new TownWorld(this.ts);
      this.crowd = new Crowd(this.ts.scene, this.world, this.layout, this.app.economy.persons.length);
      this.rebind();
    } catch (error) {
      this.canvasHost.innerHTML = `<div class="placeholder">The 3D town needs WebGL, which this browser could not start. The other tabs work without it.</div>`;
      console.warn("WebGL unavailable", error);
      this.ts = null;
    }
  }

  private rebind(): void {
    if (!this.world || !this.crowd) return;
    this.world.bind(this.app.economy);
    this.crowd.bind(this.app.economy);
    this.crowd.select(-1);
    this.selected = null;
    this.following = false;
    this.card.hidden = true;
  }

  setActive(active: boolean): void {
    if (active) this.init();
    if (active && this.ts) {
      this.ts.resize();
      this.world!.syncHomes();
      this.world!.syncFirms();
      this.crowd!.syncRobots();
    }
  }

  resetView(): void {
    if (!this.ts) return;
    this.following = false;
    this.ts.camera.position.set(118, 112, 146);
    this.ts.controls.target.set(6, 0, 4);
  }

  frame(seconds: number): void {
    if (!this.ts || !this.crowd || !this.world) return;
    const animate = this.app.paused ? 0 : seconds;
    this.crowd.frame(animate);
    this.ts.setDayTime(this.crowd.dayTime);
    this.world.frame(animate, this.crowd.dayTime * 45 + Math.floor(this.app.economy.day / 4));
    if (this.following && this.selected?.kind === "person") {
      const p = this.crowd.positionOf(this.selected.id);
      const c = this.ts.controls;
      const dx = (p.x - c.target.x) * Math.min(1, seconds * 3);
      const dz = (p.z - c.target.z) * Math.min(1, seconds * 3);
      c.target.x += dx;
      c.target.z += dz;
      this.ts.camera.position.x += dx;
      this.ts.camera.position.z += dz;
    }
    this.ts.render();
    this.updateClock();
    this.cardTimer -= seconds;
    if (this.cardTimer <= 0 && this.selected) {
      this.cardTimer = 0.3;
      this.renderCard();
    }
    this.watchFrameRate(seconds);
  }

  private updateClock(): void {
    const t = this.crowd!.dayTime;
    const hour = Math.floor(t * 24);
    const minute = Math.floor((t * 24 * 60) % 60);
    const phase = hour < 6 ? "Night" : hour < 9 ? "Morning rush" : hour < 16 ? "Working hours" : hour < 19 ? "Evening rush" : hour < 22 ? "Evening" : "Night";
    this.clockEl.textContent = `${String(hour).padStart(2, "0")}:${String(minute - (minute % 10)).padStart(2, "0")} · ${phase}`;
    this.clockEl.title = "The figures live through one typical day at a walking pace, whatever the calendar speed, so motion stays smooth.";
  }

  private watchFrameRate(seconds: number): void {
    this.fpsTime += seconds;
    this.fpsFrames++;
    if (this.fpsTime < 2) return;
    this.lastFps = this.fpsFrames / this.fpsTime;
    this.fpsTime = 0;
    this.fpsFrames = 0;
    if (this.lockedQuality) return;
    this.lowFor = this.lastFps < 26 ? this.lowFor + 1 : 0;
    if (this.lowFor >= 2 && this.ts) {
      this.ts.setQuality(this.ts.quality >= 1 ? 0.5 : 0);
      this.lowFor = 0;
    }
  }

  // ------------------------------------------------------------------ picking

  private pick(e: PointerEvent | MouseEvent): Picked | null {
    if (!this.ts || !this.world || !this.crowd) return null;
    const rect = this.canvasHost.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.ts.camera);
    const w = this.world;
    const crowd = this.crowd;
    // People first: they are small, so give them priority over what is behind them.
    const people = this.raycaster.intersectObject(crowd.bodies, false).filter((h) => h.instanceId !== undefined && this.isVisible(h.instanceId));
    if (people.length) return { kind: "person", id: people[0].instanceId!, name: this.app.economy.persons[people[0].instanceId!].name };
    const hits = this.raycaster.intersectObjects([w.offices, w.factories, w.stores, w.houses, w.apartments, w.townHallMesh, w.bankMesh, w.jobCentreMesh, w.portMesh], false);
    const hit = hits[0];
    if (!hit) return null;
    if (hit.object === w.offices) {
      const site = w.officeSites[hit.instanceId!];
      return site ? { kind: "firm", firm: site.firm } : null;
    }
    if (hit.object === w.factories) {
      const site = w.factorySites[hit.instanceId!];
      return site ? { kind: "firm", firm: site.firm } : null;
    }
    if (hit.object === w.stores) return { kind: "place", place: "store" };
    if (hit.object === w.townHallMesh) return { kind: "place", place: "hall" };
    if (hit.object === w.bankMesh) return { kind: "place", place: "bank" };
    if (hit.object === w.jobCentreMesh) return { kind: "place", place: "jobs" };
    if (hit.object === w.portMesh) return { kind: "place", place: "port" };
    if (hit.object === w.houses) {
      for (const [homeId, entry] of w.homeLots) if (entry.kind === "house" && entry.index === hit.instanceId) return { kind: "home", homeId };
    }
    return null;
  }

  private isVisible(id: number): boolean {
    const crowd = this.crowd!;
    return crowd.debugState(id) !== 0 && crowd.debugState(id) !== 2 && crowd.debugState(id) !== 3;
  }

  private onPointerMove(e: PointerEvent): void {
    const now = performance.now();
    if (now - this.lastPick < 70 || e.buttons) return;
    this.lastPick = now;
    const picked = this.pick(e);
    if (!picked) {
      this.tooltip.hidden = true;
      this.canvasHost.style.cursor = "";
      return;
    }
    this.canvasHost.style.cursor = "pointer";
    this.tooltip.hidden = false;
    this.tooltip.innerHTML = this.describe(picked);
    const rect = this.el.getBoundingClientRect();
    this.tooltip.style.left = `${Math.min(rect.width - 240, e.clientX - rect.left + 14)}px`;
    this.tooltip.style.top = `${Math.max(4, e.clientY - rect.top + 12)}px`;
  }

  private onClick(e: PointerEvent): void {
    const picked = this.pick(e);
    this.selected = picked;
    this.following = false;
    this.crowd?.select(picked?.kind === "person" ? picked.id : -1);
    this.card.hidden = !picked;
    if (picked) this.renderCard();
  }

  /** Open a person's card from elsewhere, for example the People tab. */
  focusPerson(id: number): void {
    this.init();
    this.selected = { kind: "person", id, name: this.app.economy.persons[id].name };
    this.crowd?.select(id);
    this.card.hidden = false;
    this.following = true;
    this.renderCard();
    if (this.ts) {
      const c = this.ts.controls;
      const p = this.crowd!.positionOf(id);
      const off = this.ts.camera.position.clone().sub(c.target).setLength(46);
      c.target.set(p.x, 0, p.z);
      this.ts.camera.position.copy(c.target).add(off);
    }
  }

  private describe(p: Picked): string {
    const e = this.app.economy;
    if (p.kind === "person") {
      const person = e.persons[p.id];
      return `<b>${escapeHtml(person.name)}</b>, ${Math.floor(person.age)}<br>${this.statusLine(person)}<br>Savings ${kr(person.cash, 0)}`;
    }
    if (p.kind === "firm") {
      const f = p.firm;
      return `<b>${escapeHtml(f.name)}</b><br>${SECTORS[f.sector].name}<br>${f.alive ? `${f.employees.length} jobs` : "Closed"}`;
    }
    if (p.kind === "home") return "A family home";
    return { hall: "<b>Town hall</b><br>Government of Novaria", bank: "<b>Bank</b><br>Deposits and loans", jobs: "<b>Job centre</b><br>Where the unemployed look for work", port: "<b>Port</b><br>Exports and imports", store: "<b>Shops</b><br>People buy goods and services here" }[p.place];
  }

  private statusLine(p: Person): string {
    const e = this.app.economy;
    if (p.status === EMPLOYED) return `${p.knowledge ? "Knowledge worker" : "Manual worker"} at ${escapeHtml(e.firms[p.firmId]?.name ?? "")}`;
    if (p.status === RETIRED) return "Retired";
    return `Unemployed for ${p.monthsUnemployed} month${p.monthsUnemployed === 1 ? "" : "s"}`;
  }

  private renderCard(): void {
    const s = this.selected;
    if (!s) return;
    const e = this.app.economy;
    if (s.kind === "person" && s.name && e.persons[s.id].name !== s.name) {
      // Their place in the population has gone to a newcomer: say so rather than switch silently.
      this.card.innerHTML = `<div class="card-title">${escapeHtml(s.name)}</div><div class="card-sub">Has passed away.</div>`;
      this.selected = null;
      this.following = false;
      this.crowd?.select(-1);
      setTimeout(() => { if (!this.selected) this.card.hidden = true; }, 3500);
      return;
    }
    const h = this.app.stats;
    const row = (k: string, v: string) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`;
    const close = `<button class="card-close" aria-label="Close">×</button>`;
    let html = "";
    if (s.kind === "person") {
      const p = e.persons[s.id];
      const status = p.status === EMPLOYED ? "Employed" : p.status === RETIRED ? "Retired" : "Unemployed";
      const color = p.status === EMPLOYED ? STATUS.employed : p.status === RETIRED ? STATUS.retired : STATUS.unemployed;
      html = `${close}<div class="card-title">${escapeHtml(p.name)}</div><div class="card-sub"><span class="pill" style="--c:${color}">${status}</span> Age ${Math.floor(p.age)}, ${p.knowledge ? "knowledge worker" : "manual worker"}</div>
        ${p.status === EMPLOYED ? row("Employer", escapeHtml(e.firms[p.firmId]?.name ?? "")) + row("Pay", `${kr(p.wage, 0)} /mo`) : ""}
        ${row("Income after tax", `${kr(p.netIncome, 0)} /mo`)}
        ${row("Income source", escapeHtml(p.incomeLabel || "–"))}
        ${row("Savings", kr(p.cash, 0))}
        ${row("Spending", `${kr(p.lastSpend || p.monthBudget, 0)} /mo`)}
        ${row("Home", p.housing === "rent" ? `Renting, ${kr(p.housingCost, 0)} /mo` : p.housing === "mortgage" ? `Mortgage ${kr(p.mortgage, 1)}` : "Owns outright")}
        ${p.arrears >= 1 ? row("Behind on housing", `${Math.ceil(p.arrears)} mo`) : ""}
        <div class="card-actions"><button class="ghost-btn" data-act="follow">Follow</button><button class="ghost-btn" data-act="story">Full story</button></div>`;
    } else if (s.kind === "firm") {
      const f = s.firm;
      const sector = SECTORS[f.sector];
      html = `${close}<div class="card-title">${escapeHtml(f.name)}</div><div class="card-sub"><span class="pill" style="--c:${SECTOR_COLORS[sector.key]}">${sector.name}</span>${f.alive ? "" : " Closed"}</div>
        ${row("Jobs", `${f.employees.length} (${f.countK} knowledge, ${f.countM} manual)`)}
        ${f.isPublic ? row("Funded by", "The state budget") : row("Income", `${kr(f.lastRevenue)} /mo`) + row("Profit", `${kr(f.lastProfit)} /mo`) + row("Margin", f.lastRevenue > 0 ? pct(f.lastProfit / f.lastRevenue, 0) : "–") + row("Price", f.price.toFixed(0))}
        ${row("Staff using AI", pct(f.aiAdoption, 0))}
        ${row("Robots", num(f.robots))}
        ${f.isPublic ? "" : `<div class="card-actions"><button class="ghost-btn" data-act="company">Open in Companies</button></div>`}`;
    } else if (s.kind === "place" && h) {
      if (s.place === "hall") html = `${close}<div class="card-title">Town hall</div><div class="card-sub">Government of Novaria</div>${row("Income", `${kr(h.govIncome)} /mo`)}${row("Spending", `${kr(h.govSpending)} /mo`)}${row("Public debt", kr(h.govDebt))}${row("Unemployment support", `${kr(h.supportPaid)} /mo`)}`;
      else if (s.place === "bank") html = `${close}<div class="card-title">Bank</div><div class="card-sub">Deposits and loans</div>${row("Policy rate", pct(h.policyRate))}${row("Loans", kr(h.bankLoans))}${row("Own capital", kr(h.bankEquity))}${row("Loans written off", kr(h.badLoans))}`;
      else if (s.place === "jobs") html = `${close}<div class="card-title">Job centre</div><div class="card-sub">The queue outside grows with unemployment</div>${row("Unemployed", num(h.unemployed))}${row("Open vacancies", num(h.vacancies))}${row("Out of work a year or more", num(h.longTermUnemployed))}${row("Hired last month", num(h.hires))}${row("Laid off last month", num(h.layoffs))}`;
      else if (s.place === "port") html = `${close}<div class="card-title">Port</div><div class="card-sub">Trade with the rest of the world</div>${row("Trade balance", `${kr(h.netExports)} /mo`)}`;
      else html = `${close}<div class="card-title">Shops</div><div class="card-sub">Where blue boxes meet buyers. Unsold stock piles up outside.</div>${row("Household spending", `${kr(h.consumption)} /mo`)}${row("Units sold vs made", `${pct(h.unitsSold / Math.max(1, h.unitsProduced), 0)}`)}`;
    } else if (s.kind === "home") {
      const home = e.homes[s.homeId];
      const owner = e.persons.find((p) => p.homeId === s.homeId);
      html = `${close}<div class="card-title">${home.vacant ? (home.foreclosed ? "Foreclosed house" : "House for sale") : "Family home"}</div>
        ${owner && !home.vacant ? row("Lived in by", escapeHtml(owner.name)) + row("Status", this.statusLine(owner)) : ""}`;
    } else {
      html = close;
    }
    this.card.innerHTML = html;
    this.card.querySelector(".card-close")?.addEventListener("click", () => {
      this.selected = null;
      this.following = false;
      this.card.hidden = true;
      this.crowd?.select(-1);
    });
    this.card.querySelector('[data-act="follow"]')?.addEventListener("click", () => {
      if (this.selected?.kind === "person") this.focusPerson(this.selected.id);
    });
    this.card.querySelector('[data-act="story"]')?.addEventListener("click", () => {
      if (this.selected?.kind === "person") this.openStory(this.selected.id);
    });
    this.card.querySelector('[data-act="company"]')?.addEventListener("click", () => {
      if (this.selected?.kind === "firm") this.openCompany(this.selected.firm.id);
    });
  }

  /** Test hook. */
  setDayTime(t: number): void { this.crowd?.setDayTime(t); }

  /** Test hook. */
  setCamera(x: number, y: number, z: number, tx: number, tz: number): void {
    if (!this.ts) return;
    this.ts.controls.autoRotate = false;
    this.ts.camera.position.set(x, y, z);
    this.ts.controls.target.set(tx, 0, tz);
  }

  /** Test hook: where a person appears in page coordinates. */
  screenOf(id: number): { x: number; y: number; state: number } | null {
    if (!this.ts || !this.crowd) return null;
    const p = this.crowd.positionOf(id);
    const v = new THREE.Vector3(p.x, 1, p.z).project(this.ts.camera);
    const r = this.canvasHost.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, state: this.crowd.debugState(id) };
  }

  /** Test hook. */
  debug() {
    return { census: this.crowd?.census, fps: this.lastFps, sites: this.world?.sites.length, quality: this.ts?.quality };
  }
}
