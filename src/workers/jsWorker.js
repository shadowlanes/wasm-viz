// JavaScript pathfinding worker (Dijkstra + A*).
// Receives an ArrayBuffer (transferable) holding the grid Uint8Array.

import { MinHeap } from './minHeap.js';

self.onmessage = (e) => {
  const { gridBuffer, n, start, end, algorithm } = e.data;
  const grid = new Uint8Array(gridBuffer);

  const fn =
    algorithm === 'astar' ? astar :
    algorithm === 'bfs' ? bfs :
    dijkstra;
  const t0 = performance.now();
  const result = fn(grid, n, start, end);
  const t1 = performance.now();

  self.postMessage(
    {
      timeMs: t1 - t0,
      nodesExplored: result.nodesExplored,
      pathLength: result.path.length,
      found: result.found,
      visited: result.visited,
      path: result.path,
    },
    [result.visited.buffer, result.path.buffer]
  );
};

function reconstructPath(prev, end, found) {
  if (!found) return new Uint32Array(0);
  const tmp = [];
  let cur = end;
  while (cur !== -1) { tmp.push(cur); cur = prev[cur]; }
  tmp.reverse();
  return new Uint32Array(tmp);
}

function dijkstra(grid, n, start, end) {
  const total = n * n;
  const dist = new Uint32Array(total).fill(0xffffffff);
  const prev = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);
  const visited = new Uint32Array(total);
  let visitedCount = 0;

  const heap = new MinHeap();
  dist[start] = 0;
  heap.push(0, start);

  let found = false;

  while (heap.size() > 0) {
    const { cost, idx } = heap.pop();
    if (closed[idx]) continue;
    closed[idx] = 1;
    visited[visitedCount++] = idx;

    if (idx === end) { found = true; break; }
    if (cost > dist[idx]) continue;

    const r = (idx / n) | 0;
    const c = idx - r * n;
    const nd = cost + 1;

    if (r > 0) {
      const ni = idx - n;
      if (!grid[ni] && nd < dist[ni]) { dist[ni] = nd; prev[ni] = idx; heap.push(nd, ni); }
    }
    if (r < n - 1) {
      const ni = idx + n;
      if (!grid[ni] && nd < dist[ni]) { dist[ni] = nd; prev[ni] = idx; heap.push(nd, ni); }
    }
    if (c > 0) {
      const ni = idx - 1;
      if (!grid[ni] && nd < dist[ni]) { dist[ni] = nd; prev[ni] = idx; heap.push(nd, ni); }
    }
    if (c < n - 1) {
      const ni = idx + 1;
      if (!grid[ni] && nd < dist[ni]) { dist[ni] = nd; prev[ni] = idx; heap.push(nd, ni); }
    }
  }

  return {
    nodesExplored: visitedCount,
    found,
    visited: visited.slice(0, visitedCount),
    path: reconstructPath(prev, end, found),
  };
}

function bfs(grid, n, start, end) {
  const total = n * n;
  const prev = new Int32Array(total).fill(-1);
  const seen = new Uint8Array(total);
  const visited = new Uint32Array(total);
  let visitedCount = 0;

  // Ring-buffer queue sized to total (BFS visits each cell at most once).
  const queue = new Uint32Array(total);
  let head = 0, tail = 0;
  queue[tail++] = start;
  seen[start] = 1;

  let found = false;

  while (head < tail) {
    const idx = queue[head++];
    visited[visitedCount++] = idx;
    if (idx === end) { found = true; break; }

    const r = (idx / n) | 0;
    const c = idx - r * n;

    if (r > 0) {
      const ni = idx - n;
      if (!grid[ni] && !seen[ni]) { seen[ni] = 1; prev[ni] = idx; queue[tail++] = ni; }
    }
    if (r < n - 1) {
      const ni = idx + n;
      if (!grid[ni] && !seen[ni]) { seen[ni] = 1; prev[ni] = idx; queue[tail++] = ni; }
    }
    if (c > 0) {
      const ni = idx - 1;
      if (!grid[ni] && !seen[ni]) { seen[ni] = 1; prev[ni] = idx; queue[tail++] = ni; }
    }
    if (c < n - 1) {
      const ni = idx + 1;
      if (!grid[ni] && !seen[ni]) { seen[ni] = 1; prev[ni] = idx; queue[tail++] = ni; }
    }
  }

  return {
    nodesExplored: visitedCount,
    found,
    visited: visited.slice(0, visitedCount),
    path: reconstructPath(prev, end, found),
  };
}

function astar(grid, n, start, end) {
  const total = n * n;
  const gScore = new Uint32Array(total).fill(0xffffffff);
  const prev = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);
  const visited = new Uint32Array(total);
  let visitedCount = 0;

  const er = (end / n) | 0;
  const ec = end - er * n;
  const h = (idx) => {
    const r = (idx / n) | 0;
    const c = idx - r * n;
    const dr = r > er ? r - er : er - r;
    const dc = c > ec ? c - ec : ec - c;
    return dr + dc;
  };

  const heap = new MinHeap();
  gScore[start] = 0;
  heap.push(h(start), start, 0); // gTie = -g; start has g=0

  let found = false;

  while (heap.size() > 0) {
    const { idx } = heap.pop();
    if (closed[idx]) continue;
    closed[idx] = 1;
    visited[visitedCount++] = idx;

    if (idx === end) { found = true; break; }

    const r = (idx / n) | 0;
    const c = idx - r * n;
    const ng = gScore[idx] + 1;

    const tryNeighbor = (ni) => {
      if (grid[ni]) return;
      if (ng < gScore[ni]) {
        gScore[ni] = ng;
        prev[ni] = idx;
        heap.push(ng + h(ni), ni, -ng | 0);
      }
    };

    if (r > 0) tryNeighbor(idx - n);
    if (r < n - 1) tryNeighbor(idx + n);
    if (c > 0) tryNeighbor(idx - 1);
    if (c < n - 1) tryNeighbor(idx + 1);
  }

  return {
    nodesExplored: visitedCount,
    found,
    visited: visited.slice(0, visitedCount),
    path: reconstructPath(prev, end, found),
  };
}
