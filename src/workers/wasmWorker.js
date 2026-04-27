// WASM pathfinding worker. Loads wasm-pack output and dispatches by algorithm.
import init, { dijkstra, astar } from '../wasm-pkg/wasm_vis.js';

let ready = init();

self.onmessage = async (e) => {
  await ready;
  const { gridBuffer, n, start, end, algorithm } = e.data;
  const grid = new Uint8Array(gridBuffer);

  const fn = algorithm === 'astar' ? astar : dijkstra;
  const t0 = performance.now();
  const result = fn(grid, n, start, end);
  const t1 = performance.now();

  const visited = new Uint32Array(result.visited);
  const path = new Uint32Array(result.path);
  const nodesExplored = result.nodes_explored;
  const pathLength = result.path_length;
  const found = result.found;
  result.free();

  self.postMessage(
    {
      timeMs: t1 - t0,
      nodesExplored,
      pathLength,
      found,
      visited,
      path,
    },
    [visited.buffer, path.buffer]
  );
};
