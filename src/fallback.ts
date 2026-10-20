import type { Presentation } from "./timeline";

const MODE_Y = (mode: number) => 36 + mode * 48;

export function drawSchematic(host: HTMLElement, view: Presentation): void {
  const means = view.science.evolved.stageMeans;
  const stages = means.length;
  const x0 = 70;
  const x1 = 930;
  let guides = "";
  for (let mode = 0; mode < 8; mode++) {
    const y = MODE_Y(mode);
    const color = mode % 2 === 0 ? "#00E5FF" : "#9D4EDD";
    for (let stage = 0; stage < stages; stage++) {
      const a = x0 + ((x1 - x0) * stage) / stages;
      const b = x0 + ((x1 - x0) * (stage + 1)) / stages;
      const n = means[stage][mode] ?? 0;
      const width = 1.5 + Math.min(2, n) * 2.4;
      const opacity = 0.28 + Math.min(1, n) * 0.72;
      guides += `<line x1="${a.toFixed(1)}" y1="${y}" x2="${b.toFixed(1)}" y2="${y}" stroke="${color}" stroke-width="${width.toFixed(2)}" stroke-opacity="${opacity.toFixed(3)}" stroke-linecap="round" />`;
    }
    guides += `<text x="18" y="${y + 4}" fill="${color}" font-size="13" font-family="ui-monospace, monospace">mode ${mode}</text>`;
    guides += `<text x="948" y="${y + 4}" fill="${color}" font-size="13" font-family="ui-monospace, monospace">${mode}</text>`;
  }
  let cells = "";
  const local: [number, number][] = [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
  ];
  const cross: [number, number][] = [
    [1, 2],
    [3, 4],
    [5, 6],
  ];
  for (let column = 0; column < 8; column++) {
    const x = x0 + ((x1 - x0) * (column + 0.5)) / 9;
    const pairs = column % 2 === 0 ? local : cross;
    for (const [a, b] of pairs) {
      const y1 = MODE_Y(a);
      const y2 = MODE_Y(b);
      cells += `<path d="M ${x - 16} ${y1} C ${x} ${y1}, ${x} ${y2}, ${x + 16} ${y2}" fill="none" stroke="#8E9CAC" stroke-width="1" opacity="0.7" />`;
      cells += `<rect x="${x - 8}" y="${(y1 + y2) / 2 - 4}" width="16" height="8" rx="1" fill="#FFD166" opacity="0.85" />`;
    }
  }
  let brackets = "";
  for (let q = 0; q < 4; q++) {
    const y1 = MODE_Y(q * 2) - 10;
    const y2 = MODE_Y(q * 2 + 1) + 10;
    brackets += `<path d="M 62 ${y1} H 50 V ${y2} H 62" fill="none" stroke="#8E9CAC" />`;
    brackets += `<text x="8" y="${(y1 + y2) / 2}" fill="#E7EEF6" font-size="12" font-family="ui-monospace, monospace">Q${q + 1}</text>`;
  }
  host.innerHTML = `<svg viewBox="0 0 1000 430" role="img" aria-label="Top-down schematic of eight modes, 28 nearest-neighbor cells, terminal phases, and destructive detectors.">
    <rect width="1000" height="430" fill="#10161f" />
    <text x="70" y="22" fill="#8E9CAC" font-size="12" font-family="ui-monospace, monospace">input</text>
    <text x="690" y="22" fill="#FFD166" font-size="12" font-family="ui-monospace, monospace">destructive detectors</text>
    ${brackets}
    ${guides}
    ${cells}
    <text x="70" y="418" fill="#8E9CAC" font-size="12" font-family="ui-monospace, monospace">Representative mesh, not a fabrication layout. Glow and stroke weight show expected occupation, not a photon count.</text>
  </svg>`;
}
