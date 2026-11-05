import { DEFAULT_CONTROLS, FAMILY_NAMES, FIRM_NAMES, GIVEN_NAMES, K, SECTORS, SECTOR_INDEX, SIM_START } from "./params.ts";
import type { Controls } from "./params.ts";
import { Rng } from "./rng.ts";
import {
  BOOK_BANK, BOOK_FIRMS, BOOK_GOVERNMENT, BOOK_HOUSEHOLDS, BOOK_WORLD, EMPLOYED, FLOW_CATEGORIES, FLOW_INDEX, RETIRED, UNEMPLOYED,
} from "./types.ts";
import type { Account, Firm, FlowCategory, Home, MonthStats, Person, SimEvent } from "./types.ts";

const DAYS = 30.4;
const DAY_MS = 86400000;
const NUM_BOOKS = 5;

/** The whole country. Deterministic for a given seed and sequence of control changes. */
export class Economy {
  readonly rng: Rng;
  readonly controls: Controls;
  readonly persons: Person[] = [];
  readonly firms: Firm[] = [];
  readonly homes: Home[] = [];
  readonly gov: Account = { cash: 0, book: BOOK_GOVERNMENT };
  readonly bank: Account = { cash: 0, book: BOOK_BANK };
  readonly world: Account = { cash: 0, book: BOOK_WORLD };
  readonly history: MonthStats[] = [];
  /** New events since the UI last drained them. */
  events: SimEvent[] = [];
  /** Units sold per sector on the latest day: drives the boxes in the town. */
  readonly dailyUnitsBySector: Float64Array;
  /** Units made per firm on the latest day. */
  readonly dailyProduced: Float64Array = new Float64Array(64);

  day = 0;
  bonds = 0;
  badLoans = 0;
  policyRate = K.policyRate;
  wageIndexK = 1;
  wageIndexM = 1;
  priceIndex = 1;
  housePriceIndex = 1;
  newTaskIndex = 0;
  /** Smoothed share of labour automated, used as a proxy for automation abroad. */
  globalSaving = 0;
  /** Parliament slowly moves income tax to keep public debt near its target. */
  taxAdjustment = 0;
  /** Automation tax collected this month, paid back to all adults next month. */
  automationFund = 0;
  lastAutomationDividend = 0;
  tfp = 1;
  worldPrice = 1;
  worldReal = 1;
  sectorPrice: Float64Array;
  sectorShare: Float64Array;
  sectorBaseShare: Float64Array;
  sectorRealPerPerson: Float64Array;
  exportUnits: Float64Array;
  govUnits: Float64Array;
  spendFactor = 1;
  private monthScale = 1;
  personalSpendingCap = Infinity;
  mpcScale = 1;
  publicBaseJobs = 0;
  flows: Float64Array = new Float64Array(FLOW_CATEGORIES.length * NUM_BOOKS);
  lastFlows: Float64Array = new Float64Array(FLOW_CATEGORIES.length * NUM_BOOKS);
  yearFlows: Float64Array[] = [];
  private month: number;
  private year: number;
  private m = Economy.emptyMonth();
  private priceYearAgo: number[] = [];
  private nextName = 0;
  private lastUnemployment = 0.07;
  private sectorFirms: Firm[][] = SECTORS.map(() => []);
  private gdpStart = 0;
  private readonly population: number;

  private static emptyMonth() {
    return {
      hires: 0, layoffs: 0, quits: 0, retirements: 0, entrants: 0, evictions: 0, foreclosures: 0, bankruptcies: 0, newFirms: 0,
      produced: 0, sold: 0, capacity: 0, consumption: 0, consumptionReal: 0, spendEmployed: 0, spendUnemployed: 0,
      publicWages: 0, investment: 0,
    };
  }

  constructor(seed = 1, controls: Partial<Controls> = {}, population = K.population) {
    this.population = population;
    this.rng = new Rng(seed);
    this.controls = { ...DEFAULT_CONTROLS, ...controls };
    const n = SECTORS.length;
    this.dailyUnitsBySector = new Float64Array(n);
    this.sectorPrice = new Float64Array(n).fill(100);
    this.sectorShare = new Float64Array(n);
    this.sectorBaseShare = new Float64Array(n);
    this.sectorRealPerPerson = new Float64Array(n);
    this.exportUnits = new Float64Array(n);
    this.govUnits = new Float64Array(n);
    const d = new Date(SIM_START);
    this.month = d.getUTCMonth();
    this.year = d.getUTCFullYear();
    this.setMonthScale(d);
    this.setup();
  }

  get date(): number {
    return SIM_START + this.day * DAY_MS;
  }

  /** Keeps monthly totals from depending on whether a month has 28 or 31 days, as wages do not. */
  private setMonthScale(d: Date): void {
    const days = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    this.monthScale = DAYS / days;
  }

  // ------------------------------------------------------------------ setup

  private setup(): void {
    const scale = this.population / 1000;
    const r = this.rng;
    const sectorRevenue = new Float64Array(SECTORS.length);
    const b2bSupplyTotal = SECTORS.reduce((a, s) => a + s.b2bSupply, 0);

    // Average pay in each sector follows from its mix of knowledge and manual tasks.
    const avgWage = (i: number) => {
      const s = SECTORS[i];
      return s.wagePremium * (s.knowledge * K.wageKnowledge + (1 - s.knowledge) * K.wageManual);
    };
    SECTORS.forEach((s, i) => {
      if (s.isPublic || s.jobs === 0) return;
      const labourShare = 1 - s.importShare - s.b2bShare - s.margin;
      sectorRevenue[i] = (s.jobs * scale * avgWage(i) * (1 + K.payrollTax)) / labourShare;
    });

    // Split what each sector sells between households, exports, government and other firms.
    const b2bPool = SECTORS.reduce((a, s, i) => a + sectorRevenue[i] * s.b2bShare, 0);
    let consumerTotal = 0;
    const consumerNet = new Float64Array(SECTORS.length);
    SECTORS.forEach((s, i) => {
      if (s.isPublic || s.jobs === 0 || s.key === "housing") return;
      const b2b = (b2bPool * s.b2bSupply) / b2bSupplyTotal;
      const exports = sectorRevenue[i] * s.exportShare;
      const govBuy = sectorRevenue[i] * s.govShare;
      consumerNet[i] = Math.max(0, sectorRevenue[i] - b2b - exports - govBuy);
      consumerTotal += consumerNet[i];
      this.exportUnits[i] = (exports * 0.87) / DAYS / 100;
      this.govUnits[i] = (govBuy * 1.25) / DAYS / 100;
    });
    SECTORS.forEach((_s, i) => {
      this.sectorBaseShare[i] = consumerNet[i] / Math.max(1, consumerTotal);
      this.sectorRealPerPerson[i] = consumerNet[i] / 100 / this.population;
    });
    this.sectorShare.set(this.sectorBaseShare);

    // Companies. Sizes are uneven so the leaderboard starts with big and small players.
    const nameUse: Record<string, number> = {};
    SECTORS.forEach((s, i) => {
      if (s.firms === 0) return;
      const weights = Array.from({ length: s.firms }, () => r.range(0.6, 1.5));
      const total = weights.reduce((a, b) => a + b, 0);
      weights.forEach((w) => {
        const jobs = (s.jobs * scale * w) / total;
        const units = s.isPublic ? 0 : sectorRevenue[i] * (w / total) / 100;
        const f = this.makeFirm(i, this.firmName(s.key, nameUse), w / total);
        const perUnit = s.isPublic ? 1 / 100 : jobs / Math.max(1, units);
        f.laborK = perUnit * s.knowledge;
        f.laborM = perUnit * (1 - s.knowledge);
        f.quality = w / total;
        f.forecast = units / DAYS;
        f.targetOutput = f.forecast;
        f.inventory = f.forecast * 30;
        f.price = 100;
        f.markup = s.margin / Math.max(0.1, 1 - s.importShare - s.b2bShare - s.margin);
        f.publicTarget = s.isPublic ? Math.round(jobs) : 0;
        f.cash = units * 100 * 1.5 + 100000;
        if (s.isPublic) this.publicBaseJobs += Math.round(jobs);
      });
    });

    // Homes: houses for owners, apartment blocks for renters.
    const addHome = (kind: Home["kind"], capacity: number) => {
      const home: Home = { id: this.homes.length, kind, occupants: 0, capacity, vacant: false, foreclosed: false, legacyLoan: 0, heirId: -1 };
      this.homes.push(home);
      return home;
    };

    // People. The age mix is the steady state of retirement and replacement.
    // Stratified so every run starts with the same size of workforce, whatever the seed.
    const workingAge = Math.round(this.population * 0.75);
    for (let i = 0; i < this.population; i++) {
      this.persons.push(this.makePerson(i < workingAge ? r.range(20, 63.5) : r.range(68.5, 88)));
    }
    this.persons.forEach((p, i) => { p.id = i; });
    const workers = this.persons.filter((p) => p.age < p.retireAge);
    workers.forEach((p, i) => { p.knowledge = i % 2 === 0; });
    this.shuffle(workers);

    // Wealth is concentrated; shares go to a small group.
    const byWealth = [...this.persons].sort((a, b) => b.age - a.age).slice(0, Math.floor(this.population * 0.6));
    this.shuffle(byWealth);
    byWealth.slice(0, Math.floor(this.population * K.wealthyShare)).forEach((p) => {
      p.shares = Math.pow(r.next(), -0.6);
      p.cash *= 1 + p.shares;
    });

    // Place workers in jobs, leaving initial unemployment so hiring is visible from the start.
    const seats: { firm: Firm; knowledge: boolean }[] = [];
    for (const f of this.firms) {
      const s = SECTORS[f.sector];
      const jobs = Math.round(s.jobs * scale * (s.isPublic ? 1 : f.quality));
      const kJobs = Math.round(jobs * s.knowledge);
      for (let j = 0; j < jobs; j++) seats.push({ firm: f, knowledge: j < kJobs });
    }
    this.shuffle(seats);
    const pools = {
      k: workers.filter((p) => p.knowledge),
      m: workers.filter((p) => !p.knowledge),
    };
    const filledTarget = Math.round(workers.length * (1 - K.initialUnemployment));
    let filled = 0;
    for (const seat of seats) {
      if (filled >= filledTarget) break;
      const pool = seat.knowledge ? pools.k : pools.m;
      const alt = seat.knowledge ? pools.m : pools.k;
      const p = pool.pop() ?? alt.pop();
      if (!p) break;
      this.employ(p, seat.firm, false);
      p.tenureMonths = Math.floor(r.range(1, Math.max(2, (p.age - 20) * 12)));
      p.monthsWorkedRecently = 12;
      p.neverWorked = false;
      p.everHad = true;
      filled++;
    }
    for (const p of [...pools.k, ...pools.m]) {
      p.status = UNEMPLOYED;
      p.neverWorked = p.age < 24 && r.chance(0.7);
      p.everHad = !p.neverWorked;
      p.monthsUnemployed = r.int(0, 5);
      p.monthsWorkedRecently = p.neverWorked ? 0 : 8;
      p.lastWage = this.offerWage(p, SECTORS[0].wagePremium);
    }

    // Housing: owners tend to be older.
    const byAge = [...this.persons].sort((a, b) => a.age + r.range(-12, 12) - (b.age + r.range(-12, 12)));
    const n = byAge.length;
    byAge.forEach((p, i) => {
      const rank = i / n;
      if (rank < 0.42) {
        p.housing = "rent";
      } else if (rank < 0.86) {
        p.housing = "mortgage";
      } else {
        p.housing = "owned";
      }
    });
    let apartment = addHome("apartment", 12);
    for (const p of this.persons) {
      const debtFactor = r.range(0.75, 1.3);
      if (p.housing === "rent") {
        if (apartment.occupants >= apartment.capacity) apartment = addHome("apartment", 12);
        p.homeId = apartment.id;
        apartment.occupants++;
        p.housingCost = r.range(6000, 10500);
      } else {
        const home = addHome("house", 1);
        home.occupants = 1;
        p.homeId = home.id;
        if (p.housing === "mortgage") {
          const yearsLeft = Math.max(0.15, 1 - (p.age - 30) / 50);
          p.mortgage = 2700000 * yearsLeft * debtFactor;
          p.cash += p.mortgage * 0.06;
        }
        p.housingCost = 2500;
      }
    }

    // The landlord's business is the rent roll: size its output and margin from that.
    const rentRoll = this.persons.reduce((a, p) => a + p.housingCost, 0);
    const landlords = this.sectorFirms[SECTOR_INDEX.housing];
    for (const f of landlords) {
      const s = SECTORS[f.sector];
      const units = (rentRoll * f.quality) / 100;
      const jobs = s.jobs * scale * f.quality;
      const perUnit = jobs / Math.max(1, units);
      f.laborK = perUnit * s.knowledge;
      f.laborM = perUnit * (1 - s.knowledge);
      f.forecast = units / DAYS;
      f.targetOutput = f.forecast;
      f.inventory = 0;
      f.lastSold = units;
      f.cash = units * 100 * 0.6 + 100000;
    }

    // Set consumption scale so demand starts consistent with what firms expect to sell.
    const gross = (consumerTotal * (1 + K.vat) * 0.87) / (1 - K.consumerImportShare);
    for (const p of this.persons) {
      p.netIncome = p.status === EMPLOYED ? this.netPay(p.wage) : p.status === RETIRED ? this.netPay(p.pension) : this.netPay(16000);
      p.netIncomeSmooth = p.netIncome;
    }
    // Expected incomes treat the initial unemployment as filled, since firms will hire.
    let budgetTotal = 0;
    for (const p of this.persons) {
      const y = p.status === UNEMPLOYED ? this.netPay(p.lastWage || K.wageManual) : p.netIncome;
      budgetTotal += this.budgetFor(p, y, 1);
    }
    this.mpcScale = Math.min(1.3, Math.max(0.75, gross / Math.max(1, budgetTotal)));
    for (const p of this.persons) p.monthBudget = this.budgetFor(p, p.netIncomeSmooth, this.mpcScale);

    // Opening balance sheet: loans plus bonds back all deposits.
    const loans = this.persons.reduce((a, p) => a + p.mortgage, 0);
    const firmCash = this.firms.reduce((a, f) => a + f.cash, 0);
    const hhCash = this.persons.reduce((a, p) => a + p.cash, 0);
    const estimatedGdp = sectorRevenue.reduce((a, b) => a + b, 0) * 12 * 0.85 + this.publicBaseJobs * 42000 * 12;
    this.bonds = estimatedGdp * 0.35;
    this.bank.cash = (loans + this.bonds) * 0.09;
    // The world's deposit closes the sheet: net foreign funding of the bank.
    this.world.cash = loans + this.bonds - firmCash - hhCash - this.bank.cash;
    this.recomputeDemandShares();
    this.updateFirmShares();
  }

  private shuffle<T>(items: T[]): void {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng.next() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
  }

  private firmName(key: string, used: Record<string, number>): string {
    const names = FIRM_NAMES[key];
    const n = used[key] ?? 0;
    used[key] = n + 1;
    if (n < names.length) return names[n];
    // A later generation of a familiar name, as with real re-founded companies.
    const generation = Math.floor(n / names.length) + 1;
    const roman = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
    return `${names[n % names.length]} ${roman[generation] ?? generation}`;
  }

  private makeFirm(sector: number, name: string, quality: number): Firm {
    const s = SECTORS[sector];
    const f: Firm = {
      id: this.firms.length, name, sector, isPublic: s.isPublic, alive: true, slot: this.firms.length, founded: this.day, closedDay: -1,
      quality, decisionDay: this.rng.int(1, 28), laborK: 0, laborM: 0, employees: [], countK: 0, countM: 0, vacK: 0, vacM: 0,
      publicTarget: 0, inventory: 0, forecast: 0, targetOutput: 0, price: 100, markup: 0.15, loan: 0, robots: 0,
      robotAdoption: 0, aiAdoption: 0, aiSaving: 0, robotSaving: 0, shareWeight: 0, negativeMonths: 0,
      produced: 0, sold: 0, revenue: 0, costWages: 0, costPayroll: 0, costImports: 0, costB2b: 0, costAi: 0, costRobots: 0,
      costInterest: 0, costHousingEtc: 0, taxPaid: 0, automationTaxPaid: 0, dividendsPaid: 0, hires: 0, layoffs: 0,
      lastRevenue: 0, lastProfit: 0, lastSold: 0, lastProduced: 0, history: [], cash: 0, book: BOOK_FIRMS,
    };
    this.firms.push(f);
    this.sectorFirms[sector].push(f);
    return f;
  }

  private newName(): string {
    this.nextName++;
    return `${this.rng.pick(GIVEN_NAMES)} ${this.rng.pick(FAMILY_NAMES)}`;
  }

  private makePerson(age: number): Person {
    const r = this.rng;
    const retireAge = r.range(K.retireAgeMin, K.retireAgeMax);
    const retired = age >= retireAge;
    const skill = Math.min(1.5, Math.max(0.65, r.normal(1, 0.16)));
    const wageBase = 0.5 * (K.wageKnowledge + K.wageManual) * skill;
    const p: Person = {
      id: this.persons.length, name: this.newName(), age, knowledge: r.chance(0.5), skill,
      status: retired ? RETIRED : UNEMPLOYED, firmId: -1, wage: 0, lastWage: 0, tenureMonths: 0, monthsUnemployed: 0,
      monthsWorkedRecently: 0, neverWorked: false, everHad: true, uiMember: r.chance(K.uiMembership), support: "none",
      pension: retired ? wageBase * K.pensionRatio : 0, retireAge, housing: "rent", homeId: -1, housingCost: 8000, mortgage: 0,
      arrears: 0, shares: 0, netIncome: 0, netIncomeSmooth: 0, dividendSmooth: 0, monthBudget: 0, spendThisMonth: 0,
      unitsThisMonth: 0, lastSpend: 0, incomeLabel: "", log: [], savingsHistory: [], incomeHistory: [], spendHistory: [],
      // Savings grow with age with a long right tail.
      cash: Math.max(3000, (20000 + Math.max(0, age - 20) * 7500) * Math.exp(r.normal(0, 0.75))),
      book: BOOK_HOUSEHOLDS,
    };
    return p;
  }

  // ------------------------------------------------------------------ ledger

  private pay(from: Account, to: Account, amount: number, category: FlowCategory): void {
    from.cash -= amount;
    to.cash += amount;
    const row = FLOW_INDEX[category] * NUM_BOOKS;
    this.flows[row + from.book] -= amount;
    this.flows[row + to.book] += amount;
  }

  /** Loans create deposits. */
  private lend(to: Person | Firm, amount: number): void {
    if (amount <= 0) return;
    to.cash += amount;
    if ("mortgage" in to) to.mortgage += amount;
    else to.loan += amount;
    this.flows[FLOW_INDEX["Loan issue (new money)"] * NUM_BOOKS + to.book] += amount;
    this.flows[FLOW_INDEX["Loan issue (new money)"] * NUM_BOOKS + BOOK_BANK] -= amount;
  }

  /** Repayments destroy them. */
  private repay(from: Person | Firm, amount: number): void {
    if (amount <= 0) return;
    from.cash -= amount;
    if ("mortgage" in from) from.mortgage -= amount;
    else from.loan -= amount;
    this.flows[FLOW_INDEX["Loan repayment"] * NUM_BOOKS + from.book] -= amount;
    this.flows[FLOW_INDEX["Loan repayment"] * NUM_BOOKS + BOOK_BANK] += amount;
  }

  /** A bad loan comes off the books and out of bank equity, and the borrower no longer owes it. */
  private writeOff(amount: number): void {
    if (amount <= 0) return;
    this.bank.cash -= amount;
    this.badLoans += amount;
    this.flows[FLOW_INDEX["Loan write-offs"] * NUM_BOOKS + BOOK_BANK] -= amount;
    this.flows[FLOW_INDEX["Loan write-offs"] * NUM_BOOKS + BOOK_HOUSEHOLDS] += amount;
  }

  /** Total deposits minus everything the banking system holds against them. Should stay zero. */
  moneyError(): number {
    let cash = this.gov.cash + this.bank.cash + this.world.cash;
    let assets = this.bonds;
    for (const p of this.persons) { cash += p.cash; assets += p.mortgage; }
    for (const f of this.firms) { cash += f.cash; assets += f.loan; }
    for (const h of this.homes) assets += h.legacyLoan;
    return cash - assets;
  }

  private event(kind: SimEvent["kind"], personId: number, firmId: number, text: string, count?: number): void {
    if (this.events.length < 400) this.events.push({ day: this.day, kind, personId, firmId, text, count });
  }

  private logPerson(p: Person, kind: string, text: string): void {
    p.log.push({ day: this.day, kind, text });
    if (p.log.length > 40) p.log.shift();
  }

  // ------------------------------------------------------------------ pay and taxes

  private taxOn(gross: number): number {
    const index = this.wageIndexM;
    return (K.incomeTax + this.taxAdjustment) * Math.max(0, gross - 2000 * index) + K.stateTax * Math.max(0, gross - K.stateTaxThreshold * index);
  }

  private netPay(gross: number): number {
    return gross - this.taxOn(gross);
  }

  private offerWage(p: Person, premium: number, knowledge = p.knowledge): number {
    const base = knowledge ? K.wageKnowledge * this.wageIndexK : K.wageManual * this.wageIndexM;
    const age = Math.max(0, Math.min(25, p.age - 22));
    return base * premium * p.skill * (0.8 + 0.0144 * age);
  }

  private employ(p: Person, f: Firm, announce = true): void {
    const kindKnowledgeSeat = p.knowledge;
    p.status = EMPLOYED;
    p.firmId = f.id;
    p.wage = this.offerWage(p, SECTORS[f.sector].wagePremium, kindKnowledgeSeat);
    p.lastWage = p.wage;
    p.tenureMonths = 0;
    p.monthsWorkedRecently = 0;
    p.monthsUnemployed = 0;
    p.support = "none";
    p.neverWorked = false;
    p.arrears = Math.max(0, p.arrears - 1);
    f.employees.push(p.id);
    if (p.knowledge) f.countK++;
    else f.countM++;
    if (announce) {
      f.hires++;
      this.m.hires++;
      this.logPerson(p, "hired", `Hired by ${f.name}`);
      this.event("hired", p.id, f.id, `${p.name} joined ${f.name}`);
    }
  }

  private release(p: Person, reason: "laidoff" | "quit" | "retired" | "bankrupt"): void {
    const f = this.firms[p.firmId];
    if (f) {
      const i = f.employees.indexOf(p.id);
      if (i >= 0) f.employees.splice(i, 1);
      if (p.knowledge) f.countK--;
      else f.countM--;
      if (reason === "laidoff" || reason === "bankrupt") {
        f.layoffs++;
        this.m.layoffs++;
        this.logPerson(p, "laidoff", reason === "bankrupt" ? `Lost job: ${f.name} went bankrupt` : `Laid off by ${f.name}`);
        this.event("laidoff", p.id, f.id, `${p.name} was laid off by ${f.name}`);
      } else if (reason === "quit") {
        this.m.quits++;
        this.logPerson(p, "quit", `Left ${f.name} to look for something new`);
      }
    }
    p.firmId = -1;
    p.wage = 0;
    p.status = reason === "retired" ? RETIRED : UNEMPLOYED;
    p.monthsUnemployed = 0;
  }

  // ------------------------------------------------------------------ automation-adjusted labour

  /** Labour time per unit after AI software, on knowledge tasks only. */
  private labourK(f: Firm): number {
    return f.laborK * (1 - f.aiSaving * SECTORS[f.sector].aiExposure) * this.tfp;
  }

  /** Labour time per unit after robots, on manual tasks only. */
  private labourM(f: Firm): number {
    return f.laborM * (1 - f.robotSaving) * this.tfp;
  }

  private capacityPerDay(f: Firm): number {
    const lk = this.labourK(f);
    const lm = this.labourM(f);
    const qk = lk > 1e-9 ? f.countK / lk : Infinity;
    const qm = lm > 1e-9 ? f.countM / lm : Infinity;
    const low = Math.min(qk, qm);
    const high = Math.max(qk === Infinity ? low : qk, qm === Infinity ? low : qm);
    // Mostly limited by the scarcer type of labour, with some ability to cover for it.
    return (0.75 * low + 0.25 * high) / DAYS;
  }

  // ------------------------------------------------------------------ daily step

  step(): void {
    this.day++;
    this.dailyUnitsBySector.fill(0);
    this.produce();
    this.matchJobs();
    this.consume();
    this.otherDemand();
    for (const f of this.firms) {
      if (f.alive && !f.isPublic && this.day % 28 === f.decisionDay % 28) this.decide(f);
    }
    const d = new Date(this.date);
    if (d.getUTCMonth() !== this.month) {
      this.closeMonth();
      this.month = d.getUTCMonth();
      if (d.getUTCFullYear() !== this.year) this.year = d.getUTCFullYear();
      this.setMonthScale(d);
    }
  }

  private produce(): void {
    for (const f of this.firms) {
      if (!f.alive || f.isPublic) continue;
      const cap = this.capacityPerDay(f);
      const q = Math.min(cap, f.targetOutput) * this.monthScale;
      f.inventory += q;
      f.produced += q;
      this.m.produced += q;
      this.m.capacity += cap;
      if (f.id < this.dailyProduced.length) this.dailyProduced[f.id] = q;
      // Purchases from abroad and other firms scale with output and pay for materials.
      const s = SECTORS[f.sector];
      const inputCost = q * f.price;
      this.pay(f, this.world, inputCost * s.importShare, "Imports");
      f.costImports += inputCost * s.importShare;
      this.buyFromOtherFirms(f, inputCost * s.b2bShare);
    }
  }

  private buyFromOtherFirms(buyer: Firm, amount: number): void {
    if (amount <= 0) return;
    buyer.costB2b += amount;
    let totalSupply = 0;
    for (let i = 0; i < SECTORS.length; i++) totalSupply += SECTORS[i].b2bSupply;
    for (let i = 0; i < SECTORS.length; i++) {
      const supply = SECTORS[i].b2bSupply;
      if (supply > 0) this.sellSector(i, (amount * supply) / totalSupply, buyer, "Business purchases");
    }
  }

  /** Buyer pays the sector: the sale goes to firms in proportion to competitiveness. */
  private sellSector(sector: number, amount: number, buyer: Account, category: FlowCategory): number {
    let units = 0;
    let delivered = 0;
    for (const f of this.sectorFirms[sector]) {
      if (!f.alive) continue;
      const part = amount * f.shareWeight;
      if (part <= 0) continue;
      const u = part / f.price;
      f.inventory -= u;
      f.sold += u;
      f.revenue += part;
      this.pay(buyer, f, part, category);
      units += u;
      delivered += part;
    }
    this.m.sold += units;
    this.dailyUnitsBySector[sector] += units;
    return delivered;
  }

  private matchJobs(): void {
    const seekersK: Person[] = [];
    const seekersM: Person[] = [];
    let built = false;
    const build = () => {
      for (const p of this.persons) {
        if (p.status !== UNEMPLOYED) continue;
        if (p.knowledge) seekersK.push(p);
        else seekersM.push(p);
      }
      built = true;
    };
    for (const f of this.firms) {
      if (!f.alive || f.vacK + f.vacM <= 0) continue;
      if (!built) build();
      for (let kind = 0; kind < 2; kind++) {
        const wantKnowledge = kind === 0;
        const vac = wantKnowledge ? f.vacK : f.vacM;
        if (vac <= 0) continue;
        let pool = wantKnowledge ? seekersK : seekersM;
        // Knowledge workers out of work for long will take manual jobs; retraining is rarer the other way.
        if (!pool.length || this.rng.chance(0.1)) {
          const other = wantKnowledge ? seekersM : seekersK;
          const switchers = other.filter((p) => p.monthsUnemployed >= (wantKnowledge ? 15 : 7));
          if (switchers.length) pool = switchers;
        }
        if (!pool.length) continue;
        const fillChance = Math.min(0.2, (0.055 * pool.length) / (pool.length + 4));
        for (let v = 0; v < vac; v++) {
          if (!pool.length || !this.rng.chance(fillChance)) continue;
          const person = this.pickApplicant(pool);
          if (person.knowledge !== wantKnowledge) person.knowledge = wantKnowledge;
          for (const list of [seekersK, seekersM, pool]) {
            const at = list.indexOf(person);
            if (at >= 0) list.splice(at, 1);
          }
          this.employ(person, f);
          if (wantKnowledge) f.vacK--;
          else f.vacM--;
        }
      }
    }
  }

  /** Best of a few random applicants. Experience counts, so new entrants struggle when jobs are scarce. */
  private pickApplicant(pool: Person[]): Person {
    let best = this.rng.pick(pool);
    let bestScore = -Infinity;
    for (let i = 0; i < 4; i++) {
      const p = this.rng.pick(pool);
      const score = p.skill - (p.neverWorked ? 0.25 : 0) - p.monthsUnemployed * 0.012 + this.rng.next() * 0.25;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best;
  }

  private consume(): void {
    const netShare = 1 / (1 + K.vat);
    const domesticShare = netShare * (1 - K.consumerImportShare);
    const sectorSpend = new Float64Array(SECTORS.length);
    let total = 0;
    for (const p of this.persons) {
      const want = (p.monthBudget / DAYS) * this.spendFactor * this.monthScale;
      const spend = Math.min(want, Math.max(0, p.cash));
      if (spend <= 0) continue;
      p.cash -= spend;
      p.spendThisMonth += spend;
      p.unitsThisMonth += (spend * domesticShare) / (100 * this.priceIndex);
      total += spend;
      if (p.status === EMPLOYED) this.m.spendEmployed += spend;
      else if (p.status === UNEMPLOYED) this.m.spendUnemployed += spend;
    }
    if (total <= 0) return;
    // Bookkeeping for the person-to-sector transfer happens in aggregate for speed.
    const row = FLOW_INDEX["Household purchases"] * NUM_BOOKS;
    this.flows[row + BOOK_HOUSEHOLDS] -= total;
    this.m.consumption += total;
    const vat = total - total * netShare;
    this.gov.cash += vat;
    const vatRow = FLOW_INDEX.VAT * NUM_BOOKS;
    this.flows[vatRow + BOOK_GOVERNMENT] += vat;
    this.flows[row + BOOK_HOUSEHOLDS] += vat;
    this.flows[vatRow + BOOK_HOUSEHOLDS] -= vat;
    const afterVat = total - vat;
    this.m.consumptionReal += afterVat / (100 * this.priceIndex);
    // Part of what people buy comes straight from abroad.
    const imported = afterVat * K.consumerImportShare;
    this.world.cash += imported;
    this.flows[row + BOOK_HOUSEHOLDS] += imported;
    const importRow = FLOW_INDEX.Imports * NUM_BOOKS;
    this.flows[importRow + BOOK_HOUSEHOLDS] -= imported;
    this.flows[importRow + BOOK_WORLD] += imported;
    const net = afterVat - imported;
    const pot: Account = { cash: net, book: BOOK_HOUSEHOLDS };
    let shareTotal = 0;
    for (let i = 0; i < SECTORS.length; i++) {
      if (this.sectorFirms[i].some((f) => f.alive)) { sectorSpend[i] = this.sectorShare[i]; shareTotal += sectorSpend[i]; }
    }
    if (shareTotal <= 0) { this.world.cash += net; return; }
    for (let i = 0; i < SECTORS.length; i++) {
      if (sectorSpend[i] > 0) this.sellSector(i, (net * sectorSpend[i]) / shareTotal, pot, "Household purchases");
    }
    // Floating point crumbs stay in the pot's owner column via the government, so money stays exact.
    if (Math.abs(pot.cash) > 0) this.gov.cash += pot.cash;
    // Undo the double count above: sellSector booked the household column from the pot.
    this.flows[row + BOOK_HOUSEHOLDS] += net;
  }

  private otherDemand(): void {
    for (let i = 0; i < SECTORS.length; i++) {
      const s = SECTORS[i];
      if (s.isPublic) continue;
      const price = this.sectorPrice[i];
      if (this.exportUnits[i] > 0) {
        // The world automates too, so export markets get cheaper alongside us and grow only modestly.
        const relative = price / (100 * this.worldPrice * (1 - 0.7 * this.globalSaving));
        const units = this.exportUnits[i] * this.worldReal * (1 + 0.15 * this.globalSaving) * Math.pow(relative, -0.6) * this.monthScale;
        this.sellSector(i, units * price, this.world, "Exports");
      }
      if (this.govUnits[i] > 0) {
        // Budgets are set in money and follow pay, so cheaper goods mean the state buys more of them.
        const budgetIndex = 0.5 * (this.wageIndexK + this.wageIndexM);
        this.sellSector(i, this.govUnits[i] * 100 * budgetIndex * this.monthScale, this.gov, "Government purchases");
      }
    }
  }

  // ------------------------------------------------------------------ firm decisions

  private decide(f: Firm): void {
    const r = this.rng;
    const s = SECTORS[f.sector];
    if (s.key === "housing") {
      f.forecast = f.forecast * 0.7 + (f.lastSold / DAYS) * 0.3;
      f.targetOutput = f.forecast;
      f.inventory = 0;
      f.price = 100 * this.priceIndex;
      this.adoptAutomation(f);
      this.adjustStaff(f, f.targetOutput * DAYS * this.labourK(f), f.targetOutput * DAYS * this.labourM(f));
      return;
    }
    // Expect sales like the recent past.
    const sinceStart = Math.max(1, new Date(this.date).getUTCDate());
    const recent = f.sold / sinceStart / this.monthScale;
    const lastFull = f.lastSold / DAYS;
    const signal = f.lastSold > 0 ? (recent * sinceStart + lastFull * (DAYS - sinceStart)) / DAYS : recent;
    f.forecast = f.forecast * 0.7 + signal * 0.3;
    const targetStock = f.forecast * 30;
    f.targetOutput = Math.max(f.forecast * 0.2, f.forecast + (targetStock - f.inventory) / 75);

    this.adoptAutomation(f);

    const lk = this.labourK(f);
    const lm = this.labourM(f);
    const needK = f.targetOutput * DAYS * lk;
    const needM = f.targetOutput * DAYS * lm;
    this.adjustStaff(f, needK, needM);

    // Prices follow costs, slowly; part of any automation saving is kept as margin.
    const labourCostPerUnit = (avgWage: number, l: number) => avgWage * (1 + K.payrollTax) * l;
    const wageK = K.wageKnowledge * this.wageIndexK * s.wagePremium;
    const wageM = K.wageManual * this.wageIndexM * s.wagePremium;
    const noAuto = labourCostPerUnit(wageK, f.laborK * this.tfp) + labourCostPerUnit(wageM, f.laborM * this.tfp);
    const withAuto = labourCostPerUnit(wageK, lk) + labourCostPerUnit(wageM, lm);
    const saving = Math.max(0, noAuto - withAuto);
    // Where buyers respond strongly to price, competition forces more of the saving into lower prices.
    const passThrough = K.passThrough + 0.7 * (this.controls.demandResponse - 0.4);
    const labourCost = noAuto - saving * passThrough;
    const material = s.importShare + s.b2bShare;
    const target = (labourCost / Math.max(0.3, 1 - material)) * (1 + f.markup);
    // Competition pulls margins back to the sector norm; stock levels push them around it.
    const stockRatio = f.inventory / Math.max(1e-6, targetStock);
    const normal = s.margin / Math.max(0.1, 1 - material - s.margin);
    f.markup += (normal - f.markup) * 0.03;
    if (stockRatio > 1.25) f.markup = Math.max(0.0, f.markup - 0.012 * Math.min(2, stockRatio - 1.25) - 0.001);
    else if (stockRatio < 0.7) f.markup = Math.min(0.8, f.markup + 0.006);
    f.price += (target - f.price) * 0.09 + f.price * r.normal(0, 0.0012);
    f.price = Math.max(1, f.price);
  }

  private adjustStaff(f: Firm, needK: number, needM: number): void {
    const plan = (count: number, need: number, knowledge: boolean) => {
      const want = need < 0.02 ? 0 : Math.max(1, Math.ceil(need - 0.25));
      if (want > count) {
        const vac = Math.min(want - count, Math.max(1, Math.ceil(count * 0.18)));
        if (knowledge) f.vacK = vac;
        else f.vacM = vac;
        return;
      }
      if (knowledge) f.vacK = 0;
      else f.vacM = 0;
      // Hiring freeze first: only lay off when clearly overstaffed, and gradually.
      const excess = count - want;
      const tolerance = Math.max(1, count * 0.08);
      if (excess > tolerance && count > 1) {
        const cuts = Math.min(excess - Math.floor(tolerance * 0.5), Math.max(1, Math.ceil(count * 0.07)), count - 1);
        this.layOff(f, knowledge, cuts);
      }
    };
    plan(f.countK, needK, true);
    plan(f.countM, needM, false);
  }

  /** Last in, first out, as in Swedish employment law. */
  private layOff(f: Firm, knowledge: boolean, n: number): void {
    const staff = f.employees
      .map((id) => this.persons[id])
      .filter((p) => p.knowledge === knowledge)
      .sort((a, b) => a.tenureMonths - b.tenureMonths);
    for (let i = 0; i < n && i < staff.length; i++) this.release(staff[i], "laidoff");
  }

  private adoptAutomation(f: Firm): void {
    const s = SECTORS[f.sector];
    const c = this.controls;
    if (c.aiLevel > 0 && s.aiExposure > 0) {
      const speed = 0.012 * s.adoptionSpeed * (0.6 + f.quality * 2);
      const before = f.aiAdoption;
      f.aiAdoption = Math.min(1, f.aiAdoption + 0.004 * s.adoptionSpeed + speed * f.aiAdoption * (1 - f.aiAdoption) * 2);
      if (before < 0.5 && f.aiAdoption >= 0.5) this.event("ai", -1, f.id, `${f.name} moved most staff onto AI software`);
    }
    // The saving arrives some months after adoption: people and processes must change first.
    const aiTarget = c.aiLevel * f.aiAdoption;
    f.aiSaving += (aiTarget - f.aiSaving) * (aiTarget > f.aiSaving ? 0.06 : 0.12);

    if (c.robotLevel > 0 && s.robotExposure > 0) {
      const speed = 0.008 * s.adoptionSpeed * (0.6 + f.quality * 2);
      f.robotAdoption = Math.min(1, f.robotAdoption + 0.002 * s.adoptionSpeed + speed * f.robotAdoption * (1 - f.robotAdoption) * 2);
    }
    const targetSaving = c.robotLevel * s.robotExposure * f.robotAdoption;
    if (f.isPublic) {
      // The state leases care and service robots; the cost is the monthly maintenance charge.
      f.robotSaving += (targetSaving - f.robotSaving) * 0.1;
      f.robots = Math.round((f.robotSaving * f.publicTarget * (1 - s.knowledge)) / K.robotReplacesWorkers);
      return;
    }
    const manualBase = f.targetOutput * DAYS * f.laborM * this.tfp;
    const robotsWanted = Math.round((targetSaving * manualBase) / K.robotReplacesWorkers);
    if (robotsWanted > f.robots) {
      // Slow roll-out: a few machines per decision, loan financed if credit is available.
      const buy = Math.min(robotsWanted - f.robots, Math.max(1, Math.ceil(f.countM * 0.04)));
      const cost = buy * K.robotPrice * this.priceIndex;
      const loanable = this.creditLimit(f) - f.loan;
      if (loanable + Math.max(0, f.cash) >= cost * 0.85) {
        this.lend(f, Math.max(0, Math.min(cost, cost * 0.85)));
        this.buyRobots(f, cost);
        f.robots += buy;
        this.m.investment += cost;
        this.event("robots", -1, f.id, `${f.name} installed ${buy} robot${buy > 1 ? "s" : ""}`, buy);
      }
    }
    f.robotSaving = manualBase > 0.01 ? Math.min(Math.min(0.95, Math.max(targetSaving, 0)), (f.robots * K.robotReplacesWorkers) / manualBase) : 0;
  }

  private buyRobots(buyer: Firm, cost: number): void {
    const maker = this.sectorFirms[SECTOR_INDEX.robotics].find((x) => x.alive);
    const foreign = maker ? cost * K.robotImportShare : cost;
    this.pay(buyer, this.world, foreign, "Imports");
    if (maker && maker !== buyer) {
      const part = cost - foreign;
      this.pay(buyer, maker, part, "Robot sales");
      maker.revenue += part;
      maker.sold += part / maker.price;
      maker.inventory -= part / maker.price;
      this.m.sold += part / maker.price;
    }
  }

  private creditLimit(f: Firm): number {
    const bankHealth = this.bank.cash / Math.max(1, this.bankLoans() + this.bonds);
    const appetite = Math.max(0, Math.min(1, (bankHealth - 0.02) / 0.04));
    return (f.lastRevenue > 0 ? f.lastRevenue : f.revenue + 1) * 14 * appetite;
  }

  private bankLoans(): number {
    let loans = 0;
    for (const p of this.persons) loans += p.mortgage;
    for (const f of this.firms) loans += f.loan;
    for (const h of this.homes) loans += h.legacyLoan;
    return loans;
  }

  // ------------------------------------------------------------------ end of month

  private closeMonth(): void {
    this.payPeople();
    this.housingAndLoans();
    this.settleFirms();
    this.bankAndInterest();
    this.fiscalAndMonetary();
    this.lifeCycle();
    this.housingMarket();
    this.entryAndNewIndustries();
    this.recomputeDemandShares();
    this.setBudgets();
    this.recordMonth();
  }

  private payPeople(): void {
    const c = this.controls;
    const automationShare = this.automationFund / this.persons.length;
    this.lastAutomationDividend = automationShare;
    this.automationFund = 0;
    for (const p of this.persons) {
      let net = 0;
      if (p.status === EMPLOYED) {
        const f = this.firms[p.firmId];
        const gross = p.wage;
        const tax = this.taxOn(gross);
        this.pay(f.isPublic ? this.gov : f, p, gross, "Wages");
        this.pay(p, this.gov, tax, "Income tax");
        if (f.isPublic) {
          this.m.publicWages += gross;
        } else {
          const payroll = gross * K.payrollTax;
          this.pay(f, this.gov, payroll, "Payroll tax");
          f.costPayroll += payroll;
        }
        f.costWages += gross;
        p.tenureMonths++;
        p.monthsWorkedRecently = Math.min(12, p.monthsWorkedRecently + 1);
        net = gross - tax;
        p.incomeLabel = "Salary";
      } else if (p.status === RETIRED) {
        const tax = this.taxOn(p.pension);
        this.pay(this.gov, p, p.pension, "Pensions");
        this.pay(p, this.gov, tax, "Income tax");
        net = p.pension - tax;
        p.incomeLabel = "Pension";
      } else {
        p.monthsUnemployed++;
        net = this.paySupport(p);
      }
      // Citizen dividend reaches every adult: last month's automation tax plus any budget-funded part.
      const amount = c.citizenDividend * this.priceIndex + automationShare;
      if (amount > 0) {
        this.pay(this.gov, p, amount, "Citizen dividend");
        net += amount;
      }
      p.netIncome = net;
      p.netIncomeSmooth += (net - p.netIncomeSmooth) * 0.35;
    }
  }

  private paySupport(p: Person): number {
    const level = this.controls.support;
    let gross = 0;
    p.support = "none";
    // Whether someone qualifies is settled by the work they did before this spell.
    if (p.monthsUnemployed <= 14 && p.everHad && p.monthsWorkedRecently >= 4) {
      if (p.uiMember) {
        const stage = K.uiStages.find((x) => p.monthsUnemployed <= x.months) ?? K.uiStages[2];
        gross = Math.min(K.uiCeiling * this.wageIndexM, stage.rate * p.lastWage) * level;
        p.incomeLabel = `Unemployment insurance (${Math.round(stage.rate * 100)}%)`;
      } else {
        gross = K.uiBasic * this.wageIndexM * level;
        p.incomeLabel = "Basic unemployment benefit";
      }
      p.support = "insurance";
    }
    let net = 0;
    if (gross > 0) {
      const tax = this.taxOn(gross);
      this.pay(this.gov, p, gross, "Unemployment insurance");
      this.pay(p, this.gov, tax, "Income tax");
      net = gross - tax;
    }
    // Social assistance tops up to the national norm plus reasonable housing, if savings are gone.
    if (p.cash < K.assistanceCashLimit * this.priceIndex) {
      const norm = K.assistanceNorm * this.priceIndex + Math.min(p.housingCost, K.assistanceHousingCap * this.priceIndex);
      const topUp = norm * level - net;
      if (topUp > 0) {
        this.pay(this.gov, p, topUp, "Social assistance");
        net += topUp;
        p.support = "assistance";
        p.incomeLabel = "Social assistance";
      }
    }
    if (p.support === "none") p.incomeLabel = "No income: living on savings";
    return net;
  }

  private settleFirms(): void {
    const c = this.controls;
    const seatPrice = (K.aiSeatBase + K.aiSeatPerLevel * c.aiLevel) * this.priceIndex;
    const softwareFirms = this.sectorFirms[SECTOR_INDEX.software];
    for (const f of this.firms) {
      if (!f.alive) continue;
      // AI seats: most of the fee leaves the country.
      const seats = Math.round(f.countK * f.aiAdoption);
      if (seats > 0 && c.aiLevel > 0) {
        const fee = seats * seatPrice;
        const payer: Account = f.isPublic ? this.gov : f;
        const abroad = fee * K.aiForeignShare;
        this.pay(payer, this.world, abroad, "AI software fees");
        const domestic = fee - abroad;
        const alive = softwareFirms.filter((x) => x.alive);
        if (alive.length) {
          for (const v of alive) {
            const part = domestic * v.shareWeight;
            this.pay(payer, v, part, "AI software fees");
            v.revenue += part;
          }
        } else {
          this.pay(payer, this.world, domestic, "AI software fees");
        }
        f.costAi += fee;
      }
      // Robots must be maintained; this covers wear and replacement.
      if (f.robots > 0) {
        const cost = f.robots * K.robotPrice * this.priceIndex * K.robotMaintenanceRate;
        const maker = this.sectorFirms[SECTOR_INDEX.robotics].find((x) => x.alive);
        const local = maker && maker !== f ? cost * 0.5 : 0;
        const payer: Account = f.isPublic ? this.gov : f;
        if (maker && local > 0) {
          this.pay(payer, maker, local, "Robot maintenance");
          maker.revenue += local;
        }
        this.pay(payer, this.world, cost - local, "Robot maintenance");
        f.costRobots += cost;
      }
    }
    // Second pass: every fee has now reached the vendors, so each company's profit is complete.
    for (const f of this.firms) {
      if (!f.alive || f.isPublic) continue;

      // Automation tax on the wage cost saved.
      if (c.automationTax > 0) {
        const output = f.produced;
        const savedK = (f.laborK * this.tfp - this.labourK(f)) * output * K.wageKnowledge * this.wageIndexK;
        const savedM = (f.laborM * this.tfp - this.labourM(f)) * output * K.wageManual * this.wageIndexM;
        const tax = c.automationTax * (savedK + savedM) * (1 + K.payrollTax);
        if (tax > 0) {
          this.pay(f, this.gov, tax, "Automation tax");
          f.automationTaxPaid += tax;
          this.automationFund += tax;
        }
      }
      // Loan service.
      if (f.loan > 0) {
        const interest = (f.loan * (this.policyRate + K.firmLoanSpread)) / 12;
        this.pay(f, this.bank, interest, "Loan interest");
        f.costInterest += interest;
        const principal = Math.min(f.loan, f.loan / 96);
        this.repay(f, principal);
      }

      const costs = f.costWages + f.costPayroll + f.costImports + f.costB2b + f.costAi + f.costRobots + f.costInterest + f.automationTaxPaid;
      const profit = f.revenue - costs;
      if (profit > 0) {
        const tax = profit * K.corporateTax;
        this.pay(f, this.gov, tax, "Corporate tax");
        f.taxPaid += tax;
      }
      // Keep a cash buffer; pay out the rest.
      const buffer = (f.costWages + f.costPayroll + f.costImports) * 2 + 100000;
      if (f.cash > buffer) {
        const payout = (f.cash - buffer) * 0.6;
        this.distributeDividends(f, payout);
      }
      // Cover a cash shortfall with bank credit, or fail.
      if (f.cash < 0) {
        const need = -f.cash + (f.costWages + f.costPayroll) * 0.5;
        if (f.loan + need <= this.creditLimit(f)) this.lend(f, need);
        else {
          f.negativeMonths++;
        }
      } else {
        f.negativeMonths = Math.max(0, f.negativeMonths - 1);
      }
      f.lastProfit = profit;
    }
    for (const f of this.firms) {
      if (f.alive && !f.isPublic && (f.negativeMonths >= 3 || (f.cash < 0 && f.loan > this.creditLimit(f) * 1.6 && f.negativeMonths >= 2))) {
        this.bankrupt(f);
      }
    }
    // Month results for the UI, then reset counters.
    for (const f of this.firms) {
      f.lastRevenue = f.revenue;
      f.lastSold = f.sold;
      f.lastProduced = f.produced;
      if (f.alive) {
        f.history.push({ revenue: f.revenue, profit: f.lastProfit, jobs: f.employees.length, output: f.produced, price: f.price });
        if (f.history.length > 480) f.history.shift();
      }
    }
  }

  private distributeDividends(f: Account & { dividendsPaid?: number }, amount: number): void {
    if (amount <= 0) return;
    if (f.dividendsPaid !== undefined) f.dividendsPaid += amount;
    const foreign = amount * K.foreignOwnership;
    this.pay(f, this.world, foreign, "Dividends");
    const domestic = amount - foreign;
    const holders = this.persons.filter((p) => p.shares > 0);
    const total = holders.reduce((a, p) => a + p.shares, 0);
    if (total <= 0) {
      this.pay(f, this.world, domestic, "Dividends");
      return;
    }
    for (const p of holders) {
      const part = (domestic * p.shares) / total;
      this.pay(f, p, part, "Dividends");
      p.dividendSmooth += part;
    }
  }

  private bankrupt(f: Firm): void {
    f.alive = false;
    f.closedDay = this.day;
    this.m.bankruptcies++;
    this.event("bankrupt", -1, f.id, `${f.name} went bankrupt, ${f.employees.length} jobs lost`, f.employees.length);
    for (const id of [...f.employees]) this.release(this.persons[id], "bankrupt");
    f.vacK = 0;
    f.vacM = 0;
    // Whatever is owed and cannot be paid is lost by the bank, or by the world for unpaid suppliers.
    if (f.cash > 0) {
      const paid = Math.min(f.cash, f.loan);
      this.repay(f, paid);
      if (f.cash > 0) this.pay(f, this.world, f.cash, "Imports");
    } else if (f.cash < 0) {
      // A negative balance is an unpaid overdraft: the bank absorbs it with the loan.
      const debt = -f.cash;
      f.cash = 0;
      this.flows[FLOW_INDEX["Loan write-offs"] * NUM_BOOKS + BOOK_FIRMS] += debt;
      this.flows[FLOW_INDEX["Loan write-offs"] * NUM_BOOKS + BOOK_BANK] -= debt;
      this.bank.cash -= debt;
      this.badLoans += debt;
    }
    if (f.loan > 0) {
      this.bank.cash -= f.loan;
      this.badLoans += f.loan;
      const row = FLOW_INDEX["Loan write-offs"] * NUM_BOOKS;
      this.flows[row + BOOK_BANK] -= f.loan;
      this.flows[row + BOOK_FIRMS] += f.loan;
      f.loan = 0;
    }
    f.inventory = 0;
    f.robots = 0;
    this.updateFirmShares();
  }

  private housingAndLoans(): void {
    const mortgageRate = this.policyRate + K.mortgageSpread;
    const rentFirm = this.sectorFirms[SECTOR_INDEX.housing];
    const landlord = rentFirm.find((f) => f.alive);
    const payHousing = (p: Person, amount: number) => {
      if (landlord) {
        this.pay(p, landlord, amount, "Rent & housing fees");
        landlord.revenue += amount;
        landlord.sold += amount / landlord.price;
        landlord.inventory -= amount / landlord.price;
        this.m.sold += amount / landlord.price;
      } else {
        this.pay(p, this.world, amount, "Rent & housing fees");
      }
    };
    for (const p of this.persons) {
      const due = p.housingCost;
      const interest = (p.mortgage * mortgageRate) / 12;
      const principal = p.mortgage > 0 ? Math.min(p.mortgage, p.mortgage * 0.0012 + 800) : 0;
      const total = due + interest + principal;
      if (p.cash >= total) {
        payHousing(p, due);
        if (interest > 0) this.pay(p, this.bank, interest, "Loan interest");
        if (principal > 0) this.repay(p, principal);
        p.arrears = Math.max(0, p.arrears - 0.5);
      } else {
        // Pay what can be paid; interest first for owners, rent for renters.
        const available = Math.max(0, p.cash);
        if (p.housing === "rent") {
          payHousing(p, Math.min(due, available));
        } else {
          const toBank = Math.min(interest, available);
          if (toBank > 0) this.pay(p, this.bank, toBank, "Loan interest");
          const left = available - toBank;
          if (left > 0) payHousing(p, Math.min(due, left));
        }
        p.arrears += 1;
        if (p.arrears >= 2 && p.arrears < 3) this.logPerson(p, "arrears", "Fell behind on housing payments");
        if (p.arrears >= (p.housing === "rent" ? 4 : 6)) this.loseHome(p);
      }
    }
  }

  private loseHome(p: Person): void {
    const home = this.homes[p.homeId];
    if (p.housing !== "rent") {
      this.m.foreclosures++;
      this.logPerson(p, "foreclosed", "Lost the house to foreclosure, moved to a cheap rental");
      this.event("foreclosed", p.id, -1, `${p.name} lost their home to foreclosure`);
      // The debt follows the house until it is resold.
      if (home) {
        home.occupants = 0;
        home.vacant = true;
        home.foreclosed = true;
        home.legacyLoan = p.mortgage;
        home.heirId = -1;
      }
      p.mortgage = 0;
      p.housing = "rent";
      p.homeId = this.apartmentWithRoom();
      p.housingCost = 5600 * this.priceIndex;
    } else {
      this.m.evictions++;
      this.logPerson(p, "evicted", "Evicted, moved to the cheapest housing available");
      this.event("evicted", p.id, -1, `${p.name} was evicted for unpaid rent`);
      p.housingCost = Math.min(p.housingCost, 5000 * this.priceIndex);
    }
    p.arrears = 0;
  }

  private apartmentWithRoom(): number {
    let apt = this.homes.find((h) => h.kind === "apartment" && h.occupants < h.capacity);
    if (!apt) {
      apt = { id: this.homes.length, kind: "apartment", occupants: 0, capacity: 12, vacant: false, foreclosed: false, legacyLoan: 0, heirId: -1 };
      this.homes.push(apt);
    }
    apt.occupants++;
    return apt.id;
  }

  private bankAndInterest(): void {
    const depositRate = Math.max(0, this.policyRate + K.depositSpread);
    if (depositRate > 0) {
      for (const p of this.persons) {
        if (p.cash > 0) this.pay(this.bank, p, (p.cash * depositRate) / 12, "Deposit interest");
      }
    }
    if (this.bonds > 0) {
      this.pay(this.gov, this.bank, (this.bonds * (this.policyRate + K.bondSpread)) / 12, "Bond interest");
    }
    // Bank pays out what it does not need to stay well capitalised.
    const capitalTarget = (this.bankLoans() + this.bonds) * 0.1;
    if (this.bank.cash > capitalTarget) {
      this.distributeDividends(this.bank, (this.bank.cash - capitalTarget) * 0.5);
    }
  }

  private fiscalAndMonetary(): void {
    // Government borrows when it runs short, which creates deposits.
    if (this.gov.cash < 0) {
      const amount = -this.gov.cash;
      this.bonds += amount;
      this.gov.cash = 0;
      const row = FLOW_INDEX["Bond issue"] * NUM_BOOKS;
      this.flows[row + BOOK_GOVERNMENT] += amount;
      this.flows[row + BOOK_BANK] -= amount;
    } else if (this.gov.cash > 0 && this.bonds > 0) {
      const amount = Math.min(this.gov.cash, this.bonds);
      this.bonds -= amount;
      this.gov.cash -= amount;
      const row = FLOW_INDEX["Bond issue"] * NUM_BOOKS;
      this.flows[row + BOOK_GOVERNMENT] -= amount;
      this.flows[row + BOOK_BANK] += amount;
    }

    // Fiscal rule: a slow pull of public debt towards its target through income tax.
    const lastYear = this.history.slice(-12);
    if (lastYear.length === 12) {
      const annual = lastYear.reduce((a, h) => a + h.gdpNominal, 0);
      const debtRatio = this.bonds / Math.max(1, annual);
      const pull = 0.00035 * (debtRatio - 0.35) + (this.gov.cash > 0 ? -0.0002 : 0);
      this.taxAdjustment = Math.max(-0.2, Math.min(0.12, this.taxAdjustment + Math.max(-0.0015, Math.min(0.0015, pull))));
    }

    // Prices and interest rates.
    let priceWeighted = 0;
    let weight = 0;
    for (let i = 0; i < SECTORS.length; i++) {
      const firms = this.sectorFirms[i].filter((f) => f.alive && !f.isPublic);
      if (!firms.length) continue;
      let shareSum = 0;
      let price = 0;
      for (const f of firms) { price += f.price * f.shareWeight; shareSum += f.shareWeight; }
      this.sectorPrice[i] = shareSum > 0 ? price / shareSum : 100 * this.priceIndex;
      const w = this.sectorBaseShare[i];
      priceWeighted += this.sectorPrice[i] * w;
      weight += w;
    }
    if (weight > 0) this.priceIndex = priceWeighted / weight / 100;
    this.priceYearAgo.push(this.priceIndex);
    if (this.priceYearAgo.length > 13) this.priceYearAgo.shift();
    const inflation = this.inflation();
    const u = this.unemploymentRate();
    const target = Math.max(0, K.policyRate + 1.5 * (inflation - 0.02) - 0.4 * (u - K.targetUnemployment));
    this.policyRate += (target - this.policyRate) * 0.08;

    // Annual wage round in April: weak response to unemployment, as in sector agreements.
    if (new Date(this.date).getUTCMonth() === 3) {
      const uK = this.unemploymentOf(true);
      const uM = this.unemploymentOf(false);
      const growth = (uRate: number) => Math.max(-0.005, Math.min(0.07, 0.027 + 0.4 * (inflation - 0.02) - 0.35 * (uRate - K.targetUnemployment)));
      const gK = growth(uK);
      const gM = growth(uM);
      this.wageIndexK *= 1 + gK;
      this.wageIndexM *= 1 + gM;
      for (const p of this.persons) {
        if (p.status === EMPLOYED) p.wage *= 1 + (p.knowledge ? gK : gM);
        if (p.status === RETIRED) p.pension *= 1 + Math.max(0, inflation);
        if (p.housing === "rent") p.housingCost *= 1 + Math.max(0, Math.min(0.06, inflation + 0.005));
        else p.housingCost *= 1 + Math.max(0, inflation);
      }
    }
    this.tfp *= Math.pow(1 - K.baseTfpGrowth, 1 / 12);
    this.worldPrice *= Math.pow(1 + K.worldInflation, 1 / 12);
    this.worldReal *= Math.pow(1 + K.worldRealGrowth, 1 / 12);
    this.housePriceIndex *= 1 + this.houseGrowth(u);
    this.lastUnemployment = u;
    // Public sector hiring: AI lets the state do more with somewhat fewer, without layoffs.
    for (const f of this.firms) {
      if (!f.isPublic) continue;
      const s = SECTORS[f.sector];
      this.adoptAutomation(f);
      const saving = 0.5 * (f.aiSaving * s.aiExposure * s.knowledge + f.robotSaving * (1 - s.knowledge));
      const target2 = f.publicTarget * (1 - saving);
      const wantK = Math.round(target2 * s.knowledge);
      const wantM = Math.round(target2 * (1 - s.knowledge));
      f.vacK = Math.max(0, wantK - f.countK);
      f.vacM = Math.max(0, wantM - f.countM);
    }
  }

  private houseGrowth(u: number): number {
    const vacant = this.homes.reduce((a, h) => a + (h.vacant ? 1 : 0), 0);
    const pressure = -0.8 * (u - this.lastUnemployment) - 0.0003 * vacant - 0.02 * (u - K.targetUnemployment) / 12;
    return Math.max(-0.02, Math.min(0.012, 0.0028 - 0.08 * (this.policyRate - K.policyRate) / 12 + pressure));
  }

  private inflation(): number {
    const n = this.priceYearAgo.length;
    if (n >= 13) return this.priceIndex / this.priceYearAgo[0] - 1;
    if (n < 4) return 0.02;
    // Early on, blend the target with what has been seen so far, annualised.
    const seen = Math.pow(this.priceIndex / this.priceYearAgo[0], 12 / (n - 1)) - 1;
    const weight = (n - 1) / 12;
    return 0.02 * (1 - weight) + seen * weight;
  }

  private unemploymentRate(): number {
    let u = 0;
    let w = 0;
    for (const p of this.persons) {
      if (p.status === UNEMPLOYED) { u++; w++; } else if (p.status === EMPLOYED) w++;
    }
    return w ? u / w : 0;
  }

  private unemploymentOf(knowledge: boolean): number {
    let u = 0;
    let w = 0;
    for (const p of this.persons) {
      if (p.knowledge !== knowledge) continue;
      if (p.status === UNEMPLOYED) { u++; w++; } else if (p.status === EMPLOYED) w++;
    }
    return w ? u / w : 0;
  }

  // ------------------------------------------------------------------ life cycle

  private lifeCycle(): void {
    const r = this.rng;
    for (const p of this.persons) {
      p.age += 1 / 12;
      if (p.status !== RETIRED && p.age >= p.retireAge) {
        const base = Math.max(p.lastWage, K.wageManual * this.wageIndexM * 0.7);
        if (p.status === EMPLOYED) this.release(p, "retired");
        p.status = RETIRED;
        p.support = "none";
        p.pension = base * K.pensionRatio;
        this.m.retirements++;
        this.logPerson(p, "retired", `Retired at ${Math.floor(p.age)}`);
        this.event("retired", p.id, -1, `${p.name} retired at ${Math.floor(p.age)}`);
      } else if (p.status === EMPLOYED && p.tenureMonths > 3 && r.chance(0.0065)) {
        this.release(p, "quit");
      }
      // Mortality, rising with age. Each death is replaced by someone entering the workforce.
      const hazard = p.age < 60 ? 0.00012 : p.age < 75 ? 0.001 : Math.min(0.08, 0.002 * Math.exp((p.age - 75) * 0.13));
      if (r.chance(hazard)) this.replacePerson(p);
    }
  }

  /** Death: estate passes on, and a young person takes this slot in the population. */
  private replacePerson(old: Person): void {
    if (old.status === EMPLOYED) this.release(old, "retired");
    const r = this.rng;
    const young = r.range(19.5, 25);
    const estate = old.cash;
    const home = this.homes[old.homeId];
    const shares = old.shares;
    const heirs = this.persons.filter((p) => p !== old && p.status !== RETIRED);
    const heir = heirs.length ? r.pick(heirs) : null;
    // House goes on the market carrying its loan; the heir receives what is left when sold.
    if (old.housing !== "rent" && home) {
      home.occupants = 0;
      home.vacant = true;
      home.foreclosed = false;
      home.legacyLoan = old.mortgage;
      home.heirId = heir ? heir.id : -1;
      old.mortgage = 0;
    } else if (home) {
      home.occupants = Math.max(0, home.occupants - 1);
    }
    const grant = Math.min(estate, 25000 + r.range(0, 25000));
    const rest = estate - grant;
    if (heir && rest > 0) {
      old.cash -= rest;
      heir.cash += rest;
    } else if (rest > 0) {
      this.pay(old, this.gov, rest, "Inheritance & home sales");
    }
    if (heir && shares > 0) heir.shares += shares;
    this.event("died", old.id, -1, `${old.name} passed away at ${Math.floor(old.age)}`);

    for (const h of this.homes) if (h.heirId === old.id) h.heirId = -1;
    // Same id, so references and the visual slot stay valid.
    const startingCash = old.cash;
    const fresh = this.makePerson(young);
    Object.assign(fresh, {
      id: old.id, knowledge: this.rng.chance(this.entrantKnowledgeShare()), status: UNEMPLOYED, neverWorked: true, everHad: false,
      cash: startingCash, retireAge: r.range(K.retireAgeMin, K.retireAgeMax),
    });
    fresh.housing = "rent";
    fresh.housingCost = r.range(5000, 8000) * this.priceIndex;
    fresh.homeId = this.apartmentWithRoom();
    fresh.netIncome = 0;
    fresh.netIncomeSmooth = 0;
    fresh.monthBudget = 6000;
    this.persons[old.id] = fresh;
    this.m.entrants++;
    this.logPerson(fresh, "entered", `Entered the workforce at ${Math.floor(young)} and started looking for work`);
    this.event("entered", fresh.id, -1, `${fresh.name} entered the workforce`);
  }

  /** Keeps the workforce at about half knowledge workers across generations. */
  private entrantKnowledgeShare(): number {
    let k = 0;
    let n = 0;
    for (const p of this.persons) {
      if (p.status === RETIRED) continue;
      n++;
      if (p.knowledge) k++;
    }
    return n ? Math.max(0.25, Math.min(0.75, 0.5 + (0.5 - k / n) * 4)) : 0.5;
  }

  private housingMarket(): void {
    const r = this.rng;
    const vacant = this.homes.filter((h) => h.vacant);
    if (!vacant.length) return;
    const mortgageRate = this.policyRate + K.mortgageSpread;
    for (const home of vacant) {
      if (!r.chance(0.2)) continue;
      const price = 3000000 * this.housePriceIndex * this.priceIndex * (home.foreclosed ? 0.85 : 1);
      const down = price * 0.1;
      const loan = price - down;
      const candidates: Person[] = [];
      for (let tries = 0; tries < 40 && candidates.length < 4; tries++) {
        const p = r.pick(this.persons);
        if (p.housing !== "rent" || p.status !== EMPLOYED || p.tenureMonths < 6 || p.cash < down) continue;
        if (loan > p.wage * 12 * 5.5) continue;
        if ((loan * mortgageRate) / 12 > p.wage * 0.35) continue;
        candidates.push(p);
      }
      if (!candidates.length) continue;
      const buyer = candidates[0];
      this.lend(buyer, loan);
      // Sale clears the debt on the house first; any shortfall is the bank's loss.
      const repaid = Math.min(price, home.legacyLoan);
      buyer.cash -= repaid;
      const row = FLOW_INDEX["Loan repayment"] * NUM_BOOKS;
      this.flows[row + BOOK_HOUSEHOLDS] -= repaid;
      this.flows[row + BOOK_BANK] += repaid;
      this.writeOff(home.legacyLoan - repaid);
      const remainder = price - repaid;
      const heir = home.heirId >= 0 ? this.persons[home.heirId] : null;
      if (heir && heir !== buyer) this.pay(buyer, heir, remainder, "Inheritance & home sales");
      else if (!heir) this.pay(buyer, this.bank, remainder, "Inheritance & home sales");
      home.legacyLoan = 0;
      home.vacant = false;
      home.foreclosed = false;
      home.heirId = -1;
      home.occupants = 1;
      const oldHome = this.homes[buyer.homeId];
      if (oldHome) oldHome.occupants = Math.max(0, oldHome.occupants - 1);
      buyer.homeId = home.id;
      buyer.housing = "mortgage";
      buyer.housingCost = 2500 * this.priceIndex;
      this.logPerson(buyer, "bought", "Bought a house with a mortgage");
    }
  }

  // ------------------------------------------------------------------ entry and exit

  private entryAndNewIndustries(): void {
    const c = this.controls;
    // Reinstatement: new kinds of work appear in response to what has been automated.
    const saving = this.laborSavedShare();
    this.globalSaving += (saving - this.globalSaving) * 0.05;
    const target = c.newJobs * saving * 1.3;
    this.newTaskIndex += (target - this.newTaskIndex) * 0.03;

    const emerging = this.sectorFirms[SECTOR_INDEX.emerging];
    const aliveEmerging = emerging.filter((f) => f.alive).length;
    const wanted = this.newTaskIndex > 0.25 ? 4 : this.newTaskIndex > 0.12 ? 3 : this.newTaskIndex > 0.05 ? 2 : this.newTaskIndex > 0.015 ? 1 : 0;
    if (aliveEmerging < wanted && this.rng.chance(0.2)) this.foundFirm(SECTOR_INDEX.emerging);

    // Failed companies leave a gap that a start-up may fill if the sector is doing fine.
    const closed = this.firms.filter((f) => !f.alive && !f.isPublic && SECTORS[f.sector].key !== "emerging");
    for (const f of closed) {
      const daysClosed = this.day - f.closedDay;
      if (daysClosed > 300 && this.rng.chance(0.02)) {
        const peers = this.sectorFirms[f.sector].filter((x) => x.alive);
        const profitable = peers.length === 0 || peers.some((x) => x.lastProfit > 0);
        if (profitable && peers.length < SECTORS[f.sector].firms) this.foundFirm(f.sector);
      }
    }
    // Keep the labour coefficients of old firms if a sector is empty: handled in foundFirm.
    this.updateFirmShares();
  }

  private laborSavedShare(): number {
    let saved = 0;
    let total = 0;
    for (const f of this.firms) {
      if (!f.alive) continue;
      const s = SECTORS[f.sector];
      const size = f.employees.length + 1;
      saved += size * (s.knowledge * f.aiSaving * s.aiExposure + (1 - s.knowledge) * f.robotSaving);
      total += size;
    }
    return total ? saved / total : 0;
  }

  private foundFirm(sector: number): void {
    const s = SECTORS[sector];
    const used: Record<string, number> = { [s.key]: this.firms.filter((f) => f.sector === sector).length };
    const f = this.makeFirm(sector, this.firmName(s.key, used), 0.2);
    const peers = this.sectorFirms[sector].filter((x) => x.alive && x !== f);
    const reference = peers[0];
    const labourShare = 1 - s.importShare - s.b2bShare - s.margin;
    const avgWage = s.wagePremium * (s.knowledge * K.wageKnowledge + (1 - s.knowledge) * K.wageManual);
    // Start-ups are labour intensive: about 1 unit of revenue per 100 of price.
    const perUnit = reference ? (reference.laborK + reference.laborM) : (100 * labourShare) / (avgWage * (1 + K.payrollTax));
    f.laborK = perUnit * s.knowledge;
    f.laborM = perUnit * (1 - s.knowledge);
    f.price = reference ? reference.price : 100 * this.priceIndex * (this.wageIndexK / Math.max(0.5, this.priceIndex)) ** 0.5;
    f.markup = s.margin / Math.max(0.1, labourShare);
    f.forecast = reference ? reference.forecast * 0.3 : 0.2;
    f.targetOutput = f.forecast;
    f.inventory = f.forecast * 15;
    this.lend(f, 400000 * this.priceIndex);
    this.m.newFirms++;
    this.event("founded", -1, f.id, `${f.name} opened for business in ${s.name}`);
    const needK = f.targetOutput * DAYS * this.labourK(f);
    const needM = f.targetOutput * DAYS * this.labourM(f);
    f.vacK = Math.max(1, Math.ceil(needK));
    f.vacM = Math.ceil(needM);
    f.decisionDay = this.rng.int(1, 28);
  }

  private updateFirmShares(): void {
    for (let i = 0; i < SECTORS.length; i++) {
      const firms = this.sectorFirms[i].filter((f) => f.alive);
      if (!firms.length) continue;
      let total = 0;
      const avg = firms.reduce((a, f) => a + f.price, 0) / firms.length;
      for (const f of firms) {
        // Cheaper firms take share; strong backlogs turn buyers away.
        const stockPenalty = f.inventory < -f.forecast * 10 ? 0.7 : 1;
        f.shareWeight = Math.pow(f.quality + 0.03, 1) * Math.pow(f.price / avg, -2.2) * stockPenalty;
        total += f.shareWeight;
      }
      for (const f of firms) f.shareWeight /= total;
      for (const f of this.sectorFirms[i]) if (!f.alive) f.shareWeight = 0;
    }
  }

  // ------------------------------------------------------------------ household demand

  private budgetFor(p: Person, income: number, scale: number): number {
    const index = this.priceIndex;
    const housing = p.housingCost + (p.mortgage * (this.policyRate + K.mortgageSpread)) / 12 + (p.mortgage > 0 ? p.mortgage * 0.0012 + 800 : 0);
    const free = income - housing;
    const liquidity = p.cash / Math.max(8000 * index, income);
    let mpc = 0.78 + 0.2 * Math.exp(-liquidity / 3);
    if (p.status === UNEMPLOYED) mpc *= 0.85;
    const fromWealth = 0.008 * Math.max(0, p.cash - 2 * (housing + K.subsistence * index));
    let budget = mpc * scale * Math.max(0, free) + 0.35 * p.dividendSmooth + fromWealth;
    if (p.status === UNEMPLOYED) budget *= 0.9;
    const floor = Math.min(K.subsistence * index, Math.max(0, p.cash + free) * 0.9);
    return Math.max(budget, floor);
  }

  /** When things get cheaper, elastic wants raise total spending; saturated wants lower it. */
  private cheapnessEffect(): number {
    const relativePrice = this.priceIndex / this.worldPrice;
    const elasticity = 0.3 + 1.75 * this.controls.demandResponse;
    return Math.max(0.7, Math.min(1.25, Math.pow(relativePrice, 1 - elasticity)));
  }

  private setBudgets(): void {
    const cheapness = this.cheapnessEffect();
    for (const p of this.persons) {
      p.lastSpend = p.spendThisMonth;
      // People who already have what they want stop spending more; people short of money do not hit this.
      p.monthBudget = Math.min(this.personalSpendingCap, this.budgetFor(p, p.netIncomeSmooth, this.mpcScale) * cheapness);
      p.dividendSmooth *= 0.7;
      p.spendHistory.push(p.spendThisMonth);
      p.savingsHistory.push(p.cash);
      p.incomeHistory.push(p.netIncome);
      if (p.savingsHistory.length > 240) { p.savingsHistory.shift(); p.incomeHistory.shift(); p.spendHistory.shift(); }
      p.spendThisMonth = 0;
      p.unitsThisMonth = 0;
    }
  }

  /** How spending splits between sectors, after relative prices and how much people can use. */
  private recomputeDemandShares(): void {
    const c = this.controls;
    const dr = c.demandResponse;
    const n = SECTORS.length;
    const share = new Float64Array(n);
    const emerging = SECTOR_INDEX.emerging;
    let budget = 0;
    for (const p of this.persons) budget += p.monthBudget;
    const netBudget = (budget * (1 - K.consumerImportShare)) / (1 + K.vat);
    const P = this.priceIndex * 100;
    let total = 0;
    for (let i = 0; i < n; i++) {
      const base = i === emerging ? Math.min(0.4, this.newTaskIndex * 0.7) : this.sectorBaseShare[i];
      if (base <= 0) continue;
      const elasticity = SECTORS[i].elasticity * (0.4 + 1.2 * dr);
      share[i] = base * Math.pow(this.sectorPrice[i] / P, 1 - elasticity);
      total += share[i];
    }
    if (total > 0) for (let i = 0; i < n; i++) share[i] /= total;

    // Wants saturate: spending past what people can use moves to other sectors, or stays unspent.
    const realGrowth = this.worldReal;
    const open = new Set<number>();
    for (let i = 0; i < n; i++) if (share[i] > 0) open.add(i);
    const spend = new Float64Array(n);
    let remaining = netBudget;
    for (let round = 0; round < 6 && remaining > 1 && open.size; round++) {
      let openShare = 0;
      for (const i of open) openShare += share[i];
      if (openShare <= 0) break;
      const roundBudget = remaining;
      for (const i of [...open]) {
        const def = SECTORS[i];
        const stretch = 1 + (def.saturation - 1) * (0.02 + 0.85 * dr * dr + 0.13 * dr) + this.newTaskIndex * 0.5;
        const perPerson = i === emerging ? this.newTaskIndex * this.sectorTotalRealPerPerson() * 1.2 : this.sectorRealPerPerson[i] * stretch * realGrowth;
        const capUnits = perPerson * this.population;
        const capValue = capUnits * this.sectorPrice[i];
        const add = (roundBudget * share[i]) / openShare;
        const room = capValue - spend[i];
        if (add >= room) {
          spend[i] += Math.max(0, room);
          remaining -= Math.max(0, room);
          open.delete(i);
        } else {
          spend[i] += add;
          remaining -= add;
        }
      }
    }
    let capValueTotal = 0;
    for (let i = 0; i < n; i++) {
      if (share[i] <= 0) continue;
      const def = SECTORS[i];
      const stretch = 1 + (def.saturation - 1) * (0.02 + 0.85 * dr * dr + 0.13 * dr) + this.newTaskIndex * 0.5;
      const perPerson = i === emerging ? this.newTaskIndex * this.sectorTotalRealPerPerson() * 1.2 : this.sectorRealPerPerson[i] * stretch * realGrowth;
      capValueTotal += perPerson * this.sectorPrice[i];
    }
    // Individual limit in shop prices, allowing for people's wants differing from the average.
    this.personalSpendingCap = (capValueTotal * 1.6 * (1 + K.vat)) / (1 - K.consumerImportShare);
    let spent = 0;
    for (let i = 0; i < n; i++) spent += spend[i];
    if (spent > 0) {
      for (let i = 0; i < n; i++) this.sectorShare[i] = spend[i] / spent;
      this.spendFactor = Math.max(0.05, Math.min(1, spent / Math.max(1, netBudget)));
    }
  }

  private sectorTotalRealPerPerson(): number {
    let total = 0;
    for (let i = 0; i < SECTORS.length; i++) total += this.sectorRealPerPerson[i];
    return total;
  }

  // ------------------------------------------------------------------ statistics

  private recordMonth(): void {
    const stats = this.buildStats();
    this.history.push(stats);
    this.lastFlows.set(this.flows);
    this.yearFlows.push(Float64Array.from(this.flows));
    if (this.yearFlows.length > 12) this.yearFlows.shift();
    this.flows.fill(0);
    for (const f of this.firms) {
      f.produced = 0; f.sold = 0; f.revenue = 0; f.costWages = 0; f.costPayroll = 0; f.costImports = 0; f.costB2b = 0;
      f.costAi = 0; f.costRobots = 0; f.costInterest = 0; f.costHousingEtc = 0; f.taxPaid = 0; f.automationTaxPaid = 0;
      f.dividendsPaid = 0; f.hires = 0; f.layoffs = 0;
    }
    this.m = Economy.emptyMonth();
  }

  /** The first month's real GDP, so the index starts at exactly 100. */
  private gdpBase(current: number): number {
    if (this.gdpStart === 0) this.gdpStart = Math.max(1, current);
    return this.gdpStart;
  }

  private flow(category: FlowCategory, book: number): number {
    return this.flows[FLOW_INDEX[category] * NUM_BOOKS + book];
  }

  private buildStats(): MonthStats {
    const m = this.m;
    let employed = 0, unemployed = 0, retired = 0, uK = 0, wK = 0, uM = 0, wM = 0, uY = 0, wY = 0, longTerm = 0;
    let onInsurance = 0, onAssistance = 0, arrears = 0, noBuffer = 0, debt = 0;
    let publicJobs = 0, emergingJobs = 0;
    let wageSum = 0;
    const savings: number[] = [];
    let householdIncome = 0;
    for (const p of this.persons) {
      savings.push(Math.max(0, p.cash));
      householdIncome += p.netIncome;
      debt += p.mortgage;
      if (p.arrears >= 1) arrears++;
      if (p.cash < 2 * (K.subsistence + p.housingCost)) noBuffer++;
      if (p.status === RETIRED) { retired++; continue; }
      const young = p.age < 26;
      if (p.status === EMPLOYED) {
        employed++;
        wageSum += p.wage;
        const f = this.firms[p.firmId];
        if (f.isPublic) publicJobs++;
        if (f.sector === SECTOR_INDEX.emerging) emergingJobs++;
      } else {
        unemployed++;
        if (p.monthsUnemployed >= 12) longTerm++;
        if (p.support === "insurance") onInsurance++;
        if (p.support === "assistance") onAssistance++;
      }
      const isU = p.status === UNEMPLOYED ? 1 : 0;
      if (p.knowledge) { uK += isU; wK++; } else { uM += isU; wM++; }
      if (young) { uY += isU; wY++; }
    }
    savings.sort((a, b) => a - b);
    const n = savings.length;
    const savingsTotal = savings.reduce((a, b) => a + b, 0);
    const top10 = savings.slice(Math.floor(n * 0.9)).reduce((a, b) => a + b, 0);
    const bottom50 = savings.slice(0, Math.floor(n * 0.5)).reduce((a, b) => a + b, 0);
    let giniSum = 0;
    savings.forEach((v, i) => { giniSum += (2 * (i + 1) - n - 1) * v; });
    const gini = savingsTotal > 0 ? giniSum / (n * savingsTotal) : 0;

    let revenue = 0, profit = 0, wageBill = 0, firmCash = 0, firmDebt = 0, firmsAlive = 0, vacancies = 0, seats = 0, robots = 0, inv = 0;
    let aiWeighted = 0, kWorkers = 0, rbWeighted = 0, mWorkers = 0, adoption = 0, adoptionWeight = 0, costInputs = 0, privateJobs = 0, divPaid = 0;
    for (const f of this.firms) {
      if (!f.alive) continue;
      const s = SECTORS[f.sector];
      vacancies += f.vacK + f.vacM;
      seats += Math.round(f.countK * f.aiAdoption);
      robots += f.robots;
      const w = f.employees.length + 1;
      aiWeighted += w * f.aiSaving * s.aiExposure * s.knowledge;
      kWorkers += w * s.knowledge;
      rbWeighted += w * f.robotSaving * (1 - s.knowledge);
      mWorkers += w * (1 - s.knowledge);
      adoption += w * f.aiAdoption * s.knowledge;
      adoptionWeight += w * s.knowledge;
      if (f.isPublic) continue;
      firmsAlive++;
      privateJobs += f.employees.length;
      revenue += f.lastRevenue;
      profit += f.lastProfit;
      wageBill += f.costWages + f.costPayroll;
      firmCash += f.cash;
      firmDebt += f.loan;
      inv += f.inventory;
      costInputs += f.costImports + f.costB2b + f.costAi + f.costRobots;
      divPaid += f.dividendsPaid;
    }
    const income = {
      income: this.flow("Income tax", BOOK_GOVERNMENT),
      payroll: this.flow("Payroll tax", BOOK_GOVERNMENT),
      vat: this.flow("VAT", BOOK_GOVERNMENT),
      corp: this.flow("Corporate tax", BOOK_GOVERNMENT),
      auto: this.flow("Automation tax", BOOK_GOVERNMENT),
    };
    const govIncome = income.income + income.payroll + income.vat + income.corp + income.auto + Math.max(0, this.flow("Inheritance & home sales", BOOK_GOVERNMENT));
    const spend = {
      pensions: -this.flow("Pensions", BOOK_GOVERNMENT),
      insurance: -this.flow("Unemployment insurance", BOOK_GOVERNMENT),
      assistance: -this.flow("Social assistance", BOOK_GOVERNMENT),
      dividend: -this.flow("Citizen dividend", BOOK_GOVERNMENT),
      purchases: -this.flow("Government purchases", BOOK_GOVERNMENT) - this.flow("AI software fees", BOOK_GOVERNMENT) - this.flow("Robot maintenance", BOOK_GOVERNMENT),
      interest: -this.flow("Bond interest", BOOK_GOVERNMENT),
    };
    const publicGross = m.publicWages;
    const govSpending = publicGross + spend.pensions + spend.insurance + spend.assistance + spend.dividend + spend.purchases + spend.interest;
    const budgetBalance = govIncome - govSpending;

    // GDP: value added by companies plus the public payroll.
    const gdpNominal = Math.max(0, revenue - costInputs) + publicGross;
    const price = this.priceIndex;
    const history = this.history;
    const annualGdp = history.slice(-11).reduce((a, h) => a + h.gdpNominal, gdpNominal) * (12 / Math.min(12, history.length + 1));
    const workers = employed || 1;
    const imports = this.flow("Imports", BOOK_WORLD) + this.flow("AI software fees", BOOK_WORLD) + this.flow("Robot maintenance", BOOK_WORLD);

    const stats: MonthStats = {
      day: this.day, date: this.date,
      population: this.persons.length, employed, unemployed, retired, workforce: employed + unemployed,
      unemploymentRate: unemployed / Math.max(1, employed + unemployed),
      unemploymentKnowledge: uK / Math.max(1, wK), unemploymentManual: uM / Math.max(1, wM), unemploymentYouth: uY / Math.max(1, wY),
      longTermUnemployed: longTerm, vacancies,
      hires: m.hires, layoffs: m.layoffs, quits: m.quits, retirements: m.retirements, entrants: m.entrants,
      publicJobs, privateJobs,
      gdpNominal, gdpReal: gdpNominal / price / this.gdpBase(gdpNominal / price), unitsProduced: m.produced, unitsSold: m.sold,
      capacityUnits: m.capacity, inventoryUnits: inv, priceIndex: price, inflation: this.inflation(),
      savingsTotal, savingsMedian: savings[Math.floor(n / 2)], savingsMean: savingsTotal / n,
      savingsTop10Share: savingsTotal > 0 ? top10 / savingsTotal : 0, savingsBottom50: bottom50, noBuffer,
      mortgageDebt: debt, householdIncome: householdIncome + this.flow("Dividends", BOOK_HOUSEHOLDS) + this.flow("Deposit interest", BOOK_HOUSEHOLDS), consumption: m.consumption, consumptionReal: m.consumptionReal,
      consumptionPerEmployed: m.spendEmployed / workers, consumptionPerUnemployed: m.spendUnemployed / Math.max(1, unemployed),
      wageIndexReal: (0.5 * (this.wageIndexK + this.wageIndexM)) / price, averageWage: wageSum / workers, gini,
      arrears, evictions: m.evictions, foreclosures: m.foreclosures, housePriceIndex: this.housePriceIndex,
      onInsurance, onAssistance, supportPaid: spend.insurance + spend.assistance,
      dividendPerAdult: this.controls.citizenDividend * price + this.lastAutomationDividend,
      firmsAlive, bankruptcies: m.bankruptcies, newFirms: m.newFirms,
      revenue, profit, profitMargin: revenue > 0 ? profit / revenue : 0, profitPerWorker: profit / Math.max(1, privateJobs),
      revenuePerWorker: revenue / Math.max(1, privateJobs), wageBill, wageShare: gdpNominal > 0 ? (wageBill + publicGross) / gdpNominal : 0,
      dividendsPaid: divPaid, firmCash, firmDebt, investment: m.investment, emergingJobs,
      aiAdoption: adoptionWeight ? adoption / adoptionWeight : 0, aiSeats: seats, aiSaving: kWorkers ? aiWeighted / kWorkers : 0,
      aiFees: this.firms.reduce((a, f) => a + f.costAi, 0),
      aiFeesAbroad: this.flow("AI software fees", BOOK_WORLD),
      robots, robotSaving: mWorkers ? rbWeighted / mWorkers : 0, robotSpend: m.investment,
      taskEfficiencyKnowledge: kWorkers ? 1 / Math.max(0.05, 1 - aiWeighted / kWorkers) : 1,
      taskEfficiencyManual: mWorkers ? 1 / Math.max(0.05, 1 - rbWeighted / mWorkers) : 1,
      govIncome, taxIncome: income.income, taxPayroll: income.payroll, taxVat: income.vat, taxCorporate: income.corp, taxAutomation: income.auto,
      govSpending, spendPublicWages: publicGross, spendPensions: spend.pensions, spendInsurance: spend.insurance, spendAssistance: spend.assistance,
      spendDividend: spend.dividend, spendPurchases: spend.purchases, spendInterest: spend.interest,
      budgetBalance, govDebt: this.bonds, debtToGdp: annualGdp > 0 ? this.bonds / annualGdp : 0,
      policyRate: this.policyRate, bankEquity: this.bank.cash, bankLoans: this.bankLoans(), badLoans: this.badLoans,
      netExports: this.flow("Exports", BOOK_WORLD) * -1 - imports,
      moneyError: this.moneyError(),
    };
    return stats;
  }
}
