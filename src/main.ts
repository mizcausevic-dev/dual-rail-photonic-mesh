import { Score } from "./audio";
import { drawSchematic } from "./fallback";
import { parseOcc } from "./math/fock";
import {
  bunchingSettings,
  deeperMixSettings,
  evolve,
  identitySettings,
  localAllSettings,
  localQ1Settings,
  partialCrossSettings,
} from "./math/presets";
import { liveText, readoutSignature, renderReadout } from "./readout";
import { createScene, type MeshScene, type SceneFrame } from "./scene";
import { DURATION, fixedTrialKeys, presentAt, type Presentation } from "./timeline";

function must<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing ${selector}`);
  return el;
}

const stage = must<HTMLElement>("#stage");
const canvas = must<HTMLCanvasElement>("#view");
const tags = must<HTMLElement>("#tags");
const fallback = must<HTMLElement>("#fallback");
const readout = must<HTMLElement>("#readout");
const loading = must<HTMLElement>("#loading");
const errorBox = must<HTMLElement>("#error");
const live = must<HTMLElement>("#live");
const playBtn = must<HTMLButtonElement>("#play");
const replayBtn = must<HTMLButtonElement>("#replay");
const muteBtn = must<HTMLButtonElement>("#mute");
const schemeBtn = must<HTMLButtonElement>("#scheme");
const fullBtn = must<HTMLButtonElement>("#full");
const reduceBox = must<HTMLInputElement>("#reduce");
const musicInput = must<HTMLInputElement>("#music");
const sfxInput = must<HTMLInputElement>("#sfx");
const scrub = must<HTMLInputElement>("#scrub");
const timecode = must<HTMLElement>("#timecode");
const audioNote = must<HTMLElement>("#audio-note");

const score = new Score();
let scene: MeshScene | null = null;
let schematic = false;
let webglOk = hasWebGL();
let lastSig = "";
let lastLive = "";
let slowFrames = 0;
let quality: "high" | "low" = window.innerWidth < 720 ? "low" : "high";

const clock = {
  t: 0,
  playing: false,
  anchorT: 0,
  anchorPerf: 0,
  useAudio: false,
};

reduceBox.checked = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (!document.fullscreenEnabled) fullBtn.hidden = true;

function hasWebGL(): boolean {
  try {
    const probe = document.createElement("canvas");
    return Boolean(probe.getContext("webgl2") || probe.getContext("webgl"));
  } catch {
    return false;
  }
}

function readTime(): number {
  if (!clock.playing) return clock.t;
  const next = clock.useAudio && score.running ? score.currentT() : clock.anchorT + (performance.now() - clock.anchorPerf) / 1000;
  clock.t = Math.min(DURATION, Math.max(0, next));
  if (clock.t >= DURATION) {
    clock.t = DURATION;
    clock.playing = false;
    clock.useAudio = false;
    score.silence();
    playBtn.textContent = "Play";
    playBtn.setAttribute("aria-pressed", "false");
  }
  return clock.t;
}

function highlightFor(view: Presentation): SceneFrame["highlight"] {
  if (view.shot === 2) return { column: 0, pair: [0, 1] };
  if (view.shot === 3) return view.t < 13.5 ? { column: 0, pair: [0, 1] } : { column: 1, pair: [1, 2] };
  return null;
}

function recordFor(view: Presentation): { record: number[] | null; flash: boolean } {
  if (view.revealed <= 0) return { record: null, flash: false };
  const key = view.trialKeys[view.trialKeys.length - 1];
  const record = key ? parseOcc(key) : null;
  const tOn = 25 + (view.revealed * 8) / 64;
  return { record, flash: view.t - tOn >= 0 && view.t - tOn < 0.18 };
}

function paint(): void {
  const t = readTime();
  const view = presentAt(t);
  const sig = readoutSignature(view);
  if (sig !== lastSig) {
    const scroll = readout.scrollTop;
    readout.innerHTML = renderReadout(view);
    readout.scrollTop = scroll;
    lastSig = sig;
    if (schematic || !webglOk) drawSchematic(fallback, view);
  }
  const spoken = liveText(view);
  if (spoken !== lastLive) {
    live.textContent = spoken;
    lastLive = spoken;
    canvas.setAttribute(
      "aria-label",
      `Shot ${view.shot} schematic. Eight optical modes, four input photons, rectangular mesh, terminal phases, and destructive detectors.`,
    );
  }
  const { record, flash } = recordFor(view);
  const frame: SceneFrame = {
    t: view.t,
    shot: view.shot,
    reducedMotion: reduceBox.checked,
    settings: view.science.settings,
    stageMeans: view.science.evolved.stageMeans,
    highlight: highlightFor(view),
    record,
    flash: flash && !reduceBox.checked,
    schematic: schematic || !webglOk,
  };
  scene?.render(frame);
  const frameNo = view.frame;
  timecode.textContent = `${view.t.toFixed(3)} / 34.000 s · frame ${frameNo}`;
  if (document.activeElement !== scrub) scrub.value = view.t.toFixed(3);
  scrub.setAttribute("aria-valuenow", view.t.toFixed(3));
  scrub.setAttribute("aria-valuetext", `${view.t.toFixed(1)} seconds, shot ${view.shot}`);
  playBtn.textContent = clock.playing ? "Pause" : "Play";
  playBtn.setAttribute("aria-pressed", clock.playing ? "true" : "false");
}

async function play(): Promise<void> {
  if (clock.t >= DURATION) clock.t = 0;
  clock.playing = true;
  clock.anchorT = clock.t;
  clock.anchorPerf = performance.now();
  clock.useAudio = false;
  score.attach();
  const ok = await score.startAt(clock.t);
  if (clock.playing && ok) {
    clock.anchorT = score.currentT();
    clock.useAudio = true;
    audioNote.textContent = "";
  } else if (clock.playing) {
    audioNote.textContent = "Audio did not start. The visual timeline is still running.";
  }
}

function pause(): void {
  clock.t = readTime();
  clock.playing = false;
  clock.useAudio = false;
  score.silence();
}

function seek(t: number): void {
  const next = Math.min(DURATION, Math.max(0, t));
  clock.t = next;
  clock.anchorT = next;
  clock.anchorPerf = performance.now();
  if (clock.playing) {
    clock.useAudio = false;
    void score.startAt(next).then((ok) => {
      if (clock.playing && ok) clock.useAudio = true;
    });
  }
  paint();
}

playBtn.addEventListener("click", () => {
  if (clock.playing) pause();
  else void play();
  paint();
});

replayBtn.addEventListener("click", () => {
  clock.t = 0;
  clock.anchorT = 0;
  clock.anchorPerf = performance.now();
  clock.playing = true;
  clock.useAudio = false;
  score.attach();
  void score.startAt(0).then((ok) => {
    if (clock.playing && ok) clock.useAudio = true;
  });
  paint();
});

muteBtn.addEventListener("click", () => {
  const next = muteBtn.getAttribute("aria-pressed") !== "true";
  muteBtn.setAttribute("aria-pressed", next ? "true" : "false");
  muteBtn.textContent = next ? "Unmute" : "Mute";
  score.setMuted(next);
});

schemeBtn.addEventListener("click", () => {
  schematic = schemeBtn.getAttribute("aria-pressed") !== "true";
  schemeBtn.setAttribute("aria-pressed", schematic ? "true" : "false");
  applyViewMode();
  lastSig = "";
  paint();
});

reduceBox.addEventListener("change", () => paint());

musicInput.addEventListener("input", () => score.setMusic(Number(musicInput.value)));
sfxInput.addEventListener("input", () => score.setSfx(Number(sfxInput.value)));

scrub.addEventListener("input", () => seek(Number(scrub.value)));

fullBtn.addEventListener("click", () => {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.getElementById("app")?.requestFullscreen();
});

window.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement | null;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA") && target.id !== "scrub") return;
  if (event.key === " " || event.code === "Space") {
    event.preventDefault();
    if (clock.playing) pause();
    else void play();
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    seek(clock.t + (event.shiftKey ? 0.1 : 1));
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    seek(clock.t - (event.shiftKey ? 0.1 : 1));
  } else if (event.key === "Home") {
    seek(0);
  } else if (event.key === "End") {
    seek(DURATION);
  } else if (event.key === "m" || event.key === "M") {
    muteBtn.click();
  } else if (event.key === "f" || event.key === "F") {
    fullBtn.click();
  } else if (event.key === "r" || event.key === "R") {
    replayBtn.click();
  } else {
    return;
  }
  paint();
});

function applyViewMode(): void {
  const showSchematic = schematic || !webglOk;
  canvas.hidden = showSchematic;
  tags.hidden = showSchematic;
  fallback.hidden = !showSchematic;
  if (!showSchematic) scene?.resize();
}

function showError(message: string): void {
  errorBox.hidden = false;
  errorBox.textContent = message;
  webglOk = false;
  applyViewMode();
  lastSig = "";
}

function frame(now: number): void {
  const before = now;
  paint();
  const cost = performance.now() - before;
  if (clock.playing && cost > 42) slowFrames += 1;
  else slowFrames = Math.max(0, slowFrames - 1);
  if (slowFrames > 20 && quality === "high" && scene) {
    quality = "low";
    scene.setQuality("low");
  }
  requestAnimationFrame(frame);
}

function boot(): void {
  try {
    evolve(identitySettings());
    evolve(localQ1Settings(Math.PI, Math.PI));
    evolve(localQ1Settings(Math.PI / 2, Math.PI / 2));
    evolve(bunchingSettings());
    evolve(localAllSettings());
    evolve(partialCrossSettings());
    evolve(deeperMixSettings());
    fixedTrialKeys();
    presentAt(0);
    if (webglOk && canvas && tags) {
      scene = createScene(canvas, tags, () => showError("WebGL context lost. The 2D schematic is showing the same calculated model."));
      scene.setQuality(quality);
    } else {
      showError("WebGL is unavailable. The 2D schematic is showing the same calculated model.");
    }
  } catch (err) {
    showError(err instanceof Error ? err.message : "The 3D view failed to start.");
  }
  loading.hidden = true;
  applyViewMode();
  paint();
  requestAnimationFrame(frame);
}

new ResizeObserver(() => scene?.resize()).observe(stage);
boot();
