use std::collections::{BinaryHeap, VecDeque};
use std::cmp::Ordering;
use wasm_bindgen::prelude::*;

const WALL: u8 = 1;

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

        let r = i / n;
        let c = i % n;
        let nd = cost + 1;

        if r > 0 {
            let ni = i - n;
            if grid[ni] != WALL && nd < dist[ni] {
                dist[ni] = nd; prev[ni] = i as i32;
                heap.push(Node { cost: nd, idx: ni as u32 });
            }
        }
        if r + 1 < n {
            let ni = i + n;
            if grid[ni] != WALL && nd < dist[ni] {
                dist[ni] = nd; prev[ni] = i as i32;
                heap.push(Node { cost: nd, idx: ni as u32 });
            }
        }
        if c > 0 {
            let ni = i - 1;
            if grid[ni] != WALL && nd < dist[ni] {
                dist[ni] = nd; prev[ni] = i as i32;
                heap.push(Node { cost: nd, idx: ni as u32 });
            }
        }
        if c + 1 < n {
            let ni = i + 1;
            if grid[ni] != WALL && nd < dist[ni] {
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
    let r = i / n;
    let c = i % n;
    let nd = cost + 1;
    let candidates: [Option<usize>; 4] = [
        if r > 0 { Some(i - n) } else { None },
        if r + 1 < n { Some(i + n) } else { None },
        if c > 0 { Some(i - 1) } else { None },
        if c + 1 < n { Some(i + 1) } else { None },
    ];
    for ni_opt in candidates {
        if let Some(ni) = ni_opt {
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

        let r = i / n;
        let c = i % n;

        let mut try_n = |ni: usize, prev: &mut [i32], seen: &mut [bool], queue: &mut VecDeque<usize>| {
            if grid[ni] == WALL || seen[ni] { return; }
            seen[ni] = true;
            prev[ni] = i as i32;
            queue.push_back(ni);
        };

        if r > 0 { try_n(i - n, &mut prev, &mut seen, &mut queue); }
        if r + 1 < n { try_n(i + n, &mut prev, &mut seen, &mut queue); }
        if c > 0 { try_n(i - 1, &mut prev, &mut seen, &mut queue); }
        if c + 1 < n { try_n(i + 1, &mut prev, &mut seen, &mut queue); }
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

#[inline]
fn manhattan(idx: usize, n: usize, er: usize, ec: usize) -> u32 {
    let r = idx / n;
    let c = idx % n;
    let dr = if r > er { r - er } else { er - r };
    let dc = if c > ec { c - ec } else { ec - c };
    (dr + dc) as u32
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
    heap.push(ANode { f: manhattan(start, n, er, ec), g: 0, idx: start as u32 });

    let mut found = false;

    while let Some(ANode { f: _, g: _, idx }) = heap.pop() {
        let i = idx as usize;
        if closed[i] { continue; }
        closed[i] = true;
        visited_order.push(idx);

        if i == end { found = true; break; }

        let r = i / n;
        let c = i % n;
        let ng = g_score[i] + 1;

        let mut try_n = |ni: usize, prev: &mut [i32], g_score: &mut [u32], heap: &mut BinaryHeap<ANode>| {
            if grid[ni] == WALL { return; }
            if ng < g_score[ni] {
                g_score[ni] = ng;
                prev[ni] = i as i32;
                let f = ng + manhattan(ni, n, er, ec);
                heap.push(ANode { f, g: ng, idx: ni as u32 });
            }
        };

        if r > 0 { try_n(i - n, &mut prev, &mut g_score, &mut heap); }
        if r + 1 < n { try_n(i + n, &mut prev, &mut g_score, &mut heap); }
        if c > 0 { try_n(i - 1, &mut prev, &mut g_score, &mut heap); }
        if c + 1 < n { try_n(i + 1, &mut prev, &mut g_score, &mut heap); }
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
