// JavaScript pathfinding worker (Dijkstra + A*).
// Receives an ArrayBuffer (transferable) holding the grid Uint8Array.

import { MinHeap } from './minHeap.js';

self.onmessage = (e) => {
  const { gridBuffer, n, start, end, algorithm } = e.data;
  const grid = new Uint8Array(gridBuffer);

  const fn =
    algorithm === 'astar' ? astar :
    algorithm === 'bfs' ? bfs :
    algorithm === 'bidijkstra' ? bidijkstra :
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
  heap.push(0, start, start);

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
      if (!grid[ni] && nd < dist[ni]) { dist[ni] = nd; prev[ni] = idx; heap.push(nd, ni, ni); }
    }
    if (r < n - 1) {
      const ni = idx + n;
      if (!grid[ni] && nd < dist[ni]) { dist[ni] = nd; prev[ni] = idx; heap.push(nd, ni, ni); }
    }
    if (c > 0) {
      const ni = idx - 1;
      if (!grid[ni] && nd < dist[ni]) { dist[ni] = nd; prev[ni] = idx; heap.push(nd, ni, ni); }
    }
    if (c < n - 1) {
      const ni = idx + 1;
      if (!grid[ni] && nd < dist[ni]) { dist[ni] = nd; prev[ni] = idx; heap.push(nd, ni, ni); }
    }
  }

  return {
    nodesExplored: visitedCount,
    found,
    visited: visited.slice(0, visitedCount),
    path: reconstructPath(prev, end, found),
  };
}

function expandDir(grid, n, idx, cost, dist, prev, heap, otherDist, state) {
  const r = (idx / n) | 0;
  const c = idx - r * n;
  const nd = cost + 1;
  const ns = [
    r > 0 ? idx - n : -1,
    r < n - 1 ? idx + n : -1,
    c > 0 ? idx - 1 : -1,
    c < n - 1 ? idx + 1 : -1,
  ];
  for (let k = 0; k < 4; k++) {
    const ni = ns[k];
    if (ni < 0 || grid[ni]) continue;
    if (nd < dist[ni]) { dist[ni] = nd; prev[ni] = idx; heap.push(nd, ni, ni); }
    if (otherDist[ni] !== 0xffffffff) {
      const t = dist[ni] + otherDist[ni];
      if (t < state.mu) { state.mu = t; state.meet = ni; }
    }
  }
}

function bidijkstra(grid, n, start, end) {
  if (start === end) {
    const v = new Uint32Array([start]);
    return { nodesExplored: 1, found: true, visited: v, path: new Uint32Array([start]) };
  }
  const total = n * n;
  const distF = new Uint32Array(total).fill(0xffffffff);
  const distB = new Uint32Array(total).fill(0xffffffff);
  const prevF = new Int32Array(total).fill(-1);
  const prevB = new Int32Array(total).fill(-1);
  const closedF = new Uint8Array(total);
  const closedB = new Uint8Array(total);
  const visited = new Uint32Array(total * 2);
  let visitedCount = 0;

  const heapF = new MinHeap();
  const heapB = new MinHeap();
  distF[start] = 0;
  distB[end] = 0;
  heapF.push(0, start, start);
  heapB.push(0, end, end);

  const state = { mu: 0xffffffff, meet: -1 };
  let turn = 0;

  while (true) {
    if (heapF.size() === 0 && heapB.size() === 0) break;
    const topF = heapF.size() ? heapF.cost[0] : 0xffffffff;
    const topB = heapB.size() ? heapB.cost[0] : 0xffffffff;
    // Use the same saturating sum semantics as Rust to avoid 32-bit overflow.
    const sum = topF === 0xffffffff || topB === 0xffffffff
      ? 0xffffffff
      : (topF + topB) >>> 0;
    if (sum >= state.mu) break;

    const useF = heapF.size() === 0 ? false :
                 heapB.size() === 0 ? true :
                 turn === 0;
    turn ^= 1;

    if (useF) {
      const { cost, idx } = heapF.pop();
      if (closedF[idx]) continue;
      closedF[idx] = 1;
      visited[visitedCount++] = idx;
      if (distB[idx] !== 0xffffffff) {
        const t = cost + distB[idx];
        if (t < state.mu) { state.mu = t; state.meet = idx; }
      }
      expandDir(grid, n, idx, cost, distF, prevF, heapF, distB, state);
    } else {
      const { cost, idx } = heapB.pop();
      if (closedB[idx]) continue;
      closedB[idx] = 1;
      visited[visitedCount++] = idx;
      if (distF[idx] !== 0xffffffff) {
        const t = cost + distF[idx];
        if (t < state.mu) { state.mu = t; state.meet = idx; }
      }
      expandDir(grid, n, idx, cost, distB, prevB, heapB, distF, state);
    }
  }

  let path;
  if (state.meet === -1) {
    path = new Uint32Array(0);
  } else {
    const tmp = [];
    let cur = state.meet;
    while (cur !== -1) { tmp.push(cur); cur = prevF[cur]; }
    tmp.reverse();
    cur = prevB[state.meet];
    while (cur !== -1) { tmp.push(cur); cur = prevB[cur]; }
    path = new Uint32Array(tmp);
  }

  return {
    nodesExplored: visitedCount,
    found: state.meet !== -1,
    visited: visited.slice(0, visitedCount),
    path,
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
