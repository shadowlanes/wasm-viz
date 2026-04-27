// Shared grid utilities. Cells: 0 = empty, 1 = wall.

// Mulberry32 — small seeded PRNG so JS and WASM can use the same grid bytes
// generated once on the main thread.
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateGrid(n, density, seed) {
  const grid = new Uint8Array(n * n);
  const rng = mulberry32(seed);
  for (let i = 0; i < grid.length; i++) {
    grid[i] = rng() < density ? 1 : 0;
  }
  // Force start (top-left) and end (bottom-right) to be empty.
  grid[0] = 0;
  grid[n * n - 1] = 0;
  return grid;
}
