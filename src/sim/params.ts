/** The few levers the user sees. Everything else is a calibrated constant below. */
export interface Controls {
  /** AI software: share of labour time saved on fully exposed knowledge tasks (0 to 0.95). */
  aiLevel: number;
  /** Robots: share of labour time saved on fully exposed manual tasks (0 to 0.95). */
  robotLevel: number;
  /** How far people's wants expand when things get cheaper (0 saturated, 1 very elastic). */
  demandResponse: number;
  /** How readily new kinds of work appear when old tasks are automated (0 to 1). */
  newJobs: number;
  /** Multiplier on unemployment insurance and social assistance (0.5 to 1.5). */
  support: number;
  /** Tax on the wage cost companies save through automation (0 to 0.6). All of it goes back to every adult. */
  automationTax: number;
  /** Extra citizen dividend from the state budget, kr per adult per month, in start-year money. */
  citizenDividend: number;
}

export const DEFAULT_CONTROLS: Controls = {
  aiLevel: 0,
  robotLevel: 0,
  demandResponse: 0.4,
  newJobs: 0.3,
  support: 1,
  automationTax: 0,
  citizenDividend: 0,
};

/** The run warms up for one month, so the first thing the user sees is 1 Nov 2026 with real figures. */
export const SIM_START = Date.UTC(2026, 9, 1);

export const K = {
  population: 800,
  /** Monthly gross pay at start for an average-skill worker. */
  wageKnowledge: 50000,
  wageManual: 35000,
  payrollTax: 0.3142,
  incomeTax: 0.26,
  stateTax: 0.2,
  stateTaxThreshold: 53500,
  vat: 0.18,
  consumerImportShare: 0.13,
  corporateTax: 0.206,
  pensionRatio: 0.62,
  retireAgeMin: 64,
  retireAgeMax: 68,
  /** A-kassa, from research: 80/70/65% up to a ceiling, up to 300 working days (about 14 months). */
  uiCeiling: 27200,
  uiStages: [
    { months: 3.3, rate: 0.8 },
    { months: 6.6, rate: 0.7 },
    { months: 14, rate: 0.65 },
  ],
  uiBasic: 11000,
  uiMembership: 0.8,
  /** Riksnorm for a single adult. */
  assistanceNorm: 5220,
  assistanceHousingCap: 9000,
  assistanceCashLimit: 15000,
  subsistence: 6000,
  policyRate: 0.02,
  mortgageSpread: 0.0175,
  firmLoanSpread: 0.03,
  depositSpread: -0.015,
  bondSpread: 0.003,
  robotPrice: 850000,
  robotMaintenanceRate: 0.009,
  robotReplacesWorkers: 2.2,
  robotImportShare: 0.4,
  aiSeatBase: 900,
  aiSeatPerLevel: 3200,
  aiForeignShare: 0.65,
  baseTfpGrowth: 0.01,
  worldInflation: 0.016,
  worldRealGrowth: 0.011,
  /** Above this cost saving, firms keep this share as margin rather than cutting prices. */
  passThrough: 0.55,
  initialUnemployment: 0.1,
  targetUnemployment: 0.06,
  foreignOwnership: 0.2,
  wealthyShare: 0.28,
};

export interface SectorDef {
  key: string;
  name: string;
  isPublic: boolean;
  /** Jobs per 1000 people at start. */
  jobs: number;
  firms: number;
  /** Share of tasks that are knowledge work. */
  knowledge: number;
  /** How much of a knowledge task AI software can do, and of a manual task a robot can do. */
  aiExposure: number;
  robotExposure: number;
  /** Cost structure as shares of revenue. */
  importShare: number;
  b2bShare: number;
  margin: number;
  /** Who buys, as shares of revenue. The rest is households. */
  exportShare: number;
  govShare: number;
  /** Share of the B2B market this sector serves. */
  b2bSupply: number;
  /** Price elasticity at neutral demand response, and how far real demand per person can grow. */
  elasticity: number;
  saturation: number;
  wagePremium: number;
  adoptionSpeed: number;
}

const privateSector = (s: Partial<SectorDef> & Pick<SectorDef, "key" | "name" | "jobs" | "firms" | "knowledge">): SectorDef => ({
  isPublic: false,
  aiExposure: 0.6,
  robotExposure: 0.5,
  importShare: 0.1,
  b2bShare: 0.06,
  margin: 0.12,
  exportShare: 0,
  govShare: 0,
  b2bSupply: 0,
  elasticity: 1,
  saturation: 2,
  wagePremium: 1,
  adoptionSpeed: 1,
  ...s,
});

export const SECTORS: SectorDef[] = [
  privateSector({ key: "food", name: "Food & Groceries", jobs: 66, firms: 3, knowledge: 0.15, aiExposure: 0.6, robotExposure: 0.7, importShare: 0.22, margin: 0.08, exportShare: 0.18, govShare: 0.1, elasticity: 0.5, saturation: 1.25, wagePremium: 0.95 }),
  privateSector({ key: "goods", name: "Consumer Goods", jobs: 88, firms: 3, knowledge: 0.25, aiExposure: 0.7, robotExposure: 0.9, importShare: 0.3, margin: 0.12, exportShare: 0.6, govShare: 0.1, elasticity: 1.2, saturation: 2.5, adoptionSpeed: 0.9 }),
  privateSector({ key: "leisure", name: "Hospitality & Leisure", jobs: 56, firms: 3, knowledge: 0.12, aiExposure: 0.5, robotExposure: 0.3, importShare: 0.14, margin: 0.1, exportShare: 0.15, elasticity: 1.4, saturation: 3.5, wagePremium: 0.92, adoptionSpeed: 0.7 }),
  privateSector({ key: "software", name: "Software & Media", jobs: 62, firms: 3, knowledge: 0.95, aiExposure: 0.95, robotExposure: 0, importShare: 0.08, margin: 0.22, exportShare: 0.4, govShare: 0.12, b2bSupply: 0.3, elasticity: 1.5, saturation: 6, wagePremium: 1.2, adoptionSpeed: 1.8 }),
  privateSector({ key: "finance", name: "Finance & Insurance", jobs: 38, firms: 2, knowledge: 0.9, aiExposure: 0.95, robotExposure: 0.2, importShare: 0.04, margin: 0.28, exportShare: 0.12, b2bSupply: 0.15, elasticity: 0.7, saturation: 1.8, wagePremium: 1.2, adoptionSpeed: 1.5 }),
  privateSector({ key: "services", name: "Professional Services", jobs: 84, firms: 3, knowledge: 0.95, aiExposure: 0.85, robotExposure: 0.1, importShare: 0.04, margin: 0.18, exportShare: 0.2, b2bSupply: 0.45, govShare: 0.25, elasticity: 1, saturation: 3, wagePremium: 1.05, adoptionSpeed: 1.3 }),
  privateSector({ key: "construction", name: "Construction", jobs: 45, firms: 2, knowledge: 0.1, aiExposure: 0.5, robotExposure: 0.4, importShare: 0.18, margin: 0.1, govShare: 0.6, elasticity: 1, saturation: 2, adoptionSpeed: 0.5 }),
  privateSector({ key: "logistics", name: "Logistics & Utilities", jobs: 40, firms: 2, knowledge: 0.15, aiExposure: 0.6, robotExposure: 0.8, importShare: 0.15, margin: 0.1, exportShare: 0.15, govShare: 0.2, b2bSupply: 0.1, elasticity: 0.6, saturation: 1.5, adoptionSpeed: 0.8 }),
  privateSector({ key: "robotics", name: "Robotics", jobs: 11, firms: 1, knowledge: 0.6, aiExposure: 0.7, robotExposure: 0.6, importShare: 0.3, margin: 0.12, exportShare: 0.7, elasticity: 1, saturation: 2, wagePremium: 1.15, adoptionSpeed: 1.3 }),
  privateSector({ key: "housing", name: "Real Estate", jobs: 16, firms: 1, knowledge: 0.5, aiExposure: 0.7, robotExposure: 0.4, importShare: 0.05, b2bShare: 0.1, margin: 0.3, elasticity: 0, saturation: 1, adoptionSpeed: 0.7 }),
  privateSector({ key: "emerging", name: "New Industries", jobs: 0, firms: 0, knowledge: 0.55, aiExposure: 0.2, robotExposure: 0.1, importShare: 0.05, margin: 0.14, elasticity: 1.2, saturation: 8, wagePremium: 1.05, adoptionSpeed: 0.8 }),
  { ...privateSector({ key: "health", name: "Public Healthcare", jobs: 95, firms: 1, knowledge: 0.3, aiExposure: 0.45, robotExposure: 0.2, adoptionSpeed: 0.6 }), isPublic: true },
  { ...privateSector({ key: "education", name: "Public Education", jobs: 62, firms: 1, knowledge: 0.75, aiExposure: 0.4, robotExposure: 0.05, adoptionSpeed: 0.5 }), isPublic: true },
  { ...privateSector({ key: "admin", name: "Public Administration", jobs: 46, firms: 1, knowledge: 0.85, aiExposure: 0.7, robotExposure: 0.1, adoptionSpeed: 0.6 }), isPublic: true },
];

export const SECTOR_INDEX = Object.fromEntries(SECTORS.map((s, i) => [s.key, i])) as Record<string, number>;

export const FIRM_NAMES: Record<string, string[]> = {
  food: ["Freshfield Foods", "Harvest & Co", "Northmarket", "Grönvik Provisions", "Daily Table"],
  goods: ["Ironbark Works", "Nordform", "Halden Manufacturing", "Lumen Household", "Vale Goods"],
  leisure: ["Tidewater Hotels", "Lantern Dining", "Summit Leisure", "Sundvik Resorts", "The Copper Kettle"],
  software: ["Quanta Systems", "Bitforge", "Aster Media", "Northwind Cloud", "Parallel Labs"],
  finance: ["Meridian Insurance", "Crown Mutual", "Novaria Capital", "Fjord Assurance"],
  services: ["Keystone Advisory", "Lindqvist & Berg", "Atlas Consulting", "Cedar Legal", "Polaris Partners"],
  construction: ["Stonebridge Build", "Granit & Son", "Bedrock Civil"],
  logistics: ["Swift Freight", "Novaria Power", "Ringroad Logistics", "Baltic Utilities"],
  robotics: ["Automata Novaria", "Kinetic Robotics"],
  housing: ["Novaria Homes", "Hearthstone Living"],
  emerging: ["Human Touch Studio", "Oversight Guild", "Kindred Care", "Craftline", "Newfound Experiences", "Atelier Nine"],
  health: ["Novaria Health Service"],
  education: ["Novaria Schools"],
  admin: ["Government Offices"],
};

export const GIVEN_NAMES = ["Anna","Erik","Maja","Lars","Sofia","Nils","Elsa","Karl","Ingrid","Oskar","Astrid","Johan","Freja","Axel","Linnea","Gustav","Klara","Emil","Saga","Henrik","Ida","Viktor","Alma","Magnus","Tove","Leo","Sara","Omar","Amina","Yusuf","Leila","Mateo","Lucia","Noor","Hassan","Mira","Theo","Vera","Adam","Ebba","Hugo","Nora","Felix","Signe","Isak","Greta","Samir","Dalia","Jonas","Petra"];
export const FAMILY_NAMES = ["Lund","Berg","Holm","Dahl","Ek","Strand","Falk","Sjö","Vik","Nord","Hale","Moreau","Rahman","Costa","Novak","Haddad","Lindgren","Ström","Sandell","Wik","Ahmadi","Ferreira","Kovac","Blom","Hedlund"];
