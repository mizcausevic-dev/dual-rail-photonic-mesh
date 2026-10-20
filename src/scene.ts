import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { cellKey, isPass, TOPOLOGY, type MeshSettings, type Pair } from "./math/mesh";
import type { ShotId } from "./timeline";

const GUIDE_Y = 0.14;
const MODE_GAP = 0.52;
const COL_X = (column: number) => -3.15 + column * 0.9;

export type SceneFrame = {
  t: number;
  shot: ShotId;
  reducedMotion: boolean;
  settings: MeshSettings;
  stageMeans: number[][];
  highlight: { column: number; pair: Pair } | null;
  record: number[] | null;
  flash: boolean;
  schematic: boolean;
};

type Pose = { t: number; px: number; py: number; pz: number; tx: number; ty: number; tz: number };

const POSES: Pose[] = [
  { t: 0, px: 0.2, py: 18.5, pz: 6.4, tx: 0.2, ty: 0, tz: 0.35 },
  { t: 5, px: -0.4, py: 12.4, pz: 5.6, tx: -0.7, ty: 0, tz: 0.1 },
  { t: 7.4, px: -2.35, py: 2.15, pz: 2.55, tx: -3.15, ty: 0.14, tz: -1.5 },
  { t: 10, px: -0.9, py: 3.6, pz: 3.6, tx: -2.2, ty: 0.1, tz: -0.8 },
  { t: 13.6, px: 0.15, py: 7.2, pz: 5.4, tx: 0.1, ty: 0, tz: 0.1 },
  { t: 17, px: 0.25, py: 18.2, pz: 6.6, tx: 0.25, ty: 0, tz: 0.3 },
  { t: 25, px: 4.6, py: 7.4, pz: 5.8, tx: 3.1, ty: 0, tz: 0.1 },
  { t: 30, px: 0.3, py: 15.4, pz: 6.2, tx: 0.3, ty: 0, tz: 0.25 },
  { t: 33, px: 0.25, py: 14.6, pz: 5.8, tx: 0.25, ty: 0, tz: 0.25 },
  { t: 34, px: 0.25, py: 14.6, pz: 5.8, tx: 0.25, ty: 0, tz: 0.25 },
];

const INSPECT: Record<ShotId, Pose> = {
  1: POSES[1],
  2: POSES[2],
  3: POSES[4],
  4: POSES[5],
  5: POSES[8],
};

function modeZ(mode: number): number {
  return (mode - 3.5) * MODE_GAP;
}

function transverse(mode: number, x: number): number {
  const z0 = modeZ(mode);
  let z = z0;
  for (const cell of TOPOLOGY) {
    if (cell.pair[0] !== mode && cell.pair[1] !== mode) continue;
    const partner = cell.pair[0] === mode ? cell.pair[1] : cell.pair[0];
    const cx = COL_X(cell.column);
    const dx = x - cx;
    const half = 0.32;
    if (Math.abs(dx) < half) {
      const u = Math.cos((dx / half) * (Math.PI / 2));
      z += (modeZ(partner) - z0) * 0.34 * u;
    }
  }
  return z;
}

function stageBounds(): number[] {
  const bounds = [-6.2];
  for (let column = 0; column < 8; column++) bounds.push(COL_X(column));
  bounds.push(6.55);
  return bounds;
}

export type MeshScene = {
  resize: () => void;
  render: (frame: SceneFrame) => void;
  setQuality: (quality: "high" | "low") => void;
  dispose: () => void;
};

export function createScene(canvas: HTMLCanvasElement, tags: HTMLElement, onLost: () => void): MeshScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.setClearColor(0x0b1018, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1018);
  scene.fog = new THREE.FogExp2(0x0b1018, 0.032);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.08, 80);
  camera.position.set(-5.4, 4.8, 7.6);

  scene.add(new THREE.HemisphereLight(0xb7c4d4, 0x0b1018, 0.42));
  const key = new THREE.DirectionalLight(0xf2f6fb, 1.25);
  key.position.set(-6, 9, 7);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x00e5ff, 0.18);
  rim.position.set(6, 3, -8);
  scene.add(rim);
  const practical = new THREE.PointLight(0xffd166, 0.55, 9, 2);
  practical.position.set(-1.2, 1.4, 3.5);
  scene.add(practical);

  const grid = new THREE.GridHelper(24, 24, 0x1a2633, 0x121a24);
  grid.position.y = -0.16;
  scene.add(grid);

  const baseMat = new THREE.MeshStandardMaterial({ color: 0x10161f, roughness: 0.72, metalness: 0.18 });
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x2d4058,
    roughness: 0.48,
    metalness: 0.12,
    transparent: true,
    opacity: 0.9,
  });
  const silverMat = new THREE.MeshStandardMaterial({ color: 0x8e9cac, roughness: 0.32, metalness: 0.82 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(13.6, 0.08, 5.35), baseMat);
  base.position.set(0.15, -0.07, 0);
  scene.add(base);
  const far = new THREE.Mesh(new THREE.BoxGeometry(13.6, 0.46, 0.12), wallMat);
  far.position.set(0.15, 0.12, -2.62);
  scene.add(far);
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.32, 5.35), wallMat);
  left.position.set(-6.65, 0.08, 0);
  scene.add(left);
  const right = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.32, 5.35), wallMat);
  right.position.set(6.95, 0.08, 0);
  scene.add(right);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(13.6, 0.05, 0.08), wallMat);
  lip.position.set(0.15, -0.02, 2.62);
  scene.add(lip);

  const board = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.05, 1.15), baseMat);
  board.position.set(-1.4, 0.02, 3.45);
  scene.add(board);
  const boardRim = new THREE.Mesh(
    new THREE.BoxGeometry(3.55, 0.03, 1.28),
    new THREE.MeshStandardMaterial({ color: 0xffd166, metalness: 0.6, roughness: 0.35, emissive: 0xffd166, emissiveIntensity: 0.18 }),
  );
  boardRim.position.set(-1.4, 0.0, 3.45);
  scene.add(boardRim);

  const bounds = stageBounds();
  const guideMats: THREE.MeshStandardMaterial[][] = [];
  for (let mode = 0; mode < 8; mode++) {
    const row: THREE.MeshStandardMaterial[] = [];
    for (let stage = 0; stage < bounds.length - 1; stage++) {
      const even = mode % 2 === 0;
      const mat = new THREE.MeshStandardMaterial({
        color: even ? 0x062e36 : 0x241038,
        emissive: even ? 0x00e5ff : 0x9d4edd,
        emissiveIntensity: 0.15,
        roughness: 0.2,
        metalness: 0.05,
        transparent: true,
        opacity: 0.94,
      });
      row.push(mat);
      const x0 = bounds[stage];
      const x1 = bounds[stage + 1];
      const pts: THREE.Vector3[] = [];
      const steps = 8;
      for (let s = 0; s <= steps; s++) {
        const x = x0 + ((x1 - x0) * s) / steps;
        pts.push(new THREE.Vector3(x, GUIDE_Y, transverse(mode, x)));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = new THREE.TubeGeometry(curve, steps * 2, 0.02, 5, false);
      scene.add(new THREE.Mesh(geo, mat));
    }
    guideMats.push(row);
  }

  const heaterMats = new Map<string, THREE.MeshStandardMaterial>();
  const phaseMats = new Map<string, THREE.MeshStandardMaterial>();
  for (const cell of TOPOLOGY) {
    const key = cellKey(cell.column, cell.pair);
    const z0 = modeZ(cell.pair[0]);
    const z1 = modeZ(cell.pair[1]);
    const hx = COL_X(cell.column);
    const heaterMat = new THREE.MeshStandardMaterial({
      color: 0xffd166,
      emissive: 0xffd166,
      emissiveIntensity: 0.12,
      metalness: 0.62,
      roughness: 0.34,
    });
    heaterMats.set(key, heaterMat);
    const heater = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.018, Math.abs(z1 - z0) * 0.38), heaterMat);
    heater.position.set(hx, GUIDE_Y + 0.07, (z0 + z1) / 2);
    scene.add(heater);

    const phaseMat = heaterMat.clone();
    phaseMats.set(key, phaseMat);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 0.055), phaseMat);
    pad.position.set(hx + 0.24, GUIDE_Y + 0.035, transverse(cell.pair[1], hx + 0.24));
    scene.add(pad);

    const edgeZ = cell.column % 2 === 0 ? -2.35 : 2.35;
    const tap = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.012, Math.abs(edgeZ - (z0 + z1) / 2)), silverMat);
    tap.position.set(hx, GUIDE_Y + 0.09, (edgeZ + (z0 + z1) / 2) / 2);
    scene.add(tap);
    const bond = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.16), silverMat);
    bond.position.set(hx, 0.02, edgeZ);
    scene.add(bond);
  }

  const terminalMats: THREE.MeshStandardMaterial[] = [];
  const detectorMats: THREE.MeshStandardMaterial[] = [];
  const detectorRims: THREE.MeshStandardMaterial[] = [];
  for (let mode = 0; mode < 8; mode++) {
    const tMat = new THREE.MeshStandardMaterial({
      color: 0xffd166,
      emissive: 0xffd166,
      emissiveIntensity: 0.16,
      metalness: 0.55,
      roughness: 0.36,
    });
    terminalMats.push(tMat);
    const terminal = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.025, 0.07), tMat);
    terminal.position.set(4.45, GUIDE_Y + 0.03, modeZ(mode));
    scene.add(terminal);

    const body = new THREE.MeshStandardMaterial({ color: 0x8e9cac, metalness: 0.78, roughness: 0.28, emissive: 0x1a1408, emissiveIntensity: 0.2 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffd166, emissiveIntensity: 0.2, metalness: 0.5, roughness: 0.3 });
    detectorMats.push(body);
    detectorRims.push(rimMat);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.2), rimMat);
    rim.position.set(6.15, GUIDE_Y, modeZ(mode));
    scene.add(rim);
    const well = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.12), body);
    well.position.set(6.15, GUIDE_Y, modeZ(mode));
    scene.add(well);
  }

  const bus = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.015, 0.03), silverMat);
  bus.position.set(0.2, 0.05, -2.35);
  scene.add(bus);
  const link = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 1.3), new THREE.MeshStandardMaterial({
    color: 0xffd166,
    emissive: 0xffd166,
    emissiveIntensity: 0.15,
    metalness: 0.5,
    roughness: 0.4,
  }));
  link.position.set(-4.6, 0.06, 2.7);
  scene.add(link);

  const bracketMat = new THREE.LineBasicMaterial({ color: 0x8e9cac });
  for (let q = 0; q < 4; q++) {
    const z0 = modeZ(q * 2);
    const z1 = modeZ(q * 2 + 1);
    const x = -5.85;
    const pts = [
      new THREE.Vector3(x, GUIDE_Y, z0),
      new THREE.Vector3(x - 0.16, GUIDE_Y, z0),
      new THREE.Vector3(x - 0.16, GUIDE_Y, z1),
      new THREE.Vector3(x, GUIDE_Y, z1),
    ];
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), bracketMat));
  }

  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 4), silverMat);
  arrow.rotation.z = -Math.PI / 2;
  arrow.position.set(-5.55, GUIDE_Y + 0.16, 0);
  scene.add(arrow);

  const highlight = new THREE.Mesh(
    new THREE.BoxGeometry(0.78, 0.012, 0.62),
    new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  highlight.visible = false;
  scene.add(highlight);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.12, 0.32, 0.9);
  composer.addPass(bloom);
  let quality: "high" | "low" = "high";

  const labelEls = new Map<string, HTMLDivElement>();
  const labelAnchors: { id: string; pos: THREE.Vector3; text: string; cls: string }[] = [];
  const addLabel = (id: string, pos: THREE.Vector3, text: string, cls: string) => {
    const el = document.createElement("div");
    el.className = `tag ${cls}`;
    el.textContent = text;
    tags.appendChild(el);
    labelEls.set(id, el);
    labelAnchors.push({ id, pos, text, cls });
  };
  for (let mode = 0; mode < 8; mode++) {
    addLabel(`in-${mode}`, new THREE.Vector3(-5.35, GUIDE_Y + 0.16, modeZ(mode)), `${mode}`, mode % 2 === 0 ? "cyan" : "violet");
    addLabel(`out-${mode}`, new THREE.Vector3(6.55, GUIDE_Y + 0.18, modeZ(mode)), `${mode}`, mode % 2 === 0 ? "cyan" : "violet");
  }
  for (let q = 0; q < 4; q++) {
    addLabel(`q-${q}`, new THREE.Vector3(-6.95, GUIDE_Y + 0.2, (modeZ(q * 2) + modeZ(q * 2 + 1)) / 2), `Q${q + 1}`, "bone");
  }
  addLabel("prop", new THREE.Vector3(-3.4, GUIDE_Y + 0.55, modeZ(0) - 0.45), "propagation", "silver");
  addLabel("term", new THREE.Vector3(4.45, GUIDE_Y + 0.38, modeZ(0) - 0.15), "terminal phases", "gold");
  addLabel("det", new THREE.Vector3(6.15, GUIDE_Y + 0.48, modeZ(7) + 0.2), "destructive detectors", "gold");
  addLabel("classical", new THREE.Vector3(-1.4, 0.35, 3.45), "classical programming", "gold");
  for (let mode = 0; mode < 8; mode++) {
    addLabel(`n-${mode}`, new THREE.Vector3(6.15, GUIDE_Y + 0.32, modeZ(mode)), "", "gold count");
  }

  const scratch = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const target = new THREE.Vector3();

  let lostTimer: number | null = null;
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    if (lostTimer !== null) window.clearTimeout(lostTimer);
    lostTimer = window.setTimeout(() => onLost(), 2500);
  });
  canvas.addEventListener("webglcontextrestored", () => {
    if (lostTimer !== null) window.clearTimeout(lostTimer);
    lostTimer = null;
    resize();
  });

  function resize(): void {
    const parent = canvas.parentElement;
    if (!parent) return;
    const w = Math.max(1, parent.clientWidth);
    const h = Math.max(1, parent.clientHeight);
    const dpr = quality === "low" ? 1 : Math.min(window.devicePixelRatio || 1, w < 800 ? 1.25 : 1.6);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function poseAt(t: number, shot: ShotId, reduced: boolean): void {
    const pose = reduced ? INSPECT[shot] : null;
    if (pose) {
      pos.set(pose.px, pose.py, pose.pz);
      target.set(pose.tx, pose.ty, pose.tz);
      return;
    }
    let i = 0;
    while (i < POSES.length - 2 && t >= POSES[i + 1].t) i += 1;
    const a = POSES[i];
    const b = POSES[Math.min(i + 1, POSES.length - 1)];
    const u = a.t === b.t ? 0 : Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
    const s = u * u * (3 - 2 * u);
    pos.set(a.px + (b.px - a.px) * s, a.py + (b.py - a.py) * s, a.pz + (b.pz - a.pz) * s);
    target.set(a.tx + (b.tx - a.tx) * s, a.ty + (b.ty - a.ty) * s, a.tz + (b.tz - a.tz) * s);
  }

  function render(frame: SceneFrame): void {
    if (frame.schematic) return;
    for (let mode = 0; mode < 8; mode++) {
      for (let stage = 0; stage < guideMats[mode].length; stage++) {
        const n = frame.stageMeans[stage]?.[mode] ?? 0;
        guideMats[mode][stage].emissiveIntensity = n < 0.02 ? 0.012 : 0.06 + Math.min(2, n) * 0.72;
      }
    }
    for (const cell of TOPOLOGY) {
      const key = cellKey(cell.column, cell.pair);
      const phase = frame.settings.cells[key];
      const hot = frame.highlight?.column === cell.column && frame.highlight.pair[0] === cell.pair[0];
      const level = hot ? 0.95 : isPass(phase) ? 0.1 : 0.42;
      const heater = heaterMats.get(key);
      const pad = phaseMats.get(key);
      if (heater) heater.emissiveIntensity = level;
      if (pad) pad.emissiveIntensity = Math.max(0.12, level * 0.8);
    }
    if (frame.highlight) {
      const z0 = modeZ(frame.highlight.pair[0]);
      const z1 = modeZ(frame.highlight.pair[1]);
      highlight.visible = true;
      highlight.position.set(COL_X(frame.highlight.column), GUIDE_Y - 0.02, (z0 + z1) / 2);
      highlight.scale.set(1, 1, Math.max(0.7, Math.abs(z1 - z0) / 0.52));
      const mat = highlight.material as THREE.MeshBasicMaterial;
      mat.opacity = frame.reducedMotion ? 0.34 : 0.26 + 0.12 * (0.5 + 0.5 * Math.sin(frame.t * 2.1));
    } else {
      highlight.visible = false;
    }
    for (let mode = 0; mode < 8; mode++) {
      const count = frame.record ? frame.record[mode] : 0;
      detectorRims[mode].emissiveIntensity = frame.flash && frame.record ? 0.85 : 0.16;
      detectorMats[mode].emissiveIntensity = frame.record && count > 0 ? 0.35 + count * 0.2 : 0.12;
      const el = labelEls.get(`n-${mode}`);
      if (el) el.textContent = frame.record ? `n=${count}` : "";
    }

    poseAt(frame.t, frame.shot, frame.reducedMotion);
    camera.position.copy(pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    if (quality === "high") composer.render();
    else renderer.render(scene, camera);

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    for (const label of labelAnchors) {
      const el = labelEls.get(label.id);
      if (!el) continue;
      if (label.id.startsWith("n-") && !frame.record) {
        el.style.display = "none";
        continue;
      }
      scratch.copy(label.pos).project(camera);
      if (scratch.z > 1) {
        el.style.display = "none";
        continue;
      }
      const x = (scratch.x * 0.5 + 0.5) * w;
      const y = (-scratch.y * 0.5 + 0.5) * h;
      if (x < -40 || y < -20 || x > w + 40 || y > h + 20) {
        el.style.display = "none";
        continue;
      }
      el.style.display = "block";
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    }
  }

  resize();

  return {
    resize,
    render,
    setQuality(next) {
      quality = next;
      resize();
    },
    dispose() {
      renderer.dispose();
      tags.replaceChildren();
    },
  };
}
