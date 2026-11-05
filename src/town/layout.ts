import { Rng } from "../sim/rng.ts";

export const BLOCK = 18;
export const ROAD = 3.4;
export const GRID = 9;
export const HALF = (GRID * BLOCK) / 2;

export interface Lot { x: number; z: number; doorX: number; doorZ: number; }
export type Zone = "office" | "industry" | "house" | "apartment" | "park" | "civic";
export interface Block { i: number; j: number; x: number; z: number; zone: Zone; }

/** Fixed street plan: an office centre, industry to the east, homes and parks around. */
export class TownLayout {
  readonly blocks: Block[] = [];
  readonly houseLots: Lot[] = [];
  readonly apartmentLots: Lot[] = [];
  readonly officeSlots: Lot[] = [];
  readonly factorySlots: Lot[] = [];
  /** Port-side blocks: container yards, used by factories only if the main row fills up. */
  readonly yardSlots: Lot[] = [];
  readonly stores: Lot[] = [];
  readonly trees: { x: number; z: number; scale: number }[] = [];
  readonly townHall: Lot;
  readonly bank: Lot;
  readonly jobCentre: Lot;
  readonly port: Lot;

  constructor(seed = 7) {
    const r = new Rng(seed);
    const center = (GRID - 1) / 2;
    const parkPicks = new Set(["0,0", "8,8", "1,6", "2,2", "0,4", "6,8", "6,0", "3,8"]);
    const apartmentPicks = new Set(["2,3", "2,4", "2,5", "3,2", "4,2", "5,2", "3,6", "4,6", "5,6", "1,3"]);
    for (let i = 0; i < GRID; i++) {
      for (let j = 0; j < GRID; j++) {
        const x = (i - center) * BLOCK;
        const z = (j - center) * BLOCK;
        let zone: Zone = "house";
        if (i === 4 && j === 4) zone = "civic";
        else if (i >= 3 && i <= 5 && j >= 3 && j <= 5) zone = "office";
        else if (i >= 7 && j >= 1 && j <= 7) zone = "industry";
        else if (i === 6 && j >= 2 && j <= 6) zone = "office";
        else if (apartmentPicks.has(`${i},${j}`)) zone = "apartment";
        else if (parkPicks.has(`${i},${j}`)) zone = "park";
        this.blocks.push({ i, j, x, z, zone });
      }
    }

    const front = (x: number, z: number, b: Block, inset: number): Lot => {
      // Door faces the nearer street.
      const dx = x - b.x;
      const dz = z - b.z;
      const half = (BLOCK - ROAD) / 2;
      if (Math.abs(dx) > Math.abs(dz)) return { x, z, doorX: b.x + Math.sign(dx || 1) * (half + 0.2), doorZ: z + inset };
      return { x, z, doorX: x + inset, doorZ: b.z + Math.sign(dz || 1) * (half + 0.2) };
    };

    for (const b of this.blocks) {
      if (b.zone === "house") {
        const n = 4;
        const spacing = (BLOCK - ROAD - 2.4) / (n - 1);
        for (let a = 0; a < n; a++) {
          for (let c = 0; c < n; c++) {
            const x = b.x + (a - (n - 1) / 2) * spacing + r.range(-0.2, 0.2);
            const z = b.z + (c - (n - 1) / 2) * spacing + r.range(-0.2, 0.2);
            this.houseLots.push(front(x, z, b, 0));
          }
        }
      } else if (b.zone === "apartment") {
        for (const [a, c] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const x = b.x + a * 3.7;
          const z = b.z + c * 3.7;
          this.apartmentLots.push(front(x, z, b, 0));
        }
      } else if (b.zone === "office") {
        this.officeSlots.push(front(b.x + 3, b.z - 3, b, 0));
        this.officeSlots.push(front(b.x - 3.6, b.z + 3.4, b, 0));
      } else if (b.zone === "industry") {
        const slots = b.i === 7 ? this.factorySlots : this.yardSlots;
        slots.push(front(b.x, b.z - 3.6, b, 0));
        slots.push(front(b.x, b.z + 3.8, b, 0));
      } else if (b.zone === "park") {
        for (let t = 0; t < 34; t++) {
          this.trees.push({ x: b.x + r.range(-7, 7), z: b.z + r.range(-7, 7), scale: r.range(0.7, 1.5) });
        }
      }
      if (b.zone === "house") {
        for (let t = 0; t < 3; t++) this.trees.push({ x: b.x + r.range(-7.6, 7.6), z: b.z + r.range(-7.6, 7.6), scale: r.range(0.45, 0.8) });
      }
    }
    // Shops line the edge of the centre, at the corners people pass on their way home.
    for (const [i, j, ox, oz] of [[3, 3, -3.6, -3.6], [5, 3, 3.6, -3.4], [3, 5, -3.4, 3.6], [5, 5, 3.6, 3.6], [4, 3, 0, -3.8], [4, 5, 0, 3.8]]) {
      const b = this.blocks.find((x) => x.i === i && x.j === j)!;
      this.stores.push(front(b.x + ox, b.z + oz, b, 0));
    }
    const civic = this.blocks.find((b) => b.zone === "civic")!;
    this.townHall = front(civic.x, civic.z - 2.6, civic, 0);
    this.bank = front(civic.x - 4.4, civic.z + 4.2, civic, 0);
    this.jobCentre = front(civic.x + 4.4, civic.z + 4.2, civic, 0);
    this.port = { x: HALF + 11, z: 0, doorX: HALF + 2, doorZ: 0 };
    this.factorySlots.push(...this.yardSlots);
    // Keep shops apart from office towers sharing their block.
    const clear = (slots: Lot[]) => slots.filter((s) => this.stores.every((m) => Math.hypot(m.x - s.x, m.z - s.z) > 4.6));
    const offices = clear(this.officeSlots);
    this.officeSlots.length = 0;
    this.officeSlots.push(...offices);
  }

  /** Nearest road line coordinate for a value. */
  private roadLine(v: number): number {
    const center = (GRID - 1) / 2;
    const index = Math.round(v / BLOCK + center + 0.5);
    const clamped = Math.max(0, Math.min(GRID, index));
    return (clamped - center - 0.5) * BLOCK;
  }

  /**
   * Writes a street route into `out` as x,z pairs: door, along streets, door. Returns the number of points.
   * Figures chase these points with a low-pass filter, which rounds the corners.
   */
  route(ax: number, az: number, bx: number, bz: number, lane: number, out: Float32Array): number {
    const roadA = this.roadLine(az);
    const roadB = this.roadLine(bz);
    const crossA = this.roadLine(ax);
    const crossB = this.roadLine(bx);
    let n = 0;
    const add = (x: number, z: number) => { out[n * 2] = x; out[n * 2 + 1] = z; n++; };
    add(ax, az);
    // Choose the entry street from which way the door faces.
    if (Math.abs(az - roadA) < Math.abs(ax - crossA)) {
      add(ax, roadA + lane);
      if (Math.abs(roadA - roadB) < 0.1) {
        add(bx, roadA + lane);
      } else {
        add(crossB + lane, roadA + lane);
        add(crossB + lane, roadB + lane);
        add(bx, roadB + lane);
      }
    } else {
      add(crossA + lane, az);
      if (Math.abs(crossA - crossB) < 0.1) {
        add(crossA + lane, bz);
      } else {
        add(crossA + lane, roadB + lane);
        add(crossB + lane, roadB + lane);
        add(crossB + lane, bz);
      }
    }
    add(bx, bz);
    return n;
  }
}
