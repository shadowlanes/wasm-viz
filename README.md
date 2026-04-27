# wasm-viz

A side-by-side, browser-based benchmark of **JavaScript vs WebAssembly** running the same pathfinding algorithms on the same grid. Built to highlight where WASM's advantage actually shows up — and where it doesn't.

Both implementations run in their own Web Workers, on identical seeded grid bytes, with identical neighbor order and heap discipline, so the comparison is honest.

## Features

- **Two algorithms**: Dijkstra and A\* (Manhattan heuristic)
- **Two backends**: hand-written JS and Rust compiled to WASM via `wasm-pack`
- **Parallel execution**: each side runs in its own Web Worker; main thread only renders
- **Fair by construction**: same `mulberry32` seed, same `Uint8Array` grid bytes, same 4-neighbor order, same lazy-deletion heap
- **Configurable**: grid size (50–2000), wall density (0–40%), algorithm choice
- **Honest visualization**: the algorithm runs to completion in the worker; the canvas replays the visited frontier scaled proportionally to the measured time (see Methodology below)

## Quick start

You need Node.js, Rust, and `wasm-pack`.

```bash
# install rust + wasm-pack if you don't have them
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown
cargo install wasm-pack

# build and run
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173/`).

## Methodology

The reported `Time` is measured inside each worker, around the algorithm only:

```js
const t0 = performance.now();
const result = fn(grid, n, start, end);
const t1 = performance.now();
```

It excludes:
- Worker startup / WASM module instantiation
- `postMessage` transfer of the result back to the main thread
- All rendering

**The animation is a slowed-down replay, not a live feed.** The worker runs the full search first, returns the complete `visited` array, and the main thread paces that array onto the canvas over `timeMs * 50` ms (clamped to 150–5000 ms). Both panes use the same scale, so the relative on-screen duration tracks the underlying algorithm time ratio. Click **Methodology** in the UI for the full explanation.

The node count under each canvas is the fairness check — for the same seed and algorithm, JS and WASM should explore exactly the same number of nodes in the same order. If they don't, the comparison is broken.

## Sample results (M-class Mac, dev build)

| Grid | Algorithm | Density | JS | WASM | Speedup |
|---|---|---|---|---|---|
| 200×200 | Dijkstra | 25% | 13.2 ms | 4.6 ms | 2.9× |
| 200×200 | A\* | 25% | 9.6 ms | 1.7 ms | 5.6× |
| 500×500 | Dijkstra | 25% | 49.8 ms | 23.6 ms | 2.1× |

WASM's relative advantage tends to grow on tighter inner loops (A\* with a heuristic) and shrink as data-transfer / setup overhead becomes a larger fraction of total time.

## Project layout

```
.
├── index.html              # UI shell
├── src/
│   ├── main.js             # Controls, worker orchestration, canvas dispatch
│   ├── grid.js             # Seeded mulberry32 grid generation (shared by both sides)
│   ├── render.js           # ImageData-based canvas renderer
│   ├── style.css
│   └── workers/
│       ├── jsWorker.js     # JS Dijkstra + A*
│       ├── wasmWorker.js   # Loads wasm-pack output, dispatches on algorithm
│       └── minHeap.js      # Lex-ordered (cost, gTie) binary heap
└── wasm/
    ├── Cargo.toml
    └── src/lib.rs          # Rust Dijkstra + A* exposed via wasm-bindgen
```

## What this project is *not*

- Not a "WASM is always faster" demo. At small sizes the difference vanishes; for some workloads the postMessage / instantiation overhead dominates.
- Not optimized to the limit on either side. The point is two implementations doing structurally the same thing, not a SIMD-vs-naive comparison.

## License

MIT
