import { cabs2, cadd, cmul, cscale, fact, permanent, type C, type Mat, C0, C1, cexp } from "./complex";
import { MODE_COUNT, type Pair } from "./mesh";

export type Occ = number[];

export const INPUT_OCC: Occ = [1, 0, 1, 0, 1, 0, 1, 0];

export function occKey(occ: Occ): string {
  return occ.join(",");
}

export function parseOcc(key: string): Occ {
  return key.split(",").map((n) => Number(n));
}

export function photonNumber(occ: Occ): number {
  return occ.reduce((s, n) => s + n, 0);
}

export function pairSums(occ: Occ): number[] {
  return [occ[0] + occ[1], occ[2] + occ[3], occ[4] + occ[5], occ[6] + occ[7]];
}

/** Designated dual-rail subspace: one photon in each input pair. */
export function inSubspace(occ: Occ): boolean {
  const sums = pairSums(occ);
  return sums.every((s) => s === 1) && photonNumber(occ) === 4;
}

/**
 * Logical bit string under the encoding |0_L⟩ = |1,0⟩, |1_L⟩ = |0,1⟩.
 * Returns null when the occupation is outside the designated subspace.
 * Invalid occupations are never translated into four-bit strings.
 */
export function logicalString(occ: Occ): string | null {
  if (!inSubspace(occ)) return null;
  return [occ[1], occ[3], occ[5], occ[7]].map((n) => (n === 1 ? "1" : "0")).join("");
}

export type FockAmp = {
  key: string;
  occ: Occ;
  re: number;
  im: number;
  p: number;
  logical: string | null;
  pairs: number[];
};

export type State = Map<string, C>;

export function stateFromOcc(occ: Occ, amp: C = C1): State {
  return new Map([[occKey(occ), amp]]);
}

function addAmp(state: State, key: string, amp: C): void {
  const prev = state.get(key);
  const next = prev ? cadd(prev, amp) : amp;
  if (cabs2(next) < 1e-18) state.delete(key);
  else state.set(key, next);
}

/**
 * Amplitude from occupation (na, nb) to (ka, kb) under a 2×2 unitary.
 * Includes the bosonic factors 1/√(na! nb! ka! kb!).
 */
export function twoModeAmplitude(block: Mat, na: number, nb: number, ka: number, kb: number): C {
  if (na + nb !== ka + kb) return C0;
  const n = na + nb;
  if (n === 0) return C1;
  const inModes = [...Array(na).fill(0), ...Array(nb).fill(1)];
  const outModes = [...Array(ka).fill(0), ...Array(kb).fill(1)];
  const matrix: Mat = outModes.map((rowMode) => inModes.map((colMode) => block[rowMode][colMode]));
  const per = permanent(matrix);
  return cscale(per, 1 / Math.sqrt(fact(na) * fact(nb) * fact(ka) * fact(kb)));
}

export function applyCell(state: State, pair: Pair, block: Mat): State {
  const next: State = new Map();
  const [a, b] = pair;
  for (const [key, amp] of state) {
    const occ = parseOcc(key);
    const na = occ[a];
    const nb = occ[b];
    const n = na + nb;
    if (n === 0) {
      addAmp(next, key, amp);
      continue;
    }
    for (let k = 0; k <= n; k++) {
      const trans = twoModeAmplitude(block, na, nb, k, n - k);
      if (cabs2(trans) < 1e-18) continue;
      const out = occ.slice();
      out[a] = k;
      out[b] = n - k;
      addAmp(next, occKey(out), cmul(amp, trans));
    }
  }
  return next;
}

export function applyTerminal(state: State, phases: number[]): State {
  const next: State = new Map();
  for (const [key, amp] of state) {
    const occ = parseOcc(key);
    let phase = 0;
    for (let mode = 0; mode < MODE_COUNT; mode++) phase += occ[mode] * (phases[mode] ?? 0);
    addAmp(next, key, cmul(amp, cexp(phase)));
  }
  return next;
}

export function meanOccupation(state: State): number[] {
  const mean = Array.from({ length: MODE_COUNT }, () => 0);
  for (const [key, amp] of state) {
    const p = cabs2(amp);
    const occ = parseOcc(key);
    for (let mode = 0; mode < MODE_COUNT; mode++) mean[mode] += p * occ[mode];
  }
  return mean;
}

export function stateNorm(state: State): number {
  let n = 0;
  for (const amp of state.values()) n += cabs2(amp);
  return n;
}

export function toItems(state: State): FockAmp[] {
  const items: FockAmp[] = [];
  for (const [key, amp] of state) {
    const p = cabs2(amp);
    if (p < 1e-14) continue;
    const occ = parseOcc(key);
    items.push({
      key,
      occ,
      re: amp.re,
      im: amp.im,
      p,
      logical: logicalString(occ),
      pairs: pairSums(occ),
    });
  }
  items.sort((a, b) => b.p - a.p || a.key.localeCompare(b.key));
  return items;
}

export function acceptanceProbability(items: FockAmp[]): number {
  let p = 0;
  for (const item of items) if (item.logical !== null) p += item.p;
  return p;
}

export type LogicalProb = {
  logical: string;
  p: number;
  conditional: number;
};

/**
 * Conditional distribution on the designated subspace.
 * Returns null when P(accept) is zero so callers cannot divide by zero.
 */
export function conditionalLogical(items: FockAmp[]): LogicalProb[] | null {
  const pAccept = acceptanceProbability(items);
  if (pAccept <= 1e-12) return null;
  const grouped = new Map<string, number>();
  for (const item of items) {
    if (item.logical === null) continue;
    grouped.set(item.logical, (grouped.get(item.logical) ?? 0) + item.p);
  }
  return [...grouped.entries()]
    .map(([logical, p]) => ({ logical, p, conditional: p / pAccept }))
    .sort((a, b) => b.p - a.p || a.logical.localeCompare(b.logical));
}

export function partitionPatterns(items: FockAmp[], limit: number): { shown: FockAmp[]; other: number } {
  const shown = items.slice(0, limit);
  let other = 0;
  for (let i = shown.length; i < items.length; i++) other += items[i].p;
  return { shown, other };
}

/** Permanent formula for a full 8×8 unitary acting on one Fock basis input. */
export function fockAmplitude(u: Mat, input: Occ, output: Occ): C {
  if (photonNumber(input) !== photonNumber(output)) return C0;
  const inModes: number[] = [];
  const outModes: number[] = [];
  let denomIn = 1;
  let denomOut = 1;
  for (let mode = 0; mode < MODE_COUNT; mode++) {
    for (let i = 0; i < input[mode]; i++) inModes.push(mode);
    for (let i = 0; i < output[mode]; i++) outModes.push(mode);
    denomIn *= fact(input[mode]);
    denomOut *= fact(output[mode]);
  }
  const n = inModes.length;
  if (n === 0) return C1;
  const matrix: Mat = outModes.map((rowMode) => inModes.map((colMode) => u[rowMode][colMode]));
  return cscale(permanent(matrix), 1 / Math.sqrt(denomIn * denomOut));
}

export function enumerateOccupations(photons: number, modes: number): Occ[] {
  const found: Occ[] = [];
  const walk = (left: number, mode: number, acc: number[]) => {
    if (mode === modes - 1) {
      found.push([...acc, left]);
      return;
    }
    for (let k = 0; k <= left; k++) {
      acc.push(k);
      walk(left - k, mode + 1, acc);
      acc.pop();
    }
  };
  walk(photons, 0, []);
  return found;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One complete occupation pattern per trial. Fixed seed. Not forced onto the ideal probabilities. */
export function sampleKeys(items: FockAmp[], count: number, seed: number): string[] {
  const usable = items.filter((item) => item.p > 0);
  const cdf: { key: string; edge: number }[] = [];
  let acc = 0;
  for (const item of usable) {
    acc += item.p;
    cdf.push({ key: item.key, edge: acc });
  }
  if (cdf.length === 0) return Array.from({ length: count }, () => "");
  cdf[cdf.length - 1].edge = Math.max(cdf[cdf.length - 1].edge, 1);
  const rng = mulberry32(seed);
  const out: string[] = [];
  for (let trial = 0; trial < count; trial++) {
    const r = rng();
    let chosen = cdf[cdf.length - 1].key;
    for (const bin of cdf) {
      if (r <= bin.edge) {
        chosen = bin.key;
        break;
      }
    }
    out.push(chosen);
  }
  return out;
}

export type BatchTally = {
  trials: number;
  full: Map<string, number>;
  accepted: Map<string, number>;
  acceptedCount: number;
  outsideCount: number;
};

export function tallySamples(keys: string[]): BatchTally {
  const full = new Map<string, number>();
  const accepted = new Map<string, number>();
  let acceptedCount = 0;
  let outsideCount = 0;
  for (const key of keys) {
    full.set(key, (full.get(key) ?? 0) + 1);
    const logical = logicalString(parseOcc(key));
    if (logical === null) outsideCount += 1;
    else {
      acceptedCount += 1;
      accepted.set(logical, (accepted.get(logical) ?? 0) + 1);
    }
  }
  return { trials: keys.length, full, accepted, acceptedCount, outsideCount };
}
