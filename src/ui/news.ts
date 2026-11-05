import type { App } from "../app.ts";
import type { MonthStats, SimEvent } from "../sim/types.ts";
import { el, escapeHtml, monthYear, pct } from "./format.ts";

interface Item { date: number; text: string; tone: "good" | "bad" | "info" | "tech"; }

const MAX_ITEMS = 80;

/** Headlines: company events and milestones, not every hire. Shown one at a time in the footer. */
export class NewsFeed {
  readonly el = el("div", "news");
  private readonly app: App;
  private readonly line = el("button", "news-line");
  private readonly list = el("div", "news-list");
  private readonly items: Item[] = [];
  private readonly passed = new Set<string>();
  private readonly layoffs = new Map<number, number>();
  private showing: Item | null = null;
  private timer = 0;
  private cursor = 0;

  constructor(app: App) {
    this.app = app;
    this.list.hidden = true;
    this.line.title = "Show recent news";
    this.line.setAttribute("aria-label", "Show recent news");
    this.line.addEventListener("click", () => { this.list.hidden = !this.list.hidden; this.renderList(); });
    this.el.append(this.line, this.list);
    app.onEvents((events) => this.onEvents(events));
    app.onMonth(() => this.onMonth());
    app.onReset(() => {
      this.items.length = 0;
      this.passed.clear();
      this.layoffs.clear();
      this.homes = 0;
      this.cursor = 0;
      this.showing = null;
      this.push("Welcome to Novaria, a fictive small country with about 800 people and 26 employers.", "info");
    });
    this.push("Welcome to Novaria, a fictive small country with about 800 people and 26 employers.", "info");
  }

  private push(text: string, tone: Item["tone"]): void {
    this.items.push({ date: this.app.date, text, tone });
    if (this.items.length > MAX_ITEMS) { this.items.shift(); this.cursor = Math.max(0, this.cursor - 1); }
    if (!this.list.hidden) this.renderList();
  }

  private onEvents(events: SimEvent[]): void {
    for (const ev of events) {
      switch (ev.kind) {
        case "bankrupt": this.push(ev.text, "bad"); break;
        case "founded": this.push(ev.text, "good"); break;
        case "ai": this.push(ev.text, "tech"); break;
        case "foreclosed": case "evicted": this.count("homes"); break;
        case "laidoff": this.layoffs.set(ev.firmId, (this.layoffs.get(ev.firmId) ?? 0) + 1); break;
        case "robots": {
          if (!this.passed.has(`robot-${ev.firmId}`)) {
            this.passed.add(`robot-${ev.firmId}`);
            this.push(`${this.app.economy.firms[ev.firmId].name} installed its first robots`, "tech");
          }
          break;
        }
      }
    }
  }

  private homes = 0;
  private count(_key: string): void { this.homes++; }

  private onMonth(): void {
    const e = this.app.economy;
    const h = e.history.at(-1);
    if (!h) return;
    // The biggest layoff of the month makes the news.
    let worst = -1;
    let worstCount = 2;
    for (const [firm, n] of this.layoffs) if (n > worstCount) { worst = firm; worstCount = n; }
    if (worst >= 0) this.push(`${e.firms[worst].name} cut ${worstCount} jobs`, "bad");
    this.layoffs.clear();
    if (this.homes >= 2) this.push(`${this.homes} households lost their homes this month`, "bad");
    this.homes = 0;

    const milestone = (key: string, test: (s: MonthStats) => boolean, text: string, tone: Item["tone"]) => {
      if (!this.passed.has(key) && test(h)) { this.passed.add(key); this.push(text, tone); }
    };
    for (const u of [10, 15, 20, 25, 30, 40, 50]) milestone(`u${u}`, (s) => s.unemploymentRate * 100 >= u && e.history.length > 12, `Unemployment passes ${u}%`, "bad");
    milestone("u-low", (s) => s.unemploymentRate < 0.07, "Unemployment falls below 7%: jobs are easy to find", "good");
    milestone("deflation", (s) => s.inflation < -0.005, "Prices begin to fall: cheaper goods, but heavier real debts", "info");
    milestone("zlb", (s) => s.policyRate < 0.002, "The central bank's rate reaches zero: it has little room left", "info");
    milestone("deficit", (s) => s.budgetBalance / Math.max(1, s.gdpNominal) < -0.05 && e.history.length > 24, "State budget deficit passes 5% of GDP", "bad");
    milestone("debt60", (s) => s.debtToGdp > 0.6, "Public debt passes 60% of GDP", "bad");
    milestone("margin25", (s) => s.profitMargin > 0.25, `Company profit margins pass 25%, up from ${pct(e.history[0].profitMargin, 0)}`, "info");
    milestone("ai50", (s) => s.aiAdoption > 0.5, "Half of knowledge workers now use AI software", "tech");
    milestone("robots50", (s) => s.robots >= 50, "50 robots at work", "tech");
    milestone("assist", (s) => s.onAssistance > s.onInsurance && s.onAssistance > 30, "More people on social assistance than on insurance: unemployment is becoming long-term", "bad");
    milestone("emerging", (s) => s.emergingJobs >= 10, "New industries reach 10 jobs", "good");
    milestone("emerging50", (s) => s.emergingJobs >= 50, "New industries reach 50 jobs", "good");
  }

  frame(seconds: number): void {
    this.timer -= seconds;
    if (this.timer > 0) return;
    // Slowly walk through news; skip ahead when it piles up.
    const backlog = this.items.length - this.cursor;
    if (backlog > 0) {
      if (backlog > 4) this.cursor = this.items.length - 2;
      this.showing = this.items[this.cursor];
      this.cursor++;
      this.timer = backlog > 2 ? 1.4 : 3.2;
      this.line.innerHTML = `<i class="news-dot" data-tone="${this.showing.tone}"></i><span class="news-date">${monthYear(this.showing.date)}</span><span class="news-text">${escapeHtml(this.showing.text)}</span>`;
      this.line.querySelector(".news-text")?.animate([{ opacity: 0, transform: "translateY(5px)" }, { opacity: 1, transform: "none" }], { duration: 280, easing: "ease-out" });
    }
  }

  private renderList(): void {
    this.list.innerHTML = [...this.items].reverse().slice(0, 40).map((n) => `<div class="news-row"><i class="news-dot" data-tone="${n.tone}"></i><span class="news-date">${monthYear(n.date)}</span><span>${escapeHtml(n.text)}</span></div>`).join("");
  }
}
