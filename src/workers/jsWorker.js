// JavaScript pathfinding worker (8-connected, unit-cost, corner cutting allowed).
// Receives an ArrayBuffer (transferable) holding the grid Uint8Array.

import { MinHeap } from './minHeap.js';

// 8-connected neighbor offsets, locked in this order across JS and Rust so
// node-explored counts match. N, S, W, E, NW, NE, SW, SE.
const NDR = [-1, 1, 0, 0, -1, -1, 1, 1];
const NDC = [0, 0, -1, 1, -1, 1, -1, 1];

self.onmessage = (e) => {
  const { gridBuffer, n, start, end, algorithm } = e.data;
  const grid = new Uint8Array(gridBuffer);

  const fn =
    algorithm === 'astar' ? astar :
    algorithm === 'bfs' ? bfs :
    algorithm === 'bidijkstra' ? bidijkstra :
    algorithm === 'jps' ? jps :
    algorithm === 'theta' ? theta :
    dijkstra;
  const t0 = performance.now();
  const result = fn(grid, n, start, end);
  const t1 = performance.now();

  const waypoints = result.waypoints || new Uint32Array(0);
  self.postMessage(
    {
      timeMs: t1 - t0,
      nodesExplored: result.nodesExplored,
      pathLength: result.path.length,
      found: result.found,
      visited: result.visited,
      path: result.path,
      waypoints,
    },
    [result.visited.buffer, result.path.buffer, waypoints.buffer]
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
    for (let k = 0; k < 8; k++) {
      const nr = r + NDR[k];
      const nc = c + NDC[k];
      if (nr < 0 || nc < 0 || nr >= n || nc >= n) continue;
      const ni = nr * n + nc;
      if (grid[ni]) continue;
      if (nd < dist[ni]) { dist[ni] = nd; prev[ni] = idx; heap.push(nd, ni, ni); }
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
  for (let k = 0; k < 8; k++) {
    const nr = r + NDR[k];
    const nc = c + NDC[k];
    if (nr < 0 || nc < 0 || nr >= n || nc >= n) continue;
    const ni = nr * n + nc;
    if (grid[ni]) continue;
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
    for (let k = 0; k < 8; k++) {
      const nr = r + NDR[k];
      const nc = c + NDC[k];
      if (nr < 0 || nc < 0 || nr >= n || nc >= n) continue;
      const ni = nr * n + nc;
      if (grid[ni] || seen[ni]) continue;
      seen[ni] = 1; prev[ni] = idx; queue[tail++] = ni;
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
  // Chebyshev distance: admissible heuristic for 8-connected unit-cost grids.
  const h = (idx) => {
    const r = (idx / n) | 0;
    const c = idx - r * n;
    const dr = r > er ? r - er : er - r;
    const dc = c > ec ? c - ec : ec - c;
    return dr > dc ? dr : dc;
  };

  const heap = new MinHeap();
  gScore[start] = 0;
  // gTie packs (-g, +idx) so at equal f the larger g wins (closer to goal),
  // and at equal (f, g) the larger idx wins — matching the Rust ANode Ord.
  heap.push(h(start), start, -start);

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
    for (let k = 0; k < 8; k++) {
      const nr = r + NDR[k];
      const nc = c + NDC[k];
      if (nr < 0 || nc < 0 || nr >= n || nc >= n) continue;
      const ni = nr * n + nc;
      if (grid[ni]) continue;
      if (ng < gScore[ni]) {
        gScore[ni] = ng;
        prev[ni] = idx;
        heap.push(ng + h(ni), ni, -ng * total - ni);
      }
    }
  }

  return {
    nodesExplored: visitedCount,
    found,
    visited: visited.slice(0, visitedCount),
    path: reconstructPath(prev, end, found),
  };
}

// --- Theta* (any-angle A* with line-of-sight parent shortcuts) ---

function lineOfSight(grid, n, r0, c0, r1, c1) {
  const dr = Math.abs(r1 - r0);
  const dc = Math.abs(c1 - c0);
  const sr = r0 < r1 ? 1 : (r0 > r1 ? -1 : 0);
  const sc = c0 < c1 ? 1 : (c0 > c1 ? -1 : 0);
  let r = r0, c = c0;
  let err = dr - dc;
  while (true) {
    if (r < 0 || c < 0 || r >= n || c >= n) return false;
    if (grid[r * n + c]) return false;
    if (r === r1 && c === c1) return true;
    const e2 = 2 * err;
    if (e2 > -dc) { err -= dc; r += sr; }
    if (e2 < dr) { err += dr; c += sc; }
  }
}

function theta(grid, n, start, end) {
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
    return dr > dc ? dr : dc;
  };

  const heap = new MinHeap();
  gScore[start] = 0;
  heap.push(h(start), start, -start);

  let found = false;

  while (heap.size() > 0) {
    const { idx } = heap.pop();
    if (closed[idx]) continue;
    closed[idx] = 1;
    visited[visitedCount++] = idx;
    if (idx === end) { found = true; break; }

    const r = (idx / n) | 0;
    const c = idx - r * n;
    const p = prev[idx];
    let pr = -1, pc = -1;
    if (p >= 0) { pr = (p / n) | 0; pc = p - pr * n; }
    for (let k = 0; k < 8; k++) {
      const nr = r + NDR[k];
      const nc = c + NDC[k];
      if (nr < 0 || nc < 0 || nr >= n || nc >= n) continue;
      const ni = nr * n + nc;
      if (grid[ni]) continue;
      let ng, par;
      if (p >= 0 && lineOfSight(grid, n, pr, pc, nr, nc)) {
        const dy = Math.abs(pr - nr);
        const dx = Math.abs(pc - nc);
        const cheb = dy > dx ? dy : dx;
        ng = gScore[p] + cheb;
        par = p;
      } else {
        ng = gScore[idx] + 1;
        par = idx;
      }
      if (ng < gScore[ni]) {
        gScore[ni] = ng;
        prev[ni] = par;
        heap.push(ng + h(ni), ni, -ng * total - ni);
      }
    }
  }

  let path, waypointsArr;
  if (!found) {
    path = new Uint32Array(0);
    waypointsArr = new Uint32Array(0);
  } else {
    const waypoints = [];
    let cur = end;
    while (cur !== -1) { waypoints.push(cur); cur = prev[cur]; }
    waypoints.reverse();
    waypointsArr = new Uint32Array(waypoints);
    const tmp = [];
    for (let w = 0; w < waypoints.length; w++) {
      const ci = waypoints[w];
      if (w === 0) { tmp.push(ci); continue; }
      const pi = waypoints[w - 1];
      const r0 = (pi / n) | 0;
      const c0 = pi - r0 * n;
      const r1 = (ci / n) | 0;
      const c1 = ci - r1 * n;
      const dr = Math.abs(r1 - r0);
      const dc = Math.abs(c1 - c0);
      const sr = r0 < r1 ? 1 : (r0 > r1 ? -1 : 0);
      const sc = c0 < c1 ? 1 : (c0 > c1 ? -1 : 0);
      let rr = r0, cc = c0;
      let err = dr - dc;
      while (rr !== r1 || cc !== c1) {
        const e2 = 2 * err;
        if (e2 > -dc) { err -= dc; rr += sr; }
        if (e2 < dr) { err += dr; cc += sc; }
        tmp.push(rr * n + cc);
      }
    }
    path = new Uint32Array(tmp);
  }

  return {
    nodesExplored: visitedCount,
    found,
    visited: visited.slice(0, visitedCount),
    path,
    waypoints: waypointsArr,
  };
}

// --- JPS (8-connected, unit-cost Chebyshev, corner cutting allowed) ---

function cellOpen(grid, n, r, c) {
  if (r < 0 || c < 0 || r >= n || c >= n) return false;
  return !grid[r * n + c];
}
function cellBlocked(grid, n, r, c) { return !cellOpen(grid, n, r, c); }
function sign(x) { return x > 0 ? 1 : x < 0 ? -1 : 0; }

function jump(grid, n, r, c, dr, dc, end) {
  while (true) {
    const nr = r + dr;
    const nc = c + dc;
    if (!cellOpen(grid, n, nr, nc)) return -1;
    const nidx = nr * n + nc;
    if (nidx === end) return nidx;

    if (dr !== 0 && dc !== 0) {
      // Diagonal motion. Forced-neighbor probes.
      if ((cellBlocked(grid, n, nr - dr, nc) && cellOpen(grid, n, nr - dr, nc + dc))
          || (cellBlocked(grid, n, nr, nc - dc) && cellOpen(grid, n, nr + dr, nc - dc))) {
        return nidx;
      }
      // Probe both component orthogonals from the new cell.
      if (jump(grid, n, nr, nc, dr, 0, end) !== -1) return nidx;
      if (jump(grid, n, nr, nc, 0, dc, end) !== -1) return nidx;
    } else if (dr !== 0) {
      // Vertical orthogonal.
      if ((cellBlocked(grid, n, nr, nc + 1) && cellOpen(grid, n, nr + dr, nc + 1))
          || (cellBlocked(grid, n, nr, nc - 1) && cellOpen(grid, n, nr + dr, nc - 1))) {
        return nidx;
      }
    } else {
      // Horizontal orthogonal.
      if ((cellBlocked(grid, n, nr + 1, nc) && cellOpen(grid, n, nr + 1, nc + dc))
          || (cellBlocked(grid, n, nr - 1, nc) && cellOpen(grid, n, nr - 1, nc + dc))) {
        return nidx;
      }
    }
    r = nr; c = nc;
  }
}

function prunedDirs(grid, n, r, c, parentIdx) {
  const dirs = [];
  if (parentIdx < 0) {
    for (let k = 0; k < 8; k++) dirs.push([NDR[k], NDC[k]]);
    return dirs;
  }
  const pr = (parentIdx / n) | 0;
  const pc = parentIdx - pr * n;
  const dr = sign(r - pr);
  const dc = sign(c - pc);
  if (dr !== 0 && dc !== 0) {
    dirs.push([dr, dc]);
    dirs.push([dr, 0]);
    dirs.push([0, dc]);
    if (cellBlocked(grid, n, r, c - dc) && cellOpen(grid, n, r + dr, c - dc)) dirs.push([dr, -dc]);
    if (cellBlocked(grid, n, r - dr, c) && cellOpen(grid, n, r - dr, c + dc)) dirs.push([-dr, dc]);
  } else if (dr !== 0) {
    dirs.push([dr, 0]);
    if (cellBlocked(grid, n, r, c + 1) && cellOpen(grid, n, r + dr, c + 1)) dirs.push([dr, 1]);
    if (cellBlocked(grid, n, r, c - 1) && cellOpen(grid, n, r + dr, c - 1)) dirs.push([dr, -1]);
  } else {
    dirs.push([0, dc]);
    if (cellBlocked(grid, n, r + 1, c) && cellOpen(grid, n, r + 1, c + dc)) dirs.push([1, dc]);
    if (cellBlocked(grid, n, r - 1, c) && cellOpen(grid, n, r - 1, c + dc)) dirs.push([-1, dc]);
  }
  return dirs;
}

function jps(grid, n, start, end) {
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
    return dr > dc ? dr : dc;
  };

  const heap = new MinHeap();
  gScore[start] = 0;
  heap.push(h(start), start, -start);

  let found = false;

  while (heap.size() > 0) {
    const { idx } = heap.pop();
    if (closed[idx]) continue;
    closed[idx] = 1;
    visited[visitedCount++] = idx;
    if (idx === end) { found = true; break; }

    const r = (idx / n) | 0;
    const c = idx - r * n;
    const dirs = prunedDirs(grid, n, r, c, prev[idx]);
    const gHere = gScore[idx];
    for (const [dr, dc] of dirs) {
      const jp = jump(grid, n, r, c, dr, dc, end);
      if (jp === -1) continue;
      const jpr = (jp / n) | 0;
      const jpc = jp - jpr * n;
      const dy = Math.abs(jpr - r);
      const dx = Math.abs(jpc - c);
      const step = dy > dx ? dy : dx;
      const ng = gHere + step;
      if (ng < gScore[jp]) {
        gScore[jp] = ng;
        prev[jp] = idx;
        heap.push(ng + h(jp), jp, -ng * total - jp);
      }
    }
  }

  // Interpolate straight-line cells between jump points for the visualized path.
  let path;
  if (!found) {
    path = new Uint32Array(0);
  } else {
    const tmp = [];
    let cur = end;
    while (cur !== -1) {
      const p = prev[cur];
      if (p < 0) { tmp.push(cur); break; }
      const cr = (cur / n) | 0;
      const cc = cur - cr * n;
      const pr = (p / n) | 0;
      const pc = p - pr * n;
      const dr = sign(pr - cr);
      const dc = sign(pc - cc);
      let rr = cr, cc2 = cc;
      while (rr !== pr || cc2 !== pc) {
        tmp.push(rr * n + cc2);
        rr += dr; cc2 += dc;
      }
      cur = p;
    }
    tmp.reverse();
    path = new Uint32Array(tmp);
  }

  return {
    nodesExplored: visitedCount,
    found,
    visited: visited.slice(0, visitedCount),
    path,
  };
}
