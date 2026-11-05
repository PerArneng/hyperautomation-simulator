import { Economy } from "./sim/economy.ts";
import { DEFAULT_CONTROLS, SIM_START } from "./sim/params.ts";
import type { Controls } from "./sim/params.ts";
import type { MonthStats, SimEvent } from "./sim/types.ts";

export interface Speed {
  id: string;
  label: string;
  hint: string;
  daysPerSecond: number;
}

export const SPEEDS: Speed[] = [
  { id: "slow", label: "1 day = 45 s", hint: "Watch one full day at the pace people walk: morning commute, work, shopping, evening", daysPerSecond: 1 / 45 },
  { id: "day", label: "1 day / s", hint: "Each second is one day", daysPerSecond: 1 },
  { id: "week", label: "1 week / s", hint: "Each second is one week", daysPerSecond: 7 },
  { id: "month", label: "1 month / s", hint: "Each second is one month", daysPerSecond: 30.4 },
  { id: "quarter", label: "1 quarter / s", hint: "Each second is three months", daysPerSecond: 91.3 },
  { id: "year", label: "1 year / s", hint: "Each second is one year", daysPerSecond: 365.25 },
];

export interface Stage {
  /** Years after the start. */
  year: number;
  label: string;
  set: Partial<Controls>;
}

export interface Scenario {
  id: string;
  name: string;
  blurb: string;
  speculative?: boolean;
  controls: Partial<Controls>;
  stages: Stage[];
}

const multiple = (m: number) => 1 - 1 / m;

const HYPER_STAGES: Stage[] = [
  { year: 1, label: "AI ×1.25", set: { aiLevel: multiple(1.25) } },
  { year: 2, label: "Robots 15%", set: { robotLevel: 0.15 } },
  { year: 3, label: "AI ×2", set: { aiLevel: multiple(2) } },
  { year: 5, label: "Robots 40%", set: { robotLevel: 0.4 } },
  { year: 6, label: "AI ×4", set: { aiLevel: multiple(4) } },
  { year: 9, label: "Robots 70%", set: { robotLevel: 0.7 } },
  { year: 10, label: "AI ×8", set: { aiLevel: multiple(8) } },
];

export const SCENARIOS: Scenario[] = [
  {
    id: "none", name: "No AI", blurb: "The reference economy: ordinary growth and turnover, no new automation.",
    controls: {}, stages: [],
  },
  {
    id: "measured", name: "Measured so far", blurb: "AI at the level measured in today's workplace studies: about 7% of task time saved, few robots.",
    controls: { aiLevel: 0.07, robotLevel: 0.03 }, stages: [],
  },
  {
    id: "strong", name: "Strong adoption", blurb: "Gains like the best field experiments, spreading across the whole economy.",
    controls: { aiLevel: 0.15, robotLevel: 0.1 },
    stages: [{ year: 4, label: "AI ×1.33", set: { aiLevel: 0.25 } }, { year: 6, label: "Robots 20%", set: { robotLevel: 0.2 } }],
  },
  {
    id: "hyper", name: "Hyperautomation", blurb: "Task efficiency multiplies in stages, far beyond anything measured so far.", speculative: true,
    controls: {}, stages: HYPER_STAGES,
  },
  {
    id: "hyper-policy", name: "Hyper + dividend", blurb: "The same technology, with automation taxed and paid back to every adult.", speculative: true,
    controls: { automationTax: 0.4, citizenDividend: 3000, support: 1.2 }, stages: HYPER_STAGES,
  },
  {
    id: "hyper-open", name: "Hyper + new demand", blurb: "The same technology, with people wanting far more and new kinds of work appearing fast.", speculative: true,
    controls: { demandResponse: 1, newJobs: 1 }, stages: HYPER_STAGES,
  },
];

export type Listener = () => void;

/** Owns the simulated country, its no-AI twin and the clock. Knows nothing about the page. */
export class App {
  economy!: Economy;
  ghost!: Economy;
  seed: number;
  speed: Speed = SPEEDS[2];
  paused = false;
  scenario: Scenario = SCENARIOS[3];
  custom = false;
  /** Whole days stepped so far, plus a fraction used for smooth animation. */
  dayFraction = 0;
  /** Set each reset; tabs watch it to rebuild. */
  generation = 0;
  private carry = 0;
  /** What the user has set by hand. It survives a restart, and goes when they pick a scenario. */
  private overrides: Partial<Controls> = {};
  private nextStage = 0;
  private readonly listeners = new Set<Listener>();
  private readonly monthListeners = new Set<Listener>();
  private readonly resetListeners = new Set<Listener>();
  private readonly controlListeners = new Set<Listener>();
  private readonly eventListeners = new Set<(events: SimEvent[]) => void>();
  private lastHistory = 0;

  constructor(seed = 2026) {
    this.seed = seed;
    this.reset();
  }

  get stats(): MonthStats | undefined {
    return this.economy.history.at(-1);
  }

  get controls(): Controls {
    return this.economy.controls;
  }

  get date(): number {
    return SIM_START + (this.economy.day + this.dayFraction) * 86400000;
  }

  get stages(): Stage[] {
    return this.custom ? [] : this.scenario.stages;
  }

  onTick(fn: Listener): void { this.listeners.add(fn); }
  onMonth(fn: Listener): void { this.monthListeners.add(fn); }
  onReset(fn: Listener): void { this.resetListeners.add(fn); }
  onControls(fn: Listener): void { this.controlListeners.add(fn); }
  onEvents(fn: (events: SimEvent[]) => void): void { this.eventListeners.add(fn); }

  reset(seed = this.seed): void {
    this.seed = seed;
    const start = { ...DEFAULT_CONTROLS, ...this.scenario.controls, ...this.overrides };
    this.economy = new Economy(seed, start);
    this.ghost = new Economy(seed, { ...start, aiLevel: 0, robotLevel: 0, automationTax: 0 });
    while (this.economy.history.length < 1) {
      this.economy.step();
      this.ghost.step();
    }
    this.economy.events = [];
    this.ghost.events = [];
    this.carry = 0;
    this.dayFraction = 0;
    this.nextStage = 0;
    this.lastHistory = this.economy.history.length;
    this.generation++;
    for (const fn of this.resetListeners) fn();
    for (const fn of this.controlListeners) fn();
  }

  chooseScenario(id: string): void {
    const found = SCENARIOS.find((s) => s.id === id);
    if (!found) return;
    this.scenario = found;
    this.custom = false;
    this.overrides = {};
    this.reset();
  }

  /** A hand-moved slider ends any scheduled roll-out: the user is now in charge. */
  setControl<K extends keyof Controls>(key: K, value: Controls[K]): void {
    this.economy.controls[key] = value;
    this.overrides[key] = value;
    if (key !== "aiLevel" && key !== "robotLevel" && key !== "automationTax") {
      this.ghost.controls[key] = value;
    }
    if (key === "aiLevel" || key === "robotLevel") this.custom = true;
    for (const fn of this.controlListeners) fn();
  }

  setSpeed(id: string): void {
    const found = SPEEDS.find((s) => s.id === id);
    if (found) this.speed = found;
    for (const fn of this.controlListeners) fn();
  }

  togglePause(): void {
    this.setPaused(!this.paused);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    for (const fn of this.controlListeners) fn();
  }

  /** Advance by real elapsed seconds. */
  advance(seconds: number): void {
    if (!this.paused) {
      this.carry += seconds * this.speed.daysPerSecond;
      // After a long stall (hidden tab) do not try to catch up all at once.
      if (this.carry > 40) this.carry = 40;
      let steps = 0;
      while (this.carry >= 1 && steps < 40) {
        this.stepDay();
        this.carry -= 1;
        steps++;
      }
      this.dayFraction = this.carry;
    }
    for (const fn of this.listeners) fn();
  }

  stepDay(): void {
    this.applyStages();
    this.economy.step();
    this.ghost.step();
    this.ghost.events.length = 0;
    if (this.economy.events.length) {
      const events = this.economy.events;
      this.economy.events = [];
      for (const fn of this.eventListeners) fn(events);
    }
    if (this.economy.history.length !== this.lastHistory) {
      this.lastHistory = this.economy.history.length;
      for (const fn of this.monthListeners) fn();
    }
  }

  private applyStages(): void {
    if (this.custom) return;
    const stages = this.scenario.stages;
    let changed = false;
    while (this.nextStage < stages.length && this.economy.day >= stages[this.nextStage].year * 365.25) {
      Object.assign(this.economy.controls, stages[this.nextStage].set);
      this.nextStage++;
      changed = true;
    }
    if (changed) for (const fn of this.controlListeners) fn();
  }
}
