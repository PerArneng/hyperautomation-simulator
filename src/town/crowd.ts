import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Economy } from "../sim/economy.ts";
import { SECTORS } from "../sim/params.ts";
import { EMPLOYED, RETIRED, UNEMPLOYED } from "../sim/types.ts";
import type { Person, SimEvent } from "../sim/types.ts";
import { STATUS } from "../ui/colors.ts";
import type { TownLayout } from "./layout.ts";
import { glowInstanceMaterial } from "./scene.ts";
import type { TownWorld } from "./world.ts";

const STATE_HOME = 0;
const STATE_WALK = 1;
const STATE_WORK = 2;
const STATE_SHOP = 3;
const STATE_IDLE = 4;
const STATE_QUEUE = 5;
const STATE_LEISURE = 6;

/** Length of one visual day in real seconds. Calendar speed runs separately so motion stays calm. */
export const VISUAL_DAY = 45;

const tmp = new THREE.Object3D();
const color = new THREE.Color();
const tmpColor = new THREE.Color();

const C_EMP = new THREE.Color(STATUS.employed);
const C_UNEMP = new THREE.Color(STATUS.unemployed);
const C_RET = new THREE.Color(STATUS.retired);

function instanced(geometry: THREE.BufferGeometry, material: THREE.Material, count: number, shadow = false): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = false;
  mesh.castShadow = shadow;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // Instance colour buffer must exist before first render.
  mesh.setColorAt(0, new THREE.Color("#ffffff"));
  for (let i = 1; i < count; i++) mesh.setColorAt(i, new THREE.Color("#ffffff"));
  return mesh;
}

interface FlyingBox { active: boolean; t: number; duration: number; ax: number; az: number; ay: number; bx: number; bz: number; height: number; spin: number; }
interface Coin { active: boolean; t: number; duration: number; ax: number; az: number; ay: number; bx: number; bz: number; height: number; delay: number; }
interface Ring { active: boolean; t: number; duration: number; x: number; z: number; size: number; r: number; g: number; b: number; }

/** Everything that moves: people, robots, boxes, money and pulses. */
export class Crowd {
  readonly bodies: THREE.InstancedMesh;
  private readonly heads: THREE.InstancedMesh;
  private readonly hats: THREE.InstancedMesh;
  private readonly legsL: THREE.InstancedMesh;
  private readonly legsR: THREE.InstancedMesh;
  private readonly boxes: THREE.InstancedMesh;
  private readonly coins: THREE.InstancedMesh;
  private readonly rings: THREE.InstancedMesh;
  private readonly robots: THREE.InstancedMesh;
  private readonly selection: THREE.Mesh;
  private readonly world: TownWorld;
  private readonly layout: TownLayout;
  private economy!: Economy;
  private count = 0;

  // Per-person animation state. Typed arrays because this runs every frame for everyone.
  x!: Float32Array; z!: Float32Array;
  private tx!: Float32Array; private tz!: Float32Array;
  private heading!: Float32Array;
  private gait!: Float32Array;
  private visible!: Float32Array;
  private state!: Uint8Array;
  private nextState!: Uint8Array;
  private route!: Float32Array;
  private routeLength!: Uint8Array;
  private routeIndex!: Uint8Array;
  private speed!: Float32Array;
  private planDay!: Int32Array;
  private leaveAt!: Float32Array;
  private returnAt!: Float32Array;
  private wantsStore!: Uint8Array;
  private wantsQueue!: Uint8Array;
  private carrying!: Uint8Array;
  private colorR!: Float32Array; private colorG!: Float32Array; private colorB!: Float32Array;
  private lane!: Float32Array;
  private idleNext!: Float32Array;
  private seen!: Int32Array;

  private time = 0;
  private flying: FlyingBox[] = [];
  private coinPool: Coin[] = [];
  private ringPool: Ring[] = [];
  private boxBudget = 0;
  private readonly flyingCount = 280;
  private readonly carriedStart = 280;
  private readonly pileStart: number;
  private readonly pileCount: number;
  private pileLevels: number[] = [];
  private readonly routeScratch = new Float32Array(16);
  private queueCount = 0;
  private selected = -1;
  private baseOutput = 1;
  private robotSpots: { x: number; z: number; phase: number; radius: number }[] = [];
  showMoney = true;
  /** Exposed for tests: people currently out on the street, by status. */
  readonly census = { employedWalking: 0, unemployedCommuting: 0, unemployedVisible: 0 };

  constructor(scene: THREE.Scene, world: TownWorld, layout: TownLayout, capacity: number) {
    this.world = world;
    this.layout = layout;

    const bodyGeo = new THREE.CapsuleGeometry(0.17, 0.42, 3, 8);
    bodyGeo.translate(0, 0.72, 0);
    const figureMat = glowInstanceMaterial({ roughness: 0.55, color: "#ffffff" }, 0.34);
    this.bodies = instanced(bodyGeo, figureMat, capacity, true);
    const headGeo = new THREE.SphereGeometry(0.135, 12, 10);
    headGeo.translate(0, 1.2, 0);
    this.heads = instanced(headGeo, new THREE.MeshStandardMaterial({ color: "#f5dcc6", roughness: 0.6, emissive: "#3a2c22" }), capacity);
    const hatTop = new THREE.SphereGeometry(0.155, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    hatTop.translate(0, 1.24, 0);
    const hatBrim = new THREE.CylinderGeometry(0.2, 0.2, 0.025, 12);
    hatBrim.translate(0, 1.245, 0);
    this.hats = instanced(mergeGeometries([hatTop, hatBrim])!, new THREE.MeshStandardMaterial({ color: "#ffc53d", roughness: 0.4, emissive: "#6a4a00", emissiveIntensity: 0.8 }), capacity);
    const legGeo = new THREE.CapsuleGeometry(0.058, 0.28, 2, 6);
    legGeo.translate(0, -0.2, 0);
    const legMat = glowInstanceMaterial({ roughness: 0.7, color: "#ffffff" }, 0.15);
    this.legsL = instanced(legGeo, legMat, capacity);
    this.legsR = instanced(legGeo, legMat, capacity);

    this.pileStart = this.carriedStart + capacity;
    this.pileCount = layout.stores.length * 28;
    const boxTotal = this.pileStart + this.pileCount;
    this.boxes = instanced(new THREE.BoxGeometry(0.62, 0.62, 0.62), glowInstanceMaterial({ color: "#ffffff", roughness: 0.35, metalness: 0.1 }, 1.05), boxTotal, true);
    for (let i = 0; i < boxTotal; i++) this.boxes.setColorAt(i, color.set("#3f9dff"));
    for (let i = 0; i < this.flyingCount; i++) this.flying.push({ active: false, t: 0, duration: 1, ax: 0, az: 0, ay: 0, bx: 0, bz: 0, height: 0, spin: 0 });

    const coinGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.06, 12);
    this.coins = instanced(coinGeo, new THREE.MeshBasicMaterial({ color: "#ffffff" }), 260);
    for (let i = 0; i < 260; i++) this.coinPool.push({ active: false, t: 0, duration: 1, ax: 0, az: 0, ay: 0, bx: 0, bz: 0, height: 0, delay: 0 });

    const ringGeo = new THREE.RingGeometry(0.82, 1, 40);
    ringGeo.rotateX(-Math.PI / 2);
    this.rings = instanced(ringGeo, new THREE.MeshBasicMaterial({ color: "#ffffff", blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide }), 60);
    for (let i = 0; i < 60; i++) this.ringPool.push({ active: false, t: 0, duration: 1, x: 0, z: 0, size: 1, r: 1, g: 1, b: 1 });

    const robotBody = new THREE.BoxGeometry(0.75, 0.75, 0.6);
    robotBody.translate(0, 0.72, 0);
    const robotHead = new THREE.BoxGeometry(0.46, 0.34, 0.42);
    robotHead.translate(0, 1.3, 0);
    const robotBase = new THREE.CylinderGeometry(0.42, 0.5, 0.34, 10);
    robotBase.translate(0, 0.17, 0);
    const robotArm = new THREE.BoxGeometry(1.25, 0.12, 0.12);
    robotArm.translate(0, 0.88, 0);
    this.robots = instanced(mergeGeometries([robotBody.toNonIndexed(), robotHead.toNonIndexed(), robotBase.toNonIndexed(), robotArm.toNonIndexed()])!, glowInstanceMaterial({ roughness: 0.35, metalness: 0.35, color: "#ffffff" }, 0.6), 420, true);
    for (let i = 0; i < 420; i++) this.robots.setColorAt(i, color.set("#ff9a4d"));

    this.selection = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.72, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.4, 2.4), transparent: true, side: THREE.DoubleSide }));
    this.selection.visible = false;
    scene.add(this.bodies, this.heads, this.hats, this.legsL, this.legsR, this.boxes, this.coins, this.rings, this.robots, this.selection);
  }

  bind(economy: Economy): void {
    this.economy = economy;
    const n = economy.persons.length;
    this.count = n;
    this.x = new Float32Array(n); this.z = new Float32Array(n);
    this.tx = new Float32Array(n); this.tz = new Float32Array(n);
    this.heading = new Float32Array(n);
    this.gait = new Float32Array(n);
    this.visible = new Float32Array(n);
    this.state = new Uint8Array(n);
    this.nextState = new Uint8Array(n);
    this.route = new Float32Array(n * 16);
    this.routeLength = new Uint8Array(n);
    this.routeIndex = new Uint8Array(n);
    this.speed = new Float32Array(n);
    this.planDay = new Int32Array(n).fill(-1);
    this.leaveAt = new Float32Array(n);
    this.returnAt = new Float32Array(n);
    this.wantsStore = new Uint8Array(n);
    this.wantsQueue = new Uint8Array(n);
    this.carrying = new Uint8Array(n);
    this.colorR = new Float32Array(n); this.colorG = new Float32Array(n); this.colorB = new Float32Array(n);
    this.lane = new Float32Array(n);
    this.idleNext = new Float32Array(n);
    this.seen = new Int32Array(n).fill(-1);
    this.time = 0.215;
    this.flying.forEach((b) => { b.active = false; });
    this.coinPool.forEach((c) => { c.active = false; });
    this.ringPool.forEach((r) => { r.active = false; });
    this.pileLevels = this.layout.stores.map(() => 10);
    for (const p of economy.persons) {
      const i = p.id;
      const lot = this.world.lotForHome(p.homeId).lot;
      this.x[i] = this.tx[i] = lot.doorX;
      this.z[i] = this.tz[i] = lot.doorZ;
      const c = this.statusColor(p);
      this.colorR[i] = c.r; this.colorG[i] = c.g; this.colorB[i] = c.b;
      this.lane[i] = (i % 2 === 0 ? 1 : -1) * (0.75 + ((i * 37) % 10) * 0.075);
      this.seen[i] = p.homeId;
    }
    this.baseOutput = 0;
    for (const f of economy.firms) if (!f.isPublic) this.baseOutput += f.forecast;
    this.syncRobots();
  }

  get dayTime(): number {
    return this.time % 1;
  }

  /** Jump to a time of day (0 to 1), for tests and the guided story. */
  setDayTime(t: number): void {
    this.time = Math.floor(this.time) + t;
  }

  private statusColor(p: Person): THREE.Color {
    return p.status === EMPLOYED ? C_EMP : p.status === RETIRED ? C_RET : C_UNEMP;
  }

  select(id: number): void {
    this.selected = id;
    this.selection.visible = id >= 0;
  }

  /** Figures fly the camera to: position of a person now. */
  positionOf(id: number): { x: number; z: number } {
    return { x: this.x[id], z: this.z[id] };
  }

  syncRobots(): void {
    const spots: typeof this.robotSpots = [];
    for (const site of this.world.sites) {
      const f = site.firm;
      if (!f.alive || f.robots <= 0) continue;
      const shown = Math.min(30, f.robots);
      for (let k = 0; k < shown; k++) {
        const side = k % 2 === 0 ? 1 : -1;
        const row = Math.floor(k / 2);
        const halfX = site.office ? 3.6 : 6.6;
        spots.push({ x: site.lot.x - halfX + (row % 12) * (halfX * 2 / 11), z: site.lot.z + side * (site.office ? 3.6 : 3.4), phase: k * 1.7 + f.id, radius: 0.5 });
      }
    }
    this.robotSpots = spots.slice(0, this.robots.count);
  }

  /** Called with engine events, to make changes visible where they happen. */
  onEvents(events: SimEvent[]): void {
    for (const ev of events) {
      if (ev.kind === "hired" && ev.personId >= 0) this.pulse(this.x[ev.personId], this.z[ev.personId], 1.5, 0.3, 1.8, 0.8);
      else if (ev.kind === "laidoff" && ev.personId >= 0) this.pulse(this.x[ev.personId], this.z[ev.personId], 2.2, 2.2, 0.45, 0.5);
      else if (ev.kind === "retired" && ev.personId >= 0) this.pulse(this.x[ev.personId], this.z[ev.personId], 1.2, 1, 1.2, 1.5);
      else if (ev.kind === "bankrupt") {
        const site = this.world.sitesByFirm.get(ev.firmId);
        if (site) { this.pulse(site.lot.x, site.lot.z, 14, 3, 0.5, 0.5); this.pulse(site.lot.x, site.lot.z, 9, 2.4, 0.4, 0.4); }
      } else if (ev.kind === "founded") {
        const site = this.world.sitesByFirm.get(ev.firmId);
        if (site) this.pulse(site.lot.x, site.lot.z, 12, 0.5, 2.6, 1.3);
      } else if (ev.kind === "robots") {
        const site = this.world.sitesByFirm.get(ev.firmId);
        if (site) this.pulse(site.lot.x, site.lot.z, 7, 2.6, 1.3, 0.3);
      }
    }
  }

  private pulse(x: number, z: number, size: number, r: number, g: number, b: number): void {
    const free = this.ringPool.find((p) => !p.active);
    if (!free) return;
    Object.assign(free, { active: true, t: 0, duration: 1.1, x, z, size, r, g, b });
  }

  // ------------------------------------------------------------------ people

  private walkTo(i: number, bx: number, bz: number, next: number, hurry = 1): void {
    const n = this.layout.route(this.x[i], this.z[i], bx, bz, this.lane[i], this.routeScratch);
    this.route.set(this.routeScratch.subarray(0, n * 2), i * 16);
    this.routeLength[i] = n;
    this.routeIndex[i] = 1;
    this.tx[i] = this.x[i];
    this.tz[i] = this.z[i];
    let length = 0;
    for (let k = 1; k < n; k++) length += Math.abs(this.routeScratch[k * 2] - this.routeScratch[k * 2 - 2]) + Math.abs(this.routeScratch[k * 2 + 1] - this.routeScratch[k * 2 - 1]);
    // Far commuters walk faster so that everyone arrives within the rush hour.
    const window = 0.17 * VISUAL_DAY;
    this.speed[i] = Math.max(4.2 * hurry, Math.min(16, length / window)) * (0.9 + ((i * 13) % 10) * 0.02);
    this.state[i] = STATE_WALK;
    this.nextState[i] = next;
  }

  private planDayFor(p: Person, day: number, averageBudget: number): void {
    const i = p.id;
    this.planDay[i] = day;
    const rand = (k: number) => { const v = Math.sin(day * 12.9898 + i * 78.233 + k * 37.719) * 43758.5453; return v - Math.floor(v); };
    this.leaveAt[i] = day + 0.25 + rand(1) * 0.07;
    this.returnAt[i] = day + 0.63 + rand(2) * 0.07;
    // People shop in proportion to what they can spend: the unemployed far less often.
    const ratio = p.monthBudget / Math.max(1, averageBudget);
    this.wantsStore[i] = rand(3) < Math.min(0.85, 0.5 * ratio) ? 1 : 0;
    this.wantsQueue[i] = p.status === UNEMPLOYED && rand(4) < 0.42 ? 1 : 0;
    if (p.status === RETIRED) {
      this.leaveAt[i] = day + 0.33 + rand(1) * 0.28;
      this.returnAt[i] = this.leaveAt[i] + 0.08;
    }
    if (p.status === UNEMPLOYED) {
      this.leaveAt[i] = day + 0.3 + rand(1) * 0.1;
      this.returnAt[i] = day + 0.68 + rand(2) * 0.06;
    }
  }

  private updatePerson(p: Person, dt: number): void {
    const i = p.id;
    const t = this.time;
    const home = this.world.lotForHome(p.homeId).lot;
    const state = this.state[i];

    // Someone who moved home re-routes from where they are.
    if (this.seen[i] !== p.homeId) {
      this.seen[i] = p.homeId;
      if (state === STATE_HOME) {
        this.x[i] = this.tx[i] = home.doorX;
        this.z[i] = this.tz[i] = home.doorZ;
      }
    }

    switch (state) {
      case STATE_HOME:
        if (t >= this.leaveAt[i] && t < this.returnAt[i]) {
          if (p.status === EMPLOYED) {
            const site = this.world.sitesByFirm.get(p.firmId);
            if (site) this.walkTo(i, site.lot.doorX, site.lot.doorZ, STATE_WORK);
            else this.leaveAt[i] = t + 1;
          } else if (p.status === UNEMPLOYED) {
            if (this.wantsQueue[i]) {
              const q = this.layout.jobCentre;
              this.walkTo(i, q.doorX, q.doorZ, STATE_QUEUE);
              this.wantsQueue[i] = 0;
            } else if (this.wantsStore[i] && t < this.returnAt[i] - 0.1) {
              this.goShopping(i, home.x, home.z);
            } else {
              this.state[i] = STATE_IDLE;
              this.idleNext[i] = t;
            }
          } else {
            if (this.wantsStore[i]) this.goShopping(i, home.x, home.z);
            else { this.state[i] = STATE_LEISURE; this.idleNext[i] = t; }
          }
        }
        break;
      case STATE_WORK:
        if (p.status !== EMPLOYED) {
          // Laid off or retired while at work: they walk out and go home straight away.
          this.walkTo(i, home.doorX, home.doorZ, STATE_HOME);
        } else if (t >= this.returnAt[i]) {
          if (this.wantsStore[i]) this.goShopping(i, home.x, home.z);
          else this.walkTo(i, home.doorX, home.doorZ, STATE_HOME);
          this.wantsStore[i] = 0;
        }
        break;
      case STATE_SHOP:
        if (t >= this.idleNext[i]) {
          this.carrying[i] = 1;
          this.walkTo(i, home.doorX, home.doorZ, STATE_HOME);
        }
        break;
      case STATE_QUEUE:
        if (t >= this.returnAt[i] || p.status !== UNEMPLOYED) this.walkTo(i, home.doorX, home.doorZ, STATE_HOME);
        else {
          // Stand in line: position by arrival order, a little off the street.
          const q = this.layout.jobCentre;
          const slot = this.queueCount++;
          const row = Math.floor(slot / 18);
          this.tx[i] = q.doorX + 2.6 + (slot % 18) * 0.62;
          this.tz[i] = q.doorZ + 1.2 + row * 0.62;
        }
        break;
      case STATE_IDLE:
      case STATE_LEISURE:
        if (t >= this.returnAt[i] || (state === STATE_IDLE && p.status === EMPLOYED)) {
          this.walkTo(i, home.doorX, home.doorZ, STATE_HOME);
        } else if (t >= this.idleNext[i]) {
          // Wander around outside the home: visibly not at work.
          const a = (i * 2.4 + t * 19) % (Math.PI * 2);
          const radius = state === STATE_IDLE ? 1.3 : 2.6;
          this.tx[i] = home.doorX + Math.cos(a) * radius;
          this.tz[i] = home.doorZ + Math.sin(a) * radius;
          this.idleNext[i] = t + 0.05 + ((i * 7) % 10) * 0.006;
        }
        break;
      case STATE_WALK: {
        // Lost the job on the way in: turn round and go home.
        if (this.nextState[i] === STATE_WORK && p.status !== EMPLOYED) {
          this.walkTo(i, home.doorX, home.doorZ, STATE_HOME);
          break;
        }
        let remaining = this.speed[i] * dt;
        let index = this.routeIndex[i];
        const n = this.routeLength[i];
        const base = i * 16;
        while (remaining > 0 && index < n) {
          const gx = this.route[base + index * 2];
          const gz = this.route[base + index * 2 + 1];
          const dx = gx - this.tx[i];
          const dz = gz - this.tz[i];
          const d = Math.hypot(dx, dz);
          if (d <= remaining) {
            this.tx[i] = gx;
            this.tz[i] = gz;
            remaining -= d;
            index++;
          } else {
            this.tx[i] += (dx / d) * remaining;
            this.tz[i] += (dz / d) * remaining;
            remaining = 0;
          }
        }
        this.routeIndex[i] = index;
        if (index >= n && Math.hypot(this.tx[i] - this.x[i], this.tz[i] - this.z[i]) < 0.35) {
          const next = this.nextState[i];
          this.state[i] = next;
          if (next === STATE_HOME) this.carrying[i] = 0;
          if (next === STATE_SHOP) this.idleNext[i] = t + 0.012;
        }
        break;
      }
    }
  }

  private goShopping(i: number, fromX: number, fromZ: number): void {
    let best = this.layout.stores[0];
    let bestD = Infinity;
    for (const s of this.layout.stores) {
      const d = Math.abs(s.x - fromX) + Math.abs(s.z - fromZ) + ((i * 31 + s.x) % 14);
      if (d < bestD) { bestD = d; best = s; }
    }
    this.walkTo(i, best.doorX, best.doorZ, STATE_SHOP);
    this.wantsStore[i] = 0;
  }

  // ------------------------------------------------------------------ frame

  frame(seconds: number): void {
    const e = this.economy;
    const dt = Math.min(0.05, seconds);
    this.time += dt / VISUAL_DAY;
    const t = this.time;
    const day = Math.floor(t);
    this.queueCount = 0;

    let budgetSum = 0;
    let budgetN = 0;
    for (const p of e.persons) if (p.status === EMPLOYED) { budgetSum += p.monthBudget; budgetN++; }
    const averageBudget = budgetN ? budgetSum / budgetN : 20000;

    const follow = 1 - Math.exp(-dt * 9);
    const census = this.census;
    census.employedWalking = 0;
    census.unemployedVisible = 0;
    census.unemployedCommuting = 0;
    const lerpColor = 1 - Math.exp(-dt * 2.2);
    const n = this.count;
    for (let i = 0; i < n; i++) {
      const p = e.persons[i];
      if (this.planDay[i] !== day) this.planDayFor(p, day, averageBudget);
      if (dt > 0) this.updatePerson(p, dt);

      const prevX = this.x[i];
      const prevZ = this.z[i];
      this.x[i] += (this.tx[i] - prevX) * follow;
      this.z[i] += (this.tz[i] - prevZ) * follow;
      const moveX = this.x[i] - prevX;
      const moveZ = this.z[i] - prevZ;
      const velocity = dt > 0 ? Math.hypot(moveX, moveZ) / dt : 0;
      if (velocity > 0.05) {
        const want = Math.atan2(moveX, moveZ);
        let d = want - this.heading[i];
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        this.heading[i] += d * Math.min(1, dt * 10);
      }
      this.gait[i] += velocity * dt * 2.6;

      const state = this.state[i];
      const indoors = state === STATE_HOME || state === STATE_WORK || state === STATE_SHOP;
      const wanted = indoors ? 0 : 1;
      this.visible[i] += (wanted - this.visible[i]) * Math.min(1, dt * 7);
      const scale = this.visible[i];

      if (p.status === EMPLOYED && state === STATE_WALK) census.employedWalking++;
      if (p.status === UNEMPLOYED && scale > 0.5) census.unemployedVisible++;
      if (p.status === UNEMPLOYED && state === STATE_WALK && this.nextState[i] === STATE_WORK) census.unemployedCommuting++;

      // Colour eases to the current status: a visible turn from green to red.
      const c = this.statusColor(p);
      this.colorR[i] += (c.r - this.colorR[i]) * lerpColor;
      this.colorG[i] += (c.g - this.colorG[i]) * lerpColor;
      this.colorB[i] += (c.b - this.colorB[i]) * lerpColor;
      color.setRGB(this.colorR[i], this.colorG[i], this.colorB[i]);
      this.bodies.setColorAt(i, color);
      tmpColor.copy(color).multiplyScalar(0.55);
      this.legsL.setColorAt(i, tmpColor);
      this.legsR.setColorAt(i, tmpColor);

      const hidden = scale < 0.02;
      const s = hidden ? 0.0001 : scale * 1.45;
      const bob = Math.abs(Math.sin(this.gait[i])) * 0.05;
      // Unemployed figures sag a little: head down, shoulders forward.
      const slump = p.status === UNEMPLOYED ? 0.14 : 0;
      tmp.position.set(this.x[i], (hidden ? -5 : 0) + bob * s, this.z[i]);
      tmp.rotation.set(slump, this.heading[i], 0, "YXZ");
      tmp.scale.setScalar(s);
      tmp.updateMatrix();
      this.bodies.setMatrixAt(i, tmp.matrix);
      this.heads.setMatrixAt(i, tmp.matrix);
      const manual = !p.knowledge && p.status !== RETIRED;
      if (manual) this.hats.setMatrixAt(i, tmp.matrix);
      else {
        tmp.scale.setScalar(0.0001);
        tmp.updateMatrix();
        this.hats.setMatrixAt(i, tmp.matrix);
        tmp.scale.setScalar(s);
      }
      const swing = Math.sin(this.gait[i]) * Math.min(0.75, velocity * 0.09);
      const yaw = this.heading[i];
      const sideX = Math.cos(yaw) * 0.085 * s;
      const sideZ = -Math.sin(yaw) * 0.085 * s;
      tmp.position.set(this.x[i] + sideX, (hidden ? -5 : 0) + 0.46 * s, this.z[i] + sideZ);
      tmp.rotation.set(swing, yaw, 0, "YXZ");
      tmp.updateMatrix();
      this.legsL.setMatrixAt(i, tmp.matrix);
      tmp.position.set(this.x[i] - sideX, (hidden ? -5 : 0) + 0.46 * s, this.z[i] - sideZ);
      tmp.rotation.set(-swing, yaw, 0, "YXZ");
      tmp.updateMatrix();
      this.legsR.setMatrixAt(i, tmp.matrix);

      // Bought box, carried in front of the body.
      const boxIndex = this.carriedStart + i;
      if (this.carrying[i] && !hidden) {
        tmp.position.set(this.x[i] + Math.sin(yaw) * 0.28 * s, 0.72 * s + bob, this.z[i] + Math.cos(yaw) * 0.28 * s);
        tmp.rotation.set(0, yaw, 0);
        tmp.scale.setScalar(0.72 * s);
      } else {
        tmp.position.set(0, -5, 0);
        tmp.scale.setScalar(0.0001);
      }
      tmp.updateMatrix();
      this.boxes.setMatrixAt(boxIndex, tmp.matrix);
    }
    for (const m of [this.bodies, this.heads, this.hats, this.legsL, this.legsR]) m.instanceMatrix.needsUpdate = true;
    for (const m of [this.bodies, this.legsL, this.legsR]) if (m.instanceColor) m.instanceColor.needsUpdate = true;

    this.updateFlows(dt);
    this.updateCoins(dt);
    this.updateRings(dt);
    this.updateRobots(t);
    this.updateSelection(t);
  }

  // ------------------------------------------------------------------ goods

  private updateFlows(dt: number): void {
    const e = this.economy;
    // Boxes appear in proportion to real output, on a calm visual scale.
    let total = 0;
    for (const f of e.firms) if (f.alive && !f.isPublic) total += Math.min(f.targetOutput, f.forecast * 2);
    const relative = total / Math.max(1, this.baseOutput);
    const dayFactor = 0.45 + 0.55 * Math.max(0, Math.sin((this.dayTime - 0.2) * Math.PI / 0.6));
    const rate = 15 * relative * dayFactor;
    this.boxBudget += rate * dt;
    while (this.boxBudget >= 1) {
      this.boxBudget -= 1;
      this.spawnBox(total);
    }
    for (let i = 0; i < this.flying.length; i++) {
      const b = this.flying[i];
      if (b.active) {
        b.t += dt / b.duration;
        if (b.t >= 1) b.active = false;
      }
      if (b.active) {
        const u = b.t * b.t * (3 - 2 * b.t);
        const y = b.ay + 1.2 + Math.sin(u * Math.PI) * b.height;
        tmp.position.set(b.ax + (b.bx - b.ax) * u, y, b.az + (b.bz - b.az) * u);
        tmp.rotation.set(b.spin * u, b.spin * 1.4 * u, 0);
        tmp.scale.setScalar(Math.min(1, b.t * 7, (1 - b.t) * 7) * 1.5);
      } else {
        tmp.position.set(0, -5, 0);
        tmp.rotation.set(0, 0, 0);
        tmp.scale.setScalar(0.0001);
      }
      tmp.updateMatrix();
      this.boxes.setMatrixAt(i, tmp.matrix);
    }

    // Unsold stock piles up beside the shops.
    let stock = 0;
    let want = 0;
    for (const f of e.firms) {
      if (!f.alive || f.isPublic) continue;
      stock += Math.max(0, f.inventory);
      want += f.forecast * 30;
    }
    const ratio = want > 0 ? stock / want : 1;
    const perStore = 28;
    const target = Math.max(3, Math.min(perStore, 12 * ratio));
    this.layout.stores.forEach((store, s) => {
      this.pileLevels[s] += (target - this.pileLevels[s]) * Math.min(1, dt * 0.8);
      const level = Math.round(this.pileLevels[s]);
      const away = Math.atan2(store.x - store.doorX, store.z - store.doorZ);
      for (let k = 0; k < perStore; k++) {
        const idx = this.pileStart + s * perStore + k;
        if (k < level) {
          const col = k % 4;
          const row = Math.floor(k / 4) % 3;
          const layer = Math.floor(k / 12);
          const lx = (col - 1.5) * 0.7;
          const lz = 2.5 + row * 0.7;
          tmp.position.set(store.x + Math.sin(away) * lz + Math.cos(away) * lx, 0.31 + layer * 0.64, store.z + Math.cos(away) * lz - Math.sin(away) * lx);
          tmp.rotation.set(0, away, 0);
          tmp.scale.setScalar(1);
        } else {
          tmp.position.set(0, -5, 0);
          tmp.scale.setScalar(0.0001);
        }
        tmp.updateMatrix();
        this.boxes.setMatrixAt(idx, tmp.matrix);
      }
    });
    this.boxes.instanceMatrix.needsUpdate = true;
  }

  private spawnBox(total: number): void {
    const free = this.flying.find((b) => !b.active);
    if (!free) return;
    // Pick a producer in proportion to its output.
    let pick = Math.random() * total;
    let source = null as (typeof this.world.sites)[number] | null;
    for (const site of this.world.sites) {
      const f = site.firm;
      if (!f.alive || f.isPublic) continue;
      pick -= Math.min(f.targetOutput, f.forecast * 2);
      source = site;
      if (pick <= 0) break;
    }
    if (!source) return;
    const sector = SECTORS[source.firm.sector];
    const exported = Math.random() < sector.exportShare * 0.8;
    const dest = exported ? this.layout.port : this.layout.stores[Math.floor(Math.random() * this.layout.stores.length)];
    const spread = () => (Math.random() - 0.5) * 2.4;
    Object.assign(free, {
      active: true, t: 0,
      duration: 2.6 + Math.random() * 1.5,
      ax: source.lot.x + spread(), az: source.lot.z + spread(), ay: source.office ? Math.min(source.height, 6) * 0.5 : source.height * 0.7,
      bx: dest.x + spread(), bz: dest.z + spread(),
      height: 7 + Math.random() * 7 + (exported ? 7 : 0),
      spin: 1 + Math.random() * 2.5,
    });
  }

  // ------------------------------------------------------------------ money

  /** Payday: wages to homes, taxes to the town hall, support from the town hall. */
  payday(speedDaysPerSecond: number): void {
    if (!this.showMoney) return;
    const e = this.economy;
    const r = () => Math.random();
    const budget = Math.max(16, Math.min(90, Math.round(1800 / Math.max(20, speedDaysPerSecond))));
    const hall = this.layout.townHall;
    const launch = (ax: number, az: number, ay: number, bx: number, bz: number, red: number, green: number, blue: number) => {
      const c = this.coinPool.find((x) => !x.active);
      if (!c) return;
      const i = this.coinPool.indexOf(c);
      this.coins.setColorAt(i, color.setRGB(red, green, blue));
      Object.assign(c, { active: true, t: 0, duration: 1.7 + r() * 0.8, ax, az, ay, bx, bz, height: 9 + r() * 9, delay: r() * 0.9 });
    };
    const employed = e.persons.filter((p) => p.status === EMPLOYED);
    const unemployed = e.persons.filter((p) => p.status === UNEMPLOYED && p.support !== "none");
    for (let k = 0; k < budget * 0.6 && employed.length; k++) {
      const p = employed[Math.floor(r() * employed.length)];
      const site = this.world.sitesByFirm.get(p.firmId);
      const lot = this.world.lotForHome(p.homeId).lot;
      if (site) {
        if (site.firm.isPublic) launch(hall.x, hall.z, 5, lot.x, lot.z, 1.7, 1.3, 0.3);
        else launch(site.lot.x, site.lot.z, site.height * 0.5, lot.x, lot.z, 1.7, 1.3, 0.3);
      }
    }
    // Taxes rise to the town hall.
    for (let k = 0; k < budget * 0.25 && employed.length; k++) {
      const p = employed[Math.floor(r() * employed.length)];
      const lot = this.world.lotForHome(p.homeId).lot;
      launch(lot.x, lot.z, 2, hall.x, hall.z, 1.8, 0.7, 0.15);
    }
    // Support flows out to the unemployed.
    const shown = Math.min(unemployed.length, Math.ceil(budget * 0.3));
    for (let k = 0; k < shown; k++) {
      const p = unemployed[Math.floor(r() * unemployed.length)];
      const lot = this.world.lotForHome(p.homeId).lot;
      launch(hall.x, hall.z, 5, lot.x, lot.z, 0.2, 1.5, 1.55);
    }
    if (this.coins.instanceColor) this.coins.instanceColor.needsUpdate = true;
  }

  private updateCoins(dt: number): void {
    for (let i = 0; i < this.coinPool.length; i++) {
      const c = this.coinPool[i];
      let visible = false;
      if (c.active) {
        if (c.delay > 0) c.delay -= dt;
        else {
          c.t += dt / c.duration;
          if (c.t >= 1) c.active = false;
          else visible = true;
        }
      }
      if (visible) {
        const u = c.t * c.t * (3 - 2 * c.t);
        tmp.position.set(c.ax + (c.bx - c.ax) * u, c.ay + Math.sin(u * Math.PI) * c.height, c.az + (c.bz - c.az) * u);
        tmp.rotation.set(Math.PI / 2 * 0.7, u * 10, 0);
        tmp.scale.setScalar(Math.min(1, c.t * 9, (1 - c.t) * 9));
      } else {
        tmp.position.set(0, -5, 0);
        tmp.scale.setScalar(0.0001);
      }
      tmp.updateMatrix();
      this.coins.setMatrixAt(i, tmp.matrix);
    }
    this.coins.instanceMatrix.needsUpdate = true;
  }

  private updateRings(dt: number): void {
    for (let i = 0; i < this.ringPool.length; i++) {
      const r = this.ringPool[i];
      if (r.active) {
        r.t += dt / r.duration;
        if (r.t >= 1) r.active = false;
      }
      if (r.active) {
        const grow = 0.3 + 0.7 * (1 - Math.pow(1 - r.t, 3));
        tmp.position.set(r.x, 0.09, r.z);
        tmp.rotation.set(0, 0, 0);
        tmp.scale.setScalar(r.size * grow);
        tmp.updateMatrix();
        const fade = 1 - r.t;
        this.rings.setColorAt(i, color.setRGB(r.r * fade, r.g * fade, r.b * fade));
      } else {
        tmp.position.set(0, -5, 0);
        tmp.scale.setScalar(0.0001);
        tmp.updateMatrix();
      }
      this.rings.setMatrixAt(i, tmp.matrix);
    }
    this.rings.instanceMatrix.needsUpdate = true;
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
  }

  private updateRobots(t: number): void {
    const count = this.robots.count;
    const time = t * VISUAL_DAY;
    for (let i = 0; i < count; i++) {
      const spot = this.robotSpots[i];
      if (spot) {
        const a = time * 0.7 + spot.phase;
        tmp.position.set(spot.x + Math.sin(a) * spot.radius, 0, spot.z + Math.cos(a * 0.7) * 0.2);
        tmp.rotation.set(0, a * 0.5, 0);
        tmp.scale.setScalar(1.25);
      } else {
        tmp.position.set(0, -5, 0);
        tmp.scale.setScalar(0.0001);
      }
      tmp.updateMatrix();
      this.robots.setMatrixAt(i, tmp.matrix);
    }
    this.robots.instanceMatrix.needsUpdate = true;
  }

  private updateSelection(t: number): void {
    if (this.selected < 0) return;
    const pulse = 1 + Math.sin(t * VISUAL_DAY * 5) * 0.14;
    this.selection.position.set(this.x[this.selected], 0.1, this.z[this.selected]);
    this.selection.scale.setScalar(pulse);
  }

  /** Test hook: the state of one person. */
  debugState(i: number): number {
    return this.state[i];
  }
}
