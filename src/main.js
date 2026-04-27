import { generateGrid } from './grid.js';
import { GridRenderer } from './render.js';

const $ = (id) => document.getElementById(id);

const els = {
  size: $('gridSize'),
  algo: $('algo'),
  density: $('density'),
  densityVal: $('densityVal'),
  start: $('startBtn'),
  reset: $('resetBtn'),
  jsCanvas: $('jsCanvas'),
  wasmCanvas: $('wasmCanvas'),
  jsStats: $('jsStats'),
  wasmStats: $('wasmStats'),
  summary: $('summary'),
};

let jsWorker = null;
let wasmWorker = null;
let jsRenderer = null;
let wasmRenderer = null;

els.density.addEventListener('input', () => {
  els.densityVal.textContent = `${els.density.value}%`;
});

const methodologyDialog = document.getElementById('methodologyDialog');
document.getElementById('methodologyLink').addEventListener('click', (e) => {
  e.preventDefault();
  methodologyDialog.showModal();
});
document.getElementById('methodologyCloseBtn').addEventListener('click', () => {
  methodologyDialog.close();
});

els.reset.addEventListener('click', reset);
els.start.addEventListener('click', start);

function killWorkers() {
  if (jsWorker) { jsWorker.terminate(); jsWorker = null; }
  if (wasmWorker) { wasmWorker.terminate(); wasmWorker = null; }
}

function reset() {
  killWorkers();
  if (jsRenderer) jsRenderer.clear();
  if (wasmRenderer) wasmRenderer.clear();
  els.jsStats.textContent = 'Idle';
  els.wasmStats.textContent = 'Idle';
  els.summary.textContent = 'Reset. Press Start to run again.';
  els.start.disabled = false;
}

async function start() {
  killWorkers();
  els.start.disabled = true;

  const n = Math.max(50, Math.min(2000, parseInt(els.size.value, 10) || 500));
  const density = parseInt(els.density.value, 10) / 100;
  const seed = (Math.random() * 0xffffffff) >>> 0;
  const algorithm = els.algo.value;
  const algoLabel = algorithm === 'astar' ? 'A*' : algorithm === 'bfs' ? 'BFS' : 'Dijkstra';

  const grid = generateGrid(n, density, seed);
  const start = 0;
  const end = n * n - 1;

  jsRenderer = new GridRenderer(els.jsCanvas, n);
  wasmRenderer = new GridRenderer(els.wasmCanvas, n);
  jsRenderer.drawBaseGrid(grid);
  wasmRenderer.drawBaseGrid(grid);

  els.jsStats.textContent = 'Running…';
  els.wasmStats.textContent = 'Running…';
  els.summary.textContent = `Grid ${n}×${n}, ${algoLabel}, density ${els.density.value}%, seed ${seed}`;

  jsWorker = new Worker(new URL('./workers/jsWorker.js', import.meta.url), { type: 'module' });
  wasmWorker = new Worker(new URL('./workers/wasmWorker.js', import.meta.url), { type: 'module' });

  // Each worker needs its own copy of the grid since transferring detaches the buffer.
  const jsGridBuf = grid.slice().buffer;
  const wasmGridBuf = grid.slice().buffer;

  const jsPromise = runWorker(jsWorker, jsGridBuf, n, start, end, algorithm);
  const wasmPromise = runWorker(wasmWorker, wasmGridBuf, n, start, end, algorithm);

  // Display results as each completes.
  jsPromise.then((r) => finishOne('JS', r, jsRenderer, els.jsStats, start, end));
  wasmPromise.then((r) => finishOne('WASM', r, wasmRenderer, els.wasmStats, start, end));

  const [jsR, wasmR] = await Promise.all([jsPromise, wasmPromise]);

  const speed = jsR.timeMs / wasmR.timeMs;
  els.summary.textContent =
    `Grid ${n}×${n}, ${algoLabel}, density ${els.density.value}%  |  ` +
    `JS ${jsR.timeMs.toFixed(2)}ms vs WASM ${wasmR.timeMs.toFixed(2)}ms  |  ` +
    `WASM is ${speed.toFixed(2)}× ${speed >= 1 ? 'faster' : 'slower'}`;
  els.start.disabled = false;
}

function runWorker(worker, gridBuffer, n, start, end, algorithm) {
  return new Promise((resolve, reject) => {
    worker.onmessage = (e) => resolve(e.data);
    worker.onerror = (e) => reject(e);
    worker.postMessage({ gridBuffer, n, start, end, algorithm }, [gridBuffer]);
  });
}

// Scale algorithm time into a visible animation duration. Both sides use the
// same scale, so relative speed shows up faithfully on screen.
const RENDER_SCALE = 50;
const RENDER_MIN_MS = 150;
const RENDER_MAX_MS = 5000;

async function finishOne(label, r, renderer, statEl, start, end) {
  statEl.textContent = r.found
    ? `Time: ${r.timeMs.toFixed(2)}ms | Nodes: ${r.nodesExplored} | Path: ${r.pathLength}`
    : `Time: ${r.timeMs.toFixed(2)}ms | Nodes: ${r.nodesExplored} | No path`;
  const renderMs = Math.max(RENDER_MIN_MS, Math.min(RENDER_MAX_MS, r.timeMs * RENDER_SCALE));
  await renderer.animate(r.visited, r.path, start, end, renderMs);
}
