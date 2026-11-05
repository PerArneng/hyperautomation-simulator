import type { App } from "../app.ts";
import { el } from "./format.ts";
import type { Shell } from "./shell.ts";

interface Step {
  title: string;
  body: string;
  tab: string;
  /** Prepare the world for this step. */
  enter?: (ctx: Context) => void;
  /** Dashboard chart to scroll to and highlight. */
  chart?: string;
  selector?: string;
}

interface Context {
  app: App;
  /** Run until this many years after the start. */
  runTo(years: number): void;
  setDayTime(t: number): void;
}

const STEPS: Step[] = [
  {
    title: "Meet Novaria", tab: "town",
    body: "A fictive country with about 800 people and 26 employers. Half the workers do knowledge work, the rest do manual work. Green figures have a job, red ones do not, and grey ones have retired.",
    enter: ({ app, setDayTime }) => { app.chooseScenario("none"); app.setSpeed("day"); setDayTime(0.27); },
  },
  {
    title: "Things made, things bought", tab: "town",
    body: "Blue boxes are goods and services. They fly from companies to shops and the port. People carry them home. A person's spending depends on income and savings, so when someone loses a job they stop going to work and shop far less.",
    enter: ({ setDayTime }) => setDayTime(0.42),
  },
  {
    title: "A healthy baseline", tab: "dashboard", chart: "unemployment",
    body: "Without new automation, some people are always between jobs, others retire and others enter. Companies make money, the state's budget roughly balances, and jobs can be found.",
    enter: ({ runTo }) => runTo(4),
  },
  {
    title: "Now raise task efficiency", tab: "town",
    body: "Same country, new technology. AI software multiplies the efficiency of knowledge tasks in stages. Separately, robots take over manual tasks. See the diamonds on the timeline below: this scenario goes far beyond anything measured so far, so read it as an exploration, not a forecast.",
    enter: ({ app, runTo }) => { app.chooseScenario("hyper"); app.setSpeed("week"); runTo(6); },
  },
  {
    title: "Jobs first, then spending", tab: "dashboard", chart: "unemployment",
    body: "Firms need fewer people per unit, so they freeze hiring and then cut staff. Knowledge workers go first because software spreads faster than robots. The grey line is the same country without the new technology.",
    enter: ({ runTo }) => runTo(11),
  },
  {
    title: "More can be made than sold", tab: "dashboard", chart: "made-sold",
    body: "Capacity climbs. But wages are also how customers get their money, and people out of work buy much less. Firms match staff to what they can sell, which removes more wages. That is the feedback loop.",
  },
  {
    title: "Each firm wins, all firms squeezed", tab: "dashboard", chart: "profit-worker",
    body: "Every company gains from cutting its own wage bill, so profit per worker soars. But one company's wage bill is another's customers. Profit goes to a small group who save most of it, so it does not all return as demand.",
  },
  {
    title: "The state in the middle", tab: "government",
    body: "Tax income is built on wages and spending, and it weakens just as support costs rise. Follow the money in the flow chart below. Support keeps people buying, and so protects other people's jobs. That is why the state often runs a deficit in a slump.",
    enter: ({ runTo }) => runTo(13),
  },
  {
    title: "People, not just numbers", tab: "people",
    body: "Each dot is one person. Red dots are out of work. Pick someone on the right and read what happened to them: when they lost their job, how long insurance lasted and how their savings went.",
  },
  {
    title: "It is not destiny", tab: "dashboard", chart: "unemployment",
    body: "Same technology, different assumptions: people want much more when things get cheaper, competition passes savings into prices, and new kinds of work appear quickly. Jobs fare far better. Nobody knows how much of this will happen, so these sliders are yours.",
    enter: ({ app, runTo }) => { app.chooseScenario("hyper-open"); runTo(14); },
  },
  {
    title: "Your turn", tab: "town",
    body: "Pick a scenario on the left or move the sliders: AI software, robots, how much people want, new work, and policy such as unemployment support, an automation tax and a citizen dividend. Every graph has a ? with an explanation.",
    enter: ({ app }) => { app.chooseScenario("hyper"); app.setSpeed("week"); },
  },
];

/** A short guided walk through the causal chain, then the sandbox. */
export class StoryGuide {
  private readonly app: App;
  private readonly shell: Shell;
  private readonly panel = el("div", "story");
  private readonly intro = el("div", "intro");
  private readonly setDayTime: (t: number) => void;
  private index = -1;
  private highlighted: HTMLElement | null = null;

  constructor(app: App, shell: Shell, setDayTime: (t: number) => void) {
    this.app = app;
    this.shell = shell;
    this.setDayTime = setDayTime;
    this.panel.hidden = true;
    this.panel.setAttribute("role", "dialog");
    this.panel.setAttribute("aria-label", "Guided story");
    this.buildIntro();
    shell.root.append(this.panel, this.intro);
    this.intro.hidden = true;
    const button = el("button", "ghost-btn story-open", "Guided story");
    button.addEventListener("click", () => this.start());
    shell.root.querySelector(".clock")?.prepend(button);
    window.addEventListener("keydown", (e) => {
      if (this.index < 0) return;
      if (e.key === "ArrowRight") this.go(this.index + 1);
      if (e.key === "ArrowLeft" && this.index > 0) this.go(this.index - 1);
      if (e.key === "Escape") this.close();
    });
  }

  private buildIntro(): void {
    this.intro.setAttribute("role", "dialog");
    this.intro.setAttribute("aria-label", "Welcome");
    this.intro.innerHTML = `<div class="intro-card">
      <div class="intro-kicker">Effects of AI Hyperautomation on Macro Economy</div>
      <h1>What happens to a country when work gets many times faster?</h1>
      <p>Novaria is a simulated small country. Each person has a job or not, a home, savings and bills; each company makes things, sets prices and hires or fires. Every krona has a payer and a receiver.</p>
      <p class="intro-note">Numbers are scaled from Swedish data and the research in this project. It is built for exploring mechanisms, not forecasting.</p>
      <div class="intro-actions"><button class="primary-btn" data-go>Take the 2-minute story</button><button class="ghost-btn" data-skip>Go straight to the simulation</button></div>
    </div>`;
    this.intro.querySelector("[data-go]")!.addEventListener("click", () => { this.intro.hidden = true; this.start(); });
    this.intro.querySelector("[data-skip]")!.addEventListener("click", () => { this.intro.hidden = true; this.app.setPaused(false); });
  }

  showIntro(): void {
    this.intro.hidden = false;
  }

  start(): void {
    this.intro.hidden = true;
    this.go(0);
  }

  get stepCount(): number {
    return STEPS.length;
  }

  get currentStep(): number {
    return this.index;
  }

  go(index: number): void {
    if (index >= STEPS.length) { this.close(); return; }
    const back = index < this.index;
    this.index = index;
    const step = STEPS[index];
    const app = this.app;
    this.shell.showTab(step.tab);
    const context: Context = {
      app,
      setDayTime: this.setDayTime,
      runTo: (years) => { while (app.economy.day < years * 365.25) app.stepDay(); },
    };
    // Going back replays the story from the start, so the world matches the step.
    if (back) for (let i = 0; i < index; i++) STEPS[i].enter?.(context);
    step.enter?.(context);
    app.setPaused(false);
    this.highlight(step);
    this.panel.hidden = false;
    this.panel.innerHTML = `<div class="story-step">${index + 1} of ${STEPS.length}</div><h2 class="story-title">${step.title}</h2><p>${step.body}</p>
      <div class="story-bar"><div class="story-dots">${STEPS.map((_s, i) => `<i class="${i === index ? "on" : i < index ? "past" : ""}"></i>`).join("")}</div>
      <button class="ghost-btn" data-close>Exit</button>${index > 0 ? `<button class="ghost-btn" data-back>Back</button>` : ""}<button class="primary-btn" data-next>${index === STEPS.length - 1 ? "Start exploring" : "Next"}</button></div>`;
    this.panel.querySelector("[data-next]")!.addEventListener("click", () => this.go(index + 1));
    this.panel.querySelector("[data-back]")?.addEventListener("click", () => this.go(index - 1));
    this.panel.querySelector("[data-close]")!.addEventListener("click", () => this.close());
  }

  private highlight(step: Step): void {
    this.highlighted?.classList.remove("story-highlight");
    this.highlighted = null;
    if (!step.chart) return;
    const target = this.shell.root.querySelector<HTMLElement>(`.chart[data-chart="${step.chart}"]`);
    if (target) {
      target.classList.add("story-highlight");
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      this.highlighted = target;
    }
  }

  close(): void {
    this.index = -1;
    this.panel.hidden = true;
    this.highlighted?.classList.remove("story-highlight");
    this.highlighted = null;
  }
}
