import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { BLOCK, GRID, HALF, ROAD, TownLayout } from "./layout.ts";

const COLORS = {
  night: new THREE.Color("#070c1b"),
  dawn: new THREE.Color("#3a2f4a"),
  day: new THREE.Color("#2a4468"),
  dusk: new THREE.Color("#3f2a43"),
  sunDay: new THREE.Color("#fff2dd"),
  sunLow: new THREE.Color("#ffb37a"),
  moon: new THREE.Color("#8aa8ff"),
};

/** Standard material with procedural lit windows and glowing instance colours. */
export function windowMaterial(params: THREE.MeshStandardMaterialParameters, uniforms: { uLit: { value: number }; uGlow: { value: number } }): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial(params);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uLit = uniforms.uLit;
    shader.uniforms.uGlow = uniforms.uGlow;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
        attribute vec3 aGlow;
        varying vec3 vGlow; varying vec3 vWPos; varying vec3 vLN;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vGlow = aGlow; vLN = normal;
        vWPos = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        uniform float uLit; uniform float uGlow;
        varying vec3 vGlow; varying vec3 vWPos; varying vec3 vLN;`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        float side = 1.0 - step(0.5, abs(vLN.y));
        if (dot(vGlow, vGlow) > 0.0001 && side > 0.5) {
          vec2 cell = vec2((abs(vLN.x) > 0.5 ? vWPos.z : vWPos.x) * 1.15, vWPos.y * 1.05);
          vec2 f = fract(cell); vec2 id = floor(cell);
          float win = step(0.26, f.x) * step(f.x, 0.74) * step(0.32, f.y) * step(f.y, 0.7);
          float h = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453);
          diffuseColor.rgb *= mix(1.0, 0.45, win);
          totalEmissiveRadiance += vGlow * win * step(h, uLit) * uGlow;
        }`);
  };
  return m;
}

/** Makes a material's instance colour partly self-lit, so figures stand out at night. */
export function glowInstanceMaterial(params: THREE.MeshStandardMaterialParameters, amount: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial(params);
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
      #ifdef USE_INSTANCING_COLOR
        totalEmissiveRadiance += vColor * ${amount.toFixed(3)};
      #endif`);
  };
  return m;
}

function paintGround(layout: TownLayout): THREE.CanvasTexture {
  const size = 2048;
  const margin = 40;
  const world = (GRID * BLOCK + margin * 2);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const c = canvas.getContext("2d")!;
  const s = size / world;
  const X = (v: number) => (v + world / 2) * s;
  c.fillStyle = "#171f33";
  c.fillRect(0, 0, size, size);
  const fill: Record<string, string> = { house: "#24344f", apartment: "#28344e", office: "#2c344d", industry: "#2e3142", park: "#1f4f40", civic: "#39415f" };
  for (const b of layout.blocks) {
    c.fillStyle = fill[b.zone];
    const half = (BLOCK - ROAD) / 2;
    c.beginPath();
    c.roundRect(X(b.x - half), X(b.z - half), half * 2 * s, half * 2 * s, 8);
    c.fill();
    c.strokeStyle = "rgba(148,170,214,0.1)";
    c.lineWidth = 2;
    c.stroke();
  }
  // Road markings.
  c.strokeStyle = "rgba(222,232,255,0.3)";
  c.lineWidth = 2;
  c.setLineDash([14, 16]);
  for (let k = 0; k <= GRID; k++) {
    const p = (k - GRID / 2) * BLOCK;
    c.beginPath(); c.moveTo(X(-HALF), X(p)); c.lineTo(X(HALF), X(p)); c.stroke();
    c.beginPath(); c.moveTo(X(p), X(-HALF)); c.lineTo(X(p), X(HALF)); c.stroke();
  }
  c.setLineDash([]);
  // Outer shore towards the port.
  const grad = c.createLinearGradient(X(HALF + 3), 0, X(HALF + 30), 0);
  grad.addColorStop(0, "rgba(16,48,86,0)");
  grad.addColorStop(0.3, "rgba(18,60,108,0.9)");
  grad.addColorStop(1, "rgba(14,44,84,1)");
  c.fillStyle = grad;
  c.fillRect(X(HALF + 3), 0, size - X(HALF + 3), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Renderer, camera, lights, ground and the day-night cycle. */
export class TownScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly windows = { uLit: { value: 0.6 }, uGlow: { value: 1.5 } };
  readonly layout: TownLayout;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private readonly sun = new THREE.DirectionalLight("#ffffff", 2);
  private readonly hemi = new THREE.HemisphereLight("#a8c4ff", "#1c2436", 1);
  private readonly container: HTMLElement;
  private readonly background = new THREE.Color();
  /** 0..1, for materials that light up after dark. */
  night = 0;
  private lastInteraction = 0;
  quality = 1;

  constructor(container: HTMLElement, layout: TownLayout) {
    this.container = container;
    this.layout = layout;
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    this.renderer = renderer;
    container.append(renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(32, 1, 1, 900);
    this.camera.position.set(118, 112, 146);
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.target.set(6, 0, 4);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = 1.42;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 330;
    this.controls.autoRotate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.controls.autoRotateSpeed = 0.12;
    this.controls.addEventListener("start", () => { this.lastInteraction = performance.now(); this.controls.autoRotate = false; });

    const scene = this.scene;
    scene.fog = new THREE.Fog("#0c1426", 230, 560);
    scene.add(this.hemi, this.sun, this.sun.target);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = -115; cam.right = 115; cam.top = 115; cam.bottom = -115; cam.near = 10; cam.far = 420;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.25;

    const margin = 40;
    const world = GRID * BLOCK + margin * 2;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(world, world),
      new THREE.MeshStandardMaterial({ map: paintGround(layout), roughness: 0.92, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const outer = new THREE.Mesh(new THREE.CircleGeometry(900, 48), new THREE.MeshStandardMaterial({ color: "#0d1525", roughness: 1 }));
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.1;
    scene.add(outer);

    const size = new THREE.Vector2(1, 1);
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, this.camera));
    this.bloom = new UnrealBloomPass(size, 0.2, 0.5, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.resize();
    new ResizeObserver(() => this.resize()).observe(container);
  }

  resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  /** Lower effects if the machine cannot keep up. */
  setQuality(level: number): void {
    if (level === this.quality) return;
    this.quality = level;
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.renderer.setPixelRatio(level >= 1 ? dpr : level === 0.5 ? Math.min(dpr, 1.25) : 1);
    this.renderer.shadowMap.enabled = level >= 0.5;
    this.sun.castShadow = level >= 0.5;
    this.bloom.enabled = level >= 0.5;
    this.resize();
  }

  setDayTime(t: number): void {
    // t: 0 midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset.
    const elevation = Math.sin((t - 0.25) * Math.PI * 2);
    const up = THREE.MathUtils.smoothstep(elevation, -0.2, 0.12);
    const low = Math.max(0, 1 - Math.abs(elevation) * 2.8);
    const sky = this.background.copy(COLORS.night).lerp(COLORS.day, up);
    sky.lerp(t < 0.5 ? COLORS.dawn : COLORS.dusk, low * 0.75);
    this.scene.background = sky;
    (this.scene.fog as THREE.Fog).color.copy(sky);

    const angle = (t - 0.25) * Math.PI * 2;
    const daylight = elevation > -0.05;
    const sunX = Math.cos(angle) * 180;
    const sunY = Math.max(Math.abs(Math.sin(angle)) * 170, 55);
    if (daylight) this.sun.position.set(sunX, sunY, 60);
    else this.sun.position.set(-sunX * 0.6, Math.max(120, sunY), -70);
    this.sun.color.copy(daylight ? COLORS.sunLow.clone().lerp(COLORS.sunDay, up) : COLORS.moon);
    this.sun.intensity = daylight ? 1.1 + 1.9 * up : 0.7;
    this.hemi.intensity = 0.75 + 0.95 * up;
    this.night = 1 - up;
    this.windows.uLit.value = 0.16 + 0.34 * this.night;
    this.windows.uGlow.value = 0.12 + 0.95 * this.night;
    this.bloom.strength = 0.14 + 0.12 * this.night;
  }

  render(): void {
    if (!this.controls.autoRotate && performance.now() - this.lastInteraction > 45000 && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.controls.autoRotate = true;
    }
    this.controls.update();
    this.composer.render();
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
