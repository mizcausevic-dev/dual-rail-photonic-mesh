import { describe, expect, it } from "vitest";
import { c, cNear, cabs2, unitaryError } from "../src/math/complex";
import {
  BALANCED,
  PASS,
  SWAP,
  TOPOLOGY,
  buildUnitary,
  cellM as meshCell,
  cellMProduct,
  couplerC,
  meshUnitaryError,
} from "../src/math/mesh";
import {
  INPUT_OCC,
  conditionalLogical,
  fockAmplitude,
  inSubspace,
  logicalString,
  sampleKeys,
  tallySamples,
  twoModeAmplitude,
} from "../src/math/fock";
import { enumerateOccupations } from "../src/math/fock";
import {
  bunchingSettings,
  deeperMixSettings,
  evolve,
  identitySettings,
  localAllSettings,
  localQ1Settings,
  partialCrossSettings,
} from "../src/math/presets";
import { renderReadout } from "../src/readout";
import { frameAt, presentAt, shotAt, trialsRevealed } from "../src/timeline";

describe("cell convention", () => {
  it("builds a unitary coupler and cell", () => {
    expect(unitaryError(couplerC())).toBeLessThan(1e-12);
    for (const [theta, phi] of [
      [0, 0],
      [Math.PI, Math.PI],
      [Math.PI / 2, Math.PI / 2],
      [0.4, -1.2],
      [2.2, 0.7],
    ] as const) {
      expect(unitaryError(meshCell(theta, phi))).toBeLessThan(1e-9);
    }
  });

  it("sets pass, swap, and balanced points", () => {
    const pass = meshCell(PASS.theta, PASS.phi);
    expect(cNear(pass[0][0], c(1, 0))).toBe(true);
    expect(cNear(pass[0][1], c(0, 0))).toBe(true);
    expect(cNear(pass[1][0], c(0, 0))).toBe(true);
    expect(cNear(pass[1][1], c(1, 0))).toBe(true);

    const swap = meshCell(SWAP.theta, SWAP.phi);
    expect(cNear(swap[0][0], c(0, 0))).toBe(true);
    expect(cNear(swap[0][1], c(0, 1))).toBe(true);
    expect(cNear(swap[1][0], c(0, 1))).toBe(true);
    expect(cNear(swap[1][1], c(0, 0))).toBe(true);

    const balanced = meshCell(BALANCED.theta, BALANCED.phi);
    const to20 = twoModeAmplitude(balanced, 1, 1, 2, 0);
    const to02 = twoModeAmplitude(balanced, 1, 1, 0, 2);
    const to11 = twoModeAmplitude(balanced, 1, 1, 1, 1);
    const target = c(0, 1 / Math.SQRT2);
    expect(cNear(to20, target, 1e-9)).toBe(true);
    expect(cNear(to02, target, 1e-9)).toBe(true);
    expect(cabs2(to11)).toBeLessThan(1e-12);

    for (const [theta, phi] of [
      [PASS.theta, PASS.phi],
      [SWAP.theta, SWAP.phi],
      [BALANCED.theta, BALANCED.phi],
    ] as const) {
      const closed = meshCell(theta, phi);
      const product = cellMProduct(theta, phi);
      for (let r = 0; r < 2; r++) {
        for (let col = 0; col < 2; col++) expect(cNear(closed[r][col], product[r][col], 1e-9)).toBe(true);
      }
    }
  });
});

describe("mesh and fock evolution", () => {
  it("uses 28 cells and stays unitary on every preset", () => {
    expect(TOPOLOGY).toHaveLength(28);
    const presets = [
      identitySettings(),
      localQ1Settings(Math.PI / 2, Math.PI / 2),
      bunchingSettings(),
      localAllSettings(),
      partialCrossSettings(),
      deeperMixSettings(),
    ];
    for (const settings of presets) {
      expect(meshUnitaryError(settings)).toBeLessThan(1e-8);
      const evolved = evolve(settings);
      expect(evolved.unitaryError).toBeLessThan(1e-8);
      expect(Math.abs(evolved.norm - 1)).toBeLessThan(1e-8);
      expect(evolved.photonNumberOk).toBe(true);
      const meanSum = evolved.meanOut.reduce((s, n) => s + n, 0);
      expect(Math.abs(meanSum - 4)).toBeLessThan(1e-8);
    }
  });

  it("matches the permanent formula on the input occupation", () => {
    const settings = deeperMixSettings();
    const evolved = evolve(settings);
    const unitary = buildUnitary(settings);
    const outputs = enumerateOccupations(4, 8);
    let worst = 0;
    for (const output of outputs) {
      const amp = fockAmplitude(unitary, INPUT_OCC, output);
      const key = output.join(",");
      const fromState = evolved.items.find((item) => item.key === key);
      const re = fromState?.re ?? 0;
      const im = fromState?.im ?? 0;
      worst = Math.max(worst, Math.abs(re - amp.re), Math.abs(im - amp.im));
    }
    expect(worst).toBeLessThan(1e-8);
  });

  it("keeps the identity preparation on the input", () => {
    const evolved = evolve(identitySettings());
    expect(evolved.items).toHaveLength(1);
    expect(evolved.items[0].key).toBe("1,0,1,0,1,0,1,0");
    expect(evolved.items[0].logical).toBe("0000");
    expect(evolved.pAccept).toBeCloseTo(1, 8);
    for (const stage of evolved.stageMeans) {
      expect(stage[0]).toBeCloseTo(1, 8);
      expect(stage[1]).toBeCloseTo(0, 8);
      expect(stage[2]).toBeCloseTo(1, 8);
      expect(stage[6]).toBeCloseTo(1, 8);
    }
  });

  it("routes mode 0 onto mode 1 before the bunching cell", () => {
    const evolved = evolve(bunchingSettings());
    const afterRoute = evolved.stageItems[1];
    expect(afterRoute).toHaveLength(1);
    expect(afterRoute[0].key).toBe("0,1,1,0,1,0,1,0");
    expect(afterRoute[0].p).toBeCloseTo(1, 8);

    const bunchA = evolved.items.find((item) => item.key === "0,2,0,0,1,0,1,0");
    const bunchB = evolved.items.find((item) => item.key === "0,0,2,0,1,0,1,0");
    const stayed = evolved.items.find((item) => item.key === "0,1,1,0,1,0,1,0");
    expect(bunchA).toBeTruthy();
    expect(bunchB).toBeTruthy();
    expect(bunchA!.p).toBeCloseTo(0.5, 8);
    expect(bunchB!.p).toBeCloseTo(0.5, 8);
    expect(Math.abs(bunchA!.re - bunchB!.re)).toBeLessThan(1e-8);
    expect(Math.abs(bunchA!.im - bunchB!.im)).toBeLessThan(1e-8);
    expect(stayed?.p ?? 0).toBeLessThan(1e-10);
    expect(evolved.pAccept).toBeLessThan(1e-10);
    expect(conditionalLogical(evolved.items)).toBeNull();
    expect(bunchA!.logical).toBeNull();
    expect(inSubspace(bunchA!.occ)).toBe(false);
    expect(logicalString([0, 2, 0, 0, 1, 0, 1, 0])).toBeNull();
  });

  it("keeps local operations inside the subspace and splits Q1 evenly", () => {
    const evolved = evolve(localQ1Settings(Math.PI / 2, Math.PI / 2));
    expect(evolved.pAccept).toBeCloseTo(1, 8);
    const zero = evolved.items.find((item) => item.logical === "0000");
    const one = evolved.items.find((item) => item.logical === "1000");
    expect(zero?.p).toBeCloseTo(0.5, 8);
    expect(one?.p).toBeCloseTo(0.5, 8);
    const conditional = conditionalLogical(evolved.items);
    expect(conditional).not.toBeNull();
    const sum = conditional!.reduce((s, row) => s + row.conditional, 0);
    expect(sum).toBeCloseTo(1, 8);
  });

  it("puts every local-all outcome on a logical basis state at 1/16", () => {
    const evolved = evolve(localAllSettings());
    expect(evolved.pAccept).toBeCloseTo(1, 8);
    expect(evolved.items).toHaveLength(16);
    for (const item of evolved.items) {
      expect(item.logical).not.toBeNull();
      expect(item.p).toBeCloseTo(1 / 16, 8);
    }
  });

  it("gives the mixing presets nonzero acceptance and leakage", () => {
    for (const settings of [partialCrossSettings(), deeperMixSettings()]) {
      const evolved = evolve(settings);
      expect(evolved.pAccept).toBeGreaterThan(0.05);
      expect(evolved.pAccept).toBeLessThan(0.95);
      const outside = evolved.items.filter((item) => item.logical === null).reduce((s, item) => s + item.p, 0);
      expect(outside).toBeGreaterThan(0.05);
      const conditional = conditionalLogical(evolved.items);
      expect(conditional).not.toBeNull();
      expect(conditional!.length).toBeGreaterThan(1);
      const sum = conditional!.reduce((s, row) => s + row.conditional, 0);
      expect(sum).toBeCloseTo(1, 8);
      for (const row of conditional!) expect(Number.isFinite(row.conditional)).toBe(true);
    }
  });
});

describe("samples and timeline", () => {
  it("draws a fixed batch for one preset and does not snap it to theory", () => {
    const evolved = evolve(deeperMixSettings());
    const a = sampleKeys(evolved.items, 64, 20261020);
    const b = sampleKeys(evolved.items, 64, 20261020);
    expect(a).toEqual(b);
    const tally = tallySamples(a);
    expect(tally.trials).toBe(64);
    expect(tally.acceptedCount + tally.outsideCount).toBe(64);
    let snapped = true;
    for (const item of evolved.items) {
      if (item.p < 0.02) continue;
      const count = tally.full.get(item.key) ?? 0;
      if (count !== Math.round(item.p * 64)) snapped = false;
    }
    expect(snapped).toBe(false);
    expect(tally.acceptedCount).toBeGreaterThan(0);
    expect(tally.outsideCount).toBeGreaterThan(0);
  });

  it("maps the 34 second timeline onto shots, frames, and the trial reveal", () => {
    expect(shotAt(0)).toBe(1);
    expect(shotAt(4.999)).toBe(1);
    expect(shotAt(5)).toBe(2);
    expect(shotAt(10)).toBe(3);
    expect(shotAt(17)).toBe(4);
    expect(shotAt(25)).toBe(5);
    expect(shotAt(34)).toBe(5);
    expect(frameAt(0)).toBe(0);
    expect(frameAt(5)).toBe(150);
    expect(frameAt(10)).toBe(300);
    expect(frameAt(17)).toBe(510);
    expect(frameAt(25)).toBe(750);
    expect(frameAt(33.999)).toBe(1019);
    expect(frameAt(34)).toBe(1019);
    expect(trialsRevealed(25)).toBe(0);
    expect(trialsRevealed(33)).toBe(64);
    expect(trialsRevealed(34)).toBe(64);
    const atStart = presentAt(0);
    const again = presentAt(0);
    expect(atStart.science.evolved.items).toEqual(again.science.evolved.items);
    expect(presentAt(30).science.id).toBe("deeper-mix");
    expect(presentAt(12).science.id).toBe("bunching");
    expect(presentAt(18).science.id).toBe("local-all");
    expect(presentAt(21).science.id).toBe("partial-cross");
  });

  it("renders all five shots without numeric failures", () => {
    for (let step = 0; step <= 340; step++) {
      const html = renderReadout(presentAt(step / 10));
      expect(html.includes("NaN")).toBe(false);
      expect(html.includes("Infinity")).toBe(false);
    }
    expect(renderReadout(presentAt(2))).toContain("There are four photons, not eight.");
    expect(renderReadout(presentAt(8))).toContain("Single-particle transfer amplitudes");
    expect(renderReadout(presentAt(15))).toContain("Two-photon interference benchmark");
    expect(renderReadout(presentAt(15))).toContain("No accepted logical events.");
    expect(renderReadout(presentAt(15))).toContain("Two additional spectator photons.");
    expect(renderReadout(presentAt(18))).toContain("Mode processing is not automatically a logical gate.");
    expect(renderReadout(presentAt(30))).toContain("Ideal number-resolving readout model.");
    expect(renderReadout(presentAt(27))).not.toContain("Possible architecture resources");
    expect(renderReadout(presentAt(31))).toContain("Possible architecture resources—not implemented in the main mesh.");
    expect(renderReadout(presentAt(0))).toContain("Representative mesh—not a fabrication layout.");
    expect(renderReadout(presentAt(0))).toContain("Eight-mode optical unitary ≠ arbitrary four-qubit logical unitary.");
  });
});
