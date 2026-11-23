// Seedable PRNG (mulberry32). Pure, no DOM.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const range = (rng, lo, hi) => lo + (hi - lo) * rng();
export const pickIndex = (rng, n) => Math.min(n - 1, Math.floor(rng() * n));
