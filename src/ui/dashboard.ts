import * as d3 from "d3";
import type { App } from "../app.ts";
import { Chart, ChartHub, SERIES } from "./chart.ts";
import type { ChartDef } from "./chart.ts";
import { el } from "./format.ts";
import type { Tab } from "./shell.ts";

const pct1 = (v: number) => `${(v * 100).toFixed(Math.abs(v) < 0.1 ? 1 : 0).replace("-", "−")}%`;
const whole = (v: number) => d3.format(",.0f")(v);
/** Compact money for axes and legends. */
export const money = (v: number) => {
  const a = Math.abs(v);
  const s = v < 0 ? "−" : "";
  if (a >= 1e9) return `${s}${(a / 1e9).toFixed(1)} bn`;
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)} M`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(0)} k`;
  return `${s}${a.toFixed(0)}`;
};
const multiple = (v: number) => `×${v.toFixed(v < 10 ? 1 : 0)}`;
const index = (v: number) => (v * 100).toFixed(0);

const GROUPS: { title: string; blurb: string; charts: ChartDef[] }[] = [
  {
    title: "Jobs",
    blurb: "Who works, who does not, and how easy it is to find a job.",
    charts: [
      {
        id: "unemployment", title: "Unemployment rate", ghost: true, format: pct1,
        series: [{ label: "All", color: SERIES.blue, get: (h) => h.unemploymentRate }, { label: "Knowledge", color: SERIES.aqua, get: (h) => h.unemploymentKnowledge }, { label: "Manual", color: SERIES.orange, get: (h) => h.unemploymentManual }],
        help: {
          what: "The share of people in the workforce who have no job, overall and for knowledge and manual workers. The grey line is the same country with no new automation.",
          read: "Knowledge rising first points to AI software; manual rising points to robots. Vertical lines mark steps in the roll-out. They are violet for AI, orange for robots.",
          why: "Income, spending, taxes and support all follow from this number. Research: measured effects are small so far, so high values here are scenarios rather than forecasts.",
        },
      },
      {
        id: "youth", title: "Youth unemployment, under 26", ghost: true, format: pct1,
        series: [{ label: "Under 26", color: SERIES.blue, get: (h) => h.unemploymentYouth, window: 6 }],
        help: {
          what: "Unemployment among people under 26, smoothed over six months.",
          read: "Watch this against the overall rate. A wider gap means employers have stopped hiring beginners.",
          why: "US payroll data (the Canaries paper) shows the first effect of AI is fewer junior hires rather than firings. Here, too, firms freeze hiring first and experienced applicants win.",
        },
      },
      {
        id: "flows", title: "Getting and losing jobs, per month", format: whole,
        series: [{ label: "Hired", color: SERIES.aqua, get: (h) => h.hires, window: 6 }, { label: "Laid off", color: SERIES.orange, get: (h) => h.layoffs, window: 6 }, { label: "Left by choice", color: SERIES.blue, get: (h) => h.quits, window: 6 }],
        help: {
          what: "How many people were hired, laid off or left by choice each month, smoothed over six months.",
          read: "Hired above laid-off plus left means employment is growing. In calm times there is lots of movement in both directions.",
          why: "An economy always has this churn. A healthy labour market is not a still one: it is one where the hired line keeps up.",
        },
      },
      {
        id: "tightness", title: "Open jobs per jobseeker", format: (v) => v.toFixed(2),
        series: [{ label: "Vacancies per unemployed", color: SERIES.blue, get: (h) => h.vacancies / Math.max(1, h.unemployed), window: 6 }],
        help: {
          what: "Open vacancies divided by the number of people looking for work.",
          read: "Near 1, a job is there for almost every seeker. Near 0, jobs no longer grow on trees and many chase each opening.",
          why: "This tells you how it feels to look for work, which the unemployment rate alone does not.",
        },
      },
      {
        id: "work-sectors", title: "People in work", stacked: true, format: whole,
        series: [{ label: "Private", color: SERIES.blue, get: (h) => h.privateJobs - h.emergingJobs }, { label: "Public", color: SERIES.orange, get: (h) => h.publicJobs }, { label: "New industries", color: SERIES.aqua, get: (h) => h.emergingJobs }],
        help: {
          what: "Jobs in existing private companies, in the public sector and in new industries that appear in response to automation.",
          read: "The total height is everyone in work. Watch whether new industries fill the gap left by shrinking companies.",
          why: "New tasks and industries are what historically absorbed displaced workers. Change the New kinds of work slider to see how much depends on this.",
        },
      },
      {
        id: "lifecycle", title: "Retiring and entering, per year", format: whole,
        series: [{ label: "Retired", color: SERIES.blue, get: (h) => h.retirements * 12, window: 24 }, { label: "New entrants", color: SERIES.orange, get: (h) => h.entrants * 12, window: 24 }],
        help: {
          what: "How many retire each year, and how many young people start looking for work. Shown as a two-year average annual rate.",
          read: "The population is fixed, so these roughly balance in the long run.",
          why: "Retirement quietly lowers headcount with no layoffs, which is how firms prefer to shrink. New entrants are the ones hit hardest when no one is hiring.",
        },
      },
    ],
  },
  {
    title: "Output and demand",
    blurb: "What is made, what is sold, and at what price.",
    charts: [
      {
        id: "made-sold", title: "Capacity, made and sold, units per month", format: money, wide: true,
        series: [{ label: "Could make", color: SERIES.yellow, get: (h) => h.capacityUnits, window: 3 }, { label: "Made", color: SERIES.blue, get: (h) => h.unitsProduced, window: 3 }, { label: "Sold", color: SERIES.aqua, get: (h) => h.unitsSold, window: 3 }],
        help: {
          what: "How many goods and services (the blue boxes) companies could make, did make, and sold.",
          read: "A widening gap between could-make and sold is the core of the story: productive capacity outrunning what people can buy.",
          why: "Firms cut staff to match demand, not capacity. If buying power falls with jobs, demand falls further: the feedback loop the research warns about.",
        },
      },
      {
        id: "gdp", title: "Real GDP, start = 100", ghost: true, format: index, baseline: null,
        series: [{ label: "GDP", color: SERIES.blue, get: (h) => h.gdpReal, window: 3 }],
        help: {
          what: "Total value produced, adjusted for prices. 100 is the start.",
          read: "Compare with the grey line. GDP can grow strongly while unemployment rises: the economy produces more using fewer people.",
          why: "GDP alone can hide who benefits. Read it together with the wage share and savings charts. Benchmarks for measured AI are small: +0.5 to +1.5% over a decade.",
        },
      },
      {
        id: "efficiency", title: "Task efficiency achieved", format: multiple, baseline: 1,
        series: [{ label: "Knowledge work (AI)", color: SERIES.violet, get: (h) => h.taskEfficiencyKnowledge }, { label: "Manual work (robots)", color: SERIES.orange, get: (h) => h.taskEfficiencyManual }],
        help: {
          what: "How much faster the average task really gets done after adoption and exposure are taken into account.",
          read: "This lags the sliders: companies adopt gradually, and not all tasks can be automated. ×2 means half the labour per unit.",
          why: "The gap between what technology allows and what firms achieve is large in all the field evidence.",
        },
      },
      {
        id: "inflation", title: "Inflation, yearly", ghost: true, format: pct1,
        series: [{ label: "Inflation", color: SERIES.blue, get: (h) => h.inflation }],
        help: {
          what: "How much consumer prices rose over the last twelve months.",
          read: "Below zero is deflation: cheaper goods but heavier real debts. Very high values mean more money than output, for example with too large a citizen dividend.",
          why: "When prices fall and debts stay fixed, borrowers get squeezed. This is Irving Fisher's debt-deflation mechanism.",
        },
      },
    ],
  },
  {
    title: "Households",
    blurb: "What people earn, save and buy, and how they get by when work disappears.",
    charts: [
      {
        id: "savings-total", title: "Total household savings", ghost: true, format: money,
        series: [{ label: "All savings", color: SERIES.blue, get: (h) => h.savingsTotal }],
        help: {
          what: "All money in people's bank accounts added together, in kr.",
          read: "Total savings can rise while most people get poorer, if the gains go to a few. Read this with the next chart.",
          why: "Savings are the buffer that keeps spending going after a job is lost.",
        },
      },
      {
        id: "savings-typical", title: "Savings per person", format: money,
        series: [{ label: "Average", color: SERIES.blue, get: (h) => h.savingsMean }, { label: "Median (the person in the middle)", color: SERIES.orange, get: (h) => h.savingsMedian }],
        help: {
          what: "The average and the median savings per person.",
          read: "A growing gap means wealth is concentrating: the average is pulled up by a few while the typical person falls behind.",
          why: "Profit goes to shareholders, and they save most of it. That leaves less buying power with the many who would have spent it.",
        },
      },
      {
        id: "savings-top", title: "Top 10% share of savings", ghost: true, format: pct1,
        series: [{ label: "Top 10%", color: SERIES.blue, get: (h) => h.savingsTop10Share }],
        help: {
          what: "The share of all savings held by the richest tenth of the population.",
          read: "Higher means more unequal. Starts high, as it does in real economies.",
          why: "Dosi and colleagues (2022) find that income distribution, not technology alone, decides whether technological unemployment persists.",
        },
      },
      {
        id: "spending", title: "Monthly spending per person", format: money,
        series: [{ label: "Employed", color: SERIES.aqua, get: (h) => h.consumptionPerEmployed, window: 3 }, { label: "Unemployed", color: SERIES.orange, get: (h) => h.consumptionPerUnemployed, window: 3 }],
        help: {
          what: "What employed and unemployed people spend per month, in current money.",
          read: "The gap is what losing a job costs in lost demand. The red figures in the town shop far less often for this reason.",
          why: "People with little savings spend almost all extra money and cut hard when income drops (Fagereng and colleagues), so job losses hit demand more than the same fall in profits.",
        },
      },
      {
        id: "support", title: "People on financial support", stacked: true, format: whole,
        series: [{ label: "Unemployment insurance", color: SERIES.blue, get: (h) => h.onInsurance }, { label: "Social assistance", color: SERIES.orange, get: (h) => h.onAssistance }],
        help: {
          what: "Unemployed people receiving unemployment insurance (a share of old pay for about 14 months) or social assistance (a means-tested minimum after that, or for those who never qualified).",
          read: "Assistance growing faster means long-term unemployment: insurance has run out, or young people never got a job to qualify.",
          why: "This is the safety net at work. It keeps spending from collapsing, and it costs the state just as tax income falls.",
        },
      },
      {
        id: "income-spend", title: "Household income and spending, per month", format: money,
        series: [{ label: "Income after tax", color: SERIES.blue, get: (h) => h.householdIncome, window: 3 }, { label: "Spending", color: SERIES.orange, get: (h) => h.consumption, window: 3 }],
        help: {
          what: "All households' income after tax, including dividends and interest, and what they spent on goods and services (housing costs are extra).",
          read: "The gap between the lines goes to housing, loans and savings.",
          why: "Household spending is the largest source of company income, and it is why the jobs of one company depend on the wages paid by others.",
        },
      },
      {
        id: "housing", title: "People behind on housing", ghost: true, format: whole,
        series: [{ label: "In arrears", color: SERIES.blue, get: (h) => h.arrears, window: 3 }],
        help: {
          what: "People who could not pay all their rent or mortgage this month.",
          read: "Lasting arrears lead to eviction or foreclosure. In the town their roof turns red, and foreclosed houses go grey.",
          why: "Mortgages are fixed debts. Falling incomes meet unchanged payments here, and loan losses then reach the bank.",
        },
      },
      {
        id: "real-pay", title: "Average pay, month", ghost: true, format: money,
        series: [{ label: "Pay", color: SERIES.blue, get: (h) => h.averageWage }],
        help: {
          what: "Average gross monthly pay among people in work, in current money.",
          read: "Wages are set in yearly rounds. High unemployment slows them only weakly, as with Swedish sector agreements.",
          why: "Sticky pay protects those still in work, but it means more of the adjustment comes through fewer jobs.",
        },
      },
    ],
  },
  {
    title: "Companies",
    blurb: "Income, profit and how the gains of automation are shared.",
    charts: [
      {
        id: "revenue", title: "Total company income, per month", ghost: true, format: money,
        series: [{ label: "Income", color: SERIES.blue, get: (h) => h.revenue, window: 3 }],
        help: {
          what: "Sales of all private companies, in current money.",
          read: "Prices falling or fewer buyers both push this down, even as output rises.",
          why: "This is the money out of which wages, taxes and profit are all paid.",
        },
      },
      {
        id: "profit", title: "Total company profit, per month", ghost: true, format: money,
        series: [{ label: "Profit", color: SERIES.blue, get: (h) => h.profit, window: 3 }],
        help: {
          what: "Income minus all costs, before corporate tax.",
          read: "Profit may rise for years with automation, then flatten as customers lose income.",
          why: "Each company gains from cutting its own wage bill, but everyone's wage bill is someone else's customers. This is the paradox at the centre of the simulation.",
        },
      },
      {
        id: "margin", title: "Profit margin", ghost: true, format: pct1,
        series: [{ label: "Margin", color: SERIES.blue, get: (h) => h.profitMargin, window: 3 }],
        help: {
          what: "Profit as a share of company income.",
          read: "A rising margin means companies keep the cost savings rather than passing them on as lower prices.",
          why: "How savings are split between prices, profit and pay is uncertain in the evidence. The Appetite for more slider changes this split through competition.",
        },
      },
      {
        id: "profit-worker", title: "Profit per worker, per month", ghost: true, format: money,
        series: [{ label: "Per worker", color: SERIES.blue, get: (h) => h.profitPerWorker, window: 3 }],
        help: {
          what: "Monthly company profit divided by private-sector jobs.",
          read: "This climbs fast under automation because the top goes up and the bottom goes down.",
          why: "It shows productivity gains from the owners' side. Compare it with average pay.",
        },
      },
      {
        id: "wage-share", title: "Wages as a share of GDP", ghost: true, format: pct1, baseline: null,
        series: [{ label: "Wage share", color: SERIES.blue, get: (h) => h.wageShare, window: 3 }],
        help: {
          what: "How much of everything produced goes to employees as pay, including payroll taxes.",
          read: "Falling means more goes to capital owners and AI vendors. In real life this has been roughly stable in Sweden since the mid-1980s.",
          why: "Acemoglu and Restrepo's displacement effect in one line: tasks moving from people to machines lower labour's share.",
        },
      },
      {
        id: "firms", title: "Bankruptcies and new companies, running total", format: whole,
        series: [{ label: "Bankruptcies", color: SERIES.orange, get: (h) => h.bankruptcies, cumulative: true }, { label: "New companies", color: SERIES.aqua, get: (h) => h.newFirms, cumulative: true }],
        help: {
          what: "All company failures and start-ups since the beginning of the run.",
          read: "New companies appear when new kinds of work open up or when a sector has room. See them in the Companies tab.",
          why: "Failures add sudden job losses and loan losses, while new entrants force prices down and absorb workers.",
        },
      },
    ],
  },
  {
    title: "Government",
    blurb: "Taxes in, spending out. Details are in the Government tab.",
    charts: [
      {
        id: "gov", title: "Government income and spending, per month", format: money,
        series: [{ label: "Income", color: SERIES.blue, get: (h) => h.govIncome, window: 3 }, { label: "Spending", color: SERIES.orange, get: (h) => h.govSpending, window: 3 }],
        help: {
          what: "All tax income and all public spending each month.",
          read: "Spending above income is a deficit, financed by borrowing. A parliament rule slowly moves income tax to keep debt near 35% of GDP.",
          why: "Automation shrinks the tax base (wages) while raising the bill for support: the state is squeezed from both sides.",
        },
      },
      {
        id: "debt", title: "Public debt, share of GDP", ghost: true, format: pct1,
        series: [{ label: "Debt", color: SERIES.blue, get: (h) => h.debtToGdp }],
        help: {
          what: "Everything the state has borrowed, as a share of one year's GDP.",
          read: "A rise signals that the state is carrying the shock. Sweden's real level is close to the 35% start here.",
          why: "Deficits keep demand alive in a slump: the money the state borrows ends up in someone's account.",
        },
      },
    ],
  },
  {
    title: "Automation",
    blurb: "AI software and robots: two different tools with different costs and speeds.",
    charts: [
      {
        id: "adoption", title: "Knowledge staff using AI software", format: pct1,
        series: [{ label: "Share of staff", color: SERIES.violet, get: (h) => h.aiAdoption }],
        help: {
          what: "The share of knowledge workers whose employer has given them AI software.",
          read: "An S-curve: slow start, fast middle, then saturation. Large firms and IT and finance adopt first. Sweden's real figure was 35% of firms in 2025.",
          why: "Adoption is not the same as benefit. Real gains arrive months after adoption, and part of the promise is never realised.",
        },
      },
      {
        id: "robots", title: "Robots installed", format: whole,
        series: [{ label: "Robots", color: SERIES.orange, get: (h) => h.robots }],
        help: {
          what: "All robots working at companies. They appear as orange machines beside buildings in the town.",
          read: "Rises more slowly than software: robots cost much, are bought on credit, and need physical installation.",
          why: "Robots replace manual tasks, and they add debt and maintenance costs that remain if sales fall.",
        },
      },
      {
        id: "ai-fees", title: "AI software fees, per month", format: money,
        series: [{ label: "All fees", color: SERIES.violet, get: (h) => h.aiFees, window: 3 }, { label: "Paid to foreign vendors", color: SERIES.yellow, get: (h) => h.aiFeesAbroad, window: 3 }],
        help: {
          what: "What companies and the state pay for AI software, and how much of it leaves the country.",
          read: "A rising foreign share means money that used to be local wages leaves the economy.",
          why: "This is a leak: wages get spent locally, but foreign licence fees do not.",
        },
      },
    ],
  },
];

/** Macro overview: small live charts in groups, sharing one time cursor, each with help. */
export class DashboardTab implements Tab {
  readonly id = "dashboard";
  readonly label = "Dashboard";
  readonly el = el("div", "dashboard");
  readonly charts: Chart[] = [];
  private readonly app: App;
  private readonly hub = new ChartHub();
  private timer = 0;
  private needsForce = false;

  constructor(app: App) {
    this.app = app;
    for (const group of GROUPS) {
      const section = el("section", "dash-group");
      section.innerHTML = `<div class="dash-head"><h2>${group.title}</h2><p>${group.blurb}</p></div>`;
      const grid = el("div", "chart-grid");
      for (const def of group.charts) {
        const chart = new Chart(app, this.hub, def);
        this.charts.push(chart);
        grid.append(chart.el);
      }
      section.append(grid);
      this.el.append(section);
    }
    app.onReset(() => { this.charts.forEach((c) => c.reset()); this.needsForce = true; });
  }

  setActive(active: boolean): void {
    if (active) {
      this.charts.forEach((c) => c.reset());
      this.needsForce = true;
    }
  }

  frame(seconds: number): void {
    this.timer -= seconds;
    if (this.timer > 0 && !this.needsForce) return;
    this.timer = 1 / 12;
    const force = this.needsForce;
    this.needsForce = false;
    for (const c of this.charts) c.render(force);
    void this.app;
  }
}
