import { conditionalLogical, partitionPatterns, type FockAmp } from "./math/fock";
import { cellOf } from "./math/mesh";
import { PRESET_COPY, activeNonPass } from "./math/presets";
import { SHOT_META, type Presentation } from "./timeline";

function formatComplex(re: number, im: number): string {
  const tiny = (n: number) => Math.abs(n) < 5e-4;
  if (tiny(re) && tiny(im)) return "0";
  if (tiny(im)) return re.toFixed(3);
  if (tiny(re)) return `${im < 0 ? "-" : ""}i ${Math.abs(im).toFixed(3)}`;
  return `${re.toFixed(3)} ${im < 0 ? "-" : "+"} i ${Math.abs(im).toFixed(3)}`;
}

function formatP(p: number): string {
  if (p <= 0) return "0";
  if (p < 1e-4) return p.toExponential(1);
  return p.toFixed(4);
}

function standing(): string {
  return `<ul class="standing">
    <li>Scientific schematic with ideal linear-optical evolution and synthetic detection.</li>
    <li>Representative mesh—not a fabrication layout.</li>
    <li>Selected programmable mesh presets.</li>
    <li>Eight-mode optical unitary ≠ arbitrary four-qubit logical unitary.</li>
    <li>Ideal indistinguishable-photon model. Temporal, spectral, and polarization mismatch omitted.</li>
  </ul>`;
}

function checks(view: Presentation): string {
  const e = view.science.evolved;
  const bad = Math.abs(e.norm - 1) > 1e-6 || e.unitaryError > 1e-6 || !e.photonNumberOk;
  return `<p class="check ${bad ? "bad" : ""}">${bad ? "Model check failed. Do not trust the readouts below." : "Live model check"}: state norm ${e.norm.toFixed(6)}, max |U†U − I| ${e.unitaryError.toExponential(1)}, photon number ${e.photonNumberOk ? "4 on every retained pattern" : "not conserved"}.</p>`;
}

function programmed(view: Presentation): string {
  const cells = activeNonPass(view.science.settings);
  if (cells.length === 0) {
    return `<p>Programmed away from pass: none. All 28 cells use M(π, π) = I. Eight terminal phases are 0. A single internal phase is not the full control set. Each cell here has internal θ and external φ, and the mesh adds terminal phases.</p>`;
  }
  const list = cells
    .map((cell) => `column ${cell.column}, modes ${cell.pair[0]} and ${cell.pair[1]}`)
    .join("; ");
  return `<p>Programmed away from pass: ${list}. Every other cell is at M(π, π) = I. Terminal phases are 0. Thermo-optic phase control is the representative mechanism. No material, wavelength, heater power, loss, or switching speed is specified.</p>`;
}

function patternRows(items: FockAmp[], limit: number): string {
  const { shown, other } = partitionPatterns(items, limit);
  const max = Math.max(other, ...shown.map((item) => item.p), 1e-6);
  const rows = shown
    .map((item) => {
      const cls = item.logical ? "accepted" : "outside";
      const name = item.logical
        ? `|${item.logical}⟩<sub>L</sub>  <span class="occ">${item.key}</span>`
        : `${item.key} <span class="flag">Outside designated computational subspace</span>`;
      return bar(name, item.p / max, `${formatP(item.p)} · ${formatComplex(item.re, item.im)}`, cls);
    })
    .join("");
  const extra = other > 1e-12 ? bar("Other patterns", other / max, formatP(other), "other") : "";
  return `${rows}${extra}`;
}

function bar(name: string, fraction: number, value: string, cls: string): string {
  const width = Math.max(0, Math.min(100, fraction * 100));
  return `<div class="bar-row ${cls}"><span class="bar-name">${name}</span><span class="track" aria-hidden="true"><span class="fill" style="width:${width.toFixed(2)}%"></span></span><span class="bar-val">${value}</span></div>`;
}

function countBars(entries: [string, number][], denom: number, kind: "occ" | "logical"): string {
  const sorted = entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const shown = sorted.slice(0, 6);
  const other = sorted.slice(6).reduce((sum, row) => sum + row[1], 0);
  const max = Math.max(1, other, ...shown.map((row) => row[1]));
  const rows = shown
    .map(([key, count]) => {
      const outside = kind === "occ" ? key.split(",").map(Number) : null;
      const logical = kind === "logical";
      const name = logical
        ? `|${key}⟩<sub>L</sub>`
        : `${key}${outside && !onePerPair(outside) ? ' <span class="flag">Outside designated computational subspace</span>' : ""}`;
      return bar(name, count / max, `${count} / ${denom}`, logical ? "accepted" : onePerPair(key.split(",").map(Number)) ? "accepted" : "outside");
    })
    .join("");
  const extra = other > 0 ? bar("Other patterns", other / max, `${other} / ${denom}`, "other") : "";
  return rows + extra;
}

function onePerPair(occ: number[]): boolean {
  return occ[0] + occ[1] === 1 && occ[2] + occ[3] === 1 && occ[4] + occ[5] === 1 && occ[6] + occ[7] === 1;
}

function heat(view: Presentation): string {
  const u = view.science.evolved.transfer;
  let cols = `<span></span>`;
  for (let j = 0; j < 8; j++) cols += `<span class="axis">${j}</span>`;
  let body = "";
  for (let k = 0; k < 8; k++) {
    body += `<span class="axis">${k}</span>`;
    for (let j = 0; j < 8; j++) {
      const p = u[k][j];
      body += `<i title="input ${j} to output ${k}: ${formatP(p)}" style="--a:${Math.min(1, p).toFixed(3)}"></i>`;
    }
  }
  return `<figure class="heat-fig"><figcaption>Single-particle transfer probability |U<sub>kj</sub>|². Row k is the output mode. Column j is the input mode. This is not a multiphoton probability.</figcaption><div class="heat">${cols}${body}</div></figure>`;
}

function conditionalBlock(items: FockAmp[]): string {
  const rows = conditionalLogical(items);
  if (!rows) return `<p class="callout">No accepted logical events.</p>`;
  const max = Math.max(...rows.map((row) => row.conditional));
  const bars = rows
    .slice(0, 6)
    .map((row) => bar(`|${row.logical}⟩<sub>L</sub>`, row.conditional / max, formatP(row.conditional), "accepted"))
    .join("");
  const other = rows.slice(6).reduce((sum, row) => sum + row.conditional, 0);
  const extra = other > 1e-12 ? bar("Other patterns", other / max, formatP(other), "other") : "";
  return `<figure><figcaption>Conditional logical distribution P(pattern | accept) = P(pattern) / P(accept). This is not a deterministic success rate, and postselection on these destructive records does not establish a logical gate for arbitrary inputs.</figcaption>${bars}${extra}</figure>`;
}

function shot1(view: Presentation): string {
  return `<p>Four dual-rail qubits are encoded in eight modes, with one photon in each input pair. There are four photons, not eight. The source architecture is outside this schematic. The ideal model assumes compatible single-photon preparations. Attenuated laser pulses are not treated as guaranteed single photons.</p>
    <table>
      <caption>Encoding. Cyan is the designated logical-0 rail. Violet is the designated logical-1 rail. Those colors do not name photons, and they do not preserve qubit identity after cross-pair mixing.</caption>
      <thead><tr><th>Qubit</th><th>Modes</th><th>Logical 0</th><th>Input</th></tr></thead>
      <tbody>
        <tr><td>Q1</td><td>0 and 1</td><td>|1,0⟩</td><td>|0<sub>L</sub>⟩</td></tr>
        <tr><td>Q2</td><td>2 and 3</td><td>|1,0⟩</td><td>|0<sub>L</sub>⟩</td></tr>
        <tr><td>Q3</td><td>4 and 5</td><td>|1,0⟩</td><td>|0<sub>L</sub>⟩</td></tr>
        <tr><td>Q4</td><td>6 and 7</td><td>|1,0⟩</td><td>|0<sub>L</sub>⟩</td></tr>
      </tbody>
    </table>
    <p>Input logical state |0000⟩<sub>L</sub>. Input occupation |1,0,1,0,1,0,1,0⟩. Logical 1 on a pair would be |0,1⟩.</p>
    <p>The rectangular layout has 8 columns and 28 nearest-neighbor cells. Even columns couple (0,1), (2,3), (4,5), and (6,7). Odd columns couple (1,2), (3,4), and (5,6). Modes 0 and 7 run straight through odd columns. Every drawn coupler is in the unitary. This page does not decompose an arbitrary target unitary.</p>
    <p>Cell convention: C = (1/√2) [[1, i], [i, 1]], D(α) = diag(1, e<sup>iα</sup>), M(θ, φ) = D(φ) C D(θ) C. Matrices act on column vectors from right to left.</p>
    <p>Waveguide glow is expected occupation ⟨n⟩ after each column in the ideal model. It is not a photon count before measurement. Mathematical diagrams are calculated overlays, not images of the quantum state.</p>
    ${programmed(view)}`;
}

function shot2(view: Presentation): string {
  const phase = view.science.program ?? { theta: Math.PI, phi: Math.PI };
  const { matrix } = cellOf(view.science.settings, 0, [0, 1]);
  const m00 = matrix[0][0];
  const m10 = matrix[1][0];
  return `<p>Programming sequence, time-expanded. Each instant is the ideal output of the setting at that time. It is not a heater transient, a physical transit time, or a retune during one photon's flight.</p>
    <p>Inspected cell: column 0, modes 0 and 1. θ = ${phase.theta.toFixed(3)} rad, φ = ${phase.phi.toFixed(3)} rad. The sweep runs from the pass setting (π, π) to the balanced setting (π/2, π/2). Other rail pairs stay visible and at pass.</p>
    <figure>
      <figcaption>Single-particle transfer amplitudes for a photon entering this cell on mode 0. These are not multiphoton amplitudes.</figcaption>
      <table class="matrix">
        <thead><tr><th></th><th>in 0</th><th>in 1</th></tr></thead>
        <tbody>
          <tr><th>out 0</th><td>${formatComplex(matrix[0][0].re, matrix[0][0].im)}</td><td>${formatComplex(matrix[0][1].re, matrix[0][1].im)}</td></tr>
          <tr><th>out 1</th><td>${formatComplex(matrix[1][0].re, matrix[1][0].im)}</td><td>${formatComplex(matrix[1][1].re, matrix[1][1].im)}</td></tr>
        </tbody>
      </table>
      <p>From local input |1,0⟩: amplitude to mode 0 is ${formatComplex(m00.re, m00.im)}, probability ${formatP(m00.re * m00.re + m00.im * m00.im)}. Amplitude to mode 1 is ${formatComplex(m10.re, m10.im)}, probability ${formatP(m10.re * m10.re + m10.im * m10.im)}.</p>
    </figure>
    <figure>
      <figcaption>Multiphoton occupation probabilities for the four-photon input under this fixed setting. The other three photons stay in their rail pairs, so the joint state still factorizes. P(accept) = ${formatP(view.science.evolved.pAccept)}.</figcaption>
      ${patternRows(view.science.evolved.items, 6)}
    </figure>
    ${conditionalBlock(view.science.evolved.items)}
    <p>No Bloch spheres are drawn. A per-qubit picture will not be used once a later preset stops factorizing.</p>
    ${programmed(view)}`;
}

function shot3(view: Presentation): string {
  const early = view.t < 13.5;
  const stage = view.science.evolved.stageItems[1];
  const finalItems = view.science.evolved.items;
  const body = early
    ? `<figure><figcaption>Calculated state after the routing cell and before the modes 1 and 2 cell. Occupation |0,1,1,0,1,0,1,0⟩. The photon that entered on mode 0 is now on mode 1. This intermediate occupation is still one photon per pair. It is not the detected output. Glow on the finished chip is ⟨n⟩ for the full preset, including the later balanced cell.</figcaption>${patternRows(stage, 4)}</figure>`
    : `<figure><figcaption>Joint output state after the balanced cell. The two bunched terms are coherent alternatives, not simultaneous copies, and not a collision. Two additional spectator photons remain on modes 4 and 6.</figcaption>${patternRows(finalItems, 4)}</figure>
      <p>Coupler-level benchmark, using the declared convention: |1,1⟩ → i(|2,0⟩ + |0,2⟩)/√2. The routing cell contributes an overall factor of i, so both calculated full-state amplitudes carry that extra phase. An overall phase does not change the probabilities. This is not what every mesh setting does.</p>
      <p>Expected occupation ⟨n⟩ is about 1 on each of modes 1 and 2, because the average of 2 and 0 is 1. That glow does not reveal the joint state.</p>
      <p class="callout">No accepted logical events.</p>
      <p>P(accept) = ${formatP(view.science.evolved.pAccept)}. Both output patterns violate the one-photon-per-pair rule. Four photons in total do not guarantee one photon in each pair. This is logical-subspace leakage in a lossless model. It is not physical photon loss and not detector inefficiency.</p>`;
  return `<p class="callout">Two-photon interference benchmark. Separate demonstration preset.</p>
    <p>Two additional spectator photons.</p>
    ${body}
    ${programmed(view)}`;
}

function shot4(view: Presentation): string {
  const copy = PRESET_COPY[view.science.id];
  const pAccept = view.science.evolved.pAccept;
  return `<p class="callout">Mode processing is not automatically a logical gate.</p>
    <p>${copy.detail} Compare these as separate preparations. Counts from one preset are not mixed into another.</p>
    <p>Ideal-model acceptance probability P(accept) = ${formatP(pAccept)}. Patterns inside the designated subspace have one photon in each of pairs (0,1), (2,3), (4,5), and (6,7).</p>
    <figure><figcaption>Multiphoton occupation probabilities for this preparation. Amplitudes are listed beside probabilities. These are not sampled detector records and not single-particle intensities.</figcaption>${patternRows(view.science.evolved.items, 6)}</figure>
    ${conditionalBlock(view.science.evolved.items)}
    ${heat(view)}
    <p>Cross-pair cells are not labeled as CNOT, CZ, or other logical entangling gates. No such construction is implemented or checked here.</p>
    ${programmed(view)}`;
}

function shot5(view: Presentation): string {
  const evolved = view.science.evolved;
  const tally = view.tally;
  const denom = tally.trials;
  const fullEntries = [...tally.full.entries()];
  const acceptedEntries = [...tally.accepted.entries()];
  const batchNote =
    denom === 0
      ? `<p>No trials revealed yet. The fixed preset is already selected. Each upcoming trial is a new four-photon preparation.</p>`
      : `<p>Trials revealed: ${denom} / 64. Acceptance fraction in this batch: ${tally.acceptedCount} / ${denom}. Outside-subspace records: ${tally.outsideCount} / ${denom}. Ideal-model acceptance probability for this same preset: ${formatP(evolved.pAccept)}. The batch is a finite sample. It is not forced to match that probability.</p>`;
  const acceptedBody =
    denom === 0
      ? ""
      : tally.acceptedCount === 0
        ? `<p class="callout">No accepted events in this batch.</p>`
        : `<figure><figcaption>Accepted logical patterns in this batch. Denominator ${tally.acceptedCount} is the number of accepted records, not the number of trials. Sample conditional frequency is not deterministic success.</figcaption>${countBars(acceptedEntries, tally.acceptedCount, "logical")}</figure>`;
  const fullBody =
    denom === 0
      ? ""
      : `<figure><figcaption>Full occupation histogram for this batch only. Denominator ${denom}. Presets are not pooled.</figcaption>${countBars(fullEntries, denom, "occ")}</figure>`;
  const inset =
    view.t >= 28
      ? `<aside class="inset"><h3>Possible architecture resources—not implemented in the main mesh.</h3>
        <ul>
          <li>Ancillary photons or photonic resource states. These are not copies of unknown inputs.</li>
          <li>Measurement.</li>
          <li>Classical feed-forward. Nothing here changes an already recorded outcome.</li>
          <li>Switching and optical delays.</li>
          <li>Additional interference networks.</li>
        </ul>
        <p>This list does not establish a complete, scalable, or fault-tolerant computer. Postselection on a destructive measurement of the data photons is not a nondestructive herald for continued computation.</p></aside>`
      : "";
  return `<p>The mesh stays on one preset: ${PRESET_COPY["deeper-mix"].title}. Seed ${20261020}. Ideal number-resolving readout model. One complete eight-mode occupation is drawn per trial. In the lossless model the four occupation numbers sum to 4. Several detectors can register in one trial. A mode can hold more than one photon. The record is an occupation count, not a train of electrical pulses, and not a threshold click.</p>
    <p>Detection consumes the output state. Measured photons are not sent into a later gate. Dark counts are omitted. Optical loss and detector inefficiency are not modeled. A missing count is not shown, because loss is not simulated. Logical-subspace leakage stays separate from loss.</p>
    ${batchNote}
    ${fullBody}
    ${acceptedBody}
    <p>Latest record, when present, is also drawn in gold at the detectors. That gold label is the synthetic occupation record. It is not the waveguide glow. Glow remains ⟨n⟩ for the ideal preset.</p>
    ${conditionalBlock(evolved.items)}
    ${inset}
    ${programmed(view)}`;
}

export function readoutSignature(view: Presentation): string {
  const phase = view.science.program
    ? `${view.science.program.theta.toFixed(3)}:${view.science.program.phi.toFixed(3)}`
    : "";
  const joint = view.shot === 3 && view.t >= 13.5 ? "joint" : "early";
  const ext = view.t >= 28 ? "ext" : "noext";
  return `${view.shot}|${view.science.id}|${phase}|${view.revealed}|${joint}|${ext}`;
}

export function renderReadout(view: Presentation): string {
  const shot = SHOT_META[view.shot];
  const copy = PRESET_COPY[view.science.id];
  const body =
    view.shot === 1 ? shot1(view) : view.shot === 2 ? shot2(view) : view.shot === 3 ? shot3(view) : view.shot === 4 ? shot4(view) : shot5(view);
  return `<p class="shot">Shot ${view.shot} · ${shot.title} · ${shot.start}–${shot.end === 34 ? "34" : shot.end} s · frames ${shot.frames}</p>
    <h2>${copy.title}</h2>
    ${body}
    ${checks(view)}
    ${standing()}
    <p class="fine">Propagation, programming, and the trial batch are time-expanded for explanation. They are not physical transit times or heater-response rates. The calculation does not validate fabrication geometry, thermal cross-talk, optical loss, detector performance, logical-gate fidelity, or scalability.</p>`;
}

export function liveText(view: Presentation): string {
  const shot = SHOT_META[view.shot];
  return `Shot ${view.shot}, ${shot.title}. ${PRESET_COPY[view.science.id].title}.`;
}
