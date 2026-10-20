# Dual-rail photonic mesh

Cinematic, code-driven explainer of four dual-rail qubits on a programmable eight-mode photonic mesh. The model is ideal linear optics with synthetic number-resolving detection. It is a scientific schematic, not a fabrication layout and not a verified logical processor.

## Setup

```bash
npm install
npm test
npm run dev
npm run build
npm run preview
```

No API keys, paid assets, or third-party runtime services. Geometry, materials, and audio are procedural.

Open the dev server, then press Play. Audio starts only after that gesture. The timeline is 34.000 seconds at a 30 fps reference (frames 0–1019). Playback follows the clock, not the render frame rate.

## What is calculated

- Cell `M(θ, φ) = D(φ) C D(θ) C` with `C = (1/√2) [[1, i], [i, 1]]`.
- A 28-cell Clements-style rectangular mesh plus 8 terminal phases.
- Multiphoton amplitudes by bosonic evolution, checked against permanents.
- Designated-subspace acceptance and conditional probabilities, with an explicit zero-acceptance path.
- One seeded batch of 64 trials on a single preset.

Selected programmable mesh presets. This page does not decompose an arbitrary target unitary.

## GitHub Pages

`vite` builds with `base: "./"`. The workflow in `.github/workflows/pages.yml` publishes `dist` with GitHub Actions. Enable Pages from GitHub Actions on the repository. Build success, deployment success, and a public URL are separate facts. Do not treat a local build as a live preview.

## About

Interactive ideal-model explainer of a four-qubit dual-rail photonic mesh with multiphoton interference.

Topics: `photonics` `quantum-optics` `dual-rail` `linear-optics` `threejs` `webgl` `visualization` `vite` `multiphoton` `scientific-visualization`

## Limits

The palette is the integrated-photonics set required for rail identity (cyan, violet) and classical records (gold). A multi-theme dashboard would break those encodings, so it is not used.

`README.md` and `index.html` keep the names the toolchain requires.
