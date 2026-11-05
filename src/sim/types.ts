export const EMPLOYED = 0;
export const UNEMPLOYED = 1;
export const RETIRED = 2;
export type Status = 0 | 1 | 2;

export type Support = "none" | "insurance" | "assistance";
export type Tenure = "rent" | "mortgage" | "owned";

export interface Account {
  cash: number;
  /** Column in the flow matrix: see SECTOR_* below. */
  book: number;
}

export const BOOK_HOUSEHOLDS = 0;
export const BOOK_FIRMS = 1;
export const BOOK_GOVERNMENT = 2;
export const BOOK_BANK = 3;
export const BOOK_WORLD = 4;
export const BOOK_NAMES = ["Households", "Companies", "Government", "Bank", "Rest of world"];

export const FLOW_CATEGORIES = [
  "Wages", "Payroll tax", "Income tax", "VAT", "Corporate tax", "Automation tax",
  "Pensions", "Unemployment insurance", "Social assistance", "Citizen dividend",
  "Household purchases", "Rent & housing fees", "Exports", "Imports", "Government purchases",
  "Business purchases", "AI software fees", "Robot sales", "Robot maintenance", "Dividends",
  "Deposit interest", "Loan interest", "Bond interest", "Inheritance & home sales",
  "Loan issue (new money)", "Loan repayment", "Bond issue", "Loan write-offs",
] as const;
export type FlowCategory = (typeof FLOW_CATEGORIES)[number];
export const FLOW_INDEX = Object.fromEntries(FLOW_CATEGORIES.map((c, i) => [c, i])) as Record<FlowCategory, number>;

export interface LifeEvent {
  day: number;
  kind: string;
  text: string;
}

export interface Person extends Account {
  id: number;
  name: string;
  age: number;
  knowledge: boolean;
  skill: number;
  status: Status;
  firmId: number;
  wage: number;
  lastWage: number;
  tenureMonths: number;
  monthsUnemployed: number;
  monthsWorkedRecently: number;
  neverWorked: boolean;
  everHad: boolean;
  uiMember: boolean;
  support: Support;
  pension: number;
  retireAge: number;
  housing: Tenure;
  homeId: number;
  housingCost: number;
  mortgage: number;
  arrears: number;
  shares: number;
  netIncome: number;
  netIncomeSmooth: number;
  dividendSmooth: number;
  monthBudget: number;
  spendThisMonth: number;
  unitsThisMonth: number;
  lastSpend: number;
  incomeLabel: string;
  log: LifeEvent[];
  savingsHistory: number[];
  incomeHistory: number[];
  spendHistory: number[];
}

export interface Firm extends Account {
  id: number;
  name: string;
  sector: number;
  isPublic: boolean;
  alive: boolean;
  slot: number;
  founded: number;
  closedDay: number;
  quality: number;
  decisionDay: number;
  /** Labour per unit of output at no automation. */
  laborK: number;
  laborM: number;
  employees: number[];
  countK: number;
  countM: number;
  vacK: number;
  vacM: number;
  publicTarget: number;
  inventory: number;
  forecast: number;
  targetOutput: number;
  price: number;
  markup: number;
  loan: number;
  robots: number;
  robotAdoption: number;
  aiAdoption: number;
  aiSaving: number;
  robotSaving: number;
  shareWeight: number;
  negativeMonths: number;
  // Month counters, reset each month.
  produced: number;
  sold: number;
  revenue: number;
  costWages: number;
  costPayroll: number;
  costImports: number;
  costB2b: number;
  costAi: number;
  costRobots: number;
  costInterest: number;
  costHousingEtc: number;
  taxPaid: number;
  automationTaxPaid: number;
  dividendsPaid: number;
  hires: number;
  layoffs: number;
  // Results of the last complete month, used by the UI.
  lastRevenue: number;
  lastProfit: number;
  lastSold: number;
  lastProduced: number;
  history: FirmMonth[];
}

export interface FirmMonth {
  revenue: number;
  profit: number;
  jobs: number;
  output: number;
  price: number;
}

export type HomeKind = "house" | "apartment";

export interface Home {
  id: number;
  kind: HomeKind;
  occupants: number;
  capacity: number;
  /** Houses only: on the market after death or foreclosure. */
  vacant: boolean;
  foreclosed: boolean;
  legacyLoan: number;
  heirId: number;
}

export interface MonthStats {
  day: number;
  date: number;
  // Jobs
  population: number;
  employed: number;
  unemployed: number;
  retired: number;
  workforce: number;
  unemploymentRate: number;
  unemploymentKnowledge: number;
  unemploymentManual: number;
  unemploymentYouth: number;
  longTermUnemployed: number;
  vacancies: number;
  hires: number;
  layoffs: number;
  quits: number;
  retirements: number;
  entrants: number;
  publicJobs: number;
  privateJobs: number;
  // Output
  gdpNominal: number;
  gdpReal: number;
  unitsProduced: number;
  unitsSold: number;
  capacityUnits: number;
  inventoryUnits: number;
  priceIndex: number;
  inflation: number;
  // Households
  savingsTotal: number;
  savingsMedian: number;
  savingsMean: number;
  savingsTop10Share: number;
  savingsBottom50: number;
  noBuffer: number;
  mortgageDebt: number;
  householdIncome: number;
  consumption: number;
  consumptionReal: number;
  consumptionPerEmployed: number;
  consumptionPerUnemployed: number;
  wageIndexReal: number;
  averageWage: number;
  gini: number;
  arrears: number;
  evictions: number;
  foreclosures: number;
  housePriceIndex: number;
  // Support
  onInsurance: number;
  onAssistance: number;
  supportPaid: number;
  dividendPerAdult: number;
  // Companies
  firmsAlive: number;
  bankruptcies: number;
  newFirms: number;
  revenue: number;
  profit: number;
  profitMargin: number;
  profitPerWorker: number;
  revenuePerWorker: number;
  wageBill: number;
  wageShare: number;
  dividendsPaid: number;
  firmCash: number;
  firmDebt: number;
  investment: number;
  emergingJobs: number;
  // Automation
  aiAdoption: number;
  aiSeats: number;
  aiSaving: number;
  aiFees: number;
  aiFeesAbroad: number;
  robots: number;
  robotSaving: number;
  robotSpend: number;
  taskEfficiencyKnowledge: number;
  taskEfficiencyManual: number;
  // Government
  govIncome: number;
  taxIncome: number;
  taxPayroll: number;
  taxVat: number;
  taxCorporate: number;
  taxAutomation: number;
  govSpending: number;
  spendPublicWages: number;
  spendPensions: number;
  spendInsurance: number;
  spendAssistance: number;
  spendDividend: number;
  spendPurchases: number;
  spendInterest: number;
  budgetBalance: number;
  govDebt: number;
  debtToGdp: number;
  // Money
  policyRate: number;
  bankEquity: number;
  bankLoans: number;
  badLoans: number;
  netExports: number;
  moneyError: number;
}

export interface SimEvent {
  day: number;
  kind:
    | "hired" | "laidoff" | "quit" | "retired" | "entered" | "died"
    | "bankrupt" | "founded" | "evicted" | "foreclosed" | "robots" | "ai";
  personId: number;
  firmId: number;
  text: string;
  count?: number;
}
