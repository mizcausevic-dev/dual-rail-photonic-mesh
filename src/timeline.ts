import { sampleKeys, tallySamples, type BatchTally } from "./math/fock";
import { deeperMixSettings, evolve, scienceAt, type SceneScience } from "./math/presets";

export const DURATION = 34;
export const FPS = 30;
export const FRAME_COUNT = 1020;
export const TRIAL_COUNT = 64;
export const TRIAL_SEED = 20261020;
export const TRIAL_REVEAL_START = 25;
export const TRIAL_REVEAL_END = 33;

export type ShotId = 1 | 2 | 3 | 4 | 5;

export function clampTime(t: number): number {
  if (!Number.isFinite(t)) return 0;
  return Math.min(DURATION, Math.max(0, t));
}

/** Shot intervals are start-inclusive and end-exclusive, except the hold at t = 34. */
export function shotAt(t: number): ShotId {
  if (t < 5) return 1;
  if (t < 10) return 2;
  if (t < 17) return 3;
  if (t < 25) return 4;
  return 5;
}

/** Reference frames 0–1019. At t = 34 the final frame is held. */
export function frameAt(t: number): number {
  if (t >= DURATION) return FRAME_COUNT - 1;
  return Math.min(FRAME_COUNT - 1, Math.max(0, Math.floor(t * FPS)));
}

export function trialsRevealed(t: number): number {
  if (t < TRIAL_REVEAL_START) return 0;
  if (t >= TRIAL_REVEAL_END) return TRIAL_COUNT;
  return Math.floor(((t - TRIAL_REVEAL_START) / (TRIAL_REVEAL_END - TRIAL_REVEAL_START)) * TRIAL_COUNT);
}

let deeperSamples: string[] | null = null;

export function fixedTrialKeys(): string[] {
  if (!deeperSamples) {
    const evolved = evolve(deeperMixSettings());
    deeperSamples = sampleKeys(evolved.items, TRIAL_COUNT, TRIAL_SEED);
  }
  return deeperSamples;
}

export function batchAt(t: number): { keys: string[]; tally: BatchTally; revealed: number } {
  const revealed = trialsRevealed(t);
  const keys = fixedTrialKeys().slice(0, revealed);
  return { keys, tally: tallySamples(keys), revealed };
}

export type Presentation = {
  t: number;
  frame: number;
  shot: ShotId;
  science: SceneScience;
  revealed: number;
  trialKeys: string[];
  tally: BatchTally;
};

export function presentAt(tRaw: number): Presentation {
  const t = clampTime(tRaw);
  const batch = batchAt(t);
  return {
    t,
    frame: frameAt(t),
    shot: shotAt(t),
    science: scienceAt(t),
    revealed: batch.revealed,
    trialKeys: batch.keys,
    tally: batch.tally,
  };
}

export const SHOT_META: Record<ShotId, { start: number; end: number; title: string; frames: string }> = {
  1: {
    start: 0,
    end: 5,
    title: "Four-qubit input and mesh",
    frames: "0–149",
  },
  2: {
    start: 5,
    end: 10,
    title: "Encoding and local control",
    frames: "150–299",
  },
  3: {
    start: 10,
    end: 17,
    title: "Multiphoton benchmark",
    frames: "300–509",
  },
  4: {
    start: 17,
    end: 25,
    title: "Generic mesh programming",
    frames: "510–749",
  },
  5: {
    start: 25,
    end: 34,
    title: "Detection and scope",
    frames: "750–1019",
  },
};
