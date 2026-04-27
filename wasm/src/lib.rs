use std::collections::{BinaryHeap, VecDeque};
use std::cmp::Ordering;
use wasm_bindgen::prelude::*;

const WALL: u8 = 1;

// 8-connected neighbor offsets (row, col). Order is locked across JS and Rust
// so node-explored counts match. N, S, W, E, NW, NE, SW, SE.
const NEIGHBORS: [(i32, i32); 8] = [
    (-1, 0), (1, 0), (0, -1), (0, 1),
    (-1, -1), (-1, 1), (1, -1), (1, 1),
];

// Dijkstra heap entry — ordered by cost ascending.
#[derive(Copy, Clone, PartialEq, Eq)]
struct Node {
    cost: u32,
    idx: u32,
}

impl Ord for Node {
    fn cmp(&self, other: &Self) -> Ordering {
        // Min-heap on cost; at equal cost, smaller idx pops first.
        // (BinaryHeap is max-heap, so self > other when self.cost < other.cost
        // OR (equal cost AND self.idx < other.idx).)
        other.cost.cmp(&self.cost).then_with(|| other.idx.cmp(&self.idx))
    }
}
impl PartialOrd for Node {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> { Some(self.cmp(other)) }
}

// A* heap entry — ordered by f ascending, then by g descending (prefer closer to goal).
#[derive(Copy, Clone, PartialEq, Eq)]
struct ANode {
    f: u32,
    g: u32,
    idx: u32,
}

impl Ord for ANode {
    fn cmp(&self, other: &Self) -> Ordering {
        // BinaryHeap is max-heap; invert for min behavior on f, then prefer larger g.
        other.f.cmp(&self.f)
            .then_with(|| self.g.cmp(&other.g))
            .then_with(|| self.idx.cmp(&other.idx))
    }
}
impl PartialOrd for ANode {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> { Some(self.cmp(other)) }
}

#[wasm_bindgen]
pub struct SearchResult {
    pub nodes_explored: u32,
    pub path_length: u32,
    pub found: bool,
    visited: Vec<u32>,
    path: Vec<u32>,
}

#[wasm_bindgen]
impl SearchResult {
    #[wasm_bindgen(getter)]
    pub fn visited(&self) -> Vec<u32> { self.visited.clone() }
    #[wasm_bindgen(getter)]
    pub fn path(&self) -> Vec<u32> { self.path.clone() }
}

fn reconstruct(prev: &[i32], end: usize, found: bool) -> Vec<u32> {
    if !found { return Vec::new(); }
    let mut path = Vec::new();
    let mut cur = end as i32;
    while cur != -1 {
        path.push(cur as u32);
        cur = prev[cur as usize];
    }
    path.reverse();
    path
}

#[wasm_bindgen]
pub fn dijkstra(grid: &[u8], n: u32, start: u32, end: u32) -> SearchResult {
    let n = n as usize;
    let total = n * n;
    let start = start as usize;
    let end = end as usize;

    let mut dist: Vec<u32> = vec![u32::MAX; total];
    let mut prev: Vec<i32> = vec![-1; total];
    let mut visited_order: Vec<u32> = Vec::with_capacity(total / 2);
    let mut closed: Vec<bool> = vec![false; total];

    let mut heap: BinaryHeap<Node> = BinaryHeap::new();
    dist[start] = 0;
    heap.push(Node { cost: 0, idx: start as u32 });

    let mut found = false;

    while let Some(Node { cost, idx }) = heap.pop() {
        let i = idx as usize;
        if closed[i] { continue; }
        closed[i] = true;
        visited_order.push(idx);

        if i == end { found = true; break; }
        if cost > dist[i] { continue; }

        let r = (i / n) as i32;
        let c = (i % n) as i32;
        let nd = cost + 1;
        for (dr, dc) in NEIGHBORS {
            let nr = r + dr;
            let nc = c + dc;
            if nr < 0 || nc < 0 || nr >= n as i32 || nc >= n as i32 { continue; }
            let ni = nr as usize * n + nc as usize;
            if grid[ni] == WALL { continue; }
            if nd < dist[ni] {
                dist[ni] = nd; prev[ni] = i as i32;
                heap.push(Node { cost: nd, idx: ni as u32 });
            }
        }
    }

    let path = reconstruct(&prev, end, found);
    SearchResult {
        nodes_explored: visited_order.len() as u32,
        path_length: path.len() as u32,
        found,
        visited: visited_order,
        path,
    }
}

// Expand one Dijkstra step in a given direction, updating mu/meet if a meeting
// point is detected. Used by bidirectional Dijkstra for both forward and
// backward passes.
fn expand_dir(
    grid: &[u8], n: usize,
    i: usize, cost: u32,
    dist: &mut [u32], prev: &mut [i32],
    heap: &mut BinaryHeap<Node>,
    other_dist: &[u32],
    mu: &mut u32, meet: &mut i32,
) {
    let r = (i / n) as i32;
    let c = (i % n) as i32;
    let nd = cost + 1;
    for (dr, dc) in NEIGHBORS {
        let nr = r + dr;
        let nc = c + dc;
        if nr < 0 || nc < 0 || nr >= n as i32 || nc >= n as i32 { continue; }
        let ni = nr as usize * n + nc as usize;
        if grid[ni] == WALL { continue; }
        if nd < dist[ni] {
            dist[ni] = nd;
            prev[ni] = i as i32;
            heap.push(Node { cost: nd, idx: ni as u32 });
        }
        if other_dist[ni] != u32::MAX {
            let t = dist[ni].saturating_add(other_dist[ni]);
            if t < *mu { *mu = t; *meet = ni as i32; }
        }
    }
}

#[wasm_bindgen]
pub fn bidijkstra(grid: &[u8], n: u32, start: u32, end: u32) -> SearchResult {
    let n = n as usize;
    let total = n * n;
    let start = start as usize;
    let end = end as usize;

    if start == end {
        return SearchResult {
            nodes_explored: 1,
            path_length: 1,
            found: true,
            visited: vec![start as u32],
            path: vec![start as u32],
        };
    }

    let mut dist_f: Vec<u32> = vec![u32::MAX; total];
    let mut dist_b: Vec<u32> = vec![u32::MAX; total];
    let mut prev_f: Vec<i32> = vec![-1; total];
    let mut prev_b: Vec<i32> = vec![-1; total];
    let mut closed_f: Vec<bool> = vec![false; total];
    let mut closed_b: Vec<bool> = vec![false; total];
    let mut visited_order: Vec<u32> = Vec::with_capacity(total);

    let mut heap_f: BinaryHeap<Node> = BinaryHeap::new();
    let mut heap_b: BinaryHeap<Node> = BinaryHeap::new();
    dist_f[start] = 0;
    dist_b[end] = 0;
    heap_f.push(Node { cost: 0, idx: start as u32 });
    heap_b.push(Node { cost: 0, idx: end as u32 });

    let mut mu: u32 = u32::MAX;
    let mut meet: i32 = -1;
    let mut turn: u8 = 0;

    loop {
        if heap_f.is_empty() && heap_b.is_empty() { break; }
        let top_f = heap_f.peek().map(|n| n.cost).unwrap_or(u32::MAX);
        let top_b = heap_b.peek().map(|n| n.cost).unwrap_or(u32::MAX);
        if top_f.saturating_add(top_b) >= mu { break; }

        let do_forward = if heap_f.is_empty() { false }
            else if heap_b.is_empty() { true }
            else { turn == 0 };
        turn ^= 1;

        if do_forward {
            let Node { cost, idx } = heap_f.pop().unwrap();
            let i = idx as usize;
            if closed_f[i] { continue; }
            closed_f[i] = true;
            visited_order.push(idx);
            if dist_b[i] != u32::MAX {
                let t = cost.saturating_add(dist_b[i]);
                if t < mu { mu = t; meet = i as i32; }
            }
            expand_dir(grid, n, i, cost, &mut dist_f, &mut prev_f, &mut heap_f, &dist_b, &mut mu, &mut meet);
        } else {
            let Node { cost, idx } = heap_b.pop().unwrap();
            let i = idx as usize;
            if closed_b[i] { continue; }
            closed_b[i] = true;
            visited_order.push(idx);
            if dist_f[i] != u32::MAX {
                let t = cost.saturating_add(dist_f[i]);
                if t < mu { mu = t; meet = i as i32; }
            }
            expand_dir(grid, n, i, cost, &mut dist_b, &mut prev_b, &mut heap_b, &dist_f, &mut mu, &mut meet);
        }
    }

    let path = if meet == -1 {
        Vec::new()
    } else {
        let mut combined: Vec<u32> = Vec::new();
        let mut cur = meet;
        while cur != -1 { combined.push(cur as u32); cur = prev_f[cur as usize]; }
        combined.reverse();
        let mut cur = prev_b[meet as usize];
        while cur != -1 { combined.push(cur as u32); cur = prev_b[cur as usize]; }
        combined
    };

    SearchResult {
        nodes_explored: visited_order.len() as u32,
        path_length: path.len() as u32,
        found: meet != -1,
        visited: visited_order,
        path,
    }
}

#[wasm_bindgen]
pub fn bfs(grid: &[u8], n: u32, start: u32, end: u32) -> SearchResult {
    let n = n as usize;
    let total = n * n;
    let start = start as usize;
    let end = end as usize;

    let mut prev: Vec<i32> = vec![-1; total];
    let mut visited_order: Vec<u32> = Vec::with_capacity(total / 2);
    let mut seen: Vec<bool> = vec![false; total];

    let mut queue: VecDeque<usize> = VecDeque::new();
    queue.push_back(start);
    seen[start] = true;

    let mut found = false;

    while let Some(i) = queue.pop_front() {
        visited_order.push(i as u32);
        if i == end { found = true; break; }

        let r = (i / n) as i32;
        let c = (i % n) as i32;
        for (dr, dc) in NEIGHBORS {
            let nr = r + dr;
            let nc = c + dc;
            if nr < 0 || nc < 0 || nr >= n as i32 || nc >= n as i32 { continue; }
            let ni = nr as usize * n + nc as usize;
            if grid[ni] == WALL || seen[ni] { continue; }
            seen[ni] = true;
            prev[ni] = i as i32;
            queue.push_back(ni);
        }
    }

    let path = reconstruct(&prev, end, found);
    SearchResult {
        nodes_explored: visited_order.len() as u32,
        path_length: path.len() as u32,
        found,
        visited: visited_order,
        path,
    }
}

// --- Theta* (any-angle A* with line-of-sight parent shortcuts) ---
//
// Same expansion as A* but when relaxing neighbor s of current x, attempt to
// re-parent s to prev[x] directly if line-of-sight from prev[x] to s is clear.
// Path reconstructs as a sequence of waypoints connected by Bresenham lines —
// visually smoother than the staircase paths A* produces.

fn line_of_sight(grid: &[u8], n: usize, r0: i32, c0: i32, r1: i32, c1: i32) -> bool {
    let dr = (r1 - r0).abs();
    let dc = (c1 - c0).abs();
    let sr = if r0 < r1 { 1 } else if r0 > r1 { -1 } else { 0 };
    let sc = if c0 < c1 { 1 } else if c0 > c1 { -1 } else { 0 };
    let mut r = r0;
    let mut c = c0;
    let mut err = dr - dc;
    loop {
        if r < 0 || c < 0 || r >= n as i32 || c >= n as i32 { return false; }
        if grid[r as usize * n + c as usize] == WALL { return false; }
        if r == r1 && c == c1 { return true; }
        let e2 = 2 * err;
        if e2 > -dc { err -= dc; r += sr; }
        if e2 < dr { err += dr; c += sc; }
    }
}

#[wasm_bindgen]
pub fn theta(grid: &[u8], n: u32, start: u32, end: u32) -> SearchResult {
    let n = n as usize;
    let total = n * n;
    let start = start as usize;
    let end = end as usize;
    let er = (end / n) as i32;
    let ec = (end % n) as i32;

    let mut g_score: Vec<u32> = vec![u32::MAX; total];
    let mut prev: Vec<i32> = vec![-1; total];
    let mut visited_order: Vec<u32> = Vec::with_capacity(total / 2);
    let mut closed: Vec<bool> = vec![false; total];

    let mut heap: BinaryHeap<ANode> = BinaryHeap::new();
    g_score[start] = 0;
    heap.push(ANode { f: chebyshev(start, n, er as usize, ec as usize), g: 0, idx: start as u32 });

    let mut found = false;

    while let Some(ANode { f: _, g: _, idx }) = heap.pop() {
        let i = idx as usize;
        if closed[i] { continue; }
        closed[i] = true;
        visited_order.push(idx);
        if i == end { found = true; break; }

        let r = (i / n) as i32;
        let c = (i % n) as i32;
        let p = prev[i];
        for (dr, dc) in NEIGHBORS {
            let nr = r + dr;
            let nc = c + dc;
            if nr < 0 || nc < 0 || nr >= n as i32 || nc >= n as i32 { continue; }
            let ni = nr as usize * n + nc as usize;
            if grid[ni] == WALL { continue; }
            // Path 2: try re-parenting to prev[i] if LoS clear.
            let (ng, par): (u32, i32) = if p >= 0 {
                let pr = (p as usize / n) as i32;
                let pc = (p as usize % n) as i32;
                if line_of_sight(grid, n, pr, pc, nr, nc) {
                    let dy = (pr - nr).abs();
                    let dx = (pc - nc).abs();
                    let cheb = if dy > dx { dy as u32 } else { dx as u32 };
                    (g_score[p as usize] + cheb, p)
                } else {
                    (g_score[i] + 1, i as i32)
                }
            } else {
                (g_score[i] + 1, i as i32)
            };
            if ng < g_score[ni] {
                g_score[ni] = ng;
                prev[ni] = par;
                let h = chebyshev(ni, n, er as usize, ec as usize);
                heap.push(ANode { f: ng + h, g: ng, idx: ni as u32 });
            }
        }
    }

    // Path reconstruction: collect waypoints from start to end, then walk
    // Bresenham between consecutive waypoints to produce dense cell list.
    let path = if !found {
        Vec::new()
    } else {
        let mut waypoints: Vec<i32> = Vec::new();
        let mut cur = end as i32;
        while cur != -1 {
            waypoints.push(cur);
            cur = prev[cur as usize];
        }
        waypoints.reverse();
        let mut tmp: Vec<u32> = Vec::new();
        for w in 0..waypoints.len() {
            let cur_idx = waypoints[w] as usize;
            if w == 0 {
                tmp.push(cur_idx as u32);
                continue;
            }
            let prev_wp = waypoints[w - 1] as usize;
            let r0 = (prev_wp / n) as i32;
            let c0 = (prev_wp % n) as i32;
            let r1 = (cur_idx / n) as i32;
            let c1 = (cur_idx % n) as i32;
            let dr = (r1 - r0).abs();
            let dc = (c1 - c0).abs();
            let sr = if r0 < r1 { 1 } else if r0 > r1 { -1 } else { 0 };
            let sc = if c0 < c1 { 1 } else if c0 > c1 { -1 } else { 0 };
            let mut r = r0; let mut c = c0;
            let mut err = dr - dc;
            while r != r1 || c != c1 {
                let e2 = 2 * err;
                if e2 > -dc { err -= dc; r += sr; }
                if e2 < dr { err += dr; c += sc; }
                tmp.push((r as usize * n + c as usize) as u32);
            }
        }
        tmp
    };

    SearchResult {
        nodes_explored: visited_order.len() as u32,
        path_length: path.len() as u32,
        found,
        visited: visited_order,
        path,
    }
}

// --- Jump Point Search (8-connected, unit-cost Chebyshev, corner cutting allowed) ---

#[inline]
fn cell_open(grid: &[u8], n: usize, r: i32, c: i32) -> bool {
    if r < 0 || c < 0 || r >= n as i32 || c >= n as i32 { return false; }
    grid[r as usize * n + c as usize] != WALL
}
#[inline]
fn cell_blocked(grid: &[u8], n: usize, r: i32, c: i32) -> bool {
    !cell_open(grid, n, r, c)
}

// Jump from (r,c) in direction (dr,dc) (one of 8 unit directions). Returns
// Some(idx) of the jump point or None.
fn jump(grid: &[u8], n: usize, mut r: i32, mut c: i32, dr: i32, dc: i32, end: usize) -> Option<usize> {
    loop {
        let nr = r + dr;
        let nc = c + dc;
        if !cell_open(grid, n, nr, nc) { return None; }
        let nidx = nr as usize * n + nc as usize;
        if nidx == end { return Some(nidx); }

        if dr != 0 && dc != 0 {
            // Diagonal. Forced if the cell "behind" perpendicular is blocked
            // but the cell perpendicular at nr,nc is open.
            // Standard 8-connected JPS forced rules for diagonal d=(dr,dc):
            //   forced 1: blocked(nr - dr, nc) and open(nr - dr, nc + dc)
            //   forced 2: blocked(nr, nc - dc) and open(nr + dr, nc - dc)
            if (cell_blocked(grid, n, nr - dr, nc) && cell_open(grid, n, nr - dr, nc + dc))
               || (cell_blocked(grid, n, nr, nc - dc) && cell_open(grid, n, nr + dr, nc - dc))
            {
                return Some(nidx);
            }
            // From a diagonal step, also probe both component orthogonals.
            if jump(grid, n, nr, nc, dr, 0, end).is_some() { return Some(nidx); }
            if jump(grid, n, nr, nc, 0, dc, end).is_some() { return Some(nidx); }
        } else if dr != 0 {
            // Vertical orthogonal motion.
            if (cell_blocked(grid, n, nr, nc + 1) && cell_open(grid, n, nr + dr, nc + 1))
               || (cell_blocked(grid, n, nr, nc - 1) && cell_open(grid, n, nr + dr, nc - 1))
            {
                return Some(nidx);
            }
        } else {
            // Horizontal orthogonal motion.
            if (cell_blocked(grid, n, nr + 1, nc) && cell_open(grid, n, nr + 1, nc + dc))
               || (cell_blocked(grid, n, nr - 1, nc) && cell_open(grid, n, nr - 1, nc + dc))
            {
                return Some(nidx);
            }
        }
        r = nr; c = nc;
    }
}

// Successor-pruning rules: given current node x reached from parent in
// direction d, return the directions to jump in. For 8-connected JPS:
// - Diagonal d: natural = d, plus the two component orthogonals (dr,0) and (0,dc).
//     Plus forced perpendiculars determined by walls "behind" x.
// - Orthogonal d: natural = d, plus forced perpendiculars determined by walls
//     beside x's parent that aren't beside x.
// Start node: all 8 directions.
fn pruned_dirs(grid: &[u8], n: usize, r: i32, c: i32, parent: i32) -> Vec<(i32, i32)> {
    let mut dirs: Vec<(i32, i32)> = Vec::with_capacity(8);
    if parent < 0 {
        for d in NEIGHBORS { dirs.push(d); }
        return dirs;
    }
    let pr = (parent as usize / n) as i32;
    let pc = (parent as usize % n) as i32;
    let dr = (r - pr).signum();
    let dc = (c - pc).signum();
    if dr != 0 && dc != 0 {
        dirs.push((dr, dc));
        dirs.push((dr, 0));
        dirs.push((0, dc));
        // Forced neighbors at x given diagonal arrival
        if cell_blocked(grid, n, r, c - dc) && cell_open(grid, n, r + dr, c - dc) { dirs.push((dr, -dc)); }
        if cell_blocked(grid, n, r - dr, c) && cell_open(grid, n, r - dr, c + dc) { dirs.push((-dr, dc)); }
    } else if dr != 0 {
        dirs.push((dr, 0));
        if cell_blocked(grid, n, r, c + 1) && cell_open(grid, n, r + dr, c + 1) { dirs.push((dr, 1)); }
        if cell_blocked(grid, n, r, c - 1) && cell_open(grid, n, r + dr, c - 1) { dirs.push((dr, -1)); }
    } else {
        dirs.push((0, dc));
        if cell_blocked(grid, n, r + 1, c) && cell_open(grid, n, r + 1, c + dc) { dirs.push((1, dc)); }
        if cell_blocked(grid, n, r - 1, c) && cell_open(grid, n, r - 1, c + dc) { dirs.push((-1, dc)); }
    }
    dirs
}

#[wasm_bindgen]
pub fn jps(grid: &[u8], n: u32, start: u32, end: u32) -> SearchResult {
    let n = n as usize;
    let total = n * n;
    let start = start as usize;
    let end = end as usize;
    let er = (end / n) as i32;
    let ec = (end % n) as i32;

    let mut g_score: Vec<u32> = vec![u32::MAX; total];
    let mut prev: Vec<i32> = vec![-1; total];
    let mut visited_order: Vec<u32> = Vec::new();
    let mut closed: Vec<bool> = vec![false; total];

    let mut heap: BinaryHeap<ANode> = BinaryHeap::new();
    g_score[start] = 0;
    let h0 = chebyshev(start, n, er as usize, ec as usize);
    heap.push(ANode { f: h0, g: 0, idx: start as u32 });

    let mut found = false;

    while let Some(ANode { f: _, g: _, idx }) = heap.pop() {
        let i = idx as usize;
        if closed[i] { continue; }
        closed[i] = true;
        visited_order.push(idx);
        if i == end { found = true; break; }

        let r = (i / n) as i32;
        let c = (i % n) as i32;
        let dirs = pruned_dirs(grid, n, r, c, prev[i]);
        let g_here = g_score[i];
        for (dr, dc) in dirs {
            if let Some(jp) = jump(grid, n, r, c, dr, dc, end) {
                let jpr = (jp / n) as i32;
                let jpc = (jp % n) as i32;
                // Chebyshev (unit-cost 8-connected): max of axis distances.
                let dy = (jpr - r).abs();
                let dx = (jpc - c).abs();
                let step = if dy > dx { dy as u32 } else { dx as u32 };
                let ng = g_here + step;
                if ng < g_score[jp] {
                    g_score[jp] = ng;
                    prev[jp] = i as i32;
                    let h = chebyshev(jp, n, er as usize, ec as usize);
                    heap.push(ANode { f: ng + h, g: ng, idx: jp as u32 });
                }
            }
        }
    }

    // Interpolate straight-line cells between jump points for the visualized path.
    let path = if !found {
        Vec::new()
    } else {
        let mut tmp: Vec<u32> = Vec::new();
        let mut cur = end as i32;
        while cur != -1 {
            let p = prev[cur as usize];
            if p < 0 { tmp.push(cur as u32); break; }
            let cr = (cur as usize / n) as i32;
            let cc = (cur as usize % n) as i32;
            let pr = (p as usize / n) as i32;
            let pc = (p as usize % n) as i32;
            let dr = (pr - cr).signum();
            let dc = (pc - cc).signum();
            let mut rr = cr; let mut cc2 = cc;
            while rr != pr || cc2 != pc {
                tmp.push((rr as usize * n + cc2 as usize) as u32);
                rr += dr; cc2 += dc;
            }
            cur = p;
        }
        tmp.reverse();
        tmp
    };

    SearchResult {
        nodes_explored: visited_order.len() as u32,
        path_length: path.len() as u32,
        found,
        visited: visited_order,
        path,
    }
}

#[inline]
fn chebyshev(idx: usize, n: usize, er: usize, ec: usize) -> u32 {
    let r = idx / n;
    let c = idx % n;
    let dr = if r > er { r - er } else { er - r };
    let dc = if c > ec { c - ec } else { ec - c };
    if dr > dc { dr as u32 } else { dc as u32 }
}

#[wasm_bindgen]
pub fn astar(grid: &[u8], n: u32, start: u32, end: u32) -> SearchResult {
    let n = n as usize;
    let total = n * n;
    let start = start as usize;
    let end = end as usize;
    let er = end / n;
    let ec = end % n;

    let mut g_score: Vec<u32> = vec![u32::MAX; total];
    let mut prev: Vec<i32> = vec![-1; total];
    let mut visited_order: Vec<u32> = Vec::with_capacity(total / 2);
    let mut closed: Vec<bool> = vec![false; total];

    let mut heap: BinaryHeap<ANode> = BinaryHeap::new();
    g_score[start] = 0;
    heap.push(ANode { f: chebyshev(start, n, er, ec), g: 0, idx: start as u32 });

    let mut found = false;

    while let Some(ANode { f: _, g: _, idx }) = heap.pop() {
        let i = idx as usize;
        if closed[i] { continue; }
        closed[i] = true;
        visited_order.push(idx);

        if i == end { found = true; break; }

        let r = (i / n) as i32;
        let c = (i % n) as i32;
        let ng = g_score[i] + 1;
        for (dr, dc) in NEIGHBORS {
            let nr = r + dr;
            let nc = c + dc;
            if nr < 0 || nc < 0 || nr >= n as i32 || nc >= n as i32 { continue; }
            let ni = nr as usize * n + nc as usize;
            if grid[ni] == WALL { continue; }
            if ng < g_score[ni] {
                g_score[ni] = ng;
                prev[ni] = i as i32;
                let f = ng + chebyshev(ni, n, er, ec);
                heap.push(ANode { f, g: ng, idx: ni as u32 });
            }
        }
    }

    let path = reconstruct(&prev, end, found);
    SearchResult {
        nodes_explored: visited_order.len() as u32,
        path_length: path.len() as u32,
        found,
        visited: visited_order,
        path,
    }
}
