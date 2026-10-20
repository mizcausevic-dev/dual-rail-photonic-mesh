import { c, cexp, ident, matMul, type C, type Mat, unitaryError } from "./complex";

export const MODE_COUNT = 8;
export const COLUMN_COUNT = 8;

/**
 * Balanced coupler used inside every cell.
 * C = (1/√2) [[1, i], [i, 1]].
 * Columns are inputs, rows are outputs.
 */
export function couplerC(): Mat {
  const s = 1 / Math.SQRT2;
  return [
    [c(s, 0), c(0, s)],
    [c(0, s), c(s, 0)],
  ];
}

/** D(α) = diag(1, e^{iα}). */
export function phaseD(alpha: number): Mat {
  return [
    [c(1, 0), c(0, 0)],
    [c(0, 0), cexp(alpha)],
  ];
}

/**
 * Representative Mach–Zehnder cell.
 * M(θ, φ) = D(φ) C D(θ) C.
 * The product applies C first, then D(θ), then C, then D(φ).
 * Three proved settings return their closed forms so the pass, swap,
 * and balanced benchmarks are not limited by product roundoff.
 */
export function cellM(theta: number, phi: number): Mat {
  if (theta === Math.PI && phi === Math.PI) return ident(2);
  if (theta === 0 && phi === 0) {
    return [
      [c(0, 0), c(0, 1)],
      [c(0, 1), c(0, 0)],
    ];
  }
  if (theta === Math.PI / 2 && phi === Math.PI / 2) {
    return [
      [c(0.5, -0.5), c(-0.5, 0.5)],
      [c(-0.5, -0.5), c(-0.5, -0.5)],
    ];
  }
  return cellMProduct(theta, phi);
}

export function cellMProduct(theta: number, phi: number): Mat {
  const coupler = couplerC();
  return matMul(phaseD(phi), matMul(coupler, matMul(phaseD(theta), coupler)));
}

export type Pair = [number, number];

export type CellKind = "local" | "cross";

export type CellSpec = {
  column: number;
  pair: Pair;
  kind: CellKind;
};

/** Clements-style rectangular nearest-neighbor layout. 28 cells. */
export function meshTopology(): CellSpec[] {
  const cells: CellSpec[] = [];
  const local: Pair[] = [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
  ];
  const cross: Pair[] = [
    [1, 2],
    [3, 4],
    [5, 6],
  ];
  for (let column = 0; column < COLUMN_COUNT; column++) {
    const pairs = column % 2 === 0 ? local : cross;
    const kind: CellKind = column % 2 === 0 ? "local" : "cross";
    for (const pair of pairs) cells.push({ column, pair, kind });
  }
  return cells;
}

export const TOPOLOGY = meshTopology();

export function cellKey(column: number, pair: Pair): string {
  return `${column}:${pair[0]}-${pair[1]}`;
}

export type PhasePair = { theta: number; phi: number };

export type MeshSettings = {
  cells: Record<string, PhasePair>;
  terminal: number[];
};

/** Pass setting for this convention: M(π, π) = I. */
export const PASS: PhasePair = { theta: Math.PI, phi: Math.PI };

/** Routes the two ports with a phase of i on each: M(0, 0) = [[0, i], [i, 0]]. */
export const SWAP: PhasePair = { theta: 0, phi: 0 };

/**
 * Balanced point of this cell.
 * On |1,1⟩ it reproduces i(|2,0⟩ + |0,2⟩)/√2.
 */
export const BALANCED: PhasePair = { theta: Math.PI / 2, phi: Math.PI / 2 };

export function blankSettings(): MeshSettings {
  const cells: Record<string, PhasePair> = {};
  for (const cell of TOPOLOGY) {
    cells[cellKey(cell.column, cell.pair)] = { ...PASS };
  }
  return { cells, terminal: Array.from({ length: MODE_COUNT }, () => 0) };
}

export function cloneSettings(s: MeshSettings): MeshSettings {
  const cells: Record<string, PhasePair> = {};
  for (const [k, v] of Object.entries(s.cells)) {
    cells[k] = { theta: v.theta, phi: v.phi };
  }
  return { cells, terminal: s.terminal.slice() };
}

export function setCell(s: MeshSettings, column: number, pair: Pair, phase: PhasePair): MeshSettings {
  const next = cloneSettings(s);
  next.cells[cellKey(column, pair)] = { theta: phase.theta, phi: phase.phi };
  return next;
}

export function embed(pair: Pair, block: Mat): Mat {
  const u = ident(MODE_COUNT);
  const [a, b] = pair;
  u[a][a] = block[0][0];
  u[a][b] = block[0][1];
  u[b][a] = block[1][0];
  u[b][b] = block[1][1];
  return u;
}

/**
 * Full eight-mode unitary.
 * U = T U7 ... U0, so column 0 acts first on the input vector.
 * Terminal phases T act last, on the output modes.
 */
export function buildUnitary(settings: MeshSettings): Mat {
  let u = ident(MODE_COUNT);
  for (let column = 0; column < COLUMN_COUNT; column++) {
    let uc = ident(MODE_COUNT);
    for (const cell of TOPOLOGY) {
      if (cell.column !== column) continue;
      const phase = settings.cells[cellKey(column, cell.pair)];
      const embedded = embed(cell.pair, cellM(phase.theta, phase.phi));
      uc = matMul(embedded, uc);
    }
    u = matMul(uc, u);
  }
  const terminal = ident(MODE_COUNT);
  for (let k = 0; k < MODE_COUNT; k++) terminal[k][k] = cexp(settings.terminal[k] ?? 0);
  return matMul(terminal, u);
}

export function meshUnitaryError(settings: MeshSettings): number {
  return unitaryError(buildUnitary(settings));
}

export function cellOf(settings: MeshSettings, column: number, pair: Pair): { phase: PhasePair; matrix: Mat } {
  const phase = settings.cells[cellKey(column, pair)];
  return { phase, matrix: cellM(phase.theta, phase.phi) };
}

export function isPass(phase: PhasePair): boolean {
  return Math.abs(phase.theta - Math.PI) < 1e-4 && Math.abs(phase.phi - Math.PI) < 1e-4;
}

export type { C };
