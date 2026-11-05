import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Economy } from "../sim/economy.ts";
import { SECTORS } from "../sim/params.ts";
import type { Firm, Home } from "../sim/types.ts";
import { SECTOR_COLORS } from "../ui/colors.ts";
import { BLOCK, GRID, HALF } from "./layout.ts";
import type { Lot, TownLayout } from "./layout.ts";
import { TownScene, glowInstanceMaterial, windowMaterial } from "./scene.ts";

const tmp = new THREE.Object3D();
const color = new THREE.Color();
const SLATE = new THREE.Color("#3a4560");
const CLOSED = new THREE.Color("#202534");

function withGlow(geometry: THREE.BufferGeometry, count: number): THREE.InstancedBufferAttribute {
  const attr = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
  attr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("aGlow", attr);
  return attr;
}

function instanced(geometry: THREE.BufferGeometry, material: THREE.Material, count: number, shadow = true): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.castShadow = shadow;
  mesh.receiveShadow = shadow;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return mesh;
}

export interface FirmSite {
  firm: Firm;
  lot: Lot;
  office: boolean;
  index: number;
  height: number;
  heightTarget: number;
}

/** Buildings: homes that show hardship, companies that grow and shrink with their staff. */
export class TownWorld {
  readonly houses: THREE.InstancedMesh;
  readonly roofs: THREE.InstancedMesh;
  readonly apartments: THREE.InstancedMesh;
  readonly offices: THREE.InstancedMesh;
  readonly factories: THREE.InstancedMesh;
  readonly stores: THREE.InstancedMesh;
  readonly civic: THREE.Group = new THREE.Group();
  readonly sites: FirmSite[] = [];
  readonly sitesByFirm = new Map<number, FirmSite>();
  readonly officeSites: (FirmSite | null)[] = [];
  readonly factorySites: (FirmSite | null)[] = [];
  readonly townHallMesh: THREE.Mesh;
  readonly bankMesh: THREE.Mesh;
  readonly jobCentreMesh: THREE.Mesh;
  readonly portMesh: THREE.Mesh;
  private readonly houseGlow: THREE.InstancedBufferAttribute;
  private readonly apartmentGlow: THREE.InstancedBufferAttribute;
  private readonly officeGlow: THREE.InstancedBufferAttribute;
  private readonly factoryGlow: THREE.InstancedBufferAttribute;
  private readonly aiCrowns: THREE.InstancedMesh;
  private readonly chimneys: THREE.InstancedMesh;
  private readonly lamps: THREE.Points;
  private readonly smoke: THREE.InstancedMesh;
  private readonly smokeSeeds: Float32Array;
  /** Home id to house or apartment lot. */
  readonly homeLots = new Map<number, { lot: Lot; index: number; kind: Home["kind"] }>();
  private nextHouse = 0;
  private nextApartment = 0;
  private readonly layout: TownLayout;
  private readonly ts: TownScene;
  private economy!: Economy;

  constructor(ts: TownScene) {
    this.ts = ts;
    const layout = ts.layout;
    this.layout = layout;
    const scene = ts.scene;
    const w = ts.windows;

    // Homes.
    const houseGeo = new THREE.BoxGeometry(1.7, 1.15, 1.7);
    houseGeo.translate(0, 0.575, 0);
    this.houseGlow = withGlow(houseGeo, layout.houseLots.length);
    this.houses = instanced(houseGeo, windowMaterial({ roughness: 0.82, color: "#ffffff" }, w), layout.houseLots.length);
    const roofGeo = new THREE.ConeGeometry(1.45, 0.85, 4);
    roofGeo.rotateY(Math.PI / 4);
    roofGeo.translate(0, 1.15 + 0.42, 0);
    this.roofs = instanced(roofGeo, new THREE.MeshStandardMaterial({ roughness: 0.7, flatShading: true }), layout.houseLots.length);
    const aptGeo = new THREE.BoxGeometry(5.2, 1, 5.2);
    aptGeo.translate(0, 0.5, 0);
    this.apartmentGlow = withGlow(aptGeo, layout.apartmentLots.length);
    this.apartments = instanced(aptGeo, windowMaterial({ roughness: 0.8, color: "#ffffff" }, w), layout.apartmentLots.length);

    layout.houseLots.forEach((lot, i) => {
      tmp.position.set(lot.x, 0, lot.z);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.setScalar(0.0001);
      tmp.updateMatrix();
      this.houses.setMatrixAt(i, tmp.matrix);
      this.roofs.setMatrixAt(i, tmp.matrix);
    });
    layout.apartmentLots.forEach((lot, i) => {
      tmp.position.set(lot.x, 0, lot.z);
      tmp.scale.set(1, 7 + ((i * 7) % 5) * 1.4, 1);
      tmp.updateMatrix();
      this.apartments.setMatrixAt(i, tmp.matrix);
      this.apartments.setColorAt(i, color.set(i % 3 === 0 ? "#566680" : i % 3 === 1 ? "#4a5a78" : "#5f6a84"));
      this.apartmentGlow.setXYZ(i, 1, 0.78, 0.5);
    });

    // Companies.
    const towerGeo = new THREE.BoxGeometry(5.6, 1, 5.6);
    towerGeo.translate(0, 0.5, 0);
    this.officeGlow = withGlow(towerGeo, layout.officeSlots.length);
    this.offices = instanced(towerGeo, windowMaterial({ roughness: 0.42, metalness: 0.25, color: "#ffffff" }, w), layout.officeSlots.length);
    const factoryGeo = new THREE.BoxGeometry(11.5, 1, 5.4);
    factoryGeo.translate(0, 0.5, 0);
    this.factoryGlow = withGlow(factoryGeo, layout.factorySlots.length);
    this.factories = instanced(factoryGeo, windowMaterial({ roughness: 0.78, color: "#ffffff" }, w), layout.factorySlots.length);
    const crownEdges = [[0, 2.85, 5.9, 0.3], [0, -2.85, 5.9, 0.3], [2.85, 0, 0.3, 5.9], [-2.85, 0, 0.3, 5.9]].map(([x, z, w, d]) => {
      const part = new THREE.BoxGeometry(w, 0.28, d);
      part.translate(x, 0, z);
      return part.toNonIndexed();
    });
    const crownGeo = mergeGeometries(crownEdges)!;
    this.aiCrowns = instanced(crownGeo, new THREE.MeshBasicMaterial({ color: "#ffffff" }), layout.officeSlots.length, false);
    const chimneyGeo = new THREE.CylinderGeometry(0.42, 0.62, 5, 8);
    chimneyGeo.translate(0, 2.5, 0);
    this.chimneys = instanced(chimneyGeo, new THREE.MeshStandardMaterial({ color: "#59627a", roughness: 0.85 }), layout.factorySlots.length);
    layout.officeSlots.forEach((_l, i) => { tmp.scale.setScalar(0.0001); tmp.position.set(0, 0, 0); tmp.updateMatrix(); this.offices.setMatrixAt(i, tmp.matrix); this.aiCrowns.setMatrixAt(i, tmp.matrix); this.aiCrowns.setColorAt(i, color.set("#000000")); this.offices.setColorAt(i, SLATE); });
    layout.factorySlots.forEach((_l, i) => { tmp.scale.setScalar(0.0001); tmp.position.set(0, 0, 0); tmp.updateMatrix(); this.factories.setMatrixAt(i, tmp.matrix); this.chimneys.setMatrixAt(i, tmp.matrix); this.factories.setColorAt(i, SLATE); });

    // Soft factory smoke: a few spheres rising from running chimneys.
    const smokeCount = layout.factorySlots.length * 4;
    this.smoke = instanced(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshStandardMaterial({ color: "#9aa6c0", transparent: true, opacity: 0.16, roughness: 1, depthWrite: false }), smokeCount, false);
    this.smokeSeeds = new Float32Array(smokeCount).map(() => Math.random());

    // Shops.
    const storeBody = new THREE.BoxGeometry(5.4, 2.4, 3.6);
    storeBody.translate(0, 1.2, 0);
    const awning = new THREE.BoxGeometry(5.8, 0.25, 1.1);
    awning.translate(0, 2.05, 2.15);
    const merged = mergeGeometries([storeBody, awning])!;
    this.stores = instanced(merged, glowInstanceMaterial({ roughness: 0.6 }, 0.1), layout.stores.length);
    layout.stores.forEach((lot, i) => {
      tmp.position.set(lot.x, 0, lot.z);
      tmp.scale.setScalar(1);
      tmp.rotation.y = Math.atan2(lot.doorX - lot.x, lot.doorZ - lot.z);
      tmp.updateMatrix();
      this.stores.setMatrixAt(i, tmp.matrix);
      this.stores.setColorAt(i, color.set("#2f7fd8"));
    });
    tmp.rotation.set(0, 0, 0);

    // Civic buildings.
    const stone = new THREE.MeshStandardMaterial({ color: "#c7cede", roughness: 0.6 });
    const hall = layout.townHall;
    this.townHallMesh = new THREE.Mesh(new THREE.BoxGeometry(9.5, 4, 6), stone);
    this.townHallMesh.position.set(hall.x, 2, hall.z);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(2.6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#d9b24c", metalness: 0.75, roughness: 0.3, emissive: "#6a4a10", emissiveIntensity: 0.6 }));
    dome.position.set(hall.x, 4, hall.z);
    const bank = layout.bank;
    this.bankMesh = new THREE.Mesh(new THREE.BoxGeometry(5, 4.4, 4.4), new THREE.MeshStandardMaterial({ color: "#8d9ab7", roughness: 0.45, metalness: 0.3 }));
    this.bankMesh.position.set(bank.x, 2.2, bank.z);
    const bankCap = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.4, 4.9), new THREE.MeshStandardMaterial({ color: "#d9b24c", metalness: 0.7, roughness: 0.35 }));
    bankCap.position.set(bank.x, 4.6, bank.z);
    const jc = layout.jobCentre;
    this.jobCentreMesh = new THREE.Mesh(new THREE.BoxGeometry(5, 2.6, 4), new THREE.MeshStandardMaterial({ color: "#7a8399", roughness: 0.7 }));
    this.jobCentreMesh.position.set(jc.x, 1.3, jc.z);
    const jcSign = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.45, 4.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 0.5, 0.6) }));
    jcSign.position.set(jc.x, 2.8, jc.z);

    // Port: a quay, a crane and a ship.
    const port = layout.port;
    this.portMesh = new THREE.Mesh(new THREE.BoxGeometry(10, 0.7, 44), new THREE.MeshStandardMaterial({ color: "#39435a", roughness: 0.9 }));
    this.portMesh.position.set(port.x - 2, 0.35, port.z);
    const hull = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 24), new THREE.MeshStandardMaterial({ color: "#26334f", roughness: 0.5 }));
    hull.position.set(port.x + 7, 1, port.z);
    const craneMat = new THREE.MeshStandardMaterial({ color: "#e8a33d", roughness: 0.5, emissive: "#3a2505" });
    const craneTower = new THREE.Mesh(new THREE.BoxGeometry(0.8, 11, 0.8), craneMat);
    craneTower.position.set(port.x - 2, 6, port.z - 12);
    const craneArm = new THREE.Mesh(new THREE.BoxGeometry(13, 0.6, 0.6), craneMat);
    craneArm.position.set(port.x + 2, 11.3, port.z - 12);
    this.civic.add(this.townHallMesh, dome, this.bankMesh, bankCap, this.jobCentreMesh, jcSign, this.portMesh, hull, craneTower, craneArm);
    this.civic.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
    jcSign.castShadow = false;

    // Containers in the port yards.
    const yard = layout.yardSlots;
    const containerColors = ["#3f6ea8", "#b5643c", "#5d8f6f", "#8a93a8", "#a84f5a"];
    const containers = instanced(new THREE.BoxGeometry(2.7, 1.05, 1.05), new THREE.MeshStandardMaterial({ roughness: 0.65 }), yard.length * 18);
    yard.forEach((lot, y) => {
      for (let k = 0; k < 18; k++) {
        const layer = Math.floor(k / 9);
        const col = k % 3;
        const row = Math.floor((k % 9) / 3);
        tmp.position.set(lot.x + (col - 1) * 3.2, 0.53 + layer * 1.07, lot.z + (row - 1) * 1.5);
        tmp.scale.setScalar(layer === 1 && (k + y) % 3 === 0 ? 0.0001 : 1);
        tmp.rotation.set(0, 0, 0);
        tmp.updateMatrix();
        containers.setMatrixAt(y * 18 + k, tmp.matrix);
        containers.setColorAt(y * 18 + k, color.set(containerColors[(y * 3 + k * 7) % 5]));
      }
    });
    scene.add(containers);

    // Trees.
    const trunk = new THREE.CylinderGeometry(0.1, 0.14, 0.7, 5);
    trunk.translate(0, 0.35, 0);
    const crown1 = new THREE.ConeGeometry(0.75, 1.5, 7);
    crown1.translate(0, 1.35, 0);
    const crown2 = new THREE.ConeGeometry(0.55, 1.15, 7);
    crown2.translate(0, 2, 0);
    const paint = (g: THREE.BufferGeometry, c: string) => {
      const col = new THREE.Color(c);
      const count = g.attributes.position.count;
      const a = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
      g.setAttribute("color", new THREE.BufferAttribute(a, 3));
      return g;
    };
    const treeGeo = mergeGeometries([paint(trunk.toNonIndexed(), "#5a4636"), paint(crown1.toNonIndexed(), "#2f7f5f"), paint(crown2.toNonIndexed(), "#3a9a72")])!;
    const trees = instanced(treeGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), layout.trees.length);
    layout.trees.forEach((t, i) => {
      tmp.position.set(t.x, 0, t.z);
      tmp.scale.setScalar(t.scale);
      tmp.rotation.y = i;
      tmp.updateMatrix();
      trees.setMatrixAt(i, tmp.matrix);
    });
    tmp.rotation.set(0, 0, 0);

    // Street lamps: glowing points at every crossing, visible after dark.
    const lampPositions: number[] = [];
    for (let i = 0; i <= GRID; i++) {
      for (let j = 0; j <= GRID; j++) {
        lampPositions.push((i - GRID / 2) * BLOCK + 1.9, 2.4, (j - GRID / 2) * BLOCK + 1.9);
      }
    }
    const lampGeo = new THREE.BufferGeometry();
    lampGeo.setAttribute("position", new THREE.Float32BufferAttribute(lampPositions, 3));
    const dot = document.createElement("canvas");
    dot.width = dot.height = 64;
    const c = dot.getContext("2d")!;
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,226,170,1)");
    g.addColorStop(0.25, "rgba(255,200,120,0.55)");
    g.addColorStop(1, "rgba(255,180,90,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    this.lamps = new THREE.Points(lampGeo, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(dot), size: 3.4, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));

    scene.add(this.houses, this.roofs, this.apartments, this.offices, this.factories, this.aiCrowns, this.chimneys, this.smoke, this.stores, this.civic, trees, this.lamps);
    void HALF;
  }

  /** Rebuild for a new run. */
  bind(economy: Economy): void {
    this.economy = economy;
    this.sites.length = 0;
    this.sitesByFirm.clear();
    this.officeSites.length = 0;
    this.factorySites.length = 0;
    this.layout.officeSlots.forEach(() => this.officeSites.push(null));
    this.layout.factorySlots.forEach(() => this.factorySites.push(null));
    this.homeLots.clear();
    this.nextHouse = 0;
    this.nextApartment = 0;
    this.layout.houseLots.forEach((lot, i) => {
      tmp.position.set(lot.x, 0, lot.z);
      tmp.scale.setScalar(0.0001);
      tmp.updateMatrix();
      this.houses.setMatrixAt(i, tmp.matrix);
      this.roofs.setMatrixAt(i, tmp.matrix);
      this.houseGlow.setXYZ(i, 0, 0, 0);
    });
    for (let i = 0; i < this.officeSites.length; i++) {
      tmp.position.set(0, 0, 0); tmp.scale.setScalar(0.0001); tmp.updateMatrix();
      this.offices.setMatrixAt(i, tmp.matrix);
      this.aiCrowns.setMatrixAt(i, tmp.matrix);
    }
    for (let i = 0; i < this.factorySites.length; i++) {
      tmp.position.set(0, 0, 0); tmp.scale.setScalar(0.0001); tmp.updateMatrix();
      this.factories.setMatrixAt(i, tmp.matrix);
      this.chimneys.setMatrixAt(i, tmp.matrix);
    }
    this.syncHomes();
    this.syncFirms();
    for (const site of this.sites) site.height = site.heightTarget;
    this.updateFirmMatrices();
  }

  lotForHome(homeId: number): { lot: Lot; index: number; kind: Home["kind"] } {
    let entry = this.homeLots.get(homeId);
    if (!entry) {
      const home = this.economy.homes[homeId];
      if (home && home.kind === "house" && this.nextHouse < this.layout.houseLots.length) {
        const index = this.nextHouse++;
        entry = { lot: this.layout.houseLots[index], index, kind: "house" };
        tmp.position.set(entry.lot.x, 0, entry.lot.z);
        tmp.scale.setScalar(1);
        tmp.updateMatrix();
        this.houses.setMatrixAt(index, tmp.matrix);
        this.roofs.setMatrixAt(index, tmp.matrix);
        this.houses.instanceMatrix.needsUpdate = true;
        this.roofs.instanceMatrix.needsUpdate = true;
      } else {
        const index = this.nextApartment++ % this.layout.apartmentLots.length;
        entry = { lot: this.layout.apartmentLots[index], index, kind: "apartment" };
      }
      this.homeLots.set(homeId, entry);
    }
    return entry;
  }

  /** Paint homes by the state of the people in them. */
  syncHomes(): void {
    const e = this.economy;
    const trouble = new Map<number, number>();
    for (const p of e.persons) {
      const entry = this.lotForHome(p.homeId);
      if (entry.kind === "house" && p.arrears >= 1) trouble.set(entry.index, p.arrears);
    }
    for (const [homeId, entry] of this.homeLots) {
      if (entry.kind !== "house") continue;
      const home = e.homes[homeId];
      const i = entry.index;
      if (home.vacant) {
        this.houses.setColorAt(i, color.set("#2d3344"));
        this.roofs.setColorAt(i, color.set("#32384a"));
        this.houseGlow.setXYZ(i, 0, 0, 0);
      } else if (trouble.has(i)) {
        this.houses.setColorAt(i, color.set("#7f6a70"));
        this.roofs.setColorAt(i, color.set("#d8434f"));
        this.houseGlow.setXYZ(i, 1, 0.55, 0.42);
      } else {
        const v = (i * 2654435761) % 5;
        this.houses.setColorAt(i, color.set(["#c6c1ae", "#b4bcc9", "#c9b49e", "#a9b7a8", "#bfc6d3"][v]));
        this.roofs.setColorAt(i, color.set(["#7c5b4c", "#5a6b86", "#8a6a53", "#5c6f63", "#6d6a80"][v]));
        this.houseGlow.setXYZ(i, 1, 0.8, 0.52);
      }
    }
    if (this.houses.instanceColor) this.houses.instanceColor.needsUpdate = true;
    if (this.roofs.instanceColor) this.roofs.instanceColor.needsUpdate = true;
    this.houseGlow.needsUpdate = true;
    this.apartmentGlow.needsUpdate = true;
  }

  private allocate(firm: Firm): FirmSite | null {
    const s = SECTORS[firm.sector];
    const office = s.knowledge >= 0.5 || s.key === "health";
    const slots = office ? this.officeSites : this.factorySites;
    // Prefer an empty slot, otherwise take over a building whose company closed long ago.
    let index = slots.findIndex((x) => x === null);
    if (index < 0) index = slots.findIndex((x) => x && !x.firm.alive);
    if (index < 0) return null;
    const lots = office ? this.layout.officeSlots : this.layout.factorySlots;
    const old = slots[index];
    if (old) {
      this.sitesByFirm.delete(old.firm.id);
      this.sites.splice(this.sites.indexOf(old), 1);
    }
    const site: FirmSite = { firm, lot: lots[index], office, index, height: 0.5, heightTarget: 2 };
    slots[index] = site;
    this.sites.push(site);
    this.sitesByFirm.set(firm.id, site);
    return site;
  }

  syncFirms(): void {
    for (const f of this.economy.firms) {
      const had = this.sitesByFirm.get(f.id);
      if (!had && f.alive) this.allocate(f);
    }
    for (const site of this.sites) {
      const f = site.firm;
      const jobs = f.employees.length;
      site.heightTarget = f.alive ? (site.office ? 2.6 + 2.5 * Math.sqrt(jobs) : 2.6 + 0.55 * Math.sqrt(jobs)) : site.heightTarget;
      const s = SECTORS[f.sector];
      const tint = color.set(SECTOR_COLORS[s.key]).lerp(SLATE, f.alive ? 0.62 : 1);
      if (!f.alive) tint.copy(CLOSED);
      const mesh = site.office ? this.offices : this.factories;
      mesh.setColorAt(site.index, tint);
      const glowAttr = site.office ? this.officeGlow : this.factoryGlow;
      if (!f.alive) glowAttr.setXYZ(site.index, 0, 0, 0);
      else {
        // Windows shift from warm to violet as AI software spreads through the staff.
        const a = f.aiAdoption * Math.min(1, this.economy.controls.aiLevel * 1.6);
        glowAttr.setXYZ(site.index, 1 - 0.35 * a, 0.8 - 0.3 * a, 0.52 + 0.48 * a);
      }
      if (site.office) {
        const a = f.alive ? f.aiAdoption * Math.min(1, this.economy.controls.aiLevel * 1.6 + 0.1) : 0;
        this.aiCrowns.setColorAt(site.index, color.setRGB(0.52 * a * 1.5, 0.38 * a * 1.5, 1 * a * 1.5));
      }
    }
    for (const mesh of [this.offices, this.factories, this.aiCrowns]) if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.officeGlow.needsUpdate = true;
    this.factoryGlow.needsUpdate = true;
  }

  private updateFirmMatrices(): void {
    for (const site of this.sites) {
      const { lot, index, height, office } = site;
      tmp.rotation.set(0, 0, 0);
      tmp.position.set(lot.x, 0, lot.z);
      tmp.scale.set(1, height, 1);
      tmp.updateMatrix();
      (office ? this.offices : this.factories).setMatrixAt(index, tmp.matrix);
      if (office) {
        tmp.position.set(lot.x, height + 0.08, lot.z);
        tmp.scale.set(1, 1, 1);
        tmp.updateMatrix();
        this.aiCrowns.setMatrixAt(index, tmp.matrix);
      } else {
        tmp.position.set(lot.x + 3.8, height, lot.z);
        tmp.scale.set(1, site.firm.alive ? 1 : 0.0001, 1);
        tmp.updateMatrix();
        this.chimneys.setMatrixAt(index, tmp.matrix);
      }
    }
    this.offices.instanceMatrix.needsUpdate = true;
    this.factories.instanceMatrix.needsUpdate = true;
    this.aiCrowns.instanceMatrix.needsUpdate = true;
    this.chimneys.instanceMatrix.needsUpdate = true;
  }

  frame(seconds: number, time: number): void {
    let moved = false;
    for (const site of this.sites) {
      const d = site.heightTarget - site.height;
      if (Math.abs(d) > 0.004) {
        site.height += d * Math.min(1, seconds * 1.6);
        moved = true;
      }
    }
    if (moved) this.updateFirmMatrices();
    (this.lamps.material as THREE.PointsMaterial).opacity = this.ts.night * 0.9;

    // Smoke follows real output: factories making nothing make no smoke.
    const n = this.smoke.count;
    for (let i = 0; i < n; i++) {
      const slot = Math.floor(i / 4);
      const site = this.factorySites[slot];
      if (!site || !site.firm.alive || site.firm.employees.length === 0) {
        tmp.position.set(0, -5, 0);
        tmp.scale.setScalar(0.0001);
      } else {
        const phase = (time * 0.18 + this.smokeSeeds[i]) % 1;
        tmp.position.set(site.lot.x + 3.8 + phase * 1.6 + Math.sin(phase * 6 + i) * 0.25, site.height + 5 + phase * 6, site.lot.z + phase * 0.9);
        tmp.scale.setScalar(0.5 + phase * 1.8);
      }
      tmp.rotation.set(0, 0, 0);
      tmp.updateMatrix();
      this.smoke.setMatrixAt(i, tmp.matrix);
    }
    this.smoke.instanceMatrix.needsUpdate = true;
  }
}
