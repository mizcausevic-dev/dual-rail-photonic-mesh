export type C = { re: number; im: number };

export const C0: C = { re: 0, im: 0 };
export const C1: C = { re: 1, im: 0 };

export function c(re: number, im = 0): C {
  return { re, im };
}

export function cadd(a: C, b: C): C {
  return { re: a.re + b.re, im: a.im + b.im };
}

export function cmul(a: C, b: C): C {
  return {
    re: a.re * b.re - a.im * b.im,
    im: a.re * b.im + a.im * b.re,
  };
}

export function cscale(a: C, s: number): C {
  return { re: a.re * s, im: a.im * s };
}

export function cconj(a: C): C {
  return { re: a.re, im: -a.im };
}

export function cabs2(a: C): number {
  return a.re * a.re + a.im * a.im;
}

export function cexp(phase: number): C {
  return { re: Math.cos(phase), im: Math.sin(phase) };
}

export function nearlyEqual(a: number, b: number, tol = 1e-9): boolean {
  return Math.abs(a - b) <= tol;
}

export function cNear(a: C, b: C, tol = 1e-8): boolean {
  return Math.abs(a.re - b.re) <= tol && Math.abs(a.im - b.im) <= tol;
}

export type Mat = C[][];

export function ident(n: number): Mat {
  const m: Mat = [];
  for (let r = 0; r < n; r++) {
    const row: C[] = [];
    for (let col = 0; col < n; col++) row.push(r === col ? { ...C1 } : { ...C0 });
    m.push(row);
  }
  return m;
}

export function matMul(a: Mat, b: Mat): Mat {
  const n = a.length;
  const out = ident(n);
  for (let r = 0; r < n; r++) {
    for (let col = 0; col < n; col++) {
      let sum = C0;
      for (let k = 0; k < n; k++) sum = cadd(sum, cmul(a[r][k], b[k][col]));
      out[r][col] = sum;
    }
  }
  return out;
}

export function dagger(a: Mat): Mat {
  const n = a.length;
  const out = ident(n);
  for (let r = 0; r < n; r++) {
    for (let col = 0; col < n; col++) out[r][col] = cconj(a[col][r]);
  }
  return out;
}

/** Largest absolute deviation of U†U from I. */
export function unitaryError(u: Mat): number {
  const g = matMul(dagger(u), u);
  let max = 0;
  for (let r = 0; r < g.length; r++) {
    for (let col = 0; col < g.length; col++) {
      const target = r === col ? 1 : 0;
      max = Math.max(max, Math.abs(g[r][col].re - target), Math.abs(g[r][col].im));
    }
  }
  return max;
}

export function permanent(a: Mat): C {
  const n = a.length;
  if (n === 0) return { ...C1 };
  if (n === 1) return a[0][0];
  const idx = Array.from({ length: n }, (_, i) => i);
  let sum = C0;
  const walk = (start: number) => {
    if (start === n) {
      let term = C1;
      for (let r = 0; r < n; r++) term = cmul(term, a[r][idx[r]]);
      sum = cadd(sum, term);
      return;
    }
    for (let i = start; i < n; i++) {
      const tmp = idx[start];
      idx[start] = idx[i];
      idx[i] = tmp;
      walk(start + 1);
      idx[i] = idx[start];
      idx[start] = tmp;
    }
  };
  walk(0);
  return sum;
}

export function fact(n: number): number {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}
