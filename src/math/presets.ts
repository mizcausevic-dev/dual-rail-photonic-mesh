import { cabs2 } from "./complex";
import {
  applyCell,
  applyTerminal,
  INPUT_OCC,
  meanOccupation,
  stateFromOcc,
  stateNorm,
  toItems,
  acceptanceProbability,
  type FockAmp,
  type State,
} from "./fock";
import {
  BALANCED,
  COLUMN_COUNT,
  MODE_COUNT,
  PASS,
  SWAP,
  TOPOLOGY,
  blankSettings,
  buildUnitary,
  cellKey,
  cellM,
  cloneSettings,
  meshUnitaryError,
  setCell,
  type MeshSettings,
  type Pair,
} from "./mesh";

export type PresetId =
  | "identity"
  | "local-q1"
  | "bunching"
  | "local-all"
  | "partial-cross"
  | "deeper-mix";

export type Evolved = {
  items: FockAmp[];
  norm: number;
  photonNumberOk: boolean;
  pAccept: number;
  /** stage 0 is the input. stage c+1 is the state after column c, before terminal phases. */
  stageMeans: number[][];
  stageItems: FockAmp[][];
  meanOut: number[];
  /** |U_kj|², row k is the output mode, column j is the input mode. */
  transfer: number[][];
  unitaryError: number;
};

const cache = new Map<string, Evolved>();

function settingsKey(settings: MeshSettings): string {
  return JSON.stringify(settings);
}

export function evolve(settings: MeshSettings): Evolved {
  const key = settingsKey(settings);
  const hit = cache.get(key);
  if (hit) return hit;

  let state: State = stateFromOcc(INPUT_OCC);
  const stageMeans: number[][] = [meanOccupation(state)];
  const stageItems: FockAmp[][] = [toItems(state)];

  for (let column = 0; column < COLUMN_COUNT; column++) {
    for (const cell of TOPOLOGY) {
      if (cell.column !== column) continue;
      const phase = settings.cells[cellKey(column, cell.pair)];
      state = applyCell(state, cell.pair, cellM(phase.theta, phase.phi));
    }
    stageMeans.push(meanOccupation(state));
    stageItems.push(toItems(state));
  }

  state = applyTerminal(state, settings.terminal);
  const items = toItems(state);
  const unitary = buildUnitary(settings);
  const transfer = unitary.map((row) => row.map((value) => cabs2(value)));
  let photonNumberOk = true;
  for (const item of items) {
    const n = item.occ.reduce((s, v) => s + v, 0);
    if (n !== 4) photonNumberOk = false;
  }

  const evolved: Evolved = {
    items,
    norm: stateNorm(state),
    photonNumberOk,
    pAccept: acceptanceProbability(items),
    stageMeans,
    stageItems,
    meanOut: meanOccupation(state),
    transfer,
    unitaryError: meshUnitaryError(settings),
  };
  cache.set(key, evolved);
  return evolved;
}

export function identitySettings(): MeshSettings {
  return blankSettings();
}

export function localQ1Settings(theta: number, phi: number): MeshSettings {
  return setCell(blankSettings(), 0, [0, 1], { theta, phi });
}

export function bunchingSettings(): MeshSettings {
  let s = blankSettings();
  s = setCell(s, 0, [0, 1], SWAP);
  s = setCell(s, 1, [1, 2], BALANCED);
  return s;
}

export function localAllSettings(): MeshSettings {
  let s = blankSettings();
  const pairs: Pair[] = [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
  ];
  for (const pair of pairs) s = setCell(s, 0, pair, BALANCED);
  return s;
}

/** Local rotations on Q1 and Q2, then a partial cross-pair cell on modes 1 and 2. */
export function partialCrossSettings(): MeshSettings {
  let s = blankSettings();
  s = setCell(s, 0, [0, 1], BALANCED);
  s = setCell(s, 0, [2, 3], BALANCED);
  s = setCell(s, 1, [1, 2], { theta: Math.PI - 0.8, phi: Math.PI });
  return s;
}

/**
 * Local balanced rotations on all four pairs, then one balanced cross-pair cell.
 * Other cross-pair cells stay at the pass setting.
 */
export function deeperMixSettings(): MeshSettings {
  let s = localAllSettings();
  s = setCell(s, 1, [1, 2], BALANCED);
  return s;
}

export function presetSettings(id: PresetId, localPhase?: { theta: number; phi: number }): MeshSettings {
  switch (id) {
    case "identity":
      return identitySettings();
    case "local-q1":
      return localQ1Settings(localPhase?.theta ?? BALANCED.theta, localPhase?.phi ?? BALANCED.phi);
    case "bunching":
      return bunchingSettings();
    case "local-all":
      return localAllSettings();
    case "partial-cross":
      return partialCrossSettings();
    case "deeper-mix":
      return deeperMixSettings();
  }
}

export const PRESET_COPY: Record<PresetId, { title: string; detail: string }> = {
  identity: {
    title: "Pass preset",
    detail:
      "Every cell is at the pass setting M(π, π) = I, and terminal phases are 0. This is a reference preparation, not a measured device state.",
  },
  "local-q1": {
    title: "Local rail-pair operation",
    detail:
      "Only the first cell on modes 0 and 1 is programmed. Every cross-pair cell stays at the pass setting, so the four rail pairs still factorize.",
  },
  bunching: {
    title: "Two-photon interference benchmark",
    detail:
      "Separate demonstration preset. A routing cell moves the mode-0 photon onto mode 1. A balanced cell then mixes modes 1 and 2. Modes 4 and 6 hold two additional spectator photons.",
  },
  "local-all": {
    title: "Local rotations on all four pairs",
    detail:
      "Each rail pair meets one balanced local cell. No cross-pair cell is programmed away from pass. This preparation stays inside the designated subspace.",
  },
  "partial-cross": {
    title: "Partial cross-pair mixing",
    detail:
      "Q1 and Q2 receive local balanced cells. Modes 1 and 2 then meet a partial cross-pair cell. Q3 and Q4 stay in the pass configuration. Separate preparation.",
  },
  "deeper-mix": {
    title: "Local rotations plus one balanced cross cell",
    detail:
      "All four pairs receive a local balanced cell. Modes 1 and 2 then meet one balanced cross-pair cell. The other cross-pair cells stay at pass. Separate preparation.",
  },
};

export function activeNonPass(settings: MeshSettings): { column: number; pair: Pair }[] {
  const found: { column: number; pair: Pair }[] = [];
  for (const cell of TOPOLOGY) {
    const phase = settings.cells[cellKey(cell.column, cell.pair)];
    if (Math.abs(phase.theta - PASS.theta) > 1e-4 || Math.abs(phase.phi - PASS.phi) > 1e-4) {
      found.push({ column: cell.column, pair: cell.pair });
    }
  }
  return found;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function localProgram(t: number): { theta: number; phi: number } {
  const u = smoothstep(6.2, 8, t);
  return {
    theta: Math.PI + (Math.PI / 2 - Math.PI) * u,
    phi: Math.PI + (Math.PI / 2 - Math.PI) * u,
  };
}

export type SceneScience = {
  id: PresetId;
  settings: MeshSettings;
  evolved: Evolved;
  program: { theta: number; phi: number } | null;
};

export function scienceAt(t: number): SceneScience {
  if (t < 10) {
    if (t < 5) {
      const settings = identitySettings();
      return { id: "identity", settings, evolved: evolve(settings), program: null };
    }
    const program = localProgram(t);
    const settings = localQ1Settings(program.theta, program.phi);
    return { id: "local-q1", settings, evolved: evolve(settings), program };
  }
  if (t < 17) {
    const settings = bunchingSettings();
    return { id: "bunching", settings, evolved: evolve(settings), program: null };
  }
  if (t < 19.6) {
    const settings = localAllSettings();
    return { id: "local-all", settings, evolved: evolve(settings), program: null };
  }
  if (t < 22.2) {
    const settings = partialCrossSettings();
    return { id: "partial-cross", settings, evolved: evolve(settings), program: null };
  }
  const settings = deeperMixSettings();
  return { id: "deeper-mix", settings, evolved: evolve(settings), program: null };
}

export function cloneForExport(settings: MeshSettings): MeshSettings {
  return cloneSettings(settings);
}

export { MODE_COUNT };
